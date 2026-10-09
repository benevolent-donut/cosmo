package integration

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/wundergraph/cosmo/demo/pkg/subgraphs"
	"github.com/wundergraph/cosmo/router-tests/testenv"
	"github.com/wundergraph/cosmo/router/core"
	"github.com/wundergraph/cosmo/router/pkg/config"
)

func TestContextualArguments(t *testing.T) {
	t.Parallel()

	t.Run("flagged users receive the queue value", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueue(id: "q1") { flaggedUsers { id profile { displayName includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueue":{"flaggedUsers":[
				{"id":"u1","profile":{"displayName":"u1","includeSuspended":true}},
				{"id":"u2","profile":{"displayName":"u2","includeSuspended":true}}
			]}}}`, res.Body)
			require.Equal(t, []contextSubgraphRequest{
				{
					subgraph:  "moderation",
					query:     `query($a: ID!){moderationQueue(id: $a){flaggedUsers {id __typename} __context_0: includeSuspended}}`,
					variables: `{"a":"q1"}`,
				},
				{
					subgraph:  "users",
					query:     `query($representations: [_Any!]!, $contextualArgument_0: Boolean){_entities(representations: $representations){... on User {__typename profile(includeSuspended: $contextualArgument_0){displayName includeSuspended}}}}`,
					variables: `{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				},
			}, s.requests())
		})
	})

	t.Run("post author receives null without a setter", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsNoPostSetterJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ post(id: "p1") { author { id profile { displayName includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"post":{"author":{"id":"u1","profile":{"displayName":"u1","includeSuspended":null}}}}}`, res.Body)
			require.Equal(t, []contextSubgraphRequest{
				{
					subgraph:  "public",
					query:     `query($a: ID!){post(id: $a){author {id __typename}}}`,
					variables: `{"a":"p1"}`,
				},
				{
					subgraph:  "users",
					query:     `query($representations: [_Any!]!, $a: Boolean){_entities(representations: $representations){... on User {__typename profile(includeSuspended: $a){displayName includeSuspended}}}}`,
					variables: `{"a":null,"representations":[{"__typename":"User","id":"u1"}]}`,
				},
			}, s.requests())
		})
	})

	t.Run("post author receives null from the post setter", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ post(id: "p1") { author { id profile { displayName includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"post":{"author":{"id":"u1","profile":{"displayName":"u1","includeSuspended":null}}}}}`, res.Body)
			require.Equal(t, []contextSubgraphRequest{
				{
					subgraph:  "public",
					query:     `query($a: ID!){post(id: $a){author {id __typename} __context_0: includeSuspended}}`,
					variables: `{"a":"p1"}`,
				},
				{
					subgraph:  "users",
					query:     `query($representations: [_Any!]!, $contextualArgument_0: Boolean){_entities(representations: $representations){... on User {__typename profile(includeSuspended: $contextualArgument_0){displayName includeSuspended}}}}`,
					variables: `{"contextualArgument_0":null,"representations":[{"__typename":"User","id":"u1"}]}`,
				},
			}, s.requests())
		})
	})

	t.Run("client schema hides the argument", func(t *testing.T) {
		t.Parallel()

		for name, template := range map[string]string{
			"with the post setter":    testenv.ConfigWithContextsJSONTemplate,
			"without the post setter": testenv.ConfigWithContextsNoPostSetterJSONTemplate,
		} {
			t.Run(name, func(t *testing.T) {
				t.Parallel()

				runWithContextSubgraphs(t, template, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
					res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
						Query: `{ user: __type(name: "User") { fields { name args { name } } } queue: __type(name: "ModerationQueue") { fields { name args { name } } } }`,
					})
					require.JSONEq(t, `{"data":{
						"user":{"fields":[
							{"name":"id","args":[]},
							{"name":"handle","args":[]},
							{"name":"friends","args":[]},
							{"name":"profile","args":[]},
							{"name":"badge","args":[]},
							{"name":"peers","args":[]},
							{"name":"teamView","args":[]},
							{"name":"queueView","args":[]},
							{"name":"scopeView","args":[]},
							{"name":"viewerView","args":[]},
							{"name":"digest","args":[{"name":"locale"}]},
							{"name":"signature","args":[]}
						]},
						"queue":{"fields":[
							{"name":"id","args":[]},
							{"name":"includeSuspended","args":[]},
							{"name":"flaggedUsers","args":[]},
							{"name":"flaggedUserPages","args":[]},
							{"name":"team","args":[]},
							{"name":"policyLevel","args":[]},
							{"name":"summary","args":[]}
						]}
					}}`, res.Body)
					require.Empty(t, s.requests())
				})
			})
		}
	})

	t.Run("queues with different values", func(t *testing.T) {
		t.Parallel()

		for _, mode := range contextFetchModes {
			t.Run(mode.name, func(t *testing.T) {
				t.Parallel()

				runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{
					ModifyEngineExecutionConfiguration: mode.apply,
				}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
					res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
						Query: `{ moderationQueues { id flaggedUsers { id profile { displayName includeSuspended } } } }`,
					})
					require.JSONEq(t, `{"data":{"moderationQueues":[
						{"id":"q1","flaggedUsers":[
							{"id":"u1","profile":{"displayName":"u1","includeSuspended":true}},
							{"id":"u2","profile":{"displayName":"u2","includeSuspended":true}}
						]},
						{"id":"q2","flaggedUsers":[
							{"id":"u2","profile":{"displayName":"u2","includeSuspended":false}},
							{"id":"u3","profile":{"displayName":"u3","includeSuspended":false}}
						]},
						{"id":"q3","flaggedUsers":[
							{"id":"u1","profile":{"displayName":"u1","includeSuspended":true}},
							{"id":"u4","profile":{"displayName":"u4","includeSuspended":true}}
						]}
					]}}`, res.Body)
					require.Len(t, s.requestsTo("moderation"), 1)
					require.ElementsMatch(t, []string{
						`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u4"}]}`,
						`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
					}, s.variablesTo("users"))
				})
			})
		}
	})

	t.Run("contextual fetches are not merged with other fetches of their wave", func(t *testing.T) {
		t.Parallel()

		for _, mode := range contextFetchModes {
			t.Run(mode.name, func(t *testing.T) {
				t.Parallel()

				runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{
					ModifyEngineExecutionConfiguration: mode.apply,
				}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
					res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
						Query: `{
							moderationQueues { id flaggedUsers { id profile { includeSuspended } } }
							post(id: "p1") { author { id friends { id } } }
							organization(id: "o1") { members { id friends { id } } }
						}`,
					})
					require.JSONEq(t, `{"data":{
						"moderationQueues":[
							{"id":"q1","flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u2","profile":{"includeSuspended":true}}]},
							{"id":"q2","flaggedUsers":[{"id":"u2","profile":{"includeSuspended":false}},{"id":"u3","profile":{"includeSuspended":false}}]},
							{"id":"q3","flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u4","profile":{"includeSuspended":true}}]}
						],
						"post":{"author":{"id":"u1","friends":[{"id":"u2"}]}},
						"organization":{"members":[{"id":"u6","friends":[]}]}
					}}`, res.Body)

					expected := []string{
						`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u4"}]}`,
						`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
					}
					if mode.multiFetch {
						expected = append(expected, `{"includeF1":true,"includeF2":true,"representations_f1":[{"__typename":"User","id":"u1"}],"representations_f2":[{"__typename":"User","id":"u6"}]}`)
					} else {
						expected = append(expected,
							`{"representations":[{"__typename":"User","id":"u1"}]}`,
							`{"representations":[{"__typename":"User","id":"u6"}]}`,
						)
					}
					require.ElementsMatch(t, expected, s.variablesTo("users"))
				})
			})
		}
	})

	t.Run("friends below different queue values", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id friends { id profile { includeSuspended } } } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUsers":[
					{"id":"u1","friends":[{"id":"u2","profile":{"includeSuspended":true}}]},
					{"id":"u2","friends":[{"id":"u3","profile":{"includeSuspended":true}}]}
				]},
				{"id":"q2","flaggedUsers":[
					{"id":"u2","friends":[{"id":"u3","profile":{"includeSuspended":false}}]},
					{"id":"u3","friends":[]}
				]},
				{"id":"q3","flaggedUsers":[
					{"id":"u1","friends":[{"id":"u2","profile":{"includeSuspended":true}}]},
					{"id":"u4","friends":[{"id":"u1","profile":{"includeSuspended":true}}]}
				]}
			]}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"},{"__typename":"User","id":"u4"}]}`,
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"},{"__typename":"User","id":"u1"}]}`,
				`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u3"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("response cache keeps values apart", func(t *testing.T) {
		t.Parallel()

		s := startContextSubgraphsWithUsers(t, testenv.ConfigWithContextsJSONTemplate, cacheControlMiddleware("max-age=60")(subgraphs.ContextUsersHandler()))
		testenv.Run(t, &testenv.Config{
			RouterConfigJSONTemplate: s.configJSON,
			RouterOptions:            responseCacheOptions(t, time.Minute),
		}, func(t *testing.T, xEnv *testenv.Environment) {
			const query = `query($id: ID!) { moderationQueue(id: $id) { flaggedUsers { id profile { includeSuspended } } } }`

			q1 := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Query: query, Variables: json.RawMessage(`{"id":"q1"}`)})
			require.JSONEq(t, `{"data":{"moderationQueue":{"flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u2","profile":{"includeSuspended":true}}]}}}`, q1.Body)
			require.Equal(t, "MISS", q1.Response.Header.Get(core.ExecutionPlanCacheHeader))
			require.Equal(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
			}, s.variablesTo("users"))

			s.reset()
			q2 := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Query: query, Variables: json.RawMessage(`{"id":"q2"}`)})
			require.JSONEq(t, `{"data":{"moderationQueue":{"flaggedUsers":[{"id":"u2","profile":{"includeSuspended":false}},{"id":"u3","profile":{"includeSuspended":false}}]}}}`, q2.Body)
			require.Equal(t, "HIT", q2.Response.Header.Get(core.ExecutionPlanCacheHeader))
			require.Equal(t, []string{
				`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
			}, s.variablesTo("users"))

			s.reset()
			repeated := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Query: query, Variables: json.RawMessage(`{"id":"q1"}`)})
			require.Equal(t, q1.Body, repeated.Body)
			require.Empty(t, s.requestsTo("users"))

			s.reset()
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u2","profile":{"includeSuspended":true}}]},
				{"id":"q2","flaggedUsers":[{"id":"u2","profile":{"includeSuspended":false}},{"id":"u3","profile":{"includeSuspended":false}}]},
				{"id":"q3","flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u4","profile":{"includeSuspended":true}}]}
			]}}`, res.Body)
			require.Equal(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u4"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("organization queues use the queue value", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ organization(id: "o1") { includeSuspended queues { id flaggedUsers { id profile { includeSuspended } } } } }`,
			})
			require.JSONEq(t, `{"data":{"organization":{"includeSuspended":false,"queues":[
				{"id":"q1","flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u2","profile":{"includeSuspended":true}}]},
				{"id":"q2","flaggedUsers":[{"id":"u2","profile":{"includeSuspended":false}},{"id":"u3","profile":{"includeSuspended":false}}]}
			]}}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("organization members use the organization value", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ organization(id: "o1") { members { id profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"organization":{"members":[{"id":"u6","profile":{"includeSuspended":false}}]}}}`, res.Body)
			require.Equal(t, []string{
				`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u6"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("scope view picks the matching type condition", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ scopes {
					__typename
					... on ModerationQueue { id flaggedUsers { id scopeView } }
					... on AppealQueue { id flaggedUsers { id scopeView } }
					... on Team { id members { id scopeView } }
				} }`,
			})
			require.JSONEq(t, `{"data":{"scopes":[
				{"__typename":"ModerationQueue","id":"q2","flaggedUsers":[{"id":"u2","scopeView":"u2|show=false"},{"id":"u3","scopeView":"u3|show=false"}]},
				{"__typename":"AppealQueue","id":"a1","flaggedUsers":[{"id":"u5","scopeView":"u5|show=true"}]},
				{"__typename":"Team","id":"t1","members":[{"id":"u7","scopeView":"u7|show=null"}]}
			]}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u5"}]}`,
				`{"contextualArgument_0":null,"representations":[{"__typename":"User","id":"u7"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("queue view through the interface", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ queues { __typename id flaggedUsers { id queueView profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"queues":[
				{"__typename":"ModerationQueue","id":"q1","flaggedUsers":[
					{"id":"u1","queueView":"u1|includeSuspended=true","profile":{"includeSuspended":true}},
					{"id":"u2","queueView":"u2|includeSuspended=true","profile":{"includeSuspended":true}}
				]},
				{"__typename":"AppealQueue","id":"a1","flaggedUsers":[
					{"id":"u5","queueView":"u5|includeSuspended=false","profile":{"includeSuspended":null}}
				]}
			]}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":true,"contextualArgument_1":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				`{"contextualArgument_0":false,"contextualArgument_1":null,"representations":[{"__typename":"User","id":"u5"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("scope view through the union", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{
					moderationQueue(id: "q1") { flaggedUsers { id scopeView } }
					organization(id: "o1") { queues { id team { members { id scopeView } } } }
				}`,
			})
			require.JSONEq(t, `{"data":{
				"moderationQueue":{"flaggedUsers":[{"id":"u1","scopeView":"u1|show=true"},{"id":"u2","scopeView":"u2|show=true"}]},
				"organization":{"queues":[{"id":"q1","team":{"members":[{"id":"u7","scopeView":"u7|show=null"}]}},{"id":"q2","team":null}]}
			}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				`{"contextualArgument_0":null,"representations":[{"__typename":"User","id":"u7"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("fragments and aliases on the path", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `query {
					allQueues: queues { ...QueueUsers }
				}
				fragment QueueUsers on Queue {
					... on ModerationQueue { users: flaggedUsers { id view: queueView profile { includeSuspended } } }
					... on AppealQueue { users: flaggedUsers { id view: queueView profile { includeSuspended } } }
				}`,
			})
			require.JSONEq(t, `{"data":{"allQueues":[
				{"users":[
					{"id":"u1","view":"u1|includeSuspended=true","profile":{"includeSuspended":true}},
					{"id":"u2","view":"u2|includeSuspended=true","profile":{"includeSuspended":true}}
				]},
				{"users":[
					{"id":"u5","view":"u5|includeSuspended=false","profile":{"includeSuspended":null}}
				]}
			]}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				`{"a":null,"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u5"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("badge reads the policy level owned by public", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id badge } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUsers":[{"id":"u1","badge":"u1|level=3"},{"id":"u2","badge":"u2|level=3"}]},
				{"id":"q2","flaggedUsers":[{"id":"u2","badge":"u2|level=1"},{"id":"u3","badge":"u3|level=1"}]},
				{"id":"q3","flaggedUsers":[{"id":"u1","badge":"u1|level=3"},{"id":"u4","badge":"u4|level=3"}]}
			]}}`, res.Body)
			require.Equal(t, []string{"moderation", "public", "users", "users"}, s.subgraphOrder())
			require.Equal(t, []contextSubgraphRequest{
				{
					subgraph:  "public",
					query:     `query($representations: [_Any!]!){_entities(representations: $representations){... on ModerationQueue {__typename __context_0: policyLevel}}}`,
					variables: `{"representations":[{"__typename":"ModerationQueue","id":"q1","includeSuspended":true},{"__typename":"ModerationQueue","id":"q2","includeSuspended":false},{"__typename":"ModerationQueue","id":"q3","includeSuspended":true}]}`,
				},
			}, s.requestsTo("public"))
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":3,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u4"}]}`,
				`{"contextualArgument_0":1,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("signature receives the required handle and the queue value", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id signature } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUsers":[{"id":"u1","signature":"u1|handle=h-u1|includeSuspended=true"},{"id":"u2","signature":"u2|handle=h-u2|includeSuspended=true"}]},
				{"id":"q2","flaggedUsers":[{"id":"u2","signature":"u2|handle=h-u2|includeSuspended=false"},{"id":"u3","signature":"u3|handle=h-u3|includeSuspended=false"}]},
				{"id":"q3","flaggedUsers":[{"id":"u1","signature":"u1|handle=h-u1|includeSuspended=true"},{"id":"u4","signature":"u4|handle=h-u4|includeSuspended=true"}]}
			]}}`, res.Body)
			require.Equal(t, []string{"moderation", "public", "users", "users"}, s.subgraphOrder())
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","handle":"h-u1","id":"u1"},{"__typename":"User","handle":"h-u2","id":"u2"},{"__typename":"User","handle":"h-u4","id":"u4"}]}`,
				`{"contextualArgument_0":false,"representations":[{"__typename":"User","handle":"h-u2","id":"u2"},{"__typename":"User","handle":"h-u3","id":"u3"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("viewer view reads the Query setter", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id viewerView } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUsers":[{"id":"u1","viewerView":"u1|includeSuspended=true"},{"id":"u2","viewerView":"u2|includeSuspended=true"}]},
				{"id":"q2","flaggedUsers":[{"id":"u2","viewerView":"u2|includeSuspended=true"},{"id":"u3","viewerView":"u3|includeSuspended=true"}]},
				{"id":"q3","flaggedUsers":[{"id":"u1","viewerView":"u1|includeSuspended=true"},{"id":"u4","viewerView":"u4|includeSuspended=true"}]}
			]}}`, res.Body)
			require.Equal(t, []contextSubgraphRequest{
				{
					subgraph:  "users",
					query:     `{__context_0: viewerIncludeSuspended}`,
					variables: `null`,
				},
				{
					subgraph:  "users",
					query:     `query($representations: [_Any!]!, $contextualArgument_0: Boolean){_entities(representations: $representations){... on User {__typename viewerView(includeSuspended: $contextualArgument_0)}}}`,
					variables: `{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"},{"__typename":"User","id":"u4"}]}`,
				},
			}, s.requestsTo("users"))
		})
	})

	t.Run("flagged users of a mutation payload receive the queue value", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `mutation { flagUser(queueId: "q2", userId: "u9") { id flaggedUsers { id profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"flagUser":{"id":"q2","flaggedUsers":[
				{"id":"u2","profile":{"includeSuspended":false}},
				{"id":"u3","profile":{"includeSuspended":false}},
				{"id":"u9","profile":{"includeSuspended":false}}
			]}}}`, res.Body)
			require.Equal(t, []contextSubgraphRequest{
				{
					subgraph:  "moderation",
					query:     `mutation($a: ID!, $b: ID!){flagUser(queueId: $a, userId: $b){id flaggedUsers {id __typename} __context_0: includeSuspended}}`,
					variables: `{"a":"q2","b":"u9"}`,
				},
				{
					subgraph:  "users",
					query:     `query($representations: [_Any!]!, $contextualArgument_0: Boolean){_entities(representations: $representations){... on User {__typename profile(includeSuspended: $contextualArgument_0){includeSuspended}}}}`,
					variables: `{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"},{"__typename":"User","id":"u9"}]}`,
				},
			}, s.requests())
		})
	})

	t.Run("defer", func(t *testing.T) {
		t.Parallel()

		deferConfig := func() *testenv.Config {
			return &testenv.Config{
				NoRetryClient: true,
				ModifyEngineExecutionConfiguration: func(cfg *config.EngineExecutionConfiguration) {
					cfg.EnableDefer = true
				},
			}
		}

		t.Run("deferred consumer receives the queue value", func(t *testing.T) {
			t.Parallel()

			runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, deferConfig(), func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
				payloads := contextDeferPayloads(t, xEnv, `{ moderationQueues { id flaggedUsers { id ... @defer { profile { includeSuspended } } } } }`)
				require.Len(t, payloads, 2)
				require.JSONEq(t, `{"data":{"moderationQueues":[
					{"id":"q1","flaggedUsers":[{"id":"u1"},{"id":"u2"}]},
					{"id":"q2","flaggedUsers":[{"id":"u2"},{"id":"u3"}]},
					{"id":"q3","flaggedUsers":[{"id":"u1"},{"id":"u4"}]}
				]},"pending":[{"id":"1","path":["moderationQueues"]}],"hasNext":true}`, payloads[0])
				require.JSONEq(t, `{"incremental":[
					{"data":{"profile":{"includeSuspended":true}},"id":"1","subPath":[0,"flaggedUsers",0]},
					{"data":{"profile":{"includeSuspended":true}},"id":"1","subPath":[0,"flaggedUsers",1]},
					{"data":{"profile":{"includeSuspended":false}},"id":"1","subPath":[1,"flaggedUsers",0]},
					{"data":{"profile":{"includeSuspended":false}},"id":"1","subPath":[1,"flaggedUsers",1]},
					{"data":{"profile":{"includeSuspended":true}},"id":"1","subPath":[2,"flaggedUsers",0]},
					{"data":{"profile":{"includeSuspended":true}},"id":"1","subPath":[2,"flaggedUsers",1]}
				],"completed":[{"id":"1"}],"hasNext":false}`, payloads[1])
				require.ElementsMatch(t, []string{
					`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u4"}]}`,
					`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
				}, s.variablesTo("users"))
			})
		})

		t.Run("defer between the setter and the consumer keeps the context selection in the setter fetch", func(t *testing.T) {
			t.Parallel()

			runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, deferConfig(), func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
				payloads := contextDeferPayloads(t, xEnv, `{ moderationQueue(id: "q1") { id ... @defer { flaggedUsers { id profile { includeSuspended } } } } }`)
				require.Len(t, payloads, 2)
				require.JSONEq(t, `{"data":{"moderationQueue":{"id":"q1"}},"pending":[{"id":"1","path":["moderationQueue"]}],"hasNext":true}`, payloads[0])
				require.JSONEq(t, `{"incremental":[{"data":{"flaggedUsers":[
					{"id":"u1","profile":{"includeSuspended":true}},
					{"id":"u2","profile":{"includeSuspended":true}}
				]},"id":"1"}],"completed":[{"id":"1"}],"hasNext":false}`, payloads[1])
				require.ElementsMatch(t, []contextSubgraphRequest{
					{
						subgraph:  "moderation",
						query:     `query($a: ID!){moderationQueue(id: $a){id __context_0: includeSuspended}}`,
						variables: `{"a":"q1"}`,
					},
					{
						subgraph:  "moderation",
						query:     `query($a: ID!){moderationQueue(id: $a){flaggedUsers {id __typename __internal_id: id}}}`,
						variables: `{"a":"q1"}`,
					},
				}, s.requestsTo("moderation"))
				require.Equal(t, []string{
					`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				}, s.variablesTo("users"))
			})
		})

		t.Run("defer above the setter level", func(t *testing.T) {
			t.Parallel()

			runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, deferConfig(), func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
				payloads := contextDeferPayloads(t, xEnv, `{ ... @defer { moderationQueue(id: "q1") { flaggedUsers { id profile { includeSuspended } } } } }`)
				require.Len(t, payloads, 2)
				require.JSONEq(t, `{"data":{},"pending":[{"id":"1","path":[]}],"hasNext":true}`, payloads[0])
				require.JSONEq(t, `{"incremental":[{"data":{"moderationQueue":{"flaggedUsers":[
					{"id":"u1","profile":{"includeSuspended":true}},
					{"id":"u2","profile":{"includeSuspended":true}}
				]}},"id":"1"}],"completed":[{"id":"1"}],"hasNext":false}`, payloads[1])
				require.Equal(t, []string{
					`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				}, s.variablesTo("users"))
			})
		})

		t.Run("client defer on the setter field does not delay the context selection", func(t *testing.T) {
			t.Parallel()

			runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, deferConfig(), func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
				payloads := contextDeferPayloads(t, xEnv, `{ moderationQueue(id: "q1") { id ... @defer { includeSuspended } flaggedUsers { id profile { includeSuspended } } } }`)
				require.Len(t, payloads, 2)
				require.JSONEq(t, `{"data":{"moderationQueue":{"id":"q1","flaggedUsers":[
					{"id":"u1","profile":{"includeSuspended":true}},
					{"id":"u2","profile":{"includeSuspended":true}}
				]}},"pending":[{"id":"1","path":["moderationQueue"]}],"hasNext":true}`, payloads[0])
				require.JSONEq(t, `{"incremental":[{"data":{"includeSuspended":true},"id":"1"}],"completed":[{"id":"1"}],"hasNext":false}`, payloads[1])
				require.ElementsMatch(t, []contextSubgraphRequest{
					{
						subgraph:  "moderation",
						query:     `query($a: ID!){moderationQueue(id: $a){id flaggedUsers {id __typename} __context_0: includeSuspended}}`,
						variables: `{"a":"q1"}`,
					},
					{
						subgraph:  "moderation",
						query:     `query($a: ID!){moderationQueue(id: $a){includeSuspended}}`,
						variables: `{"a":"q1"}`,
					},
				}, s.requestsTo("moderation"))
				require.Equal(t, []string{
					`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				}, s.variablesTo("users"))
			})
		})
	})

	t.Run("flagged user pages are lists of lists below the queue", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUserPages { id profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUserPages":[[{"id":"u1","profile":{"includeSuspended":true}}],[{"id":"u2","profile":{"includeSuspended":true}}]]},
				{"id":"q2","flaggedUserPages":[[{"id":"u2","profile":{"includeSuspended":false}},{"id":"u3","profile":{"includeSuspended":false}}]]},
				{"id":"q3","flaggedUserPages":[[{"id":"u1","profile":{"includeSuspended":true}}],[],[{"id":"u4","profile":{"includeSuspended":true}}]]}
			]}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u4"}]}`,
				`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("queue grid is a list of lists above the setter", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ queueGrid { id flaggedUsers { id profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"queueGrid":[
				[
					{"id":"q1","flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u2","profile":{"includeSuspended":true}}]},
					{"id":"q2","flaggedUsers":[{"id":"u2","profile":{"includeSuspended":false}},{"id":"u3","profile":{"includeSuspended":false}}]}
				],
				[
					{"id":"q3","flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u4","profile":{"includeSuspended":true}}]}
				]
			]}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u4"}]}`,
				`{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("team members below a null team are left out", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ organization(id: "o1") { queues { id team { id members { id profile { includeSuspended } } } } } }`,
			})
			require.JSONEq(t, `{"data":{"organization":{"queues":[
				{"id":"q1","team":{"id":"t1","members":[{"id":"u7","profile":{"includeSuspended":true}}]}},
				{"id":"q2","team":null}
			]}}}`, res.Body)
			require.Equal(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u7"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("summary reads the value of a strict ancestor", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ organization(id: "o1") { queues { id summary } } moderationQueue(id: "q1") { id summary } }`,
			})
			require.JSONEq(t, `{"data":{
				"organization":{"queues":[{"id":"q1","summary":"q1|includeSuspended=false"},{"id":"q2","summary":"q2|includeSuspended=false"}]},
				"moderationQueue":{"id":"q1","summary":"q1|includeSuspended=null"}
			}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":false,"representations":[{"__typename":"ModerationQueue","id":"q1"},{"__typename":"ModerationQueue","id":"q2"}]}`,
				`{"a":null,"representations":[{"__typename":"ModerationQueue","id":"q1"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("digest groups the users by both values", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id digest(locale: "en") } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUsers":[{"id":"u1","digest":"u1|locale=en|includeSuspended=true|level=3"},{"id":"u2","digest":"u2|locale=en|includeSuspended=true|level=3"}]},
				{"id":"q2","flaggedUsers":[{"id":"u2","digest":"u2|locale=en|includeSuspended=false|level=1"},{"id":"u3","digest":"u3|locale=en|includeSuspended=false|level=1"}]},
				{"id":"q3","flaggedUsers":[{"id":"u1","digest":"u1|locale=en|includeSuspended=true|level=3"},{"id":"u4","digest":"u4|locale=en|includeSuspended=true|level=3"}]}
			]}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"a":"en","contextualArgument_0":true,"contextualArgument_1":3,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"},{"__typename":"User","id":"u4"}]}`,
				`{"a":"en","contextualArgument_0":false,"contextualArgument_1":1,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("peers receive the ids of the flagged users of their queue", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id peers } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUsers":[{"id":"u1","peers":"u1|ids=[u1,u2]"},{"id":"u2","peers":"u2|ids=[u1,u2]"}]},
				{"id":"q2","flaggedUsers":[{"id":"u2","peers":"u2|ids=[u2,u3]"},{"id":"u3","peers":"u3|ids=[u2,u3]"}]},
				{"id":"q3","flaggedUsers":[{"id":"u1","peers":"u1|ids=[u1,u4]"},{"id":"u4","peers":"u4|ids=[u1,u4]"}]}
			]}}`, res.Body)
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":["u1","u2"],"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				`{"contextualArgument_0":["u2","u3"],"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`,
				`{"contextualArgument_0":["u1","u4"],"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u4"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("team view reads a nested object selection", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id teamView } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueues":[
				{"id":"q1","flaggedUsers":[{"id":"u1","teamView":"u1|teamId=t1"},{"id":"u2","teamView":"u2|teamId=t1"}]},
				{"id":"q2","flaggedUsers":[{"id":"u2","teamView":"u2|teamId=null"},{"id":"u3","teamView":"u3|teamId=null"}]},
				{"id":"q3","flaggedUsers":[{"id":"u1","teamView":"u1|teamId=null"},{"id":"u4","teamView":"u4|teamId=null"}]}
			]}}`, res.Body)
			require.Equal(t, []contextSubgraphRequest{
				{
					subgraph:  "moderation",
					query:     `{moderationQueues {id flaggedUsers {id __typename} __context_0: team {id}}}`,
					variables: `null`,
				},
			}, s.requestsTo("moderation"))
			require.ElementsMatch(t, []string{
				`{"contextualArgument_0":"t1","representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
				`{"contextualArgument_0":null,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"},{"__typename":"User","id":"u1"},{"__typename":"User","id":"u4"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("client alias equal to the setter field", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueue(id: "q1") { includeSuspended: id flaggedUsers { id profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueue":{"includeSuspended":"q1","flaggedUsers":[
				{"id":"u1","profile":{"includeSuspended":true}},
				{"id":"u2","profile":{"includeSuspended":true}}
			]}}}`, res.Body)
			require.Equal(t, []contextSubgraphRequest{
				{
					subgraph:  "moderation",
					query:     `query($a: ID!){moderationQueue(id: $a){includeSuspended: id flaggedUsers {id __typename} __context_0: includeSuspended}}`,
					variables: `{"a":"q1"}`,
				},
			}, s.requestsTo("moderation"))
			require.Equal(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("more distinct values than the group limit return an error and send nothing", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{
			ModifyEngineExecutionConfiguration: func(cfg *config.EngineExecutionConfiguration) {
				cfg.MaxContextualArgumentGroups = 1
			},
		}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueues { id flaggedUsers { id profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{
				"errors":[{"message":"Failed to fetch from Subgraph 'users' at Path 'moderationQueues.@.flaggedUsers', Reason: the entities need 2 requests for distinct contextual argument values, which exceeds the limit of 1."}],
				"data":{"moderationQueues":[
					{"id":"q1","flaggedUsers":[{"id":"u1","profile":null},{"id":"u2","profile":null}]},
					{"id":"q2","flaggedUsers":[{"id":"u2","profile":null},{"id":"u3","profile":null}]},
					{"id":"q3","flaggedUsers":[{"id":"u1","profile":null},{"id":"u4","profile":null}]}
				]}
			}`, res.Body)
			require.Empty(t, s.requestsTo("users"))

			s.reset()
			res = xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueue(id: "q1") { flaggedUsers { id profile { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"data":{"moderationQueue":{"flaggedUsers":[{"id":"u1","profile":{"includeSuspended":true}},{"id":"u2","profile":{"includeSuspended":true}}]}}}`, res.Body)
			require.Equal(t, []string{
				`{"contextualArgument_0":true,"representations":[{"__typename":"User","id":"u1"},{"__typename":"User","id":"u2"}]}`,
			}, s.variablesTo("users"))
		})
	})

	t.Run("inline literal is rejected", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query: `{ moderationQueue(id: "q1") { flaggedUsers { id profile(includeSuspended: false) { includeSuspended } } } }`,
			})
			require.JSONEq(t, `{"errors":[{"message":"Unknown argument \"includeSuspended\" on field \"User.profile\".","locations":[{"line":1,"column":57}]}]}`, res.Body)
			require.Empty(t, s.requests())
		})
	})

	t.Run("variable is rejected", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				Query:     `query($includeSuspended: Boolean) { moderationQueue(id: "q1") { flaggedUsers { id profile(includeSuspended: $includeSuspended) { includeSuspended } } } }`,
				Variables: json.RawMessage(`{"includeSuspended":false}`),
			})
			require.JSONEq(t, `{"errors":[{"message":"Unknown argument \"includeSuspended\" on field \"User.profile\".","locations":[{"line":1,"column":91}]}]}`, res.Body)
			require.Empty(t, s.requests())
		})
	})

	t.Run("persisted operation is rejected", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			header := make(http.Header)
			header.Add("graphql-client-name", "my-client")
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
				OperationName: []byte(`"FlaggedUserProfiles"`),
				Extensions:    []byte(`{"persistedQuery": {"version": 1, "sha256Hash": "3b48c73a4e89ba65fe66777f0d87922e070c8e832b2dd568e85165228ab2448d"}}`),
				Header:        header,
			})
			require.JSONEq(t, `{"errors":[{"message":"Unknown argument \"includeSuspended\" on field \"User.profile\".","locations":[{"line":1,"column":83}]}]}`, res.Body)
			require.Empty(t, s.requests())
		})
	})

	t.Run("automatic persisted query is rejected", func(t *testing.T) {
		t.Parallel()

		runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{
			RouterOptions: []core.Option{core.WithGraphApiToken("")},
			ApqConfig: config.AutomaticPersistedQueriesConfig{
				Enabled: true,
				Cache: config.AutomaticPersistedQueriesCacheConfig{
					Size: 1024 * 1024,
				},
			},
		}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
			const query = `{ moderationQueue(id: "q1") { flaggedUsers { id profile(includeSuspended: false) { includeSuspended } } } }`
			hash := sha256.Sum256([]byte(query))
			extensions := []byte(`{"persistedQuery": {"version": 1, "sha256Hash": "` + hex.EncodeToString(hash[:]) + `"}}`)

			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Query: query, Extensions: extensions})
			require.JSONEq(t, `{"errors":[{"message":"Unknown argument \"includeSuspended\" on field \"User.profile\".","locations":[{"line":1,"column":57}]}]}`, res.Body)

			res = xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Extensions: extensions})
			require.Contains(t, res.Body, `"message":"Unknown argument \"includeSuspended\" on field \"User.profile\"."`)
			require.NotContains(t, res.Body, `"data"`)
			require.Empty(t, s.requests())
		})
	})

	t.Run("client variable named like the internal variable is ignored", func(t *testing.T) {
		t.Parallel()

		for _, remap := range []bool{true, false} {
			name := "with variables remapping"
			expected := `{"contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`
			if !remap {
				name = "without variables remapping"
				expected = `{"_contextualArgument_0":false,"representations":[{"__typename":"User","id":"u2"},{"__typename":"User","id":"u3"}]}`
			}

			t.Run(name, func(t *testing.T) {
				t.Parallel()

				runWithContextSubgraphs(t, testenv.ConfigWithContextsJSONTemplate, &testenv.Config{
					ModifyEngineExecutionConfiguration: func(cfg *config.EngineExecutionConfiguration) {
						cfg.DisableVariablesRemapping = !remap
					},
				}, func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs) {
					res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{
						Query:     `query($contextualArgument_0: ID!) { moderationQueue(id: $contextualArgument_0) { flaggedUsers { id profile { includeSuspended } } } }`,
						Variables: json.RawMessage(`{"contextualArgument_0":"q2"}`),
					})
					require.JSONEq(t, `{"data":{"moderationQueue":{"flaggedUsers":[{"id":"u2","profile":{"includeSuspended":false}},{"id":"u3","profile":{"includeSuspended":false}}]}}}`, res.Body)
					require.Equal(t, []string{expected}, s.variablesTo("users"))
				})
			})
		}
	})
}

type contextFetchMode struct {
	name       string
	multiFetch bool
	schedule   bool
}

func (m contextFetchMode) apply(cfg *config.EngineExecutionConfiguration) {
	cfg.EnableMultiFetch = m.multiFetch
	cfg.EnableScheduleFetches = m.schedule
}

var contextFetchModes = []contextFetchMode{
	{name: "multi fetch off, scheduler off"},
	{name: "multi fetch on, scheduler off", multiFetch: true},
	{name: "multi fetch off, scheduler on", schedule: true},
	{name: "multi fetch on, scheduler on", multiFetch: true, schedule: true},
}

// contextSubgraphs serves the moderation, public and users demo subgraphs of the contexts configs
// and records the requests they receive.
type contextSubgraphs struct {
	configJSON string

	mu       sync.Mutex
	recorded []contextSubgraphRequest
}

// contextSubgraphRequest holds variables in a canonical form, so that their key order does not matter.
type contextSubgraphRequest struct {
	subgraph  string
	query     string
	variables string
}

func runWithContextSubgraphs(t *testing.T, template string, cfg *testenv.Config, f func(t *testing.T, xEnv *testenv.Environment, s *contextSubgraphs)) {
	t.Helper()

	s := startContextSubgraphs(t, template)
	cfg.RouterConfigJSONTemplate = s.configJSON
	testenv.Run(t, cfg, func(t *testing.T, xEnv *testenv.Environment) {
		f(t, xEnv, s)
	})
}

func startContextSubgraphs(t *testing.T, template string) *contextSubgraphs {
	t.Helper()
	return startContextSubgraphsWithUsers(t, template, subgraphs.ContextUsersHandler())
}

func startContextSubgraphsWithUsers(t *testing.T, template string, users http.Handler) *contextSubgraphs {
	t.Helper()

	s := &contextSubgraphs{}
	moderationServer := s.serve(t, "moderation", subgraphs.ContextModerationHandler())
	publicServer := s.serve(t, "public", subgraphs.ContextPublicHandler())
	usersServer := s.serve(t, "users", users)
	s.configJSON = strings.NewReplacer(
		subgraphs.ContextModerationDefaultDemoURL, testenv.GqlURL(moderationServer),
		subgraphs.ContextPublicDefaultDemoURL, testenv.GqlURL(publicServer),
		subgraphs.ContextUsersDefaultDemoURL, testenv.GqlURL(usersServer),
	).Replace(template)
	return s
}

func (s *contextSubgraphs) serve(t *testing.T, subgraph string, handler http.Handler) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var request core.GraphQLRequest
		if err := json.Unmarshal(body, &request); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		variables, err := canonicalContextVariables(request.Variables)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		s.recorded = append(s.recorded, contextSubgraphRequest{subgraph: subgraph, query: request.Query, variables: variables})
		s.mu.Unlock()
		r.Body = io.NopCloser(bytes.NewReader(body))
		handler.ServeHTTP(w, r)
	}))
	t.Cleanup(server.Close)
	return server
}

func canonicalContextVariables(variables json.RawMessage) (string, error) {
	if len(variables) == 0 {
		return "null", nil
	}
	var value any
	if err := json.Unmarshal(variables, &value); err != nil {
		return "", err
	}
	canonical, err := json.Marshal(value)
	return string(canonical), err
}

func (s *contextSubgraphs) requests() []contextSubgraphRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]contextSubgraphRequest(nil), s.recorded...)
}

func (s *contextSubgraphs) requestsTo(subgraph string) []contextSubgraphRequest {
	var requests []contextSubgraphRequest
	for _, request := range s.requests() {
		if request.subgraph == subgraph {
			requests = append(requests, request)
		}
	}
	return requests
}

func (s *contextSubgraphs) variablesTo(subgraph string) []string {
	var variables []string
	for _, request := range s.requestsTo(subgraph) {
		variables = append(variables, request.variables)
	}
	return variables
}

func (s *contextSubgraphs) subgraphOrder() []string {
	var order []string
	for _, request := range s.requests() {
		order = append(order, request.subgraph)
	}
	return order
}

func (s *contextSubgraphs) reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recorded = nil
}

// contextDeferPayloads returns the JSON payloads of a multipart response to a request with @defer, in order.
func contextDeferPayloads(t *testing.T, xEnv *testenv.Environment, query string) []string {
	t.Helper()

	body, err := json.Marshal(map[string]string{"query": query})
	require.NoError(t, err)
	res, err := xEnv.RouterClient.Do(xEnv.MakeGraphQLDeferRequest(http.MethodPost, bytes.NewReader(body)))
	require.NoError(t, err)
	defer func() { require.NoError(t, res.Body.Close()) }()
	require.Equal(t, http.StatusOK, res.StatusCode)
	require.True(t, strings.HasPrefix(res.Header.Get("Content-Type"), "multipart/mixed"))

	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	var payloads []string
	for part := range strings.SplitSeq(string(raw), "--graphql") {
		_, payload, found := strings.Cut(part, "\r\n\r\n")
		if payload = strings.TrimSpace(payload); found && payload != "" {
			payloads = append(payloads, payload)
		}
	}
	return payloads
}

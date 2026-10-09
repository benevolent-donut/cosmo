package subgraphs

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestContextModerationHandler(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(ContextModerationHandler())
	t.Cleanup(server.Close)

	tests := []graphQLTest{
		{
			name:  "moderation queue",
			query: `{ moderationQueue(id: "q1") { id includeSuspended flaggedUsers { id } flaggedUserPages { id } team { id members { id } } } }`,
			want: `{"data":{"moderationQueue":{
				"id":"q1","includeSuspended":true,"flaggedUsers":[{"id":"u1"},{"id":"u2"}],
				"flaggedUserPages":[[{"id":"u1"}],[{"id":"u2"}]],"team":{"id":"t1","members":[{"id":"u7"}]}
			}}}`,
		},
		{
			name:  "queue lists",
			query: `{ moderationQueues { id includeSuspended flaggedUsers { id } flaggedUserPages { id } team { id } } queueGrid { id } }`,
			want: `{"data":{
				"moderationQueues":[
					{"id":"q1","includeSuspended":true,"flaggedUsers":[{"id":"u1"},{"id":"u2"}],"flaggedUserPages":[[{"id":"u1"}],[{"id":"u2"}]],"team":{"id":"t1"}},
					{"id":"q2","includeSuspended":false,"flaggedUsers":[{"id":"u2"},{"id":"u3"}],"flaggedUserPages":[[{"id":"u2"},{"id":"u3"}]],"team":null},
					{"id":"q3","includeSuspended":true,"flaggedUsers":[{"id":"u1"},{"id":"u4"}],"flaggedUserPages":[[{"id":"u1"}],[],[{"id":"u4"}]],"team":null}
				],
				"queueGrid":[[{"id":"q1"},{"id":"q2"}],[{"id":"q3"}]]
			}}`,
		},
		{
			name: "interface and union lists",
			query: `{
				queues { __typename id includeSuspended flaggedUsers { id } ... on AppealQueue { showSuspended } }
				scopes { __typename ... on ModerationQueue { id includeSuspended } ... on AppealQueue { id showSuspended } ... on Team { id members { id } } }
			}`,
			want: `{"data":{
				"queues":[
					{"__typename":"ModerationQueue","id":"q1","includeSuspended":true,"flaggedUsers":[{"id":"u1"},{"id":"u2"}]},
					{"__typename":"AppealQueue","id":"a1","includeSuspended":false,"flaggedUsers":[{"id":"u5"}],"showSuspended":true}
				],
				"scopes":[
					{"__typename":"ModerationQueue","id":"q2","includeSuspended":false},
					{"__typename":"AppealQueue","id":"a1","showSuspended":true},
					{"__typename":"Team","id":"t1","members":[{"id":"u7"}]}
				]
			}}`,
		},
		{
			name:  "organization",
			query: `{ organization(id: "o1") { id includeSuspended queues { id includeSuspended team { id members { id } } } members { id } } }`,
			want: `{"data":{"organization":{
				"id":"o1","includeSuspended":false,
				"queues":[
					{"id":"q1","includeSuspended":true,"team":{"id":"t1","members":[{"id":"u7"}]}},
					{"id":"q2","includeSuspended":false,"team":null}
				],
				"members":[{"id":"u6"}]
			}}}`,
		},
		{
			name: "entities",
			query: `query($representations: [_Any!]!) { _entities(representations: $representations) {
				... on ModerationQueue { id includeSuspended flaggedUsers { id } }
				... on AppealQueue { id showSuspended }
				... on Team { id members { id } }
				... on Organization { id organizationIncludeSuspended: includeSuspended }
			} }`,
			variables: map[string]any{"representations": []map[string]any{
				{"__typename": "ModerationQueue", "id": "q2"},
				{"__typename": "AppealQueue", "id": "a1"},
				{"__typename": "Team", "id": "t1"},
				{"__typename": "Organization", "id": "o1"},
			}},
			want: `{"data":{"_entities":[
				{"id":"q2","includeSuspended":false,"flaggedUsers":[{"id":"u2"},{"id":"u3"}]},
				{"id":"a1","showSuspended":true},
				{"id":"t1","members":[{"id":"u7"}]},
				{"id":"o1","organizationIncludeSuspended":false}
			]}}`,
		},
	}
	runGraphQLTests(t, server, tests)

	t.Run("flagUser changes only the data of its handler", func(t *testing.T) {
		t.Parallel()

		mutated := httptest.NewServer(ContextModerationHandler())
		t.Cleanup(mutated.Close)

		got := execute(t, mutated, `mutation { flagUser(queueId: "q2", userId: "u9") { id flaggedUsers { id } } }`, nil)
		assertJSON(t, `{"data":{"flagUser":{"id":"q2","flaggedUsers":[{"id":"u2"},{"id":"u3"},{"id":"u9"}]}}}`, got)

		query := `{ moderationQueue(id: "q2") { flaggedUsers { id } } }`
		assertJSON(t, `{"data":{"moderationQueue":{"flaggedUsers":[{"id":"u2"},{"id":"u3"},{"id":"u9"}]}}}`, execute(t, mutated, query, nil))
		assertJSON(t, `{"data":{"moderationQueue":{"flaggedUsers":[{"id":"u2"},{"id":"u3"}]}}}`, execute(t, server, query, nil))
	})

	t.Run("queueUpdated sends three events and completes", func(t *testing.T) {
		t.Parallel()

		body, err := json.Marshal(map[string]any{"query": `subscription { queueUpdated(id: "q1") { id includeSuspended flaggedUsers { id } } }`})
		if err != nil {
			t.Fatal(err)
		}
		req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, server.URL+"/graphql", bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")

		var want strings.Builder
		want.WriteString(":\n\n")
		for _, includeSuspended := range []bool{true, false, true} {
			fmt.Fprintf(&want, "event: next\ndata: %s\n\n", fmt.Sprintf(`{"data":{"queueUpdated":{"id":"q1","includeSuspended":%t,"flaggedUsers":[{"id":"u1"}]}}}`, includeSuspended))
		}
		want.WriteString("event: complete\n\n")
		if got := send(t, req); got != want.String() {
			t.Errorf("unexpected event stream\nwant: %q\ngot:  %q", want.String(), got)
		}
	})
}

func TestContextPublicHandler(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(ContextPublicHandler())
	t.Cleanup(server.Close)

	runGraphQLTests(t, server, []graphQLTest{
		{
			name:  "post",
			query: `{ post(id: "p1") { id includeSuspended author { id } } }`,
			want:  `{"data":{"post":{"id":"p1","includeSuspended":null,"author":{"id":"u1"}}}}`,
		},
		{
			name: "entities",
			query: `query($representations: [_Any!]!) { _entities(representations: $representations) {
				... on ModerationQueue { id policyLevel }
				... on User { id handle }
				... on Post { id includeSuspended author { id } }
			} }`,
			variables: map[string]any{"representations": []map[string]any{
				{"__typename": "ModerationQueue", "id": "q1", "includeSuspended": true},
				{"__typename": "ModerationQueue", "id": "q2", "includeSuspended": false},
				{"__typename": "User", "id": "u1"},
				{"__typename": "Post", "id": "p1"},
			}},
			want: `{"data":{"_entities":[
				{"id":"q1","policyLevel":3},
				{"id":"q2","policyLevel":1},
				{"id":"u1","handle":"h-u1"},
				{"id":"p1","includeSuspended":null,"author":{"id":"u1"}}
			]}}`,
		},
	})
}

func TestContextUsersHandler(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(ContextUsersHandler())
	t.Cleanup(server.Close)

	contextualQuery := `query($representations: [_Any!]!, $includeSuspended: Boolean, $level: Int, $ids: [ID], $teamId: ID, $show: Boolean) {
		_entities(representations: $representations) {
			... on User {
				id
				profile(includeSuspended: $includeSuspended) { displayName includeSuspended }
				badge(level: $level)
				peers(ids: $ids)
				teamView(teamId: $teamId)
				queueView(includeSuspended: $includeSuspended)
				scopeView(show: $show)
				viewerView(includeSuspended: $includeSuspended)
				digest(locale: "en", includeSuspended: $includeSuspended, level: $level)
				signature(includeSuspended: $includeSuspended)
			}
			... on ModerationQueue { id summary(includeSuspended: $includeSuspended) }
		}
	}`

	runGraphQLTests(t, server, []graphQLTest{
		{
			name:  "viewer",
			query: `{ viewerIncludeSuspended }`,
			want:  `{"data":{"viewerIncludeSuspended":true}}`,
		},
		{
			name:  "entities with contextual arguments",
			query: contextualQuery,
			variables: map[string]any{
				"representations": []map[string]any{
					{"__typename": "User", "id": "u1", "handle": "h-u1"},
					{"__typename": "ModerationQueue", "id": "q1"},
				},
				"includeSuspended": true,
				"level":            3,
				"ids":              []any{"u1", "u2"},
				"teamId":           "t1",
				"show":             false,
			},
			want: `{"data":{"_entities":[
				{
					"id":"u1",
					"profile":{"displayName":"u1","includeSuspended":true},
					"badge":"u1|level=3",
					"peers":"u1|ids=[u1,u2]",
					"teamView":"u1|teamId=t1",
					"queueView":"u1|includeSuspended=true",
					"scopeView":"u1|show=false",
					"viewerView":"u1|includeSuspended=true",
					"digest":"u1|locale=en|includeSuspended=true|level=3",
					"signature":"u1|handle=h-u1|includeSuspended=true"
				},
				{"id":"q1","summary":"q1|includeSuspended=true"}
			]}}`,
		},
		{
			name:  "entities with null contextual arguments",
			query: contextualQuery,
			variables: map[string]any{
				"representations": []map[string]any{
					{"__typename": "User", "id": "u2"},
					{"__typename": "ModerationQueue", "id": "q2"},
				},
				"includeSuspended": nil,
				"level":            nil,
				"ids":              nil,
				"teamId":           nil,
				"show":             nil,
			},
			want: `{"data":{"_entities":[
				{
					"id":"u2",
					"profile":{"displayName":"u2","includeSuspended":null},
					"badge":"u2|level=null",
					"peers":"u2|ids=null",
					"teamView":"u2|teamId=null",
					"queueView":"u2|includeSuspended=null",
					"scopeView":"u2|show=null",
					"viewerView":"u2|includeSuspended=null",
					"digest":"u2|locale=en|includeSuspended=null|level=null",
					"signature":"u2|handle=null|includeSuspended=null"
				},
				{"id":"q2","summary":"q2|includeSuspended=null"}
			]}}`,
		},
		{
			name:  "list argument with a null element",
			query: `query($representations: [_Any!]!, $ids: [ID]) { _entities(representations: $representations) { ... on User { peers(ids: $ids) } } }`,
			variables: map[string]any{
				"representations": []map[string]any{{"__typename": "User", "id": "u3"}},
				"ids":             []any{"u2", nil},
			},
			want: `{"data":{"_entities":[{"peers":"u3|ids=[u2,null]"}]}}`,
		},
		{
			name:  "friends",
			query: `query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { id friends { id friends { id } } } } }`,
			variables: map[string]any{"representations": []map[string]any{
				{"__typename": "User", "id": "u1"},
				{"__typename": "User", "id": "u2"},
				{"__typename": "User", "id": "u3"},
				{"__typename": "User", "id": "u4"},
			}},
			want: `{"data":{"_entities":[
				{"id":"u1","friends":[{"id":"u2","friends":[{"id":"u3"}]}]},
				{"id":"u2","friends":[{"id":"u3","friends":[]}]},
				{"id":"u3","friends":[]},
				{"id":"u4","friends":[{"id":"u1","friends":[{"id":"u2"}]}]}
			]}}`,
		},
	})
}

type graphQLTest struct {
	name      string
	query     string
	variables map[string]any
	want      string
}

func runGraphQLTests(t *testing.T, server *httptest.Server, tests []graphQLTest) {
	t.Helper()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assertJSON(t, tt.want, execute(t, server, tt.query, tt.variables))
		})
	}
}

func execute(t *testing.T, server *httptest.Server, query string, variables map[string]any) string {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, server.URL+"/graphql", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	return send(t, req)
}

func send(t *testing.T, req *http.Request) string {
	t.Helper()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status code %d: %s", resp.StatusCode, body)
	}
	return string(body)
}

func assertJSON(t *testing.T, want, got string) {
	t.Helper()
	var compacted bytes.Buffer
	if err := json.Compact(&compacted, []byte(want)); err != nil {
		t.Fatal(err)
	}
	if compacted.String() != got {
		t.Errorf("unexpected response\nwant: %s\ngot:  %s", compacted.String(), got)
	}
}

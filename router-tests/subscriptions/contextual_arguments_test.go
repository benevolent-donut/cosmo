package integration

import (
	"bytes"
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
)

func TestContextualArguments(t *testing.T) {
	t.Parallel()

	t.Run("each subscription event sends the value of its own payload", func(t *testing.T) {
		t.Parallel()

		var (
			mu       sync.Mutex
			requests []core.GraphQLRequest
		)
		usersHandler := subgraphs.ContextUsersHandler()
		users := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
			mu.Lock()
			requests = append(requests, request)
			mu.Unlock()
			r.Body = io.NopCloser(bytes.NewReader(body))
			usersHandler.ServeHTTP(w, r)
		}))
		t.Cleanup(users.Close)
		moderation := httptest.NewServer(subgraphs.ContextModerationHandler())
		t.Cleanup(moderation.Close)
		public := httptest.NewServer(subgraphs.ContextPublicHandler())
		t.Cleanup(public.Close)

		configJSON := strings.NewReplacer(
			subgraphs.ContextModerationDefaultDemoURL, testenv.GqlURL(moderation),
			subgraphs.ContextPublicDefaultDemoURL, testenv.GqlURL(public),
			subgraphs.ContextUsersDefaultDemoURL, testenv.GqlURL(users),
		).Replace(testenv.ConfigWithContextsJSONTemplate)

		testenv.Run(t, &testenv.Config{
			RouterConfigJSONTemplate: configJSON,
		}, func(t *testing.T, xEnv *testenv.Environment) {
			conn := xEnv.InitGraphQLWebSocketConnection(nil, nil, nil)
			err := testenv.WSWriteJSON(t, conn, testenv.WebSocketMessage{
				ID:      "1",
				Type:    "subscribe",
				Payload: []byte(`{"query":"subscription { queueUpdated(id: \"q1\") { id includeSuspended flaggedUsers { id profile { includeSuspended } } } }"}`),
			})
			require.NoError(t, err)

			values := []string{"true", "false", "true"}
			for _, value := range values {
				var message testenv.WebSocketMessage
				require.NoError(t, testenv.WSReadJSON(t, conn, &message))
				require.Equal(t, "next", message.Type)
				require.Equal(t, "1", message.ID)
				require.JSONEq(t, `{"data":{"queueUpdated":{"id":"q1","includeSuspended":`+value+`,"flaggedUsers":[{"id":"u1","profile":{"includeSuspended":`+value+`}}]}}}`, string(message.Payload))
			}

			var complete testenv.WebSocketMessage
			require.NoError(t, testenv.WSReadJSON(t, conn, &complete))
			require.Equal(t, "complete", complete.Type)
			require.Equal(t, "1", complete.ID)
			xEnv.WaitForSubscriptionCount(0, 5*time.Second)

			mu.Lock()
			defer mu.Unlock()
			require.Len(t, requests, len(values))
			for i, value := range values {
				require.Equal(t, `query($representations: [_Any!]!, $contextualArgument_0: Boolean){_entities(representations: $representations){... on User {__typename profile(includeSuspended: $contextualArgument_0){includeSuspended}}}}`, requests[i].Query)
				require.JSONEq(t, `{"contextualArgument_0":`+value+`,"representations":[{"__typename":"User","id":"u1"}]}`, string(requests[i].Variables))
			}
		})
	})
}

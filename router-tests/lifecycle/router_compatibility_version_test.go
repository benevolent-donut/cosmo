package integration

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/wundergraph/cosmo/router-tests/testenv"
	"github.com/wundergraph/cosmo/router/core"
	nodev1 "github.com/wundergraph/cosmo/router/gen/proto/wg/cosmo/node/v1"
	"github.com/wundergraph/cosmo/router/pkg/controlplane/configpoller"
	"github.com/wundergraph/cosmo/router/pkg/execution_config"
	"github.com/wundergraph/cosmo/router/pkg/routerconfig/cdn"
	"go.uber.org/zap/zapcore"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func TestRouterCompatibilityVersion(t *testing.T) {
	t.Parallel()

	const (
		employeesQuery = `{ employees { id } }`
		employeesData  = `{"data":{"employees":[{"id":1},{"id":2},{"id":3},{"id":4},{"id":5},{"id":7},{"id":8},{"id":10},{"id":11},{"id":12}]}}`
	)

	t.Run("starts with a version 2 execution config", func(t *testing.T) {
		t.Parallel()

		testenv.Run(t, &testenv.Config{
			ModifyRouterConfig: func(routerConfig *nodev1.RouterConfig) {
				routerConfig.CompatibilityVersion = "2:0.0.0"
			},
		}, func(t *testing.T, xEnv *testenv.Environment) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Query: employeesQuery})
			require.JSONEq(t, employeesData, res.Body)
		})
	})

	t.Run("fails on startup with a version 3 execution config", func(t *testing.T) {
		t.Parallel()

		testenv.FailsOnStartup(t, &testenv.Config{
			ModifyRouterConfig: func(routerConfig *nodev1.RouterConfig) {
				routerConfig.CompatibilityVersion = "3:0.0.0"
			},
		}, func(t *testing.T, err error) {
			require.ErrorContains(t, err, `the compatibility version "3:0.0.0" is not compatible with this router version`)
		})
	})

	t.Run("starts with a version 2 execution config polled from the version 1 CDN path", func(t *testing.T) {
		t.Parallel()

		token, err := testenv.GenerateVersionedJwtToken()
		require.NoError(t, err)

		const routerConfigPath = "/organization/versioned-graph/routerconfigs/latest.json"
		var (
			mu             sync.Mutex
			requestedPaths []string
		)

		testenv.Run(t, &testenv.Config{
			ModifyRouterConfig: func(routerConfig *nodev1.RouterConfig) {
				routerConfig.CompatibilityVersion = "2:0.0.0"
			},
			RouterConfig: &testenv.RouterConfig{
				ConfigPollerFactory: func(routerConfig *nodev1.RouterConfig) configpoller.ConfigPoller {
					body, err := protojson.Marshal(routerConfig)
					require.NoError(t, err)

					cdnServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						mu.Lock()
						requestedPaths = append(requestedPaths, r.URL.Path)
						mu.Unlock()

						if r.URL.Path != routerConfigPath {
							http.NotFound(w, r)
							return
						}
						w.Header().Set("Content-Type", "application/json")
						_, _ = w.Write(body)
					}))
					t.Cleanup(cdnServer.Close)

					client, err := cdn.NewClient(cdnServer.URL, token, &cdn.Options{
						RouterCompatibilityVersion: execution_config.RouterCompatibilityVersionThreshold,
					})
					require.NoError(t, err)

					return configpoller.New(token,
						configpoller.WithClient(client),
						configpoller.WithPolling(time.Second, 0),
					)
				},
			},
		}, func(t *testing.T, xEnv *testenv.Environment) {
			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Query: employeesQuery})
			require.JSONEq(t, employeesData, res.Body)

			mu.Lock()
			defer mu.Unlock()
			require.NotEmpty(t, requestedPaths)
			for _, path := range requestedPaths {
				require.Equal(t, routerConfigPath, path)
			}
		})
	})

	t.Run("keeps serving the previous execution config when a hot reload delivers version 3", func(t *testing.T) {
		t.Parallel()

		var poller *fakeConfigPoller

		testenv.Run(t, &testenv.Config{
			LogObservation: testenv.LogObservationConfig{
				Enabled:  true,
				LogLevel: zapcore.InfoLevel,
			},
			ModifyRouterConfig: func(routerConfig *nodev1.RouterConfig) {
				routerConfig.CompatibilityVersion = "1:0.0.0"
			},
			RouterConfig: &testenv.RouterConfig{
				ConfigPollerFactory: func(routerConfig *nodev1.RouterConfig) configpoller.ConfigPoller {
					poller = newFakeConfigPoller(routerConfig)
					return poller
				},
			},
			RouterOptions: []core.Option{
				core.WithConfigVersionHeader(true),
			},
		}, func(t *testing.T, xEnv *testenv.Environment) {
			initialVersion := xEnv.RouterConfigVersionMain()

			res := xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Query: employeesQuery})
			require.Equal(t, initialVersion, res.Response.Header.Get("X-Router-Config-Version"))
			require.JSONEq(t, employeesData, res.Body)

			incompatible := proto.CloneOf(poller.initial.Config)
			incompatible.Version = "incompatible"
			incompatible.CompatibilityVersion = "3:0.0.0"
			require.EqualError(t, poller.Emit(t, incompatible, nil), `the compatibility version "3:0.0.0" is not compatible with this router version`)

			res = xEnv.MakeGraphQLRequestOK(testenv.GraphQLRequest{Query: employeesQuery})
			require.Equal(t, initialVersion, res.Response.Header.Get("X-Router-Config-Version"))
			require.JSONEq(t, employeesData, res.Body)

			require.Len(t, xEnv.Observer().FilterMessage("This router version supports a router execution config version up to 2. The router execution config version supplied is 3. Please upgrade your router version.").All(), 1)
			require.Len(t, xEnv.Observer().FilterMessage("Failed to create graph server. Keeping the old server").All(), 1)
		})
	})
}

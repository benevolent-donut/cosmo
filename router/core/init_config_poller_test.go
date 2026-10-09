package core

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"github.com/wundergraph/cosmo/router/pkg/config"
	"go.uber.org/zap"
)

func TestGetConfigClient(t *testing.T) {
	t.Parallel()

	registry, err := NewProviderRegistry(config.StorageProviders{
		S3: []config.S3StorageProvider{{ID: "s3", Endpoint: "localhost:10000", Bucket: "cosmo"}},
	})
	require.NoError(t, err)

	graphApiToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"organization_id":    "organization",
		"federated_graph_id": "graph",
	}).SignedString([]byte("secret"))
	require.NoError(t, err)

	t.Run("fails for S3 primary storage without object_path", func(t *testing.T) {
		t.Parallel()

		r := &Router{}
		r.logger = zap.NewNop()
		r.routerConfigPollerConfig = &RouterConfigPollerConfig{}
		r.routerConfigPollerConfig.Storage.ProviderID = "s3"

		_, err := getConfigClient(r, registry, "s3", false)
		require.EqualError(t, err, "object_path is required for S3 storage provider 's3' for execution config")
	})

	t.Run("fails for S3 fallback storage without object_path", func(t *testing.T) {
		t.Parallel()

		r := &Router{}
		r.logger = zap.NewNop()
		r.routerConfigPollerConfig = &RouterConfigPollerConfig{}
		r.routerConfigPollerConfig.Storage.ObjectPath = "primary.json"
		r.routerConfigPollerConfig.FallbackStorage.ProviderID = "s3"

		_, err := getConfigClient(r, registry, "s3", true)
		require.EqualError(t, err, "object_path is required for S3 storage provider 's3' for execution config")
	})

	t.Run("succeeds for S3 storage with object_path", func(t *testing.T) {
		t.Parallel()

		r := &Router{}
		r.logger = zap.NewNop()
		r.routerConfigPollerConfig = &RouterConfigPollerConfig{}
		r.routerConfigPollerConfig.Storage.ObjectPath = "latest.json"

		c, err := getConfigClient(r, registry, "s3", false)
		require.NoError(t, err)
		require.NotNil(t, c)
	})

	t.Run("requests the version 1 router config path from the Cosmo CDN", func(t *testing.T) {
		t.Parallel()

		cdnURL, requestedPaths := newRouterConfigCDNServer(t)

		r := &Router{}
		r.logger = zap.NewNop()
		r.graphApiToken = graphApiToken
		r.cdnConfig.URL = cdnURL
		r.routerConfigPollerConfig = &RouterConfigPollerConfig{}

		c, err := getConfigClient(r, registry, "", false)
		require.NoError(t, err)

		_, err = (*c).RouterConfig(t.Context(), "", time.Time{})
		require.NoError(t, err)
		require.Equal(t, []string{"/organization/graph/routerconfigs/latest.json"}, requestedPaths())
	})

	t.Run("requests the version 1 router config path from a CDN storage provider", func(t *testing.T) {
		t.Parallel()

		cdnURL, requestedPaths := newRouterConfigCDNServer(t)
		cdnRegistry, err := NewProviderRegistry(config.StorageProviders{
			CDN: []config.CDNStorageProvider{{ID: "cdn", URL: cdnURL}},
		})
		require.NoError(t, err)

		r := &Router{}
		r.logger = zap.NewNop()
		r.graphApiToken = graphApiToken
		r.routerConfigPollerConfig = &RouterConfigPollerConfig{}

		c, err := getConfigClient(r, cdnRegistry, "cdn", false)
		require.NoError(t, err)

		_, err = (*c).RouterConfig(t.Context(), "", time.Time{})
		require.NoError(t, err)
		require.Equal(t, []string{"/organization/graph/routerconfigs/latest.json"}, requestedPaths())
	})
}

func newRouterConfigCDNServer(t *testing.T) (string, func() []string) {
	t.Helper()

	var (
		mu    sync.Mutex
		paths []string
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		paths = append(paths, r.URL.Path)
		mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	return server.URL, func() []string {
		mu.Lock()
		defer mu.Unlock()
		return slices.Clone(paths)
	}
}

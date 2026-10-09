package core

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	nodev1 "github.com/wundergraph/cosmo/router/gen/proto/wg/cosmo/node/v1"
	"github.com/wundergraph/graphql-go-tools/v2/pkg/ast"
	"github.com/wundergraph/graphql-go-tools/v2/pkg/engine/plan"
	"go.uber.org/zap"
	"google.golang.org/protobuf/encoding/protojson"
)

func TestPlanOperationPanic(t *testing.T) {
	// Create a minimal plan configuration
	planConfig := &plan.Configuration{}

	// Create a planner with minimal configuration
	planner, err := NewPlanner(planConfig, &ast.Document{}, &ast.Document{})
	if err != nil {
		t.Fatalf("Failed to create planner: %v", err)
	}

	// Create an invalid operation document that will cause a panic
	invalidOperation := &ast.Document{
		RootNodes: []ast.Node{
			{
				Kind: ast.NodeKindOperationDefinition,
				Ref:  0,
			},
		},
	}

	assert.NotPanics(t, func() {
		_, _, err = planner.PlanPreparedOperation(invalidOperation)
		assert.Error(t, err)
	})
}

func TestValidateOperationPanic(t *testing.T) {
	// Create a minimal plan configuration
	planConfig := &plan.Configuration{}

	// Create a planner with minimal configuration
	planner, err := NewPlanner(planConfig, &ast.Document{}, &ast.Document{})
	if err != nil {
		t.Fatalf("Failed to create planner: %v", err)
	}

	// Create an invalid operation document that will cause a panic
	invalidOperation := &ast.Document{
		RootNodes: []ast.Node{
			{
				Kind: ast.NodeKindOperationDefinition,
				Ref:  0,
			},
		},
	}

	// Attempt to validate the operation - this should panic
	assert.NotPanics(t, func() {
		err = planner.validateOperation(invalidOperation)
		assert.Error(t, err)
	})
}

func TestPlanGeneratorRouterCompatibilityVersion(t *testing.T) {
	t.Parallel()

	routerConfig := func(compatibilityVersion string) *nodev1.RouterConfig {
		return &nodev1.RouterConfig{
			CompatibilityVersion: compatibilityVersion,
			EngineConfig: &nodev1.EngineConfiguration{
				GraphqlSchema: "type Query { hello: String }",
			},
		}
	}

	writeRouterConfig := func(t *testing.T, compatibilityVersion string) string {
		t.Helper()

		data, err := protojson.Marshal(routerConfig(compatibilityVersion))
		require.NoError(t, err)
		configFilePath := filepath.Join(t.TempDir(), "config.json")
		require.NoError(t, os.WriteFile(configFilePath, data, 0o600))
		return configFilePath
	}

	t.Run("NewPlanGeneratorFromConfig accepts router compatibility version 2", func(t *testing.T) {
		t.Parallel()

		pg, err := NewPlanGeneratorFromConfig(routerConfig("2:0.0.0"), zap.NewNop(), PlanGeneratorOptions{})
		require.NoError(t, err)
		require.NotNil(t, pg)
	})

	t.Run("NewPlanGeneratorFromConfig refuses router compatibility version 3", func(t *testing.T) {
		t.Parallel()

		pg, err := NewPlanGeneratorFromConfig(routerConfig("3:0.0.0"), zap.NewNop(), PlanGeneratorOptions{})
		require.EqualError(t, err, `the compatibility version "3:0.0.0" is not compatible with this router version`)
		require.Nil(t, pg)
	})

	t.Run("NewPlanGenerator accepts router compatibility version 2 without a logger", func(t *testing.T) {
		t.Parallel()

		pg, err := NewPlanGenerator(writeRouterConfig(t, "2:0.0.0"), nil, PlanGeneratorOptions{})
		require.NoError(t, err)
		require.NotNil(t, pg)
	})

	t.Run("NewPlanGenerator refuses router compatibility version 3 without a logger", func(t *testing.T) {
		t.Parallel()

		pg, err := NewPlanGenerator(writeRouterConfig(t, "3:0.0.0"), nil, PlanGeneratorOptions{})
		require.EqualError(t, err, `the compatibility version "3:0.0.0" is not compatible with this router version`)
		require.Nil(t, pg)
	})
}

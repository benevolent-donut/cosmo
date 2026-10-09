package core

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	nodev1 "github.com/wundergraph/cosmo/router/gen/proto/wg/cosmo/node/v1"
	"github.com/wundergraph/cosmo/router/pkg/execution_config"
	rmetric "github.com/wundergraph/cosmo/router/pkg/metric"

	"github.com/wundergraph/graphql-go-tools/v2/pkg/engine/plan"
)

const contextualArgumentsUsersSchema = `
type Query {
  moderationQueue(id: ID!): ModerationQueue
}

type ModerationQueue {
  id: ID!
  includeSuspended: Boolean!
  flaggedUsers: [User!]!
}

type User {
  id: ID!
  profile(locale: String, includeSuspended: Boolean): String
}
`

func contextualArgumentsEngineConfig() *nodev1.EngineConfiguration {
	return &nodev1.EngineConfiguration{
		StringStorage: map[string]string{
			"users": contextualArgumentsUsersSchema,
		},
		DatasourceConfigurations: []*nodev1.DataSourceConfiguration{
			{
				Kind: nodev1.DataSourceKind_GRAPHQL,
				Id:   "users",
				RootNodes: []*nodev1.TypeField{
					{TypeName: "Query", FieldNames: []string{"moderationQueue"}},
				},
				ChildNodes: []*nodev1.TypeField{
					{TypeName: "ModerationQueue", FieldNames: []string{"id", "includeSuspended", "flaggedUsers"}},
					{TypeName: "User", FieldNames: []string{"id", "profile"}},
				},
				CustomGraphql: &nodev1.DataSourceCustom_GraphQL{
					Fetch: &nodev1.FetchConfiguration{
						Url:    &nodev1.ConfigurationVariable{StaticVariableContent: "http://localhost:4014/graphql"},
						Method: nodev1.HTTPMethod_POST,
					},
					Subscription:   &nodev1.GraphQLSubscriptionConfiguration{},
					Federation:     &nodev1.GraphQLFederationConfiguration{},
					UpstreamSchema: &nodev1.InternedString{Key: "users"},
				},
				ContextualArgumentConfiguration: &nodev1.ContextualArgumentConfiguration{
					Arguments: []*nodev1.ContextualArgument{
						{
							TypeName:     "User",
							FieldName:    "profile",
							ArgumentName: "includeSuspended",
							ContextName:  "userScope",
							Setters: []*nodev1.ContextSetter{
								{TypeName: "ModerationQueue", SelectionSet: "includeSuspended"},
								{TypeName: "Post"},
							},
						},
					},
				},
			},
		},
		FieldConfigurations: []*nodev1.FieldConfiguration{
			{
				TypeName:  "User",
				FieldName: "profile",
				ArgumentsConfiguration: []*nodev1.ArgumentConfiguration{
					{Name: "locale", SourceType: nodev1.ArgumentSource_FIELD_ARGUMENT},
					{Name: "includeSuspended", SourceType: nodev1.ArgumentSource_FROM_CONTEXT},
				},
			},
		},
	}
}

func loadContextualArgumentsConfig(t *testing.T, engineConfig *nodev1.EngineConfiguration, pluginsEnabled bool) (*plan.Configuration, error) {
	t.Helper()

	loader := NewLoader(t.Context(), false, &DefaultFactoryResolver{engineCtx: t.Context()}, zap.NewNop(), subscriptionHooks{})
	planConfig, _, err := loader.Load(engineConfig, nil, &RouterEngineConfiguration{
		StreamMetricStore: rmetric.NewNoopStreamMetricStore(),
	}, pluginsEnabled)
	return planConfig, err
}

func TestLoaderContextualArguments(t *testing.T) {
	t.Parallel()

	t.Run("maps FROM_CONTEXT to the contextual argument source", func(t *testing.T) {
		t.Parallel()

		planConfig, err := loadContextualArgumentsConfig(t, contextualArgumentsEngineConfig(), false)
		require.NoError(t, err)

		fieldConfig := planConfig.Fields.ForTypeField("User", "profile")
		require.NotNil(t, fieldConfig)
		require.Equal(t, plan.ArgumentsConfigurations{
			{Name: "locale", SourceType: plan.FieldArgumentSource},
			{Name: "includeSuspended", SourceType: plan.ContextualArgumentSource},
		}, fieldConfig.Arguments)
	})

	t.Run("maps the contextual argument configuration of a data source without a cost configuration", func(t *testing.T) {
		t.Parallel()

		engineConfig := contextualArgumentsEngineConfig()
		require.Nil(t, engineConfig.DatasourceConfigurations[0].CostConfiguration)

		planConfig, err := loadContextualArgumentsConfig(t, engineConfig, false)
		require.NoError(t, err)
		require.Len(t, planConfig.DataSources, 1)

		expected := []plan.ContextualArgumentConfiguration{
			{
				TypeName:     "User",
				FieldName:    "profile",
				ArgumentName: "includeSuspended",
				ContextName:  "userScope",
				Setters: []plan.ContextSetterConfiguration{
					{TypeName: "ModerationQueue", SelectionSet: "includeSuspended"},
					{TypeName: "Post"},
				},
			},
		}
		dataSource := planConfig.DataSources[0]
		require.Equal(t, plan.ContextualArgumentConfigurations(expected), dataSource.FederationConfiguration().ContextualArguments)
		require.Equal(t, expected, dataSource.ContextualArgumentsForField("User", "profile"))
		require.Empty(t, dataSource.ContextualArgumentsForField("ModerationQueue", "flaggedUsers"))
	})

	t.Run("maps no contextual arguments for a data source without them", func(t *testing.T) {
		t.Parallel()

		engineConfig := contextualArgumentsEngineConfig()
		engineConfig.DatasourceConfigurations[0].ContextualArgumentConfiguration = nil

		planConfig, err := loadContextualArgumentsConfig(t, engineConfig, false)
		require.NoError(t, err)
		require.Len(t, planConfig.DataSources, 1)
		require.Empty(t, planConfig.DataSources[0].FederationConfiguration().ContextualArguments)
		require.Empty(t, planConfig.DataSources[0].ContextualArgumentsForField("User", "profile"))
	})

	t.Run("refuses a gRPC data source with contextual arguments", func(t *testing.T) {
		t.Parallel()

		engineConfig := contextualArgumentsEngineConfig()
		engineConfig.DatasourceConfigurations[0].CustomGraphql.Grpc = &nodev1.GRPCConfiguration{
			Mapping: &nodev1.GRPCMapping{Service: "UsersService"},
		}

		_, err := loadContextualArgumentsConfig(t, engineConfig, false)
		require.EqualError(t, err, "data source users is a gRPC or plugin data source and defines contextual arguments, which are supported only for GraphQL data sources")
	})

	t.Run("refuses a gRPC data source with contextual arguments and without a mapping", func(t *testing.T) {
		t.Parallel()

		engineConfig := contextualArgumentsEngineConfig()
		engineConfig.DatasourceConfigurations[0].CustomGraphql.Grpc = &nodev1.GRPCConfiguration{}

		_, err := loadContextualArgumentsConfig(t, engineConfig, false)
		require.EqualError(t, err, "data source users is a gRPC or plugin data source and defines contextual arguments, which are supported only for GraphQL data sources")
	})

	t.Run("refuses a plugin data source with contextual arguments", func(t *testing.T) {
		t.Parallel()

		engineConfig := contextualArgumentsEngineConfig()
		engineConfig.DatasourceConfigurations[0].CustomGraphql.Grpc = &nodev1.GRPCConfiguration{
			Mapping: &nodev1.GRPCMapping{Service: "UsersService"},
			Plugin:  &nodev1.PluginConfiguration{Name: "users", Version: "v1"},
		}

		_, err := loadContextualArgumentsConfig(t, engineConfig, true)
		require.EqualError(t, err, "data source users is a gRPC or plugin data source and defines contextual arguments, which are supported only for GraphQL data sources")
	})

	t.Run("returns an error for an unknown numeric argument source", func(t *testing.T) {
		t.Parallel()

		routerConfig, err := execution_config.UnmarshalConfig([]byte(`{
			"engineConfig": {
				"fieldConfigurations": [
					{
						"typeName": "User",
						"fieldName": "profile",
						"argumentsConfiguration": [{"name": "includeSuspended", "sourceType": 7}]
					}
				]
			}
		}`))
		require.NoError(t, err)
		require.Equal(t, nodev1.ArgumentSource(7), routerConfig.EngineConfig.FieldConfigurations[0].ArgumentsConfiguration[0].SourceType)

		_, err = loadContextualArgumentsConfig(t, routerConfig.EngineConfig, false)
		require.EqualError(t, err, `unknown source type "7" of the argument "includeSuspended" on the field User.profile`)
	})
}

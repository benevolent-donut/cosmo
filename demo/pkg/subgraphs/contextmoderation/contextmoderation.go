package contextmoderation

import (
	"github.com/99designs/gqlgen/graphql"

	"github.com/wundergraph/cosmo/demo/pkg/subgraphs/contextmoderation/subgraph"
	"github.com/wundergraph/cosmo/demo/pkg/subgraphs/contextmoderation/subgraph/generated"
)

func NewSchema() graphql.ExecutableSchema {
	return generated.NewExecutableSchema(generated.Config{Resolvers: subgraph.NewResolver()})
}

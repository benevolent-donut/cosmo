package contextpublic

import (
	"github.com/99designs/gqlgen/graphql"

	"github.com/wundergraph/cosmo/demo/pkg/subgraphs/contextpublic/subgraph"
	"github.com/wundergraph/cosmo/demo/pkg/subgraphs/contextpublic/subgraph/generated"
)

func NewSchema() graphql.ExecutableSchema {
	return generated.NewExecutableSchema(generated.Config{Resolvers: &subgraph.Resolver{}})
}

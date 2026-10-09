package generated

import (
	"context"

	"github.com/wundergraph/cosmo/demo/pkg/subgraphs/contextusers/subgraph/model"
)

// PopulateUserRequires is the requires populator for the User entity.
func (ec *executionContext) PopulateUserRequires(ctx context.Context, entity *model.User, reps map[string]any) error {
	if handle, ok := reps["handle"].(string); ok {
		entity.Handle = &handle
	}
	return nil
}

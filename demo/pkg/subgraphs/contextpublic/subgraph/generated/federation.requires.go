package generated

import (
	"context"
	"fmt"

	"github.com/wundergraph/cosmo/demo/pkg/subgraphs/contextpublic/subgraph/model"
)

// PopulateModerationQueueRequires is the requires populator for the ModerationQueue entity.
func (ec *executionContext) PopulateModerationQueueRequires(ctx context.Context, entity *model.ModerationQueue, reps map[string]any) error {
	includeSuspended, ok := reps["includeSuspended"].(bool)
	if !ok {
		return fmt.Errorf("representation of ModerationQueue %q has no includeSuspended", entity.ID)
	}
	policyLevel := 1
	if includeSuspended {
		policyLevel = 3
	}
	entity.IncludeSuspended = includeSuspended
	entity.PolicyLevel = &policyLevel
	return nil
}

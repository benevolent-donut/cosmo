package subgraph

import "github.com/wundergraph/cosmo/demo/pkg/subgraphs/contextmoderation/subgraph/model"

type moderationQueueRecord struct {
	includeSuspended bool
	flaggedUsers     []string
	flaggedUserPages [][]string
	team             string
}

type appealQueueRecord struct {
	includeSuspended bool
	showSuspended    bool
	flaggedUsers     []string
}

type organizationRecord struct {
	includeSuspended bool
	queues           []string
	members          []string
}

type data struct {
	moderationQueues map[string]*moderationQueueRecord
	appealQueues     map[string]*appealQueueRecord
	teamMembers      map[string][]string
	organizations    map[string]*organizationRecord
}

func newData() *data {
	return &data{
		moderationQueues: map[string]*moderationQueueRecord{
			"q1": {includeSuspended: true, flaggedUsers: []string{"u1", "u2"}, flaggedUserPages: [][]string{{"u1"}, {"u2"}}, team: "t1"},
			"q2": {includeSuspended: false, flaggedUsers: []string{"u2", "u3"}, flaggedUserPages: [][]string{{"u2", "u3"}}},
			"q3": {includeSuspended: true, flaggedUsers: []string{"u1", "u4"}, flaggedUserPages: [][]string{{"u1"}, {}, {"u4"}}},
		},
		appealQueues: map[string]*appealQueueRecord{
			"a1": {includeSuspended: false, showSuspended: true, flaggedUsers: []string{"u5"}},
		},
		teamMembers: map[string][]string{
			"t1": {"u7"},
		},
		organizations: map[string]*organizationRecord{
			"o1": {includeSuspended: false, queues: []string{"q1", "q2"}, members: []string{"u6"}},
		},
	}
}

func (d *data) moderationQueue(id string) *model.ModerationQueue {
	queue, ok := d.moderationQueues[id]
	if !ok {
		return nil
	}
	pages := make([][]*model.User, len(queue.flaggedUserPages))
	for i, page := range queue.flaggedUserPages {
		pages[i] = users(page)
	}
	return &model.ModerationQueue{
		ID:               id,
		IncludeSuspended: queue.includeSuspended,
		FlaggedUsers:     users(queue.flaggedUsers),
		FlaggedUserPages: pages,
		Team:             d.team(queue.team),
	}
}

func (d *data) moderationQueueList(ids ...string) []*model.ModerationQueue {
	queues := make([]*model.ModerationQueue, len(ids))
	for i, id := range ids {
		queues[i] = d.moderationQueue(id)
	}
	return queues
}

func (d *data) appealQueue(id string) *model.AppealQueue {
	queue, ok := d.appealQueues[id]
	if !ok {
		return nil
	}
	showSuspended := queue.showSuspended
	return &model.AppealQueue{
		ID:               id,
		IncludeSuspended: queue.includeSuspended,
		ShowSuspended:    &showSuspended,
		FlaggedUsers:     users(queue.flaggedUsers),
	}
}

func (d *data) team(id string) *model.Team {
	members, ok := d.teamMembers[id]
	if !ok {
		return nil
	}
	return &model.Team{ID: id, Members: users(members)}
}

func (d *data) organization(id string) *model.Organization {
	org, ok := d.organizations[id]
	if !ok {
		return nil
	}
	includeSuspended := org.includeSuspended
	return &model.Organization{
		ID:               id,
		IncludeSuspended: &includeSuspended,
		Queues:           d.moderationQueueList(org.queues...),
		Members:          users(org.members),
	}
}

func users(ids []string) []*model.User {
	result := make([]*model.User, len(ids))
	for i, id := range ids {
		result[i] = &model.User{ID: id}
	}
	return result
}

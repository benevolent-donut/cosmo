package subgraph

import "sync"

// This file will not be regenerated automatically.
//
// It serves as dependency injection for your app, add any dependencies you require here.

type Resolver struct {
	mu   sync.RWMutex
	data *data
}

func NewResolver() *Resolver {
	return &Resolver{data: newData()}
}

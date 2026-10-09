package subgraph

import (
	"fmt"
	"strings"
)

var friendIDs = map[string][]string{
	"u1": {"u2"},
	"u2": {"u3"},
	"u4": {"u1"},
}

func echo(id string, arguments ...string) *string {
	value := strings.Join(append([]string{id}, arguments...), "|")
	return &value
}

func argument[T any](name string, value *T) string {
	if value == nil {
		return name + "=null"
	}
	return fmt.Sprintf("%s=%v", name, *value)
}

func listArgument(name string, values []*string) string {
	if values == nil {
		return name + "=null"
	}
	items := make([]string, len(values))
	for i, value := range values {
		items[i] = "null"
		if value != nil {
			items[i] = *value
		}
	}
	return name + "=[" + strings.Join(items, ",") + "]"
}

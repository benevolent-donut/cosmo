package subgraph

import "github.com/wundergraph/cosmo/demo/pkg/subgraphs/contextpublic/subgraph/model"

var postAuthors = map[string]string{
	"p1": "u1",
}

func post(id string) *model.Post {
	author, ok := postAuthors[id]
	if !ok {
		return nil
	}
	return &model.Post{ID: id, Author: &model.User{ID: author}}
}

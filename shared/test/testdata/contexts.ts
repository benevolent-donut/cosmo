import { printSchemaWithDirectives } from '@graphql-tools/utils';
import {
  federateSubgraphs,
  FederationSuccess,
  ROUTER_COMPATIBILITY_VERSION_ONE,
  Subgraph,
} from '@wundergraph/composition';
import { parse } from 'graphql';
import type { RouterConfig } from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import { buildRouterConfig, RouterSubgraph, SubgraphKind } from '../../src';

export const moderationSDL = `
  type Query {
    moderationQueue(id: ID!): ModerationQueue
  }

  type ModerationQueue @key(fields: "id") {
    id: ID!
    includeSuspended: Boolean!
    flaggedUsers: [User!]!
  }

  type User @key(fields: "id", resolvable: false) {
    id: ID!
  }
`;

export const usersSDL = `
  type ModerationQueue @key(fields: "id") @context(name: "userScope") {
    id: ID!
    includeSuspended: Boolean! @external
  }

  type User @key(fields: "id") {
    id: ID!
    profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
    digest(locale: String, includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): String
  }

  type Profile {
    displayName: String!
  }
`;

export const usersWithoutContextsSDL = `
  type User @key(fields: "id") {
    id: ID!
    profile(includeSuspended: Boolean): Profile
  }

  type Profile {
    displayName: String!
  }
`;

export function composeAndBuildRouterConfig(sdlBySubgraphName: Map<string, string>): RouterConfig {
  const subgraphs: Array<Subgraph> = [...sdlBySubgraphName].map(([name, sdl]) => ({
    definitions: parse(sdl),
    name,
    url: `http://localhost:4001/${name}/graphql`,
  }));
  const result = federateSubgraphs({ subgraphs, version: ROUTER_COMPATIBILITY_VERSION_ONE }) as FederationSuccess;
  if (!result.success) {
    throw new Error('The test subgraphs failed to compose.');
  }
  return buildRouterConfig({
    federatedClientSDL: '',
    federatedSDL: printSchemaWithDirectives(result.federatedGraphSchema),
    fieldConfigurations: result.fieldConfigurations,
    routerCompatibilityVersion: ROUTER_COMPATIBILITY_VERSION_ONE,
    schemaVersionId: '',
    subgraphs: [...sdlBySubgraphName].map(([name, sdl], index): RouterSubgraph => {
      const subgraphConfig = result.subgraphConfigBySubgraphName.get(name)!;
      return {
        kind: SubgraphKind.Standard,
        id: `${index}`,
        name,
        sdl,
        url: `http://localhost:4001/${name}/graphql`,
        subscriptionUrl: '',
        schema: subgraphConfig.schema,
        configurationDataByTypeName: subgraphConfig.configurationDataByTypeName,
      };
    }),
  });
}

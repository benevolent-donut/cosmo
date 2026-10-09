import * as fs from 'node:fs';
import { create } from '@bufbuild/protobuf';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import {
  federateSubgraphs,
  FederationSuccess,
  ROUTER_COMPATIBILITY_VERSION_ONE,
  Subgraph,
} from '@wundergraph/composition';
import { GRPCMappingSchema } from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import type { RouterConfig } from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import { parse } from 'graphql';
import { buildRouterConfig, RouterSubgraph, SubgraphKind } from '../../src';

const subgraphNames = ['accounts', 'employees', 'events', 'inventory', 'products', 'reviews'];

export function buildRouterConfigWithoutContexts(): RouterConfig {
  const sdlBySubgraphName = new Map<string, string>(
    subgraphNames.map((name) => [name, fs.readFileSync(`test/testdata/${name}.graphql`).toString()]),
  );
  const subgraphs: Array<Subgraph> = subgraphNames.map((name) => ({
    definitions: parse(sdlBySubgraphName.get(name)!),
    name,
    url: `http://localhost:4001/${name}/graphql`,
  }));
  const result = federateSubgraphs({
    subgraphs,
    version: ROUTER_COMPATIBILITY_VERSION_ONE,
  }) as FederationSuccess;
  if (!result.success) {
    throw new Error('The subgraphs without contexts failed to compose.');
  }
  const routerSubgraphs: Array<RouterSubgraph> = subgraphNames.map((name, index) => {
    const subgraphConfig = result.subgraphConfigBySubgraphName.get(name)!;
    if (name === 'inventory') {
      return {
        kind: SubgraphKind.Plugin,
        id: `${index}`,
        name,
        version: '0.0.1',
        mapping: create(GRPCMappingSchema, { service: name, version: 1 }),
        protoSchema: '',
        sdl: sdlBySubgraphName.get(name)!,
        url: `http://localhost:3000/plugin/${index}`,
        schema: subgraphConfig.schema,
        configurationDataByTypeName: subgraphConfig.configurationDataByTypeName,
        costs: subgraphConfig.costs,
      };
    }
    return {
      kind: SubgraphKind.Standard,
      id: `${index}`,
      name,
      sdl: sdlBySubgraphName.get(name)!,
      url: `http://localhost:4001/${name}/graphql`,
      subscriptionUrl: '',
      subscriptionProtocol: 'ws',
      websocketSubprotocol: 'auto',
      schema: subgraphConfig.schema,
      configurationDataByTypeName: subgraphConfig.configurationDataByTypeName,
      costs: subgraphConfig.costs,
    };
  });
  return buildRouterConfig({
    federatedClientSDL: result.shouldIncludeClientSchema
      ? printSchemaWithDirectives(result.federatedGraphClientSchema)
      : '',
    federatedSDL: printSchemaWithDirectives(result.federatedGraphSchema),
    fieldConfigurations: result.fieldConfigurations,
    routerCompatibilityVersion: ROUTER_COMPATIBILITY_VERSION_ONE,
    schemaVersionId: '00000000-0000-0000-0000-000000000000',
    subgraphs: routerSubgraphs,
  });
}

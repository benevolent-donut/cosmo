import { fromJsonString } from '@bufbuild/protobuf';
import { EnumStatusCode } from '@wundergraph/cosmo-connect/dist/common/common_pb';
import { RouterConfigSchema } from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import type { RouterConfig } from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import { PlatformService } from '@wundergraph/cosmo-connect/dist/platform/v1/platform_pb';
import type { Client } from '@connectrpc/connect';
import {
  COMPOSITION_VERSION,
  federateSubgraphs,
  type FederationSuccess,
  parse,
  ROUTER_COMPATIBILITY_VERSION_ONE,
} from '@wundergraph/composition';
import { buildRouterConfig, joinLabel, SubgraphKind } from '@wundergraph/cosmo-shared';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ClickHouseClient } from '../../src/core/clickhouse/index.js';
import { Composer, routerConfigToFeatureFlagExecutionConfig } from '../../src/core/composition/composer.js';
import { afterAllSetup, beforeAllSetup, genID, genUniqueLabel } from '../../src/core/test-util.js';
import {
  createAndPublishSubgraph,
  createFeatureFlag,
  createFederatedGraph,
  createThenPublishFeatureSubgraph,
  DEFAULT_NAMESPACE,
  DEFAULT_ROUTER_URL,
  DEFAULT_SUBGRAPH_URL_ONE,
  DEFAULT_SUBGRAPH_URL_TWO,
  InMemoryBlobStorage,
  SetupTest,
  toggleFeatureFlag,
} from '../test-util.js';

let dbname = '';

vi.mock('../src/core/clickhouse/index.js', () => {
  const ClickHouseClient = vi.fn();
  ClickHouseClient.prototype.queryPromise = vi.fn();

  return { ClickHouseClient };
});

const moderationSDL = `
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

const usersSDL = `
  type User @key(fields: "id") {
    id: ID!
    profile: Profile
  }

  type Profile {
    displayName: String!
  }
`;

const usersWithContextsSDL = `
  type ModerationQueue @key(fields: "id") @context(name: "userScope") {
    id: ID!
    includeSuspended: Boolean! @external
  }

  type User @key(fields: "id") {
    id: ID!
    profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
  }

  type Profile {
    displayName: String!
  }
`;

function buildTestRouterConfig(sdlBySubgraphName: Map<string, string>): RouterConfig {
  const result = federateSubgraphs({
    subgraphs: [...sdlBySubgraphName].map(([name, sdl]) => ({ definitions: parse(sdl), name, url: '' })),
    version: ROUTER_COMPATIBILITY_VERSION_ONE,
  }) as FederationSuccess;
  expect(result.success).toBe(true);
  return buildRouterConfig({
    federatedClientSDL: '',
    federatedSDL: printSchemaWithDirectives(result.federatedGraphSchema),
    fieldConfigurations: result.fieldConfigurations,
    routerCompatibilityVersion: ROUTER_COMPATIBILITY_VERSION_ONE,
    schemaVersionId: '',
    subgraphs: [...sdlBySubgraphName].map(([name, sdl], index) => ({
      configurationDataByTypeName: result.subgraphConfigBySubgraphName.get(name)!.configurationDataByTypeName,
      id: `${index}`,
      kind: SubgraphKind.Standard,
      name,
      schema: result.subgraphConfigBySubgraphName.get(name)!.schema,
      sdl,
      subscriptionUrl: '',
      url: '',
    })),
  });
}

async function getRouterConfig(blobStorage: InMemoryBlobStorage, key: string): Promise<RouterConfig> {
  const blob = await blobStorage.getObject({ key });
  const { value } = await blob.stream.getReader().read();
  return fromJsonString(RouterConfigSchema, value.toString());
}

function getRouterConfigKey(blobStorage: InMemoryBlobStorage, federatedGraphId: string, suffix: string): string {
  const key = blobStorage.keys().find((key) => key.includes(federatedGraphId) && key.endsWith(suffix));
  expect(key).toBeDefined();
  return key!;
}

async function getFederatedGraphId(client: Client<typeof PlatformService>, name: string): Promise<string> {
  const response = await client.getFederatedGraphByName({ name, namespace: DEFAULT_NAMESPACE });
  expect(response.response?.code).toBe(EnumStatusCode.OK);
  return response.graph!.id;
}

function hasContextualArguments(routerConfig: { engineConfig?: RouterConfig['engineConfig'] }): boolean {
  return !!routerConfig.engineConfig?.datasourceConfigurations.some((d) => d.contextualArgumentConfiguration);
}

describe('Feature flag contextual argument tests', () => {
  let chClient: ClickHouseClient;

  beforeEach(() => {
    chClient = new ClickHouseClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeAll(async () => {
    dbname = await beforeAllSetup();
  });

  afterAll(async () => {
    await afterAllSetup(dbname);
  });

  describe('composeRouterConfigWithFeatureFlags', () => {
    const composer = new Composer(pino(), {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    test('that the base config is stamped with version 2 if a feature flag config defines contextual arguments', () => {
      const base = buildTestRouterConfig(
        new Map([
          ['moderation', moderationSDL],
          ['users', usersSDL],
        ]),
      );
      const featureFlag = buildTestRouterConfig(
        new Map([
          ['moderation', moderationSDL],
          ['users', usersWithContextsSDL],
        ]),
      );
      expect(base.compatibilityVersion).toBe(`1:${COMPOSITION_VERSION}`);
      expect(featureFlag.compatibilityVersion).toBe(`2:${COMPOSITION_VERSION}`);

      const routerConfig = composer.composeRouterConfigWithFeatureFlags({
        baseCompositionRouterExecutionConfig: base,
        featureFlagRouterExecutionConfigByFeatureFlagName: new Map([
          ['flag', routerConfigToFeatureFlagExecutionConfig(featureFlag)],
        ]),
      });
      expect(routerConfig.compatibilityVersion).toBe(`2:${COMPOSITION_VERSION}`);
      expect(hasContextualArguments(routerConfig)).toBe(false);
      expect(hasContextualArguments(routerConfig.featureFlagConfigs!.configByFeatureFlagName.flag)).toBe(true);
    });

    test('that the base config keeps its compatibility version if no feature flag config defines contextual arguments', () => {
      const base = buildTestRouterConfig(new Map([['moderation', moderationSDL]]));
      const featureFlag = buildTestRouterConfig(
        new Map([
          ['moderation', moderationSDL],
          ['users', usersSDL],
        ]),
      );

      const routerConfig = composer.composeRouterConfigWithFeatureFlags({
        baseCompositionRouterExecutionConfig: base,
        featureFlagRouterExecutionConfigByFeatureFlagName: new Map([
          ['flag', routerConfigToFeatureFlagExecutionConfig(featureFlag)],
        ]),
      });
      expect(routerConfig.compatibilityVersion).toBe(base.compatibilityVersion);
      expect(routerConfig.compatibilityVersion).toBe(`1:${COMPOSITION_VERSION}`);
    });

    test('that a base config with contextual arguments keeps version 2 without feature flags', () => {
      const base = buildTestRouterConfig(
        new Map([
          ['moderation', moderationSDL],
          ['users', usersWithContextsSDL],
        ]),
      );

      const routerConfig = composer.composeRouterConfigWithFeatureFlags({
        baseCompositionRouterExecutionConfig: base,
        featureFlagRouterExecutionConfigByFeatureFlagName: new Map(),
      });
      expect(routerConfig.compatibilityVersion).toBe(`2:${COMPOSITION_VERSION}`);
    });
  });

  test('that enabling a feature flag with contextual arguments stamps the embedded config with version 2', async (testContext) => {
    const { client, server, blobStorage } = await SetupTest({ dbname, chClient });
    testContext.onTestFinished(() => server.close());

    const label = genUniqueLabel('label');
    const federatedGraphName = genID('fedGraph');
    const usersSubgraphName = genID('users');
    const featureSubgraphName = genID('users-feature');
    const featureFlagName = genID('flag');

    await createAndPublishSubgraph(
      client,
      genID('moderation'),
      DEFAULT_NAMESPACE,
      moderationSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_ONE,
    );
    await createAndPublishSubgraph(
      client,
      usersSubgraphName,
      DEFAULT_NAMESPACE,
      usersSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_TWO,
    );
    await createFederatedGraph(client, federatedGraphName, DEFAULT_NAMESPACE, [joinLabel(label)], DEFAULT_ROUTER_URL);
    const key = getRouterConfigKey(
      blobStorage,
      await getFederatedGraphId(client, federatedGraphName),
      'routerconfigs/latest.json',
    );
    expect((await getRouterConfig(blobStorage, key)).compatibilityVersion).toBe(`1:${COMPOSITION_VERSION}`);

    await createThenPublishFeatureSubgraph(
      client,
      featureSubgraphName,
      usersSubgraphName,
      DEFAULT_NAMESPACE,
      usersWithContextsSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_TWO,
    );
    await createFeatureFlag(client, featureFlagName, [label], [featureSubgraphName], DEFAULT_NAMESPACE, true);

    const routerConfig = await getRouterConfig(blobStorage, key);
    expect(routerConfig.compatibilityVersion).toBe(`2:${COMPOSITION_VERSION}`);
    expect(hasContextualArguments(routerConfig)).toBe(false);
    expect(hasContextualArguments(routerConfig.featureFlagConfigs!.configByFeatureFlagName[featureFlagName])).toBe(
      true,
    );

    await toggleFeatureFlag(client, featureFlagName, false);

    const routerConfigWithoutFeatureFlag = await getRouterConfig(blobStorage, key);
    expect(routerConfigWithoutFeatureFlag.compatibilityVersion).toBe(`1:${COMPOSITION_VERSION}`);
    expect(routerConfigWithoutFeatureFlag.featureFlagConfigs).toBeUndefined();
  });

  test('that a graph without contextual arguments keeps version 1 with its feature flag', async (testContext) => {
    const { client, server, blobStorage } = await SetupTest({ dbname, chClient });
    testContext.onTestFinished(() => server.close());

    const label = genUniqueLabel('label');
    const usersSubgraphName = genID('users');
    const featureSubgraphName = genID('users-feature');
    const featureFlagName = genID('flag');

    await createAndPublishSubgraph(
      client,
      genID('moderation'),
      DEFAULT_NAMESPACE,
      moderationSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_ONE,
    );
    await createAndPublishSubgraph(
      client,
      usersSubgraphName,
      DEFAULT_NAMESPACE,
      usersSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_TWO,
    );
    const federatedGraphName = genID('fedGraph');
    await createFederatedGraph(client, federatedGraphName, DEFAULT_NAMESPACE, [joinLabel(label)], DEFAULT_ROUTER_URL);
    await createThenPublishFeatureSubgraph(
      client,
      featureSubgraphName,
      usersSubgraphName,
      DEFAULT_NAMESPACE,
      usersSDL.replace('profile: Profile', 'profile: Profile\n    nickname: String'),
      [label],
      DEFAULT_SUBGRAPH_URL_TWO,
    );
    await createFeatureFlag(client, featureFlagName, [label], [featureSubgraphName], DEFAULT_NAMESPACE, true);

    const key = getRouterConfigKey(
      blobStorage,
      await getFederatedGraphId(client, federatedGraphName),
      'routerconfigs/latest.json',
    );
    const blob = await blobStorage.getObject({ key });
    const { value } = await blob.stream.getReader().read();
    const routerConfigJson = value.toString();
    const routerConfig = fromJsonString(RouterConfigSchema, routerConfigJson);
    expect(routerConfig.compatibilityVersion).toBe(`1:${COMPOSITION_VERSION}`);
    expect(routerConfig.featureFlagConfigs!.configByFeatureFlagName[featureFlagName]).toBeDefined();
    expect(routerConfigJson).not.toContain('contextualArgumentConfiguration');
    expect(routerConfigJson).not.toContain('FROM_CONTEXT');
  });

  test('that a contract whose feature flag defines contextual arguments is stamped with version 2', async (testContext) => {
    const { client, server, blobStorage } = await SetupTest({ dbname, chClient });
    testContext.onTestFinished(() => server.close());

    const label = genUniqueLabel('label');
    const federatedGraphName = genID('fedGraph');
    const contractName = genID('contract');
    const usersSubgraphName = genID('users');
    const featureSubgraphName = genID('users-feature');
    const featureFlagName = genID('flag');

    await createAndPublishSubgraph(
      client,
      genID('moderation'),
      DEFAULT_NAMESPACE,
      moderationSDL.replace(
        'moderationQueue(id: ID!): ModerationQueue',
        'moderationQueue(id: ID!): ModerationQueue\n    reports: [String!]! @tag(name: "internal")',
      ),
      [label],
      DEFAULT_SUBGRAPH_URL_ONE,
    );
    await createAndPublishSubgraph(
      client,
      usersSubgraphName,
      DEFAULT_NAMESPACE,
      usersSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_TWO,
    );
    await createFederatedGraph(client, federatedGraphName, DEFAULT_NAMESPACE, [joinLabel(label)], DEFAULT_ROUTER_URL);
    const createContractResponse = await client.createContract({
      name: contractName,
      namespace: DEFAULT_NAMESPACE,
      sourceGraphName: federatedGraphName,
      excludeTags: ['internal'],
      routingUrl: 'http://localhost:3003',
    });
    expect(createContractResponse.response?.code).toBe(EnumStatusCode.OK);

    await createThenPublishFeatureSubgraph(
      client,
      featureSubgraphName,
      usersSubgraphName,
      DEFAULT_NAMESPACE,
      usersWithContextsSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_TWO,
    );
    await createFeatureFlag(client, featureFlagName, [label], [featureSubgraphName], DEFAULT_NAMESPACE, true);

    const contractConfig = await getRouterConfig(
      blobStorage,
      getRouterConfigKey(blobStorage, await getFederatedGraphId(client, contractName), 'routerconfigs/latest.json'),
    );
    expect(contractConfig.compatibilityVersion).toBe(`2:${COMPOSITION_VERSION}`);
    expect(contractConfig.engineConfig?.graphqlClientSchema ?? '').not.toContain('reports');
    expect(hasContextualArguments(contractConfig.featureFlagConfigs!.configByFeatureFlagName[featureFlagName])).toBe(
      true,
    );
  });

  test('that a split base config with contextual arguments is stamped with version 2', async (testContext) => {
    const { client, server, blobStorage } = await SetupTest({
      dbname,
      chClient,
      enabledFeatures: ['split-config-loading'],
    });
    testContext.onTestFinished(() => server.close());

    const label = genUniqueLabel('label');

    await createAndPublishSubgraph(
      client,
      genID('moderation'),
      DEFAULT_NAMESPACE,
      moderationSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_ONE,
    );
    await createAndPublishSubgraph(
      client,
      genID('users'),
      DEFAULT_NAMESPACE,
      usersWithContextsSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_TWO,
    );
    const federatedGraphName = genID('fedGraph');
    await createFederatedGraph(client, federatedGraphName, DEFAULT_NAMESPACE, [joinLabel(label)], DEFAULT_ROUTER_URL);

    const routerConfig = await getRouterConfig(
      blobStorage,
      getRouterConfigKey(blobStorage, await getFederatedGraphId(client, federatedGraphName), 'manifest/latest.json'),
    );
    expect(routerConfig.compatibilityVersion).toBe(`2:${COMPOSITION_VERSION}`);
    expect(hasContextualArguments(routerConfig)).toBe(true);
  });
});

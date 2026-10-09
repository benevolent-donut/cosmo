import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fromJsonString } from '@bufbuild/protobuf';
import { EnumStatusCode } from '@wundergraph/cosmo-connect/dist/common/common_pb';
import { RouterConfigSchema } from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import { SubgraphType } from '@wundergraph/cosmo-connect/dist/platform/v1/platform_pb';
import { joinLabel } from '@wundergraph/cosmo-shared';
import { formatISO } from 'date-fns';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ClickHouseClient } from '../../src/core/clickhouse/index.js';
import { unsuccessfulBaseCompositionError } from '../../src/core/errors/errors.js';
import { afterAllSetup, beforeAllSetup, genID, genUniqueLabel } from '../../src/core/test-util.js';
import {
  createAndPublishSubgraph,
  createFederatedGraph,
  DEFAULT_GRPC_SUBGRAPH_URL_TWO,
  DEFAULT_NAMESPACE,
  DEFAULT_ROUTER_URL,
  DEFAULT_SUBGRAPH_URL_ONE,
  SetupTest,
  tomorrowDate,
  yearStartDate,
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

function readProto(directoryName: string) {
  const testDataPath = path.join(process.cwd(), 'test/test-data', directoryName);
  return {
    lock: readFileSync(path.join(testDataPath, 'service.proto.lock.json'), 'utf8'),
    mappings: readFileSync(path.join(testDataPath, 'mapping.json'), 'utf8'),
    schema: readFileSync(path.join(testDataPath, 'service.proto'), 'utf8'),
  };
}

function contextualArgumentErrorMessage(subgraphName: string, kindDescription: string): string {
  return (
    `The subgraph "${subgraphName}" is a ${kindDescription} subgraph and defines the following argument with` +
    ` "@fromContext": "User.profile(includeSuspended: ...)". Contextual arguments are only supported in GraphQL` +
    ` subgraphs.`
  );
}

describe('Contextual argument composition tests', () => {
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

  test('that publishing a gRPC service subgraph with contextual arguments records a failed composition', async (testContext) => {
    const { client, server, blobStorage } = await SetupTest({ dbname, chClient });
    testContext.onTestFinished(() => server.close());

    const label = genUniqueLabel('label');
    const federatedGraphName = genID('fedGraph');
    const grpcSubgraphName = genID('users');

    await createAndPublishSubgraph(
      client,
      genID('moderation'),
      DEFAULT_NAMESPACE,
      moderationSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_ONE,
    );
    await createFederatedGraph(client, federatedGraphName, DEFAULT_NAMESPACE, [joinLabel(label)], DEFAULT_ROUTER_URL);
    const federatedGraphResponse = await client.getFederatedGraphByName({
      name: federatedGraphName,
      namespace: DEFAULT_NAMESPACE,
    });
    expect(federatedGraphResponse.response?.code).toBe(EnumStatusCode.OK);
    const key = blobStorage
      .keys()
      .find((key) => key.includes(federatedGraphResponse.graph!.id) && key.endsWith('routerconfigs/latest.json'));
    expect(key).toBeDefined();
    const blob = await blobStorage.getObject({ key: key! });
    const { value } = await blob.stream.getReader().read();
    const deployedRouterConfigJson = value.toString();

    const createSubgraphResponse = await client.createFederatedSubgraph({
      name: grpcSubgraphName,
      namespace: DEFAULT_NAMESPACE,
      type: SubgraphType.GRPC_SERVICE,
      labels: [label],
      routingUrl: DEFAULT_GRPC_SUBGRAPH_URL_TWO,
    });
    expect(createSubgraphResponse.response?.code).toBe(EnumStatusCode.OK);

    const publishResponse = await client.publishFederatedSubgraph({
      name: grpcSubgraphName,
      namespace: DEFAULT_NAMESPACE,
      schema: usersWithContextsSDL,
      type: SubgraphType.GRPC_SERVICE,
      proto: readProto('grpc-service'),
    });
    expect(publishResponse.response?.code).toBe(EnumStatusCode.ERR_SUBGRAPH_COMPOSITION_FAILED);
    expect(publishResponse.compositionErrors.map(({ message }) => message)).toStrictEqual([
      contextualArgumentErrorMessage(grpcSubgraphName, 'gRPC service'),
      unsuccessfulBaseCompositionError(federatedGraphName).message,
    ]);

    const compositionsResponse = await client.getCompositions({
      fedGraphName: federatedGraphName,
      namespace: DEFAULT_NAMESPACE,
      startDate: formatISO(yearStartDate),
      endDate: formatISO(tomorrowDate),
    });
    expect(compositionsResponse.response?.code).toBe(EnumStatusCode.OK);
    const failedCompositions = compositionsResponse.compositions.filter(({ isComposable }) => !isComposable);
    expect(failedCompositions).toHaveLength(1);
    expect(failedCompositions[0].compositionErrors).toContain(
      contextualArgumentErrorMessage(grpcSubgraphName, 'gRPC service'),
    );

    // The last composable router config stays deployed.
    const deployedBlob = await blobStorage.getObject({ key: key! });
    const deployed = await deployedBlob.stream.getReader().read();
    expect(deployed.value.toString()).toBe(deployedRouterConfigJson);
    expect(fromJsonString(RouterConfigSchema, deployedRouterConfigJson).compatibilityVersion).toMatch(/^1:/);
  });

  test('that publishing a plugin subgraph with contextual arguments returns a composition error', async (testContext) => {
    const { client, server } = await SetupTest({ dbname, chClient, setupBilling: { plan: 'launch@1' } });
    testContext.onTestFinished(() => server.close());

    const label = genUniqueLabel('label');
    const federatedGraphName = genID('fedGraph');
    const pluginSubgraphName = genID('users');

    await createAndPublishSubgraph(
      client,
      genID('moderation'),
      DEFAULT_NAMESPACE,
      moderationSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_ONE,
    );
    await createFederatedGraph(client, federatedGraphName, DEFAULT_NAMESPACE, [joinLabel(label)], DEFAULT_ROUTER_URL);

    const createSubgraphResponse = await client.createFederatedSubgraph({
      name: pluginSubgraphName,
      namespace: DEFAULT_NAMESPACE,
      type: SubgraphType.GRPC_PLUGIN,
      labels: [label],
    });
    expect(createSubgraphResponse.response?.code).toBe(EnumStatusCode.OK);

    const publishResponse = await client.publishFederatedSubgraph({
      name: pluginSubgraphName,
      namespace: DEFAULT_NAMESPACE,
      schema: usersWithContextsSDL,
      type: SubgraphType.GRPC_PLUGIN,
      proto: { ...readProto('plugin'), platforms: ['linux/amd64'], version: 'v1' },
    });
    expect(publishResponse.response?.code).toBe(EnumStatusCode.ERR_SUBGRAPH_COMPOSITION_FAILED);
    expect(publishResponse.compositionErrors.map(({ message }) => message)).toStrictEqual([
      contextualArgumentErrorMessage(pluginSubgraphName, 'plugin'),
      unsuccessfulBaseCompositionError(federatedGraphName).message,
    ]);
  });

  test('that a schema check of a gRPC service subgraph with contextual arguments returns a composition error', async (testContext) => {
    const { client, server } = await SetupTest({ dbname, chClient });
    testContext.onTestFinished(() => server.close());

    const label = genUniqueLabel('label');
    const grpcSubgraphName = genID('users');

    await createAndPublishSubgraph(
      client,
      genID('moderation'),
      DEFAULT_NAMESPACE,
      moderationSDL,
      [label],
      DEFAULT_SUBGRAPH_URL_ONE,
    );
    await createFederatedGraph(client, genID('fedGraph'), DEFAULT_NAMESPACE, [joinLabel(label)], DEFAULT_ROUTER_URL);

    const createSubgraphResponse = await client.createFederatedSubgraph({
      name: grpcSubgraphName,
      namespace: DEFAULT_NAMESPACE,
      type: SubgraphType.GRPC_SERVICE,
      labels: [label],
      routingUrl: DEFAULT_GRPC_SUBGRAPH_URL_TWO,
    });
    expect(createSubgraphResponse.response?.code).toBe(EnumStatusCode.OK);
    const publishResponse = await client.publishFederatedSubgraph({
      name: grpcSubgraphName,
      namespace: DEFAULT_NAMESPACE,
      schema: usersSDL,
      type: SubgraphType.GRPC_SERVICE,
      proto: readProto('grpc-service'),
    });
    expect(publishResponse.response?.code).toBe(EnumStatusCode.OK);

    const checkResponse = await client.checkSubgraphSchema({
      subgraphName: grpcSubgraphName,
      namespace: DEFAULT_NAMESPACE,
      schema: Uint8Array.from(Buffer.from(usersWithContextsSDL)),
    });
    expect(checkResponse.response?.code).toBe(EnumStatusCode.OK);
    expect(checkResponse.compositionErrors.map(({ message }) => message)).toStrictEqual([
      contextualArgumentErrorMessage(grpcSubgraphName, 'gRPC service'),
    ]);
  });
});

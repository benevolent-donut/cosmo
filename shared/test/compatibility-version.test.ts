import { describe, expect, test } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { COMPOSITION_VERSION, type ConfigurationData, type TypeName } from '@wundergraph/composition';
import {
  ContextualArgumentConfigurationSchema,
  DataSourceConfigurationSchema,
  EngineConfigurationSchema,
} from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import {
  foldRouterCompatibilityVersion,
  getRequiredRouterCompatibilityVersion,
  getUnsupportedContextualArgumentSubgraphErrors,
  SubgraphKind,
} from '../src';
import { unsupportedContextualArgumentSubgraphError } from '../src/router-config/errors';
import { composeAndBuildRouterConfig, moderationSDL, usersSDL, usersWithoutContextsSDL } from './testdata/contexts';

describe('Contextual argument router compatibility version tests', () => {
  test('that a config without contextual arguments is stamped with router compatibility version 1', () => {
    const routerConfig = composeAndBuildRouterConfig(
      new Map([
        ['moderation', moderationSDL],
        ['users', usersWithoutContextsSDL],
      ]),
    );
    expect(routerConfig.compatibilityVersion).toBe(`1:${COMPOSITION_VERSION}`);
    expect(getRequiredRouterCompatibilityVersion(routerConfig.engineConfig)).toBe('1');
  });

  test('that a config with contextual arguments is stamped with router compatibility version 2', () => {
    const routerConfig = composeAndBuildRouterConfig(
      new Map([
        ['moderation', moderationSDL],
        ['users', usersSDL],
      ]),
    );
    expect(routerConfig.compatibilityVersion).toBe(`2:${COMPOSITION_VERSION}`);
    expect(getRequiredRouterCompatibilityVersion(routerConfig.engineConfig)).toBe('2');
  });

  test('that only an engine configuration with contextual arguments requires router compatibility version 2', () => {
    expect(getRequiredRouterCompatibilityVersion(undefined)).toBe('1');
    expect(
      getRequiredRouterCompatibilityVersion(
        create(EngineConfigurationSchema, {
          datasourceConfigurations: [create(DataSourceConfigurationSchema, { id: '0' })],
        }),
      ),
    ).toBe('1');
    expect(
      getRequiredRouterCompatibilityVersion(
        create(EngineConfigurationSchema, {
          datasourceConfigurations: [
            create(DataSourceConfigurationSchema, { id: '0' }),
            create(DataSourceConfigurationSchema, {
              contextualArgumentConfiguration: create(ContextualArgumentConfigurationSchema),
              id: '1',
            }),
          ],
        }),
      ),
    ).toBe('2');
  });

  test('that folding configs without contextual arguments returns the input string unchanged', () => {
    const base = composeAndBuildRouterConfig(new Map([['moderation', moderationSDL]]));
    const featureFlag = composeAndBuildRouterConfig(
      new Map([
        ['moderation', moderationSDL],
        ['users', usersWithoutContextsSDL],
      ]),
    );
    const compatibilityVersion = foldRouterCompatibilityVersion(base.compatibilityVersion, [
      getRequiredRouterCompatibilityVersion(featureFlag.engineConfig),
    ]);
    expect(compatibilityVersion).toBe(base.compatibilityVersion);
    expect(compatibilityVersion).toBe(`1:${COMPOSITION_VERSION}`);
    expect(foldRouterCompatibilityVersion(base.compatibilityVersion, [])).toBe(base.compatibilityVersion);
  });

  test('that folding a feature flag config with contextual arguments into a base without them raises the base to version 2', () => {
    const base = composeAndBuildRouterConfig(
      new Map([
        ['moderation', moderationSDL],
        ['users', usersWithoutContextsSDL],
      ]),
    );
    const featureFlag = composeAndBuildRouterConfig(
      new Map([
        ['moderation', moderationSDL],
        ['users', usersSDL],
      ]),
    );
    expect(base.compatibilityVersion).toBe(`1:${COMPOSITION_VERSION}`);
    expect(
      foldRouterCompatibilityVersion(base.compatibilityVersion, [
        getRequiredRouterCompatibilityVersion(base.engineConfig),
        getRequiredRouterCompatibilityVersion(featureFlag.engineConfig),
      ]),
    ).toBe(`2:${COMPOSITION_VERSION}`);
  });

  test('that an input version above the required version is kept', () => {
    expect(foldRouterCompatibilityVersion('3:0.48.0', ['1', '2'])).toBe('3:0.48.0');
    expect(foldRouterCompatibilityVersion('2:0.48.0', ['2'])).toBe('2:0.48.0');
  });

  test('that only the router compatibility version segment is folded', () => {
    expect(foldRouterCompatibilityVersion('1:0.48.0', ['2'])).toBe('2:0.48.0');
    expect(foldRouterCompatibilityVersion('1', ['2'])).toBe('2');
    expect(foldRouterCompatibilityVersion('1:0.48.0', ['10'])).toBe('10:0.48.0');
    expect(foldRouterCompatibilityVersion('invalid:0.48.0', ['2'])).toBe('invalid:0.48.0');
    expect(foldRouterCompatibilityVersion('', ['2'])).toBe('');
    expect(foldRouterCompatibilityVersion('1:0.48.0', ['invalid'])).toBe('1:0.48.0');
  });
});

describe('Unsupported contextual argument subgraph tests', () => {
  const configurationDataByTypeName = new Map<TypeName, ConfigurationData>([
    [
      'User',
      {
        contextualArguments: [
          {
            argumentName: 'includeSuspended',
            contextName: 'userScope',
            fieldName: 'profile',
            setters: [{ selectionSet: 'includeSuspended', typeName: 'ModerationQueue' }],
          },
          {
            argumentName: 'includeSuspended',
            contextName: 'userScope',
            fieldName: 'digest',
            setters: [{ selectionSet: 'includeSuspended', typeName: 'ModerationQueue' }],
          },
        ],
        fieldNames: new Set(['id', 'digest', 'profile']),
        isRootNode: true,
        typeName: 'User',
      },
    ],
  ]);

  test('that gRPC service and plugin subgraphs with contextual arguments return an error each', () => {
    expect(
      getUnsupportedContextualArgumentSubgraphErrors([
        { configurationDataByTypeName, kind: SubgraphKind.Standard, name: 'standard' },
        { configurationDataByTypeName, kind: SubgraphKind.GRPC, name: 'grpc' },
        { configurationDataByTypeName, kind: SubgraphKind.Plugin, name: 'plugin' },
      ]),
    ).toStrictEqual([
      unsupportedContextualArgumentSubgraphError({
        argumentCoords: ['User.profile(includeSuspended: ...)', 'User.digest(includeSuspended: ...)'],
        kindDescription: 'gRPC service',
        subgraphName: 'grpc',
      }),
      unsupportedContextualArgumentSubgraphError({
        argumentCoords: ['User.profile(includeSuspended: ...)', 'User.digest(includeSuspended: ...)'],
        kindDescription: 'plugin',
        subgraphName: 'plugin',
      }),
    ]);
  });

  test('that gRPC service and plugin subgraphs without contextual arguments return no error', () => {
    const configurationData = new Map<TypeName, ConfigurationData>([
      ['User', { fieldNames: new Set(['id']), isRootNode: true, typeName: 'User' }],
    ]);
    expect(
      getUnsupportedContextualArgumentSubgraphErrors([
        { configurationDataByTypeName: configurationData, kind: SubgraphKind.GRPC, name: 'grpc' },
        { configurationDataByTypeName: configurationData, kind: SubgraphKind.Plugin, name: 'plugin' },
        { kind: SubgraphKind.Plugin, name: 'uncomposed' },
      ]),
    ).toStrictEqual([]);
  });

  test('that the error message names the subgraph and each contextual argument', () => {
    expect(
      unsupportedContextualArgumentSubgraphError({
        argumentCoords: ['User.profile(includeSuspended: ...)'],
        kindDescription: 'gRPC service',
        subgraphName: 'users',
      }).message,
    ).toBe(
      'The subgraph "users" is a gRPC service subgraph and defines the following argument with "@fromContext":' +
        ' "User.profile(includeSuspended: ...)". Contextual arguments are only supported in GraphQL subgraphs.',
    );
  });
});

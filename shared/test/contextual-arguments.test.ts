import { describe, expect, test } from 'vitest';
import { create, toJsonString } from '@bufbuild/protobuf';
import {
  ArgumentConfigurationSchema,
  ArgumentSource,
  ContextSetterSchema,
  ContextualArgumentConfigurationSchema,
  ContextualArgumentSchema,
  FieldConfigurationSchema,
  RouterConfigSchema,
} from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import { composeAndBuildRouterConfig, moderationSDL, usersSDL, usersWithoutContextsSDL } from './testdata/contexts';

describe('Contextual argument router config tests', () => {
  test('that the contextual arguments of a subgraph are emitted on its data source only', () => {
    const routerConfig = composeAndBuildRouterConfig(
      new Map([
        ['moderation', moderationSDL],
        ['users', usersSDL],
      ]),
    );
    const [moderation, users] = routerConfig.engineConfig!.datasourceConfigurations;
    expect(moderation.contextualArgumentConfiguration).toBeUndefined();
    expect(users.contextualArgumentConfiguration).toStrictEqual(
      create(ContextualArgumentConfigurationSchema, {
        arguments: [
          create(ContextualArgumentSchema, {
            argumentName: 'includeSuspended',
            contextName: 'userScope',
            fieldName: 'profile',
            setters: [create(ContextSetterSchema, { selectionSet: 'includeSuspended', typeName: 'ModerationQueue' })],
            typeName: 'User',
          }),
          create(ContextualArgumentSchema, {
            argumentName: 'includeSuspended',
            contextName: 'userScope',
            fieldName: 'digest',
            setters: [create(ContextSetterSchema, { selectionSet: 'includeSuspended', typeName: 'ModerationQueue' })],
            typeName: 'User',
          }),
        ],
      }),
    );
  });

  test('that contextual arguments are appended to the field arguments of a field configuration', () => {
    const routerConfig = composeAndBuildRouterConfig(
      new Map([
        ['moderation', moderationSDL],
        ['users', usersSDL],
      ]),
    );
    expect(routerConfig.engineConfig!.fieldConfigurations).toStrictEqual([
      create(FieldConfigurationSchema, {
        argumentsConfiguration: [
          create(ArgumentConfigurationSchema, { name: 'id', sourceType: ArgumentSource.FIELD_ARGUMENT }),
        ],
        fieldName: 'moderationQueue',
        typeName: 'Query',
      }),
      create(FieldConfigurationSchema, {
        argumentsConfiguration: [
          create(ArgumentConfigurationSchema, { name: 'includeSuspended', sourceType: ArgumentSource.FROM_CONTEXT }),
        ],
        fieldName: 'profile',
        typeName: 'User',
      }),
      create(FieldConfigurationSchema, {
        argumentsConfiguration: [
          create(ArgumentConfigurationSchema, { name: 'locale', sourceType: ArgumentSource.FIELD_ARGUMENT }),
          create(ArgumentConfigurationSchema, { name: 'includeSuspended', sourceType: ArgumentSource.FROM_CONTEXT }),
        ],
        fieldName: 'digest',
        typeName: 'User',
      }),
    ]);
  });

  test('that the serialized router config contains the contextual argument configuration', () => {
    const json = JSON.parse(
      toJsonString(
        RouterConfigSchema,
        composeAndBuildRouterConfig(
          new Map([
            ['moderation', moderationSDL],
            ['users', usersSDL],
          ]),
        ),
      ),
    );
    expect(json.engineConfig.datasourceConfigurations[0].contextualArgumentConfiguration).toBeUndefined();
    expect(json.engineConfig.datasourceConfigurations[1].contextualArgumentConfiguration).toStrictEqual({
      arguments: [
        {
          typeName: 'User',
          fieldName: 'profile',
          argumentName: 'includeSuspended',
          contextName: 'userScope',
          setters: [{ typeName: 'ModerationQueue', selectionSet: 'includeSuspended' }],
        },
        {
          typeName: 'User',
          fieldName: 'digest',
          argumentName: 'includeSuspended',
          contextName: 'userScope',
          setters: [{ typeName: 'ModerationQueue', selectionSet: 'includeSuspended' }],
        },
      ],
    });
    expect(json.engineConfig.fieldConfigurations[1]).toStrictEqual({
      typeName: 'User',
      fieldName: 'profile',
      argumentsConfiguration: [{ name: 'includeSuspended', sourceType: 'FROM_CONTEXT' }],
    });
  });

  test('that a config without contextual arguments has no contextual argument configuration', () => {
    const routerConfig = composeAndBuildRouterConfig(
      new Map([
        ['moderation', moderationSDL],
        ['users', usersWithoutContextsSDL],
      ]),
    );
    const json = toJsonString(RouterConfigSchema, routerConfig);
    expect(json).not.toContain('contextualArgumentConfiguration');
    expect(json).not.toContain('FROM_CONTEXT');
    for (const datasourceConfiguration of routerConfig.engineConfig!.datasourceConfigurations) {
      expect(datasourceConfiguration.contextualArgumentConfiguration).toBeUndefined();
    }
  });
});

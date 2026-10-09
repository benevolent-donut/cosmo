import { describe, expect, test } from 'vitest';
import {
  type ConfigurationData,
  contextualArgumentRouterVersionWarning,
  type FieldConfiguration,
  newContractTagOptionsFromArrays,
  partiallyContextualArgumentWarning,
  ROUTER_COMPATIBILITY_VERSION_ONE,
  type TypeName,
} from '../../../src';
import {
  createSubgraph,
  federateSubgraphsSuccess,
  federateSubgraphsWithContractsSuccess,
  normalizeString,
  schemaToSortedNormalizedString,
} from '../../utils/utils';
import { SCHEMA_QUERY_DEFINITION } from '../utils/utils';

describe('@context and @fromContext configuration tests', () => {
  test('that the motivating fixture emits the setter of the contextual argument and hides the argument', () => {
    const {
      federatedGraphClientSchema,
      federatedGraphSchema,
      fieldConfigurations,
      subgraphConfigBySubgraphName,
      warnings,
    } = federateSubgraphsSuccess([moderation, publicSubgraph, users], ROUTER_COMPATIBILITY_VERSION_ONE);
    const schema = `
      ${SCHEMA_QUERY_DEFINITION}

      type ModerationQueue {
        flaggedUsers: [User!]!
        id: ID!
        includeSuspended: Boolean!
      }

      type Post {
        author: User!
        id: ID!
      }

      type Profile {
        displayName: String!
      }

      type Query {
        moderationQueue(id: ID!): ModerationQueue
        post(id: ID!): Post
      }

      type User {
        id: ID!
        profile: Profile
      }
    `;
    expect(schemaToSortedNormalizedString(federatedGraphSchema)).toBe(normalizeString(schema));
    expect(schemaToSortedNormalizedString(federatedGraphClientSchema)).toBe(normalizeString(schema));
    expect(fieldConfigurations).toStrictEqual([
      { argumentNames: ['id'], fieldName: 'moderationQueue', typeName: 'Query' },
      { argumentNames: ['id'], fieldName: 'post', typeName: 'Query' },
      { argumentNames: [], contextualArgumentNames: ['includeSuspended'], fieldName: 'profile', typeName: 'User' },
    ] satisfies Array<FieldConfiguration>);
    expect(subgraphConfigBySubgraphName.get('moderation')!.configurationDataByTypeName).toStrictEqual(
      new Map<TypeName, ConfigurationData>([
        ['Query', { fieldNames: new Set(['moderationQueue']), isRootNode: true, typeName: 'Query' }],
        [
          'ModerationQueue',
          {
            fieldNames: new Set(['id', 'includeSuspended', 'flaggedUsers']),
            isRootNode: true,
            keys: [{ fieldName: '', selectionSet: 'id' }],
            typeName: 'ModerationQueue',
          },
        ],
        [
          'User',
          {
            fieldNames: new Set(['id']),
            isRootNode: true,
            keys: [{ disableEntityResolver: true, fieldName: '', selectionSet: 'id' }],
            typeName: 'User',
          },
        ],
      ]),
    );
    expect(subgraphConfigBySubgraphName.get('public')!.configurationDataByTypeName).toStrictEqual(
      new Map<TypeName, ConfigurationData>([
        ['Query', { fieldNames: new Set(['post']), isRootNode: true, typeName: 'Query' }],
        [
          'Post',
          {
            fieldNames: new Set(['id', 'author']),
            isRootNode: true,
            keys: [{ fieldName: '', selectionSet: 'id' }],
            typeName: 'Post',
          },
        ],
        [
          'User',
          {
            fieldNames: new Set(['id']),
            isRootNode: true,
            keys: [{ disableEntityResolver: true, fieldName: '', selectionSet: 'id' }],
            typeName: 'User',
          },
        ],
      ]),
    );
    expect(subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName).toStrictEqual(
      new Map<TypeName, ConfigurationData>([
        [
          'ModerationQueue',
          {
            externalFieldNames: new Set(['includeSuspended']),
            fieldNames: new Set(['id']),
            isRootNode: true,
            keys: [{ fieldName: '', selectionSet: 'id' }],
            typeName: 'ModerationQueue',
          },
        ],
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
            ],
            fieldNames: new Set(['id', 'profile']),
            isRootNode: true,
            keys: [{ fieldName: '', selectionSet: 'id' }],
            typeName: 'User',
          },
        ],
        ['Profile', { fieldNames: new Set(['displayName']), isRootNode: false, typeName: 'Profile' }],
      ]),
    );
    expect(warnings).toStrictEqual([
      contextualArgumentRouterVersionWarning({
        argumentCoords: ['User.profile(includeSuspended: ...)'],
        subgraphName: 'users',
      }),
    ]);
  });

  test('that the parity fixture emits a setter for each type that sets the context', () => {
    const { federatedGraphClientSchema, federatedGraphSchema, subgraphConfigBySubgraphName, warnings } =
      federateSubgraphsSuccess(
        [moderation, publicWithPostSetter, usersWithPostSetter],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
    const schema = `
      ${SCHEMA_QUERY_DEFINITION}

      type ModerationQueue {
        flaggedUsers: [User!]!
        id: ID!
        includeSuspended: Boolean!
      }

      type Post {
        author: User!
        id: ID!
        includeSuspended: Boolean
      }

      type Profile {
        displayName: String!
      }

      type Query {
        moderationQueue(id: ID!): ModerationQueue
        post(id: ID!): Post
      }

      type User {
        id: ID!
        profile: Profile
      }
    `;
    expect(schemaToSortedNormalizedString(federatedGraphSchema)).toBe(normalizeString(schema));
    expect(schemaToSortedNormalizedString(federatedGraphClientSchema)).toBe(normalizeString(schema));
    expect(subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName.get('User')).toStrictEqual({
      contextualArguments: [
        {
          argumentName: 'includeSuspended',
          contextName: 'userScope',
          fieldName: 'profile',
          setters: [
            { selectionSet: 'includeSuspended', typeName: 'ModerationQueue' },
            { selectionSet: 'includeSuspended', typeName: 'Post' },
          ],
        },
      ],
      fieldNames: new Set(['id', 'profile']),
      isRootNode: true,
      keys: [{ fieldName: '', selectionSet: 'id' }],
      typeName: 'User',
    } satisfies ConfigurationData);
    expect(warnings).toStrictEqual([
      contextualArgumentRouterVersionWarning({
        argumentCoords: ['User.profile(includeSuspended: ...)'],
        subgraphName: 'users',
      }),
    ]);
  });

  test('that an Interface setter is expanded to the implementations of the federated graph', () => {
    const { subgraphConfigBySubgraphName } = federateSubgraphsSuccess(
      [
        queues,
        createSubgraph(
          'users',
          `
            interface Queue @context(name: "queueScope") {
              id: ID!
              includeSuspended: Boolean!
            }

            type User @key(fields: "id") {
              id: ID!
              queueView(includeSuspended: Boolean @fromContext(field: "$queueScope { includeSuspended }")): String
            }
          `,
        ),
      ],
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    expect(
      subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName.get('User')!.contextualArguments,
    ).toStrictEqual([
      {
        argumentName: 'includeSuspended',
        contextName: 'queueScope',
        fieldName: 'queueView',
        setters: [
          { selectionSet: 'includeSuspended', typeName: 'ModerationQueue' },
          { selectionSet: 'includeSuspended', typeName: 'AppealQueue' },
        ],
      },
    ]);
  });

  test('that a Union setter emits an empty selection set for a member without a type condition', () => {
    const { subgraphConfigBySubgraphName } = federateSubgraphsSuccess(
      [
        queues,
        createSubgraph(
          'users',
          `
            union Scope @context(name: "scope") = ModerationQueue | AppealQueue | Team

            type ModerationQueue @key(fields: "id") {
              id: ID!
              includeSuspended: Boolean! @external
            }

            type AppealQueue @key(fields: "id") {
              id: ID!
              showSuspended: Boolean @external
            }

            type Team @key(fields: "id") {
              id: ID!
            }

            type User @key(fields: "id") {
              id: ID!
              scopeView(
                show: Boolean
                  @fromContext(
                    field: "$scope ... on ModerationQueue { includeSuspended } ... on AppealQueue { showSuspended }"
                  )
              ): String
            }
          `,
        ),
      ],
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    expect(
      subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName.get('User')!.contextualArguments,
    ).toStrictEqual([
      {
        argumentName: 'show',
        contextName: 'scope',
        fieldName: 'scopeView',
        setters: [
          { selectionSet: 'includeSuspended', typeName: 'ModerationQueue' },
          { selectionSet: 'showSuspended', typeName: 'AppealQueue' },
          { selectionSet: '', typeName: 'Team' },
        ],
      },
    ]);
  });

  test('that nested and list selections are emitted as normalized field sets', () => {
    const { subgraphConfigBySubgraphName } = federateSubgraphsSuccess(
      [
        queues,
        createSubgraph(
          'users',
          `
            type ModerationQueue @key(fields: "id") @context(name: "peerScope") {
              id: ID!
              flaggedUsers: [User!]! @external
              owner: Owner! @external
            }

            type Owner {
              id: ID! @shareable
            }

            type User @key(fields: "id") {
              id: ID!
              owner(id: ID @fromContext(field: "$peerScope {owner{id}}")): String
              peers(ids: [ID] @fromContext(field: "$peerScope { flaggedUsers { id } }")): String
            }
          `,
        ),
      ],
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    expect(
      subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName.get('User')!.contextualArguments,
    ).toStrictEqual([
      {
        argumentName: 'id',
        contextName: 'peerScope',
        fieldName: 'owner',
        setters: [{ selectionSet: 'owner { id }', typeName: 'ModerationQueue' }],
      },
      {
        argumentName: 'ids',
        contextName: 'peerScope',
        fieldName: 'peers',
        setters: [{ selectionSet: 'flaggedUsers { id }', typeName: 'ModerationQueue' }],
      },
    ]);
  });

  test('that a renamed Query root type is emitted as the setter type Query', () => {
    const { fieldConfigurations, subgraphConfigBySubgraphName } = federateSubgraphsSuccess(
      [
        createSubgraph(
          'users',
          `
            schema {
              query: RootQuery
            }

            type RootQuery @context(name: "viewer") {
              users: [User!]!
              viewerIncludeSuspended: Boolean
            }

            type User @key(fields: "id") {
              id: ID!
              viewerView(includeSuspended: Boolean @fromContext(field: "$viewer { viewerIncludeSuspended }")): String
            }
          `,
        ),
      ],
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    expect(
      subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName.get('User')!.contextualArguments,
    ).toStrictEqual([
      {
        argumentName: 'includeSuspended',
        contextName: 'viewer',
        fieldName: 'viewerView',
        setters: [{ selectionSet: 'viewerIncludeSuspended', typeName: 'Query' }],
      },
    ]);
    expect(fieldConfigurations).toStrictEqual([
      { argumentNames: [], contextualArgumentNames: ['includeSuspended'], fieldName: 'viewerView', typeName: 'User' },
    ] satisfies Array<FieldConfiguration>);
  });

  test('that a field configuration lists regular arguments and contextual arguments separately', () => {
    const { fieldConfigurations, warnings } = federateSubgraphsSuccess(
      [
        moderation,
        createSubgraph(
          'users',
          `
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              flaggedUsers: [User!]! @external
            }

            type User @key(fields: "id") {
              id: ID!
              digest(
                locale: String
                includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")
                ids: [ID] @fromContext(field: "$userScope { flaggedUsers { id } }")
              ): String
            }
          `,
        ),
      ],
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    expect(fieldConfigurations).toStrictEqual([
      { argumentNames: ['id'], fieldName: 'moderationQueue', typeName: 'Query' },
      {
        argumentNames: ['locale'],
        contextualArgumentNames: ['includeSuspended', 'ids'],
        fieldName: 'digest',
        typeName: 'User',
      },
    ] satisfies Array<FieldConfiguration>);
    expect(warnings).toStrictEqual([
      contextualArgumentRouterVersionWarning({
        argumentCoords: ['User.digest(includeSuspended: ...)', 'User.digest(ids: ...)'],
        subgraphName: 'users',
      }),
    ]);
  });

  test('that an argument that is contextual in one subgraph is emitted for that subgraph only', () => {
    const { fieldConfigurations, subgraphConfigBySubgraphName, warnings } = federateSubgraphsSuccess(
      [
        createSubgraph(
          'moderation',
          `
            type Query {
              moderationQueue(id: ID!): ModerationQueue
            }

            type ModerationQueue @key(fields: "id") {
              id: ID!
              includeSuspended: Boolean!
              flaggedUsers: [User!]!
            }

            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean): Profile @shareable
            }

            type Profile {
              displayName: String! @shareable
            }
          `,
        ),
        createSubgraph(
          'users',
          `
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }

            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
                @shareable
            }

            type Profile {
              displayName: String! @shareable
            }
          `,
        ),
      ],
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    expect(fieldConfigurations).toStrictEqual([
      { argumentNames: ['id'], fieldName: 'moderationQueue', typeName: 'Query' },
      { argumentNames: [], contextualArgumentNames: ['includeSuspended'], fieldName: 'profile', typeName: 'User' },
    ] satisfies Array<FieldConfiguration>);
    expect(subgraphConfigBySubgraphName.get('moderation')!.configurationDataByTypeName.get('User')).toStrictEqual({
      fieldNames: new Set(['id', 'profile']),
      isRootNode: true,
      keys: [{ fieldName: '', selectionSet: 'id' }],
      typeName: 'User',
    } satisfies ConfigurationData);
    expect(
      subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName.get('User')!.contextualArguments,
    ).toStrictEqual([
      {
        argumentName: 'includeSuspended',
        contextName: 'userScope',
        fieldName: 'profile',
        setters: [{ selectionSet: 'includeSuspended', typeName: 'ModerationQueue' }],
      },
    ]);
    expect(warnings).toStrictEqual([
      contextualArgumentRouterVersionWarning({
        argumentCoords: ['User.profile(includeSuspended: ...)'],
        subgraphName: 'users',
      }),
      partiallyContextualArgumentWarning({
        coords: 'User.profile(includeSuspended: ...)',
        fromContextSubgraphNames: ['users'],
        subgraphName: 'moderation',
      }),
    ]);
  });

  test('that a field that another subgraph overrides emits no contextual argument configuration', () => {
    const { fieldConfigurations, subgraphConfigBySubgraphName, warnings } = federateSubgraphsSuccess(
      [
        createSubgraph(
          'moderation',
          `
            type Query {
              moderationQueue(id: ID!): ModerationQueue
            }

            type ModerationQueue @key(fields: "id") {
              id: ID!
              includeSuspended: Boolean!
              flaggedUsers: [User!]!
            }

            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean): Profile @override(from: "users")
            }

            type Profile {
              displayName: String! @shareable
            }
          `,
        ),
        createSubgraph(
          'users',
          `
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }

            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }

            type Profile {
              displayName: String! @shareable
            }
          `,
        ),
      ],
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    expect(fieldConfigurations).toStrictEqual([
      { argumentNames: ['id'], fieldName: 'moderationQueue', typeName: 'Query' },
    ] satisfies Array<FieldConfiguration>);
    expect(subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName.get('User')).toStrictEqual({
      fieldNames: new Set(['id']),
      isRootNode: true,
      keys: [{ fieldName: '', selectionSet: 'id' }],
      typeName: 'User',
    } satisfies ConfigurationData);
    expect(warnings).toStrictEqual([
      partiallyContextualArgumentWarning({
        coords: 'User.profile(includeSuspended: ...)',
        fromContextSubgraphNames: ['users'],
        subgraphName: 'moderation',
      }),
    ]);
  });

  test('that an unreferenced context emits no contextual argument configuration', () => {
    const { fieldConfigurations, subgraphConfigBySubgraphName, warnings } = federateSubgraphsSuccess(
      [
        createSubgraph(
          'moderation',
          `
            type Query {
              moderationQueue(id: ID!): ModerationQueue
            }

            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean!
            }
          `,
        ),
      ],
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    expect(fieldConfigurations).toStrictEqual([
      { argumentNames: ['id'], fieldName: 'moderationQueue', typeName: 'Query' },
    ] satisfies Array<FieldConfiguration>);
    expect(subgraphConfigBySubgraphName.get('moderation')!.configurationDataByTypeName).toStrictEqual(
      new Map<TypeName, ConfigurationData>([
        ['Query', { fieldNames: new Set(['moderationQueue']), isRootNode: true, typeName: 'Query' }],
        [
          'ModerationQueue',
          {
            fieldNames: new Set(['id', 'includeSuspended']),
            isRootNode: true,
            keys: [{ fieldName: '', selectionSet: 'id' }],
            typeName: 'ModerationQueue',
          },
        ],
      ]),
    );
    expect(warnings).toStrictEqual([]);
  });

  test('that a contract emits the contextual argument configuration of its source graph', () => {
    const { federationResultByContractName } = federateSubgraphsWithContractsSuccess(
      [
        createSubgraph(
          'moderation',
          `
            type Query {
              moderationQueue(id: ID!): ModerationQueue
              reports: [String!]! @tag(name: "internal")
            }

            type ModerationQueue @key(fields: "id") {
              id: ID!
              includeSuspended: Boolean!
              flaggedUsers: [User!]!
            }

            type User @key(fields: "id", resolvable: false) {
              id: ID!
            }
          `,
        ),
        users,
      ],
      new Map([['contract', newContractTagOptionsFromArrays(['internal'], [])]]),
      ROUTER_COMPATIBILITY_VERSION_ONE,
    );
    const contract = federationResultByContractName.get('contract');
    expect(contract?.success).toBe(true);
    if (!contract?.success) {
      return;
    }
    expect(contract.fieldConfigurations).toStrictEqual([
      { argumentNames: ['id'], fieldName: 'moderationQueue', typeName: 'Query' },
      { argumentNames: [], contextualArgumentNames: ['includeSuspended'], fieldName: 'profile', typeName: 'User' },
    ] satisfies Array<FieldConfiguration>);
    expect(
      contract.subgraphConfigBySubgraphName.get('users')!.configurationDataByTypeName.get('User')!.contextualArguments,
    ).toStrictEqual([
      {
        argumentName: 'includeSuspended',
        contextName: 'userScope',
        fieldName: 'profile',
        setters: [{ selectionSet: 'includeSuspended', typeName: 'ModerationQueue' }],
      },
    ]);
    expect(contract.warnings).toStrictEqual([
      contextualArgumentRouterVersionWarning({
        argumentCoords: ['User.profile(includeSuspended: ...)'],
        subgraphName: 'users',
      }),
    ]);
  });
});

const moderation = createSubgraph(
  'moderation',
  `
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])

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
  `,
);

const publicSubgraph = createSubgraph(
  'public',
  `
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])

    type Query {
      post(id: ID!): Post
    }

    type Post @key(fields: "id") {
      id: ID!
      author: User!
    }

    type User @key(fields: "id", resolvable: false) {
      id: ID!
    }
  `,
);

const users = createSubgraph(
  'users',
  `
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
      import: ["@key", "@external", "@context", "@fromContext"])

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
  `,
);

const publicWithPostSetter = createSubgraph(
  'public',
  `
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])

    type Query {
      post(id: ID!): Post
    }

    type Post @key(fields: "id") {
      id: ID!
      author: User!
      includeSuspended: Boolean
    }

    type User @key(fields: "id", resolvable: false) {
      id: ID!
    }
  `,
);

const usersWithPostSetter = createSubgraph(
  'users',
  `
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
      import: ["@key", "@external", "@context", "@fromContext"])

    type ModerationQueue @key(fields: "id") @context(name: "userScope") {
      id: ID!
      includeSuspended: Boolean! @external
    }

    type Post @key(fields: "id") @context(name: "userScope") {
      id: ID!
      includeSuspended: Boolean @external
    }

    type User @key(fields: "id") {
      id: ID!
      profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
    }

    type Profile {
      displayName: String!
    }
  `,
);

const queues = createSubgraph(
  'moderation',
  `
    type Query {
      queues: [Queue!]!
      scopes: [Scope!]!
    }

    interface Queue {
      id: ID!
      includeSuspended: Boolean!
      flaggedUsers: [User!]!
    }

    type ModerationQueue implements Queue @key(fields: "id") {
      id: ID!
      includeSuspended: Boolean!
      flaggedUsers: [User!]!
      owner: Owner!
    }

    type AppealQueue implements Queue @key(fields: "id") {
      id: ID!
      includeSuspended: Boolean!
      showSuspended: Boolean
      flaggedUsers: [User!]!
    }

    type Team @key(fields: "id") {
      id: ID!
      members: [User!]!
    }

    type Owner {
      id: ID! @shareable
    }

    union Scope = ModerationQueue | AppealQueue | Team

    type User @key(fields: "id", resolvable: false) {
      id: ID!
    }
  `,
);

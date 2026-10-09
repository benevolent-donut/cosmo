import { describe, expect, test } from 'vitest';
import { Kind, OperationTypeNode } from 'graphql';
import {
  aliasInContextSelectionErrorMessage,
  CONTEXT,
  contextFragmentWithoutTypeConditionErrorMessage,
  contextNameUnderscoreErrorMessage,
  type ContextSelectionData,
  contextualArgumentWithoutLocalKeyErrorMessage,
  contextualArgumentWithoutResolvableKeyErrorMessage,
  directiveInContextSelectionErrorMessage,
  duplicateContextTypeConditionErrorMessage,
  externalEntityExtensionKeyFieldWarning,
  FIRST_ORDINAL,
  fragmentSpreadInContextSelectionErrorMessage,
  FROM_CONTEXT,
  fromContextDefaultValueErrorMessage,
  fromContextOnDirectiveDefinitionArgumentErrorMessage,
  fromContextOnInterfaceFieldErrorMessage,
  fromContextOnInterfaceObjectFieldErrorMessage,
  Graph,
  type ImplementationErrors,
  incompatibleContextSelectionTypeErrorMessage,
  INTERFACE,
  interfaceObjectInContextSelectionErrorMessage,
  invalidArgumentValueInFieldSetErrorMessage,
  invalidContextNameErrorMessage,
  invalidContextSelectionForSetterErrorMessage,
  invalidDirectiveError,
  invalidDirectiveLocationErrorMessage,
  invalidExternalDirectiveError,
  type InvalidFieldImplementation,
  invalidInterfaceImplementationError,
  invalidRepeatedDirectiveErrorMessage,
  invalidSelectionOnUnionErrorMessage,
  invalidSelectionSetDefinitionErrorMessage,
  invalidSelectionSetErrorMessage,
  mixedContextSelectionErrorMessage,
  multipleContextSelectionDefinitionsErrorMessage,
  multipleContextSelectionFieldsErrorMessage,
  multipleContextSelectionLeavesErrorMessage,
  NAME,
  noApplicableContextTypeConditionErrorMessage,
  nonObjectContextTypeConditionErrorMessage,
  numberToOrdinal,
  OBJECT,
  parse,
  rootOperationTypeContextErrorMessage,
  ROUTER_COMPATIBILITY_VERSION_ONE,
  SCALAR,
  subgraphValidationError,
  type TypeName,
  undefinedContextErrorMessage,
  undefinedContextReferenceErrorMessage,
  undefinedFieldInFieldSetErrorMessage,
  undefinedRequiredArgumentInFieldSetErrorMessage,
  undefinedRequiredArgumentsErrorMessage,
  unexpectedArgumentErrorMessage,
  unknownContextTypeConditionErrorMessage,
  unparsableContextSelectionErrorMessage,
  unresolvableContextFragmentErrorMessage,
  unsupportedDirectiveWarning,
  unusedContextTypeConditionErrorMessage,
  variableInContextSelectionErrorMessage,
} from '../../../src';
import { NormalizationFactory } from '../../../src/v1/normalization/normalization-factory';
import {
  createSubgraph,
  federateSubgraphsFailure,
  federateSubgraphsSuccess,
  normalizeString,
  normalizeSubgraphFailure,
  schemaToSortedNormalizedString,
} from '../../utils/utils';
import { SCHEMA_QUERY_DEFINITION } from '../utils/utils';

describe('@context and @fromContext validation tests', () => {
  describe('context names', () => {
    test('CONTEXT_NAME_INVALID: returns an error if a context name contains an underscore', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "user_scope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$user_scope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'ModerationQueue', FIRST_ORDINAL, [
          contextNameUnderscoreErrorMessage('user_scope'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NAME_INVALID: returns an error if a context name starts with an underscore', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "_userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$_userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'ModerationQueue', FIRST_ORDINAL, [
          contextNameUnderscoreErrorMessage('_userScope'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NAME_INVALID: returns an error for the second instance of @context if its name contains an underscore', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") @context(name: "queue_scope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'ModerationQueue', numberToOrdinal(2), [
          contextNameUnderscoreErrorMessage('queue_scope'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NAME_INVALID: returns an error if an unreferenced context name contains a hyphen', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") @context(name: "user-scope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'ModerationQueue', numberToOrdinal(2), [
          invalidContextNameErrorMessage('user-scope'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NAME_INVALID: returns an error if a referenced context name contains a hyphen', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "user-scope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$user-scope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'ModerationQueue', FIRST_ORDINAL, [
          invalidContextNameErrorMessage('user-scope'),
        ]),
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          undefinedContextErrorMessage('user'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NAME_INVALID: returns an error if a context name starts with a digit', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "1userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$1userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'ModerationQueue', FIRST_ORDINAL, [
          invalidContextNameErrorMessage('1userScope'),
        ]),
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          undefinedContextReferenceErrorMessage('$1userScope { includeSuspended }'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NAME_INVALID: returns an error if a context name is empty', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'ModerationQueue', FIRST_ORDINAL, [invalidContextNameErrorMessage('')]),
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          undefinedContextErrorMessage('userScope'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });
  });

  describe('@fromContext locations', () => {
    test('CONTEXT_NOT_SET: returns an error if @fromContext is defined on an argument of a directive definition', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            directive @scoped(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")) on FIELD_DEFINITION
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, '@scoped(includeSuspended: ...)', FIRST_ORDINAL, [
          fromContextOnDirectiveDefinitionArgumentErrorMessage,
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NOT_SET: returns an error if @fromContext is defined on an argument of an Interface field without an implementation', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            interface Profiled { profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'Profiled.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          fromContextOnInterfaceFieldErrorMessage('Profiled.profile'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NOT_SET: returns an error if @fromContext is defined on an argument of an Interface field that an implementation does not define', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            type Moderator implements Profiled { id: ID! }
            interface Profiled { profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidInterfaceImplementationError(
          'Moderator',
          OBJECT,
          new Map<string, ImplementationErrors>([
            [
              'Profiled',
              {
                invalidFieldImplementations: new Map<string, InvalidFieldImplementation>(),
                unimplementedFields: ['profile'],
              },
            ],
          ]),
        ),
        invalidDirectiveError(FROM_CONTEXT, 'Profiled.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          fromContextOnInterfaceFieldErrorMessage('Profiled.profile'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NOT_SET: returns an error if @fromContext is defined on the implementation of an Interface field', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            interface Profiled { profile(includeSuspended: Boolean): Profile }
            type User implements Profiled @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      const implementationErrors: ImplementationErrors = {
        invalidFieldImplementations: new Map<string, InvalidFieldImplementation>([
          [
            'profile',
            {
              implementationContextCoords: new Set<string>(['User.profile(includeSuspended: ...)']),
              interfaceContextCoords: new Set<string>(),
              invalidAdditionalArguments: new Set<string>(),
              invalidImplementedArguments: [],
              isInaccessible: false,
              originalResponseType: 'Profile',
              unimplementedArguments: new Set<string>(),
            },
          ],
        ]),
        unimplementedFields: [],
      };
      expect(errors).toStrictEqual([
        invalidInterfaceImplementationError(
          'User',
          OBJECT,
          new Map<string, ImplementationErrors>([['Profiled', implementationErrors]]),
        ),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NOT_SET: returns an error for each Interface if only the implementation field defines a contextual argument', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            interface Profiled { profile: Profile }
            interface Viewer { profile: Profile }
            type User implements Profiled & Viewer @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      const implementationErrors: ImplementationErrors = {
        invalidFieldImplementations: new Map<string, InvalidFieldImplementation>([
          [
            'profile',
            {
              implementationContextCoords: new Set<string>(['User.profile(includeSuspended: ...)']),
              interfaceContextCoords: new Set<string>(),
              invalidAdditionalArguments: new Set<string>(),
              invalidImplementedArguments: [],
              isInaccessible: false,
              originalResponseType: 'Profile',
              unimplementedArguments: new Set<string>(),
            },
          ],
        ]),
        unimplementedFields: [],
      };
      expect(errors).toStrictEqual([
        invalidInterfaceImplementationError(
          'User',
          OBJECT,
          new Map<string, ImplementationErrors>([
            ['Profiled', implementationErrors],
            ['Viewer', implementationErrors],
          ]),
        ),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NOT_SET: returns an error if an argument that defines @fromContext defines a default value', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean = false @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          fromContextDefaultValueErrorMessage,
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NOT_SET: returns an error if an argument that defines @fromContext defines a null default value', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean = null @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          fromContextDefaultValueErrorMessage,
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('returns an error if @fromContext is defined on an argument of a field of an @interfaceObject type', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext", "@interfaceObject"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") @interfaceObject {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          fromContextOnInterfaceObjectFieldErrorMessage('User'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });
  });

  describe('context references', () => {
    test('NO_CONTEXT_IN_SELECTION: returns an error if the reference does not start with "$"', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "{ includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          undefinedContextReferenceErrorMessage('{ includeSuspended }'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('NO_CONTEXT_IN_SELECTION: returns an error if the reference defines no selection', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          undefinedContextReferenceErrorMessage('$userScope'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('NO_CONTEXT_IN_SELECTION: returns an error if the reference defines no context name', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$ { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          undefinedContextReferenceErrorMessage('$ { includeSuspended }'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('NO_CONTEXT_IN_SELECTION: returns an error if @fromContext does not define the field argument', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          undefinedContextReferenceErrorMessage(),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NOT_SET: returns an error if the referenced context is never set', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$unknownScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          undefinedContextErrorMessage('unknownScope'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NOT_SET: returns an error if the referenced context is only set in another subgraph', () => {
      const { errors, warnings } = federateSubgraphsFailure(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@context"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        subgraphValidationError('users', [
          invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
            undefinedContextErrorMessage('userScope'),
          ]),
          invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'moderation' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });
  });

  describe('context selections', () => {
    test('CONTEXT_INVALID_SELECTION: returns an error if the selection selects several fields', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { id includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          multipleContextSelectionFieldsErrorMessage('{ id includeSuspended }'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a field selection is followed by an inline fragment', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope includeSuspended ... on ModerationQueue { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          multipleContextSelectionFieldsErrorMessage('includeSuspended ... on ModerationQueue { includeSuspended }'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if an inline fragment is followed by a field selection', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope ... on ModerationQueue { includeSuspended } id")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          mixedContextSelectionErrorMessage('... on ModerationQueue { includeSuspended } id'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if top-level inline fragments repeat a type condition', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope ... on ModerationQueue { includeSuspended } ... on ModerationQueue { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          duplicateContextTypeConditionErrorMessage({
            selection: '... on ModerationQueue { includeSuspended } ... on ModerationQueue { includeSuspended }',
            typeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a top-level inline fragment defines no type condition', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope ... { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          contextFragmentWithoutTypeConditionErrorMessage('... { includeSuspended }'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection defines a fragment spread', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope ...QueueFields")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          fragmentSpreadInContextSelectionErrorMessage('...QueueFields'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if an inline fragment body defines a fragment spread', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope ... on ModerationQueue { ...QueueFields }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          fragmentSpreadInContextSelectionErrorMessage('... on ModerationQueue { ...QueueFields }'),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection defines empty braces', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          unparsableContextSelectionErrorMessage({
            reason: 'Syntax Error: Expected Name, found "}".',
            selection: '{ }',
          }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection is only whitespace', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope   ")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          unparsableContextSelectionErrorMessage({ reason: 'Syntax Error: Expected Name, found "}".', selection: '' }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection defines two selection sets', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended } { id }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          unparsableContextSelectionErrorMessage({
            reason: multipleContextSelectionDefinitionsErrorMessage(2),
            selection: '{ includeSuspended } { id }',
          }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selected field is not defined in the subgraph', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidContextSelectionForSetterErrorMessage({
            contextName: 'userScope',
            fieldSetErrorMessage: undefinedFieldInFieldSetErrorMessage(
              '{ includeSuspended }',
              'ModerationQueue',
              'includeSuspended',
            ),
            selection: '{ includeSuspended }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selected field is not defined on a second setter type', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            type AppealQueue @key(fields: "id") @context(name: "userScope") { id: ID! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidContextSelectionForSetterErrorMessage({
            contextName: 'userScope',
            fieldSetErrorMessage: undefinedFieldInFieldSetErrorMessage(
              '{ includeSuspended }',
              'AppealQueue',
              'includeSuspended',
            ),
            selection: '{ includeSuspended }',
            setterTypeName: 'AppealQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a Union setter type is selected without a type condition', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            union QueueUnion @context(name: "userScope") = ModerationQueue
            type ModerationQueue @key(fields: "id") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidContextSelectionForSetterErrorMessage({
            contextName: 'userScope',
            fieldSetErrorMessage: invalidSelectionOnUnionErrorMessage('{ includeSuspended }', [], 'QueueUnion'),
            selection: '{ includeSuspended }',
            setterTypeName: 'QueueUnion',
          }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a composite field is selected without a selection set', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              flaggedUsers: [User!]! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: ID @fromContext(field: "$userScope { flaggedUsers }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidContextSelectionForSetterErrorMessage({
            contextName: 'userScope',
            fieldSetErrorMessage: invalidSelectionSetErrorMessage(
              '{ flaggedUsers }',
              ['ModerationQueue.flaggedUsers'],
              'User',
              OBJECT,
            ),
            selection: '{ flaggedUsers }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a leaf field defines a selection set', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended { value } }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidContextSelectionForSetterErrorMessage({
            contextName: 'userScope',
            fieldSetErrorMessage: invalidSelectionSetDefinitionErrorMessage(
              '{ includeSuspended { value } }',
              ['ModerationQueue.includeSuspended'],
              'Boolean',
              SCALAR,
            ),
            selection: '{ includeSuspended { value } }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection passes an unknown argument', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended(scope: 1) }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidContextSelectionForSetterErrorMessage({
            contextName: 'userScope',
            fieldSetErrorMessage: unexpectedArgumentErrorMessage(
              '{ includeSuspended(scope: 1) }',
              'ModerationQueue.includeSuspended',
              'scope',
            ),
            selection: '{ includeSuspended(scope: 1) }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection does not pass a required argument', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              flaggedCount(minSeverity: Int!): Int @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Int @fromContext(field: "$userScope { flaggedCount }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidContextSelectionForSetterErrorMessage({
            contextName: 'userScope',
            fieldSetErrorMessage: undefinedRequiredArgumentInFieldSetErrorMessage({
              argumentName: 'minSeverity',
              fieldCoords: 'ModerationQueue.flaggedCount',
              fieldSet: '{ flaggedCount }',
            }),
            selection: '{ flaggedCount }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection passes an invalid argument value', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              flaggedCount(minSeverity: Int!): Int @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Int @fromContext(field: "$userScope { flaggedCount(minSeverity: \\"x\\") }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidContextSelectionForSetterErrorMessage({
            contextName: 'userScope',
            fieldSetErrorMessage: invalidArgumentValueInFieldSetErrorMessage({
              argumentName: 'minSeverity',
              fieldCoords: 'ModerationQueue.flaggedCount',
              fieldSet: '{ flaggedCount(minSeverity: "x") }',
              typeString: 'Int!',
              value: '"x"',
            }),
            selection: '{ flaggedCount(minSeverity: "x") }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection uses a variable', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              flaggedCount(minSeverity: Int): Int! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              rank(count: Int @fromContext(field: "$userScope { flaggedCount(minSeverity: $sev) }")): Int
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.rank(count: ...)', FIRST_ORDINAL, [
          variableInContextSelectionErrorMessage({
            selection: '{ flaggedCount(minSeverity: $sev) }',
            variableName: 'sev',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection defines a custom directive', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended @traced }")): Profile
            }
            type Profile { displayName: String! }
            directive @traced on FIELD
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          directiveInContextSelectionErrorMessage({
            directiveName: 'traced',
            selection: '{ includeSuspended @traced }',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection defines @skip', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended @skip(if: false) }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          directiveInContextSelectionErrorMessage({
            directiveName: 'skip',
            selection: '{ includeSuspended @skip(if: false) }',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection defines @include', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended @include(if: true) }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          directiveInContextSelectionErrorMessage({
            directiveName: 'include',
            selection: '{ includeSuspended @include(if: true) }',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection defines an alias', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { inc: includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          aliasInContextSelectionErrorMessage({ alias: 'inc', selection: '{ inc: includeSuspended }' }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a nested selection defines an alias', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext", "@shareable"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              owner: Moderator! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              ownerNote(ownerId: ID @fromContext(field: "$userScope { owner { ownerId: id } }")): String
            }
            type Profile { displayName: String! }
            type Moderator @shareable { id: ID! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.ownerNote(ownerId: ...)', FIRST_ORDINAL, [
          aliasInContextSelectionErrorMessage({ alias: 'ownerId', selection: '{ owner { ownerId: id } }' }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a setter type is declared @interfaceObject', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext", "@interfaceObject"])
            type ModerationQueue @key(fields: "id") @interfaceObject @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          interfaceObjectInContextSelectionErrorMessage({
            selection: '{ includeSuspended }',
            typeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selection visits a type declared @interfaceObject', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext", "@interfaceObject"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              owner: Moderator! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: ID @fromContext(field: "$userScope { owner { id } }")): Profile
            }
            type Profile { displayName: String! }
            type Moderator @key(fields: "id") @interfaceObject { id: ID! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          interfaceObjectInContextSelectionErrorMessage({ selection: '{ owner { id } }', typeName: 'Moderator' }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selected type differs from the argument type', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: String @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          incompatibleContextSelectionTypeErrorMessage({
            argumentType: 'String',
            selection: '{ includeSuspended }',
            selectionType: 'Boolean',
            typeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the argument is a list and the selected field is not', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: [Boolean] @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          incompatibleContextSelectionTypeErrorMessage({
            argumentType: '[Boolean]',
            selection: '{ includeSuspended }',
            selectionType: 'Boolean',
            typeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the selected field of a second setter type has a different type', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            type AppealQueue @key(fields: "id") @context(name: "userScope") { id: ID! includeSuspended: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          incompatibleContextSelectionTypeErrorMessage({
            argumentType: 'Boolean',
            selection: '{ includeSuspended }',
            selectionType: 'String',
            typeName: 'AppealQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a list argument defines non-null items', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              labels: [String!]! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              labeled(labels: [String!] @fromContext(field: "$userScope { labels }")): Boolean
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.labeled(labels: ...)', FIRST_ORDINAL, [
          incompatibleContextSelectionTypeErrorMessage({
            argumentType: '[String!]',
            selection: '{ labels }',
            selectionType: '[String]',
            typeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the argument is an Input Object', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Scope @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
            input Scope { includeSuspended: Boolean }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          incompatibleContextSelectionTypeErrorMessage({
            argumentType: 'Scope',
            selection: '{ includeSuspended }',
            selectionType: 'Boolean',
            typeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a type condition does not exist', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope ... on Unknown { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          unknownContextTypeConditionErrorMessage({
            selection: '... on Unknown { includeSuspended }',
            typeName: 'Unknown',
          }),
          noApplicableContextTypeConditionErrorMessage({
            contextName: 'userScope',
            selection: '... on Unknown { includeSuspended }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a type condition is an Interface', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            interface Identified { id: ID! }
            type ModerationQueue implements Identified @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: ID @fromContext(field: "$userScope ... on Identified { id }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          nonObjectContextTypeConditionErrorMessage({
            selection: '... on Identified { id }',
            typeName: 'Identified',
            typeString: INTERFACE,
          }),
          noApplicableContextTypeConditionErrorMessage({
            contextName: 'userScope',
            selection: '... on Identified { id }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if no type condition applies to a setter type', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: String @fromContext(field: "$userScope ... on Profile { displayName }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          noApplicableContextTypeConditionErrorMessage({
            contextName: 'userScope',
            selection: '... on Profile { displayName }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
        invalidExternalDirectiveError('ModerationQueue.includeSuspended'),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if an inline fragment body defines an inline fragment', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope ... on ModerationQueue { ... on ModerationQueue { includeSuspended } }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          unresolvableContextFragmentErrorMessage({
            selection: '... on ModerationQueue { ... on ModerationQueue { includeSuspended } }',
            typeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if the type of an inline fragment body differs from the argument type', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: String @fromContext(field: "$userScope ... on ModerationQueue { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          incompatibleContextSelectionTypeErrorMessage({
            argumentType: 'String',
            selection: '... on ModerationQueue { includeSuspended }',
            selectionType: 'Boolean',
            typeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: returns an error if a type condition applies to no setter type', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope ... on ModerationQueue { includeSuspended } ... on Profile { displayName }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          unusedContextTypeConditionErrorMessage({
            contextName: 'userScope',
            selection: '... on ModerationQueue { includeSuspended } ... on Profile { displayName }',
            typeName: 'Profile',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('returns an error if a nested selection selects several fields', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext", "@shareable"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
              owner: Moderator! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              ownerNote(ownerId: ID @fromContext(field: "$userScope { owner { id altId } }")): String
            }
            type Profile { displayName: String! }
            type Moderator @shareable { id: ID! altId: ID! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.ownerNote(ownerId: ...)', FIRST_ORDINAL, [
          multipleContextSelectionLeavesErrorMessage({
            leafPaths: ['owner.id', 'owner.altId'],
            selection: '{ owner { id altId } }',
            setterTypeName: 'ModerationQueue',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: composes if an unreferenced context is set on an @interfaceObject type', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { queue(id: ID!): Queue }
              interface Queue @key(fields: "id") { id: ID! includeSuspended: Boolean! }
              type ModerationQueue implements Queue @key(fields: "id") { id: ID! includeSuspended: Boolean! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@interfaceObject", "@context"])
              type Queue @key(fields: "id") @interfaceObject @context(name: "userScope") { id: ID! extra: Int }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' })]);
    });

    test('CONTEXT_INVALID_SELECTION: composes if the selection passes a valid argument', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
                flaggedCount(minSeverity: Int): Int!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
                flaggedCount(minSeverity: Int): Int! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
                rank(count: Int @fromContext(field: "$userScope { flaggedCount(minSeverity: 3) }")): Int
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_INVALID_SELECTION: composes if the selection selects __typename', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
                queueKind(kind: String @fromContext(field: "$userScope { __typename }")): String
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });
  });

  describe('resolvable keys', () => {
    test('CONTEXT_NO_RESOLVABLE_KEY: returns an error if the type of a contextual argument field defines no key', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          contextualArgumentWithoutResolvableKeyErrorMessage('User'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NO_RESOLVABLE_KEY: returns an error if the type of a contextual argument field defines only unresolvable keys', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id", resolvable: false) {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          contextualArgumentWithoutResolvableKeyErrorMessage('User'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NO_RESOLVABLE_KEY: returns an error if a Query field defines a contextual argument', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type Query { me(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): User }
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'Query.me(includeSuspended: ...)', FIRST_ORDINAL, [
          contextualArgumentWithoutResolvableKeyErrorMessage('Query'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('CONTEXT_NO_RESOLVABLE_KEY: returns an error for each contextual argument of a field on a type without a resolvable key', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            type Holder {
              rank(
                includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")
                queueId: ID @fromContext(field: "$userScope { id }")
              ): Int
            }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'Holder.rank(includeSuspended: ...)', FIRST_ORDINAL, [
          contextualArgumentWithoutResolvableKeyErrorMessage('Holder'),
        ]),
        invalidDirectiveError(FROM_CONTEXT, 'Holder.rank(queueId: ...)', FIRST_ORDINAL, [
          contextualArgumentWithoutResolvableKeyErrorMessage('Holder'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('SATISFIABILITY_ERROR (NO_POST_REQUIRE_KEY): returns an error if every key of the type of a contextual argument field selects an @external field', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID! @external
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          contextualArgumentWithoutLocalKeyErrorMessage({ externalFieldCoords: ['User.id'], typeName: 'User' }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('SATISFIABILITY_ERROR (NO_POST_REQUIRE_KEY): composes if the only key field is an @external key field of an entity extension', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              extend type User @key(fields: "id") {
                id: ID! @external
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
        externalEntityExtensionKeyFieldWarning('User', 'id', ['User.id'], 'users'),
      ]);
    });
  });

  describe('root operation types', () => {
    test('returns an error if the Mutation type sets a referenced context', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            type Mutation @context(name: "userScope") { includeSuspended: Boolean! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'Mutation', FIRST_ORDINAL, [
          rootOperationTypeContextErrorMessage({ operationType: OperationTypeNode.MUTATION, typeName: 'Mutation' }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('returns an error if the Mutation type is the only setter type of a referenced context', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            type Mutation @context(name: "userScope") { includeSuspended: Boolean! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'Mutation', FIRST_ORDINAL, [
          rootOperationTypeContextErrorMessage({ operationType: OperationTypeNode.MUTATION, typeName: 'Mutation' }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('returns an error if a mutation root type declared in a schema definition sets a referenced context', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            schema { mutation: UserMutation }
            type UserMutation @context(name: "userScope") { includeSuspended: Boolean! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'UserMutation', FIRST_ORDINAL, [
          rootOperationTypeContextErrorMessage({ operationType: OperationTypeNode.MUTATION, typeName: 'UserMutation' }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('returns an error if the Subscription type sets a referenced context', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            type Subscription @context(name: "userScope") { includeSuspended: Boolean! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'Subscription', FIRST_ORDINAL, [
          rootOperationTypeContextErrorMessage({
            operationType: OperationTypeNode.SUBSCRIPTION,
            typeName: 'Subscription',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('returns an error if the Subscription type is the only setter type of a referenced context', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            type Subscription @context(name: "userScope") { includeSuspended: Boolean! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'Subscription', FIRST_ORDINAL, [
          rootOperationTypeContextErrorMessage({
            operationType: OperationTypeNode.SUBSCRIPTION,
            typeName: 'Subscription',
          }),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the Mutation type sets an unreferenced context', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type Mutation { reviewQueue(id: ID!): ModerationQueue }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
              type Mutation @context(name: "auditScope") { includeSuspended: Boolean! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });
  });

  describe('directive definitions and imports', () => {
    test('INVALID_GRAPHQL: returns an error if @context is defined on a field', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID! @context(name: "userScope2")
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'User.id', FIRST_ORDINAL, [
          invalidDirectiveLocationErrorMessage(CONTEXT, 'FIELD_DEFINITION'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('INVALID_GRAPHQL: returns an error if @fromContext is defined on an Input Object field', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
            type Profile { displayName: String! }
            input ProfileFilter { includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }") }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'ProfileFilter.includeSuspended', FIRST_ORDINAL, [
          invalidDirectiveLocationErrorMessage(FROM_CONTEXT, 'INPUT_FIELD_DEFINITION'),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('INVALID_GRAPHQL: returns an error if @fromContext is repeated on an argument', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
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
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }") @fromContext(field: "$userScope { id }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(FROM_CONTEXT, 'User.profile(includeSuspended: ...)', FIRST_ORDINAL, [
          invalidRepeatedDirectiveErrorMessage(FROM_CONTEXT),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('INVALID_GRAPHQL: returns an error if @context does not define a name', () => {
      const { errors, warnings } = normalizeSubgraphFailure(
        createSubgraph(
          'users',
          `
            extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
              import: ["@key", "@external", "@context", "@fromContext"])
            type ModerationQueue @key(fields: "id") @context(name: "userScope") @context {
              id: ID!
              includeSuspended: Boolean! @external
            }
            type User @key(fields: "id") {
              id: ID!
              profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            }
            type Profile { displayName: String! }
          `,
        ),
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(errors).toStrictEqual([
        invalidDirectiveError(CONTEXT, 'ModerationQueue', numberToOrdinal(2), [
          undefinedRequiredArgumentsErrorMessage(CONTEXT, [NAME], []),
        ]),
      ]);
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('INVALID_LINK_DIRECTIVE_USAGE: composes if @context and @fromContext are imported from federation v2.7', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.7",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('INVALID_GRAPHQL: composes if @context is not imported', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });
  });

  describe('composition', () => {
    test('motivating fixture composes', () => {
      const { federatedGraphClientSchema, warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! author: User! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
      expect(schemaToSortedNormalizedString(federatedGraphClientSchema)).toBe(
        normalizeString(`
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
        `),
      );
    });

    test('parity fixture composes', () => {
      const { federatedGraphClientSchema, warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! author: User! includeSuspended: Boolean }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
      expect(schemaToSortedNormalizedString(federatedGraphClientSchema)).toBe(
        normalizeString(`
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
        `),
      );
    });

    test('EXTERNAL_UNUSED: composes if an @external field is only read by a context selection', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('SATISFIABILITY_ERROR: composes if a root field of the consuming subgraph reaches the contextual argument without a setter', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type Query { user(id: ID!): User }
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('SATISFIABILITY_ERROR: composes if a field of a type that sets no context reaches the contextual argument', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue reporter(id: ID!): Reporter }
              type Reporter { id: ID! reported: [User!]! }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('SATISFIABILITY_ERROR: composes if a Mutation field reaches the contextual argument without a setter', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type Mutation { flagUser(id: ID!): User }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('SATISFIABILITY_ERROR: composes if the contextual argument is defined on a field of the setter type', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
                summary(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): String
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('SATISFIABILITY_ERROR: composes if the contextual argument is defined on a field of a setter type that is nested in itself', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
                parentQueue: ModerationQueue
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
                summary(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): String
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if two subgraphs set and read the same context name on the same type', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@external", "@context", "@fromContext"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id") { id: ID! badge(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): String }
              type ModerationQueue @key(fields: "id") @context(name: "userScope") { id: ID! includeSuspended: Boolean! @external }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a second subgraph that sorts last sets and reads the same context name on the same type', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
          createSubgraph(
            'zpublic',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@external", "@context", "@fromContext"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id") { id: ID! badge(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): String }
              type ModerationQueue @key(fields: "id") @context(name: "userScope") { id: ID! includeSuspended: Boolean! @external }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'zpublic' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'zpublic' }),
      ]);
    });

    test('composes if a second subgraph sets the same context name on the same type without reading it', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@context"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type ModerationQueue @key(fields: "id") @context(name: "userScope") { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a second subgraph that sorts last sets the same context name on the same type without reading it', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
          createSubgraph(
            'zpublic',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@context"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type ModerationQueue @key(fields: "id") @context(name: "userScope") { id: ID! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'zpublic' }),
      ]);
    });

    test('composes the multiple contexts example of the Apollo documentation with nullable arguments', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'docs',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@context", "@fromContext"])
              type Query {
                a: A!
                b: B!
                c: C!
              }
              type A @key(fields: "id") @context(name: "context1"){
                id: ID!
                field: String!
                someField: String!
                child: Child!
              }
              type B @key(fields: "id") @context(name: "context1"){
                id: ID!
                field: String!
                someField: String!
                child: Child!
              }
              type C @key(fields: "id") @context(name: "context1") {
                id: ID!
                field: String!
                someOtherField: String!
                child: Child!
              }
              type Child @key(fields: "id") {
                id: ID!
                prop1(
                  arg: String
                      @fromContext(field: "$context1 ... on A { someField } ... on B { someField } ... on C { someOtherField }")
                ): Int!
                prop2(
                  arg: String
                      @fromContext(field: "$context1 { field }")
                ): Int!
              }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'docs' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'docs' }),
      ]);
    });

    test('composes if the setter type is returned by a Mutation field', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type Mutation { reviewQueue(id: ID!): ModerationQueue }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the setter type is returned by a Subscription field', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type Subscription { queueUpdated(id: ID!): ModerationQueue! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a field defines a regular and a contextual argument', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
                profile(locale: String, includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a field defines @requires and a contextual argument', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id") { id: ID! handle: String }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext", "@requires"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile @requires(fields: "handle")
                handle: String @external
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if two subgraphs set distinct context names on the same type', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@external", "@context", "@fromContext"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id") { id: ID! badge(includeSuspended: Boolean @fromContext(field: "$publicScope { includeSuspended }")): String }
              type ModerationQueue @key(fields: "id") @context(name: "publicScope") { id: ID! includeSuspended: Boolean! @external }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if two subgraphs set the same context name on different types', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@context", "@fromContext"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") @context(name: "userScope") { id: ID! flagged: Boolean! comments: [Comment!]! }
              type Comment @key(fields: "id") { id: ID! text(flagged: Boolean @fromContext(field: "$userScope { flagged }")): String }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a shared field defines a contextual argument in both subgraphs', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@external", "@context", "@fromContext", "@shareable"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id") { id: ID! profile(includeSuspended: Boolean @fromContext(field: "$publicScope { includeSuspended }")): Profile @shareable }
              type Profile @shareable { displayName: String! }
              type ModerationQueue @key(fields: "id") @context(name: "publicScope") { id: ID! includeSuspended: Boolean! @external }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext", "@shareable"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile @shareable
              }
              type Profile @shareable { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'public' }),
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the selection selects an Enum field', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
                status: QueueStatus!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              enum QueueStatus { OPEN CLOSED }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
                status: QueueStatus! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
                standing(status: QueueStatus @fromContext(field: "$userScope { status }")): String
              }
              type Profile { displayName: String! }
              enum QueueStatus { OPEN CLOSED }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if an Interface sets the context', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              interface Queue @context(name: "userScope") { includeSuspended: Boolean! }
              type ModerationQueue implements Queue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a nested list is between the setter and the consumer', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [[User!]!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the selection selects a nested field through a list', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
                flaggedUsers: [User!]! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
                peers(ids: [ID] @fromContext(field: "$userScope { flaggedUsers { id } }")): Int
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the selection selects a list field', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
                labels: [String!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
                labels: [String!]! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
                labeled(labels: [String] @fromContext(field: "$userScope { labels }")): Boolean
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a type sets two contexts', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") @context(name: "queueScope") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
                queueBadge(queueId: ID @fromContext(field: "$queueScope { id }")): String
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if two setter types define the selected field', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue appealQueue(id: ID!): AppealQueue }
              type AppealQueue @key(fields: "id") { id: ID! includeSuspended: Boolean flaggedUsers: [User!]! }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
              type AppealQueue @key(fields: "id") @context(name: "userScope") { id: ID! includeSuspended: Boolean @external }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the selection defines a type condition for each setter type', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue appealQueue(id: ID!): AppealQueue }
              type AppealQueue @key(fields: "id") { id: ID! includeAll: Boolean! flaggedUsers: [User!]! }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
                profile(includeSuspended: Boolean @fromContext(field: "$userScope ... on ModerationQueue { includeSuspended } ... on AppealQueue { includeAll }")): Profile
              }
              type Profile { displayName: String! }
              type AppealQueue @key(fields: "id") @context(name: "userScope") { id: ID! includeAll: Boolean! @external }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the selection selects a nested entity key field', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
                owner: Moderator!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type Moderator @key(fields: "id") { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
                owner: Moderator! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
                ownerNote(ownerId: ID @fromContext(field: "$userScope { owner { id } }")): String
              }
              type Profile { displayName: String! }
              type Moderator @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the selection selects a nested field of a shareable type', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@shareable"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
                owner: Moderator!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type Moderator @shareable { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext", "@shareable"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
                owner: Moderator! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
                ownerNote(ownerId: ID @fromContext(field: "$userScope { owner { id } }")): String
              }
              type Profile { displayName: String! }
              type Moderator @shareable { id: ID! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if setter types of the same context are nested', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue org(id: ID!): Org }
              type Org @key(fields: "id") { id: ID! includeSuspended: Boolean! queues: [ModerationQueue!]! }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
              type Org @key(fields: "id") @context(name: "userScope") { id: ID! includeSuspended: Boolean! @external }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the Query type sets the context', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type Query @context(name: "userScope") { includeSuspended: Boolean! }
              type ModerationQueue @key(fields: "id") {
                id: ID!
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the selected field is shareable', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@shareable"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean! @shareable
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext", "@shareable"])
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @shareable
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the references use different formatting', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
                compact(v: Boolean @fromContext(field: "  $userScope{includeSuspended}  ")): Boolean
                multiline(v: Boolean @fromContext(field: """
                  $userScope {
                    includeSuspended
                  }
                """)): Boolean
                commented(v: Boolean @fromContext(field: "# leading comment\\n$userScope { includeSuspended }")): Boolean
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the setter, the selected field and the consumer are resolved by one subgraph', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the selected field defines @requires in its subgraph', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key", "@requires", "@external"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean! @requires(fields: "policy")
                policy: String @external
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
              type ModerationQueue @key(fields: "id") { id: ID! policy: String }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if the setter type defines an unresolvable key in the consuming subgraph', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              type ModerationQueue @key(fields: "id", resolvable: false) @context(name: "userScope") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if an abstract field is between the setter and the consumer', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
                flaggedItems: [Flagged!]!
              }
              interface Flagged { id: ID! }
              type User implements Flagged @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a field defines two contextual arguments', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
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
                profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }"), queueId: ID @fromContext(field: "$userScope { id }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });

    test('composes if a Union sets the context', () => {
      const { warnings } = federateSubgraphsSuccess(
        [
          createSubgraph(
            'moderation',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { moderationQueue(id: ID!): ModerationQueue }
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean!
                flaggedUsers: [User!]!
              }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'public',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8", import: ["@key"])
              type Query { post(id: ID!): Post }
              type Post @key(fields: "id") { id: ID! }
              type User @key(fields: "id", resolvable: false) { id: ID! }
            `,
          ),
          createSubgraph(
            'users',
            `
              extend schema @link(url: "https://specs.apollo.dev/federation/v2.8",
                import: ["@key", "@external", "@context", "@fromContext"])
              union QueueUnion @context(name: "userScope") = ModerationQueue
              type ModerationQueue @key(fields: "id") {
                id: ID!
                includeSuspended: Boolean! @external
              }
              type User @key(fields: "id") {
                id: ID!
                profile(includeSuspended: Boolean @fromContext(field: "$userScope ... on ModerationQueue { includeSuspended }")): Profile
              }
              type Profile { displayName: String! }
            `,
          ),
        ],
        ROUTER_COMPATIBILITY_VERSION_ONE,
      );
      expect(warnings).toStrictEqual([
        unsupportedDirectiveWarning({ directiveName: CONTEXT, subgraphName: 'users' }),
        unsupportedDirectiveWarning({ directiveName: FROM_CONTEXT, subgraphName: 'users' }),
      ]);
    });
  });
  describe('contextual argument records', () => {
    test('that each valid contextual argument is recorded with its selection for each setter type', () => {
      const normalizationFactory = new NormalizationFactory({ internalGraph: new Graph(), subgraphName: 'users' });
      const result = normalizationFactory.normalize(
        parse(`
          type ModerationQueue @key(fields: "id") @context(name: "userScope") {
            id: ID!
            includeSuspended: Boolean! @external
            flaggedUsers: [User!]! @external
          }

          type AppealQueue @key(fields: "id") {
            id: ID!
            includeAll: Boolean! @external
          }

          union Scope @context(name: "scope") = ModerationQueue | AppealQueue

          type User @key(fields: "id") {
            id: ID!
            profile(includeSuspended: Boolean @fromContext(field: "$userScope { includeSuspended }")): Profile
            peers(ids: [ID] @fromContext(field: "$userScope { flaggedUsers { id } }")): Int
            scopeView(
              show: Boolean
                @fromContext(field: "$scope ... on ModerationQueue { includeSuspended } ... on AppealQueue { includeAll }")
            ): String
          }

          type Profile {
            displayName: String!
          }
        `),
      );
      expect(result.success).toBe(true);
      expect(normalizationFactory.contextualArgumentDatas).toStrictEqual([
        {
          argumentName: 'includeSuspended',
          contextName: 'userScope',
          fieldName: 'profile',
          parentTypeName: 'User',
          selectionDataBySetterTypeName: new Map<TypeName, ContextSelectionData>([
            ['ModerationQueue', { fieldSet: 'includeSuspended', kind: Kind.FIELD }],
          ]),
        },
        {
          argumentName: 'ids',
          contextName: 'userScope',
          fieldName: 'peers',
          parentTypeName: 'User',
          selectionDataBySetterTypeName: new Map<TypeName, ContextSelectionData>([
            ['ModerationQueue', { fieldSet: 'flaggedUsers { id }', kind: Kind.FIELD }],
          ]),
        },
        {
          argumentName: 'show',
          contextName: 'scope',
          fieldName: 'scopeView',
          parentTypeName: 'User',
          selectionDataBySetterTypeName: new Map<TypeName, ContextSelectionData>([
            [
              'Scope',
              {
                fieldSetByTypeConditionName: new Map<TypeName, string>([
                  ['ModerationQueue', 'includeSuspended'],
                  ['AppealQueue', 'includeAll'],
                ]),
                kind: Kind.INLINE_FRAGMENT,
              },
            ],
          ]),
        },
      ]);
    });
  });
});

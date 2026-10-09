import {
  BREAK,
  type ConstDirectiveNode,
  type ConstValueNode,
  type DirectiveNode,
  type DocumentNode,
  type FieldNode,
  type InlineFragmentNode,
  Kind,
  type OperationDefinitionNode,
  OperationTypeNode,
  print,
  type SelectionSetNode,
  specifiedDirectives,
  type TypeNode,
  visit,
} from 'graphql';
import { printTypeNode } from '@graphql-tools/merge';
import { type NormalizationFactory } from './normalization-factory';
import { getNormalizedFieldSet } from './utils';
import { type ContextSelectionData, type ContextualArgumentData } from './types/types';
import {
  type CompositeOutputData,
  type FieldData,
  type InputValueData,
  type ObjectDefinitionData,
  type ParentDefinitionData,
} from '../../schema-building/types/types';
import {
  isParentDataCompositeOutputType,
  isTypeRequired,
  isTypeValidImplementation,
} from '../../schema-building/utils';
import { getTypeNodeNamedTypeName } from '../../schema-building/ast';
import { isObjectDefinitionData } from '../utils/utils';
import { BASE_SCALARS } from '../constants/constants';
import { isArgumentValueValid } from '../../validation/validation';
import { safeParse } from '../../ast/utils';
import {
  aliasInContextSelectionErrorMessage,
  contextFragmentWithoutTypeConditionErrorMessage,
  contextNameUnderscoreErrorMessage,
  contextualArgumentWithoutLocalKeyErrorMessage,
  contextualArgumentWithoutResolvableKeyErrorMessage,
  directiveInContextSelectionErrorMessage,
  duplicateContextTypeConditionErrorMessage,
  fragmentSpreadInContextSelectionErrorMessage,
  fromContextDefaultValueErrorMessage,
  fromContextOnDirectiveDefinitionArgumentErrorMessage,
  fromContextOnInterfaceFieldErrorMessage,
  fromContextOnInterfaceObjectFieldErrorMessage,
  incompatibleContextSelectionTypeErrorMessage,
  interfaceObjectInContextSelectionErrorMessage,
  invalidArgumentValueInFieldSetErrorMessage,
  invalidContextNameErrorMessage,
  invalidContextSelectionForSetterErrorMessage,
  invalidDirectiveError,
  invalidSelectionOnUnionErrorMessage,
  invalidSelectionSetDefinitionErrorMessage,
  invalidSelectionSetErrorMessage,
  mixedContextSelectionErrorMessage,
  multipleContextSelectionDefinitionsErrorMessage,
  multipleContextSelectionFieldsErrorMessage,
  multipleContextSelectionLeavesErrorMessage,
  noApplicableContextTypeConditionErrorMessage,
  nonObjectContextTypeConditionErrorMessage,
  rootOperationTypeContextErrorMessage,
  undefinedContextErrorMessage,
  undefinedContextReferenceErrorMessage,
  undefinedFieldInFieldSetErrorMessage,
  undefinedRequiredArgumentInFieldSetErrorMessage,
  unexpectedArgumentErrorMessage,
  unknownContextTypeConditionErrorMessage,
  unparsableContextSelectionErrorMessage,
  unresolvableContextFragmentErrorMessage,
  unusedContextTypeConditionErrorMessage,
  variableInContextSelectionErrorMessage,
} from '../../errors/errors';
import {
  CONTEXT,
  DEFER,
  FIELD,
  FIRST_ORDINAL,
  FROM_CONTEXT,
  INTERFACE_OBJECT,
  LITERAL_PERIOD,
  NAME,
  SCALAR,
  STREAM,
  STRING_SCALAR,
  TYPENAME,
} from '../../utils/string-constants';
import { getValueOrDefault, kindToNodeType, numberToOrdinal } from '../../utils/utils';
import { type ArgumentName, type DirectiveName, type TypeName } from '../../types/types';

type ContextReference = {
  contextName: string;
  selection: string;
};

type ContextSelectionParseResult = {
  operation?: OperationDefinitionNode;
  reason?: string;
};

type FromContextApplication = {
  coords: string;
  isRepeated: boolean;
  ordinal: string;
  argument?: ContextualArgument;
  reference?: ContextReference;
  selectionParseResult?: ContextSelectionParseResult;
  value?: string;
};

type ContextualArgument = {
  argumentData: InputValueData;
  fieldData: FieldData;
  parentData: CompositeOutputData;
};

type ValidateContextSelectionParams = {
  argumentData: InputValueData;
  contextName: string;
  errorMessages: Array<string>;
  fieldSet: string;
  nf: NormalizationFactory;
  operation: OperationDefinitionNode;
  setterTypeNames: Set<TypeName>;
};

type ResolveContextSelectionTypeParams = {
  errorMessages: Array<string>;
  fieldSet: string;
  interfaceObjectTypeNames: Set<TypeName>;
  nf: NormalizationFactory;
  typeName: TypeName;
  fragmentTypeName?: TypeName;
};

const EXECUTABLE_DIRECTIVE_NAMES = new Set<DirectiveName>([
  DEFER,
  STREAM,
  ...specifiedDirectives.map(({ name }) => name),
]);

export function validateContexts(nf: NormalizationFactory): Array<ContextualArgumentData> {
  const directiveDefinitionApplications = getDirectiveDefinitionFromContextApplications(nf);
  if (
    directiveDefinitionApplications.length < 1 &&
    !nf.referencedDirectiveNames.has(CONTEXT) &&
    !nf.referencedDirectiveNames.has(FROM_CONTEXT)
  ) {
    return [];
  }
  const applications = [...getFieldFromContextApplications(nf), ...directiveDefinitionApplications];
  const referencedContextNames = new Set<string>();
  for (const { reference } of applications) {
    if (reference) {
      referencedContextNames.add(reference.contextName);
    }
  }
  const setterTypeNamesByContextName = validateContextDirectives(nf, referencedContextNames);
  const contextualArgumentDatas: Array<ContextualArgumentData> = [];
  for (const application of applications) {
    const contextualArgumentData = validateFromContextApplication(nf, application, setterTypeNamesByContextName);
    if (contextualArgumentData) {
      contextualArgumentDatas.push(contextualArgumentData);
    }
  }
  for (const { reference, selectionParseResult } of applications) {
    const setterTypeNames = reference ? setterTypeNamesByContextName.get(reference.contextName) : undefined;
    if (!setterTypeNames || !selectionParseResult?.operation) {
      continue;
    }
    for (const setterTypeName of setterTypeNames) {
      markSelectionSetFields(nf, selectionParseResult.operation.selectionSet, getParentData(nf, setterTypeName));
    }
  }
  return contextualArgumentDatas;
}

function getParentData(nf: NormalizationFactory, typeName: TypeName): ParentDefinitionData {
  // Only type names that were already found in the parent data are passed.
  return nf.parentDefinitionDataByTypeName.get(typeName)!;
}

function getFieldFromContextApplications(nf: NormalizationFactory): Array<FromContextApplication> {
  const applications: Array<FromContextApplication> = [];
  for (const parentData of nf.parentDefinitionDataByTypeName.values()) {
    if (!isParentDataCompositeOutputType(parentData)) {
      continue;
    }
    for (const fieldData of parentData.fieldDataByName.values()) {
      for (const argumentData of fieldData.argumentDataByName.values()) {
        addFromContextApplications({
          applications,
          argument: { argumentData, fieldData, parentData },
          coords: argumentData.originalCoords,
          directivesByName: argumentData.directivesByName,
        });
      }
    }
  }
  return applications;
}

function getDirectiveDefinitionFromContextApplications(nf: NormalizationFactory): Array<FromContextApplication> {
  const applications: Array<FromContextApplication> = [];
  for (const directiveName of nf.customDirectiveDefinitionByName.keys()) {
    const definitionData = nf.directiveDefinitionDataByName.get(directiveName);
    if (!definitionData) {
      continue;
    }
    for (const [argumentName, argumentData] of definitionData.argumentDataByName) {
      addFromContextApplications({
        applications,
        coords: `@${directiveName}(${argumentName}: ...)`,
        directivesByName: argumentData.directivesByName,
      });
    }
  }
  return applications;
}

type AddFromContextApplicationsParams = {
  applications: Array<FromContextApplication>;
  coords: string;
  directivesByName: Map<string, Array<ConstDirectiveNode>>;
  argument?: ContextualArgument;
};

function addFromContextApplications({
  applications,
  argument,
  coords,
  directivesByName,
}: AddFromContextApplicationsParams) {
  const directiveNodes = directivesByName.get(FROM_CONTEXT);
  if (!directiveNodes) {
    return;
  }
  for (let i = 0; i < directiveNodes.length; i++) {
    const fieldArgumentNode = directiveNodes[i].arguments?.find((argumentNode) => argumentNode.name.value === FIELD);
    // Directive validation reports values of other kinds, but it does not visit directive definitions.
    if (
      argument &&
      fieldArgumentNode &&
      fieldArgumentNode.value.kind !== Kind.STRING &&
      fieldArgumentNode.value.kind !== Kind.NULL
    ) {
      continue;
    }
    const application: FromContextApplication = {
      argument,
      coords,
      isRepeated: directiveNodes.length > 1,
      ordinal: numberToOrdinal(i + 1),
    };
    if (fieldArgumentNode?.value.kind === Kind.STRING) {
      application.value = fieldArgumentNode.value.value;
      application.reference = parseContextReference(application.value);
    } else if (fieldArgumentNode) {
      application.value = print(fieldArgumentNode.value);
    }
    if (application.reference) {
      application.selectionParseResult = parseContextSelection(application.reference.selection.trim());
    }
    applications.push(application);
  }
}

function skipIgnoredTokens(value: string, index: number): number {
  while (index < value.length) {
    const character = value[index];
    if (character === '#') {
      while (index < value.length && value[index] !== '\n' && value[index] !== '\r') {
        index += 1;
      }
      continue;
    }
    if (character !== ' ' && character !== '\t' && character !== '\n' && character !== '\r' && character !== ',') {
      return index;
    }
    index += 1;
  }
  return index;
}

function parseContextReference(value: string): ContextReference | undefined {
  let index = skipIgnoredTokens(value, 0);
  if (value[index] !== '$') {
    return;
  }
  index = skipIgnoredTokens(value, index + 1);
  const contextName = /^[A-Za-z_][0-9A-Za-z_]*/.exec(value.slice(index))?.[0];
  if (!contextName) {
    return;
  }
  const selection = value.slice(index + contextName.length);
  if (!selection) {
    return;
  }
  return { contextName, selection };
}

function parseContextSelection(fieldSet: string): ContextSelectionParseResult {
  const { error, documentNode } = safeParse(fieldSet.startsWith('{') ? fieldSet : `{${fieldSet}}`);
  if (error || !documentNode) {
    return { reason: error?.message };
  }
  const definition = documentNode.definitions[0];
  if (documentNode.definitions.length > 1 || definition.kind !== Kind.OPERATION_DEFINITION) {
    return { reason: multipleContextSelectionDefinitionsErrorMessage(documentNode.definitions.length) };
  }
  return { operation: definition };
}

function getContextName(directiveNode: ConstDirectiveNode): string | undefined {
  const nameArgumentNode = directiveNode.arguments?.find((argumentNode) => argumentNode.name.value === NAME);
  if (nameArgumentNode?.value.kind !== Kind.STRING) {
    return;
  }
  return nameArgumentNode.value.value;
}

function validateContextDirectives(
  nf: NormalizationFactory,
  referencedContextNames: Set<string>,
): Map<string, Set<TypeName>> {
  const setterTypeNamesByContextName = new Map<string, Set<TypeName>>();
  for (const parentData of nf.parentDefinitionDataByTypeName.values()) {
    if (!isParentDataCompositeOutputType(parentData) && parentData.kind !== Kind.UNION_TYPE_DEFINITION) {
      continue;
    }
    const directiveNodes = parentData.directivesByName.get(CONTEXT);
    if (!directiveNodes) {
      continue;
    }
    const operationType = nf.operationTypeByRootTypeName.get(parentData.name);
    for (let i = 0; i < directiveNodes.length; i++) {
      const contextName = getContextName(directiveNodes[i]);
      // A missing or invalid name is reported by directive validation.
      if (contextName === undefined) {
        continue;
      }
      getValueOrDefault(setterTypeNamesByContextName, contextName, () => new Set<TypeName>()).add(parentData.name);
      const errorMessages: Array<string> = [];
      if (contextName.includes('_')) {
        errorMessages.push(contextNameUnderscoreErrorMessage(contextName));
      } else if (!/^[A-Za-z][0-9A-Za-z]*$/.test(contextName)) {
        errorMessages.push(invalidContextNameErrorMessage(contextName));
      }
      if (
        (operationType === OperationTypeNode.MUTATION || operationType === OperationTypeNode.SUBSCRIPTION) &&
        referencedContextNames.has(contextName)
      ) {
        errorMessages.push(rootOperationTypeContextErrorMessage({ operationType, typeName: parentData.name }));
      }
      if (errorMessages.length > 0) {
        nf.errors.push(invalidDirectiveError(CONTEXT, parentData.name, numberToOrdinal(i + 1), errorMessages));
      }
    }
  }
  return setterTypeNamesByContextName;
}

function validateFromContextApplication(
  nf: NormalizationFactory,
  { argument, coords, isRepeated, ordinal, reference, selectionParseResult, value }: FromContextApplication,
  setterTypeNamesByContextName: Map<string, Set<TypeName>>,
): ContextualArgumentData | undefined {
  if (!argument) {
    nf.errors.push(
      invalidDirectiveError(FROM_CONTEXT, coords, ordinal, [fromContextOnDirectiveDefinitionArgumentErrorMessage]),
    );
    return;
  }
  // Repeated directives are reported by directive validation.
  if (isRepeated) {
    return;
  }
  const { argumentData, fieldData, parentData } = argument;
  if (parentData.kind === Kind.INTERFACE_TYPE_DEFINITION) {
    // Interface fields that an implementation defines are reported by validateInterfaceImplementations.
    if (!isInterfaceFieldImplemented(nf, parentData.name, fieldData.name)) {
      nf.errors.push(
        invalidDirectiveError(FROM_CONTEXT, coords, FIRST_ORDINAL, [
          fromContextOnInterfaceFieldErrorMessage(`${parentData.name}.${fieldData.name}`),
        ]),
      );
    }
    return;
  }
  const errorMessages: Array<string> = [];
  if (argumentData.defaultValue) {
    errorMessages.push(fromContextDefaultValueErrorMessage);
  }
  if (parentData.directivesByName.has(INTERFACE_OBJECT)) {
    errorMessages.push(fromContextOnInterfaceObjectFieldErrorMessage(parentData.name));
  }
  if (!reference) {
    errorMessages.push(undefinedContextReferenceErrorMessage(value));
    nf.errors.push(invalidDirectiveError(FROM_CONTEXT, coords, FIRST_ORDINAL, errorMessages));
    return;
  }
  const fieldSet = reference.selection.trim();
  const setterTypeNames = setterTypeNamesByContextName.get(reference.contextName);
  let selectionDataBySetterTypeName: Map<TypeName, ContextSelectionData> | undefined;
  if (!setterTypeNames) {
    errorMessages.push(undefinedContextErrorMessage(reference.contextName));
  } else if (!selectionParseResult?.operation) {
    errorMessages.push(
      unparsableContextSelectionErrorMessage({ reason: selectionParseResult?.reason, selection: fieldSet }),
    );
  } else {
    selectionDataBySetterTypeName = validateContextSelection({
      argumentData,
      contextName: reference.contextName,
      errorMessages,
      fieldSet,
      nf,
      operation: selectionParseResult.operation,
      setterTypeNames,
    });
  }
  const keyErrorMessage = getContextualArgumentKeyErrorMessage(nf, parentData);
  if (keyErrorMessage) {
    errorMessages.push(keyErrorMessage);
  }
  if (errorMessages.length > 0) {
    nf.errors.push(invalidDirectiveError(FROM_CONTEXT, coords, FIRST_ORDINAL, errorMessages));
    return;
  }
  if (!selectionDataBySetterTypeName) {
    return;
  }
  return {
    argumentName: argumentData.name,
    contextName: reference.contextName,
    fieldName: fieldData.name,
    parentTypeName: parentData.name,
    selectionDataBySetterTypeName,
  };
}

function isInterfaceFieldImplemented(nf: NormalizationFactory, interfaceTypeName: TypeName, fieldName: string) {
  for (const parentData of nf.parentDefinitionDataByTypeName.values()) {
    if (
      isParentDataCompositeOutputType(parentData) &&
      parentData.name !== interfaceTypeName &&
      parentData.implementedInterfaceTypeNames.has(interfaceTypeName) &&
      parentData.fieldDataByName.has(fieldName)
    ) {
      return true;
    }
  }
  return false;
}

function getContextualArgumentKeyErrorMessage(
  nf: NormalizationFactory,
  parentData: ObjectDefinitionData,
): string | undefined {
  const keyFieldSetDatas = nf.keyFieldSetDatasByTypeName.get(parentData.name);
  if (!keyFieldSetDatas || ![...keyFieldSetDatas.values()].some(({ isUnresolvable }) => !isUnresolvable)) {
    return contextualArgumentWithoutResolvableKeyErrorMessage(parentData.name);
  }
  const externalFieldCoords = new Set<string>();
  for (const { documentNode } of keyFieldSetDatas.values()) {
    const keyExternalFieldCoords = new Set<string>();
    for (const definition of documentNode.definitions) {
      if (definition.kind === Kind.OPERATION_DEFINITION) {
        addExternalFieldCoords(nf, definition.selectionSet, parentData, keyExternalFieldCoords);
      }
    }
    if (keyExternalFieldCoords.size < 1) {
      return;
    }
    for (const coords of keyExternalFieldCoords) {
      externalFieldCoords.add(coords);
    }
  }
  return contextualArgumentWithoutLocalKeyErrorMessage({
    externalFieldCoords: [...externalFieldCoords],
    typeName: parentData.name,
  });
}

function addExternalFieldCoords(
  nf: NormalizationFactory,
  selectionSet: SelectionSetNode,
  parentData: ParentDefinitionData,
  externalFieldCoords: Set<string>,
) {
  if (!isParentDataCompositeOutputType(parentData)) {
    return;
  }
  for (const selection of selectionSet.selections) {
    if (selection.kind !== Kind.FIELD) {
      continue;
    }
    const fieldData = parentData.fieldDataByName.get(selection.name.value);
    if (!fieldData) {
      continue;
    }
    const externalFieldData = fieldData.externalFieldDataBySubgraphName.get(nf.subgraphName);
    if (externalFieldData?.isDefinedExternal && !externalFieldData.isUnconditionallyProvided) {
      externalFieldCoords.add(`${parentData.name}.${fieldData.name}`);
    }
    const namedTypeData = nf.parentDefinitionDataByTypeName.get(fieldData.namedTypeName);
    if (selection.selectionSet && namedTypeData) {
      addExternalFieldCoords(nf, selection.selectionSet, namedTypeData, externalFieldCoords);
    }
  }
}

function validateContextSelection({
  argumentData,
  contextName,
  errorMessages,
  fieldSet,
  nf,
  operation,
  setterTypeNames,
}: ValidateContextSelectionParams): Map<TypeName, ContextSelectionData> | undefined {
  const selections = operation.selectionSet.selections;
  const firstSelection = selections[0];
  const typeConditionNames = new Set<TypeName>();
  switch (firstSelection.kind) {
    case Kind.FIELD: {
      if (selections.length > 1) {
        errorMessages.push(multipleContextSelectionFieldsErrorMessage(fieldSet));
        return;
      }
      break;
    }
    case Kind.INLINE_FRAGMENT: {
      for (const selection of selections) {
        if (selection.kind !== Kind.INLINE_FRAGMENT) {
          errorMessages.push(mixedContextSelectionErrorMessage(fieldSet));
          return;
        }
      }
      for (const selection of selections as ReadonlyArray<InlineFragmentNode>) {
        if (!selection.typeCondition) {
          errorMessages.push(contextFragmentWithoutTypeConditionErrorMessage(fieldSet));
          return;
        }
        const typeConditionName = selection.typeCondition.name.value;
        if (typeConditionNames.has(typeConditionName)) {
          errorMessages.push(
            duplicateContextTypeConditionErrorMessage({ selection: fieldSet, typeName: typeConditionName }),
          );
          return;
        }
        typeConditionNames.add(typeConditionName);
      }
      break;
    }
    default: {
      errorMessages.push(fragmentSpreadInContextSelectionErrorMessage(fieldSet));
      return;
    }
  }
  if (hasFragmentSpread(operation.selectionSet)) {
    errorMessages.push(fragmentSpreadInContextSelectionErrorMessage(fieldSet));
    return;
  }
  const variableName = getVariableName(operation.selectionSet);
  if (variableName) {
    errorMessages.push(variableInContextSelectionErrorMessage({ selection: fieldSet, variableName }));
    return;
  }
  const isFragmentSelection = typeConditionNames.size > 0;
  const interfaceObjectTypeNames = new Set<TypeName>();
  const invalidTypeConditionNames = new Set<TypeName>();
  const usedTypeConditionNames = new Set<TypeName>();
  const selectionDataBySetterTypeName = new Map<TypeName, ContextSelectionData>();
  let areDirectivesAndAliasesValidated = false;
  for (const setterTypeName of setterTypeNames) {
    const setterData = getParentData(nf, setterTypeName);
    const fieldSetErrorMessage = isFragmentSelection
      ? getFragmentSelectionErrorMessage(nf, fieldSet, operation.selectionSet)
      : getSelectionSetErrorMessage(nf, fieldSet, operation.selectionSet, setterData, []);
    if (fieldSetErrorMessage) {
      errorMessages.push(
        invalidContextSelectionForSetterErrorMessage({
          contextName,
          fieldSetErrorMessage,
          selection: fieldSet,
          setterTypeName,
        }),
      );
      return;
    }
    if (!areDirectivesAndAliasesValidated) {
      areDirectivesAndAliasesValidated = true;
      const directiveName = getDirectiveName(operation.selectionSet);
      if (directiveName) {
        errorMessages.push(directiveInContextSelectionErrorMessage({ directiveName, selection: fieldSet }));
      }
      const alias = getAlias(operation.selectionSet);
      if (alias) {
        errorMessages.push(aliasInContextSelectionErrorMessage({ alias, selection: fieldSet }));
      }
    }
    if (!isFragmentSelection) {
      const selectionType = resolveContextSelectionType(
        { errorMessages, fieldSet, interfaceObjectTypeNames, nf, typeName: setterTypeName },
        operation.selectionSet,
        setterData,
        [],
      );
      if (!selectionType) {
        return;
      }
      if (!isContextSelectionTypeValid(nf, argumentData.type, selectionType)) {
        errorMessages.push(
          incompatibleContextSelectionTypeErrorMessage({
            argumentType: printTypeNode(argumentData.type),
            selection: fieldSet,
            selectionType: printTypeNode(selectionType),
            typeName: setterTypeName,
          }),
        );
        return;
      }
      selectionDataBySetterTypeName.set(setterTypeName, {
        fieldSet: getNormalizedFieldSet({ definitions: [operation], kind: Kind.DOCUMENT }),
        kind: Kind.FIELD,
      });
      continue;
    }
    const applicableFragments: Array<InlineFragmentNode> = [];
    for (const selection of selections as ReadonlyArray<InlineFragmentNode>) {
      // Top-level type conditions were validated by the format checks.
      const typeConditionName = selection.typeCondition!.name.value;
      const typeConditionData = nf.parentDefinitionDataByTypeName.get(typeConditionName);
      if (!typeConditionData && !BASE_SCALARS.has(typeConditionName)) {
        if (!invalidTypeConditionNames.has(typeConditionName)) {
          invalidTypeConditionNames.add(typeConditionName);
          errorMessages.push(
            unknownContextTypeConditionErrorMessage({ selection: fieldSet, typeName: typeConditionName }),
          );
        }
        continue;
      }
      if (typeConditionData?.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        if (!invalidTypeConditionNames.has(typeConditionName)) {
          invalidTypeConditionNames.add(typeConditionName);
          errorMessages.push(
            nonObjectContextTypeConditionErrorMessage({
              selection: fieldSet,
              typeName: typeConditionName,
              typeString: typeConditionData ? kindToNodeType(typeConditionData.kind) : SCALAR,
            }),
          );
        }
        continue;
      }
      if (isPossibleType(nf, setterData, typeConditionName)) {
        usedTypeConditionNames.add(typeConditionName);
        applicableFragments.push(selection);
      }
    }
    if (applicableFragments.length < 1) {
      errorMessages.push(
        noApplicableContextTypeConditionErrorMessage({ contextName, selection: fieldSet, setterTypeName }),
      );
      return;
    }
    const fieldSetByTypeConditionName = new Map<TypeName, string>();
    for (const fragment of applicableFragments) {
      const typeConditionName = fragment.typeCondition!.name.value;
      const selectionType = resolveContextSelectionType(
        {
          errorMessages,
          fieldSet,
          fragmentTypeName: typeConditionName,
          interfaceObjectTypeNames,
          nf,
          typeName: typeConditionName,
        },
        fragment.selectionSet,
        getParentData(nf, typeConditionName),
        [],
      );
      if (!selectionType) {
        return;
      }
      if (!isContextSelectionTypeValid(nf, argumentData.type, selectionType)) {
        errorMessages.push(
          incompatibleContextSelectionTypeErrorMessage({
            argumentType: printTypeNode(argumentData.type),
            selection: fieldSet,
            selectionType: printTypeNode(selectionType),
            typeName: typeConditionName,
          }),
        );
        return;
      }
      fieldSetByTypeConditionName.set(
        typeConditionName,
        getNormalizedFieldSet(getSelectionSetDocumentNode(fragment.selectionSet)),
      );
    }
    selectionDataBySetterTypeName.set(setterTypeName, { fieldSetByTypeConditionName, kind: Kind.INLINE_FRAGMENT });
  }
  for (const typeConditionName of typeConditionNames) {
    if (!usedTypeConditionNames.has(typeConditionName)) {
      errorMessages.push(
        unusedContextTypeConditionErrorMessage({ contextName, selection: fieldSet, typeName: typeConditionName }),
      );
    }
  }
  return selectionDataBySetterTypeName;
}

function getSelectionSetDocumentNode(selectionSet: SelectionSetNode): DocumentNode {
  return {
    definitions: [{ kind: Kind.OPERATION_DEFINITION, operation: OperationTypeNode.QUERY, selectionSet }],
    kind: Kind.DOCUMENT,
  };
}

function hasFragmentSpread(selectionSet: SelectionSetNode): boolean {
  let hasSpread = false;
  visit(selectionSet, {
    FragmentSpread() {
      hasSpread = true;
      return BREAK;
    },
  });
  return hasSpread;
}

function getVariableName(selectionSet: SelectionSetNode): string | undefined {
  let variableName: string | undefined;
  visit(selectionSet, {
    Variable(node) {
      variableName = node.name.value;
      return BREAK;
    },
  });
  return variableName;
}

function getDirectiveName(selectionSet: SelectionSetNode): string | undefined {
  let directiveName: string | undefined;
  visit(selectionSet, {
    Directive(node) {
      directiveName = node.name.value;
      return BREAK;
    },
  });
  return directiveName;
}

function getAlias(selectionSet: SelectionSetNode): string | undefined {
  let alias: string | undefined;
  visit(selectionSet, {
    Field(node) {
      if (!node.alias) {
        return;
      }
      alias = node.alias.value;
      return BREAK;
    },
  });
  return alias;
}

function getFragmentSelectionErrorMessage(
  nf: NormalizationFactory,
  fieldSet: string,
  selectionSet: SelectionSetNode,
): string | undefined {
  for (const selection of selectionSet.selections as ReadonlyArray<InlineFragmentNode>) {
    const typeConditionData = nf.parentDefinitionDataByTypeName.get(selection.typeCondition!.name.value);
    // Unknown and non-composite type conditions are reported by the type condition checks.
    if (!typeConditionData || !isCompositeParentData(typeConditionData)) {
      continue;
    }
    const errorMessage = getSelectionSetErrorMessage(nf, fieldSet, selection.selectionSet, typeConditionData, []);
    if (errorMessage) {
      return errorMessage;
    }
  }
}

function isCompositeParentData(data: ParentDefinitionData): boolean {
  return isParentDataCompositeOutputType(data) || data.kind === Kind.UNION_TYPE_DEFINITION;
}

function getSelectionSetErrorMessage(
  nf: NormalizationFactory,
  fieldSet: string,
  selectionSet: SelectionSetNode,
  parentData: ParentDefinitionData,
  fieldCoordsPath: Array<string>,
): string | undefined {
  for (const selection of selectionSet.selections) {
    // Nested inline fragments are reported when the selection type is resolved.
    if (selection.kind !== Kind.FIELD) {
      continue;
    }
    const fieldName = selection.name.value;
    const fieldCoords = `${parentData.name}.${fieldName}`;
    if (fieldName === TYPENAME) {
      if (selection.arguments && selection.arguments.length > 0) {
        return unexpectedArgumentErrorMessage(fieldSet, fieldCoords, selection.arguments[0].name.value);
      }
      if (selection.selectionSet) {
        return invalidSelectionSetDefinitionErrorMessage(
          fieldSet,
          [...fieldCoordsPath, fieldCoords],
          STRING_SCALAR,
          SCALAR,
        );
      }
      continue;
    }
    if (!isParentDataCompositeOutputType(parentData)) {
      return invalidSelectionOnUnionErrorMessage(fieldSet, fieldCoordsPath, parentData.name);
    }
    const fieldData = parentData.fieldDataByName.get(fieldName);
    if (!fieldData) {
      return undefinedFieldInFieldSetErrorMessage(fieldSet, parentData.name, fieldName);
    }
    const argumentErrorMessage = getArgumentErrorMessage(nf, fieldSet, selection, fieldData, fieldCoords);
    if (argumentErrorMessage) {
      return argumentErrorMessage;
    }
    const namedTypeData = nf.parentDefinitionDataByTypeName.get(fieldData.namedTypeName);
    const nextFieldCoordsPath = [...fieldCoordsPath, fieldCoords];
    if (!namedTypeData || !isCompositeParentData(namedTypeData)) {
      if (selection.selectionSet) {
        return invalidSelectionSetDefinitionErrorMessage(
          fieldSet,
          nextFieldCoordsPath,
          fieldData.namedTypeName,
          namedTypeData ? kindToNodeType(namedTypeData.kind) : SCALAR,
        );
      }
      continue;
    }
    if (!selection.selectionSet) {
      return invalidSelectionSetErrorMessage(
        fieldSet,
        nextFieldCoordsPath,
        fieldData.namedTypeName,
        kindToNodeType(namedTypeData.kind),
      );
    }
    const errorMessage = getSelectionSetErrorMessage(
      nf,
      fieldSet,
      selection.selectionSet,
      namedTypeData,
      nextFieldCoordsPath,
    );
    if (errorMessage) {
      return errorMessage;
    }
  }
}

function getArgumentErrorMessage(
  nf: NormalizationFactory,
  fieldSet: string,
  fieldNode: FieldNode,
  fieldData: FieldData,
  fieldCoords: string,
): string | undefined {
  const definedArgumentNames = new Set<ArgumentName>();
  for (const argumentNode of fieldNode.arguments ?? []) {
    const argumentName = argumentNode.name.value;
    const argumentData = fieldData.argumentDataByName.get(argumentName);
    if (!argumentData) {
      return unexpectedArgumentErrorMessage(fieldSet, fieldCoords, argumentName);
    }
    definedArgumentNames.add(argumentName);
    if (
      !isArgumentValueValid({
        // Variables are rejected before argument values are validated.
        argumentValue: argumentNode.value as ConstValueNode,
        parentDefinitionDataByTypeName: nf.parentDefinitionDataByTypeName,
        typeNode: argumentData.type,
      })
    ) {
      return invalidArgumentValueInFieldSetErrorMessage({
        argumentName,
        fieldCoords,
        fieldSet,
        typeString: printTypeNode(argumentData.type),
        value: print(argumentNode.value),
      });
    }
  }
  for (const [argumentName, argumentData] of fieldData.argumentDataByName) {
    if (!definedArgumentNames.has(argumentName) && !argumentData.defaultValue && isTypeRequired(argumentData.type)) {
      return undefinedRequiredArgumentInFieldSetErrorMessage({ argumentName, fieldCoords, fieldSet });
    }
  }
}

function resolveContextSelectionType(
  params: ResolveContextSelectionTypeParams,
  selectionSet: SelectionSetNode,
  parentData: ParentDefinitionData,
  fieldPath: Array<string>,
): TypeNode | undefined {
  const { errorMessages, fieldSet, interfaceObjectTypeNames, nf } = params;
  if (
    parentData.kind === Kind.OBJECT_TYPE_DEFINITION &&
    parentData.directivesByName.has(INTERFACE_OBJECT) &&
    !interfaceObjectTypeNames.has(parentData.name)
  ) {
    interfaceObjectTypeNames.add(parentData.name);
    errorMessages.push(
      interfaceObjectInContextSelectionErrorMessage({ selection: fieldSet, typeName: parentData.name }),
    );
  }
  if (selectionSet.selections.length > 1) {
    errorMessages.push(
      multipleContextSelectionLeavesErrorMessage({
        leafPaths: getLeafPaths(selectionSet, fieldPath),
        selection: fieldSet,
        setterTypeName: params.typeName,
      }),
    );
    return;
  }
  const selection = selectionSet.selections[0];
  if (selection.kind !== Kind.FIELD) {
    const typeName =
      params.fragmentTypeName ??
      (selection.kind === Kind.INLINE_FRAGMENT ? selection.typeCondition?.name.value : undefined) ??
      parentData.name;
    errorMessages.push(unresolvableContextFragmentErrorMessage({ selection: fieldSet, typeName }));
    return;
  }
  const fieldName = selection.name.value;
  if (fieldName === TYPENAME) {
    return { kind: Kind.NAMED_TYPE, name: { kind: Kind.NAME, value: STRING_SCALAR } };
  }
  // The selection was validated, so the field exists.
  const fieldData = (parentData as CompositeOutputData).fieldDataByName.get(fieldName)!;
  if (!selection.selectionSet) {
    return getListWrappedTypeNode(fieldData.type, {
      kind: Kind.NAMED_TYPE,
      name: { kind: Kind.NAME, value: getTypeNodeNamedTypeName(fieldData.type) },
    });
  }
  const selectionType = resolveContextSelectionType(
    params,
    selection.selectionSet,
    getParentData(nf, fieldData.namedTypeName),
    [...fieldPath, fieldName],
  );
  if (!selectionType) {
    return;
  }
  return getListWrappedTypeNode(fieldData.type, selectionType);
}

// Non-null wrappers are dropped, so the argument type must match the list depth and the named type only.
function getListWrappedTypeNode(fieldType: TypeNode, resolvedType: TypeNode): TypeNode {
  switch (fieldType.kind) {
    case Kind.LIST_TYPE: {
      return { kind: Kind.LIST_TYPE, type: getListWrappedTypeNode(fieldType.type, resolvedType) };
    }
    case Kind.NON_NULL_TYPE: {
      return getListWrappedTypeNode(fieldType.type, resolvedType);
    }
    default: {
      return resolvedType;
    }
  }
}

function getLeafPaths(selectionSet: SelectionSetNode, fieldPath: Array<string>): Array<string> {
  const leafPaths: Array<string> = [];
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      continue;
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      leafPaths.push(...getLeafPaths(selection.selectionSet, fieldPath));
      continue;
    }
    const path = [...fieldPath, selection.name.value];
    if (selection.selectionSet) {
      leafPaths.push(...getLeafPaths(selection.selectionSet, path));
      continue;
    }
    leafPaths.push(path.join(LITERAL_PERIOD));
  }
  return leafPaths;
}

function isContextSelectionTypeValid(nf: NormalizationFactory, argumentType: TypeNode, selectionType: TypeNode) {
  return isTypeValidImplementation({
    concreteTypeNamesByAbstractTypeName: nf.concreteTypeNamesByAbstractTypeName,
    implementationType: selectionType,
    interfaceImplementationTypeNamesByInterfaceTypeName: nf.interfaceImplementationTypeNamesByInterfaceTypeName,
    // The outer non-null wrapper is reported at federation by requiredContextArgumentError.
    originalType: argumentType.kind === Kind.NON_NULL_TYPE ? argumentType.type : argumentType,
  });
}

function isPossibleType(nf: NormalizationFactory, setterData: ParentDefinitionData, typeName: TypeName): boolean {
  if (isObjectDefinitionData(setterData)) {
    return setterData.name === typeName;
  }
  return !!nf.concreteTypeNamesByAbstractTypeName.get(setterData.name)?.has(typeName);
}

// A selection that cannot be resolved stops the walk; the fields reached before it stay marked as used.
function markSelectionSetFields(
  nf: NormalizationFactory,
  selectionSet: SelectionSetNode,
  parentData: ParentDefinitionData,
): boolean {
  for (const selection of selectionSet.selections) {
    // The directives of a selection are resolved before its field, so an undefined directive stops the walk.
    if (!areDirectivesDefined(nf, selection.directives)) {
      return false;
    }
    switch (selection.kind) {
      case Kind.FIELD: {
        const fieldName = selection.name.value;
        if (fieldName === TYPENAME) {
          continue;
        }
        if (!isParentDataCompositeOutputType(parentData)) {
          return false;
        }
        const fieldData = parentData.fieldDataByName.get(fieldName);
        if (!fieldData) {
          return false;
        }
        nf.unvalidatedExternalFieldCoords.delete(`${parentData.name}.${fieldName}`);
        if (parentData.kind === Kind.INTERFACE_TYPE_DEFINITION) {
          for (const concreteTypeName of nf.concreteTypeNamesByAbstractTypeName.get(parentData.name) ?? []) {
            nf.unvalidatedExternalFieldCoords.delete(`${concreteTypeName}.${fieldName}`);
          }
        }
        if (!selection.selectionSet) {
          continue;
        }
        const namedTypeData = nf.parentDefinitionDataByTypeName.get(fieldData.namedTypeName);
        if (!namedTypeData || !markSelectionSetFields(nf, selection.selectionSet, namedTypeData)) {
          return false;
        }
        continue;
      }
      case Kind.INLINE_FRAGMENT: {
        const typeConditionName = selection.typeCondition?.name.value;
        const typeConditionData = typeConditionName
          ? nf.parentDefinitionDataByTypeName.get(typeConditionName)
          : undefined;
        if (typeConditionName && !typeConditionData && BASE_SCALARS.has(typeConditionName)) {
          return false;
        }
        // An unknown type condition is already reported, so its fields are resolved against the enclosing type.
        if (!markSelectionSetFields(nf, selection.selectionSet, typeConditionData ?? parentData)) {
          return false;
        }
        continue;
      }
      default: {
        return false;
      }
    }
  }
  return true;
}

function areDirectivesDefined(nf: NormalizationFactory, directiveNodes: ReadonlyArray<DirectiveNode> = []): boolean {
  return directiveNodes.every(
    ({ name }) => nf.directiveDefinitionDataByName.has(name.value) || EXECUTABLE_DIRECTIVE_NAMES.has(name.value),
  );
}

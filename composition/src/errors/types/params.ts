import { type OperationTypeNode } from 'graphql';
import { type FieldData, type InputValueData, type ParentDefinitionData } from '../../schema-building/types/types';
import {
  type ArgumentName,
  type DirectiveName,
  type FieldName,
  type SubgraphName,
  type TypeName,
} from '../../types/types';
import { directlyProvidedInterfaceFieldError } from '../errors';

export type IncompatibleMergedTypesErrorParams = {
  actualType: string;
  expectedType: string;
  coords: string;
  isArgument?: boolean;
};

export type InvalidNamedTypeErrorParams = {
  data: FieldData | InputValueData;
  namedTypeData: ParentDefinitionData;
  nodeType: string;
};

export type SemanticNonNullLevelsIndexOutOfBoundsErrorParams = {
  maxIndex: number;
  typeString: string;
  value: string;
};

export type SemanticNonNullLevelsNonNullErrorParams = {
  typeString: string;
  value: string;
};

export type OneOfRequiredFieldsErrorParams = {
  requiredFieldNames: Array<FieldName>;
  typeName: TypeName;
};

export type IncompatibleParentTypeMergeErrorParams = {
  existingData: ParentDefinitionData;
  incomingSubgraphName: SubgraphName;
  incomingNodeType?: string;
};

export type IncompatibleTypeWithProvidesErrorMessageParams = {
  fieldCoords: string;
  responseType: TypeName;
  subgraphName: SubgraphName;
};

export type DirectlyProvidedInterfaceFieldErrorParams = {
  directiveCoords: string;
  directiveName: DirectiveName;
  fieldSet: string;
  selection: string;
  subgraphName: SubgraphName;
  targetCoords: string;
};

export type NonExternalConditionalFieldErrorParams = {
  directiveCoords: string;
  fieldSet: string;
  directiveName: DirectiveName;
  subgraphName: SubgraphName;
  targetCoords: string;
};

export type invalidVersionLinkDirectiveUrlErrorParams = {
  url: string;
  versionString: string;
};

export type InvalidSubValueFieldLinkDirectiveImportErrorParams = {
  fieldName: FieldName;
  value: string;
};

export type InvalidLinkDirectiveImportObjectErrorParams = {
  name: string;
  rename: string;
};

export type InvalidCustomDirectiveErrorParams = {
  directiveCoords: string;
  directiveName: DirectiveName;
  errors: Array<Error>;
  ordinal: string;
};

export type InvalidDirectiveLocationErrorParams = {
  directiveCoords: string;
  directiveName: DirectiveName;
  location: string;
};

export type InvalidRepeatedDirectiveErrorParams = {
  directiveCoords: string;
  directiveName: DirectiveName;
};

export type InvalidArgumentValueErrorParams = {
  argumentName: ArgumentName;
  value: string;
  expectedTypeString: string;
};

export type InvalidEntityReturnTypeErrorParams = {
  fieldCoords: string;
  returnTypeName: string;
};

export type ContextSelectionTypeConditionErrorParams = {
  selection: string;
  typeName: TypeName;
};

export type NonObjectContextTypeConditionErrorParams = {
  selection: string;
  typeName: TypeName;
  typeString: string;
};

export type ContextSelectionSetterErrorParams = {
  contextName: string;
  selection: string;
  setterTypeName: TypeName;
};

export type InvalidContextSelectionForSetterErrorParams = {
  contextName: string;
  fieldSetErrorMessage: string;
  selection: string;
  setterTypeName: TypeName;
};

export type UnusedContextTypeConditionErrorParams = {
  contextName: string;
  selection: string;
  typeName: TypeName;
};

export type UnparsableContextSelectionErrorParams = {
  selection: string;
  reason?: string;
};

export type DirectiveInContextSelectionErrorParams = {
  directiveName: DirectiveName;
  selection: string;
};

export type AliasInContextSelectionErrorParams = {
  alias: string;
  selection: string;
};

export type VariableInContextSelectionErrorParams = {
  selection: string;
  variableName: string;
};

export type IncompatibleContextSelectionTypeErrorParams = {
  argumentType: string;
  selection: string;
  selectionType: string;
  typeName: TypeName;
};

export type MultipleContextSelectionLeavesErrorParams = {
  leafPaths: Array<string>;
  selection: string;
  setterTypeName: TypeName;
};

export type UndefinedRequiredArgumentInFieldSetErrorParams = {
  argumentName: ArgumentName;
  fieldCoords: string;
  fieldSet: string;
};

export type InvalidArgumentValueInFieldSetErrorParams = {
  argumentName: ArgumentName;
  fieldCoords: string;
  fieldSet: string;
  typeString: string;
  value: string;
};

export type RootOperationTypeContextErrorParams = {
  operationType: OperationTypeNode;
  typeName: TypeName;
};

export type ContextualArgumentWithoutLocalKeyErrorParams = {
  externalFieldCoords: Array<string>;
  typeName: TypeName;
};

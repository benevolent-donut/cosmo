import { Kind, type SelectionSetNode } from 'graphql';
import { type FederationFactory } from './federation-factory';
import { type ContextSelectionData, type ContextualArgumentData } from '../normalization/types/types';
import { type FieldData, type InputValueData, type OriginalAuthorizationData } from '../../schema-building/types/types';
import { isParentDataCompositeOutputType } from '../../schema-building/utils';
import { isObjectDefinitionData, mergeRequiredScopesByAND } from '../utils/utils';
import { operationTypeNodeToDefaultType, safeParse } from '../../ast/utils';
import {
  contextSetterImplementsInterfaceObjectError,
  missingContextAuthorizationRequirementsError,
  requiredContextArgumentError,
} from '../../errors/errors';
import { partiallyContextualArgumentWarning } from '../warnings/warnings';
import { type InternalSubgraph } from '../../subgraph/types';
import { OPERATION_TO_DEFAULT, TYPENAME } from '../../utils/string-constants';
import { getOrThrowError } from '../../utils/utils';
import { type ArgumentName, type SubgraphName, type TypeName } from '../../types/types';

export function validateContextualArgumentInstances(
  ff: FederationFactory,
  fieldData: FieldData,
  argumentData: InputValueData,
) {
  const requiredSubgraphNames: Array<SubgraphName> = [];
  for (const subgraphName of argumentData.subgraphNames) {
    const isRequired = argumentData.requiredSubgraphNames.has(subgraphName);
    if (argumentData.fromContextSubgraphNames.has(subgraphName)) {
      if (isRequired) {
        requiredSubgraphNames.push(subgraphName);
      }
      continue;
    }
    // An @external instance is resolved by another subgraph, so its subgraph never receives the argument.
    if (fieldData.externalFieldDataBySubgraphName.get(subgraphName)?.isDefinedExternal) {
      continue;
    }
    if (isRequired && !getSubgraphArgumentData(ff, subgraphName, fieldData, argumentData.name)?.defaultValue) {
      requiredSubgraphNames.push(subgraphName);
      continue;
    }
    ff.warnings.push(
      partiallyContextualArgumentWarning({
        coords: argumentData.federatedCoords,
        fromContextSubgraphNames: [...argumentData.fromContextSubgraphNames],
        subgraphName,
      }),
    );
  }
  if (requiredSubgraphNames.length > 0) {
    ff.errors.push(
      requiredContextArgumentError(
        argumentData.federatedCoords,
        [...argumentData.fromContextSubgraphNames],
        requiredSubgraphNames,
      ),
    );
  }
}

function getSubgraphArgumentData(
  ff: FederationFactory,
  subgraphName: SubgraphName,
  fieldData: FieldData,
  argumentName: ArgumentName,
): InputValueData | undefined {
  const parentData = ff.internalSubgraphBySubgraphName
    .get(subgraphName)
    ?.parentDefinitionDataByTypeName.get(fieldData.renamedParentTypeName);
  if (!parentData || !isParentDataCompositeOutputType(parentData)) {
    return;
  }
  return parentData.fieldDataByName.get(fieldData.name)?.argumentDataByName.get(argumentName);
}

export function validateFederatedContexts(ff: FederationFactory) {
  const isAuthorizationDefined = ff.authorizationDataByParentTypeName.size > 0;
  const errorByMessage = new Map<string, Error>();
  for (const internalSubgraph of ff.internalSubgraphBySubgraphName.values()) {
    for (const data of internalSubgraph.contextualArgumentDatas) {
      const errors = getContextSetterErrors(ff, internalSubgraph, data);
      if (isAuthorizationDefined) {
        errors.push(...getContextAuthorizationErrors(ff, internalSubgraph, data));
      }
      for (const error of errors) {
        errorByMessage.set(error.message, error);
      }
    }
  }
  ff.errors.push(...errorByMessage.values());
}

function getFederatedTypeName({ operationTypes }: InternalSubgraph, typeName: TypeName): TypeName {
  const operationType = operationTypes.get(typeName);
  if (!operationType) {
    return typeName;
  }
  return getOrThrowError(operationTypeNodeToDefaultType, operationType, OPERATION_TO_DEFAULT);
}

function getConcreteTypeNames(ff: FederationFactory, typeName: TypeName): Iterable<TypeName> {
  if (isObjectDefinitionData(ff.parentDefinitionDataByTypeName.get(typeName))) {
    return [typeName];
  }
  return ff.concreteTypeNamesByAbstractTypeName.get(typeName) ?? [];
}

function getContextSetterErrors(
  ff: FederationFactory,
  internalSubgraph: InternalSubgraph,
  { contextName, selectionDataBySetterTypeName }: ContextualArgumentData,
): Array<Error> {
  const errors: Array<Error> = [];
  for (const setterTypeName of selectionDataBySetterTypeName.keys()) {
    for (const concreteTypeName of getConcreteTypeNames(ff, getFederatedTypeName(internalSubgraph, setterTypeName))) {
      const concreteTypeData = ff.parentDefinitionDataByTypeName.get(concreteTypeName);
      if (!isObjectDefinitionData(concreteTypeData)) {
        continue;
      }
      for (const interfaceTypeName of concreteTypeData.implementedInterfaceTypeNames) {
        const entityInterfaceData = ff.entityInterfaceFederationDataByTypeName.get(interfaceTypeName);
        if (!entityInterfaceData || entityInterfaceData.interfaceObjectSubgraphNames.size < 1) {
          continue;
        }
        errors.push(
          contextSetterImplementsInterfaceObjectError({
            contextName,
            interfaceObjectSubgraphNames: [...entityInterfaceData.interfaceObjectSubgraphNames],
            interfaceTypeName,
            setterTypeName: concreteTypeName,
            subgraphName: internalSubgraph.name,
          }),
        );
      }
    }
  }
  return errors;
}

function getContextAuthorizationErrors(
  ff: FederationFactory,
  internalSubgraph: InternalSubgraph,
  { contextName, fieldName, parentTypeName, selectionDataBySetterTypeName }: ContextualArgumentData,
): Array<Error> {
  const federatedParentTypeName = getFederatedTypeName(internalSubgraph, parentTypeName);
  const parentAuthData = ff.authorizationDataByParentTypeName.get(federatedParentTypeName);
  const fieldAuthData = parentAuthData?.fieldAuthDataByFieldName.get(fieldName)?.originalData;
  const requirements: OriginalAuthorizationData = {
    requiredScopes: mergeRequiredScopesByAND(
      [...(fieldAuthData?.requiredScopes ?? [])],
      parentAuthData?.requiredScopes ?? [],
    ),
    requiresAuthentication: !!(parentAuthData?.requiresAuthentication || fieldAuthData?.requiresAuthentication),
  };
  const errors: Array<Error> = [];
  for (const [setterTypeName, selectionData] of selectionDataBySetterTypeName) {
    const dependencyCoords = getUnauthorizedDependencyCoords(
      ff,
      internalSubgraph,
      requirements,
      getFederatedTypeName(internalSubgraph, setterTypeName),
      selectionData,
    );
    if (!dependencyCoords) {
      continue;
    }
    errors.push(
      missingContextAuthorizationRequirementsError({
        contextName,
        dependencyCoords,
        fieldCoords: `${federatedParentTypeName}.${fieldName}`,
        parentTypeName: federatedParentTypeName,
      }),
    );
  }
  return errors;
}

function getUnauthorizedDependencyCoords(
  ff: FederationFactory,
  internalSubgraph: InternalSubgraph,
  requirements: OriginalAuthorizationData,
  setterTypeName: TypeName,
  selectionData: ContextSelectionData,
): string | undefined {
  if (!areRequirementsSatisfied(requirements, ff.authorizationDataByParentTypeName.get(setterTypeName))) {
    return setterTypeName;
  }
  if (selectionData.kind === Kind.FIELD) {
    return getUnauthorizedFieldSetCoords(ff, requirements, selectionData.fieldSet, setterTypeName);
  }
  for (const [typeConditionName, fieldSet] of selectionData.fieldSetByTypeConditionName) {
    const typeName = getFederatedTypeName(internalSubgraph, typeConditionName);
    if (!areRequirementsSatisfied(requirements, ff.authorizationDataByParentTypeName.get(typeName))) {
      return typeName;
    }
    const coords = getUnauthorizedFieldSetCoords(ff, requirements, fieldSet, typeName);
    if (coords) {
      return coords;
    }
  }
}

function getUnauthorizedFieldSetCoords(
  ff: FederationFactory,
  requirements: OriginalAuthorizationData,
  fieldSet: string,
  typeName: TypeName,
): string | undefined {
  const { documentNode } = safeParse(`{${fieldSet}}`);
  const definition = documentNode?.definitions[0];
  if (definition?.kind !== Kind.OPERATION_DEFINITION) {
    return;
  }
  return getUnauthorizedSelectionSetCoords(ff, requirements, definition.selectionSet, typeName);
}

function getUnauthorizedSelectionSetCoords(
  ff: FederationFactory,
  requirements: OriginalAuthorizationData,
  selectionSet: SelectionSetNode,
  typeName: TypeName,
): string | undefined {
  const parentData = ff.parentDefinitionDataByTypeName.get(typeName);
  if (!parentData || !isParentDataCompositeOutputType(parentData)) {
    return;
  }
  for (const selection of selectionSet.selections) {
    if (selection.kind !== Kind.FIELD || selection.name.value === TYPENAME) {
      continue;
    }
    const fieldName = selection.name.value;
    const fieldData = parentData.fieldDataByName.get(fieldName);
    if (!fieldData) {
      continue;
    }
    const fieldAuthData = ff.authorizationDataByParentTypeName.get(typeName)?.fieldAuthDataByFieldName.get(fieldName);
    if (
      !areRequirementsSatisfied(requirements, fieldAuthData?.originalData) ||
      !areRequirementsSatisfied(requirements, ff.authorizationDataByParentTypeName.get(fieldData.namedTypeName))
    ) {
      return `${typeName}.${fieldName}`;
    }
    if (!selection.selectionSet) {
      continue;
    }
    const coords = getUnauthorizedSelectionSetCoords(ff, requirements, selection.selectionSet, fieldData.namedTypeName);
    if (coords) {
      return coords;
    }
  }
}

// Scopes are OR-ed sets of AND-ed scopes, so each set of the requirements must contain a set of the dependency.
function areRequirementsSatisfied(
  requirements: OriginalAuthorizationData,
  dependency?: OriginalAuthorizationData,
): boolean {
  if (!dependency) {
    return true;
  }
  if (dependency.requiresAuthentication && !requirements.requiresAuthentication) {
    return false;
  }
  if (dependency.requiredScopes.length < 1) {
    return true;
  }
  const requiredScopes = requirements.requiredScopes.length > 0 ? requirements.requiredScopes : [new Set<string>()];
  return requiredScopes.every((andScopes) =>
    dependency.requiredScopes.some((dependencyAndScopes) => dependencyAndScopes.isSubsetOf(andScopes)),
  );
}

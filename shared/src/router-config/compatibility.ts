import {
  ConfigurationData,
  CONTEXTUAL_ARGUMENTS_ROUTER_COMPATIBILITY_VERSION,
  ROUTER_COMPATIBILITY_VERSION_ONE,
  TypeName,
} from '@wundergraph/composition';
import type { EngineConfiguration } from '@wundergraph/cosmo-connect/dist/node/v1/node_pb';
import { SubgraphKind } from './builder.js';
import { unsupportedContextualArgumentSubgraphError } from './errors.js';

const VERSION_SEGMENT_REGEX = /^\d+$/;

export type ContextualArgumentSubgraph = {
  kind: SubgraphKind;
  name: string;
  configurationDataByTypeName?: Map<TypeName, ConfigurationData>;
};

/**
 * Returns the router compatibility version that the content of the engine configuration requires.
 */
export function getRequiredRouterCompatibilityVersion(engineConfig?: EngineConfiguration): string {
  if (
    engineConfig?.datasourceConfigurations.some(
      ({ contextualArgumentConfiguration }) => contextualArgumentConfiguration !== undefined,
    )
  ) {
    return CONTEXTUAL_ARGUMENTS_ROUTER_COMPATIBILITY_VERSION;
  }
  return ROUTER_COMPATIBILITY_VERSION_ONE;
}

/**
 * Raises the router compatibility version segment of a "<router>:<composition>" compatibility version to the
 * maximum of itself and the required versions. The input is returned unchanged when nothing requires more.
 */
export function foldRouterCompatibilityVersion(
  compatibilityVersion: string,
  requiredVersions: Iterable<string>,
): string {
  const separatorIndex = compatibilityVersion.indexOf(':');
  const segment = separatorIndex < 0 ? compatibilityVersion : compatibilityVersion.slice(0, separatorIndex);
  if (!VERSION_SEGMENT_REGEX.test(segment)) {
    return compatibilityVersion;
  }
  const version = Number(segment);
  let maximumVersion = version;
  for (const requiredVersion of requiredVersions) {
    if (VERSION_SEGMENT_REGEX.test(requiredVersion) && Number(requiredVersion) > maximumVersion) {
      maximumVersion = Number(requiredVersion);
    }
  }
  if (maximumVersion === version) {
    return compatibilityVersion;
  }
  return separatorIndex < 0 ? `${maximumVersion}` : `${maximumVersion}${compatibilityVersion.slice(separatorIndex)}`;
}

/**
 * Returns one error for each gRPC service or plugin subgraph that defines arguments with @fromContext.
 */
export function getUnsupportedContextualArgumentSubgraphErrors(
  subgraphs: Iterable<ContextualArgumentSubgraph>,
): Array<Error> {
  const errors: Array<Error> = [];
  for (const { configurationDataByTypeName, kind, name } of subgraphs) {
    if (kind === SubgraphKind.Standard || !configurationDataByTypeName) {
      continue;
    }
    const argumentCoords: Array<string> = [];
    for (const { contextualArguments, typeName } of configurationDataByTypeName.values()) {
      for (const { argumentName, fieldName } of contextualArguments ?? []) {
        argumentCoords.push(`${typeName}.${fieldName}(${argumentName}: ...)`);
      }
    }
    if (argumentCoords.length > 0) {
      errors.push(
        unsupportedContextualArgumentSubgraphError({
          argumentCoords,
          kindDescription: kind === SubgraphKind.GRPC ? 'gRPC service' : 'plugin',
          subgraphName: name,
        }),
      );
    }
  }
  return errors;
}

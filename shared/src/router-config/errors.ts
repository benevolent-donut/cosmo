import { FROM_CONTEXT, QUOTATION_JOIN } from '@wundergraph/composition';

export function normalizationFailureError(objectName: string): Error {
  return new Error(`Normalization failed to return a ${objectName}.`);
}

export function invalidRouterCompatibilityVersion(version: string): Error {
  return new Error(`Invalid router compatibility version "${version}".`);
}

export function unsupportedContextualArgumentSubgraphError({
  argumentCoords,
  kindDescription,
  subgraphName,
}: {
  argumentCoords: Array<string>;
  kindDescription: string;
  subgraphName: string;
}): Error {
  return new Error(
    `The subgraph "${subgraphName}" is a ${kindDescription} subgraph and defines the following argument` +
      (argumentCoords.length > 1 ? 's' : '') +
      ` with "@${FROM_CONTEXT}": "` +
      argumentCoords.join(QUOTATION_JOIN) +
      `". Contextual arguments are only supported in GraphQL subgraphs.`,
  );
}

export type SupportedRouterCompatibilityVersion = '1';

export const ROUTER_COMPATIBILITY_VERSION_ONE: Readonly<SupportedRouterCompatibilityVersion> = '1';

export const ROUTER_COMPATIBILITY_VERSIONS: ReadonlySet<SupportedRouterCompatibilityVersion> = new Set<
  Readonly<SupportedRouterCompatibilityVersion>
>([ROUTER_COMPATIBILITY_VERSION_ONE]);

export const LATEST_ROUTER_COMPATIBILITY_VERSION: Readonly<SupportedRouterCompatibilityVersion> = '1';

export const CONTEXTUAL_ARGUMENTS_ROUTER_COMPATIBILITY_VERSION = '2';

// A placeholder for the first router release that accepts router compatibility version 2.
export const CONTEXTUAL_ARGUMENTS_MINIMUM_ROUTER_VERSION = 'ROUTER_MIN_VERSION';

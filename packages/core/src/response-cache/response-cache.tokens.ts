export const RESPONSE_CACHE_TOKENS = {
  Options: Symbol.for('stratal:response-cache:options'),
  ResponseCacheService: Symbol.for('stratal:response-cache:service'),
  CacheabilityService: Symbol.for('stratal:response-cache:cacheability'),
  PartitionResolverService: Symbol.for('stratal:response-cache:partition-resolver'),
  GatewayPrimerService: Symbol.for('stratal:response-cache:gateway-primer'),
  GatewayPrimers: Symbol.for('stratal:response-cache:gateway-primers'),
  GatewayRouteTable: Symbol.for('stratal:response-cache:gateway-route-table'),
} as const

export type ResponseCacheToken =
  (typeof RESPONSE_CACHE_TOKENS)[keyof typeof RESPONSE_CACHE_TOKENS]

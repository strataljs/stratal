import { type ControllerOptions } from "../router/types";

/**
 * Gateway options for @Gateway() decorator
 * Subset of ControllerOptions relevant to WebSocket gateways (no OpenAPI-specific fields)
 */
export type GatewayOptions = Pick<ControllerOptions, 'version'>

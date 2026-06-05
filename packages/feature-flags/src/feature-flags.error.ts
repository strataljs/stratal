import { ApplicationError } from 'stratal/errors'

/**
 * Thrown for feature-flag misconfiguration — an unknown app or a Flagship
 * binding that is not present on the Worker environment.
 *
 * Note: flag *evaluation* never throws; the binding returns the supplied
 * default value on error.
 */
export class FeatureFlagError extends ApplicationError {}

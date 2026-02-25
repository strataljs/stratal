/**
 * Generic type for class constructors
 *
 * Represents a class that can be instantiated with any arguments.
 * Useful for dependency injection and dynamic class resolution.
 *
 * @example
 * ```typescript
 * const controllers: Constructor<Controller>[] = [
 *   UsersController,
 *   ProductsController
 * ]
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is used to allow for any number of arguments
export type Constructor<T extends object = object> = new (...args: any[]) => T

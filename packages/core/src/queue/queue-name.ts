/**
 * Queue Name Type System with Module Augmentation
 *
 * This file provides a type-safe queue naming system using module augmentation.
 * Applications augment the QueueNames interface to get autocomplete for queue names.
 *
 * @example In apps/backend/src/types/queues.ts:
 * ```typescript
 * declare module 'stratal' {
 *   interface QueueNames {
 *     'notifications-queue': true
 *     'tenant-notifications-queue': true
 *   }
 * }
 * ```
 *
 * When QueueNames is augmented, QueueName provides autocomplete.
 * When not augmented, QueueName falls back to string for flexibility.
 */

/**
 * Augmentable interface for queue names.
 *
 * Applications extend this interface via module augmentation to define
 * their queue names. The keys become the valid queue name union type.
 *
 * @example
 * ```typescript
 * // In your application's type declarations
 * declare module 'stratal' {
 *   interface QueueNames {
 *     'notifications-queue': true
 *     'tenant-notifications-queue': true
 *   }
 * }
 * ```
 */
export interface QueueNames { }

/**
 * Queue name type - extracts keys from QueueNames or falls back to string.
 *
 * When QueueNames is augmented with queue name keys, this type provides:
 * - Type safety: Only declared queue names are valid
 * - Autocomplete: IDE suggestions for available queue names
 *
 * When QueueNames is empty (not augmented), falls back to string
 * for flexibility during development or in non-typed contexts.
 */
export type QueueName = keyof QueueNames extends never ? string : keyof QueueNames

import { augmentTestResponse } from './augment/test-response'

// Load-bearing, despite the value import above resolving the same module: the
// DTS bundler emits the `declare module '@stratal/testing'` block only for a
// module reached by a bare import. Reached through the value import alone, it
// keeps `augmentTestResponse`'s signature and drops the ambient block — which is
// this entry's entire public API. In-repo specs import source and would not
// notice; every consumer would. `tsdown.config.ts` asserts the emitted block.
import './augment/test-response'

// Patch TestResponse.prototype with modal assertion methods
augmentTestResponse()

// Re-export the level shape, so a test can name the props it expects back
export type { ModalData } from './core/wire'
export { modalPropPath } from './core/wire'

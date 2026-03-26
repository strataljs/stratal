import { augmentTestResponse } from './augment/test-response'

// Augmentation (side-effect import: augments TestResponse types)
import './augment/test-response'

// Patch TestResponse.prototype with Inertia assertion methods
augmentTestResponse()

// Re-export useful types for test authors
export type { Page as InertiaPage } from '@inertiajs/core'

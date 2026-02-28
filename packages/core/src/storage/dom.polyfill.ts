/**
 * DOM polyfills for Cloudflare Workers
 *
 * AWS SDK v3 uses DOMParser and Node for XML parsing, which are not available in Workers.
 * This module must be imported BEFORE any AWS SDK imports (including transitive).
 *
 * @see https://github.com/aws/aws-sdk-js-v3/issues/7375
 */
import { DOMParser } from '@xmldom/xmldom'

// DOMParser polyfill for XML response parsing
globalThis.DOMParser = DOMParser

// Node interface polyfill with DOM node type constants
// Required by AWS SDK for XML response parsing
if (typeof globalThis.Node === 'undefined') {
  globalThis.Node = {
    ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4,
    ENTITY_REFERENCE_NODE: 5,
    ENTITY_NODE: 6,
    PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11,
    NOTATION_NODE: 12,
  } as unknown as typeof Node
}

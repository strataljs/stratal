import type { HeadResult } from './head-result'

/**
 * Options for listing stored objects.
 */
export interface ListOptions {
  /**
   * Restrict the listing to objects whose path starts with this prefix, relative to the disk
   * root. Omit to list the whole disk.
   */
  prefix?: string

  /**
   * Continue a previous listing. Pass the `cursor` from a truncated `ListResult`.
   */
  cursor?: string

  /**
   * Maximum objects to return in this page. Providers impose their own ceiling — R2 caps a
   * single list at 1000 — so a larger value does not remove the need to follow `cursor`.
   */
  limit?: number

  /**
   * Populate `contentType` and `metadata` on each listed object.
   *
   * Off by default because it costs page size: R2 returns fewer objects per call when metadata
   * comes with them, so a listing that only needs paths and sizes pays extra round trips for
   * fields it never reads. Turn it on when the listing itself has to inspect content types or
   * custom metadata; leave it off and `head()` the few objects that matter otherwise.
   */
  includeMetadata?: boolean
}

/**
 * One page of a listing.
 *
 * **Listing is paginated, and this type makes that impossible to ignore.** A provider returns at
 * most a page at a time (1000 objects on R2), so code that sums sizes, counts objects, or copies
 * a prefix MUST loop while `truncated` is true, feeding `cursor` back in. Treating the first page
 * as the whole set produces an answer that is quietly too small — and looks entirely reasonable,
 * because nothing failed.
 */
export interface ListResult {
  /**
   * The objects in this page.
   *
   * `path`, `size`, `etag` and `uploadedAt` are always populated. `contentType` and `metadata`
   * are undefined unless the listing asked for them with `includeMetadata`.
   */
  objects: HeadResult[]

  /**
   * True when more objects match than this page contains. When true, `cursor` is set.
   */
  truncated: boolean

  /**
   * Pass to the next `list` call to continue. Undefined when `truncated` is false.
   */
  cursor?: string
}

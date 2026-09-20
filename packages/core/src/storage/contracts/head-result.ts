/**
 * Head Result
 *
 * Metadata for a stored object, read without transferring its body.
 *
 * The point of `head` over `download` is that the body never moves: asking "how big is this"
 * for a hundred objects costs a hundred metadata reads rather than a hundred file transfers.
 */
export interface HeadResult {
  /**
   * Path of the object, relative to the disk root — the same form `download`/`delete` accept,
   * so a result can be fed straight back in without the caller reassembling anything.
   */
  path: string

  /**
   * Size of the object in bytes.
   */
  size: number

  /**
   * MIME type recorded at upload, when the provider stored one.
   */
  contentType?: string

  /**
   * Provider-assigned entity tag, for change detection.
   */
  etag?: string

  /**
   * When the object was last written, when the provider reports it.
   */
  uploadedAt?: Date

  /**
   * Custom key-value metadata stored alongside the object.
   */
  metadata?: Record<string, string>
}

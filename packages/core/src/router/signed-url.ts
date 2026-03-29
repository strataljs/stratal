/**
 * Signed URL utilities using HMAC-SHA256 via Web Crypto API.
 *
 * Follows the Cloudflare Workers signing pattern:
 * https://developers.cloudflare.com/workers/examples/signing-requests/
 *
 * Uses `crypto.subtle.verify()` for timing-attack-safe comparison.
 */

/**
 * Options for signing a URL.
 */
export interface SignedUrlOptions {
  /** Time-to-live in seconds. URL expires after this duration. */
  expiresIn?: number
}

/**
 * Import a signing key for HMAC-SHA256.
 */
async function importKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

/**
 * Encode an ArrayBuffer as base64url (URL-safe base64).
 */
function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Sign a URL with HMAC-SHA256.
 *
 * Appends `signature` and optionally `expires` query parameters.
 * The signature covers the pathname + search (excluding the signature params themselves).
 *
 * @param url - Full URL or path to sign
 * @param secret - HMAC secret key (e.g., from env.APP_SECRET)
 * @param options - Optional expiration
 * @returns URL string with `signature` (and `expires`) query params appended
 */
export async function signUrl(url: string, secret: string, options?: SignedUrlOptions): Promise<string> {
  const parsedUrl = new URL(url, 'https://placeholder.local')
  const key = await importKey(secret)

  // Add expiry if specified
  if (options?.expiresIn) {
    const expires = Math.floor(Date.now() / 1000) + options.expiresIn
    parsedUrl.searchParams.set('expires', String(expires))
  }

  // Sign: pathname + sorted search params (without signature)
  const dataToSign = `${parsedUrl.pathname}?${parsedUrl.searchParams.toString()}`
  const encoder = new TextEncoder()
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign))
  const signature = toBase64Url(signatureBuffer)

  parsedUrl.searchParams.set('signature', signature)
  // Return just the path + query for relative URLs, full URL for absolute
  return url.startsWith('http') ? parsedUrl.toString() : `${parsedUrl.pathname}?${parsedUrl.searchParams.toString()}`
}

/**
 * Verify a signed URL using `crypto.subtle.verify()` (timing-attack-safe).
 *
 * @param url - Full URL or path with signature query param
 * @param secret - HMAC secret key (same key used for signing)
 * @returns true if signature is valid and not expired
 */
export async function verifySignedUrl(url: string, secret: string): Promise<boolean> {
  const parsedUrl = new URL(url, 'https://placeholder.local')
  const signature = parsedUrl.searchParams.get('signature')
  if (!signature) return false

  // Check expiry
  const expires = parsedUrl.searchParams.get('expires')
  if (expires) {
    const expiryTime = parseInt(expires, 10)
    if (isNaN(expiryTime) || Math.floor(Date.now() / 1000) > expiryTime) {
      return false
    }
  }

  // Reconstruct the data that was signed (without signature param)
  parsedUrl.searchParams.delete('signature')
  const dataToVerify = `${parsedUrl.pathname}?${parsedUrl.searchParams.toString()}`

  // Decode base64url signature
  const base64 = signature.replace(/-/g, '+').replace(/_/g, '/')
  const binaryStr = atob(base64)
  const signatureBytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    signatureBytes[i] = binaryStr.charCodeAt(i)
  }

  const key = await importKey(secret)
  const encoder = new TextEncoder()

  // Use crypto.subtle.verify() for timing-attack-safe comparison
  return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(dataToVerify))
}

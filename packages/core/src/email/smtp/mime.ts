import { EmailError } from '../email.error'
import type { ResolvedEmailAttachment, ResolvedEmailMessage } from '../contracts'

interface MimeEnvelope {
  from: string
  to: string[]
}

interface MimeResult {
  raw: string
  envelope: MimeEnvelope
}

/**
 * Hard cap on a single attachment's resolved size (20 MB). Attachments are fully
 * buffered into memory before base64 encoding, so an unbounded attachment would
 * let a single message exhaust the Worker's memory. Exceeding this throws.
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024

function generateBoundary(): string {
  return `----=_Part_${crypto.randomUUID().replace(/-/g, '')}`
}

function generateMessageId(fromEmail: string): string {
  const domain = fromEmail.split('@')[1] || 'localhost'
  return `<${crypto.randomUUID()}@${domain}>`
}

function isAscii(str: string): boolean {
  return /^[ -~]*$/.test(str)
}

/** Remove CR/LF so a value can't inject extra headers (header smuggling). */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]/g, '')
}

/**
 * Encode a header value as one or more RFC 2047 base64 encoded-words, folding so
 * no produced line exceeds the 76-char limit strict MTAs enforce. The UTF-8 byte
 * stream is chunked at <=45 source bytes per encoded-word (<=60 base64 chars,
 * keeping `=?UTF-8?B?...?=` <=75 chars) WITHOUT splitting a multibyte sequence.
 * Multiple encoded-words are folded with CRLF + a single space.
 */
function encodeEncodedWords(clean: string): string {
  const bytes = Buffer.from(clean, 'utf-8')
  const MAX_SOURCE_BYTES = 45
  const words: string[] = []
  let i = 0
  while (i < bytes.length) {
    let end = Math.min(i + MAX_SOURCE_BYTES, bytes.length)
    // Don't split a multibyte UTF-8 sequence: continuation bytes are 0b10xxxxxx.
    // Back off `end` until it sits on a sequence boundary (or we hit the start).
    while (end > i && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--
    }
    const slice = bytes.subarray(i, end)
    words.push(`=?UTF-8?B?${slice.toString('base64')}?=`)
    i = end
  }
  return words.join('\r\n ')
}

function encodeHeaderValue(value: string): string {
  const clean = stripCrlf(value)
  if (isAscii(clean)) return clean
  return encodeEncodedWords(clean)
}

/**
 * Validate an envelope address (used verbatim in `MAIL FROM`/`RCPT TO` SMTP
 * commands). Raw CR/LF would allow SMTP command injection, so we throw rather
 * than silently strip — a corrupted envelope must never reach the wire.
 */
function assertNoCrlf(address: string): void {
  if (/[\r\n]/.test(address)) {
    throw new EmailError('Email envelope address contains CR/LF, which would allow SMTP command injection')
  }
}

/**
 * Escape a value for an RFC 5322 quoted-string: backslash MUST be escaped first
 * (so the escapes added for `"` aren't themselves re-escaped), then `"`.
 */
function escapeQuotedString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Encode a MIME parameter (e.g. `name`/`filename`) safely. ASCII values are
 * emitted as a quoted-string with `"`/`\` escaped; non-ASCII values use the
 * RFC 2231 extended syntax (`param*=UTF-8''…`). CR/LF are always stripped so a
 * crafted filename can't inject headers or break the MIME structure.
 */
function encodeMimeParam(param: string, value: string): string {
  const clean = stripCrlf(value)
  if (isAscii(clean)) {
    return `${param}="${escapeQuotedString(clean)}"`
  }
  const encoded = Array.from(Buffer.from(clean, 'utf-8'))
    .map((b) => (/[A-Za-z0-9!#$&+\-.^_`|~]/.test(String.fromCharCode(b))
      ? String.fromCharCode(b)
      : `%${b.toString(16).toUpperCase().padStart(2, '0')}`))
    .join('')
  return `${param}*=UTF-8''${encoded}`
}

/**
 * Extract the bare address for the SMTP envelope and validate it has no raw
 * CR/LF before it is written into a `MAIL FROM`/`RCPT TO` command.
 */
function extractEmail(address: string): string {
  assertNoCrlf(address)
  const match = address.match(/<([^>]+)>/)
  const email = (match ? match[1] : address).trim()
  // The bare address is written verbatim into `MAIL FROM:<…>` / `RCPT TO:<…>`.
  // Beyond CR/LF (checked above), reject whitespace and stray angle brackets
  // that could break out of the brackets or desync the command (e.g.
  // `a>b@x.com` → `MAIL FROM:<a>b@x.com>`).
  if (/[<>\s]/.test(email)) {
    throw new EmailError(`Invalid email address for SMTP envelope: ${JSON.stringify(address)}`)
  }
  return email
}

function formatAddress(email: string, name?: string): string {
  const cleanEmail = stripCrlf(email)
  if (!name) return cleanEmail
  const cleanName = stripCrlf(name)
  const encodedName = isAscii(cleanName) ? `"${escapeQuotedString(cleanName)}"` : encodeHeaderValue(cleanName)
  return `${encodedName} <${cleanEmail}>`
}

function formatDate(date: Date): string {
  return date.toUTCString().replace('GMT', '+0000')
}

function wrapBase64(base64: string): string {
  const lines: string[] = []
  for (let i = 0; i < base64.length; i += 76) {
    lines.push(base64.slice(i, i + 76))
  }
  return lines.join('\r\n')
}

async function resolveContent(content: ResolvedEmailAttachment['content']): Promise<Buffer> {
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(await new Response(content).arrayBuffer())
  if (buffer.byteLength > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new EmailError(
      `Email attachment exceeds the maximum size of ${MAX_ATTACHMENT_SIZE_BYTES} bytes (got ${buffer.byteLength} bytes)`,
    )
  }
  return buffer
}

/** Base64-encode a text body so arbitrary content (long lines, leading dots,
 * 8-bit data) is transported safely regardless of line length or SMTP escaping. */
function encodeTextBody(content: string): string {
  return wrapBase64(Buffer.from(content, 'utf-8').toString('base64'))
}

function buildBodyPart(
  text: string | undefined,
  html: string | undefined,
): { content: string; contentType: string; cte?: string } {
  if (text && html) {
    const boundary = generateBoundary()
    const content = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeTextBody(text),
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeTextBody(html),
      `--${boundary}--`,
    ].join('\r\n')
    return { content, contentType: `multipart/alternative; boundary="${boundary}"` }
  }

  if (html) {
    return { content: encodeTextBody(html), contentType: 'text/html; charset=utf-8', cte: 'base64' }
  }

  return { content: encodeTextBody(text ?? ''), contentType: 'text/plain; charset=utf-8', cte: 'base64' }
}

async function buildAttachmentPart(attachment: ResolvedEmailAttachment): Promise<string> {
  const buffer = await resolveContent(attachment.content)
  const base64 = wrapBase64(buffer.toString('base64'))
  return [
    `Content-Type: ${attachment.contentType || 'application/octet-stream'}; ${encodeMimeParam('name', attachment.filename)}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; ${encodeMimeParam('filename', attachment.filename)}`,
    '',
    base64,
  ].join('\r\n')
}

export async function buildMimeMessage(
  message: ResolvedEmailMessage,
  defaultFrom: { name: string; email: string },
): Promise<MimeResult> {
  const fromAddr = message.from
    ? formatAddress(message.from.email, message.from.name)
    : formatAddress(defaultFrom.email, defaultFrom.name)

  const fromEmail = extractEmail(message.from?.email ?? defaultFrom.email)

  const toList = Array.isArray(message.to) ? message.to : [message.to]

  const headers: string[] = [
    `From: ${fromAddr}`,
    `To: ${toList.map(stripCrlf).join(', ')}`,
    `Subject: ${encodeHeaderValue(message.subject)}`,
    `Date: ${formatDate(new Date())}`,
    `Message-ID: ${generateMessageId(fromEmail)}`,
    'MIME-Version: 1.0',
  ]

  if (message.replyTo) headers.push(`Reply-To: ${stripCrlf(message.replyTo)}`)
  if (message.cc?.length) headers.push(`Cc: ${message.cc.map(stripCrlf).join(', ')}`)

  const allRecipients = [
    ...toList,
    ...(message.cc ?? []),
    ...(message.bcc ?? []),
  ].map(extractEmail)

  const body = buildBodyPart(message.text, message.html)
  const hasAttachments = message.attachments && message.attachments.length > 0

  if (!hasAttachments) {
    headers.push(`Content-Type: ${body.contentType}`)
    if (body.cte) {
      headers.push(`Content-Transfer-Encoding: ${body.cte}`)
    }

    return {
      raw: headers.join('\r\n') + '\r\n\r\n' + body.content,
      envelope: { from: fromEmail, to: allRecipients },
    }
  }

  const mixedBoundary = generateBoundary()
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)

  const parts: string[] = [
    `--${mixedBoundary}`,
    `Content-Type: ${body.contentType}`,
  ]

  if (body.cte) {
    parts.push(`Content-Transfer-Encoding: ${body.cte}`)
  }

  parts.push('', body.content)

  for (const attachment of message.attachments!) {
    parts.push(`--${mixedBoundary}`)
    parts.push(await buildAttachmentPart(attachment))
  }

  parts.push(`--${mixedBoundary}--`)

  return {
    raw: headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n'),
    envelope: { from: fromEmail, to: allRecipients },
  }
}

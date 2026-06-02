import type { ResolvedEmailAttachment, ResolvedEmailMessage } from '../contracts'

interface MimeEnvelope {
  from: string
  to: string[]
}

interface MimeResult {
  raw: string
  envelope: MimeEnvelope
}

function generateBoundary(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = '----=_Part_'
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function generateMessageId(fromEmail: string): string {
  const domain = fromEmail.split('@')[1] || 'localhost'
  const unique = `${Date.now()}.${Math.random().toString(36).slice(2, 10)}`
  return `<${unique}@${domain}>`
}

function isAscii(str: string): boolean {
  return /^[ -~]*$/.test(str)
}

/** Remove CR/LF so a value can't inject extra headers (header smuggling). */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]/g, '')
}

function encodeHeaderValue(value: string): string {
  const clean = stripCrlf(value)
  if (isAscii(clean)) return clean
  const encoded = Buffer.from(value, 'utf-8').toString('base64')
  return `=?UTF-8?B?${encoded}?=`
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
    const escaped = clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `${param}="${escaped}"`
  }
  const encoded = Array.from(Buffer.from(clean, 'utf-8'))
    .map((b) => (/[A-Za-z0-9!#$&+\-.^_`|~]/.test(String.fromCharCode(b))
      ? String.fromCharCode(b)
      : `%${b.toString(16).toUpperCase().padStart(2, '0')}`))
    .join('')
  return `${param}*=UTF-8''${encoded}`
}

function extractEmail(address: string): string {
  const match = address.match(/<([^>]+)>/)
  return match ? match[1] : address.trim()
}

function formatAddress(email: string, name?: string): string {
  const cleanEmail = stripCrlf(email)
  if (!name) return cleanEmail
  const encodedName = isAscii(stripCrlf(name)) ? `"${stripCrlf(name).replace(/"/g, '\\"')}"` : encodeHeaderValue(name)
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
  if (Buffer.isBuffer(content)) return content
  const response = new Response(content)
  return Buffer.from(await response.arrayBuffer())
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

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

function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value
  const encoded = Buffer.from(value, 'utf-8').toString('base64')
  return `=?UTF-8?B?${encoded}?=`
}

function formatAddress(email: string, name?: string): string {
  if (!name) return email
  const encodedName = isAscii(name) ? `"${name.replace(/"/g, '\\"')}"` : encodeHeaderValue(name)
  return `${encodedName} <${email}>`
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

function buildBodyPart(text: string | undefined, html: string | undefined): { content: string; contentType: string } {
  if (text && html) {
    const boundary = generateBoundary()
    const content = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      html,
      `--${boundary}--`,
    ].join('\r\n')
    return { content, contentType: `multipart/alternative; boundary="${boundary}"` }
  }

  if (html) {
    return { content: html, contentType: 'text/html; charset=utf-8' }
  }

  return { content: text ?? '', contentType: 'text/plain; charset=utf-8' }
}

async function buildAttachmentPart(attachment: ResolvedEmailAttachment): Promise<string> {
  const buffer = await resolveContent(attachment.content)
  const base64 = wrapBase64(buffer.toString('base64'))
  return [
    `Content-Type: ${attachment.contentType || 'application/octet-stream'}; name="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
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

  const fromEmail = message.from?.email ?? defaultFrom.email

  const toList = Array.isArray(message.to) ? message.to : [message.to]

  const headers: string[] = [
    `From: ${fromAddr}`,
    `To: ${toList.join(', ')}`,
    `Subject: ${encodeHeaderValue(message.subject)}`,
    `Date: ${formatDate(new Date())}`,
    `Message-ID: ${generateMessageId(fromEmail)}`,
    'MIME-Version: 1.0',
  ]

  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`)
  if (message.cc?.length) headers.push(`Cc: ${message.cc.join(', ')}`)

  const allRecipients = [
    ...toList,
    ...(message.cc ?? []),
    ...(message.bcc ?? []),
  ]

  const body = buildBodyPart(message.text, message.html)
  const hasAttachments = message.attachments && message.attachments.length > 0

  if (!hasAttachments) {
    headers.push(`Content-Type: ${body.contentType}`)
    if (!body.contentType.startsWith('multipart/')) {
      headers.push('Content-Transfer-Encoding: 8bit')
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

  if (!body.contentType.startsWith('multipart/')) {
    parts.push('Content-Transfer-Encoding: 8bit')
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

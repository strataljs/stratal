import { describe, expect, it } from 'vitest'
import { buildMimeMessage, MAX_ATTACHMENT_SIZE_BYTES } from '../smtp/mime'
import { EmailError } from '../email.error'
import type { ResolvedEmailMessage } from '../contracts'

const defaultFrom = { name: 'Test App', email: 'noreply@example.com' }

function parseHeaders(raw: string): Record<string, string> {
  const [headerBlock] = raw.split('\r\n\r\n')
  const headers: Record<string, string> = {}
  for (const line of headerBlock.split('\r\n')) {
    const idx = line.indexOf(': ')
    if (idx > 0) {
      headers[line.slice(0, idx)] = line.slice(idx + 2)
    }
  }
  return headers
}

function getBody(raw: string): string {
  const idx = raw.indexOf('\r\n\r\n')
  return raw.slice(idx + 4)
}

describe('buildMimeMessage', () => {
  describe('RFC 5322 — Internet Message Format', () => {
    it('should include required headers: From, To, Subject, Date, Message-ID, MIME-Version', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['From']).toBeDefined()
      expect(headers['To']).toBeDefined()
      expect(headers['Subject']).toBeDefined()
      expect(headers['Date']).toBeDefined()
      expect(headers['Message-ID']).toBeDefined()
      expect(headers['MIME-Version']).toBe('1.0')
    })

    it('should format From as "Name" <email>', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['From']).toBe('"Test App" <noreply@example.com>')
    })

    it('should format To as comma-separated list for multiple recipients', async () => {
      const message: ResolvedEmailMessage = { to: ['a@test.com', 'b@test.com'], subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['To']).toBe('a@test.com, b@test.com')
    })

    it('should generate Message-ID in <unique@domain> format', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Message-ID']).toMatch(/^<.+@example\.com>$/)
    })

    it('should use message from when provided, overriding default', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        from: { name: 'Custom', email: 'custom@other.com' },
      }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['From']).toContain('custom@other.com')
      expect(result.envelope.from).toBe('custom@other.com')
    })
  })

  describe('RFC 2047 — Non-ASCII Header Encoding', () => {
    it('should pass ASCII-only subjects through unencoded', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Hello World', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Subject']).toBe('Hello World')
    })

    it('should encode non-ASCII subjects as =?UTF-8?B?...?=', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Héllo Wörld', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Subject']).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
      const encoded = headers['Subject'].match(/=\?UTF-8\?B\?(.+)\?=/)![1]
      expect(Buffer.from(encoded, 'base64').toString('utf-8')).toBe('Héllo Wörld')
    })

    it('should encode non-ASCII display names', async () => {
      const from = { name: 'Ünïcödé', email: 'test@example.com' }
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, from)
      const headers = parseHeaders(result.raw)

      expect(headers['From']).toMatch(/^=\?UTF-8\?B\?.+\?= <test@example\.com>$/)
    })
  })

  describe('RFC 2046 — Multipart', () => {
    it('should use text/plain for text-only messages', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', text: 'Hello' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Content-Type']).toBe('text/plain; charset=utf-8')
      expect(headers['Content-Transfer-Encoding']).toBe('base64')
      expect(getBody(result.raw)).toBe(Buffer.from('Hello', 'utf-8').toString('base64'))
    })

    it('should use text/html for HTML-only messages', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hello</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Content-Type']).toBe('text/html; charset=utf-8')
      expect(headers['Content-Transfer-Encoding']).toBe('base64')
      expect(getBody(result.raw)).toBe(Buffer.from('<p>Hello</p>', 'utf-8').toString('base64'))
    })

    it('should use multipart/alternative for text + HTML', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', text: 'Hello', html: '<p>Hello</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Content-Type']).toMatch(/^multipart\/alternative; boundary="(.+)"$/)
      const body = getBody(result.raw)
      expect(body).toContain('text/plain; charset=utf-8')
      expect(body).toContain('text/html; charset=utf-8')
      expect(body).toContain('Content-Transfer-Encoding: base64')
      expect(body).toContain(Buffer.from('Hello', 'utf-8').toString('base64'))
      expect(body).toContain(Buffer.from('<p>Hello</p>', 'utf-8').toString('base64'))
    })

    it('should put text part before HTML part in multipart/alternative', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', text: 'Plain', html: '<p>Rich</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const body = getBody(result.raw)

      const textPos = body.indexOf('text/plain')
      const htmlPos = body.indexOf('text/html')
      expect(textPos).toBeLessThan(htmlPos)
    })

    it('should use multipart/mixed when attachments are present', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'test.txt', content: Buffer.from('data'), contentType: 'text/plain' }],
      }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Content-Type']).toMatch(/^multipart\/mixed; boundary="(.+)"$/)
    })

    it('should nest multipart/alternative inside multipart/mixed for text + HTML + attachments', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Plain',
        html: '<p>Rich</p>',
        attachments: [{ filename: 'test.txt', content: Buffer.from('data'), contentType: 'text/plain' }],
      }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Content-Type']).toMatch(/multipart\/mixed/)
      const body = getBody(result.raw)
      expect(body).toContain('multipart/alternative')
      expect(body).toContain('text/plain; charset=utf-8')
      expect(body).toContain('text/html; charset=utf-8')
    })

    it('should generate unique boundaries per message', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', text: 'Hi', html: '<p>Hi</p>' }
      const r1 = await buildMimeMessage(message, defaultFrom)
      const r2 = await buildMimeMessage(message, defaultFrom)
      const b1 = parseHeaders(r1.raw)['Content-Type'].match(/boundary="(.+)"/)?.[1]
      const b2 = parseHeaders(r2.raw)['Content-Type'].match(/boundary="(.+)"/)?.[1]

      expect(b1).not.toBe(b2)
    })

    it('should terminate multipart with --boundary--', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', text: 'Hi', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)
      const boundary = parseHeaders(result.raw)['Content-Type'].match(/boundary="(.+)"/)?.[1]

      expect(result.raw).toContain(`--${boundary}--`)
    })
  })

  describe('RFC 2045 — Content-Transfer-Encoding', () => {
    it('should base64-encode attachment content', async () => {
      const content = Buffer.from('file content here')
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'file.txt', content, contentType: 'text/plain' }],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).toContain('Content-Transfer-Encoding: base64')
      expect(result.raw).toContain(content.toString('base64'))
    })

    it('should wrap base64 lines at 76 characters', async () => {
      const content = Buffer.alloc(200, 'A')
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'large.bin', content, contentType: 'application/octet-stream' }],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      const dispositionMarker = `Content-Disposition: attachment; filename="large.bin"\r\n\r\n`
      const startIdx = result.raw.indexOf(dispositionMarker)
      expect(startIdx).toBeGreaterThan(-1)
      const afterMarker = result.raw.slice(startIdx + dispositionMarker.length)
      const endIdx = afterMarker.indexOf('\r\n--')
      const base64Section = endIdx > -1 ? afterMarker.slice(0, endIdx) : afterMarker
      const lines = base64Section.split('\r\n').filter(l => l.length > 0)
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(76)
      }
    })

    it('should handle ReadableStream attachment content', async () => {
      const data = new TextEncoder().encode('stream content')
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data)
          controller.close()
        },
      })
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'stream.txt', content: stream as unknown as ReadableStream, contentType: 'text/plain' }],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).toContain(Buffer.from('stream content').toString('base64'))
    })

    it('should set Content-Disposition: attachment with filename', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'report.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' }],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).toContain('Content-Disposition: attachment; filename="report.pdf"')
    })
  })

  describe('Optional headers', () => {
    it('should include Reply-To when set', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>', replyTo: 'reply@example.com' }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Reply-To']).toBe('reply@example.com')
    })

    it('should omit Reply-To when not set', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).not.toContain('Reply-To:')
    })

    it('should include Cc header when set', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>', cc: ['cc1@test.com', 'cc2@test.com'] }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(headers['Cc']).toBe('cc1@test.com, cc2@test.com')
    })

    it('should never include Bcc in message headers (RFC 5322 §3.6.3)', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>', bcc: ['bcc@test.com'] }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).not.toContain('Bcc:')
      expect(result.envelope.to).toContain('bcc@test.com')
    })

    it('should omit Cc when not set', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).not.toContain('Cc:')
    })
  })

  describe('RFC 5322 — Edge cases', () => {
    it('should generate unique Message-IDs across calls', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const r1 = await buildMimeMessage(message, defaultFrom)
      const r2 = await buildMimeMessage(message, defaultFrom)
      const id1 = parseHeaders(r1.raw)['Message-ID']
      const id2 = parseHeaders(r2.raw)['Message-ID']

      expect(id1).not.toBe(id2)
    })

    it('should use email only when From has no display name', async () => {
      const from = { name: '', email: 'bare@example.com' }
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, from)
      const headers = parseHeaders(result.raw)

      expect(headers['From']).toBe('bare@example.com')
    })

    it('should escape quotes in display names', async () => {
      const from = { name: 'O\'Brien "Bob"', email: 'bob@example.com' }
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, from)
      const headers = parseHeaders(result.raw)

      expect(headers['From']).toContain('\\"Bob\\"')
    })

    it('should escape backslashes before quotes in display names', async () => {
      const from = { name: 'Back\\slash "Q"', email: 'bs@example.com' }
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, from)
      const headers = parseHeaders(result.raw)

      // Each literal backslash → \\ and each quote → \" ; order matters so the
      // escapes added for the quote aren't themselves re-escaped.
      expect(headers['From']).toBe('"Back\\\\slash \\"Q\\"" <bs@example.com>')
    })

    it('should use CRLF line endings throughout', async () => {
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)

      const bareNewlines = result.raw.replace(/\r\n/g, '').match(/\n/)
      expect(bareNewlines).toBeNull()
    })
  })

  describe('Header injection hardening', () => {
    it('should strip CR/LF from the subject to prevent header injection', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Hello\r\nBcc: attacker@evil.com',
        html: '<p>Hi</p>',
      }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      // The text survives inline in the Subject, but must NOT appear as its own
      // header line (no CRLF before it).
      expect(result.raw).not.toContain('\r\nBcc:')
      expect(headers['Subject']).toBe('HelloBcc: attacker@evil.com')
    })

    it('should strip CR/LF and escape quotes in attachment filenames', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{
          filename: 'x";\r\nContent-Type: evil',
          content: Buffer.from('data'),
          contentType: 'text/plain',
        }],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      // No injected header line, and the embedded quote is backslash-escaped.
      expect(result.raw).not.toContain('\r\nContent-Type: evil')
      expect(result.raw).toContain('filename="x\\";Content-Type: evil"')
    })

    it('should RFC 2231-encode non-ASCII attachment filenames', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'résumé.pdf', content: Buffer.from('data'), contentType: 'application/pdf' }],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).toContain("filename*=UTF-8''")
      expect(result.raw).toContain('r%C3%A9sum%C3%A9.pdf')
    })

    it('should neutralize CR/LF embedded in a non-ASCII subject (no injected header)', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        // Non-ASCII forces RFC 2047 encoding; the CRLF must be stripped BEFORE
        // base64 so it can't survive inside the encoded-word.
        subject: 'Héllo\r\nBcc: attacker@evil.com',
        html: '<p>Hi</p>',
      }
      const result = await buildMimeMessage(message, defaultFrom)
      const headers = parseHeaders(result.raw)

      expect(result.raw).not.toContain('\r\nBcc:')
      const encoded = headers['Subject'].match(/=\?UTF-8\?B\?([^?]+)\?=/)![1]
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
      expect(decoded).not.toContain('\r')
      expect(decoded).not.toContain('\n')
      expect(decoded).toBe('HélloBcc: attacker@evil.com')
    })

    it('should neutralize CR/LF embedded in a non-ASCII display name', async () => {
      const from = { name: 'Ünïcödé\r\nBcc: attacker@evil.com', email: 'test@example.com' }
      const message: ResolvedEmailMessage = { to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, from)

      expect(result.raw).not.toContain('\r\nBcc:')
      const headers = parseHeaders(result.raw)
      const encoded = headers['From'].match(/=\?UTF-8\?B\?([^?]+)\?=/)![1]
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
      expect(decoded).toBe('ÜnïcödéBcc: attacker@evil.com')
    })

    it('should fold a long non-ASCII subject into multiple encoded-words each <=75 chars', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Ünïcödé '.repeat(40), // long, non-ASCII → must fold
        html: '<p>Hi</p>',
      }
      const result = await buildMimeMessage(message, defaultFrom)
      const [headerBlock] = result.raw.split('\r\n\r\n')

      // The Subject is folded across continuation lines (CRLF + single space).
      const subjectLines: string[] = []
      let capturing = false
      for (const line of headerBlock.split('\r\n')) {
        if (line.startsWith('Subject:')) { capturing = true; subjectLines.push(line); continue }
        if (capturing && line.startsWith(' ')) { subjectLines.push(line); continue }
        if (capturing) break
      }

      expect(subjectLines.length).toBeGreaterThan(1)
      const words = result.raw.match(/=\?UTF-8\?B\?[^?]+\?=/g)!
      expect(words.length).toBeGreaterThan(1)
      for (const word of words) {
        expect(word.length).toBeLessThanOrEqual(75)
      }

      // Round-trips back to the original (concatenate decoded bytes from each word).
      const reassembled = words
        .map(w => Buffer.from(w.match(/=\?UTF-8\?B\?([^?]+)\?=/)![1], 'base64'))
      const decoded = Buffer.concat(reassembled).toString('utf-8')
      expect(decoded).toBe('Ünïcödé '.repeat(40))
    })

    it('should throw when an envelope (to) address contains CR/LF', async () => {
      const message: ResolvedEmailMessage = {
        to: 'victim@example.com\r\nRCPT TO:<attacker@evil.com>',
        subject: 'Test',
        html: '<p>Hi</p>',
      }
      await expect(buildMimeMessage(message, defaultFrom)).rejects.toThrow(EmailError)
    })

    it('should throw when an envelope (cc) address contains CR/LF', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        cc: ['ok@example.com', 'bad@example.com\r\nDATA'],
      }
      await expect(buildMimeMessage(message, defaultFrom)).rejects.toThrow(/SMTP command injection/i)
    })
  })

  describe('Attachment size limit', () => {
    it('should throw when an attachment exceeds the max size', async () => {
      const oversize = Buffer.alloc(MAX_ATTACHMENT_SIZE_BYTES + 1, 0)
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'big.bin', content: oversize, contentType: 'application/octet-stream' }],
      }
      await expect(buildMimeMessage(message, defaultFrom)).rejects.toThrow(/maximum size/i)
    })

    it('should accept an attachment exactly at the max size', async () => {
      const atLimit = Buffer.alloc(MAX_ATTACHMENT_SIZE_BYTES, 0)
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'limit.bin', content: atLimit, contentType: 'application/octet-stream' }],
      }
      await expect(buildMimeMessage(message, defaultFrom)).resolves.toBeDefined()
    })
  })

  describe('Multiple attachments', () => {
    it('should include all attachments in multipart/mixed', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [
          { filename: 'a.txt', content: Buffer.from('aaa'), contentType: 'text/plain' },
          { filename: 'b.pdf', content: Buffer.from('bbb'), contentType: 'application/pdf' },
        ],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).toContain('filename="a.txt"')
      expect(result.raw).toContain('filename="b.pdf"')
      expect(result.raw).toContain(Buffer.from('aaa').toString('base64'))
      expect(result.raw).toContain(Buffer.from('bbb').toString('base64'))
    })

    it('should default contentType to application/octet-stream when missing', async () => {
      const message: ResolvedEmailMessage = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'unknown.bin', content: Buffer.from('data'), contentType: '' }],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.raw).toContain('Content-Type: application/octet-stream')
    })
  })

  describe('Envelope', () => {
    it('should include all recipients (to + cc + bcc) in envelope', async () => {
      const message: ResolvedEmailMessage = {
        to: ['to@test.com'],
        subject: 'Test',
        html: '<p>Hi</p>',
        cc: ['cc@test.com'],
        bcc: ['bcc@test.com'],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.envelope.to).toEqual(['to@test.com', 'cc@test.com', 'bcc@test.com'])
      expect(result.envelope.from).toBe('noreply@example.com')
    })

    it('should extract bare email from formatted addresses in envelope', async () => {
      const message: ResolvedEmailMessage = {
        to: ['"John Doe" <john@test.com>', 'bare@test.com'],
        subject: 'Test',
        html: '<p>Hi</p>',
        cc: ['Cc User <cc@test.com>'],
        bcc: ['bcc@test.com'],
      }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.envelope.to).toEqual(['john@test.com', 'bare@test.com', 'cc@test.com', 'bcc@test.com'])
    })

    it('should extract bare email for envelope from address', async () => {
      const from = { name: 'App', email: 'noreply@example.com' }
      const message: ResolvedEmailMessage = { to: 'user@test.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, from)

      expect(result.envelope.from).toBe('noreply@example.com')
    })

    it('should handle string to as single-element array', async () => {
      const message: ResolvedEmailMessage = { to: 'single@test.com', subject: 'Test', html: '<p>Hi</p>' }
      const result = await buildMimeMessage(message, defaultFrom)

      expect(result.envelope.to).toEqual(['single@test.com'])
    })
  })
})

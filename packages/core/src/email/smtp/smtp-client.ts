import { EmailError } from '../email.error';
import type { SmtpConfig } from '../email.module';

interface SmtpSendOptions {
  from: string
  to: string[]
}

interface SmtpSendResult {
  messageId: string
}

interface ParsedSmtpUrl {
  host: string
  port: number
  secure: boolean
  username?: string
  password?: string
}

function parseSmtpUrl(config: SmtpConfig): ParsedSmtpUrl {
  try {
    const parsed = new URL(config.url)
    const secure = parsed.protocol === 'smtps:'
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : (secure ? 465 : 587),
      secure,
      username: parsed.username || undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    }
  }
  catch {
    throw new EmailError(`Invalid SMTP URL: ${config.url}`)
  }
}

export class SmtpClient {
  private readonly parsed: ParsedSmtpUrl

  constructor(config: SmtpConfig) {
    this.parsed = parseSmtpUrl(config)
  }

  async send(mimeRaw: string, options: SmtpSendOptions): Promise<SmtpSendResult> {
    const { connect } = await import('cloudflare:sockets')
    const { host, port, secure, username, password } = this.parsed
    const implicitTls = secure || port === 465
    const socket = connect(
      { hostname: host, port },
      { secureTransport: implicitTls ? 'on' : 'starttls', allowHalfOpen: false },
    )

    const reader = socket.readable.getReader()
    const writer = socket.writable.getWriter()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    const readResponse = async (): Promise<{ code: number; text: string }> => {
      let buffer = ''
      while (true) {
        const result = await reader.read()
        if (result.done) throw new EmailError('SMTP connection closed unexpectedly')
        buffer += decoder.decode(result.value as Uint8Array, { stream: true })

        const lines = buffer.split('\r\n')
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i]
          const code = parseInt(line.slice(0, 3), 10)
          if (line[3] === ' ') {
            return { code, text: buffer }
          }
        }
        buffer = lines[lines.length - 1]
      }
    }

    const sendCommand = async (command: string): Promise<{ code: number; text: string }> => {
      await writer.write(encoder.encode(command + '\r\n'))
      return readResponse()
    }

    const expectCode = async (command: string, expected: number): Promise<string> => {
      const response = await sendCommand(command)
      if (response.code !== expected) {
        throw new EmailError(`SMTP error: expected ${expected}, got ${response.code}: ${response.text.trim()}`)
      }
      return response.text
    }

    try {
      const greeting = await readResponse()
      if (greeting.code !== 220) {
        throw new EmailError(`SMTP server rejected connection: ${greeting.text.trim()}`)
      }

      const ehloResponse = await expectCode(`EHLO ${host}`, 250)
      const supportsStartTls = ehloResponse.toUpperCase().includes('STARTTLS')

      if (!implicitTls && supportsStartTls) {
        await expectCode('STARTTLS', 220)
        socket.startTls()
        await expectCode(`EHLO ${host}`, 250)
      }

      if (username && password) {
        const credentials = Buffer.from(`\0${username}\0${password}`).toString('base64')
        await expectCode(`AUTH PLAIN ${credentials}`, 235)
      }

      await expectCode(`MAIL FROM:<${options.from}>`, 250)

      for (const recipient of options.to) {
        await expectCode(`RCPT TO:<${recipient}>`, 250)
      }

      await expectCode('DATA', 354)

      const dotStuffed = (mimeRaw.startsWith('.') ? '.' + mimeRaw : mimeRaw).replace(/\r\n\./g, '\r\n..')
      await writer.write(encoder.encode(dotStuffed + '\r\n.\r\n'))
      const dataResponse = await readResponse()
      if (dataResponse.code !== 250) {
        throw new EmailError(`SMTP DATA rejected: ${dataResponse.text.trim()}`)
      }

      const messageIdMatch = dataResponse.text.match(/<([^>]+)>/)
      const messageId = messageIdMatch?.[1] ?? `${Date.now()}@${host}`

      await sendCommand('QUIT')

      return { messageId }
    }
    finally {
      reader.releaseLock()
      writer.releaseLock()
      await socket.close()
    }
  }
}

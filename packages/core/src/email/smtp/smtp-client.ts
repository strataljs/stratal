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

/** Advertised EHLO capabilities and the SASL mechanisms the server accepts. */
interface SmtpCapabilities {
  startTls: boolean
  auth: Set<string>
}

/** Abort a server read if it stalls, so a hung endpoint can't wedge the Worker. */
const RESPONSE_TIMEOUT_MS = 30_000

function parseSmtpUrl(config: SmtpConfig): ParsedSmtpUrl {
  try {
    const parsed = new URL(config.url)
    const secure = parsed.protocol === 'smtps:'
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : (secure ? 465 : 587),
      secure,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    }
  }
  catch {
    throw new EmailError(`Invalid SMTP URL: ${config.url}`)
  }
}

/** Parse an EHLO reply into the capabilities/mechanisms it advertises. */
function parseCapabilities(ehloText: string): SmtpCapabilities {
  const auth = new Set<string>()
  let startTls = false
  for (const rawLine of ehloText.split('\r\n')) {
    // Lines look like `250-STARTTLS` / `250 AUTH PLAIN LOGIN`; drop the code+sep.
    const line = rawLine.slice(4).trim().toUpperCase()
    if (!line) continue
    const [keyword, ...rest] = line.split(/\s+/)
    if (keyword === 'STARTTLS') startTls = true
    if (keyword === 'AUTH') rest.forEach((m) => auth.add(m))
  }
  return { startTls, auth }
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

    const readChunk = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      const read = reader.read() as Promise<ReadableStreamReadResult<Uint8Array>>
      // Swallow a late settlement if the timeout wins, so it can't become an
      // unhandled rejection after we've already moved on / closed the socket.
      read.catch(() => { /* swallow late settlement; the timeout already rejected */ })
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new EmailError(`SMTP timeout: no response within ${RESPONSE_TIMEOUT_MS}ms`)),
          RESPONSE_TIMEOUT_MS,
        )
      })
      try {
        return await Promise.race([read, timeout])
      }
      finally {
        clearTimeout(timer)
      }
    }

    // Bytes the server pipelined after a reply's terminating line must survive
    // across readResponse() calls, or the next read drops them and the protocol
    // desyncs. This leftover persists for the lifetime of this send().
    let leftover = ''

    const readResponse = async (): Promise<{ code: number; text: string }> => {
      let buffer = leftover
      leftover = ''
      while (true) {
        // The leftover may already contain a complete reply (the server packed
        // multiple replies into one TCP segment), so scan before reading more.
        const newlineIdx = buffer.indexOf('\r\n')
        if (newlineIdx !== -1) {
          const lines = buffer.split('\r\n')
          let consumed = 0
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i]
            consumed += line.length + 2 // include the '\r\n'
            // A terminating reply line has a space (not '-') after the 3-digit code.
            if (line[3] === ' ') {
              const code = parseInt(line.slice(0, 3), 10)
              leftover = buffer.slice(consumed)
              return { code, text: buffer.slice(0, consumed) }
            }
          }
        }

        const result = await readChunk()
        if (result.done) throw new EmailError('SMTP connection closed unexpectedly')
        buffer += decoder.decode(result.value, { stream: true })
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

      let capabilities = parseCapabilities(await expectCode(`EHLO ${host}`, 250))

      // Upgrade to TLS when the server offers STARTTLS, then re-issue EHLO — the
      // post-TLS capability list is the authoritative one (servers commonly only
      // advertise AUTH after the channel is encrypted).
      let encrypted = implicitTls
      if (!implicitTls && capabilities.startTls) {
        await expectCode('STARTTLS', 220)
        socket.startTls()
        capabilities = parseCapabilities(await expectCode(`EHLO ${host}`, 250))
        encrypted = true
      }

      if (username && password) {
        // Never put credentials on the wire in cleartext. If the URL is `smtp://`
        // and the server didn't offer STARTTLS, this is a misconfiguration (or a
        // STARTTLS-stripping downgrade attack) — fail loudly rather than leak the
        // password. Use `smtps://` (implicit TLS) for servers without STARTTLS.
        if (!encrypted) {
          throw new EmailError(
            'Refusing to send SMTP credentials over an unencrypted connection: the server did not offer STARTTLS. Use an smtps:// URL or a server that supports STARTTLS.',
          )
        }
        await this.authenticate(expectCode, capabilities, username, password)
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

      // QUIT is best-effort: the message is already accepted, so a failed/closed
      // QUIT must not turn a successful send into a thrown error.
      await sendCommand('QUIT').catch(() => { /* best-effort; message already accepted */ })

      return { messageId }
    }
    finally {
      reader.releaseLock()
      writer.releaseLock()
      await socket.close().catch(() => { /* best-effort close */ })
    }
  }

  /** Authenticate using a server-advertised SASL mechanism (PLAIN or LOGIN). */
  private async authenticate(
    expectCode: (command: string, expected: number) => Promise<string>,
    capabilities: SmtpCapabilities,
    username: string,
    password: string,
  ): Promise<void> {
    if (capabilities.auth.has('PLAIN')) {
      const credentials = Buffer.from(`\0${username}\0${password}`).toString('base64')
      await expectCode(`AUTH PLAIN ${credentials}`, 235)
      return
    }
    if (capabilities.auth.has('LOGIN')) {
      await expectCode('AUTH LOGIN', 334)
      await expectCode(Buffer.from(username).toString('base64'), 334)
      await expectCode(Buffer.from(password).toString('base64'), 235)
      return
    }
    throw new EmailError(
      capabilities.auth.size === 0
        ? 'SMTP credentials were provided but the server does not advertise AUTH.'
        : `SMTP server does not support a known AUTH mechanism (offered: ${[...capabilities.auth].join(', ')}). Supported: PLAIN, LOGIN.`,
    )
  }
}

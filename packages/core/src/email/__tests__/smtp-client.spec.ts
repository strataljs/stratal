import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailError } from '../email.error'

const encoder = new TextEncoder()

function createMockSocket(responses: string[]) {
  let responseIndex = 0
  let startTlsCalled = false

  const writable = new WritableStream({
    write() { /* no-op for mock */ },
  })

  const readable = new ReadableStream({
    pull(controller) {
      if (responseIndex < responses.length) {
        controller.enqueue(encoder.encode(responses[responseIndex++]))
      }
    },
  })

  return {
    socket: {
      readable,
      writable,
      startTls: () => { startTlsCalled = true },
      close: vi.fn(() => Promise.resolve()),
      closed: Promise.resolve(),
    },
    get startTlsCalled() { return startTlsCalled },
  }
}

// EHLO replies. The first EHLO advertises STARTTLS; the post-TLS EHLO advertises
// the AUTH mechanisms (servers commonly only offer AUTH once encrypted).
const EHLO_STARTTLS = '250-smtp.example.com\r\n250-STARTTLS\r\n250 OK\r\n'
const EHLO_AUTH_PLAIN = '250-smtp.example.com\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n'

/** Greeting → EHLO(STARTTLS) → STARTTLS → EHLO(AUTH) → AUTH-235. */
function authHandshake(): string[] {
  return [
    '220 smtp.example.com ESMTP\r\n',
    EHLO_STARTTLS,
    '220 Ready to start TLS\r\n',
    EHLO_AUTH_PLAIN,
    '235 Authentication successful\r\n',
  ]
}

vi.mock('cloudflare:sockets', () => ({
  connect: vi.fn(),
}))

import { connect } from 'cloudflare:sockets'
import { SmtpClient } from '../smtp/smtp-client'

const mockedConnect = vi.mocked(connect)

describe('SmtpClient', () => {
  const smtpConfig = {
    url: 'smtp://user:pass@smtp.example.com:587',
  }

  const sendOptions = {
    from: 'sender@example.com',
    to: ['recipient@example.com'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Connection & Handshake (RFC 5321)', () => {
    it('should connect and complete SMTP handshake', async () => {
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Start mail input\r\n',
        '250 OK id=<test-123@smtp.example.com>\r\n',
        '221 Bye\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      const result = await client.send('Subject: Test\r\n\r\nHello', sendOptions)

      expect(result.messageId).toBeDefined()
      expect(mockedConnect).toHaveBeenCalledWith(
        { hostname: 'smtp.example.com', port: 587 },
        { secureTransport: 'starttls', allowHalfOpen: false },
      )
    })

    it('should throw on non-220 greeting', async () => {
      const { socket } = createMockSocket([
        '421 Service not available\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await expect(client.send('test', sendOptions)).rejects.toThrow(EmailError)
    })
  })

  describe('STARTTLS (RFC 3207)', () => {
    it('should use STARTTLS when server advertises it in EHLO', async () => {
      const mock = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go ahead\r\n',
        '250 OK id=<msg@host>\r\n',
        '221 Bye\r\n',
      ])
      mockedConnect.mockReturnValue(mock.socket as any)

      const client = new SmtpClient({ url: 'smtp://user:pass@smtp.example.com:587' })
      await client.send('test', sendOptions)

      expect(mock.startTlsCalled).toBe(true)
    })

    it('should refuse to send credentials when the server does not offer STARTTLS', async () => {
      // smtp:// + credentials + no STARTTLS would put the password on the wire in
      // cleartext (a STARTTLS-stripping downgrade). The client must fail loudly.
      const mock = createMockSocket([
        '220 smtp.example.com ESMTP\r\n',
        '250 OK\r\n', // EHLO: no STARTTLS, no AUTH
      ])
      mockedConnect.mockReturnValue(mock.socket as any)

      const client = new SmtpClient({ url: 'smtp://user:pass@smtp.example.com:587' })
      await expect(client.send('test', sendOptions)).rejects.toThrow(/unencrypted/i)
      expect(mock.startTlsCalled).toBe(false)
    })

    it('should send in plaintext without auth when no credentials are set (e.g. Mailpit)', async () => {
      // Local dev servers (Mailpit on :1025) require no auth and offer no
      // STARTTLS. With no credentials there is no secret to protect, so a plain
      // connection is allowed and no AUTH is attempted.
      const writtenData: string[] = []
      const { socket } = createMockSocket([
        '220 mailpit\r\n',
        '250 OK\r\n', // EHLO: no STARTTLS, no AUTH
        '250 OK\r\n', // MAIL FROM
        '250 OK\r\n', // RCPT TO
        '354 Go\r\n', // DATA
        '250 OK id=<m@h>\r\n', // body
        '221 Bye\r\n', // QUIT
      ])
      const writable = new WritableStream({
        write(chunk) { writtenData.push(new TextDecoder().decode(chunk)) },
      })
      Object.defineProperty(socket, 'writable', { value: writable })
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient({ url: 'smtp://localhost:1025' })
      const result = await client.send('test', sendOptions)

      expect(result.messageId).toBeDefined()
      expect(writtenData.find(d => d.startsWith('AUTH'))).toBeUndefined()
      expect(writtenData.find(d => d.startsWith('STARTTLS'))).toBeUndefined()
    })

    it('should use implicit TLS for port 465', async () => {
      const { socket } = createMockSocket([
        '220 smtp.example.com ESMTP\r\n',
        EHLO_AUTH_PLAIN, // implicit TLS: AUTH advertised on the first (encrypted) EHLO
        '235 OK\r\n',
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go ahead\r\n',
        '250 OK id=<msg@host>\r\n',
        '221 Bye\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient({ url: 'smtps://user:pass@smtp.example.com:465' })
      await client.send('test', sendOptions)

      expect(mockedConnect).toHaveBeenCalledWith(
        { hostname: 'smtp.example.com', port: 465 },
        { secureTransport: 'on', allowHalfOpen: false },
      )
    })
  })

  describe('Authentication (RFC 4954)', () => {
    it('should send AUTH PLAIN with base64-encoded credentials', async () => {
      const writtenData: string[] = []
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '250 OK id=<m@h>\r\n',
        '221 Bye\r\n',
      ])

      const writable = new WritableStream({
        write(chunk) {
          writtenData.push(new TextDecoder().decode(chunk))
        },
      })
      Object.defineProperty(socket, 'writable', { value: writable })
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await client.send('test', sendOptions)

      const authCommand = writtenData.find(d => d.startsWith('AUTH PLAIN'))
      expect(authCommand).toBeDefined()
      const credentials = authCommand!.replace('AUTH PLAIN ', '').replace('\r\n', '')
      const decoded = Buffer.from(credentials, 'base64').toString()
      expect(decoded).toBe('\0user\0pass')
    })

    it('should use AUTH LOGIN when PLAIN is not advertised', async () => {
      const writtenData: string[] = []
      const { socket } = createMockSocket([
        '220 smtp.example.com ESMTP\r\n',
        EHLO_STARTTLS,
        '220 Ready\r\n',
        '250-smtp.example.com\r\n250-AUTH LOGIN\r\n250 OK\r\n', // only LOGIN
        '334 VXNlcm5hbWU6\r\n', // username prompt
        '334 UGFzc3dvcmQ6\r\n', // password prompt
        '235 OK\r\n',
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '250 OK id=<m@h>\r\n',
        '221 Bye\r\n',
      ])
      const writable = new WritableStream({
        write(chunk) { writtenData.push(new TextDecoder().decode(chunk)) },
      })
      Object.defineProperty(socket, 'writable', { value: writable })
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await client.send('test', sendOptions)

      expect(writtenData.find(d => d.startsWith('AUTH LOGIN'))).toBeDefined()
      expect(writtenData).toContainEqual(Buffer.from('user').toString('base64') + '\r\n')
      expect(writtenData).toContainEqual(Buffer.from('pass').toString('base64') + '\r\n')
    })

    it('should throw when credentials are set but the server advertises no AUTH', async () => {
      const { socket } = createMockSocket([
        '220 smtp.example.com ESMTP\r\n',
        EHLO_STARTTLS,
        '220 Ready\r\n',
        '250 OK\r\n', // post-TLS EHLO advertises no AUTH
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await expect(client.send('test', sendOptions)).rejects.toThrow(/does not advertise AUTH/i)
    })

    it('should skip auth when no username/password provided', async () => {
      const writtenData: string[] = []
      const { socket } = createMockSocket([
        '220 smtp.example.com ESMTP\r\n',
        '250 OK\r\n',
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '250 OK id=<m@h>\r\n',
        '221 Bye\r\n',
      ])

      const writable = new WritableStream({
        write(chunk) {
          writtenData.push(new TextDecoder().decode(chunk))
        },
      })
      Object.defineProperty(socket, 'writable', { value: writable })
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient({ url: 'smtp://smtp.example.com:587' })
      await client.send('test', sendOptions)

      expect(writtenData.find(d => d.startsWith('AUTH'))).toBeUndefined()
    })
  })

  describe('Envelope (RFC 5321)', () => {
    it('should send MAIL FROM and RCPT TO for each recipient', async () => {
      const writtenData: string[] = []
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '250 OK id=<m@h>\r\n',
        '221 Bye\r\n',
      ])

      const writable = new WritableStream({
        write(chunk) {
          writtenData.push(new TextDecoder().decode(chunk))
        },
      })
      Object.defineProperty(socket, 'writable', { value: writable })
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await client.send('test', {
        from: 'sender@test.com',
        to: ['a@test.com', 'b@test.com'],
      })

      expect(writtenData).toContainEqual('MAIL FROM:<sender@test.com>\r\n')
      expect(writtenData).toContainEqual('RCPT TO:<a@test.com>\r\n')
      expect(writtenData).toContainEqual('RCPT TO:<b@test.com>\r\n')
    })
  })

  describe('DATA (RFC 5321)', () => {
    it('should dot-stuff lines starting with a period', async () => {
      const writtenData: string[] = []
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '250 OK id=<m@h>\r\n',
        '221 Bye\r\n',
      ])

      const writable = new WritableStream({
        write(chunk) {
          writtenData.push(new TextDecoder().decode(chunk))
        },
      })
      Object.defineProperty(socket, 'writable', { value: writable })
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await client.send('Subject: Test\r\n\r\nLine 1\r\n.Hidden dot\r\nLine 3', sendOptions)

      const dataContent = writtenData.find(d => d.includes('..Hidden dot'))
      expect(dataContent).toBeDefined()
    })

    it('should dot-stuff a message body starting with a period (RFC 5321 §4.5.2)', async () => {
      const writtenData: string[] = []
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '250 OK id=<m@h>\r\n',
        '221 Bye\r\n',
      ])

      const writable = new WritableStream({
        write(chunk) {
          writtenData.push(new TextDecoder().decode(chunk))
        },
      })
      Object.defineProperty(socket, 'writable', { value: writable })
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await client.send('.starts with dot', sendOptions)

      const dataContent = writtenData.find(d => d.startsWith('..starts with dot'))
      expect(dataContent).toBeDefined()
    })

    it('should extract messageId from server response', async () => {
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '250 OK id=<abc123@mail.example.com>\r\n',
        '221 Bye\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      const result = await client.send('test', sendOptions)

      expect(result.messageId).toBe('abc123@mail.example.com')
    })
  })

  describe('URL parsing', () => {
    it('should default to port 587 for smtp:// URLs', async () => {
      const { socket } = createMockSocket([
        '220 OK\r\n', '250 OK\r\n',
        '250 OK\r\n', '250 OK\r\n', '354 Go\r\n', '250 OK id=<m@h>\r\n', '221 Bye\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient({ url: 'smtp://smtp.test.com' })
      await client.send('test', sendOptions)

      expect(mockedConnect).toHaveBeenCalledWith(
        { hostname: 'smtp.test.com', port: 587 },
        expect.objectContaining({ secureTransport: 'starttls' }),
      )
    })

    it('should default to port 465 for smtps:// URLs', async () => {
      const { socket } = createMockSocket([
        '220 OK\r\n', '250 OK\r\n',
        '250 OK\r\n', '250 OK\r\n', '354 Go\r\n', '250 OK id=<m@h>\r\n', '221 Bye\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient({ url: 'smtps://smtp.test.com' })
      await client.send('test', sendOptions)

      expect(mockedConnect).toHaveBeenCalledWith(
        { hostname: 'smtp.test.com', port: 465 },
        expect.objectContaining({ secureTransport: 'on' }),
      )
    })

    it('should decode URL-encoded usernames and passwords', async () => {
      const writtenData: string[] = []
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n', '250 OK\r\n', '354 Go\r\n', '250 OK id=<m@h>\r\n', '221 Bye\r\n',
      ])

      const writable = new WritableStream({
        write(chunk) { writtenData.push(new TextDecoder().decode(chunk)) },
      })
      Object.defineProperty(socket, 'writable', { value: writable })
      mockedConnect.mockReturnValue(socket as any)

      // username "user@host" and password "p@ss#word" both percent-encoded.
      const client = new SmtpClient({ url: 'smtp://user%40host:p%40ss%23word@smtp.test.com:587' })
      await client.send('test', sendOptions)

      const authCommand = writtenData.find(d => d.startsWith('AUTH PLAIN'))
      expect(authCommand).toBeDefined()
      const credentials = authCommand!.replace('AUTH PLAIN ', '').replace('\r\n', '')
      const decoded = Buffer.from(credentials, 'base64').toString()
      expect(decoded).toBe('\0user@host\0p@ss#word')
    })

    it('should throw on invalid URL', () => {
      expect(() => new SmtpClient({ url: 'not-a-url' })).toThrow(EmailError)
    })
  })

  describe('Timeout', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('should abort when the server never responds', async () => {
      // A readable that never enqueues — read() hangs until the timeout fires.
      const readable = new ReadableStream({ pull() { /* never enqueue */ } })
      const writable = new WritableStream({ write() { /* no-op */ } })
      const socket = {
        readable,
        writable,
        startTls: () => { /* no-op for mock */ },
        close: vi.fn(() => Promise.resolve()),
        closed: Promise.resolve(),
      }
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      const promise = client.send('test', sendOptions)
      const assertion = expect(promise).rejects.toThrow(/timeout/i)
      await vi.advanceTimersByTimeAsync(30_001)
      await assertion
    })
  })

  describe('Error handling', () => {
    it('should close socket on error', async () => {
      const { socket } = createMockSocket([
        '421 Service not available\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await expect(client.send('test', sendOptions)).rejects.toThrow()

      expect(socket.close).toHaveBeenCalled()
    })

    it('should throw EmailError on rejected MAIL FROM', async () => {
      const { socket } = createMockSocket([
        ...authHandshake(),
        '550 Sender rejected\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await expect(client.send('test', sendOptions)).rejects.toThrow('expected 250, got 550')
    })

    it('should throw EmailError on rejected RCPT TO', async () => {
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '550 Recipient rejected\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await expect(client.send('test', sendOptions)).rejects.toThrow('expected 250, got 550')
    })

    it('should throw EmailError on AUTH failure (535)', async () => {
      const { socket } = createMockSocket([
        '220 smtp.example.com ESMTP\r\n',
        EHLO_STARTTLS,
        '220 Ready\r\n',
        EHLO_AUTH_PLAIN,
        '535 Authentication failed\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await expect(client.send('test', sendOptions)).rejects.toThrow('expected 235, got 535')
    })

    it('should throw when connection closes unexpectedly', async () => {
      const readable = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      const writable = new WritableStream({ write() { /* no-op for mock */ } })
      const socket = {
        readable,
        writable,
        startTls: () => { /* no-op for mock */ },
        close: vi.fn(() => Promise.resolve()),
        closed: Promise.resolve(),
      }
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await expect(client.send('test', sendOptions)).rejects.toThrow('SMTP connection closed unexpectedly')
    })

    it('should throw EmailError on DATA body rejection', async () => {
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '552 Message too large\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      await expect(client.send('test', sendOptions)).rejects.toThrow('SMTP DATA rejected')
    })

    it('should generate fallback messageId when server response has none', async () => {
      const { socket } = createMockSocket([
        ...authHandshake(),
        '250 OK\r\n',
        '250 OK\r\n',
        '354 Go\r\n',
        '250 OK\r\n',
        '221 Bye\r\n',
      ])
      mockedConnect.mockReturnValue(socket as any)

      const client = new SmtpClient(smtpConfig)
      const result = await client.send('test', sendOptions)

      expect(result.messageId).toMatch(/@smtp\.example\.com$/)
    })
  })
})

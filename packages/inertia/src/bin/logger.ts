const RESET = '\x1b[0m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'

export const logger = {
  info(message: string): void {
    console.log(`${CYAN}info${RESET}  ${message}`)
  },
  success(message: string): void {
    console.log(`${GREEN}done${RESET}  ${message}`)
  },
  warn(message: string): void {
    console.log(`${YELLOW}warn${RESET}  ${message}`)
  },
  fail(message: string): void {
    console.error(`${RED}fail${RESET}  ${message}`)
  },
  line(message: string): void {
    console.log(message)
  },
  newLine(): void {
    console.log('')
  },
}

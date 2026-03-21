const enabled = typeof process !== 'undefined' ? !process.env.NO_COLOR : true
const code = (open: number, close: number) => enabled
  ? (s: string) => `\x1b[${open}m${s}\x1b[${close}m`
  : (s: string) => s

export const bold = code(1, 22)
export const dim = code(2, 22)
export const cyan = code(36, 39)
export const yellow = code(33, 39)
export const dimWhite = enabled
  ? (s: string) => `\x1b[2;37m${s}\x1b[22;39m`
  : (s: string) => s

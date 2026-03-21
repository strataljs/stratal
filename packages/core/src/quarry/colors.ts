/** Minimal ANSI color helpers that respect the `NO_COLOR` convention. */
const isEnabled = () => typeof process !== 'undefined' ? !process.env.NO_COLOR : true

/** Create an ANSI formatter that wraps text with the given open/close SGR codes. */
const code = (open: number, close: number) => (s: string) =>
  isEnabled() ? `\x1b[${open}m${s}\x1b[${close}m` : s

export const bold = code(1, 22)
export const dim = code(2, 22)
export const cyan = code(36, 39)
export const green = code(32, 39)
export const red = code(31, 39)
export const yellow = code(33, 39)
export const dimWhite = (s: string) =>
  isEnabled() ? `\x1b[2;37m${s}\x1b[22;39m` : s

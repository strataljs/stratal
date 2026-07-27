import { date, enum as enum_, int, maximum, minimum, minLength, number, object, optional, string, url, _default } from 'zod/mini'
import type { infer as Infer } from 'zod/mini'
import { withZodI18n } from '../../i18n/validation'

const httpMethod = enum_(['GET', 'PUT', 'DELETE', 'HEAD'])

export const getPresignedUrlInputSchema = object({
  path: string().check(minLength(1, withZodI18n('zodI18n.errors.custom.filePathRequired'))),
  method: _default(httpMethod, 'GET'),
  expiresIn: optional(number().check(int(), minimum(1), maximum(604800))),
  disk: optional(string()),
})

export type GetPresignedUrlInput = Infer<typeof getPresignedUrlInputSchema>

export const presignedUrlResultSchema = object({
  url: url(),
  expiresIn: number(),
  expiresAt: date(),
  method: httpMethod,
})

export type PresignedUrlResult = Infer<typeof presignedUrlResultSchema>

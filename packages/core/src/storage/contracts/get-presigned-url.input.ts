import { z, withI18n } from '../../i18n/validation'

export const getPresignedUrlInputSchema = z.object({
  path: z.string().min(1, withI18n('zodI18n.errors.custom.filePathRequired')),
  method: z.enum(['GET', 'PUT', 'DELETE', 'HEAD']).default('GET'),
  expiresIn: z.number().int().min(1).max(604800).optional(),
  disk: z.string().optional(),
})

export type GetPresignedUrlInput = z.infer<typeof getPresignedUrlInputSchema>

export const presignedUrlResultSchema = z.object({
  url: z.string().url(),
  expiresIn: z.number(),
  expiresAt: z.date(),
  method: z.enum(['GET', 'PUT', 'DELETE', 'HEAD']),
})

export type PresignedUrlResult = z.infer<typeof presignedUrlResultSchema>

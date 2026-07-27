import { minLength, object, optional, string } from 'zod/mini'
import type { infer as Infer } from 'zod/mini'
import { withZodI18n } from '../../i18n/validation'

export const fileExistsInputSchema = object({
  path: string().check(minLength(1, withZodI18n('zodI18n.errors.custom.filePathRequired'))),
  disk: optional(string()),
})

export type FileExistsInput = Infer<typeof fileExistsInputSchema>

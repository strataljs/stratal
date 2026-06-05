import { z, withZodI18n } from '../../i18n/validation'

export const deleteFileInputSchema = z.object({
  path: z.string().min(1, withZodI18n('zodI18n.errors.custom.filePathRequired')),
  disk: z.string().optional(),
})

export type DeleteFileInput = z.infer<typeof deleteFileInputSchema>

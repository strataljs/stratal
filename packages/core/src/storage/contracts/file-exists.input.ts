import { z, withI18n } from '../../i18n/validation'

export const fileExistsInputSchema = z.object({
  path: z.string().min(1, withI18n('zodI18n.errors.custom.filePathRequired')),
  disk: z.string().optional(),
})

export type FileExistsInput = z.infer<typeof fileExistsInputSchema>

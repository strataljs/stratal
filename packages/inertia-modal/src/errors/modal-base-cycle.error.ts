import { HttpException } from 'stratal/errors'
import { withI18n } from 'stratal/i18n'

/**
 * Raised when a route's `base` chain leads back to a route already in it.
 *
 * Assembling the chain costs one sub-request per level, so a cycle would otherwise run until the
 * runtime's sub-request budget is exhausted and surface as an opaque failure.
 */
export class ModalBaseCycleError extends HttpException {
  constructor(url: string) {
    super(500, withI18n('modal.errors.baseCycle', { url }))
  }
}

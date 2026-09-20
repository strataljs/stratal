import { ApplicationError } from 'stratal/errors'

/**
 * Raised when `db.$cursor.<model>` cannot reach a model delegate on the client
 * it was built for — the schema declares the model, the client does not answer
 * for it.
 *
 * This is a **programming error**, not bad input: the reader is built from the
 * schema's own model list, so reaching it means the client and the schema it was
 * given have come apart — a model sliced out of the client's options, or a
 * hand-assembled client. No request recovers from it and no retry helps. It
 * deliberately carries no HTTP status, so it is never mistaken for something the
 * client sent wrong.
 *
 * `model` names the client key at fault, and is reported to observability so the
 * raise site stays distinguishable without matching on message text.
 */
export class CursorModelUnavailableError extends ApplicationError {
  constructor(public readonly model: string) {
    super(
      `[stratal:database] $cursor cannot reach the "${model}" model on this client. `
      + 'The schema declares it, so the client was built with a different schema or with this model sliced out.',
    )
  }

  public override reportContext(): Record<string, unknown> | undefined {
    return { model: this.model }
  }
}

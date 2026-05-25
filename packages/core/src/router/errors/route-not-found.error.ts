import { HttpException } from '../../errors'

export class RouteNotFoundError extends HttpException {
  public readonly path: string
  public readonly method: string

  constructor(path: string, method: string) {
    super(404, `Route not found: ${method} ${path}`)
    this.path = path
    this.method = method
  }
}

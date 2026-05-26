import type { Container } from '../di/container'
import type { InjectionToken } from '../di/types'
import { type ExceptionHandler } from '../errors/exception-handler'
import type { LoggerService } from '../logger'
import type { Constructor } from '../types'

export type { InjectionToken }

export interface ClassProvider<T extends object = object> {
  provide: InjectionToken<T>
  useClass: Constructor<T>
}

export interface ValueProvider<T extends object = object> {
  provide: InjectionToken<T>
  useValue: T
}

export interface FactoryProvider<T extends object = object> {
  provide: InjectionToken<T>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] required for factory parameter contravariance
  useFactory: (...deps: any[]) => T | Promise<T>
  inject?: InjectionToken[]
}

export interface ExistingProvider<T extends object = object> {
  provide: InjectionToken<T>
  useExisting: InjectionToken<T>
}

export type Provider<T extends object = object> =
  | Constructor<T>
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ExistingProvider<T>

export interface ModuleClass<T extends object = object> extends Constructor<T> {
  forRoot?: (...args: unknown[]) => DynamicModule
  forRootAsync?: <TOptions>(options: AsyncModuleOptions<TOptions>) => DynamicModule
}

export interface ModuleOptions {
  imports?: (ModuleClass | DynamicModule)[]
  providers?: Provider[]
  controllers?: Constructor[]
  consumers?: Constructor[]
  jobs?: Constructor[]
}

export interface DynamicModule extends Omit<ModuleOptions, 'imports'> {
  module: Constructor
}

export interface AsyncModuleOptions<TOptions> {
  inject?: InjectionToken[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] required for factory parameter contravariance
  useFactory: (...deps: any[]) => TOptions | Promise<TOptions>
}

export interface ModuleContext {
  container: Container
  logger: LoggerService
}

export interface OnInitialize {
  onInitialize(context: ModuleContext): void | Promise<void>
}

export interface OnShutdown {
  onShutdown(context: ModuleContext): void | Promise<void>
}

export interface OnException {
  onException(handler: ExceptionHandler): void
}

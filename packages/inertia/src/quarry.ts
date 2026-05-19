import { Module } from 'stratal/module'
import { InertiaBuildCommand } from './commands/inertia-build.command'
import { InertiaDevCommand } from './commands/inertia-dev.command'
import { InertiaInstallCommand } from './commands/inertia-install.command'
import { InertiaTypesCommand } from './commands/inertia-types.command'

@Module({
  providers: [
    InertiaInstallCommand,
    InertiaTypesCommand,
    InertiaDevCommand,
    InertiaBuildCommand,
  ],
})
export class InertiaQuarryModule {}

export { InertiaBuildCommand } from './commands/inertia-build.command'
export { InertiaDevCommand } from './commands/inertia-dev.command'
export { InertiaInstallCommand } from './commands/inertia-install.command'
export { InertiaTypesCommand } from './commands/inertia-types.command'
export { runTypeGeneration } from './generator/type-generator'

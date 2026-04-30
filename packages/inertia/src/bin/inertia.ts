import { runBuild } from './build'
import { runDev } from './dev'
import { runInstall } from './install'
import { logger } from './logger'
import { runTypes } from './types'

const HELP = `inertia — standalone CLI for @stratal/inertia

Usage:
  npx inertia <command> [options]

Commands:
  dev       Start Vite development server
  build     Build Inertia.js frontend for production (--ssr to also build SSR bundle)
  install   Scaffold Inertia.js files for a Stratal project
  types     Generate Inertia.js page type definitions (--watch to keep regenerating)

Run \`npx inertia <command> --help\` to see command-specific options.`

async function main(): Promise<number> {
  const [, , subcommand, ...rest] = process.argv

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(HELP)
    return subcommand ? 0 : 1
  }

  switch (subcommand) {
    case 'dev':
      return runDev(rest)
    case 'build':
      return runBuild(rest)
    case 'install':
      return runInstall(rest)
    case 'types':
      return runTypes(rest)
    default:
      logger.fail(`Unknown command: ${subcommand}`)
      console.log(HELP)
      return 1
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    logger.fail(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })

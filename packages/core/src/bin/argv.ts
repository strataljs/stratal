export function extractEnvFlag(argv: string[]): { env: string | undefined; rest: string[] } {
  let env: string | undefined
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok === '--') {
      rest.push(...argv.slice(i))
      break
    }
    const eqMatch = tok.match(/^(?:--env|-e)=(.*)$/)
    if (eqMatch) {
      if (!eqMatch[1]) throw new Error('--env requires a value (e.g. --env staging)')
      if (env !== undefined) throw new Error('--env specified more than once')
      env = eqMatch[1]
      continue
    }
    if (tok === '--env' || tok === '-e') {
      const next = argv[i + 1]
      if (!next || next.startsWith('-')) throw new Error('--env requires a value (e.g. --env staging)')
      if (env !== undefined) throw new Error('--env specified more than once')
      env = next
      i++
      continue
    }
    rest.push(tok)
  }
  return { env, rest }
}

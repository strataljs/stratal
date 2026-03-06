#!/usr/bin/env node
/* global process */
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

// Resolve @swc-node/register's main entry (CJS-compatible), then derive the esm/esm.mjs path.
// We can't resolve '@swc-node/register/esm/esm.mjs' directly because that subpath isn't exported
// in the package's exports map, and createRequire().resolve() uses CJS resolution which doesn't
// match the "import" condition on the './esm' subpath.
const swcRegisterPath = join(dirname(require.resolve('@swc-node/register')), 'esm/esm.mjs');

// Register @swc-node/register for TypeScript+decorator support
register(pathToFileURL(swcRegisterPath), pathToFileURL('./'));

// Get user's entry file from CLI args (first positional arg after bin script)
const entryFile = process.argv[2];

if (!entryFile) {
  console.error('Usage: stratal-seed <entry-file> [command] [options]');
  console.error('Example: stratal-seed ./src/seeders/index.ts run user');
  process.exit(1);
}

// Remove the entry file from argv so yargs sees: [node, script, command, ...options]
process.argv.splice(2, 1);

// Resolve and import the user's entry file
const entryPath = resolve(process.cwd(), entryFile);
await import(pathToFileURL(entryPath).href);

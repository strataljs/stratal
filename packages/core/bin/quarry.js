#!/usr/bin/env -S node --no-warnings
/* global process */
import { createRequire, register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

// Resolve @swc-node/register's main entry (CJS-compatible), then derive the esm/esm.mjs path.
const swcRegisterPath = join(dirname(require.resolve('@swc-node/register')), 'esm/esm.mjs');

// Register @swc-node/register for TypeScript+decorator support
register(pathToFileURL(swcRegisterPath), pathToFileURL('./'));

const DEFAULT_ENTRY = './src/commands/index.ts';

// Determine entry file: if first arg looks like a file path, use it; otherwise use default
const firstArg = process.argv[2];
let entryFile = DEFAULT_ENTRY;

if (firstArg && (firstArg.includes('/') || firstArg.includes('\\') || /\.(ts|js|mts|mjs)$/.test(firstArg))) {
  entryFile = firstArg;
  // Remove the entry file from argv so Clipanion sees: [node, script, command, ...options]
  process.argv.splice(2, 1);
}

// Resolve and validate the entry file
const entryPath = resolve(process.cwd(), entryFile);

if (!existsSync(entryPath)) {
  console.error(`Error: Entry file not found: ${entryFile}`);
  console.error('');
  console.error('Create this file or specify a custom path:');
  console.error('  npx quarry ./path/to/commands.ts <command> [options]');
  process.exit(1);
}

// Import and execute the user's entry file
await import(pathToFileURL(entryPath).href);

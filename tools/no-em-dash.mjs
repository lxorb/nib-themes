#!/usr/bin/env node
/** No em dashes, anywhere in the registry.
 *
 *  Nib holds its own writing to this and the registry is written in the same
 *  voice, so the rule is checked rather than remembered. A hyphen, a colon or a
 *  full stop says what an em dash was going to.
 *
 *  The character is built from its code point on purpose: a script that checked
 *  for an em dash by holding one would be the first thing it found. */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { repoRoot } from './validate.mjs'

const DASH = String.fromCodePoint(0x2014)

/** What no submission owns, and nothing to read anyway. */
const SKIP = new Set(['.git', 'node_modules'])

function* files(root, at = root) {
  for (const name of readdirSync(at).sort()) {
    if (SKIP.has(name)) continue

    const path = join(at, name)
    if (statSync(path).isDirectory()) yield* files(root, path)
    else yield path
  }
}

const root = repoRoot()
const found = []

for (const path of files(root)) {
  const text = readFileSync(path, 'utf8')

  // Something that is not text cannot be read for prose, and a stray byte in it
  // is not an em dash somebody wrote.
  if (text.includes('\u0000') || !text.includes(DASH)) continue

  text.split('\n').forEach((line, at) => {
    const column = line.indexOf(DASH)
    if (column >= 0) {
      found.push(`${relative(root, path).split(sep).join('/')}:${at + 1}:${column + 1}`)
    }
  })
}

if (found.length) {
  console.error('An em dash, in:')
  for (const one of found) console.error(`  ${one}`)
  console.error('')
  console.error('Write a hyphen, a colon or two sentences instead.')
  process.exitCode = 1
} else {
  console.log('No em dashes.')
}

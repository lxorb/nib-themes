#!/usr/bin/env node
/** The registry as one file.
 *
 *  `index.json` is what the store reads: every theme's metadata, and the whole
 *  palette of every scheme it states. The palettes are the point. A store that
 *  paints thirty live miniatures would otherwise fetch thirty stylesheets to
 *  find out what colour thirty backgrounds are, so the colours travel with the
 *  list and the app fetches a theme's CSS only when somebody installs it.
 *
 *  It is generated and committed, because the registry is served as static
 *  files and there is nothing on the other end to build it. `--check`
 *  regenerates it in memory and compares, so a pull request that edits a theme
 *  and forgets the index fails in CI rather than being fixed by a bot commit.
 *
 *  The one field `--check` lets differ is `generated`, which says when the file
 *  was written and so cannot be derived from the themes. Everything else is a
 *  function of the folders under `themes/`. */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { paletteOf, readTheme, repoRoot, reviewTheme, SCHEMES, themeIds } from './validate.mjs'

const INDEX = 'index.json'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** How many differing lines a failure prints before it stops making its point. */
const MOST_LINES = 12

/** Today, as a date is written everywhere else in the registry. */
function today() {
  return new Date().toISOString().slice(0, 10)
}

/** The whole registry, from the themes on disk. Throws when a theme does not
 *  pass, because an index built from a theme the store would refuse is worse
 *  than no index. */
export function registryOf(root, generated) {
  const themes = []

  for (const id of themeIds(root)) {
    const { meta, css } = readTheme(root, id)
    const found = reviewTheme(id, meta, css)

    if (found.problems.length) {
      const said = found.problems.map(({ file, error }) => `themes/${id}/${file}: ${error}`)
      throw new Error(`${id} does not pass, so no index was written.\n${said.join('\n')}`)
    }

    // paletteOf throws on a value a palette cannot carry. Caught here so the
    // message names the theme it came from, which is what somebody reading a
    // failed check has to know to fix it.
    let palettes
    try {
      palettes = Object.fromEntries(
        SCHEMES.map((scheme) => [scheme, paletteOf(found.root, found.schemes, scheme)]),
      )
    } catch (error) {
      throw new Error(`themes/${id}/theme.css: ${error.message}`)
    }

    themes.push({
      id: meta.id,
      name: meta.name,
      author: meta.author,
      version: meta.version,
      description: meta.description,
      tags: [...meta.tags],
      licence: meta.licence,
      variants: [...meta.variants],
      updated: meta.updated,
      palettes,
    })
  }

  return { generated, themes }
}

/** The file as it is written: two spaces, and a newline at the end, so a diff
 *  of two generations is a diff of the themes. */
export function written(registry) {
  return `${JSON.stringify(registry, null, 2)}\n`
}

/** The lines two versions of the file disagree on, near enough to a diff to
 *  point at what to regenerate. */
export function difference(wanted, found) {
  const mine = wanted.split('\n')
  const theirs = found.split('\n')
  const said = []

  for (let at = 0; at < Math.max(mine.length, theirs.length); at++) {
    if (mine[at] === theirs[at]) continue

    if (said.length >= MOST_LINES) {
      said.push('  and more below it')
      break
    }

    said.push(`line ${at + 1}`)
    said.push(`  index.json says   ${theirs[at] ?? '(the file ends)'}`)
    said.push(`  the themes say    ${mine[at] ?? '(the file ends)'}`)
  }

  return said
}

/** The tool. Wrapped by `main`, which turns a theme that does not pass into a
 *  sentence rather than a stack trace. */
function run() {
  const root = repoRoot()
  const path = join(root, INDEX)
  const checking = process.argv.includes('--check')

  if (!checking) {
    const registry = registryOf(root, today())
    writeFileSync(path, written(registry))
    console.log(`${INDEX}: ${registry.themes.length} themes, generated ${registry.generated}.`)
    return
  }

  let found = ''
  try {
    found = readFileSync(path, 'utf8')
  } catch {
    console.error(`${INDEX} is missing. Run: node tools/index.mjs`)
    process.exitCode = 1
    return
  }

  let generated = ''
  try {
    generated = JSON.parse(found).generated
  } catch (error) {
    console.error(`${INDEX} is not JSON: ${error.message}`)
    process.exitCode = 1
    return
  }

  if (typeof generated !== 'string' || !DAY.test(generated)) {
    console.error(`${INDEX}: generated is ${JSON.stringify(generated)}, and it is a YYYY-MM-DD date`)
    process.exitCode = 1
    return
  }

  const wanted = written(registryOf(root, generated))
  if (wanted === found) {
    console.log(`${INDEX} is what the themes say.`)
    return
  }

  console.error(`${INDEX} is not what the themes say. Run: node tools/index.mjs`)
  console.error('')
  for (const line of difference(wanted, found)) console.error(line)
  process.exitCode = 1
}

function main() {
  try {
    run()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}

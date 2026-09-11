#!/usr/bin/env node
/** What a theme in this registry is allowed to be.
 *
 *  Nib carries the same rules in `apps/desktop/src/lib/themes/validate.ts`, and
 *  that copy is the one that matters on a reader's machine. What differs is the
 *  answer to a rule that breaks them. The app drops the rule, names it, and
 *  installs the rest, because somebody who has just clicked install is better
 *  served by a theme that does a little less than by nothing at all. Here a
 *  submission is either entirely within the rules or refused, so nothing reaches
 *  the store that the app would have to quietly repair.
 *
 *  Two things are being defended. The obvious one is anything that runs or
 *  fetches: a `url()` phones home with the reader's address, an `@import` pulls
 *  in a stylesheet nobody reviewed. The quieter one is the app's own shape. A
 *  theme that may set `position` or `display` can move the sidebar off the
 *  screen or hide the title bar, and a person who installed a colour scheme did
 *  not agree to that. So a theme states colours, and it states them in two
 *  places only: the token blocks, and the prose of a note.
 *
 *  Run it with no arguments, from anywhere in the checkout. It reads every
 *  folder under `themes/`, the starting point under `template/`, and the shape
 *  of the tree itself. */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Bigger than any theme written against tokens, small enough that a stylesheet
 *  with something else hiding in it does not get read at all. */
export const MOST_BYTES = 48 * 1024

/** A theme with more rules than this is not a theme. */
export const MOST_RULES = 160
export const MOST_DECLARATIONS = 600

/** The blocks that carry tokens: the shared one, and one per scheme. Written
 *  without quotes and without spaces, which is how `selectorOf` hands them
 *  over, so `[data-theme="dark"]` and `[data-theme='dark']` are one selector. */
export const TOKEN_BLOCKS = new Set([':root', '[data-theme=light]', '[data-theme=dark]'])

/** What a token block may say besides a token of its own. `color-scheme` is how
 *  a theme tells the browser which way its scrollbars and form controls go, and
 *  a theme that sets colours without it gets the wrong ones. */
export const TOKEN_PROPERTIES = new Set(['color-scheme'])

/** The prose of a note, and nothing else in the app. `#write` is the surface
 *  the renderer and the editor both draw into, so a rule here reaches the words
 *  and never the chrome around them. */
export const PROSE_ROOT = '#write'

/** What may follow `#write`: the elements a note is made of. A theme that wants
 *  serif headings or a heavier quote bar says so here. */
export const PROSE_PARTS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'a',
  'strong',
  'em',
  'del',
  'mark',
  'code',
  'pre',
  'pre code',
  'blockquote',
  'ul',
  'ol',
  'li',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'dt',
  'dd',
])

/** What a prose rule may set: how the words look, never where they are.
 *
 *  Absent on purpose: `position`, `display`, `inset`, `z-index`, `transform`,
 *  `visibility`, `overflow`, `width`, `height`, `content`, `animation` and
 *  `transition`. Those are the app's layout and the app's motion, and a theme
 *  that could set them could take a pane away or hold a menu open. */
export const PROSE_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border',
  'border-color',
  'border-style',
  'border-width',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'box-shadow',
  'font-family',
  'font-feature-settings',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'line-height',
  'margin',
  'opacity',
  'padding',
  'text-decoration',
  'text-decoration-color',
  'text-shadow',
  'text-transform',
  'text-underline-offset',
  'word-spacing',
])

/** Every custom property Nib declares, taken from the `--*` names in
 *  `packages/themes/src/tokens.css`: the shared scale in the first `:root`, the
 *  colours of the two schemes, and the Typora compatibility layer at the bottom
 *  of that file. The app does not check this list, because a token it does not
 *  know costs it nothing. The registry checks it, because `--acent: #b02e5a` is
 *  a theme that ships and then silently does nothing, and submission time is
 *  while that is still cheap to fix. Grow this list when tokens.css grows. */
export const KNOWN_TOKENS = new Set([
  '--font-ui',
  '--font-content',
  '--font-mono',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--zoom',
  '--text-content',
  '--leading-content',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-7',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--scrollbar-width',
  '--scrollbar-thumb',
  '--rail-width',
  '--sidebar-width',
  '--titlebar-height',
  '--measure',
  '--ease-out',
  '--ease-in-out',
  '--ease-spring',
  '--dur-instant',
  '--dur-fast',
  '--dur-base',
  '--dur-slow',
  '--dur-slower',
  '--bg',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--press',
  '--line',
  '--line-strong',
  '--muted',
  '--muted-strong',
  '--text',
  '--text-strong',
  '--accent',
  '--accent-hover',
  '--accent-press',
  '--accent-soft',
  '--accent-line',
  '--danger',
  '--success',
  '--selection',
  // The four colours inside a code fence. Not --code-*: every token with that
  // prefix is the furniture around a block rather than the code in it, and
  // --code-number-color is the colour of the line numbers in the margin.
  '--syntax-number',
  '--syntax-function',
  '--syntax-type',
  '--syntax-property',
  '--canvas-1',
  '--canvas-2',
  '--canvas-3',
  '--canvas-4',
  '--canvas-5',
  '--canvas-6',
  '--canvas-dot',
  '--scrollbar',
  '--scrollbar-hover',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--bg-color',
  '--text-color',
  '--primary-color',
  '--md-char-color',
  '--heading-char-color',
  '--meta-content-color',
  '--monospace',
  '--side-bar-bg-color',
  '--control-text-color',
  '--item-hover-bg-color',
  '--item-hover-text-color',
  '--active-file-bg-color',
  '--active-file-text-color',
  '--active-file-border-color',
  '--window-border',
  '--select-text-bg-color',
  '--search-select-bg-color',
  '--search-select-text-color',
  '--code-block-bg-color',
  '--table-border-color',
  '--blockquote-border-color',
  '--callout-note',
  '--callout-tip',
  '--callout-important',
  '--callout-warning',
  '--callout-caution',
])

/** Anything in a value that would reach outside the stylesheet, or run.
 *
 *  `url()` and `image-set()` fetch; `element()` and `attr()` read the page;
 *  `expression()` is Internet Explorer's way of running script from CSS and
 *  costs nothing to refuse; a backslash is how a keyword is spelled to slip
 *  past a check like this one. */
const DANGEROUS = /url\s*\(|image-set\s*\(|element\s*\(|attr\s*\(|expression\s*\(|javascript:|\\/i

/** Whether a value written back out is read back as the same value.
 *
 *  A comment marker would comment out the rest of the file from wherever it
 *  landed, and a string opened and never closed swallows the end of the rule and
 *  whatever follows it. Either makes the sheet that came out differ from the
 *  sheet that went in, which is the one thing these rules exist to prevent. A
 *  control character goes with them: it is invisible to a reviewer, and a value
 *  that spans lines is not one a theme needs.
 *
 *  A brace or a semicolon needs no rule of its own. `scan` has already ended the
 *  block at a `}` and set the rule aside at a `{`, and `declarationsOf` has
 *  split the declaration at an unquoted `;`, so one that reaches a value here is
 *  inside a string and stays there. That is what lets a font family called
 *  `'Semi; colon'` through, which a blanket ban would not.
 *
 *  The same rule as `usableValue` in the app's own copy of this file. */
export function usableValue(value) {
  if (!value || DANGEROUS.test(value)) return false
  if (/\/\*|\*\//.test(value) || /\p{Cc}/u.test(value)) return false

  const doubles = value.split('"').length - 1
  const singles = value.split("'").length - 1
  return doubles % 2 === 0 && singles % 2 === 0
}

/** The same question, for a value that goes into a palette in `index.json`.
 *
 *  A palette is pasted straight into a block the store's gallery writes, so
 *  nothing there has looked at where its braces and semicolons are. The app
 *  refuses one that holds them and paints the card a colour short, without a
 *  word, so the registry has to refuse to write one at all; see `paletteOf`. */
export function usablePaletteValue(value) {
  return usableValue(value) && !/[{};]/.test(value)
}

/** What a custom property is called. */
const TOKEN = /^--[a-z0-9-]+$/i

/** The two schemes, in the order `variants` lists them. */
export const SCHEMES = ['light', 'dark']

/** A theme folder is named by its id, and the id is what the URL carries. */
export const ID = /^[a-z0-9][a-z0-9-]{0,38}$/

/** The keys of a theme.json, and nothing besides. */
const META_KEYS = [
  'id',
  'name',
  'author',
  'version',
  'description',
  'tags',
  'licence',
  'variants',
  'updated',
]

const TAG = /^[a-z0-9 -]{1,20}$/

/** No leading zeros, so one version is written one way. */
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** The two files a theme folder holds, sorted, and nothing besides. */
export const THEME_FILES = ['theme.css', 'theme.json']

/** Comments taken out, so nothing after this has to think about them. The
 *  scanner below reads braces and semicolons, and a comment can hold both. A
 *  comment that spanned lines leaves its newlines behind, so the line a message
 *  names is the line the author is looking at. */
export function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => {
    const lines = comment.split('\n').length - 1
    return lines ? '\n'.repeat(lines) : ' '
  })
}

/** A selector without its quotes or its spare whitespace, so two spellings of
 *  the same thing compare equal. Lower-cased: CSS element names and attribute
 *  selectors are not case-sensitive, and a theme writing `#WRITE H1` means the
 *  same thing as one writing it small. */
export function selectorOf(text) {
  return text
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s*([[\]=])\s*/g, '$1')
}

/** The declarations of one block, as they were written. A value may hold a
 *  semicolon inside a string or a function, so the split walks rather than
 *  using `split`. A fragment with no colon in it comes back with an empty
 *  property name, which is how the caller reports it. */
export function declarationsOf(body) {
  const found = []
  let depth = 0
  let quote = ''
  let start = 0

  const take = (end) => {
    const text = body.slice(start, end).trim()
    start = end + 1
    if (!text) return

    const colon = text.indexOf(':')
    if (colon < 0) {
      found.push(['', text])
      return
    }

    found.push([text.slice(0, colon).trim(), text.slice(colon + 1).trim()])
  }

  for (let at = 0; at < body.length; at++) {
    const letter = body[at]

    if (quote) {
      if (letter === quote) quote = ''
      continue
    }

    if (letter === '"' || letter === "'") quote = letter
    else if (letter === '(') depth++
    else if (letter === ')') depth = Math.max(0, depth - 1)
    else if (letter === ';' && depth === 0) take(at)
  }

  take(body.length)
  return found
}

/** Every flat `selector { ... }` in the sheet, and whatever was not one, each
 *  with the line it starts on.
 *
 *  Flat is the whole grammar: a theme has no at-rules and no nesting, so a
 *  brace inside a block is a rule this scanner refuses rather than one it
 *  descends into. That is also what keeps the scan linear in the file. */
export function scan(css) {
  const rules = []
  const stray = []
  const breaks = []
  for (let at = 0; at < css.length; at++) if (css[at] === '\n') breaks.push(at)

  const lineAt = (offset) => {
    let low = 0
    let high = breaks.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (breaks[middle] < offset) low = middle + 1
      else high = middle
    }
    return low + 1
  }

  /** The line a fragment starts on, counted from its first non-blank character,
   *  so a reason names the line the author is looking at rather than a blank one
   *  above it. */
  const lineOf = (from, part) => lineAt(from + part.length - part.trimStart().length)

  let at = 0
  while (at < css.length) {
    const open = css.indexOf('{', at)
    if (open < 0) {
      const rest = css.slice(at)
      if (rest.trim()) {
        stray.push({ text: rest.trim().slice(0, 40), line: lineOf(at, rest) })
      }
      break
    }

    // An at-rule with no block of its own, a `@charset` or a bare `@import`,
    // ends at its semicolon, and what follows that semicolon is the next rule's
    // selector. So the text before the brace is split there and every part but
    // the last is set aside on its own, rather than the whole of it being read as
    // one prelude and the rule after the at-rule going down with it.
    const chunk = css.slice(at, open)
    const statements = []
    let from = at
    for (const part of chunk.split(';')) {
      statements.push({ text: part, from })
      from += part.length + 1
    }

    const last = statements.pop()
    for (const one of statements) {
      if (one.text.trim()) {
        stray.push({ text: one.text.trim().slice(0, 40), line: lineOf(one.from, one.text) })
      }
    }

    const prelude = last.text.trim()
    const line = lineOf(last.from, last.text)
    const close = css.indexOf('}', open)
    if (close < 0) {
      stray.push({ text: prelude.slice(0, 40) || '{', line })
      break
    }

    const body = css.slice(open + 1, close)
    at = close + 1

    // Three things that are not a flat rule: a brace inside the body, which
    // means the block held a rule of its own, so an at-rule or nesting; a
    // prelude that opens one; and a block with no prelude at all. None of them
    // is part of a theme, and reading on from the first `}` would leave the
    // rest of the block read as top-level rules.
    if (body.includes('{') || prelude.startsWith('@') || !prelude) {
      stray.push({ text: prelude.slice(0, 40) || '{', line })
      continue
    }

    rules.push({
      selectors: prelude.split(',').map(selectorOf).filter(Boolean),
      declarations: declarationsOf(body),
      line,
    })
  }

  return { rules, stray }
}

/** Whether a selector is one a theme may write, and which kind it is. */
export function kindOf(selector) {
  if (TOKEN_BLOCKS.has(selector)) return 'tokens'
  if (selector === PROSE_ROOT) return 'prose'

  const rest = selector.startsWith(`${PROSE_ROOT} `) ? selector.slice(PROSE_ROOT.length + 1) : null
  return rest !== null && PROSE_PARTS.has(rest) ? 'prose' : null
}

/** The scheme a token block belongs to, or null for the shared one. */
function schemeOf(selector) {
  for (const scheme of SCHEMES) if (selector === `[data-theme=${scheme}]`) return scheme
  return null
}

/** A theme's stylesheet, read against the rules.
 *
 *  Comes back with every reason it is not a theme, and with the token blocks it
 *  states: the shared one under `root`, and one map per scheme it names, in the
 *  order the tokens were written. `tools/index.mjs` builds the palettes from
 *  those, so this file is the only place that knows how to read a theme. */
export function reviewCss(css) {
  const errors = []
  const root = new Map()
  const schemes = new Map()
  const bytes = Buffer.byteLength(css, 'utf8')

  if (bytes > MOST_BYTES) {
    errors.push(`the file is ${bytes} bytes, and a theme may be ${MOST_BYTES}`)
    return { errors, root, schemes }
  }

  const { rules, stray } = scan(withoutComments(css))
  for (const one of stray) {
    errors.push(
      `line ${one.line}: ${one.text} is not a theme rule, and a theme is flat "selector { declarations }" with no at-rules and no nesting`,
    )
  }

  if (rules.length > MOST_RULES) {
    errors.push(`the file has ${rules.length} rules, and a theme may have ${MOST_RULES}`)
  }

  let declarations = 0

  for (const rule of rules) {
    const where = `line ${rule.line}`
    const written = rule.selectors.join(', ')

    for (const selector of rule.selectors) {
      if (kindOf(selector) === null) {
        errors.push(`${where}: ${selector} is not a selector a theme may set`)
      }
    }

    const kinds = new Set(rule.selectors.map(kindOf).filter((kind) => kind !== null))
    if (kinds.size > 1) {
      errors.push(
        `${where}: ${written} lists a token block and prose together, and the two allow different properties, so write them as two rules`,
      )
      continue
    }

    const kind = kinds.values().next().value
    if (kind === undefined) continue

    if (!rule.declarations.length) {
      errors.push(`${where}: ${written} has no declarations, so it does nothing`)
      continue
    }

    if (kind === 'tokens') {
      for (const selector of rule.selectors) {
        const scheme = schemeOf(selector)
        if (scheme !== null && !schemes.has(scheme)) schemes.set(scheme, new Map())
      }
    }

    for (const [property, value] of rule.declarations) {
      declarations++

      if (!property) {
        errors.push(
          `${where}: ${value} is not a declaration, and a declaration is "property: value"`,
        )
        continue
      }

      const name = property.toLowerCase()
      const token = kind === 'tokens' && TOKEN.test(name)

      if (kind === 'prose' && !PROSE_PROPERTIES.has(name)) {
        errors.push(
          `${where}: ${written} may not set ${property}, because a prose rule states how the words look and never where they are`,
        )
        continue
      }

      if (kind === 'tokens' && !token && !TOKEN_PROPERTIES.has(name)) {
        errors.push(
          `${where}: ${written} may not set ${property}, because a token block sets custom properties and color-scheme`,
        )
        continue
      }

      if (token && !KNOWN_TOKENS.has(property)) {
        errors.push(
          `${where}: ${property} is not a token Nib declares, so setting it would do nothing`,
        )
        continue
      }

      if (!value) {
        errors.push(`${where}: ${property} has no value`)
        continue
      }

      if (!usableValue(value)) {
        errors.push(
          DANGEROUS.test(value)
            ? `${where}: ${property} reaches outside the stylesheet, and a theme may only state colours it wrote itself`
            : `${where}: ${property} is not a value a theme may state, because it holds a comment marker, a control character or a quote it never closes, and the sheet that came out would not be the sheet that went in`,
        )
        continue
      }

      if (!token) continue

      for (const selector of rule.selectors) {
        const scheme = schemeOf(selector)
        if (scheme === null) root.set(property, value)
        else schemes.get(scheme).set(property, value)
      }
    }
  }

  if (declarations > MOST_DECLARATIONS) {
    errors.push(
      `the file has ${declarations} declarations, and a theme may have ${MOST_DECLARATIONS}`,
    )
  }

  return { errors, root, schemes }
}

/** A theme.json, read against the rules. The id has to be the folder name, so
 *  the folder name comes in with it. */
export function reviewMeta(meta, folder) {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    return ['theme.json is not an object']
  }

  const errors = []

  for (const key of META_KEYS) if (!(key in meta)) errors.push(`${key} is missing`)
  for (const key of Object.keys(meta)) {
    if (!META_KEYS.includes(key)) errors.push(`${key} is not a key theme.json has`)
  }

  /** A string field, or null when it was already reported. */
  const text = (key, most) => {
    const value = meta[key]
    if (value === undefined) return null

    if (typeof value !== 'string') {
      errors.push(`${key} is not a string`)
      return null
    }
    if (value !== value.trim()) {
      errors.push(`${key} has whitespace at one end`)
      return null
    }
    if (value.length < 1 || value.length > most) {
      errors.push(`${key} is ${value.length} characters, and it may be 1 to ${most}`)
      return null
    }
    return value
  }

  const id = text('id', 39)
  if (id !== null && !ID.test(id)) {
    errors.push(`${id} is not an id, and an id is lower case letters, digits and hyphens`)
  } else if (id !== null && id !== folder) {
    errors.push(`the id is ${id} and the folder is ${folder}, and they have to be the same`)
  }

  text('name', 40)
  text('author', 40)
  text('licence', 40)

  const description = text('description', 120)
  if (description !== null && /[\n\r]/.test(description)) {
    errors.push('description has a line break in it')
  } else if (description !== null && /[.!?]\s+\S/.test(description)) {
    errors.push('description is more than one sentence')
  }

  const version = text('version', 32)
  if (version !== null && !VERSION.test(version)) {
    errors.push(`${version} is not a version, and a version is MAJOR.MINOR.PATCH in numbers`)
  }

  if (meta.tags !== undefined) {
    if (!Array.isArray(meta.tags)) errors.push('tags is not an array')
    else if (meta.tags.length < 1 || meta.tags.length > 4) {
      errors.push(`tags has ${meta.tags.length} entries, and it may have 1 to 4`)
    } else {
      for (const tag of meta.tags) {
        if (typeof tag !== 'string' || !TAG.test(tag)) {
          errors.push(
            `${JSON.stringify(tag)} is not a tag, and a tag is 1 to 20 lower case letters, digits, spaces and hyphens`,
          )
        }
      }
      if (new Set(meta.tags).size !== meta.tags.length) errors.push('tags names one tag twice')
    }
  }

  if (meta.variants !== undefined) {
    if (!Array.isArray(meta.variants)) errors.push('variants is not an array')
    else if (!meta.variants.length) errors.push('variants is empty, and a theme states at least one scheme')
    else if (JSON.stringify(meta.variants) !== JSON.stringify(SCHEMES.filter((scheme) => meta.variants.includes(scheme)))) {
      errors.push(
        `${JSON.stringify(meta.variants)} is not variants, and variants is ["light"], ["dark"] or ["light","dark"]`,
      )
    }
  }

  const updated = text('updated', 10)
  const parts = updated === null ? null : DATE.exec(updated)
  if (updated !== null && !parts) {
    errors.push(`${updated} is not a date, and a date is YYYY-MM-DD`)
  } else if (parts) {
    const day = new Date(`${updated}T00:00:00Z`)
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== updated) {
      errors.push(`${updated} is not a day that exists`)
    } else if (Number(parts[1]) < 2000 || Number(parts[1]) > 2100) {
      errors.push(`${updated} is outside the years 2000 to 2100`)
    }
  }

  return errors
}

/** The whole theme: its metadata, its stylesheet, and the one thing that spans
 *  both. `variants` is a promise about the file, so the schemes it names and the
 *  scheme blocks the stylesheet writes have to be the same set. Somebody who
 *  installs a pair and gets one scheme has been told something untrue. */
export function reviewTheme(folder, meta, css) {
  const problems = reviewMeta(meta, folder).map((error) => ({ file: 'theme.json', error }))
  const sheet = reviewCss(css)
  const stated = Array.isArray(meta?.variants)
    ? SCHEMES.filter((scheme) => meta.variants.includes(scheme))
    : []

  for (const scheme of stated) {
    if (!sheet.schemes.has(scheme)) {
      problems.push({
        file: 'theme.json',
        error: `variants says ${scheme}, so theme.css needs a [data-theme='${scheme}'] block`,
      })
    }
  }

  for (const scheme of sheet.schemes.keys()) {
    if (!stated.includes(scheme)) {
      problems.push({
        file: 'theme.css',
        error: `theme.css has a [data-theme='${scheme}'] block, so variants has to say ${scheme}`,
      })
    }
  }

  for (const error of sheet.errors) problems.push({ file: 'theme.css', error })

  return { problems, root: sheet.root, schemes: sheet.schemes }
}

/** Every token that applies under one scheme: the shared block, then the
 *  scheme's own on top of it, which is the order the browser resolves them in.
 *  A scheme the theme does not state has no palette at all.
 *
 *  Throws on a value a palette cannot carry, which is the one thing here that is
 *  not a matter of taste. `usableValue` lets a brace or a semicolon inside a
 *  string through, because by the time it is asked the scanner has read the block
 *  and knows the one it met was text. A palette has no scanner in front of it:
 *  the store pastes it into a block of its own, where a semicolon ends the
 *  declaration and a brace ends the block, and the app drops such a value without
 *  a word and paints the card a colour short. So it is refused here instead,
 *  loudly, at submission, while there is still somebody to ask. */
export function paletteOf(root, schemes, scheme) {
  if (!schemes.has(scheme)) return {}

  const merged = new Map(root)
  for (const [token, value] of schemes.get(scheme)) merged.set(token, value)

  for (const [token, value] of merged) {
    if (!usablePaletteValue(value)) {
      throw new Error(
        `${token}: ${value} cannot go in a palette, because a brace or a semicolon in one would end the block the store pastes it into, so write the value without them`,
      )
    }
  }

  return Object.fromEntries(merged)
}

/** The checkout, from this file's place in it. */
export function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

/** The theme ids in the checkout, sorted, which is the order the index wants
 *  them in. */
export function themeIds(root) {
  return readdirSync(join(root, 'themes'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** One theme, read from disk. Throws on unreadable JSON, which the caller
 *  reports as the problem it is. */
export function readTheme(root, id) {
  const folder = join(root, 'themes', id)
  return {
    meta: JSON.parse(readFileSync(join(folder, 'theme.json'), 'utf8')),
    css: readFileSync(join(folder, 'theme.css'), 'utf8'),
  }
}

/** Every file in the checkout, as paths relative to it, skipping what no
 *  submission owns. */
function walk(root, at = root, found = []) {
  for (const name of readdirSync(at).sort()) {
    if (name === '.git' || name === 'node_modules') continue

    const path = join(at, name)
    if (statSync(path).isDirectory()) walk(root, path, found)
    else found.push(relative(root, path).split(sep).join('/'))
  }
  return found
}

/** The shape of the tree. A theme is a folder under `themes/` named by its id
 *  and holding exactly the two files. A `theme.json` or a `theme.css` anywhere
 *  else is either a theme the store will never see or a second copy of one it
 *  will, and both are worth catching while there is somebody to ask. */
function reviewTree(root) {
  const problems = []
  const homes = new Set(['template'])

  for (const name of readdirSync(join(root, 'themes')).sort()) {
    const path = join(root, 'themes', name)

    if (!statSync(path).isDirectory()) {
      problems.push({ file: `themes/${name}`, error: 'is not a theme folder' })
      continue
    }

    homes.add(`themes/${name}`)

    if (!ID.test(name)) {
      problems.push({
        file: `themes/${name}`,
        error: 'is not an id, and an id is 1 to 39 lower case letters, digits and hyphens',
      })
    }

    const held = readdirSync(path).sort()
    if (JSON.stringify(held) !== JSON.stringify(THEME_FILES)) {
      problems.push({
        file: `themes/${name}`,
        error: `holds ${held.join(', ') || 'nothing'}, and a theme folder holds exactly ${THEME_FILES.join(' and ')}`,
      })
    }
  }

  for (const path of walk(root)) {
    if (THEME_FILES.includes(basename(path)) && !homes.has(dirname(path))) {
      problems.push({ file: path, error: 'is outside a themes/<id>/ folder' })
    }
  }

  return problems
}

/** The starting point authors copy, held to the rules a submission is held to,
 *  so a copy of it passes before it has been touched. */
function reviewTemplate(root) {
  const folder = join(root, 'template')
  const held = readdirSync(folder).sort()
  if (JSON.stringify(held) !== JSON.stringify(THEME_FILES)) {
    return [
      {
        file: 'template',
        error: `holds ${held.join(', ') || 'nothing'}, and it holds exactly ${THEME_FILES.join(' and ')}`,
      },
    ]
  }

  const meta = JSON.parse(readFileSync(join(folder, 'theme.json'), 'utf8'))
  const css = readFileSync(join(folder, 'theme.css'), 'utf8')
  return reviewTheme('template', meta, css).problems.map(({ file, error }) => ({
    file: `template/${file}`,
    error,
  }))
}

function main() {
  const root = repoRoot()
  const problems = [...reviewTree(root), ...reviewTemplate(root)]
  const good = []

  for (const id of themeIds(root)) {
    let theme

    try {
      theme = readTheme(root, id)
    } catch (error) {
      problems.push({ file: `themes/${id}`, error: `could not be read: ${error.message}` })
      continue
    }

    const found = reviewTheme(id, theme.meta, theme.css)
    for (const { file, error } of found.problems) {
      problems.push({ file: `themes/${id}/${file}`, error })
    }

    if (!found.problems.length) {
      good.push(`ok  themes/${id}  ${[...found.schemes.keys()].join(' and ') || 'no scheme'}`)
    }
  }

  if (problems.length) {
    for (const { file, error } of problems) console.error(`${file}: ${error}`)
    console.error('')
    console.error(
      `${problems.length} problem${problems.length === 1 ? '' : 's'}. A theme in this registry is either entirely within the rules or refused, so none of this is accepted until they are gone.`,
    )
    process.exitCode = 1
    return
  }

  for (const line of good) console.log(line)
  console.log(`${good.length} themes, every rule met.`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}

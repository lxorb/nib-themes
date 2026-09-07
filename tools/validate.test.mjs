/** The rules, tested one at a time.
 *
 *  Every test here is a submission somebody could plausibly send: a typo in a
 *  token, a media query, a font pulled off a CDN, a pair that says it has two
 *  schemes and ships one. What the registry does with each of those is the whole
 *  contract with theme authors, so it is written down as tests rather than
 *  described in a document that can drift from the code.
 *
 *  Run with: node --test tools/ */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  declarationsOf,
  MOST_BYTES,
  MOST_DECLARATIONS,
  MOST_RULES,
  paletteOf,
  readTheme,
  repoRoot,
  reviewCss,
  reviewMeta,
  reviewTheme,
  scan,
  selectorOf,
  themeIds,
  withoutComments,
} from './validate.mjs'

/** A theme.json that passes, with one field replaced. */
const meta = (extra = {}) => ({
  id: 'demo',
  name: 'Demo',
  author: 'Nib',
  version: '1.0.0',
  description: 'A theme for a test.',
  tags: ['light'],
  licence: 'MIT',
  variants: ['light'],
  updated: '2026-09-07',
  ...extra,
})

const LIGHT = "[data-theme='light'] {\n  color-scheme: light;\n  --bg: #ffffff;\n}"
const DARK = "[data-theme='dark'] {\n  color-scheme: dark;\n  --bg: #000000;\n}"

/** Whether the reasons given include one about a given thing. */
const about = (reasons, text) => reasons.some((reason) => reason.includes(text))

/** The one reason a sheet was refused, asserted to be about a given thing. */
const refused = (css, text) => {
  const { errors } = reviewCss(css)
  assert.ok(errors.length > 0, `expected a refusal about ${text}`)
  assert.ok(about(errors, text), `expected a refusal about ${text}, got: ${errors.join(' | ')}`)
}

describe('the parser', () => {
  test('a selector is compared without its quotes, spaces or case', () => {
    assert.equal(selectorOf('[data-theme = "dark" ]'), '[data-theme=dark]')
    assert.equal(selectorOf("[data-theme='light']"), '[data-theme=light]')
    assert.equal(selectorOf('#WRITE   H1'), '#write h1')
    assert.equal(selectorOf('\n  :root  '), ':root')
  })

  test('a declaration keeps a semicolon that is inside a function or a string', () => {
    assert.deepEqual(declarationsOf('--a: rgb(1 2 3 / 0.5); --b: 2'), [
      ['--a', 'rgb(1 2 3 / 0.5)'],
      ['--b', '2'],
    ])
    assert.deepEqual(declarationsOf("--a: 'x;y'"), [['--a', "'x;y'"]])
  })

  test('a fragment with no colon comes back with no property name', () => {
    assert.deepEqual(declarationsOf('--bg #fff'), [['', '--bg #fff']])
  })

  test('a comment leaves its line breaks behind, so a line number stays true', () => {
    const css = '/* one\ntwo */\n:root { --bg: #fff }'
    assert.equal(withoutComments(css).split('\n').length, 3)
    assert.equal(scan(withoutComments(css)).rules[0].line, 3)
  })

  test('a comment on one line becomes a space', () => {
    assert.equal(withoutComments('a/* x */b'), 'a b')
  })

  test('a flat rule is read, and anything else is set aside', () => {
    const { rules, stray } = scan(':root { --bg: #fff }\n@import "other.css";')
    assert.equal(rules.length, 1)
    assert.equal(stray.length, 1)
    assert.equal(stray[0].line, 2)
  })

  test('an at-rule with a block of its own leaves its closing brace behind as well', () => {
    const { rules, stray } = scan('@media print { :root { --bg: #000 } }')
    assert.equal(rules.length, 0)
    assert.equal(stray.length, 2)
  })

  test('a block that never closes is set aside rather than read', () => {
    const { rules, stray } = scan(':root { --bg: #fff')
    assert.equal(rules.length, 0)
    assert.equal(stray.length, 1)
  })

  test('text after the last rule is set aside', () => {
    const { stray } = scan(':root { --bg: #fff }\nnonsense')
    assert.equal(stray.length, 1)
    assert.ok(stray[0].text.includes('nonsense'))
  })
})

describe('a stylesheet the registry takes', () => {
  test('token blocks and their tokens', () => {
    const { errors, root, schemes } = reviewCss(`:root { --font-mono: 'X', monospace }\n${LIGHT}`)
    assert.deepEqual(errors, [])
    assert.deepEqual([...root], [['--font-mono', "'X', monospace"]])
    assert.deepEqual([...schemes.get('light')], [['--bg', '#ffffff']])
  })

  test('both scheme blocks in one file', () => {
    const { errors, schemes } = reviewCss(`${LIGHT}\n${DARK}`)
    assert.deepEqual(errors, [])
    assert.deepEqual([...schemes.keys()], ['light', 'dark'])
  })

  test('a scheme block stated with nothing but color-scheme', () => {
    const { errors, schemes } = reviewCss("[data-theme='dark'] { color-scheme: dark }")
    assert.deepEqual(errors, [])
    assert.deepEqual([...schemes.get('dark')], [])
  })

  test('one rule for the shared block and both schemes', () => {
    const { errors, root, schemes } = reviewCss(
      ":root,\n[data-theme='light'],\n[data-theme='dark'] { --line: #eee }",
    )
    assert.deepEqual(errors, [])
    assert.equal(root.get('--line'), '#eee')
    assert.equal(schemes.get('dark').get('--line'), '#eee')
  })

  test('prose rules on the parts a note is made of', () => {
    const { errors } = reviewCss(
      '#write { letter-spacing: 0.01em }\n#write h1, #write h2 { font-weight: 600 }\n#write pre code { font-size: 0.9em }',
    )
    assert.deepEqual(errors, [])
  })

  test('a token block in upper case, which CSS treats as the same selector', () => {
    const { errors, schemes } = reviewCss('[DATA-THEME="LIGHT"] { --bg: #fff }')
    assert.deepEqual(errors, [])
    assert.ok(schemes.has('light'))
  })
})

describe('a stylesheet the registry refuses', () => {
  test('an at-rule of any kind', () => {
    refused('@import "other.css";\n:root { --bg: #fff }', 'not a theme rule')
    refused('@media (min-width: 40em) { :root { --bg: #fff } }', 'not a theme rule')
    refused('@font-face { font-family: X }', 'not a theme rule')
    refused('@charset "utf-8";\n:root { --bg: #fff }', 'not a theme rule')
  })

  test('a nested rule', () => {
    refused(':root { --bg: #fff; #write { color: red } }', 'not a theme rule')
  })

  test('a selector that is not a token block or a part of a note', () => {
    refused('.sidebar { color: red }', '.sidebar is not a selector')
    refused('body { color: red }', 'body is not a selector')
    refused('#write div { color: red }', '#write div is not a selector')
    refused('#write h1 span { color: red }', 'not a selector')
    refused("[data-theme='sepia'] { --bg: #fff }", 'not a selector')
    refused('#write:hover { color: red }', 'not a selector')
  })

  test('a property in a token block that is not a token', () => {
    refused(':root { color: red }', 'may not set color')
    refused("[data-theme='light'] { background: #fff }", 'may not set background')
  })

  test('a token in a prose rule', () => {
    refused('#write { --bg: #fff }', 'may not set --bg')
  })

  test('a property in a prose rule that would move the app around', () => {
    refused('#write h1 { position: absolute }', 'may not set position')
    refused('#write { display: none }', 'may not set display')
    refused('#write p { transition: color 1s }', 'may not set transition')
    refused('#write p { content: "x" }', 'may not set content')
  })

  test('a token Nib does not declare, which would do nothing at all', () => {
    refused("[data-theme='light'] { --acent: #b02e5a }", '--acent is not a token Nib declares')
    refused("[data-theme='light'] { --BG: #fff }", '--BG is not a token Nib declares')
  })

  test('a value that reaches outside the stylesheet', () => {
    refused(':root { --bg: url(https://example.com/x.png) }', 'reaches outside')
    refused(':root { --bg: image-set("x.png" 1x) }', 'reaches outside')
    refused('#write a { color: attr(href) }', 'reaches outside')
    refused('#write a { color: expression(alert(1)) }', 'reaches outside')
    refused('#write a { text-decoration: javascript:alert(1) }', 'reaches outside')
    refused(':root { --bg: \\0075rl(x) }', 'reaches outside')
  })

  test('a value that would be read back as something else', () => {
    // A comment marker comments out the rest of the file from wherever it lands,
    // and a quote never closed swallows the end of the rule and whatever follows
    // it. Either means the sheet the app applies is not the sheet read here,
    // which is the one thing these rules exist to prevent.
    refused(':root { --bg: #fff /* }', 'is not a value a theme may state')
    refused(':root { --bg: */ #fff }', 'is not a value a theme may state')
    refused(":root { --font-mono: 'X, monospace }", 'is not a value a theme may state')
    refused(':root { --font-mono: "X, monospace }', 'is not a value a theme may state')

    // A control character goes with them, because it is invisible to whoever
    // reviews the submission. Which also means a value stays on one line: write
    // a long shadow out in full rather than wrapping it.
    refused(':root { --bg: #fff\u0007 }', 'is not a value a theme may state')
    refused(':root { --shadow-sm: 0 1px\n    2px rgb(0 0 0 / 0.2) }', 'is not a value a theme may state')
  })

  test('a semicolon inside a string is not a breakout, so a font may keep one', () => {
    // declarationsOf has already split the declaration at every semicolon that
    // was not in a string, so one that reaches a value is text. Banning it with
    // the rest would cost a real font family its name.
    const { errors } = reviewCss("#write { font-family: 'Semi; colon', serif }")
    assert.deepEqual(errors, [])
  })

  test('an at-rule with no block of its own does not take the rule after it', () => {
    // It ends at its semicolon, so what follows the semicolon is a rule of its
    // own. Read as one prelude the two went together, and the author was told
    // about a line that was not the problem.
    const { errors, schemes } = reviewCss(`@charset "utf-8";\n${DARK}`)
    assert.equal(errors.length, 1)
    assert.ok(errors[0].startsWith('line 1:'), errors[0])
    assert.ok(errors[0].includes('@charset'), errors[0])
    assert.equal(schemes.get('dark').get('--bg'), '#000000')
  })

  test('two at-rules in a row are two reasons, each on its own line', () => {
    // The @media block leaves its closing brace behind as a third, which is the
    // scanner refusing to read past a block it did not understand.
    const { errors } = reviewCss("@import url('x.css');\n@media (min-width: 1px) { :root { --bg: #fff } }")
    assert.ok(errors.length >= 2, errors.join(' | '))
    assert.ok(errors[0].startsWith('line 1:'), errors[0])
    assert.ok(errors[0].includes('@import'), errors[0])
    assert.ok(about(errors, '@media'), errors.join(' | '))
  })

  test('a rule that says nothing, and a declaration that is not one', () => {
    refused(':root { }', 'has no declarations')
    refused(':root { --bg }', 'is not a declaration')
    refused(':root { --bg: }', '--bg has no value')
  })

  test('one rule that mixes a token block with prose, in either order', () => {
    // The first selector used to decide the kind of the whole rule, so the list
    // below was read as prose and allowed to set opacity and font-size on :root,
    // which is the element the app itself is laid out on: a window nobody can
    // see, and every measurement in it rescaled. Nothing a theme wants needs the
    // mixture, so the rule goes whole either way round.
    for (const list of [
      ':root, #write',
      '#write, :root',
      ':root, #write h1',
      "#write, [data-theme='dark']",
    ]) {
      refused(`${list} { opacity: 0.03; font-size: 200px }`, 'lists a token block and prose together')
    }

    // Whole: it does not even count as stating the scheme it names.
    const { schemes } = reviewCss("#write, [data-theme='dark'] { opacity: 0.03 }")
    assert.equal(schemes.has('dark'), false)
  })

  test('a file larger than a theme may be', () => {
    const filler = `/*${'x'.repeat(MOST_BYTES)}*/\n`
    refused(`${filler}${LIGHT}`, `a theme may be ${MOST_BYTES}`)
  })

  test('more rules than a theme may have', () => {
    const many = `${':root { --bg: #fff }\n'.repeat(MOST_RULES + 1)}`
    refused(many, `a theme may have ${MOST_RULES}`)
  })

  test('more declarations than a theme may have', () => {
    const many = `:root {\n${'  --bg: #fff;\n'.repeat(MOST_DECLARATIONS + 1)}}`
    refused(many, `a theme may have ${MOST_DECLARATIONS}`)
  })

  test('the reason names the line it is on', () => {
    const { errors } = reviewCss(`${LIGHT}\n\n.sidebar { color: red }`)
    assert.equal(errors.length, 1)
    assert.ok(errors[0].startsWith('line 6:'), errors[0])
  })
})

describe('the metadata', () => {
  test('a theme.json that says everything it has to', () => {
    assert.deepEqual(reviewMeta(meta(), 'demo'), [])
  })

  test('the id is the folder name', () => {
    assert.ok(about(reviewMeta(meta({ id: 'other' }), 'demo'), 'they have to be the same'))
  })

  test('an id is lower case letters, digits and hyphens', () => {
    for (const id of ['Demo', 'de mo', 'de_mo', '-demo', 'démo', 'a'.repeat(40)]) {
      assert.ok(reviewMeta(meta({ id }), id).length > 0, `${id} should not be an id`)
    }
    assert.deepEqual(reviewMeta(meta({ id: 'a' }), 'a'), [])
    assert.deepEqual(reviewMeta(meta({ id: '0-a9' }), '0-a9'), [])
  })

  test('a name and an author are short and present', () => {
    assert.ok(about(reviewMeta(meta({ name: '' }), 'demo'), 'name is 0 characters'))
    assert.ok(about(reviewMeta(meta({ name: 'x'.repeat(41) }), 'demo'), 'name is 41 characters'))
    assert.ok(about(reviewMeta(meta({ author: ' Nib' }), 'demo'), 'author has whitespace'))
    assert.ok(about(reviewMeta(meta({ author: 7 }), 'demo'), 'author is not a string'))
  })

  test('a description is one sentence on one line', () => {
    assert.ok(about(reviewMeta(meta({ description: 'One. Two.' }), 'demo'), 'more than one sentence'))
    assert.ok(about(reviewMeta(meta({ description: 'One\ntwo' }), 'demo'), 'line break'))
    assert.ok(about(reviewMeta(meta({ description: 'x'.repeat(121) }), 'demo'), '121 characters'))
    assert.deepEqual(reviewMeta(meta({ description: 'Warm, and quiet.' }), 'demo'), [])
  })

  test('a version is three numbers', () => {
    for (const version of ['1.0', '1.0.0.0', '1.0.0-beta', '01.0.0', 'v1.0.0', '1.0.x']) {
      assert.ok(about(reviewMeta(meta({ version }), 'demo'), 'is not a version'), version)
    }
    assert.deepEqual(reviewMeta(meta({ version: '12.3.40' }), 'demo'), [])
  })

  test('tags are one to four lower case words', () => {
    assert.ok(about(reviewMeta(meta({ tags: [] }), 'demo'), 'tags has 0 entries'))
    assert.ok(about(reviewMeta(meta({ tags: ['a', 'b', 'c', 'd', 'e'] }), 'demo'), '5 entries'))
    assert.ok(about(reviewMeta(meta({ tags: ['Light'] }), 'demo'), 'is not a tag'))
    assert.ok(about(reviewMeta(meta({ tags: ['x'.repeat(21)] }), 'demo'), 'is not a tag'))
    assert.ok(about(reviewMeta(meta({ tags: [1] }), 'demo'), 'is not a tag'))
    assert.ok(about(reviewMeta(meta({ tags: ['light', 'light'] }), 'demo'), 'twice'))
    assert.deepEqual(reviewMeta(meta({ tags: ['high contrast', 'low-key'] }), 'demo'), [])
  })

  test('a licence is a short name, and the theme states its own', () => {
    assert.ok(about(reviewMeta(meta({ licence: '' }), 'demo'), 'licence is 0 characters'))
    assert.deepEqual(reviewMeta(meta({ licence: 'CC0-1.0' }), 'demo'), [])
  })

  test('variants is light, dark, or both in that order', () => {
    for (const variants of [[], ['dark', 'light'], ['light', 'light'], ['sepia'], 'light', ['LIGHT']]) {
      assert.ok(reviewMeta(meta({ variants }), 'demo').length > 0, JSON.stringify(variants))
    }
    assert.deepEqual(reviewMeta(meta({ variants: ['dark'] }), 'demo'), [])
    assert.deepEqual(reviewMeta(meta({ variants: ['light', 'dark'] }), 'demo'), [])
  })

  test('updated is a day that exists, in this century or the next', () => {
    assert.ok(about(reviewMeta(meta({ updated: '2026-9-7' }), 'demo'), 'is not a date'))
    assert.ok(about(reviewMeta(meta({ updated: '07/09/2026' }), 'demo'), 'is not a date'))
    assert.ok(about(reviewMeta(meta({ updated: '2026-02-30' }), 'demo'), 'not a day that exists'))
    assert.ok(about(reviewMeta(meta({ updated: '2026-13-01' }), 'demo'), 'not a day that exists'))
    assert.ok(about(reviewMeta(meta({ updated: '1999-01-01' }), 'demo'), 'outside the years'))
    assert.ok(about(reviewMeta(meta({ updated: '2101-01-01' }), 'demo'), 'outside the years'))
    assert.deepEqual(reviewMeta(meta({ updated: '2026-02-28' }), 'demo'), [])
  })

  test('a key theme.json does not have, and a key it needs', () => {
    assert.ok(about(reviewMeta(meta({ screenshot: 'x.png' }), 'demo'), 'screenshot is not a key'))
    const missing = { ...meta() }
    delete missing.licence
    assert.ok(about(reviewMeta(missing, 'demo'), 'licence is missing'))
  })

  test('anything that is not an object at all', () => {
    assert.deepEqual(reviewMeta([], 'demo'), ['theme.json is not an object'])
    assert.deepEqual(reviewMeta(null, 'demo'), ['theme.json is not an object'])
  })
})

describe('the metadata and the stylesheet together', () => {
  test('a pair that ships both schemes', () => {
    const found = reviewTheme('demo', meta({ variants: ['light', 'dark'] }), `${LIGHT}\n${DARK}`)
    assert.deepEqual(found.problems, [])
  })

  test('a theme that promises a scheme it does not ship', () => {
    const found = reviewTheme('demo', meta({ variants: ['light', 'dark'] }), LIGHT)
    assert.ok(about(found.problems.map((one) => one.error), "needs a [data-theme='dark'] block"))
  })

  test('a theme that ships a scheme it does not promise', () => {
    const found = reviewTheme('demo', meta({ variants: ['light'] }), `${LIGHT}\n${DARK}`)
    assert.ok(about(found.problems.map((one) => one.error), 'variants has to say dark'))
  })

  test('a problem names the file it is in', () => {
    const found = reviewTheme('demo', meta({ version: '1' }), '.sidebar { color: red }')
    assert.deepEqual(new Set(found.problems.map((one) => one.file)), new Set(['theme.json', 'theme.css']))
  })
})

describe('the palettes the index carries', () => {
  test('the shared block applies to every scheme, and the scheme block wins', () => {
    const { root, schemes } = reviewCss(
      `:root { --bg: #eeeeee; --line: #dddddd }\n${LIGHT}\n${DARK}`,
    )
    assert.deepEqual(paletteOf(root, schemes, 'light'), { '--bg': '#ffffff', '--line': '#dddddd' })
    assert.deepEqual(paletteOf(root, schemes, 'dark'), { '--bg': '#000000', '--line': '#dddddd' })
  })

  test('a scheme the theme does not state has no palette', () => {
    const { root, schemes } = reviewCss(`:root { --line: #ddd }\n${LIGHT}`)
    assert.deepEqual(paletteOf(root, schemes, 'dark'), {})
  })

  test('a value is carried across exactly as it was written', () => {
    const { root, schemes } = reviewCss("[data-theme='dark'] { --accent-soft: rgb(1 2 3 / 0.15) }")
    assert.equal(paletteOf(root, schemes, 'dark')['--accent-soft'], 'rgb(1 2 3 / 0.15)')
  })
})

describe('the themes in this repository', () => {
  const root = repoRoot()

  test('every one of them passes', () => {
    for (const id of themeIds(root)) {
      const { meta: found, css } = readTheme(root, id)
      const problems = reviewTheme(id, found, css).problems
      assert.deepEqual(problems, [], `themes/${id}: ${problems.map((one) => one.error).join(' | ')}`)
    }
  })

  test('the template passes as well, so a copy of it starts clean', () => {
    const folder = join(root, 'template')
    assert.deepEqual(readdirSync(folder).sort(), ['theme.css', 'theme.json'])
    const found = JSON.parse(readFileSync(join(folder, 'theme.json'), 'utf8'))
    const css = readFileSync(join(folder, 'theme.css'), 'utf8')
    assert.deepEqual(reviewTheme('template', found, css).problems, [])
  })

  test('there is more than one of them', () => {
    assert.ok(themeIds(root).length >= 6)
  })
})

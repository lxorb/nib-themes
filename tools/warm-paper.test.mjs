/** Warm Paper, read on both sides.
 *
 *  The one theme here written to WCAG's AA rather than to taste, so the floors are
 *  tests: a step taken on one colour that drops another word under its floor fails
 *  here, not on somebody's screen. Every pair is one the app actually puts
 *  together - ink on each surface, a link on a card, a fence's colours on the
 *  fence, a button's words on the accent, a tag on its own wash.
 *
 *  Three colours are the app's rather than the theme's, because the registry has no
 *  name for them yet; they are written out below as packages/themes/src/tokens.css
 *  in the app states them.
 *
 *  Run with: npm test */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { paletteOf, readTheme, repoRoot, reviewTheme } from './validate.mjs'

/** The app's own, under a theme that does not restate them. */
const APP = {
  light: { '--accent-ink': '#ffffff', edge: 0.24 },
  dark: { '--accent-ink': '#0b0d10', edge: 0.2 },
}

/** Text, secondary text, and the edge of the open tab (test/tab-edge.test.ts). */
const BODY = 7
const AA = 4.5
const EDGE = 1.5

const SURFACES = ['--bg', '--surface', '--surface-2', '--surface-3']

function sides() {
  const { meta, css } = readTheme(repoRoot(), 'warm-paper')
  const found = reviewTheme('warm-paper', meta, css)
  assert.deepEqual(found.problems, [])
  return {
    meta,
    light: paletteOf(found.root, found.schemes, 'light'),
    dark: paletteOf(found.root, found.schemes, 'dark'),
  }
}

/** A colour as three channels and an alpha, from `#rrggbb` or `rgb(r g b / a)`. */
function rgbOf(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { rgb: [n >> 16, (n >> 8) & 255, n & 255], alpha: 1 }
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(value)
  if (rgb) return { rgb: [1, 2, 3].map((i) => Number(rgb[i])), alpha: Number(rgb[4]) }
  throw new Error(`not a colour this test reads: ${value}`)
}

function over(top, alpha, under) {
  return top.map((channel, i) => channel * alpha + under[i] * (1 - alpha))
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

for (const scheme of ['light', 'dark']) {
  describe(`Warm Paper, ${scheme}`, () => {
    const palette = { ...APP[scheme], ...sides()[scheme] }

    /** A token as a solid colour, laid over the page when it is a wash. */
    const solid = (token, under = '--bg') => {
      const { rgb, alpha } = rgbOf(palette[token] ?? APP[scheme][token])
      return alpha === 1 ? rgb : over(rgb, alpha, solid(under))
    }

    const holds = (ink, grounds, floor) => {
      for (const ground of grounds) {
        const measured = ratio(solid(ink), solid(ground))
        assert.ok(measured >= floor, `${ink} on ${ground} is ${measured.toFixed(2)}, under ${floor}`)
      }
    }

    test('body text on every surface, the pressed one included', () => {
      holds('--text', [...SURFACES, '--press'], BODY)
      holds('--text-strong', [...SURFACES, '--press'], BODY)
    })

    test('secondary text on every surface', () => {
      holds('--muted', SURFACES, AA)
      holds('--muted-strong', SURFACES, AA)
    })

    test('links, failures, successes and callout titles on the page and its cards', () => {
      const words = ['--accent', '--accent-hover', '--danger', '--success']
      for (const one of [...words, '--callout-note', '--callout-warning']) {
        holds(one, ['--bg', '--surface', '--surface-2'], AA)
      }
    })

    test("a button's words on the accent, at rest, under the pointer and pressed", () => {
      for (const fill of ['--accent', '--accent-hover', '--accent-press']) {
        holds('--accent-ink', [fill], AA)
      }
    })

    test('every colour of a fence, on a fence and on inline code', () => {
      const fence = [
        '--text',
        '--accent',
        '--success',
        '--muted',
        '--muted-strong',
        '--syntax-number',
        '--syntax-function',
        '--syntax-type',
        '--syntax-property',
      ]
      for (const one of fence) holds(one, ['--surface', '--surface-2'], AA)
    })

    test('words under a selection and on the open row', () => {
      const selected = solid('--selection')
      const open = over(solid('--accent'), 0.16, solid('--bg'))
      for (const ink of ['--text', '--text-strong']) {
        assert.ok(ratio(solid(ink), selected) >= BODY, `${ink} under a selection`)
        assert.ok(ratio(solid(ink), open) >= BODY, `${ink} on the open row`)
      }
      assert.ok(ratio(selected, solid('--bg')) >= 1.3, 'a selection that can be seen')
    })

    test('a link on its own wash, and a tag on its own at rest and under the pointer', () => {
      assert.ok(ratio(solid('--accent'), solid('--accent-soft')) >= AA)
      for (const share of [0.14, 0.24]) {
        for (const ground of ['--bg', '--surface']) {
          const wash = over(solid('--accent-hover'), share, solid(ground))
          assert.ok(ratio(solid('--accent-hover'), wash) >= AA, `a tag at ${share} on ${ground}`)
        }
      }
    })

    test('words through every coloured highlight', () => {
      for (const n of [1, 2, 4, 5, 6]) {
        const mark = over(solid(`--canvas-${n}`), 0.22, solid('--bg'))
        assert.ok(ratio(solid('--text'), mark) >= AA, `text on mark ${n}`)
      }
    })

    test('the canvas colours stand off the page', () => {
      for (const n of [1, 2, 3, 4, 5, 6]) {
        assert.ok(ratio(solid(`--canvas-${n}`), solid('--bg')) >= 3, `canvas ${n}`)
      }
    })

    test('the open tab keeps its edge on every frame the theme paints', () => {
      for (const frame of ['--bg', '--surface', '--surface-2']) {
        const edge = over(solid('--text'), palette.edge, solid(frame))
        assert.ok(ratio(edge, solid(frame)) >= EDGE, `the edge on ${frame}`)
      }
    })
  })
}

test('Warm Paper says it is a pair', () => {
  const { meta } = sides()
  assert.deepEqual(meta.variants, ['light', 'dark'])
})

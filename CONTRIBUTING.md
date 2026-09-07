# Contributing a theme

## What a theme is

Nib's colours all come from custom properties declared in
`packages/themes/src/tokens.css`. A theme is a stylesheet that restates some of
them. That is the whole mechanism: set `--bg`, and every surface painted with it
changes, in the editor, the sidebar, the command palette and an exported page.

A theme may also set a few properties on the prose of a note, which is how a
serif heading or a heavier quote bar gets in.

It may do nothing else. No layout, no motion, no fetching, no scripting, no
selectors of its own. A theme is CSS somebody else wrote, applied to the whole
app, and a person who installed a colour scheme did not agree to having their
sidebar moved off screen or their reading sent to a stranger's server. So the
grammar is small enough to check line by line, and both the app and this registry
check it.

The two differ in what happens to a rule that breaks one of the rules. The
app drops that rule, names it, and installs the rest, because somebody who has
just clicked install is better served by a theme that does a little less than by
nothing at all. Here, one broken rule fails the whole submission. A theme in this
registry is entirely within the rules or it is not in the registry.

## The two kinds of rule

Flat rules only: `selector { declarations }`, with nothing nested inside, and no
at-rules at all. No `@media`, `@supports`, `@import`, `@font-face`, `@keyframes`,
`@charset`. A `{` inside a block is a failure rather than something the parser
walks into.

### Token blocks

Three selectors, and each of them may set custom properties and `color-scheme`:

```css
:root {
  /* applies under both schemes */
}

[data-theme='light'] {
  color-scheme: light;
}

[data-theme='dark'] {
  color-scheme: dark;
}
```

Quotes and spacing do not matter: `[data-theme="dark"]` and
`[data-theme = 'dark' ]` are read as the same selector. Set `color-scheme` in
each scheme block, so the browser draws form controls and native scrollbars the
right way round.

A scheme block is what tells the registry that the theme has that scheme, and it
has to agree with `variants` in `theme.json`. A theme that says it is a pair and
ships one scheme is refused, because somebody installing it has been told
something untrue.

### Prose rules

`#write` is the surface the editor and the renderer both draw into. A rule there
reaches the words of a note and never the chrome around them:

```css
#write { }
#write h1, #write h2 { }
#write pre code { }
```

The part after `#write` is one of these, and nothing else:

```
h1  h2  h3  h4  h5  h6  p  a  strong  em  del  mark  code  pre  pre code
blockquote  ul  ol  li  hr  table  thead  tbody  tr  th  td  img  dt  dd
```

What such a rule may set is how the words look, never where they are:

```
color  background  background-color  border  border-color  border-style
border-width  border-top  border-right  border-bottom  border-left
border-radius  box-shadow  font-family  font-feature-settings  font-size
font-style  font-variant  font-weight  letter-spacing  line-height  margin
opacity  padding  text-decoration  text-decoration-color  text-shadow
text-transform  text-underline-offset  word-spacing
```

Absent on purpose: `position`, `display`, `inset`, `z-index`, `transform`,
`visibility`, `overflow`, `width`, `height`, `content`, `animation` and
`transition`. Those are the app's layout and the app's motion, and a theme that
could set them could take a pane away or hold a menu open.

Prose rules are for what a token cannot say. Most good themes have none, or one.

### One list, one kind

A selector list may not name both kinds. `#write, :root { }` is refused whole
rather than read as one of them, because the two allow different properties and
`:root` is the element the whole app is laid out on: a rule that reached it under
the prose rules could set `opacity` or `font-size` there, which is a window
nobody can see and every measurement in it rescaled. Write two rules.

## The tokens

Every token Nib declares, which is every token a theme may set. Setting one that
does not exist is refused, because a typo like `--acent` is a theme that ships
and then silently does nothing.

Colour, per scheme. This is what a theme is mostly made of:

```
--bg  --surface  --surface-2  --surface-3  --press
--line  --line-strong
--muted  --muted-strong  --text  --text-strong
--accent  --accent-hover  --accent-press  --accent-soft  --accent-line
--selection  --danger  --success
--canvas-1  --canvas-2  --canvas-3  --canvas-4  --canvas-5  --canvas-6
--canvas-dot
--scrollbar  --scrollbar-hover
--shadow-sm  --shadow-md  --shadow-lg
```

The surfaces are a ladder: `--bg` is the page, `--surface` through `--surface-3`
are what sits on it, and `--press` is one step deeper again, which means darker
on a light theme and lighter on a dark one. `--accent-soft` fills, `--accent-line`
outlines, and `--selection` is what the reader drags over their own words: all
three are usually the accent at low alpha. The six canvas colours are the ones
JSON Canvas names by number, in the spec's order, so a canvas coloured in Nib
reads the same in another app that follows it.

Type. Only worth touching if the theme is really about type, and every stack has
to end in a family that exists on the machine:

```
--font-ui  --font-content  --font-mono  --monospace
```

The compatibility layer, which is how a Typora theme drops into Nib. Each of
these already follows a colour above, so a theme normally leaves them alone:

```
--bg-color  --text-color  --primary-color  --md-char-color
--heading-char-color  --meta-content-color  --side-bar-bg-color
--control-text-color  --item-hover-bg-color  --item-hover-text-color
--active-file-bg-color  --active-file-text-color  --active-file-border-color
--window-border  --select-text-bg-color  --search-select-bg-color
--search-select-text-color  --code-block-bg-color  --table-border-color
--blockquote-border-color
```

`--search-select-text-color` is the one of those worth setting: it is what sits
on top of the accent, and a light accent needs dark text on it.

The callout kinds. `--callout-tip`, `--callout-important` and `--callout-caution`
follow `--success`, `--accent` and `--danger`, so a theme that sets those three
usually only needs the other two:

```
--callout-note  --callout-tip  --callout-important  --callout-warning
--callout-caution
```

Sizes, spacing, shape, metrics and motion. Allowed, because they are tokens, and
almost always a mistake: they are the app's proportions and the app's timing, not
its colours. Change one only if the theme cannot exist without it:

```
--text-xs  --text-sm  --text-base  --text-content  --leading-content  --zoom
--measure  --space-1 ... --space-7  --radius-sm  --radius-md  --radius-lg
--rail-width  --sidebar-width  --titlebar-height  --scrollbar-width
--scrollbar-thumb
--ease-out  --ease-in-out  --ease-spring
--dur-instant  --dur-fast  --dur-base  --dur-slow  --dur-slower
```

## What a value may not contain

```
url()  image-set()  element()  attr()  expression()  javascript:  backslash
```

`url()` and `image-set()` fetch, which tells whoever is on the other end that
this reader opened their editor. `element()` and `attr()` read the page.
`expression()` is Internet Explorer's way of running script from CSS and costs
nothing to refuse. A backslash is how a keyword gets spelled to slip past a
check like this one, and no theme needs one.

A value also has to read back as the value it was written as, so these go with
them:

```
/*    */    a control character    an odd number of ' or of "
```

A comment marker comments out the rest of the file from wherever it lands, and a
quote that is never closed swallows the end of the rule and whatever follows it.
Either way the sheet that is applied is not the sheet that was read, which is the
one thing all of this is for. A control character goes with them because it is
invisible to whoever reviews the submission, and that also means a value stays on
one line: write a long shadow out in full rather than wrapping it.

A brace and a semicolon are not on the list. By the time a value is read the
parser has ended the block at a `}`, refused the rule at a `{` and split the
declaration at a `;`, so one that is left is inside a string and stays there.
That is what lets `--font-content: 'Semi; colon', serif` through. One exception:
a token whose value holds a brace or a semicolon fails when `index.json` is
built, because a palette there is pasted straight into a block and has no parser
in front of it. Put such a name in a prose rule instead.

## The limits

- 48 kB, which is `48 * 1024` bytes, for `theme.css`.
- 160 rules, and 600 declarations.
- A folder under `themes/` holds exactly `theme.json` and `theme.css`. Nothing
  else: no screenshot, no readme, no license file. The licence goes in
  `theme.json`.

Comments do not count towards the rules or the declarations, because they are
taken out before the file is parsed. They do count towards the 48 kB, and a theme
that explains its own decisions is worth the bytes.

## theme.json

```json
{
  "id": "warm-paper",
  "name": "Warm Paper",
  "author": "Emil Vinu",
  "version": "1.0.0",
  "description": "One short sentence, and no line break in it.",
  "tags": ["light", "warm"],
  "licence": "MIT",
  "variants": ["light"],
  "updated": "2026-09-07"
}
```

Every key is required, and a key that is not on this list is refused.

| Key | What it has to be |
| --- | --- |
| `id` | Lower case letters, digits and hyphens, starting with a letter or a digit, up to 39 characters. The same as the folder name. It is in the URL, so it never changes. |
| `name` | 1 to 40 characters, as it should read in the store. |
| `author` | 1 to 40 characters. Your name or your handle. |
| `version` | `MAJOR.MINOR.PATCH`, plain numbers, no leading zeros. Raise it when you change the theme. |
| `description` | 1 to 120 characters, one sentence, no line break. |
| `tags` | 1 to 4 of them, each 1 to 20 lower case letters, digits, spaces or hyphens. |
| `licence` | A short name: `MIT`, `ISC`, `CC0-1.0`, `AGPL-3.0-only`. This is the licence your theme is under, and it is yours to choose. |
| `variants` | `["light"]`, `["dark"]` or `["light","dark"]`, in that order, matching the scheme blocks in `theme.css`. |
| `updated` | `YYYY-MM-DD`, a day that exists. The day you last changed the theme. |

## Making it readable

A theme that looks good and cannot be read for an hour is not finished. The bar
the themes here are held to, measured against `--bg`:

- Body text (`--text`) at 7:1 or better on a light theme, 6:1 on a dark one.
- Anything muted (`--muted`) at 4.5:1 or better, and check it against
  `--surface` as well, because that is where most muted text actually sits.
- `--accent`, `--danger` and `--success` at 4.5:1 or better, since all three get
  used as text.
- Whatever sits on the accent at 4.5:1 against the accent.

Keep the surfaces a real ladder rather than five names for the same grey, and
keep `--line` visible against `--bg` without competing with the text.

## Writing one

```sh
cp -r template themes/your-id
```

Then set `id` in `theme.json` to `your-id`, fill in the rest, and change the
colours. Delete a token you do not want to restate: it keeps the value the app
already has, which is usually better than a value picked to fill a gap.

Check it:

```sh
node tools/validate.mjs
node tools/index.mjs
```

The first says whether the theme is within the rules, naming the file, the line
and the reason for anything that is not. The second regenerates `index.json`,
which is committed, so it belongs in your pull request along with the theme.

Node 24, no dependencies, nothing to install.

## Submitting

One theme per pull request. CI runs the tests, the validator, the index check and
the writing check, and it has to be green before the theme can be merged. The
messages are meant to be enough to fix a submission without asking anybody, so
if one of them is not, say so in the pull request and it will be improved.

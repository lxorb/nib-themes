# nib-themes

The theme registry behind Nib's theme store. Every theme the store lists lives
here, as two files: what the theme says about itself, and the colours it sets.

A theme is a small stylesheet that overrides Nib's design tokens. It states
colours and it states nothing else, so installing one cannot move a pane, hide
the title bar, fetch a font from somebody's server, or run anything. The rules
that make that true are in `tools/validate.mjs`, the app enforces the same ones
in `apps/desktop/src/lib/themes/validate.ts`, and CI runs them on every pull
request.

## How the app reads it

Nib does not talk to GitHub. It reads two URLs:

```
https://nibeditor.com/themes/index.json
https://nibeditor.com/themes/<id>/theme.css
```

Those are an edge-cached proxy of this repository's files. The app gets one list
and one stylesheet per install, both from a domain Nib controls, which keeps the
store fast, keeps GitHub out of the reader's network traffic, and means the
registry can move without shipping a new version of the app.

`index.json` carries the whole palette of every theme, so the store paints its
live miniatures from the list it already has instead of fetching thirty
stylesheets to find out what colour thirty backgrounds are.

## Layout

| Path | What it is |
| --- | --- |
| `themes/<id>/theme.json` | What the theme says about itself: name, author, version, licence, which schemes it has. |
| `themes/<id>/theme.css` | The theme: token blocks, and prose rules if it has any. |
| `index.json` | Generated, committed. The list the app reads, palettes included. |
| `template/` | A starting point to copy. Held to the same rules, so a copy of it passes. |
| `tools/validate.mjs` | The rules. Run it to check every theme in the checkout. |
| `tools/index.mjs` | Writes `index.json`. `--check` says whether the committed one is current. |
| `tools/no-em-dash.mjs` | No em dashes, the same bar the app holds itself to. |

The folder name is the theme's id, and the id is what the URL carries, so it
never changes once a theme is published.

## Checks

Node 24, no dependencies, nothing to install.

```sh
node --test tools/*.test.mjs   # the rules have their own tests
node tools/validate.mjs        # every theme, and the shape of the tree
node tools/index.mjs           # rewrite index.json
node tools/index.mjs --check   # or just say whether it is current
node tools/no-em-dash.mjs
```

`index.json` is generated and committed, because the registry is served as
static files and there is nothing on the other end to build it. CI runs
`--check` rather than committing a regenerated file itself, so a pull request
that edits a theme and forgets the index fails where its author can see it. The
one field it allows to differ is `generated`, which says when the file was
written and so cannot be derived from the themes.

## Adding a theme

Copy `template/`, change the colours, open a pull request. The rules, the token
list and the reasoning behind both are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

The scaffolding here, the tools and the documents, is AGPL-3.0-only, the same
licence as Nib itself. See [LICENSE](LICENSE).

Each theme states its own licence in its `theme.json`, and that is the licence
the theme is under. The ones in this repository are MIT or CC0-1.0.

# @virtbase/content

MDX for the public website. This package holds no code and is never imported —
`apps/web/source.config.ts` points `fumadocs-mdx` at these directories and
compiles them into `apps/web/.source` at build time.

It is a workspace package rather than a plain directory so that Turborepo
tracks content edits: `@virtbase/web` depends on it, so changing an MDX file
invalidates the web build and typecheck caches.

## Layout

```
legal/<locale>/<slug>.mdx          → /<locale>/legal/<slug>
help/articles/<locale>/<slug>.mdx  → /<locale>/help/article/<slug>
marketing/<locale>/index.mdx       → /<locale>
marketing/<locale>/<slug>.mdx      → /<locale>/<slug>
```

Locales are directories, not filename suffixes, because that is the layout
Crowdin can map (see `crowdin.yml` at the repo root). Fumadocs is configured
with `parser: "dir"` in `apps/web/src/lib/source.ts` to match.

`en` is the source locale. A document that is missing a translation falls back
to `en` at render time (`fallbackLanguage`), and is left out of that locale's
`hreflang` map and sitemap entries, so crawlers are never pointed at a URL that
serves the wrong language.

## Adding a document

1. Write `<collection>/en/<slug>.mdx` with the frontmatter its collection's
   schema requires (`apps/web/source.config.ts`).
2. Leave the other locales to Crowdin, or add them by hand.

Frontmatter `title` and `description` feed page metadata, so treat them as the
`<title>` and meta description rather than as internal labels.

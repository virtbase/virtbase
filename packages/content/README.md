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

Locales are directories, not filename suffixes. Fumadocs is configured with
`parser: "dir"` in `apps/web/src/lib/source.ts` to match.

`en` is the source locale. A document that is missing a translation falls back
to `en` at render time (`fallbackLanguage`), and is left out of that locale's
`hreflang` map and sitemap entries, so crawlers are never pointed at a URL that
serves the wrong language.

## Last updated dates

A document's `lastModified` - the "last updated" date on help and legal pages
and `<lastmod>` in the sitemap - is the date of the newest commit that touched
the file, read from git at build time by the Fumadocs `lastModified` plugin.

Git cannot tell a real edit from a mechanical one. Moving a file, reformatting
it or rewriting its image paths all count as changes. When that makes a date
wrong, set it in the frontmatter, which wins over git:

```yaml
lastModified: 2026-03-19
```

Remove the field again with the next real edit, or the date stops moving.

Vercel clones the last ten commits only, which would date every older file to
the oldest commit in the clone, so the project sets `VERCEL_DEEP_CLONE=true`.
Turborepo cannot see git history, so that variable is part of the build's cache
key.

## Adding a document

1. Write `<collection>/en/<slug>.mdx` with the frontmatter its collection's
   schema requires (`apps/web/source.config.ts`).
2. Add the other locales by hand, or leave them to fall back to `en`.

Frontmatter `title` and `description` feed page metadata, so treat them as the
`<title>` and meta description rather than as internal labels.

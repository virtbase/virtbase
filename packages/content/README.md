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

## Help categories

A help article names its categories in its frontmatter. The first one is its
home: the article's breadcrumb links there. `popular` puts it on the help
center's list of popular articles, ranked in ascending order:

```yaml
categories: [backups, servers]
popular: 1
```

The categories themselves - slug and order - are listed in
`apps/web/src/lib/help-categories.ts`, and their titles, descriptions and icons
in `apps/web/src/features/help/categories.tsx`, translated like any other
interface text. Each is served at `/<locale>/help/category/<slug>`.

Every translation carries the same `categories` and `popular` as its `en`
source, and every category needs at least one article; a test fails otherwise.

## Authors

Every help article names who wrote it, by slug, and the byline links to each
author's page at `/<locale>/authors/<slug>`:

```yaml
authors: [janic]
```

An author is `authors/<locale>/<slug>.mdx`. The frontmatter holds who they are,
the body is their bio, and a locale without its own file falls back to `en`:

```yaml
name: Janic Bellmann
role: CEO
avatar: /assets/static/authors/janic.webp
links:
  github: https://github.com/…
  x: https://x.com/…
  website: https://janic.dev
```

`avatar` is a path under `apps/web/public` rather than a relative image:
structured data and other sites need a URL that stays put. Without one, the
author's initials are shown. A test fails for an article that names an author
with no `en` file.

## Images

An image used by a document lives next to it, in an `images` directory of the
same locale, and is linked relatively:

```md
![Firewall rule options](./images/create-firewall-rule-dialog.png)
```

Every translation therefore carries the same link and gets its own locale's
screenshot. A locale without one of its own points at the source locale's
explicitly (`../en/images/...`), so the fallback is visible in review.

`fumadocs-mdx` turns each link into an import. A missing file fails the build,
and the image is served from `/_next/static/media` under a content hash, with
its width and height known up front. Only `.md` and `.mdx` files become pages,
so the `images` directories need no configuration.

An image that needs a permanent URL - an OpenGraph image, an email, the
`poster` of a `<Video>` - stays in `apps/web/public`. The import only applies
to Markdown image syntax; a path in a JSX attribute is passed through as it is.

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

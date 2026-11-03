# Writing help articles

How the articles in `help/articles` are written, so that a new one reads like
the others no matter who writes it. The mechanics - layout, categories,
authors, images - are in the [package README](../README.md).

The help center exists to solve a customer's problem without a ticket. Every
rule below serves that. Search engines and AI assistants come second: an
article that answers the question well is also the one they quote.

## Before writing

**One article, one goal.** It answers one task ("reset the root password") or
one problem ("I can't connect"). Search the existing articles first: extend
one rather than writing a second that half-overlaps it.

**Check every fact against the product, not against memory.** Each article
quotes labels, limits and timings that change with the code.

| What                       | Where to look                                                      |
| -------------------------- | ------------------------------------------------------------------ |
| UI labels, error messages  | `apps/web/src/i18n/messages/en.po` (and the component using it)    |
| Limits and timings         | `packages/utils/src/constants/limits.ts`, the routers' `ratelimit` |
| What an action really does | the router and its workflow in `packages/api/src`                  |
| Email subjects             | `packages/email/src/messages/en.json`                              |
| Routes in the portal       | `apps/web/src/app/app.virtbase.com/[locale]/(dashboard)`           |

When the code and the UI disagree, the article describes what happens, and the
mismatch is reported as a bug - an article never papers over one.

**Policies are not in the code.** These are decided by the business:

- Outgoing port 25 is open.
- Windows is allowed, without licence or image from us; it is installed from
  the customer's own ISO.
- No additional IPv4 addresses. Each server has one IPv4 address and an IPv6 /64.
- No refunds for a service that works as intended; anything else is decided
  per case, after the customer contacts support.
- No rescue system. A customer boots a live system from a custom ISO, or
  contacts support.
- No identity verification.

Anything else of this kind is asked, not assumed.

## Article types

Pick the type before writing. Don't mix them; link between them instead.

| Type            | The reader says                   | Title pattern                          | Example                                        |
| --------------- | --------------------------------- | -------------------------------------- | ---------------------------------------------- |
| How-to          | "I want to do X"                  | `How do I <verb> <object>?`            | How do I reset my server's root password?      |
| Troubleshooting | "X is broken"                     | the symptom, in the customer's words   | I can't connect to my server                   |
| Concept         | "How does X work?"                | `What …?` / `Which …?` / `How … work?` | Which IP addresses does my server have?        |
| FAQ             | many small questions, one subject | `<Subject>: <topics>`                  | Billing: invoices, payment methods and refunds |

Slugs follow the type: `how-to-…`, `about-…`, or the symptom
(`cant-connect-to-server`, `failed-payment`). A published slug is never
renamed: it is a URL that search engines and other sites link to.

### How-to skeleton

```mdx
<One or two sentences: what the reader achieves, and what it costs or risks.>

## Before you start
- <conditions that make the article not apply: state of the server, OS, plan>
- <what to have ready; data that will be lost>

## <Verb> <object>
1. In the [customer portal](https://app.virtbase.com/servers), select **View** next to your server.
2. <one action per step, location before action>

<What the reader sees when it worked.>

## Check that it worked
<A command or a place in the portal that proves it.>

## If it didn't work
- **<exact error message>** <cause, then fix>
- **<symptom>:** <cause, then fix>
```

### Troubleshooting skeleton

Ordered checks, cheapest and most likely first, each with what to do when it
fails; then a section that maps exact error messages to causes; then what to
send support. `cant-connect-to-server` is the model.

### Concept skeleton

The answer in the first paragraph, then one `##` section per question a reader
has next. Tables for anything with more than two parallel items (statuses,
levels, modes, timelines).

## Frontmatter

```yaml
title: How do I reset my server's root password?
description: Set a new password for root from the customer portal. It takes effect at once, without a restart, and needs the server running with the QEMU guest agent.
categories: [servers, getting-started]
authors: [janic]
related: [cant-connect-to-server, how-to-use-console]
popular: 2
keywords: [root password, forgot password, reset password]
publishedAt: 2026-11-02
lastModified: 2026-11-02
```

- **`title`**: the question or symptom as a customer would type it. Never
  "Virtbase" in it - the page title already ends in "| Virtbase". Aim for
  under 60 characters.
- **`description`**: the answer, in one or two sentences, with the key number
  if there is one. Never "Learn how to …": it is what search results and AI
  answers show, so it has to be useful on its own.
- **`keywords`**: words customers search with, including symptoms and error
  messages. Used by the help center's own search.
- **`related`**: two to four articles a reader of this one needs next.
- **`popular`**: only for the handful of articles that answer the most common
  questions. Ranks are unique.
- **`lastModified`**: only changed for a substantive edit, not for a typo.

## The body

### The first two sentences answer the question

No introduction about the feature, no "In this article". Say what happens,
how long it takes and what the reader risks. A reader who stops after the
first paragraph should already know the answer.

### Steps

- One action per step, numbered. **Location before action**: "On the
  **Overview** page, select **Reset Password**", not the other way round.
- The verb is **select** - not click, tap or press - because it works on every
  device. "Enter" for typing, "choose" for picking from a list.
- After the steps, say what the reader sees when it worked.
- A warning goes **before** the step it is about, never after.
- Above ten steps, split into `##` phases.

### Sections stand on their own

A reader often lands on a section from a search result or an AI answer without
the rest of the page. Each `##` heading names its topic, and its first sentence
restates it. "If it didn't work" and "Before you start" are fixed headings, so
readers learn where to look.

### Every how-to ends with "If it didn't work"

The two to four most likely failures, each starting with the exact error
message in `<Msg>` - or the symptom in bold - then the cause, then the fix. This is where tickets are
avoided: people search for the message they see.

### Hand-off to support

Where an article ends at "contact support", it says what to send: the
**Server ID** (on the **Advanced** tab) or the account ID and server name, the
exact error, what was tried, and whether support may log in or restart the
server. Link to `/<locale>/contact`.

## Language

- **Second person, present tense, active voice.** "You can …", "The server
  restarts", never "the user" or "one".
- **Short sentences**, about 25 words at most; paragraphs of up to four
  sentences.
- **British spelling** in English: recognise, licence (noun), cancelled.
- **No "simply", "just", "easy" or "obviously".** A reader who is stuck feels
  blamed by them.
- **Plain words first, the technical term next to it** the first time it
  matters: "reverse DNS answers which hostname belongs to an IP address. It is
  set with a PTR record."
- **Exact numbers**, never "a few" when the code says 5: limits, days, sizes,
  prices with "including VAT".
- **Honest about consequences.** If data is deleted, say "deleted
  permanently", in bold.

## Formatting

| Element                            | Format                               | Example                                       |
| ---------------------------------- | ------------------------------------ | --------------------------------------------- |
| UI labels, buttons, tabs, statuses | `<Ui>`, spelled exactly as in the UI | select <Ui>Create Backup</Ui>                 |
| Messages: errors, notices, emails  | `<Msg>`, exactly as shown            | <Msg>Could not create the backup.</Msg>       |
| Paths through the portal           | `<Ui>` with `›`                      | <Ui>Account</Ui> › <Ui>Billing</Ui>           |
| Icon-only buttons                  | named by the icon                    | the pencil icon next to <Ui>PTR Records</Ui>  |
| Emphasis, list lead-ins            | bold                                 | **deleted permanently**                       |
| Commands, files, values            | inline code or a code block          | `systemctl status ssh`                        |
| Placeholders                       | angle brackets in code               | `ssh root@<your-ip>`                          |
| Example addresses                  | documentation ranges only            | `203.0.113.10`, `2001:db8::10`, `example.com` |
| One critical caution               | `<Hint>`, at most one per article    |                                               |

`<Ui>` is drawn like a quiet button, so readers see at a glance what they will
find on screen; `<Msg>` is quoted in the language's own quotation marks. Keep
bold for emphasis, so the three never look alike. Agents get all three as
bold.

Code blocks are copy-pasteable as they are: no `$` prompts, and no comments
to tell systems apart - that is what tabs are for.

### Commands that differ per system

Put each variant in its own code block, directly after one another, with a
`tab` label and a shared `tab-group`. Fumadocs turns consecutive blocks into
tabs, and every block with the same group follows the reader's choice, on this
page and on every other one:

````mdx
```bash tab="Debian / Ubuntu" tab-group="os"
apt install qemu-guest-agent
```

```bash tab="AlmaLinux / Rocky Linux / Fedora" tab-group="os"
dnf install qemu-guest-agent
```
````

Use the same labels everywhere, or the choice is not carried over:

| `tab-group`  | Labels                                                |
| ------------ | ----------------------------------------------------- |
| `os`         | `Debian / Ubuntu`, `AlmaLinux / Rocky Linux / Fedora` |
| `client`     | `Linux / macOS`, `Windows`                            |
| `firewall`   | `ufw`, `firewalld`                                    |
| `filesystem` | `ext4`, `XFS`                                         |

Labels are names, so they are not translated. Agents get each tab as its label
followed by its code block.

### Contents of a file

A block that shows what goes into a file carries the file's path as its
`title`, which also gives it a header with a file icon:

````mdx
```text title="/etc/ssh/sshd_config"
PasswordAuthentication no
```
````

## Links

- Other help articles: `/<locale>/help/article/<slug>`, with an anchor only
  when it saves the reader real searching. Anchors are generated from the
  heading text, so they differ per language - check them after translating.
- The portal: absolute, `https://app.virtbase.com/...`, to the exact page.
- The contact page: `/<locale>/contact`; legal pages: `/<locale>/legal/<slug>`.
- Link the first mention of something that has its own article, not every
  mention.

## Glossary terms

A technical term that has an entry in the [glossary](../README.md#glossary) is
marked where it first appears in an article:

```mdx
It is set with a <Term id="ptr-record">PTR record</Term>.
```

Readers select it to see the one-sentence definition and a link to the full
entry; agents get a link. The text between the tags is whatever the sentence
needs - "PTR record", "reverse DNS" - and the `id` is the glossary file name.

- **The first mention only**, once per article, in running text: never in a
  heading, a link, `<Ui>` or `<Msg>`, or code.
- **Not instead of an explanation.** Where the term is what the article is
  about, explain it in the text as well; the glossary is for the reader who
  meets the term in passing.
- A term that is missing gets an entry in `glossary/en/` first.

## Screenshots

A screenshot is worth its maintenance only where it saves the reader searching:
a dialog with several fields, a button that is hard to find, a result to
compare against. It never carries information the text lacks - text in images
is not translated, not searchable and not read by AI assistants.

- Mark where one belongs with an MDX comment, describing what it must show:

  ```mdx
  {/* Screenshot: The "Reset Password" dialog with both fields filled in. */}
  ```

  The comment is invisible on the page but **appears in the Markdown served to
  agents**, so every placeholder is replaced by its image before publishing.

- Images live in `help/articles/<locale>/images/`, taken in that locale's UI,
  from the demo server - never real customer data. Alt text is in the
  article's language and says what the image shows: the labels as they appear
  in that locale, and the values that matter (a port, a selected mode).

- WebP at quality 82, at most 1600 px wide from a 2x capture: sharp enough for
  high-density screens, mostly under 60 KB. The site resizes them again.

## Translating

`en` is the source; `de`, `fr` and `nl` are translations of it, filed with the
same `categories`, `popular`, `authors` and `related` (a test enforces it).

- **Form of address:** German **du**, French **vous**, Dutch **je** - the same
  as the UI and the emails of that language.
- **UI labels and messages** are the exact strings of that locale: the
  `msgstr` for the English `msgid` in `apps/web/src/i18n/messages/<locale>.po`,
  and the email subjects in `packages/email/src/messages/<locale>.json`.
- **Titles, descriptions and keywords are transcreated** for what customers
  search in that language, not translated word for word.
- **The action verb is the language's usual one**, not a literal "select":
  "klicke auf" or "wähle" in German, "cliquez sur" or "sélectionnez" in French,
  "klik op" or "selecteer" in Dutch.
- **Facts are never changed in a translation.** A fact that is wrong is fixed
  in `en` first, then in every translation.
- **Typography of the language:** „…" and `5,00 €` in German; « … » and a
  space before `:` `;` `?` `!` in French; `€ 5,00` in Dutch.

## Search and AI answers

Write for the reader; this follows from it. Specifically:

- No FAQPage or HowTo structured data: Google no longer shows either as a rich
  result. The articles carry `TechArticle` data automatically.
- One topic per article and no near-duplicates. Two articles answering the same
  question compete with each other.
- Sections that make sense when quoted alone, with the facts and numbers in
  them, are what AI answers cite.

## Checklist

- [ ] One goal; the right type; no existing article covers it.
- [ ] Every label, message, limit and timing checked against the code.
- [ ] Title in the customer's words, without "Virtbase"; description is the answer.
- [ ] The first two sentences answer the question.
- [ ] "Before you start", numbered steps, the result, "Check that it worked", "If it didn't work".
- [ ] UI text in `<Ui>`, messages in `<Msg>`, bold only for emphasis; exact numbers.
- [ ] Destructive steps warned before, in bold.
- [ ] Links point at real pages and anchors.
- [ ] Every screenshot placeholder replaced before publishing.

Then verify:

```bash
bun run test --filter=@virtbase/web   # frontmatter: translations, categories, authors, related
```

and open the article - and its `.md` version - on the dev server:
`http://virtbase.localhost:3000/<locale>/help/article/<slug>`.

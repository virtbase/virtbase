# Feature videos

A German tutorial series, one episode per feature. Everything is produced from
this directory: the narration, the recording and the finished file.

Three episodes so far:

| | What it covers |
| --- | --- |
| `firewall` | the three default actions, rule order, the protocol list, the firewall inside the guest, every kind of recommendation |
| `iso` | the image catalogue, checksums, your own URL, mounting and unmounting |
| `backups` | the three backup modes, the deletion protection, creating and restoring |

An episode is as long as its feature needs. The firewall runs about four
minutes wide and a little under two portrait, because it is a walkthrough
rather than a trailer: those are things a customer has to understand once and
then never again. A feature with less to explain should be shorter, not padded
to match - the ISO episode is two and a half.

```bash
bun script video/prepare                    # build the guest the episodes are filmed on
bun script video/backups                    # record both cuts
bun script video/backups --dry              # walk the beats without recording
bun script video/backups --gpu              # hardware encode (see Encoding)
bun script video/backups --no-vertical      # wide cut only
bun script video/backups --rebuild          # throw the guest away and build a new one
bun script video/selftest                   # 15s smoke test, needs nothing running
```

`--dry` skips synthesis and the recorder, not the actions: the beats run
against the live app as fast as they will go. For the backups episode that
means a dry run really takes a backup and really restores it, which is the
point - it is the cheapest way to find out that a selector moved.

A cold run is dominated by the voice: the narrator is cloned at roughly seven
times realtime, so a first take of a four minute episode spends about half an
hour speaking before it films anything. Every line is cached, so the second
take only re-speaks what changed - and `engine: "piper"` on the `Episode` swaps
in the fast voice while the wording is still moving.

One run produces two recordings and the files built from them, named after
the episode:

| File | What it is |
| --- | --- |
| `<name>.de.mp4` | 1920x1080, the wide cut |
| `<name>.de.srt` | its narration, timecoded |
| `<name>.de.thumbnail.png` | 1280x720 cover for YouTube |
| `<name>.de.vertical.mp4` | 1080x1920 for TikTok and Reels, captions burned in |
| `<name>.de.vertical-cover.png` | the frame that cut opens on |
| `<name>-portrait.de.mp4` / `.srt` | the portrait take before its cover was attached |

## What an episode is

An episode is a list of **beats**. A beat is one German sentence and whatever
happens on screen while it is being said:

```ts
{
  say: "Eine neue Regel legst du über das Plus an.",
  act: async (stage) => {
    await stage.click(headerButton(0));
    await stage.locate(dialog).waitFor({ state: "visible" });
  },
}
```

The studio's job is making those two last the same length of time. Every line is
synthesised *before* the browser opens, so a beat knows how many seconds it has
to fill; whichever of the sentence and the action finishes first waits for the
other. Nothing is timed by hand, which is why a script can be rewritten without
re-timing the whole episode.

Beats also take `lead` (let the sentence run before anything moves) and `tail`
(hold afterwards). Those two are the whole pacing vocabulary.

## The picture

Recording is Chrome's own screencast over CDP, not Playwright's video recorder.
The screencast emits a JPEG only when something changed, each stamped with the
time it was painted, and the frames are reassembled against those stamps. A
still dialog costs one frame rather than sixty, and a two minute take does not
drift away from its narration the way frame counting does.

The page is filmed at exactly the size it is delivered - 1920x1080, one CSS
pixel per output pixel. A 2x surface downsampled to 1080p is marginally smoother
on hairlines, but it is four times the pixels for Chrome to encode on every
frame, and the screencast will not send the next frame until the last one is
done. Detail is bought back where it is needed instead: the lens scales the live
DOM, so zoomed text is re-rasterised rather than magnified.

Turning ~50 uneven captures a second into 30 even ones is done in
`render.ts:resample`, not by ffmpeg. **Do not replace it with a concat playlist
carrying a `duration` per frame.** Images are demuxed at 25 fps unless told
otherwise, and any `duration` below that 40ms period is rounded up to it, so a
20ms screencast gap silently becomes 40ms and the timeline collapses to 25 fps.
Converted to 30 that repeats every sixth frame - a hitch five times a second,
for the length of the take, which is what the first cut of the firewall episode
did. The symptom reads as "the capture is dropping frames"; it is not.

Two things are drawn that the browser would not draw itself:

- **A cursor.** A headless browser paints no pointer and Playwright's clicks
  leave no trace, so the overlay draws one and walks it to the same coordinates
  the real click will use. It cannot fall out of sync with what happened,
  because the two share one number.
- **A lens.** `stage.focusOn(target, 1.5)` scales `body` around an element.
  Deliberately not a crop applied in ffmpeg afterwards: scaling the live DOM
  makes Chrome re-rasterise text at the larger size, so a zoomed-in port number
  is genuinely sharper rather than blown up. The cursor is a child of
  `documentElement` instead of `body`, which keeps it outside that transform and
  in the same coordinate space as the mouse.

Dialogs are portalled into `body` and therefore live inside the lens, so a beat
zooms back out with `stage.wide()` before opening one.

The Next.js dev indicator is hidden by the overlay's stylesheet rather than by
`devIndicators` in `next.config.ts`, so recording never changes how the app is
served. There is no browser chrome to hide: a screencast is page content only.

## Cutting the waiting out

`stage.cut()` runs something whose duration should not appear in the finished
video - the rule generation takes fifteen to twenty seconds, and nobody should
watch a spinner for that long to learn what the feature does. The action still
runs in full; the recorder drops the frames in the middle of it and pulls every
later timestamp earlier to match, keeping a moment at each end so the spinner is
seen starting and the result lands rather than teleporting in.

**A cut may not overlap narration**, and `recordEpisode` throws rather than let
that happen: a spoken sentence cannot be shortened to match, so the audio and
the picture would drift for the rest of the take. Waits therefore live in a beat
with no `say` - which is why the AI section is several beats rather than one.

The beat before the silent one is worth its place: it says what the model is
given to work with, which is the one thing about the feature the screen cannot
show, and it says it while the request is genuinely in flight. Narration is the
cheapest way to spend a wait, and what is left after it is what gets cut.

**A cut waits on the API, not on the screen, and it says so out loud.** Both
long waits in the series were written the other way first and both went wrong
the same way: the ISO episode polled a `cmdk` option's `aria-disabled` for a
download that had already finished and sat there silently for twenty-seven
minutes, and the backups episode compared a server state against `"running"`
where the endpoint reports the mapped `"RUNNING"` - a wait that could only ever
end at its own deadline. Neither is visible from outside. What made the second
one a five-minute bug instead of another twenty-seven was the progress line:
`[backups] restoring - RUNNING`, printed next to a condition that claimed it
was not.

## The portrait cut

It is a **second recording, not a crop**. A 9:16 slice of a 16:9 dashboard is
31% of its width - one column of one table - and letterboxing the wide cut into
a tall frame gives a phone-shaped video of a desktop screenshot, which is worth
less than the space it takes up.

So the portrait take runs at a 360x640 viewport with `deviceScaleFactor: 3`,
which is exactly 1080x1920 and, more to the point, a phone. The app lays itself
out for one: cards stack, the sidebar folds away, `ResponsiveDialog` becomes a
drawer. Everything on screen is already the size a reader wants, so that cut
uses `stage.reveal()` - a smooth scroll - where the wide one uses the lens.

It is also a **shorter edit**, on purpose. Reordering rules lives off the
right-hand edge of a horizontally scrollable table on a phone, and chasing it
would demonstrate the format's limits rather than the feature. A vertical feed
wants the short version anyway.

`mobile: true` also swaps the drawn arrow for a tap ring. A mouse pointer on a
phone recording is a lie about how the thing is used.

Captions are burned in, because these feeds autoplay muted. They come from the
same narration as the `.srt` but are written as `.ass`: ffmpeg converts SRT with
a default script resolution of 384x288, so a `force_style` in real pixels is
measured against that - a 46px font becomes 306px and a 430px margin falls off a
288-tall script - which is why styling an `.srt` yields no captions at all
rather than misplaced ones. They use `BorderStyle: 3`, a filled box rather than
an outline, because unlike the old letterboxed layout they lie over the running
interface and a shadow stops being enough the moment a button passes underneath.

The cover is prepended as real video, because neither platform accepts a
thumbnail upload - both take the opening frame. It is held for a beat so it
reads as a title card, and it is built from a frame of the *portrait* take, so
the card holds a phone screen rather than a letterbox.

## Encoding

`libx264 -preset slow -crf 18` by default; `--gpu` switches to `h264_nvenc`
where one starts.

Software is the default, and since "the GPU is faster" says otherwise, the
numbers are worth keeping. Same 3113-frame take, same machine:

| | time | size |
| --- | --- | --- |
| decode only | 7.7s | — |
| decode + libx264 | 12.7s | 9.1 MB |
| decode + nvenc | 12.6s | 16.9 MB |

NVENC saves a tenth of a second and costs 86% more file. Encoding was never the
bottleneck: six of those twelve seconds go on decoding JPEGs, because the
recorder emits an image sequence rather than a video stream, and hardware
encoding does not touch that half. The quality gap is real as well - flat dark
panels, hairline borders and small text are the worst case for NVENC's bit
allocation.

Availability is probed by encoding two frames, not by listing encoders: nvenc
compiles in regardless and fails at open time on a machine with no NVIDIA card,
in a container without the device, or on a driver older than the API the build
wants. That last one is why the ffmpeg build is pinned to the 8.1 branch -
current master requires an nvenc API newer than any shipping driver, so a
"latest" build silently loses hardware encoding without saying why.

If the render ever needs to be quicker, attack the decode.

## The voice

**Qwen3-TTS cloning `assets/narrator.wav`**, on the CPU, through `speakAll`.

That reference clip is six seconds of `piper` with the German `thorsten-high`
voice, which is what the series used to be read by outright - so the narrator
did not change when the synthesiser did. It is **committed rather than
generated**, and that is the load-bearing part: piper samples, so re-running it
would produce a *nearly* identical clip, and "nearly" is how a voice drifts
between episodes.

Both engines are still here, and `speakAll` picks by `engine`:

| | `qwen` (default) | `piper` |
| --- | --- | --- |
| what it is | clones the reference | speaks the reference into being |
| a four minute episode | ~30 minutes | seconds |
| respelling rules needed | one, unused | ten |

The reason for the swap is not that it sounds nicer, though it does. Every
candidate in `videos/voice-lab` went through `whisper-small`, and the clone
reading **raw text** was transcribed more accurately than piper reading
**respelled** text: "UFW" against piper's "RFW", "ICMP" against piper's "ECMP",
and the plain-prose line exactly right where piper turned "blockiert" into
"wirkiert". Nine of the ten pronunciation rules stopped being necessary.

It costs about **7x realtime**, which is why `engine: "piper"` stays reachable
on an `Episode`: rewriting one sentence to hear how it lands should not cost
half an hour. Set it while the wording is moving, take it off before the take
that ships.

The environment is built on first use into `.cache/video/tools`, the same
bargain ffmpeg and piper already had - a 1.8 GB virtualenv and about five
gigabytes of weights that nothing outside this directory wants. Torch comes from
the CPU index deliberately; the CUDA build is 2.5 GB of kernels for a card that
cannot run flash attention anyway.

Chatterbox Multilingual was tried before either of these and removed for needing
PyTorch, 6.3GB and a GPU. Qwen needs the first two, which is the price that
turned out to be worth paying - and it still runs on any machine, because it
never needed the third.

Synthesis is cached under a hash of the line and everything that changes how it
sounds - for the clone that includes **the content of the reference clip**,
hashed rather than named, so swapping the file behind that path re-speaks the
series instead of quietly half-changing it.

### Making it sound like one voice

**Levelling applies to both engines**, and it is the one thing here that is not
a judgement call. **piper normalises each line to a peak of 0 dBFS, which is not
a level** - how loud a sentence lands depends on its single
loudest sample - so the narration wandered over a 2 LU range from sentence to
sentence. Every line is now measured with `ebur128` and given one gain to sit at
-18 LUFS, which is where the quietest line already was, so every gain is an
attenuation and nothing is ever pushed into clipping. Measured over the
firewall episode: 65 lines of 66 land at exactly -18.0, the last at -18.1.

A true-peak ceiling on top of that was tried and removed. Piper's crest factor
runs 17-20 dB, so a -1 dBTP ceiling binds before the loudness target does on a
third of the lines and puts the spread straight back - it traded 2 LU for 2.2
LU and a quieter track.

`noise_scale` and `noise_w` are **piper only**: the variance of the latent its
vocoder samples and the variance of its duration predictor, both a notch under
the model's own defaults (0.6 and 0.7 against 0.667 and 0.8) because cleaner and
steadier is what a synthetic voice reading documentation wants. The clone has no
equivalent knob - it takes its pace and its manner from the reference clip,
which is the entire point of cloning one.

### Making it say things properly

Narration is written in the German the product uses - "Eingehende Pakete",
"Verwerfen", "Empfehlungen" - so a viewer can follow it with the interface in
front of them. The informal "du" is not a style choice; it is what
`apps/web/src/i18n/messages/de.po` says. The dashboard carries no locale in its
URL, so `prepare` puts the filmed account's `users.locale` into German.

Words the voice gets wrong are respelled in `PRONUNCIATION`, applied to the text
handed to the synthesiser and to nothing else - the subtitles keep the real
spelling, because "Wörtbehs" on screen would be worse than a mispronounced
brand.

**The table is per engine**, because a respelling is advice to one particular
voice and nonsense to another: "Uh-Eff-Weh" is how piper is told to say `ufw`,
and handing it to a model that already says `ufw` correctly would only make it
say something else. `QWEN_PRONUNCIATION` is empty - the clone needed none of the
ten - with the brand the one candidate for an entry, since every synthesiser
tried, piper included, was heard as "Wordbase".

The rest of this section is about piper. It phonemises through espeak-ng, so
entries are ordinary German
orthography, checked with `espeak-ng -v de -q --ipa` rather than by ear:
`Virtbase` alone comes out `vˈɪɾtbɑːzə` - "virt-BAA-zuh", three syllables with a
schwa and a `z` in the middle - where `Wörtbehs` gives `vˈœɾtbeːs`, about as
near the English `vˈɜːtbeɪs` as German phonology reaches.

Check entries in a full sentence, not alone. `KI` looked like it needed one -
in isolation espeak reads it `kˈiː`, "kie" - but in context it already says
`kˌaːˈiː`, the two letter names, and forcing `K I` would only put a gap between
them. It is deliberately not in the table.

espeak-ng's inline `[[...]]` phoneme escape looks like the exact answer for
piper and is not: piper does not reach espeak's text translator and reads the
brackets aloud, turning a 0.94s word into 1.79s of nonsense.

## Cover art

`thumbnail.ts` lays the covers out in HTML and screenshots them in the same
browser, because a thumbnail is a typographic problem - a headline that has to
survive being shown two centimetres wide in a sidebar - and ffmpeg's `drawtext`
cannot wrap, kern or letter-space.

The design is deliberately quiet: a hairline border, a lot of black, small
precise type and one screenshot behind glass. The loud version - a 130px
headline bleeding over a full-frame screenshot - reads as a reaction video,
which is the wrong promise for a product tutorial.

The wordmark is the real asset from `public/assets/static/wordmark.png`,
inverted rather than recoloured: it ships as black artwork on transparency, and
`filter: invert(1)` keeps the letterforms exact where retyping the name in Geist
would quietly be a different logo.

## The scene

Episodes are filmed against the local Proxmox cluster, on a real guest, not
against stubbed responses - so a recording cannot show a state the product could
never produce.

`prepare` builds that guest and is safe to re-run: one that is already up is
reused and only its firewall is put back to the baseline, which is seconds
rather than the several minutes a fresh guest costs. `--rebuild` throws it away
and starts again.

The guest is deliberately imperfect, and imperfect in exactly three ways,
because those are the three findings the recommendations card can raise and an
episode about a feature that finds nothing shows nothing:

| What the guest does | What the card says |
| --- | --- |
| Redis on every address, allowed by both firewalls | `EXPOSED_SENSITIVE_PORT`, critical |
| a rule for a port its own ufw closes again | `BLOCKED_BY_GUEST_FIREWALL`, warning |
| a rule for a port nothing listens on | `ORPHAN_RULE`, info |

It also runs **ufw**, which is the only way to film the second half of the
feature: the warning, the merged rule table and the finding that exists because
two firewalls disagree all need a firewall inside the server to disagree with.
`GUEST_FIREWALL` in `scene.ts` is what keeps the three findings apart, and every
line of it is load bearing - allowing 8080 is what keeps that rule an orphan
rather than a second blocked-by-the-guest finding, and *not* allowing 9000 is
the whole of the third.

That firewall is put back to the baseline on every take, like the Proxmox rules,
and enabling it over the guest agent is safe because the agent speaks over a
virtio serial channel rather than the network.

**The scene is prepared between the two cuts, not once per run.** An episode
changes the server it is filmed on - the wide cut deletes a rule, creates
another and applies whatever the model wrote - so the portrait take used to open
on a recommendations card one finding short and narrate the removal of a rule
that was already gone. Preparing again costs seconds on a guest that is already
up.

One inspection of the guest is cached server-side for ninety seconds, so the
first page load after `prepare` changed ufw can still be answering from the
state before it. `awaitGuestFirewall` in `firewall.ts` waits that out rather
than filming a page that has not noticed yet; it costs nothing in the finished
video, because `open()` runs before the screencast starts.

Each episode resets what it is about, and only that. `prepareIsoScene` takes
back every custom image the account holds and empties the drive, because a
customer may hold three at once and a few takes without a reset would film the
limit being refused. `prepareBackupsScene` empties the backup list, rows *and*
archives, driven off the storage rather than the rows - the two can disagree in
either direction, and a row with no archive is a backup the video then fails to
restore.

**The backups episode really restores.** It is the one that leaves the scene
mid-operation: the mutation returns as soon as the workflow is queued, so the
take can end while the guest is stopped and its disk is being replaced. That
matters more than it sounds, because `ensureDemoServer` cannot tell a stopped
guest from a missing one and would answer by **building a second server**. So
`prepareBackupsScene` calls `awaitServerReady` first, before it ensures
anything, and waits on `installedAt` - the same flag the dashboard reads, and
the only one that covers the whole restore rather than a window inside it.

The session is minted by `e2e/support/bootstrap.ts` - the same one the E2E suite
uses, so there is one way in to keep working.

## Adding an episode

1. Write `<name>.ts` here: prepare a scene, then `recordEpisode({ name, open,
   beats })`.
2. Keep beats to one sentence. Two sentences in one beat means the picture has
   to hold still through both.
3. Point at things before talking about them, not after - `lead` exists for
   exactly that.
4. Check it with `--dry` before recording, every time.
5. Watch it once at full length before writing the next one. The subtitle file
   is the fastest way to re-read what it says.

Selector traps, all of them quiet - each one produces a take that records
perfectly and shows the wrong thing:

- `:text-is()` matches the **smallest** element carrying the text. `cmdk` wraps
  every option label in a div, so `[role="option"]:text-is("tcp")` matches
  nothing. Use `getByRole("option", { name, exact: true })`.
- `>> nth=` has to **end** a selector. Anything appended after it is parsed as
  part of the index, so build rows as locators and call `.nth()` on them.
  `button >> nth=0` plus a `:not([disabled])` waits on `nth(0:not([disabled]))`
  and times out sixty seconds later saying nothing useful.
- **Not every row is a row of data.** The rules table emits a group heading per
  layer once a firewall is running inside the guest, so `tbody tr` first is a
  caption rather than the first rule. Match `tr[data-layer="host"]`.
- **Not every button in a row is a control you counted.** A Radix checkbox
  renders a `<button role="checkbox">`, so the third button in a rules row is
  "nach unten bewegen" rather than the menu - and clicking it reorders the
  customer's firewall under narration about a menu. Take `.last()`, or match
  the `aria-label`.
- **A helper that clicks will undo a keyboard selection.** `stage.type` clicks
  its target before typing, so `Ctrl+A` followed by `stage.type` collapses the
  selection and appends: the field ends up reading `Backup 27.8.2026,
  21:37:46Vor dem Update`. Replacing the contents of a field means
  `keyboard.type` after the select-all, with the click already spent.
- **`asChild` overwrites `data-slot`.** Radix merges its own props *over* the
  child's, so a `Badge` wrapped in a `HoverCardTrigger asChild` announces
  itself as `data-slot="hover-card-trigger"` and the obvious selector matches
  nothing while the badge is plainly on screen. `data-testid` survives, because
  nothing else sets it.
- **Anything portalled must be opened wide.** Selects, dropdowns, tooltips and
  dialogs are `position: fixed`, and a transform on `body` makes `body` their
  containing block instead of the viewport. `wide()` first, and the same goes
  for hovering anything with a tooltip.

  That advice used to be *nearly* true and quietly wasn't: the lens left an
  identity `scale(1)` behind when it was out, which is visually nothing and
  still a containing block, so a select opened after any zoom landed 66px below
  its trigger for the rest of the take. `apply()` in `overlay.ts` now removes
  the transform once the lens is at rest, which is what makes `wide()` a real
  fix rather than a hopeful one.

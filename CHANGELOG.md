# Changelog

## 14.9.0 — 2026-11-11

Three small things, done properly.

### Added
- **Case sheet download.** One case as a self-contained HTML file with its own styling —
  open it anywhere, print it, or save it as a PDF from the print dialog. No PDF writer,
  no dependency: the browser already does that job.
- **Board → case.** A "→ case" chip saves the active board as a clinic case, keeping its
  symptoms. If the board has not synced yet it falls back to the live selection.
- **Rare-rubric quiz** (Tools): a two- or three-remedy rubric, four remedy options, and
  graded feedback that names the correct remedy and its grade in that rubric. Correct
  answers are the hard ones — rare rubrics are exactly where recall fails.

### Fixed — build
- The full single-file build inlined the repertory **twice** (6.6 MB instead of 3.8 MB):
  `str.replace('</body>')` matched the `</body>` inside the new case-sheet template as
  well as the document's own. It now splits on the last occurrence.

## 14.8.1 — 2026-11-11

The reason the last few releases looked like they never arrived.

### Fixed — the service worker pinned the old app forever
- **The cache name was never bumped.** It was `rf-v14` from v14.0.0 and stayed
  `rf-v14` through v14.1–v14.8, while the fetch handler was cache-first for
  *everything* — including `index.html`. Anyone who had visited once kept getting the
  v14.0 shell and v14.0 assets, no matter what shipped.
- The cache is now stamped with the build version at build time (`rf-14.8.1`), so every
  release installs a new cache and deletes the old one.
- **Documents are network-first** now: a deploy is visible on the next load, and the
  cache is only the offline fallback. Assets use stale-while-revalidate.
- **Auto-update**: when a new worker installs, the page shows "Update ready — reloading"
  and reloads once. `updateViaCache: 'none'` so the worker script itself is never served
  from cache.

### Verified
Served over local HTTP: cache created as `rf-14.8.0`; after editing `index.html` on the
server, a reload showed the new document immediately.

## 14.8.0 — 2026-11-11

The explorer was built for a desktop and dropped onto a phone.

### Fixed — mobile
- **Layout size.** The graph was always relaxed for 1200×800, so on a 390 px screen only
  its left edge was visible. It is now computed at the canvas's real size and refits on
  rotate or resize.
- **Toolbar.** Three wrapped rows and a 130 px legend left 628 px of a 844 px screen.
  Now: search on its own row, one control row, icon-only close/zoom/reset, legend on a
  single scrollable line — 126 px total.
- **Touch.** There were no touch handlers at all — only mouse. Pointer events now drive
  drag, pinch-zoom (1.00 → 2.25 in test), and tap-to-open with a 16–18 px hit radius.
- **Tap selection** looked up a hover code that touch never sets; the node is now found
  from the pointer position.
- **Labels.** Clamped inside the canvas (none clipped), haloed on small screens so they
  stay readable over nodes, and placed in four candidate positions. 48 labels on a phone,
  95 on desktop, 0 clipped, 0 label-label overlaps.
- `touch-action: none` on the canvas so dragging does not scroll the page, and safe-area
  padding for notched phones.

### Also
- Keyboard: arrows pan, +/- zoom when the canvas has focus.
- `setPointerCapture` is guarded — a synthetic or cancelled pointer no longer aborts the
  handler.

## 14.7.0 — 2026-11-11

The explorer was a hairball, and thermals were missing entirely.

### Fixed — remedy explorer
- **Layout.** Replaced the radial family rings, which piled 297 labels on top of each
  other, with a force-directed layout: repulsion, relationship springs, centre gravity,
  then fitted to the viewport.
- **Labels.** Drawn greedily by relationship count and skipped when they would collide —
  measured overlap is now **zero**. Density scales with zoom: 110 labels at 1×, 214 at
  2.2×.
- **Zoom and pan.** The old viewBox maths mixed screen pixels with viewBox units; it is
  now a single `<g transform>`, so panning tracks the cursor at any zoom.
- **Legend** for kingdom colours and relationship line types, plus a live count of what
  is on screen.
- **Hover** isolates a remedy and its neighbours; click opens the monograph.
- **Filters**: kingdom and thermal, plus search, all without moving the layout.

### Added — thermals
- **Thermal tendency** per remedy: chilly, hot or mixed, derived from the thermal
  *modality* rubrics — cold agg, warm agg, warm room/bed/stove agg, warm amel, cold
  bathing amel — with the contributing rubrics and grades shown under the chip.
- Shown on the monograph and filterable in the explorer. 135 of 297 remedies carry
  evidence; the other 162 say nothing rather than guessing.
- Spot checks match the classics: Nux-v, Calc, Ars, Sil, Hep, Rhus-t, Lyc, Ign, Cham,
  Bell, Acon chilly; Puls, Nat-m, Merc hot.

### Notes
- This is a derived classification from modalities, labelled as such in the app. It is
  not a constitutional thermal table, and it does not claim to be.

## 14.6.0 — 2026-11-11

Saying plainly what is in the app, and what is not.

### Added
- **Sources & provenance screen** (About → Sources & provenance): live counts of remedies,
  symptoms, graded links and rubrics; quotations counted per source; the licence for each
  layer of data; and an explicit list of limits — no diagnosis, no Kent 1897 grades, no
  single-remedy rubrics, Boericke extraction incomplete, nothing sent anywhere.
- **About panel rewritten** for the current app: live numbers instead of a hardcoded
  "v12 Verified", no emoji, and a link straight to provenance.

### Fixed
- The graded-link count was quoted as 44,704 in the README, page metadata and landing
  page. Counted from the data it is **44,710**; all copy now says so.

## 14.5.0 — 2026-11-11

The sharp end of the repertory, one tap away.

### Added
- **Rare-only filter** in Repertory mode: keeps rubrics carried by three remedies or
  fewer. Searching *fever* returns 150 rubrics, 23 of them with three remedies or fewer
  — the ones that actually discriminate. The choice persists.
- Counts next to the toggle say what is being shown.

### Measured
With 39,737 rubrics the repertory loads in 0.7 s, the index builds in 323 ms, and a
search runs in 1–4 ms. No caching needed.

## 14.4.0 — 2026-11-11

The repertory was thinner than it needed to be.

### Changed
- **Rubric coverage: 31,667 → 39,737** (+25.5%). The old index kept only rubrics
  carrying at least three of the app's remedies; the source data supports two. A rubric
  with two remedies discriminates *better* than one with twenty, so the filter was
  excluding the sharpest material: 9,353 of the added rubrics are two-remedy rubrics.
- Repertory file 2.1 MB → 2.75 MB; full single-file build 3.1 MB → 3.7 MB.

### Fixed while rebuilding
- Link encoding is `index × 3 + (grade − 1)` in base 36, not `× 4`. Encoding at ×4
  decoded to the wrong remedy at the wrong grade — every rubric would have been subtly
  wrong, and only a spot check against a known rubric (Acon and Ars at grade 3 for
  *fear of death*) caught it.
- Rubric paths use ` › ` as the separator, matching what the app already rendered.

## 14.3.0 — 2026-11-11

Working without a mouse, and changing a passphrase without losing the vault.

### Added
- **Keyboard picking.** Arrow up/down move through picker rows, Home/End jump to the
  ends, Space or Enter toggles. Focus stays on the row you just changed — before this,
  every toggle re-rendered the list and dropped focus back to the top.
- **A live region** announces "n symptoms selected" for screen readers.
- A visible focus ring on picker rows.
- **Passphrase rotation.** Change the vault passphrase in place: rows are decrypted with
  the old key, a new salt and key are derived, everything is re-encrypted, and a new
  recovery key is issued. The old passphrase and old recovery key stop working.

### Verified
Rotation tested end to end: encrypt → rotate → reload boots locked → old passphrase
refused → new passphrase opens → record intact and still ciphertext on disk.

## 14.2.0 — 2026-11-11

Rechecking a follow-up, without reading two screens and remembering.

### Added
- **Case comparison.** From a case: *Compare with…*, pick another case, and see symptoms
  in both, added since, no longer present, and a movement table for the top twelve
  remedies — rank in each, and ↑/↓/new/dropped out.
- The panel says plainly that movement reflects the symptoms recorded, not improvement.

### Fixed
- `this.esc` was used by the new panel but never existed on `U`; the module's escape
  helper is now exposed as `U.esc` for any method that needs it.

## 14.1.0 — 2026-11-11

The sheet you hand over or file.

### Added
- **Printable case sheet.** From a saved case: patient header, complaint, notes, the
  symptoms entered (with chapter, remedy count and the rare flag), the top ten remedies
  with score and matched count, and a quotation for the top three with its source.
  The footer carries the app version, the repertory data edition and the disclaimer.
- Print styling that hides the app shell, uses A4 margins and keeps the sheet to a page.

### Fixed
- Symptom fields were read as `s.t` / `s.ch`, which do not exist — the sheet printed
  `[object Map]` and `Chapters: undefined`. They are `name` and `cat`, and the remedy
  frequency is a Map, not a number.
- Ranking rows use `matchScore` / `matchCount`, not `score` / `hits`.

## 14.0.1 — 2026-11-11

Copy that had drifted from the data.

### Fixed
- The "How to read this" note, the page description and the landing page still said
  **178 remedies / 30,412 links** from the original 178-remedy build. The dataset is
  297 remedies and 44,704 graded links, and the copy now says so.
- The repertory note said 30,343 rubrics; it is 31,667.
- The landing page's verification row now reads "265 of 297 remedies quoted" — the
  number actually in the data — instead of "170 / 178".

### Changed
- The version test now checks the shape of the version string instead of a hardcoded
  prefix, so a version bump cannot fail the suite for the wrong reason.

## 14.0.0 — 2026-11-11

Offline work complete. This release fixes two things that would have quietly broken it
and adds the last piece of the reminder story.

### Fixed
- **The service worker cached only eight files.** `offline.js`, `packs.js`, `vault.js`,
  `qr.js` and `i18n.js` were missing from the install list, so a cold offline start
  could serve a shell without the very code that makes the app work offline. The cache
  now lists all thirteen and is bumped to `rf-v14`.
- **No `settings` object store.** Two features had been writing to a store that did not
  exist — the remembered backup folder handle and the backup metadata — and failing
  silently inside `try/catch`. IndexedDB is now schema v4 with `settings`.

### Added
- **Background backup reminder.** A `periodicsync` handler wakes the service worker,
  reads the last backup time from IndexedDB (workers cannot see localStorage), and shows
  a notification with the age of the last backup. Off by default; needs notification
  permission and a browser with periodic background sync.
- A one-off "Run" button to trigger the same check through `sync`.
- The app listens for the worker's message and re-shows the in-app banner.

### Verified
Service worker install, activate, cache contents (13 assets) and the worker's read path
were exercised over a local HTTP server in headless Chrome; the full test suite passes on
both builds (100 lean, 105 full).

## 13.16.0 — 2026-11-11

Receiving a case, without typing anything.

### Added
- **Camera scanning.** The transfer panel can read a QR with the device camera
  (`BarcodeDetector` + `getUserMedia`), fill the code field and go straight to the PIN.
  The stream is stopped as soon as a code is read, and again when the panel closes.
- Graceful absence: where the browser cannot scan, the button is disabled and the paste
  field remains the way in.

### Fixed
- `video.play()` was awaited before starting detection; with a slow or blocked camera
  that promise never settles and the scanner silently never started.

## 13.15.0 — 2026-11-11

The last offline gap: get a case across without typing 476 characters.

### Added
- **QR codes for transfer codes.** A ~250-line QR encoder written into the app — byte
  mode, ECC level L, versions 1–15, Reed–Solomon, penalty-scored mask selection. Any
  phone camera reads it; paste the text into the receiving device.
- Codes too long for a QR (batch transfers) say so and fall back to Copy / Save as file.

### Verified against an external decoder
Every matrix was decoded with OpenCV's `QRCodeDetector`, not eyeballed:

| Payload | Version | Decodes |
|---|---|---|
| `hello` | 1 | yes |
| 54 chars | 4 | yes |
| 104 chars | 5 | yes |
| 204 chars | 9 | yes |
| 304 chars | 11 | yes |
| 404 chars | 13 | yes |
| 504 chars | 15 | yes |
| All eight masks, v1 | — | 8/8 |
| Live canvas, 476-char transfer code | 15 | yes |

Three real bugs were found this way: masking was applied over function patterns, the
format BCH used the wrong generator taps, and the second copy of the format bits was
written in reverse order. None of them would have been visible by looking at the image.

## 13.14.0 — 2026-11-11

Transfer in batches, and a reminder you set yourself.

### Added
- **Batch transfer.** Tick several cases and one code carries them all — 2 cases is
  about 730 characters, still pasteable. Receiving handles one or many in the same path.
- **Save a code as a file** (`.rfc.txt`) for sending through any messenger, if pasting a
  700-character string is not convenient.
- **Reminder interval.** 3 / 7 / 30 days, or off. The banner also re-checks when you
  return to the tab, not only at startup.

## 13.13.0 — 2026-11-11

Moving one case between your own devices, without a server.

### Added
- **Transfer codes.** Pick a case, choose a PIN, and get a ~480-character code
  (`RF1.<salt>.<iv>.<ciphertext>`, AES‑256‑GCM, PBKDF2 60,000 rounds). Paste it on the
  other device, enter the PIN, preview, and the case is saved there with its original
  data edition recorded. Wrong PIN fails closed.
- Transfer panel lists recent cases, with copy and paste fields sized for a phone.

### Notes
- A 4-character PIN protects a code that is meant to be handed over in person. The code
  itself is worthless without the PIN, but do not send both through the same channel.

## 13.12.0 — 2026-11-11

Frequent small backups instead of occasional large ones.

### Added
- **Delta backup.** After one full backup, "Backup changes only" hashes every record
  (SHA-256, truncated) and writes a file containing just the rows that changed plus a
  list of deletions. Same encryption, same verification, a fraction of the size.
- **Delta restore.** The preview says *delta — changes only* and how many deletions it
  carries; merging is by record ID, and deletions are applied only if you confirm.
- Backup history marks delta entries.

### Notes
- Hashing 500 records takes well under a second; the hash map lives in localStorage
  (id → 16 hex chars) and is replaced after each backup.

## 13.11.0 — 2026-11-11

The small things that make an offline vault usable day to day.

### Added
- **Auto-lock.** With a vault enabled the app locks itself after 1, 5 or 15 minutes
  idle (or never). Any pointer, key, wheel or touch resets the timer; unlocking
  restarts it.
- **Pack checksums.** Exported packs carry a SHA-256 of their remedies; importing a
  file whose checksum does not match is refused with "the file was modified".
- **Backup delta.** The offline panel now reports how many records are newer than the
  last backup, so "3 since backup" is visible without opening anything.

### Fixed
- Lock screen could be re-rendered while a passphrase was being typed, clearing the
  input; the screen is now idempotent and the typed value is buffered until unlock.
- Enter key and the recovery-key button now share one unlock path instead of two
  that could disagree.

## 13.10.0 — 2026-11-11

Encryption at rest. The last piece of the offline story: a stolen device should not be
a data breach.

### Added
- **Vault.** Optional passphrase; clinic cases, saved repertorisations and packs are
  written to IndexedDB as AES‑256‑GCM ciphertext, with the key derived by PBKDF2
  (150,000 rounds) and held in memory only.
- **Transparent layer.** Encryption happens inside `H.IDB.put/get/all`, so every existing
  feature — cases, packs, backups, exports — keeps working unchanged, and legacy plain
  rows are still readable during the switch.
- **Lock screen.** When a vault exists the app boots locked; nothing renders until the
  passphrase (or recovery key) is entered. A wrong passphrase is rejected by the canary.
- **Recovery key.** The raw 256‑bit key, shown once at setup as 52 base32 characters,
  copyable or saved to a text file. It unlocks the vault if the passphrase is lost.
- **Turn off.** Entering the passphrase decrypts every record back to plain JSON and
  removes the vault.

## 13.9.0 — 2026-11-11

Extensibility without a server.

### Added
- **Data packs.** A pack is one JSON file (`{format:"rf-pack", v:1, remedies:{CODE:[…]}}`).
  Import adds remedies, re-scores them and rebuilds the indexes; export dumps the current
  data as a pack. Packs are validated against this app's symptom IDs, so a pack can add
  remedies but never invent symptoms. Stored in IndexedDB and re-applied on load; clearing
  the list removes them on next reload.
- **Rubrics in text search.** The Text mode now returns repertory rubrics alongside
  materia medica passages, selectable straight into the case.
- IndexedDB schema v3 with a `packs` store.

### Fixed
- Remedy search cache was not invalidated after adding a pack, so a newly added remedy
  was invisible to search until reload.

## 13.8.0 — 2026-11-11

Two offline additions: reading the books without a book, and a record of your backups.

### Added
- **Text search mode.** A third picker mode searches the materia medica text itself —
  descriptions, both quoted sources and clinical uses across 297 monographs — matching
  all words in any field, scoring source matches higher, and showing a highlighted
  snippet with one click to the monograph. 898 searchable fields, built in memory in
  under 20 ms.
- **Backup history.** The offline panel lists the last ten backups with date, total
  record count and file size.
- Hero statistics on the start panel now read from the live database instead of being
  hard-coded.

## 13.7.0 — 2026-11-11

Offline durability, part two: make the backup trustworthy rather than merely present.

### Added
- **Backup verification.** After encrypting, the file is decrypted again in memory and
  the record counts compared before the app says "saved". A backup that cannot be read
  back is never reported as successful.
- **Write to a folder you choose.** File System Access API with a remembered handle —
  one click re-saves to the same file. Falls back to a download where unsupported;
  cancelling writes nothing.
- **Restore preview.** Before anything is written: exported date, data edition, app
  version and record counts, with an explicit "records are merged, nothing is deleted".
- **Backup reminder.** Dismissible banner when records exist and the last backup is
  older than seven days; "Later" snoozes for three days.
- **Connection chip** in the top bar: `offline-ready`, `offline` or `local file`.

## 13.6.0 — 2026-11-11

Offline durability. If the device is the only copy, the device needs a backup path.

### Added
- **Encrypted backup.** One `.rfb.json` file: AES‑256‑GCM, key derived with PBKDF2
  (150,000 rounds, SHA‑256, 16‑byte salt, 12‑byte IV). Covers clinic cases, saved
  repertorisations, study cards and streak, boards, language, theme and case name.
  Wrong passphrase fails closed; nothing is written.
- **Restore from file.** Merges by record ID into IndexedDB, restores SRS and settings,
  then re-opens the readiness panel with the restored counts.
- **Plain JSON export** for interoperability, explicitly labelled unencrypted.
- **Download everything for offline.** Pre-caches the shell and `repertory.js` so the
  full repertory works with the network off.
- **Offline readiness panel** (Tools → Offline & backup): service-worker state, cached
  file count and bytes, repertory availability, record counts, last backup age.
- **Data-edition stamp** on every saved case (`rp2008-297r-44710l`).

### Notes
- Verified end to end: backup → wipe all stores → restore → 1 case, 1 repertorisation
  and 4 study cards returned; a wrong passphrase was rejected by AES‑GCM.
- Single-file builds report "service worker not used in this build" instead of a warning;
  the pre-cache button is disabled there because there is nothing to cache.

## 13.5.0 — 2026-11-11

Breadth and maintenance — the three things that make it a reference tool rather than
a good teaching tool.

### Added
- **119 more remedies.** 178 → **297**, each carrying at least 25 repertory-linked
  symptoms: Carboneum animalis, Antimonium crudum, Kalium arsenicosum, Nux moschata,
  Kalium sulphuricum, Natrium phosphoricum, Arsenicum iodatum, Chininum arsenicosum,
  Bufo, Mercurius corrosivus, Argentum, Valeriana, Senega, Squilla, Oleander, Hydrastis,
  Selenium, Crocus, Lilium tigrinum, Oxalicum acidum and the rest of the repertory's
  most-referenced remedies the app was missing.
- **Two sources side by side.** Every monograph now quotes up to two *different* books —
  Boericke 1906, Allen 1916, Nash 1899, Clarke 1900 or Guernsey 1886 — each labelled
  with its author and year. 188 remedies have two, 78 have one.
- **CI that fails on drift.** `verify.yml` syntax-checks every asset, rebuilds the single
  files, fails if `dist/` differs from `site/`, and asserts the data still parses with no
  broken symptom references.

### Changed
- 44,704 symptom links (was 30,412); repertory now 31,667 rubrics against 297 remedies.
- Lean build 586 KB → 850 KB; full build 2.5 MB → 3.0 MB.

## 13.4.0 — 2026-11-11

The last item on the backlog: the repertory itself.

### Added
- **Repertory picker mode.** A second mode beside *Symptoms*: search **30,343 rubrics**
  from Repertorium Publicum by words and select rubrics directly. Every rubric carries
  at least three of the app's 178 remedies, with the printed grade kept.
- **Mixed repertorisation.** Selected rubrics and curated symptoms add into one ranking,
  so a case can combine a searched rubric (*Mind › fear › death*) with the curated
  symptom vocabulary.
- **Rubric scoring.** chapter weight × rarity `1 + 0.5·log₂(178/n)` × grade
  `1 + (g−1)·0.5`, with a grade-sum tie-break so equal scores order sensibly.
- **Two builds.** `remedy-finder.html` stays at 586 KB; `remedy-finder-full.html`
  (2.5 MB) inlines the repertory. The web app loads `assets/repertory.js` (1.9 MB) only
  when the mode is opened, and says so plainly when the data is absent.

### Fixed
- Rubric link encoding: two-hex-digit packing overflowed past 255 and silently
  corrupted every remedy index above 85. Switched to base-36 pairs; the parse is now
  verified by a test that asserts Acon and Arsenicum both grade 3 in *Mind › fear › death*.
- Empty matched-symptom strip rendering a blank bar on rubric-only results.

## 13.3.0 — 2026-11-11

### Added
- **Boards.** Several named rubric sets inside one case — acute, constitutional, family
  history — each with its own symptoms and weights. Switch with a chip above the search
  box; the selection and weights are remembered per board and persisted locally.
- **Compare boards.** A table of the top 12 remedies per board with rank and score,
  sorted by how many boards a remedy appears in; remedies present in every board are
  shaded — the ones that keep returning across pictures.
- **Interface in हिंदी and ગુજરાતી.** Rail, tabs, search, chapters, packs, tray, results,
  buttons, weights and tool sheet. Repertory terms (symptom and remedy names) stay in
  English by design. Language is remembered; a switch sits at the top of the Tools sheet.

### Changed
- Data unchanged at 178 remedies / 634 symptoms / 30,412 links; single file 575 KB
  (the string table is 10 KB).

## 13.2.0 — 2026-11-11

Four more from the backlog, still zero dependencies.

### Added
- **Symptom weight.** Each selected symptom carries a weight: ordinary (·), strong (+)
  or doubtful (−), cycled from the chip in the tray. Weights feed the score in both the
  Web Worker and the main-thread fallback (verified identical), are shown in the results
  header, and are saved with the case.
- **Eliminative repertorisation.** Strike remedies out as the case narrows. A struck
  strip above the results lists them and restores any of them; when everything is struck
  the app says so instead of showing an empty list.
- **Undo.** Removing a symptom, deleting a case or deleting a saved repertorisation now
  offers an Undo in the toast for seven seconds.
- **Full-text search.** The remedy index now includes each remedy's description and
  quoted materia medica text, so a word from the source finds the remedy.
- **Case timeline.** Follow-ups render as a timeline with relative dates ("12 days ago").

### Fixed
- Worker scoring diverged from the main thread after the weight change: the worker's
  `W` parameter shadowed its chapter-weight table, so every category scored as 1.
  Caught by comparing both scorers on the same input (46.1 → 38.0 with weights, in both).

## 13.1.0 — 2026-11-11

Four enhancements from the backlog, no new dependencies.

### Added
- **Rubric provenance.** 567 symptoms now carry the repertory rubric they were mapped
  from (`Mind > fear > death`, `Chill > warmth > amel.`). It appears as a tooltip on
  every symptom row and as a "Repertory rubric behind each keynote" section in every
  monograph, with the number of rubrics matched.
- **Pin & watch.** Pin up to three remedies; a strip above the results keeps their live
  rank, score and matched count while you change symptoms.
- **Remedy search.** The search box now also matches remedy names, Latin names,
  clinical uses and families; a "Remedies" group appears above the symptom chapters.
- **Print a single monograph.** A Print button in the remedy sheet prints just that
  remedy — description, quoted source text, rubrics, keynotes, mentals, generals,
  modalities — without the app chrome.

### Changed
- Data file grows 517 KB → 550 KB (the rubric map).

## 13.0.0 — 2026-11-11

Interface rebuilt as a workbench; every function verified in headless Chromium.

### Added
- Desktop two-pane layout: symptom picker and ranked results visible at once.
- Mobile tab bar (Find · Results · Cases · Study · More), bottom-sheet modals, 48 px primary action.
- Tools sheet consolidating explorer, matrix, compare, saved cases, study, audit, shortcuts, about.
- Remedy count beside every symptom, so rare (discriminating) symptoms are visible before selection.
- Grade-3 and matched counts on every result card; ★ marks characteristic links.
- Case name field in the header, persisted per device.
- SVG icon set (rail, tabs, actions) — no emoji dependency in the shell.
- Service worker, manifest, installable PWA; `dist/remedy-finder.html` single-file build.
- `build.py`, packaging docs, CI for Pages and a portable Windows launcher.

### Fixed
- Templates crashed when applied with no case form open.
- Relationship graph rendered empty (comp/antid/follows mapping).
- Audit panel compared only ~1% of remedy pairs.
- 20 duplicate symptom names and 4 duplicate remedy entries merged.
- Source dates corrected (Boericke 1906, Kent 1904, Allen 1916); Phatak and Tyler credits removed.
- Mobile grid blowout (min-width), tray overlapping the tab bar, pack label collisions.

### Data
- 717 → 634 symptoms, 0 dead ends (302 symptoms previously matched no remedy).
- 152 → 178 remedies; 30 added from the repertory's most-referenced remedies.
- 7,000 ungraded links → 30,412 graded links.
- 132 verbatim materia medica quotations; 170/178 remedies with verified source attributions.

## 12.0.0 — 2026-11-11

- Data rebuilt from `homoeopathic-materia-medica-repertory-json`; audit report delivered separately.

## 11.0.0 — earlier

- Clinic cases, SRS, matrix, graph, exports, PWA shell.

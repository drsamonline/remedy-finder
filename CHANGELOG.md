# Changelog

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

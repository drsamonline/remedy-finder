# Changelog

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

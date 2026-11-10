# Contributing

Corrections to **data** are more valuable than new features. A wrong remedy in a
rubric is a clinical error; a missing button is an inconvenience.

## Reporting a data problem

Open an issue with:

1. The symptom as the app lists it (chapter + name).
2. The remedy you believe is missing or wrongly present.
3. The source: book, rubric path, and grade if you have it.

If the fix belongs to the underlying repertory or materia medica extraction, report
it in [homoeopathic-materia-medica-repertory-json](https://github.com/drsamonline/homoeopathic-materia-medica-repertory-json) instead — this repo only maps that data onto its own symptom vocabulary.

## Working on the code

No build step is needed for development: open `site/index.html` in a browser.

```
site/index.html        shell
site/assets/app.css    design tokens + components
site/assets/data.js    window.HRF_DATA (generated — do not hand-edit)
site/assets/app.js     data layer, scoring, storage, cases, SRS, exports
site/assets/ui.js      picker, tray, results, view switching
python3 build.py       regenerates dist/remedy-finder.html
```

Guidelines:

- Keep it dependency-free. No frameworks, no bundlers, no web fonts.
- Keep it offline. Nothing may fetch at runtime.
- Every interactive control needs a keyboard path and a 44 px hit target.
- If you add a data claim, cite the book and year next to it.

## Before opening a pull request

- `node --check site/assets/app.js && node --check site/assets/ui.js`
- Rebuild the single file: `python3 build.py`
- Click through: select → repertorise → detail → export, on a 390 px viewport and a 1440 px one.
- Run the audit panel (Tools → Data audit) and confirm you did not add new issues.

## Licence of contributions

By contributing you agree your work is licensed under PolyForm Noncommercial 1.0.0.

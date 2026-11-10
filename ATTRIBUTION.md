# Attribution and licensing of third-party data

This app is a thin interface over other people's scholarship. That scholarship is
listed here, with its licence, and it is not covered by this repository's
PolyForm Noncommercial licence.

## 1. Repertory — the graded links

**Repertorium Publicum** (2008) by Vladimir Polony.
Kent-derived open repertory published as part of the OpenRep source code
(<https://github.com/nondeterministic/oorep>, repertory token `publicum`).

- 74,480 rubrics · 735,460 remedy links · 669 remedies · 41 chapters
- Grades: 1 → 465,287 links · 2 → 198,591 · 3 → 71,582
- **Licence: GNU GPL v3** — not public domain. Redistribution of this data must
  comply with GPL v3. If you fork this app and redistribute it, keep this file and
  the GPL notice intact.

This app uses *only* the rubric → remedy → grade structure, mapped onto its own
634-symptom vocabulary.

## 2. Repertories used for verification (not redistributed here)

Kent 1897, Knerr 1896, Lippe 1879, Boenninghausen 1891, Hering 1889 and others
from the same dataset repository. Public domain (pre-1929), CC0 in the dataset.

## 3. Materia medica quotations

Verbatim passages, quoted with book and year in the app:

| Code | Book | Author | Year | Status |
|---|---|---|---|---|
| B | Pocket Manual of Homoeopathic Materia Medica | William Boericke | 1906 | Public domain |
| A | Keynotes and Characteristics with Comparisons | H. C. Allen | 1916 | Public domain |
| K | Lectures on Homoeopathic Materia Medica | James Tyler Kent | 1904 | Public domain |
| C | A Dictionary of Practical Materia Medica | John Henry Clarke | 1900 | Public domain |
| N | Leaders in Homoeopathic Therapeutics | E. B. Nash | 1899 | Public domain |
| G | Key-notes to the Materia Medica | Henry N. Guernsey | 1886 | Public domain |
| F | The Eclectic Materia Medica | Harvey Wickes Felter | 1922 | Public domain |
| L | A Text Book of Materia Medica | Adolph von Lippe | 1866 | Public domain |
| Cw | A Text-Book of Materia Medica | A. C. Cowperthwaite | 1885 | Public domain |
| Be | Homoeopathic Therapeutics | James B. Bell | 1906 | Public domain |
| H | Materia Medica and Special Therapeutics of the New Remedies | Edwin M. Hale | 1897 | Public domain |

**Deliberately excluded.** Earlier builds of this app credited *Phatak, Materia Medica
of Homoeopathic Medicines* (1958) and *Tyler, Pointers to the Common Remedies* (1936).
Neither is public domain, no text from either is used, and both credits were removed.

## 4. Dataset

All of the above were read from
[`drsamonline/homoeopathic-materia-medica-repertory-json`](https://github.com/drsamonline/homoeopathic-materia-medica-repertory-json)
— 72 books, 357,762 rubrics, 1,435,488 remedy links, each with a QC report.

## 5. Software

- Application code and interface: **PolyForm Noncommercial 1.0.0** (see LICENSE), © 2026 Dr Sohil Momin.
- No third-party JavaScript libraries, fonts, or images are bundled.

## 6. How to cite this app

> Momin S. *Remedy Finder: an offline homeopathic repertory workbench* (v13).
> 2026. https://github.com/drsamonline/remedy-finder

# Privacy

**Nothing leaves your device.**

- No analytics, no telemetry, no crash reporting, no third-party scripts, no fonts from a CDN.
- No account, no sign-in, no email collection.
- The app makes **zero network requests** at runtime. The only network activity is your browser fetching the page and its four assets the first time (cached afterwards by the service worker).
- Case data, saved repertorisations, SRS cards, theme and preferences are stored locally: IndexedDB for records, `localStorage` for settings. Clearing site data removes them permanently.
- Exports (Markdown, CSV, JSON, Anki) are generated in the browser and saved by you. They are never uploaded.

If you install the PWA, your operating system stores it like any other app. Uninstalling removes it.

Questions: sohilmomin2000@gmail.com

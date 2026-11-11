#!/usr/bin/env python3
"""Inline the modular app into one portable HTML file (dist/remedy-finder.html)."""
import re, os, pathlib
root = pathlib.Path(__file__).parent
site = root / 'site'
html = (site / 'index.html').read_text(encoding='utf-8')
css = (site / 'assets/app.css').read_text(encoding='utf-8')
data = (site / 'assets/data.js').read_text(encoding='utf-8')
app = (site / 'assets/app.js').read_text(encoding='utf-8')
ui = (site / 'assets/ui.js').read_text(encoding='utf-8')
i18n = (site / 'assets/i18n.js').read_text(encoding='utf-8')
offl = (site / 'assets/offline.js').read_text(encoding='utf-8')
packs = (site / 'assets/packs.js').read_text(encoding='utf-8')
vault = (site / 'assets/vault.js').read_text(encoding='utf-8')
icon = (site / 'assets/icon.svg').read_text(encoding='utf-8')

html = html.replace('<link rel="stylesheet" href="assets/app.css"/>', '<style>\n' + css + '\n</style>')
html = html.replace('<link rel="manifest" href="manifest.webmanifest"/>', '')
html = html.replace('<link rel="icon" href="assets/icon.svg" type="image/svg+xml"/>',
                    '<link rel="icon" href="data:image/svg+xml;base64,' +
                    __import__('base64').b64encode(icon.encode()).decode() + '"/>')
html = html.replace('<script src="assets/i18n.js"></script>', '<script>\n' + i18n + '\n</script>')
html = html.replace('<script src="assets/data.js"></script>', '<script>\n' + data + '\n</script>')
html = html.replace('<script src="assets/app.js"></script>', '<script>\n' + app + '\n</script>')
html = html.replace('<script src="assets/ui.js"></script>', '<script>\n' + ui + '\n</script>')
html = html.replace('<script src="assets/offline.js"></script>', '<script>\n' + offl + '\n</script>')
html = html.replace('<script src="assets/packs.js"></script>', '<script>\n' + packs + '\n</script>')
html = html.replace('<script src="assets/vault.js"></script>', '<script>\n' + vault + '\n</script>')
# no service worker in the single-file build
html = re.sub(r"<script>\s*if \('serviceWorker' in navigator.*?</script>", '', html, flags=re.S)
html = html.replace('<title>Remedy Finder — Homeopathic Repertory Workbench</title>',
                    '<title>Remedy Finder — offline repertory workbench</title>')
out = root / 'dist'; out.mkdir(exist_ok=True)
(out / 'remedy-finder.html').write_text(html, encoding='utf-8')
print('dist/remedy-finder.html', round(len(html.encode())/1024, 1), 'KB')

# full build: same app with the 3,000-rubric repertory inlined
rub = site / 'assets/repertory.js'
if rub.exists():
    full = html.replace('</body>', '<script>\n' + rub.read_text(encoding='utf-8') + '\n</script>\n</body>')
    (out / 'remedy-finder-full.html').write_text(full, encoding='utf-8')
    print('dist/remedy-finder-full.html', round(len(full.encode())/1024, 1), 'KB')

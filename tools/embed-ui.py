"""Embed the small publication UI sources, keeping index.html standalone."""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
page = root / 'index.html'
html = page.read_text(encoding='utf-8')
for name, tag, location in [('css', 'style', '</head>'), ('js', 'script', '</body>')]:
    content = (root / 'src' / ('ui.' + name)).read_text(encoding='utf-8')
    block = f'<{tag} id="release-ui-{name}">\n{content}\n</{tag}>'
    pattern = rf'<{tag} id="release-ui-{name}">.*?</{tag}>'
    if re.search(pattern, html, re.S):
        html = re.sub(pattern, lambda m: block, html, flags=re.S)
    else:
        html = html.replace(location, block + '\n' + location, 1)
page.write_text(html, encoding='utf-8')
print('Embedded publication UI into standalone index.html')

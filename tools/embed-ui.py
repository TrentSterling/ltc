"""Embed the small publication UI sources, keeping index.html standalone."""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
page = root / 'index.html'
html = page.read_text(encoding='utf-8')
for name in ['shaders', 'lab']:
    content = (root / 'src' / (name + '.js')).read_text(encoding='utf-8')
    if name == 'lab' and (root / 'src' / 'v5.js').exists():
        extension = '\n'.join((root / 'src' / file).read_text(encoding='utf-8') for file in ['v5.js', 'v5-paint.js', 'v5-emission.js', 'v5-ui.js', 'v5-session.js'])
        content = content.replace('/* V5_EXTENSION */', extension)
    pattern = rf'<script id="ltc-{name}">.*?</script>'
    html, count = re.subn(pattern, lambda m: f'<script id="ltc-{name}">\n{content}\n</script>', html, flags=re.S)
    assert count == 1, f'Missing embedded {name}'
for name, tag, location in [('css', 'style', '</head>'), ('js', 'script', '</body>')]:
    content = (root / 'src' / ('ui.' + name)).read_text(encoding='utf-8')
    if name == 'css':
        content += '\n' + (root / 'src' / 'v5.css').read_text(encoding='utf-8')
        thumbs = root / 'src' / 'v5-thumbnails.css'
        if thumbs.exists():
            content += '\n' + thumbs.read_text(encoding='utf-8')
    block = f'<{tag} id="release-ui-{name}">\n{content}\n</{tag}>'
    pattern = rf'<{tag} id="release-ui-{name}">.*?</{tag}>'
    if re.search(pattern, html, re.S):
        html = re.sub(pattern, lambda m: block, html, flags=re.S)
    else:
        html = html.replace(location, block + '\n' + location, 1)
page.write_text(html, encoding='utf-8')
print('Embedded publication UI into standalone index.html')

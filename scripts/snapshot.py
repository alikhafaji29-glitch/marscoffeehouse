"""Bundle the built site (dist/) into ONE self-contained HTML file for the phone-testing artifact.

Run `npm run build` first, then `python scripts/snapshot.py [out.html]`.
Images become data URIs. Publish the output as the Claude artifact listed in HANDOFF.md.
"""
import base64, glob, io, os, re, sys

dist = 'dist'
html = io.open(f'{dist}/index.html', encoding='utf-8').read()
js_file = re.search(r'src="/assets/(index-[^"]+\.js)"', html).group(1)
css_file = re.search(r'href="/assets/(index-[^"]+\.css)"', html).group(1)
js = io.open(f'{dist}/assets/{js_file}', encoding='utf-8').read()
css = io.open(f'{dist}/assets/{css_file}', encoding='utf-8').read()
mimes = {'.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4'}
assets = [('assets/logo.png', 'image/png'), ('assets/logo-white.png', 'image/png')]
assets += [(f'assets/featured/{os.path.basename(f)}', mimes[os.path.splitext(f)[1]]) for f in glob.glob(f'{dist}/assets/featured/*') if os.path.splitext(f)[1] in mimes]
for rel, mime in assets:
    if not os.path.exists(f'{dist}/{rel}'):
        continue
    b64 = base64.b64encode(open(f'{dist}/{rel}', 'rb').read()).decode()
    uri = f'data:{mime};base64,{b64}'
    js = js.replace(f'/{rel}?v=3', uri).replace(f'/{rel}', uri)
    css = css.replace(f'/{rel}', uri)
for f in glob.glob(f'{dist}/fonts/*.woff2'):  # self-hosted fonts, if any (only free/licensed ones belong in public/fonts)
    rel = 'fonts/' + os.path.basename(f)
    css = css.replace(f'/{rel}', 'data:font/woff2;base64,' + base64.b64encode(open(f, 'rb').read()).decode())
js = js.replace('</script>', '<' + chr(92) + '/script>')
fonts = re.findall(r'<link[^>]*fonts[^>]*>', html)
out = '<title>Mars CoffeeHouse</title>\n' + '\n'.join(fonts) + '\n'
out += f'<style>\n{css}\n</style>\n<div id="root"></div>\n<script type="module">\n{js}\n</script>\n'
dest = sys.argv[1] if len(sys.argv) > 1 else 'mars-coffeehouse-preview.html'
io.open(dest, 'w', encoding='utf-8').write(out)
print('bundled', dest, round(os.path.getsize(dest) / 1024), 'KB')

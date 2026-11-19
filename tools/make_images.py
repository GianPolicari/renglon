#!/usr/bin/env python3
"""Browser-tab icons and the link-preview image (og:image).

  python3 tools/make_images.py

Writes public/favicon.svg, public/favicon.ico (16+32+48), public/apple-touch-icon.png (180)
and public/og.png (1200x630). The pictures use the site's own fonts and colours, rendered
with Chromium so they match the page.
"""
import base64, io, pathlib
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public'
NAVY, BRASS, PAPER, LINE = '#102a43', '#c9a462', '#f3f5f7', '#9fb3c8'

# A ruled sheet (a "renglón" is a ruled line); the brass line is the one being read.
FAVICON = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="{NAVY}"/>
<path d="M15 19h34M15 45h24" stroke="{LINE}" stroke-width="5" stroke-linecap="round"/>
<path d="M15 32h34" stroke="{BRASS}" stroke-width="7" stroke-linecap="round"/>
</svg>
'''

def font(name):  # inlined: a page set from a string may not load file:// fonts
    return 'data:font/woff2;base64,' + base64.b64encode((ROOT / 'assets' / 'fonts' / name).read_bytes()).decode()
ROWS = [('03/10', 'Transferencia recibida', '+ 150.000,00'), ('05/10', 'Supermercado', '- 42.318,50'),
        ('09/10', 'Pago de tarjeta', '- 96.020,00'), ('12/10', 'Débito automático luz', '- 18.744,10'),
        ('15/10', 'Rendimiento', '+ 3.212,77')]
rows = ''.join(f'<div class="r{" hi" if i == 2 else ""}"><span>{d}</span><span>{t}</span><span>{m}</span></div>'
               for i, (d, t, m) in enumerate(ROWS))
OG = f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:S;src:url({font('source-serif-4-latin-wght.woff2')}) format("woff2");font-weight:200 900}}
@font-face{{font-family:P;src:url({font('plex-sans-latin-wght.woff2')}) format("woff2");font-weight:100 700}}
html,body{{margin:0}}
body{{width:1200px;height:630px;background:{NAVY};color:#fff;font-family:P;display:flex;box-sizing:border-box;padding:76px 72px;gap:56px}}
.l{{flex:1;display:flex;flex-direction:column}}
.mark{{width:64px;height:64px}}
h1{{font:600 104px/1 S;letter-spacing:-.02em;margin:34px 0 26px}}
p{{font-size:33px;line-height:1.3;margin:0;color:#d9e2ec;max-width:560px}}
.u{{margin-top:auto;font-size:26px;color:{BRASS};letter-spacing:.01em}}
.sheet{{width:470px;align-self:center;background:{PAPER};border-radius:10px;padding:18px 0;color:#0c1726;box-shadow:0 30px 60px rgba(0,0,0,.35)}}
.r{{display:grid;grid-template-columns:70px 1fr auto;gap:14px;padding:15px 24px;font-size:19px;border-bottom:1px solid #d3dae1}}
.r:last-child{{border-bottom:0}}
.r span:last-child{{font-variant-numeric:tabular-nums}}
.hi{{background:#f6ecd6;box-shadow:inset 5px 0 0 {BRASS}}}
</style></head><body>
<div class="l"><div class="mark">{FAVICON}</div>
<h1>Renglón</h1>
<p>Tu resumen bancario o de tarjeta, de PDF a Excel. Gratis y sin subir el archivo.</p>
<div class="u">renglon.com.ar</div></div>
<div class="sheet">{rows}</div>
</body></html>'''


def main():
    (ROOT / 'favicon.svg').write_text(FAVICON)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1200, 'height': 630})
        pg.set_content(OG, wait_until='networkidle')
        pg.evaluate('document.fonts.ready')
        pg.screenshot(path=str(ROOT / 'og.png'))
        icons = {}
        for size in (180, 48, 32, 16):
            pg.set_viewport_size({'width': size, 'height': size})
            pg.set_content(f'<style>html,body{{margin:0;background:transparent}}svg{{display:block;width:{size}px;height:{size}px}}</style>{FAVICON}')
            icons[size] = Image.open(io.BytesIO(pg.screenshot(omit_background=True))).convert('RGBA')
        b.close()
    # the touch icon sits on iOS home screens, which round the corners themselves: fill the square
    touch = Image.new('RGBA', (180, 180), NAVY); touch.alpha_composite(icons[180])
    touch.convert('RGB').save(ROOT / 'apple-touch-icon.png', optimize=True)
    icons[48].save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[icons[32], icons[16]])
    Image.open(ROOT / 'og.png').convert('RGB').save(ROOT / 'og.png', optimize=True)
    for f in ('favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.png'):
        print(f, (ROOT / f).stat().st_size, 'bytes')


if __name__ == '__main__':
    main()

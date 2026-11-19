#!/usr/bin/env python3
"""Draws the BREACHLINE: 29 logo and exports every icon size.

    python3 tools/make-brand.py

Needs rsvg-convert and ImageMagick. The mark is two swarm jaws closing on a rank chevron, inside a
hive cell. /assets/ is served as immutable for a year, so a redrawn icon needs a new file name
(bump VERSION) or returning visitors keep the old one.
"""
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'brand'
VERSION = 'v1'

NIGHT = '#070e18'
PLATE = '#0c1621'
AMBER = '#f2b13b'
AMBER_DEEP = '#c98a1f'
ICE = '#7fe3ff'
BONE = '#eef6fc'
BONE_SHADE = '#9fb5c6'

HEX = '256,18 462,137 462,375 256,494 50,375 50,137'
MIRROR = 'matrix(-1 0 0 1 512 0)'

JAW = 'M247 92C128 116 62 262 146 392L176 358C150 316 142 278 150 244L198 228L172 192C190 154 220 120 247 92Z'
JAW_FACET = 'M247 92C128 116 62 262 146 392L176 358C96 262 150 150 247 92Z'
CHEVRON = 'M256 230 318 290V366L256 306 194 366V290Z'
CHEVRON_FACET = 'M256 230 318 290V366L256 306Z'

# The tab-sized cut: a solid amber cell with the jaws and chevron knocked out in two colours, which
# stays sharp at 16 pixels on light and dark browser tabs alike.
JAW_SMALL = 'M236 58C92 96 34 268 138 420L198 366C138 286 150 176 236 58Z'
CHEVRON_SMALL = 'M256 226 340 310V416L256 332 172 416V310Z'


def mark_parts():
    return f'''<polygon points="{HEX}" fill="{PLATE}" stroke="{AMBER}" stroke-width="28" stroke-linejoin="round"/>
<path d="{JAW}" fill="{BONE}"/>
<g transform="{MIRROR}"><path d="{JAW}" fill="{BONE}"/><path d="{JAW_FACET}" fill="{BONE_SHADE}"/></g>
<path d="{CHEVRON}" fill="{AMBER}"/>
<path d="{CHEVRON_FACET}" fill="{AMBER_DEEP}"/>'''


def small_parts():
    return f'''<polygon points="{HEX}" fill="{AMBER}" stroke="{AMBER}" stroke-width="28" stroke-linejoin="round"/>
<path d="{JAW_SMALL}" fill="{PLATE}"/>
<g transform="{MIRROR}"><path d="{JAW_SMALL}" fill="{PLATE}"/></g>
<path d="{CHEVRON_SMALL}" fill="{PLATE}"/>'''


def svg(body, w=512, h=512, label='BREACHLINE: 29'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'role="img" aria-label="{label}">\n{body}\n</svg>\n')


def tile(scale):
    """The mark on an opaque square, for icons the system crops or that cannot be transparent."""
    inset = 256 * (1 - scale)
    return (f'<rect width="512" height="512" fill="{NIGHT}"/>\n'
            f'<g transform="translate({inset:.1f} {inset:.1f}) scale({scale})">\n{mark_parts()}\n</g>')


# Letters are drawn by hand on a 100-unit cap height, so the logo needs no font.
GLYPHS = {
    'B': (62, 'M0 0H50L62 12V38L54 50 62 62V88L50 100H0ZM17 15V42H41L45 38V19L41 15ZM17 57V85H41L45 81V61L41 57Z'),
    'R': (62, 'M0 0H50L62 12V44L52 54 62 100H44L35 58H17V100H0ZM17 15V43H41L45 39V19L41 15Z'),
    'E': (58, 'M0 0H58V15H17V42H50V57H17V85H58V100H0Z'),
    'A': (66, 'M22 0H44L66 100H48L44 79H22L18 100H0ZM25 64H41L33 22Z'),
    'C': (62, 'M12 0H50L62 12V31H45V19L41 15H21L17 19V81L21 85H41L45 81V69H62V88L50 100H12L0 88V12Z'),
    'H': (62, 'M0 0H17V42H45V0H62V100H45V57H17V100H0Z'),
    'L': (56, 'M0 0H17V85H56V100H0Z'),
    'I': (17, 'M0 0H17V100H0Z'),
    'N': (64, 'M0 0H17L47 62V0H64V100H47L17 38V100H0Z'),
    '2': (62, 'M0 12 12 0H50L62 12V46L50 58H17V85H62V100H0V55L12 43H41L45 39V19L41 15H21L17 19V31H0Z'),
    '9': (62, 'M12 0H50L62 12V88L50 100H12L0 88V69H17V81L21 85H41L45 81V57H12L0 45V12ZM21 15 17 19V38L21 42H41L45 38V19L41 15Z'),
}


def word(text, x, gap=12):
    parts, marks = [], {}
    for ch in text:
        w, d = GLYPHS[ch]
        parts.append(f'<path transform="translate({x} 0)" d="{d}"/>')
        marks.setdefault(ch, x)
        x += w + gap
    return '\n'.join(parts), x - gap, marks


def logo():
    letters, end, at = word('BREACHLINE', 0)
    numerals, end, _ = word('29', end + 36)
    # The breach: one fracture down the right leg of the A, clear of its counter so the letter still reads.
    a = at['A']
    crack = f'M{a + 36} -9 {a + 50} 24 {a + 42} 40 {a + 58} 66 {a + 50} 80 {a + 62} 109'

    k = 1.28
    mark = 232
    pad = 8
    text_x = mark + 44
    width = round(text_x + end * k + pad)
    height = mark + pad * 2
    text_y = (height - 100 * k) / 2

    body = f'''<defs>
<linearGradient id="steel" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset=".08" stop-color="#f6fbff"/><stop offset=".46" stop-color="#c6d6e2"/>
<stop offset=".54" stop-color="#6f8799"/><stop offset=".92" stop-color="#b4c6d4"/>
</linearGradient>
<mask id="breach" maskUnits="userSpaceOnUse" x="-10" y="-20" width="{end + 20}" height="140">
<rect x="-10" y="-20" width="{end + 20}" height="140" fill="#fff"/>
<path d="{crack}" fill="none" stroke="#000" stroke-width="8"/>
</mask>
</defs>
<g transform="translate({pad} {pad}) scale({mark / 512})">
{mark_parts()}
</g>
<g transform="translate({text_x} {text_y:.1f}) scale({k})">
<g fill="url(#steel)" mask="url(#breach)">
{letters}
</g>
<path d="{crack}" fill="none" stroke="{ICE}" stroke-width="2.6"/>
<g fill="{AMBER}">
{numerals}
</g>
</g>'''
    return svg(body, width, height), width


def run(*cmd):
    subprocess.run([str(c) for c in cmd], check=True)


def export(source, size, target):
    run('rsvg-convert', '-w', size, '-h', size, source, '-o', target)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'mark-{VERSION}.svg').write_text(svg(mark_parts()))
    logo_svg, logo_width = logo()
    (OUT / f'logo-{VERSION}.svg').write_text(logo_svg)
    (ROOT / 'favicon.svg').write_text(svg(small_parts()))

    run('rsvg-convert', '-w', 1600, OUT / f'logo-{VERSION}.svg', '-o', OUT / f'logo-{VERSION}.png')

    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        (tmp / 'apple.svg').write_text(svg(tile(.84)))
        (tmp / 'maskable.svg').write_text(svg(tile(.74)))
        export(OUT / f'mark-{VERSION}.svg', 192, OUT / f'icon-192-{VERSION}.png')
        export(OUT / f'mark-{VERSION}.svg', 512, OUT / f'icon-512-{VERSION}.png')
        export(tmp / 'maskable.svg', 512, OUT / f'icon-maskable-512-{VERSION}.png')
        export(tmp / 'apple.svg', 180, OUT / f'apple-touch-icon-{VERSION}.png')

        sizes = (16, 32, 48)
        frames = []
        for s in sizes:
            frame = tmp / f'f{s}.png'
            export(ROOT / 'favicon.svg', s, frame)
            frames.append(frame)
        run('magick', *frames, ROOT / 'favicon.ico')

    print(f'logo is {logo_width} wide')


if __name__ == '__main__':
    main()

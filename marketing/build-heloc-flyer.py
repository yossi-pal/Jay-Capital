#!/usr/bin/env python3
"""
Build the HELOC one-pager for social media and print.

Produces, in marketing/out/:
  heloc-flyer-letter.pdf   US Letter, for email and print
  heloc-flyer-letter.png   the same at 150dpi
  heloc-social-portrait.png  1080x1350, Instagram / WhatsApp status
  heloc-social-square.png    1080x1080, feed posts

Rebuild after a copy or brand change:  python3 marketing/build-heloc-flyer.py
Needs: pip install cairosvg qrcode pillow
"""
import base64, io, os, pathlib
import cairosvg, qrcode
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'out'
OUT.mkdir(exist_ok=True)

NAVY, GOLD, INK, MUTED = '#04162A', '#C0954A', '#333333', '#6B7A90'
URL = 'https://www.jaycapitalfunding.com/heloc'
PHONE = '(845) 828-0731'
EMAIL = 'Info@JayCapitalFunding.com'


def data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def lockup(path: str, width: int, on_white: bool) -> tuple[str, float]:
    im = Image.open(ROOT.parent / path)
    im = im.crop(im.getbbox())
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    if on_white:                       # Outlook and print dislike alpha
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    return data_uri(im), width / h


def qr_uri() -> str:
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=0)
    q.add_data(URL)
    q.make(fit=True)
    return data_uri(q.make_image(fill_color=(4, 22, 42), back_color='white').convert('RGB'))


LOCK, LOCK_R = lockup('brand/png/jcf-logo-horizontal.png', 1200, True)
REV, REV_R = lockup('brand/png/jcf-logo-horizontal-reverse.png', 900, False)
QR = qr_uri()

POINTS = [
    ('Only pay for what you use', 'Interest applies to the portion you draw. An unused line costs nothing.'),
    ('Draw on your own timing',   'Take what you need, when you need it, not against a date you are guessing at.'),
    ('Keep your first mortgage',  'The line sits behind the loan you already have. Your existing rate is untouched.'),
    ('A clear answer, fast',      'We know which lenders move quickly, and one person stays with your file to closing.'),
]


def esc(t: str) -> str:
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def flyer(W: int, H: int, scale: float = 1.0, points: int = 4) -> str:
    """
    One layout, driven by the page size, so every output stays in step.

    `points` trims the bullet list for the shorter formats -- the square has
    no room for four without the call-to-action swallowing the last one.
    """
    s = scale
    pad = 50 * s
    band = 132 * s                       # dark footer band
    lock_w = 300 * s
    lock_h = lock_w / LOCK_R

    y = pad + lock_h + 44 * s
    parts = [
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
        f'<rect x="0" y="0" width="{W}" height="{10*s}" fill="{GOLD}"/>',
        f'<image href="{LOCK}" x="{pad}" y="{pad}" width="{lock_w}" height="{lock_h}"/>',
        f'<text x="{pad}" y="{y}" font-family="Georgia,serif" font-size="{20*s}" '
        f'letter-spacing="{4*s}" fill="{GOLD}">HOME EQUITY LINE OF CREDIT</text>',
    ]

    y += 56 * s
    for line in ('Your home&#8217;s equity,', 'ready when you need it.'):
        parts.append(
            f'<text x="{pad}" y="{y}" font-family="Georgia,serif" font-size="{48*s}" '
            f'fill="{NAVY}">{line}</text>')
        y += 56 * s

    y += 6 * s
    parts.append(
        f'<text x="{pad}" y="{y}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="{21*s}" fill="{MUTED}">Borrow against the equity in your home &#8212; '
        f'and pay interest only</text>')
    y += 28 * s
    parts.append(
        f'<text x="{pad}" y="{y}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="{21*s}" fill="{MUTED}">on what you actually use.</text>')

    y += 44 * s
    for title, body in POINTS[:points]:
        parts.append(f'<circle cx="{pad+7*s}" cy="{y-7*s}" r="{6*s}" fill="{GOLD}"/>')
        parts.append(
            f'<text x="{pad+30*s}" y="{y}" font-family="Helvetica,Arial,sans-serif" '
            f'font-size="{21*s}" font-weight="bold" fill="{NAVY}">{esc(title)}</text>')
        y += 27 * s
        parts.append(
            f'<text x="{pad+30*s}" y="{y}" font-family="Helvetica,Arial,sans-serif" '
            f'font-size="{18*s}" fill="{MUTED}">{esc(body)}</text>')
        y += 38 * s

    # Call to action, placed after the bullets rather than a fixed distance
    # from the bottom -- pinning it to the footer let it sit on top of the last
    # bullet when the copy ran long.
    qr_size = 132 * s
    cta_h = qr_size + 16 * s
    cta_y = y - 18 * s
    floor = H - band - cta_h - 26 * s      # never overlap the footer band
    if cta_y > floor:
        cta_y = floor
    parts += [
        f'<rect x="{pad}" y="{cta_y}" width="{W-2*pad}" height="{cta_h}" rx="{14*s}" fill="#EDF2F8"/>',
        f'<text x="{pad+28*s}" y="{cta_y+52*s}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="{24*s}" font-weight="bold" fill="{NAVY}">Apply in a couple of minutes</text>',
        f'<text x="{pad+28*s}" y="{cta_y+86*s}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="{18*s}" fill="{MUTED}">Scan the code, or visit</text>',
        f'<text x="{pad+28*s}" y="{cta_y+114*s}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="{19*s}" font-weight="bold" fill="{GOLD}">jaycapitalfunding.com/heloc</text>',
        f'<image href="{QR}" x="{W-pad-qr_size-16*s}" y="{cta_y+8*s}" width="{qr_size}" height="{qr_size}"/>',
    ]

    # footer
    rev_w = 200 * s
    rev_h = rev_w / REV_R
    parts += [
        f'<rect x="0" y="{H-band}" width="{W}" height="{band}" fill="{NAVY}"/>',
        f'<image href="{REV}" x="{pad}" y="{H-band+(band-rev_h)/2}" width="{rev_w}" height="{rev_h}"/>',
        f'<text x="{W-pad}" y="{H-band+52*s}" text-anchor="end" '
        f'font-family="Helvetica,Arial,sans-serif" font-size="{20*s}" fill="#FFFFFF">{PHONE}</text>',
        f'<text x="{W-pad}" y="{H-band+80*s}" text-anchor="end" '
        f'font-family="Helvetica,Arial,sans-serif" font-size="{17*s}" fill="rgba(255,255,255,.75)">{EMAIL}</text>',
        f'<text x="{W-pad}" y="{H-band+104*s}" text-anchor="end" '
        f'font-family="Helvetica,Arial,sans-serif" font-size="{13*s}" fill="rgba(255,255,255,.55)">'
        f'Jay Capital Funding Inc. &#183; 8 Murin Street, Spring Valley, NY 10977</text>',
    ]

    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">' + ''.join(parts) + '</svg>')


def write(name: str, svg: str, png_width: int | None = None, pdf: bool = False):
    if pdf:
        cairosvg.svg2pdf(bytestring=svg.encode(), write_to=str(OUT / f'{name}.pdf'))
        print('  ', name + '.pdf')
    if png_width:
        cairosvg.svg2png(bytestring=svg.encode(), write_to=str(OUT / f'{name}.png'),
                         output_width=png_width)
        print('  ', name + '.png')


print('building:')
letter = flyer(816, 1056, 1.0)                 # 8.5x11 at 96dpi
write('heloc-flyer-letter', letter, png_width=1275, pdf=True)

write('heloc-social-portrait', flyer(1080, 1350, 1.32), png_width=1080)
write('heloc-social-square',   flyer(1080, 1080, 1.18, points=3), png_width=1080)
print('done ->', OUT)

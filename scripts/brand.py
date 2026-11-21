"""Generate Blyggi's icons and link-preview images into web/brand/.

Run once after a brand change; the outputs are committed.

    python3 scripts/brand.py /path/to/fonts

The fonts directory holds the Google Fonts variable TTFs for Space Grotesk,
Inter and JetBrains Mono (github.com/google/fonts, ofl/). Needs Pillow,
fontTools and Playwright with a Chrome binary.
"""

import asyncio
import base64
import io
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image
from playwright.async_api import async_playwright

FONTS = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/fonts")
OUT = Path(__file__).resolve().parent.parent / "web" / "brand"
OUT.mkdir(parents=True, exist_ok=True)
NEON, INK, SURFACE, LINE, PAPER, MUTED = "#D4FF3A", "#0B0B0A", "#161614", "#2B2C26", "#F4F4EE", "#B5B8A8"


def font(name: str) -> Path:
    return next(FONTS.glob(f"{name}*.ttf"))


# The icon: a black "B" on neon, as outlines so it never depends on fonts.
def icon_svg() -> str:
    f = instantiateVariableFont(TTFont(font("SpaceGrotesk")), {"wght": 700})
    gs = f.getGlyphSet()
    name = f.getBestCmap()[ord("B")]
    upm = f["head"].unitsPerEm
    glyph = gs[name]
    pen = SVGPathPen(gs)
    # Fit the cap height to ~62% of a 64-unit square, centered.
    cap = f["OS/2"].sCapHeight or 700
    scale = 64 * 0.62 / cap
    width = glyph.width * scale
    dx = (64 - width) / 2 + 0.6
    dy = (64 + cap * scale) / 2
    glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, dx, dy)))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="14" fill="{NEON}"/>'
        f'<path fill="{INK}" d="{pen.getCommands()}"/>'
        f'<circle cx="51" cy="13" r="5" fill="{INK}"/>'
        "</svg>"
    )


def face(family: str, name: str, weights: str) -> str:
    data = base64.b64encode(font(name).read_bytes()).decode()
    return f"@font-face{{font-family:'{family}';src:url(data:font/ttf;base64,{data}) format('truetype');font-weight:{weights}}}"


FACES = (
    face("Space Grotesk", "SpaceGrotesk", "300 700")
    + face("Inter", "Inter", "100 900")
    + face("JetBrains Mono", "JetBrainsMono", "100 800")
    + "*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;overflow:hidden;font-family:Inter,sans-serif}"
)


def card(statement: str, sure: str, by: str, year: str, check: str) -> str:
    return f"""
<div style="position:absolute;right:64px;top:92px;width:470px;padding:28px;border-radius:28px;background:{SURFACE};border:3px solid {INK};box-shadow:16px 16px 0 {INK};transform:rotate(-2deg);color:{PAPER};display:flex;flex-direction:column;gap:18px">
  <div style="display:flex;justify-content:space-between;font-size:17px"><b style="font-family:'Space Grotesk'">New claim</b><span style="color:{MUTED}">● your-blyg.com/blyg</span></div>
  <div style="padding:18px;border-radius:16px;background:{INK};border:1px solid {LINE}">
    <div style="font:500 13px 'JetBrains Mono';letter-spacing:.1em;color:{MUTED}">WHAT WILL HAPPEN?</div>
    <div style="margin-top:8px;font:600 27px/1.15 'Space Grotesk'">{statement}</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div style="padding:16px;border-radius:16px;background:{INK};border:1px solid {LINE}"><div style="font-size:13px;color:{MUTED}">How sure</div><div style="font:700 46px/1.1 'Space Grotesk';color:{NEON}">{sure}</div></div>
    <div style="padding:16px;border-radius:16px;background:{INK};border:1px solid {LINE}"><div style="font-size:13px;color:{MUTED}">By</div><div style="font:700 46px/1.1 'Space Grotesk'">{by}</div><div style="font-size:13px;color:{MUTED}">{year}</div></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:15px;color:{MUTED}">Checked by <b style="color:{PAPER}">{check}</b></span>
  <span style="padding:7px 11px;border:2px solid {NEON};border-radius:10px;color:{NEON};font:700 14px 'JetBrains Mono';letter-spacing:.1em;transform:rotate(-5deg)">PINNED v1 ✓</span></div>
</div>"""


def page(kicker: str, headline: str, sub: str, right: str = "", dark: bool = False, size: int = 0) -> str:
    bg, fg = (INK, PAPER) if dark else (NEON, INK)
    return f"""<html><head><style>{FACES}</style></head><body style="background:{bg};color:{fg};position:relative">
<div style="position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:14px">
  <img src="data:image/svg+xml;utf8,{icon_svg().replace('#', '%23').replace('"', "'")}" width="44" height="44" style="border-radius:10px;{'' if not dark else ''}">
  <b style="font:700 34px 'Space Grotesk';letter-spacing:-.03em">Blyggi</b>
</div>
<div style="position:absolute;left:64px;top:148px;width:{580 if right else 1060}px">
  <span style="display:inline-flex;align-items:center;gap:10px;padding:8px 14px;border-radius:20px;border:2px solid {fg};font:700 15px 'JetBrains Mono';letter-spacing:.08em;text-transform:uppercase"><span style="width:9px;height:9px;border-radius:5px;background:{fg}"></span>{kicker}</span>
  <h1 style="margin-top:24px;font:700 {size or (92 if right else 104)}px/.92 'Space Grotesk';letter-spacing:-.055em">{headline}</h1>
  <p style="margin-top:24px;font-size:25px;line-height:1.35;max-width:560px">{sub}</p>
</div>
<div style="position:absolute;left:64px;bottom:44px;font:700 20px 'JetBrains Mono';letter-spacing:.04em">blyggi.com</div>
{right}
</body></html>"""


EXPLORE_ROWS = "".join(
    f"""<div style="display:flex;gap:18px;align-items:baseline;padding:16px 0;border-bottom:1px solid {LINE}">
<b style="font:700 30px 'Space Grotesk';color:{NEON};width:96px;flex:none">{p}</b>
<span style="font:600 22px/1.25 'Space Grotesk';color:{PAPER}">{t}</span></div>"""
    for p, t in [
        ("65%", "Alabama wins this year's Iron Bowl"),
        ("85%", "An open-weights model matches the best closed one by mid-2027"),
        ("80%", "The AI proof of the Riemann hypothesis checks out"),
        ("85%", "US professionals' real weekly earnings fall 10% by 2030"),
    ]
)

PAGES = {
    "og-home": page(
        "Forecasts you can't take back",
        "Say it.<br>Pin it.<br>Get scored.",
        "Make a forecast anyone can check, pinned on your own blyg.",
        card("Alabama wins this year's Iron Bowl", "65%", "Nov 29", "2026", "the final score"),
    ),
    "og-new": page(
        "Make a claim",
        "Forecasts anyone<br>can check.",
        "Plain words in. A pinned, checkable claim out, on your own blyg.",
        card("Renewables make more than 36% of the world's electricity in 2027", "60%", "Jun 30", "2028", "Ember data"),
        size=76,
    ),
    "og-explore": page(
        "Read from public blygs",
        "Every claim,<br>on the record.",
        "",
        f'<div style="position:absolute;right:56px;top:96px;width:500px;padding:22px 28px;border-radius:28px;background:{INK};border:3px solid {INK};box-shadow:16px 16px 0 rgba(11,11,10,.35)">{EXPLORE_ROWS}</div>',
        size=72,
    ).replace('<p style="margin-top:24px;font-size:25px;line-height:1.35;max-width:560px"></p>', '<p style="margin-top:24px;font-size:25px;line-height:1.35;max-width:520px">What people said would happen, how sure they were, and how it turned out.</p>'),
    "og-record": page(
        "Track record",
        "A track record you own.",
        "Every pinned claim, scored when it resolves. Read from public files, so anyone can check it.",
        f"""<div style="position:absolute;right:64px;top:100px;width:470px;padding:30px;border-radius:28px;background:{SURFACE};border:3px solid {INK};box-shadow:16px 16px 0 {INK};transform:rotate(-2deg);color:{PAPER}">
<div style="font:500 13px 'JetBrains Mono';letter-spacing:.1em;color:{MUTED}">BRIER SCORE</div>
<div style="font:700 96px/1 'Space Grotesk';color:{NEON};letter-spacing:-.04em;margin-top:8px">0.142</div>
<div style="font-size:16px;color:{MUTED};margin-top:6px">Lower is better. Always guessing 50% scores 0.250.</div>
<div style="display:flex;gap:10px;margin-top:26px;align-items:flex-end;height:120px">{''.join(f'<div style="flex:1;height:{h}%;background:{NEON};border-radius:6px 6px 0 0;opacity:{o}"></div>' for h, o in [(18,.5),(30,.6),(44,.7),(52,.8),(66,.85),(74,.9),(88,1)])}</div>
<div style="display:flex;justify-content:space-between;font:500 13px 'JetBrains Mono';color:{MUTED};margin-top:8px"><span>said 10%</span><span>said 90%</span></div>
</div>""",
    ),
}


async def main() -> None:
    svg = icon_svg()
    (OUT / "icon.svg").write_text(svg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        pg = await b.new_page(viewport={"width": 512, "height": 512})
        await pg.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("<svg ", "<svg width=512 height=512 ")}</body></html>')
        big = Image.open(io.BytesIO(await pg.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": 512, "height": 512})))
        for size, name in [(32, "favicon-32.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
            big.resize((size, size), Image.LANCZOS).save(OUT / name)
        # Apple draws its own rounded corners and dislikes transparency.
        square = Image.new("RGBA", (512, 512), NEON)
        square.alpha_composite(big)
        square.convert("RGB").resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png")
        big.save(OUT.parent / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
        pg = await b.new_page(viewport={"width": 1200, "height": 630})
        for name, html in PAGES.items():
            await pg.set_content(html)
            await pg.evaluate("document.fonts.ready")
            assert await pg.evaluate("document.fonts.check(\"700 40px 'Space Grotesk'\")"), "fonts not loaded"
            await pg.wait_for_timeout(200)
            await pg.screenshot(path=str(OUT / f"{name}.png"))
        await b.close()
    print("wrote", sorted(x.name for x in OUT.iterdir()))


asyncio.run(main())

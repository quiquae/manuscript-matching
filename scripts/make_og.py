"""Draw site/og.png, the 1200x630 card that link previews show.

Run once and commit the result: `python3 scripts/make_og.py`. It is generated
rather than hand-drawn so the palette can only ever come from one place, and
regenerating after a colour change is not a design job.

Fonts are looked up by path with fallbacks, because this runs on whatever
machine happens to have it. Georgia is the first choice only because it is also
in the stylesheet's stack, so the card looks like the page it advertises.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SITE = Path(__file__).resolve().parent.parent / "site"
W, H = 1200, 630

PARCHMENT = (244, 239, 228)
CARD = (251, 248, 241)
INK = (43, 36, 25)
INK_SOFT = (111, 97, 80)
RUBRIC = (158, 43, 37)
RULE = (216, 205, 184)

SERIF = ["/System/Library/Fonts/Supplemental/Georgia.ttf",
         "/Library/Fonts/Georgia.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]
SERIF_BOLD = ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
              "/Library/Fonts/Georgia Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"]
SERIF_ITALIC = ["/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
                "/Library/Fonts/Georgia Italic.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"]


def font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit(f"no serif font found; tried:\n  " + "\n  ".join(candidates))


def card(w: int, h: int, angle: float) -> Image.Image:
    """One manuscript card: a ruled page with a rubricated initial, rotated."""
    pad = 26
    img = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([pad, pad, pad + w, pad + h], radius=6,
                        fill=CARD, outline=RULE, width=2)
    x, y = pad + 18, pad + 20
    d.rounded_rectangle([x, y, x + 34, y + 34], radius=3, fill=RUBRIC)
    for i in range(2):                          # lines beside the initial
        ly = y + 4 + i * 16
        d.rounded_rectangle([x + 46, ly, x + 46 + (w - 86), ly + 6], radius=3, fill=RULE)
    for i in range(6):                          # the text block below it
        ly = y + 52 + i * 18
        if ly + 6 > pad + h - 16:
            break
        run = (w - 40) if i < 5 else int((w - 40) * 0.6)
        d.rounded_rectangle([x, ly, x + run, ly + 6], radius=3, fill=RULE)
    return img.rotate(angle, expand=True, resample=Image.BICUBIC)


def main() -> None:
    img = Image.new("RGB", (W, H), PARCHMENT)
    d = ImageDraw.Draw(img)
    d.rectangle([28, 28, W - 29, H - 29], outline=RULE, width=2)

    # Three cards, fanned, oldest-to-newest left to right like the game.
    for dx, dy, angle in ((0, 44, 7.0), (176, 12, -3.0), (352, 52, 5.0)):
        c = card(190, 250, angle)
        img.paste(c, (700 + dx - c.width // 2, 300 + dy - c.height // 2), c)

    d.text((70, 150), "Manuscript", font=font(SERIF_BOLD, 82), fill=INK)
    d.text((70, 238), "Matching", font=font(SERIF_BOLD, 82), fill=INK)
    d.text((72, 344), "Put them in order, oldest first.",
           font=font(SERIF_ITALIC, 34), fill=RUBRIC)
    d.text((72, 404), "Three games, and 2,201 manuscripts",
           font=font(SERIF, 26), fill=INK_SOFT)
    d.text((72, 440), "from the Bodleian Libraries.",
           font=font(SERIF, 26), fill=INK_SOFT)

    out = SITE / "og.png"
    img.save(out, optimize=True)
    print(f"wrote {out}  {out.stat().st_size / 1024:.0f} KB  {W}x{H}")


if __name__ == "__main__":
    main()

"""Build the jacket design proof using the supplied Bennett’s Bone wrap as a size reference."""

from argparse import ArgumentParser
from pathlib import Path
import re
from xml.sax.saxutils import escape

from PIL import Image as RasterImage

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

from produce import register_fonts, style

ROOT = Path(__file__).resolve().parents[1]
W, H = 14.471 * 72, 10.417 * 72
# The center band on the reference is a visual guide. Printer geometry comes from the title's own template.
SPINE = 0.86 * 72
PANEL = (W - SPINE) / 2
PLUM = HexColor("#291829")
DEEP = HexColor("#1d121e")
GOLD = HexColor("#cfab72")
CREAM = HexColor("#faf1e7")
SOFT = HexColor("#e0cbdf")


def centered(pdf, text, x, y, font, size, color):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    pdf.drawCentredString(x, y, text)


def paragraph(pdf, text, x, y, w, size, leading, color, bold=False):
    spec = style("CoverCopy", "SerifBold" if bold else "Serif", size, leading)
    spec.textColor = color
    spec.alignment = 1
    markup = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", escape(text.strip("*")))
    block = Paragraph(markup, spec)
    _, height = block.wrap(w, H)
    block.drawOn(pdf, x, y - height)
    return y - height


def back_copy(pdf, center, top, width, title_size, body_size, leading, gap):
    copy = (ROOT / "assets/cover/back-cover.md").read_text().strip().split("\n\n")
    centered(pdf, copy[0][2:], center, top, "SerifBold", title_size, CREAM)
    centered(pdf, copy[1][3:], center, top - 29, "SerifItalic", 13, GOLD)
    y = top - 71
    for index, block in enumerate(copy[2:]):
        y = paragraph(pdf, block, center - width / 2, y, width, body_size, leading,
                      GOLD if index in (0, 3) else CREAM, bold=index in (0, 3)) - gap
    return y


def proof(destination, front):
    register_fonts()
    pdf = Canvas(str(destination), pagesize=(W, H), invariant=1, initialFontName="Serif")
    pdf.setTitle("The 14 Laws to Groove — Hardcover Wrap Design Proof")
    pdf.setAuthor("JABARI JAJA")
    pdf.setFillColor(DEEP)
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    pdf.setFillColor(PLUM)
    pdf.rect(PANEL, 0, SPINE, H, fill=1, stroke=0)
    art = ImageReader(str(front))
    pixels = art.getRGBData()
    pdf.setFillColor(Color(*(channel / 255 for channel in pixels[:3])))
    pdf.rect(PANEL + SPINE, 0, PANEL, H, fill=1, stroke=0)

    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(0.8)
    for x in (PANEL + 5, PANEL + SPINE - 5):
        pdf.line(x, 31, x, H - 31)
    pdf.line(77, H - 91, PANEL - 77, H - 91)
    pdf.line(77, 92, PANEL - 77, 92)

    y = back_copy(pdf, PANEL / 2, H - 143, PANEL - 160, 22, 12, 18, 19)
    if y < 160:
        raise ValueError("Back copy reached the barcode or publisher area")

    centered(pdf, "G R O O V E V I L L E   L L C", 150, 116, "SerifBold", 8, SOFT)
    pdf.setFillColor(CREAM)
    pdf.rect(PANEL - 173, 108, 116, 70, stroke=0, fill=1)

    pdf.saveState()
    pdf.translate(PANEL + SPINE / 2 + 5, H / 2)
    pdf.rotate(-90)
    centered(pdf, "THE 14 LAWS TO GROOVE", -38, 0, "SerifBold", 15, CREAM)
    centered(pdf, "JABARI JAJA", 155, 0, "Serif", 10, GOLD)
    pdf.restoreState()

    # Keep the entire front artwork visible within the 6 × 9 inch review panel.
    front_center = PANEL + SPINE + PANEL / 2
    pdf.drawImage(art, front_center - 216, (H - 648) / 2, width=432, height=648,
                  preserveAspectRatio=True, anchor="c")
    pdf.showPage()
    pdf.save()


def paperback(destination, front, page_count):
    """KDP 6 × 9-inch, black ink/white paper, with the standard cover bleed."""
    register_fonts()
    bleed = 9
    trim_width, trim_height = 432, 648
    # KDP white-paper paperback spine: page count × 0.002252 inches.
    spine = page_count * 0.002252 * 72
    back_edge = bleed + trim_width
    front_edge = back_edge + spine
    width = front_edge + trim_width + bleed
    height = trim_height + 2 * bleed
    pdf = Canvas(str(destination), pagesize=(width, height), invariant=1, initialFontName="Serif")
    pdf.setTitle("The 14 Laws to Groove — KDP Paperback Cover")
    pdf.setAuthor("JABARI JAJA")

    pdf.setFillColor(DEEP)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(PLUM)
    pdf.rect(back_edge, 0, spine, height, fill=1, stroke=0)
    with RasterImage.open(front) as source:
        rgb = source.convert("RGB")
        corner = rgb.getpixel((0, 0))
        # Match the output sampling density to print export; retain the original artwork.
        art = ImageReader(rgb.resize((1800, 2700), RasterImage.Resampling.LANCZOS))
        pdf.setFillColor(Color(*(value / 255 for value in corner)))
        pdf.rect(front_edge, 0, width - front_edge, height, fill=1, stroke=0)
        pdf.drawImage(art, front_edge + 12, bleed + 18, width=408, height=612,
                      preserveAspectRatio=True, anchor="c")

    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(0.7)
    pdf.line(62, height - 78, back_edge - 53, height - 78)
    pdf.line(62, 126, back_edge - 53, 126)
    y = back_copy(pdf, bleed + trim_width / 2, height - 122, 316, 20, 11, 16, 16)
    if y < 116:
        raise ValueError("Paperback back copy enters the barcode area")
    # Leave the lower-right back clear for KDP's automatic barcode.
    centered(pdf, "G R O O V E V I L L E   L L C", 134, 65, "SerifBold", 8, SOFT)

    pdf.saveState()
    pdf.translate(back_edge + spine / 2 - 2.5, height / 2)
    pdf.rotate(-90)
    centered(pdf, "THE 14 LAWS TO GROOVE", -32, 0, "SerifBold", 10.5, CREAM)
    centered(pdf, "JABARI JAJA", 131, 0, "Serif", 8, GOLD)
    pdf.restoreState()
    pdf.showPage()
    pdf.save()


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--paperback-pages", type=int, help="Build a white-paper KDP paperback wrap")
    pages = parser.parse_args().paperback_pages
    source = ROOT / "assets/cover/recreated-front.png"
    output = ROOT / "exports/cover"
    output.mkdir(parents=True, exist_ok=True)
    if pages is None:
        proof(output / "the-14-laws-to-groove-hardcover-wrap-proof.pdf", source)
    else:
        paperback(output / f"the-14-laws-to-groove-KDP-paperback-white-{pages}.pdf", source, pages)

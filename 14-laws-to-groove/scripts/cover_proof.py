"""Build the jacket design proof using the supplied Bennett’s Bone wrap as a size reference."""

from pathlib import Path
import re
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
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


def proof(destination):
    register_fonts()
    pdf = Canvas(str(destination), pagesize=(W, H), invariant=1, initialFontName="Serif")
    pdf.setTitle("The 14 Laws to Groove — Hardcover Wrap Design Proof")
    pdf.setAuthor("JABARI JAJA")
    pdf.setFillColor(DEEP)
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    pdf.setFillColor(PLUM)
    pdf.rect(PANEL, 0, SPINE, H, fill=1, stroke=0)
    pdf.setFillColor(CREAM)
    pdf.rect(PANEL + SPINE, 0, PANEL, H, fill=1, stroke=0)

    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(0.8)
    for x in (PANEL + 5, PANEL + SPINE - 5):
        pdf.line(x, 31, x, H - 31)
    pdf.line(77, H - 91, PANEL - 77, H - 91)
    pdf.line(77, 92, PANEL - 77, 92)

    copy = (ROOT / "assets/cover/back-cover.md").read_text().strip().split("\n\n")
    center = PANEL / 2
    centered(pdf, copy[0][2:], center, H - 143, "SerifBold", 22, CREAM)
    centered(pdf, copy[1][3:], center, H - 172, "SerifItalic", 13, GOLD)
    y = H - 214
    for index, block in enumerate(copy[2:]):
        y = paragraph(pdf, block, 80, y, PANEL - 160, 12, 18,
                      GOLD if index in (0, 3) else CREAM, bold=index in (0, 3)) - 19
    if y < 160:
        raise ValueError("Back copy reached the barcode or publisher area")

    centered(pdf, "G R O O V E V I L L E   L L C", 150, 116, "SerifBold", 8, SOFT)
    pdf.setFillColor(CREAM)
    pdf.rect(PANEL - 173, 108, 116, 70, stroke=0, fill=1)
    centered(pdf, "BARCODE AREA", PANEL - 115, 140, "Serif", 7, DEEP)

    pdf.saveState()
    pdf.translate(PANEL + SPINE / 2 + 5, H / 2)
    pdf.rotate(-90)
    centered(pdf, "THE 14 LAWS TO GROOVE", -38, 0, "SerifBold", 15, CREAM)
    centered(pdf, "JABARI JAJA", 155, 0, "Serif", 10, GOLD)
    pdf.restoreState()

    # Reserve a centered 6 × 9 inch front-art area in the reference layout.
    front_center = PANEL + SPINE + PANEL / 2
    pdf.setStrokeColor(HexColor("#c2a8b9"))
    pdf.setDash(4, 4)
    pdf.rect(front_center - 216, (H - 648) / 2, 432, 648, stroke=1, fill=0)
    centered(pdf, "APPROVED FRONT COVER", front_center, H / 2 + 10, "SerifBold", 17, PLUM)
    centered(pdf, "Artwork placement area", front_center, H / 2 - 16, "SerifItalic", 12, PLUM)
    centered(pdf, "DESIGN PROOF", front_center, 27, "SerifBold", 8, PLUM)
    pdf.showPage()
    pdf.save()


if __name__ == "__main__":
    out = ROOT / "exports/cover/the-14-laws-to-groove-hardcover-wrap-proof.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    proof(out)

"""Place grayscale sketches over verified whitespace in the locked print PDF."""

from pathlib import Path

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "exports/complete-book"
MASTER = EXPORT / "The_14_Laws_to_Groove_FINAL_Print.pdf"
ILLUSTRATED = EXPORT / "The_14_Laws_to_Groove_Illustrated_Interior.pdf"
PLACEMENTS = (
    (10, "Reflection", "mirror and a written account"),
    (26, "Phone Down", "two friends talking beside a face-down phone"),
    (35, "Scout", "a prospective apprentice checking a transit map"),
    (44, "Branding", "a professional preparing for a presentation in front of a mirror"),
    (53, "I Say = I Will", "a handshake across a worktable"),
    (60, "Peers Aren't Dears", "a friend setting a boundary in conversation"),
    (73, "Endowment", "a mentor and teenager working through a budget"),
    (82, "Risky Rewards", "a decision weighed against household savings"),
    (91, "Disengagement", "someone calmly stepping away from a tense group"),
    (100, "Strategy", "neighbors using a street map to plan a crosswalk proposal"),
    (109, "Time", "a watch and a calendar for competing responsibilities"),
    (118, "Planning", "neighbors coordinating a plan and a handoff"),
    (127, "Mother's Child", "a granddaughter and grandmother mending a garment together"),
    (136, "Mental Awareness", "a quiet conversation on a park bench"),
)


def raster(page):
    pixmap = page.get_pixmap()
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def illustrate():
    with fitz.open(MASTER) as master, fitz.open(MASTER) as edition:
        if len(master) != 162:
            raise ValueError("The approved master must have 162 pages")
        regions = {}
        notes = []
        for law, (number, title, concept) in enumerate(PLACEMENTS, 1):
            page = edition[number - 1]
            asset = ROOT / "assets/illustrations" / f"law-{law:02}.png"
            with Image.open(asset) as sketch:
                ratio = sketch.width / sketch.height
            safe = fitz.Rect(36 if number % 2 else 18, 18, 414 if number % 2 else 396, 630)
            blocks = [fitz.Rect(b["bbox"]) for b in page.get_text("dict")["blocks"]]
            body_bottom = max(b.y1 for b in blocks if 40 < b.y0 < 595)
            width = min(270, (590 - body_bottom - 14) * ratio)
            height = width / ratio
            if width < 140 or height < 70 or page.get_drawings():
                raise ValueError(f"Illustration does not fit safely on page {number}")
            x = (safe.x0 + safe.x1 - width) / 2
            region = fitz.Rect(x, body_bottom + 14, x + width, body_bottom + 14 + height)
            if not safe.contains(region) or any(region.intersects(block) for block in blocks):
                raise ValueError(f"Illustration would overlap content on page {number}")
            page.insert_image(region, filename=str(asset), overlay=True)
            regions[number] = region
            notes.append(f"| {law:02} | {title} | {number} | {concept.capitalize()} |")

        for number, (original, updated) in enumerate(zip(master, edition), 1):
            if original.rect != updated.rect or original.get_text() != updated.get_text():
                raise ValueError(f"Original layout or text changed on page {number}")
            difference = ImageChops.difference(raster(original), raster(updated)).getbbox()
            if number in regions:
                if not difference or not (regions[number] + (-1, -1, 1, 1)).contains(fitz.Rect(difference)):
                    raise ValueError(f"Unexpected rendered change on page {number}")
            elif difference:
                raise ValueError(f"Unillustrated page {number} changed")

        edition.save(ILLUSTRATED, garbage=3, deflate=True)
        with fitz.open() as comparison:
            for number in (10, 44, 73):
                sheet = comparison.new_page(width=912, height=700)
                sheet.insert_text((16, 24), f"Page {number}  |  Approved master", fontsize=12)
                sheet.insert_text((464, 24), f"Page {number}  |  Illustrated", fontsize=12)
                for x, doc in ((16, master), (464, edition)):
                    sheet.show_pdf_page(fitz.Rect(x, 36, x + 432, 684), doc, number - 1)
            comparison.save(EXPORT / "Illustration_Before_After.pdf", garbage=3, deflate=True)

    report = ROOT / "reviews/illustration-placement.md"
    report.write_text(
        "# Illustration placement\n\n"
        "The 162-page print master remains unchanged. The illustrated edition adds original courtroom-style graphite "
        "vignettes with transparent margins in existing whitespace. Every page was compared with the master. "
        "Text and page geometry matched, and all visible differences were contained within the designated art rectangles.\n\n"
        "| Law | Chapter | Page | Concept |\n| --- | --- | ---: | --- |\n"
        + "\n".join(notes) + "\n"
    )


if __name__ == "__main__":
    illustrate()

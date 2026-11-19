#!/usr/bin/env python3
"""Build and verify the chapter and book review editions."""

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, NextPageTemplate, PageBreak, PageTemplate,
    Paragraph, Spacer,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
PAGE = (432, 648)
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
TITLES = (
    "REFLECTION", "PHONE DOWN", "SCOUT", "BRANDING", "I SAY = I WILL",
    "PEERS AREN'T DEARS", "ENDOWMENT", "RISKY REWARDS", "DISENGAGEMENT",
    "STRATEGY", "TIME", "PLANNING", "MOTHER'S CHILD", "MENTAL AWARENESS",
)
SECTIONS = ("The Law", "The Story", "The Reality", "The Lesson", "The Groove", "The Final Word")
INK = colors.HexColor("#211824")
ACCENT = colors.HexColor("#663d63")


def chapter_paths(number):
    slug = re.sub(r"[^a-z]+", "-", TITLES[number - 1].lower().replace("'", "")).strip("-")
    stem = f"{number:02d}-{slug}"
    return ROOT / f"book/chapters/{stem}.md", ROOT / f"exports/chapters/law-{stem}.pdf"


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True)


def validate_source(number, content):
    headings = re.findall(r"^## (.+)$", content, re.M)
    expected = f"# LAW {number:02d} — {TITLES[number - 1]}"
    if content.splitlines()[0] != expected or tuple(headings) != SECTIONS:
        raise ValueError(f"Law {number:02d} has invalid title or section order")
    for section in re.split(r"^## .+$", content, flags=re.M)[1:]:
        if not section.strip():
            raise ValueError(f"Law {number:02d} has an empty section")


def register_fonts():
    for name, file in (
        ("Serif", "DejaVuSerif.ttf"), ("SerifBold", "DejaVuSerif-Bold.ttf"),
        ("SerifItalic", "DejaVuSerif-Italic.ttf"),
    ):
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    pdfmetrics.registerFontFamily("Serif", normal="Serif", bold="SerifBold", italic="SerifItalic")


def style(name, font, size, leading, after=0, before=0):
    return ParagraphStyle(
        name, fontName=font, fontSize=size, leading=leading,
        spaceAfter=after, spaceBefore=before, textColor=INK,
        keepWithNext=name in {"Chapter", "Section"}, allowWidows=0, allowOrphans=0,
    )


def flow(text):
    for block in re.split(r"\n\s*\n", text.strip()):
        block = block.strip()
        if block.startswith("# "):
            yield Spacer(1, 35)
            yield Paragraph(escape(block[2:]), style("Chapter", "SerifBold", 22, 29, 19))
        elif block.startswith("## "):
            yield Paragraph(escape(block[3:]), style("Section", "SerifBold", 12, 17, 7, 10))
        else:
            inline = escape(" ".join(block.splitlines()))
            inline = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", inline)
            yield Paragraph(inline, style("Body", "Serif", 10.5, 15.5, 8))


class ReviewDocument(BaseDocTemplate):
    def __init__(self, path, title, has_cover):
        super().__init__(str(path), pagesize=PAGE, title=title, author="Jabari Jaja")
        self.has_cover = has_cover

        def frame(left):
            return Frame(left, 49, PAGE[0] - 106, PAGE[1] - 104, leftPadding=0,
                         rightPadding=0, topPadding=0, bottomPadding=0)

        covers = [PageTemplate("cover", [Frame(0, 0, *PAGE, leftPadding=0,
                  rightPadding=0, topPadding=0, bottomPadding=0)])] if has_cover else []
        self.addPageTemplates(covers + [
            PageTemplate("right", [frame(59)], onPage=self.furniture, autoNextPageTemplate="left"),
            PageTemplate("left", [frame(47)], onPage=self.furniture, autoNextPageTemplate="right"),
        ])

    def furniture(self, pdf, doc):
        number = doc.page - self.has_cover
        right = bool(number % 2)
        pdf.saveState()
        pdf.setFillColor(ACCENT)
        pdf.setFont("Serif", 8)
        pdf.drawCentredString(PAGE[0] / 2, PAGE[1] - 34, "THE 14 LAWS TO GROOVE")
        if right:
            pdf.drawRightString(PAGE[0] - 47, 29, str(number))
        else:
            pdf.drawString(47, 29, str(number))
        pdf.restoreState()

    def afterFlowable(self, item):
        if isinstance(item, Paragraph) and item.style.name == "Chapter":
            title = item.getPlainText()
            if title not in {"The 14 Laws to Groove", "Copyright", "Contents"}:
                key = re.sub(r"[^\w]+", "-", title).strip("-").lower()
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(title, key)
                self.notify("TOCEntry", (0, title, self.page - self.has_cover, key))


def tokens(text):
    return re.findall(r"[\w]+", text.casefold())


def verify(pdf, texts):
    info = run("pdfinfo", str(pdf))
    if not re.search(r"Page size:\s+432 x 648 pts\b", info):
        raise ValueError("PDF trim size is incorrect")
    fonts = run("pdffonts", str(pdf)).splitlines()[2:]
    if not fonts or any(font.split()[-5] != "yes" for font in fonts):
        raise ValueError("PDF fonts are not embedded")
    extracted = run("pdftotext", "-raw", str(pdf), "-")
    cleaned = re.sub(r"^THE 14 LAWS TO GROOVE\s*$|^\d+\s*$", "", extracted, flags=re.M)
    remaining = " ".join(tokens(cleaned))
    for text in texts:
        expected = " ".join(tokens(text))
        start = remaining.find(expected)
        if start < 0:
            raise ValueError(f"PDF text mismatch near {text[:70]!r}")
        remaining = remaining[start + len(expected):]


def build(path, texts, title, toc=False, cover=None):
    register_fonts()
    story = []
    if cover:
        story.extend([Image(str(cover), width=PAGE[0], height=PAGE[1], kind="proportional"),
                      NextPageTemplate("right"), PageBreak()])
    for index, text in enumerate(texts):
        if index:
            story.append(PageBreak())
        if toc and index == 2:
            story.extend(flow("# Contents"))
            contents = TableOfContents()
            contents.levelStyles = [style("Entry", "Serif", 10, 17, 3)]
            story.extend([contents, PageBreak()])
        story.extend(flow(text))
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=path.parent) as folder:
        candidate = Path(folder) / path.name
        doc = ReviewDocument(candidate, title, bool(cover))
        doc.multiBuild(story, canvasmaker=lambda *a, **kw: canvas.Canvas(*a, **kw, invariant=1,
                                                                       initialFontName="Serif"))
        verify(candidate, texts)
        candidate.replace(path)
    print(path.relative_to(ROOT))


def chapter(number):
    source, pdf = chapter_paths(number)
    text = source.read_text()
    validate_source(number, text)
    build(pdf, [text], f"Law {number:02d} — {TITLES[number - 1]}")


def book():
    front = ROOT / "book/front-matter"
    back = ROOT / "book/back-matter"
    texts = [(front / name).read_text() for name in
             ("title-page.md", "copyright.md", "introduction.md")]
    for number in range(1, 15):
        source, pdf = chapter_paths(number)
        text = source.read_text()
        validate_source(number, text)
        verify(pdf, [text])
        texts.append(text)
    texts.extend((back / name).read_text() for name in ("conclusion.md", "references.md"))
    folder = ROOT / "exports/complete-book"
    build(folder / "the-14-laws-to-groove-review.pdf", texts, "The 14 Laws to Groove", toc=True)
    cover = ROOT / "assets/cover/approved-cover.png"
    if cover.is_file():
        build(folder / "the-14-laws-to-groove-cover-review.pdf", texts,
              "The 14 Laws to Groove", toc=True, cover=cover)


def checkpoint(number):
    source, pdf = chapter_paths(number)
    text = source.read_text()
    validate_source(number, text)
    verify(pdf, [text])
    stem = source.stem
    review = ROOT / f"reviews/{stem}.md"
    outline = ROOT / f"outlines/{stem}.md"
    commit = run("git", "log", "-1", "--format=%H", "--", str(source)).strip()
    for file in (source, pdf, review, outline):
        relative = file.relative_to(ROOT.parent)
        committed = subprocess.check_output(["git", "show", f"{commit}:{relative}"], cwd=ROOT)
        if committed != file.read_bytes():
            raise ValueError(f"Working file differs from checkpoint commit: {relative}")
    progress = ROOT / "progress.json"
    data = json.loads(progress.read_text())
    prose = re.sub(r"^#+ .*$", "", text, flags=re.M)
    data["chapters"][f"{number:02d}"] = {
        "title": TITLES[number - 1],
        "words": len(re.findall(r"\b[\w]+(?:[’'-][\w]+)*\b", prose)),
        "status": "drafted",
        "review_status": "editorial review recorded; founder review pending",
        "pdf": str(pdf.relative_to(ROOT)),
        "commit": commit,
    }
    progress.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status")
    commands.add_parser("book")
    for name in ("chapter", "checkpoint"):
        commands.add_parser(name).add_argument("number", type=int, choices=range(1, 15))
    args = parser.parse_args()
    if args.command == "status":
        print((ROOT / "progress.json").read_text(), end="")
    elif args.command == "book":
        book()
    elif args.command == "chapter":
        chapter(args.number)
    else:
        checkpoint(args.number)


if __name__ == "__main__":
    main()

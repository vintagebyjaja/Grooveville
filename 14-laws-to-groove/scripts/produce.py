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
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, NextPageTemplate, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
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
SECTIONS = ("Opening questions", "Understanding the Law", "The Reality Behind It", "Where We Go Wrong",
            "Applying the Law", "The Community Connection", "The Final Word", "Closing questions")
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
    sections = re.split(r"^## .+$", content, flags=re.M)[1:]
    for section in sections:
        if not section.strip():
            raise ValueError(f"Law {number:02d} has an empty section")
    opening, closing = [re.split(r"\n\s*\n", section.strip()) for section in (sections[0], sections[-1])]
    if not (len(opening) == len(closing) == 3 and len(set(opening + closing)) == 6
            and all(question.endswith("?") for question in opening + closing)):
        raise ValueError(f"Law {number:02d} must have three distinct opening and closing questions")


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


def flow(text, publisher=False, author_note=False):
    blocks = re.split(r"\n\s*\n", text.strip())
    if publisher:
        title, subtitle, *blocks = blocks
        mark = ROOT / "assets/publisher/grooveville-black.png"
        banner = Table([[
            [Paragraph(escape(title[2:]), style("PublisherTitle", "SerifBold", 20, 26, 4)),
             Paragraph(escape(subtitle[3:]), style("PublisherSubtitle", "SerifItalic", 11, 15))],
            Image(str(mark), width=52, height=52),
        ]], colWidths=[290, 58], style=TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Serif"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        yield banner
        yield Spacer(1, 7)
    for block in blocks:
        block = block.strip()
        if author_note and block.startswith("# "):
            yield Paragraph(escape(block[2:]), style("AuthorTitle", "SerifBold", 20, 24, 5))
        elif block.startswith("# "):
            yield Spacer(1, 24)
            yield Paragraph(escape(block[2:]), style("Chapter", "SerifBold", 22, 29, 19))
        elif block.startswith("## "):
            heading = block[3:]
            if heading in {"Opening questions", "Closing questions"}:
                yield Paragraph(escape(heading), style("Section", "SerifItalic", 10, 14, 5, 7))
            else:
                yield Paragraph(escape(heading), style("Section", "SerifBold", 12, 17, 7, 10))
        elif block.startswith("### "):
            yield Paragraph(escape(block[4:]), style("Section", "SerifBold", 11, 15, 6, 8))
        else:
            inline = escape(" ".join(block.splitlines()))
            inline = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", inline)
            inline = re.sub(r"\*(.+?)\*", r"<i>\1</i>", inline)
            yield Paragraph(inline, style("Body", "Serif", 10 if author_note else 10.5, 12.2 if author_note else 13.1 if publisher else 14.5, 2 if author_note else 4 if publisher else 6))


class ReviewDocument(BaseDocTemplate):
    def __init__(self, path, title, has_cover, digital=False, book_front=False):
        super().__init__(str(path), pagesize=PAGE, title=title, author="JABARI JAJA", creator="Grooveville LLC",
                         invariant=1, initialFontName="Serif")
        self.has_cover = has_cover
        self.digital = digital

        def frame(left, width=PAGE[0] - 106, bottom=49, top=55):
            return Frame(left, bottom, width, PAGE[1] - bottom - top, leftPadding=0,
                         rightPadding=0, topPadding=0, bottomPadding=0)

        covers = [PageTemplate("cover", [Frame(0, 0, *PAGE, leftPadding=0,
                  rightPadding=0, topPadding=0, bottomPadding=0)])] if has_cover else []
        front = [
            PageTemplate("publisher", [frame(42, 348)], onPage=self.furniture, autoNextPageTemplate="author"),
            PageTemplate("author", [frame(20, 374, bottom=40, top=43)], onPage=self.furniture, autoNextPageTemplate="right"),
        ] if book_front else []
        self.addPageTemplates(covers + front + [
            PageTemplate("right", [frame(59)], onPage=self.furniture, autoNextPageTemplate="left"),
            PageTemplate("left", [frame(47)], onPage=self.furniture, autoNextPageTemplate="right"),
        ])

    def furniture(self, pdf, doc):
        number = doc.page - self.has_cover
        right = bool(number % 2)
        if self.digital and number == 1:
            pdf.showOutline()
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
            if title not in {"THE 14 LAWS TO GROOVE", "Contents"}:
                key = re.sub(r"[^\w]+", "-", title).strip("-").lower()
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(title, key)
                self.notify("TOCEntry", (0, title, self.page - self.has_cover))


class LinedPage(Flowable):
    def __init__(self, title):
        super().__init__()
        self.title = title
        self.width = PAGE[0] - 106
        self.height = 538

    def draw(self):
        self.canv.setFont("SerifBold", 17)
        self.canv.setFillColor(INK)
        self.canv.drawString(0, self.height - 27, self.title)
        self.canv.setStrokeColor(colors.HexColor("#a99bab"))
        self.canv.setLineWidth(0.45)
        for y in range(18, self.height - 49, 22):
            self.canv.line(0, y, self.width, y)


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
    if WEB_ADDRESS.search(extracted) or WEB_ADDRESS.search("\n".join(texts)):
        raise ValueError("A web address or DOI appears in a print edition")
    cleaned = "\n".join(
        re.sub(r"^THE 14 LAWS TO GROOVE\n[0-9]+\n", "", page)
        for page in extracted.split("\f")
    )
    remaining = "".join(tokens(cleaned))
    for text in texts:
        expected = "".join(tokens(text))
        start = remaining.find(expected)
        if start < 0:
            raise ValueError(f"PDF text mismatch near {text[:70]!r}")
        remaining = remaining[start + len(expected):]


CHAPTER_PAGES = (9, 9, 9, 9, 9, 8, 12, 9, 9, 9, 9, 9, 9, 9)
INTERIOR_PAGES = 162
WEB_ADDRESS = re.compile(
    r"https?://|www\.|\bdoi\s*:|\b10\.\d{4,9}/|"
    r"\b[\w-]+\.(?:com|org|gov|edu|net)\b", re.I,
)


def verify_print_layout(pdf, expected_pages, writing_pages, has_cover=False):
    """Check numbered interior pages and their exclusive writing-page locations."""
    info = run("pdfinfo", str(pdf))
    physical_pages = int(re.search(r"^Pages:\s+(\d+)$", info, re.M)[1])
    if physical_pages != expected_pages + int(has_cover):
        raise ValueError(f"Expected {expected_pages} numbered interior pages, got {physical_pages - int(has_cover)}")
    raw = run("pdftotext", "-raw", str(pdf), "-")
    pages = raw.split("\f")[:physical_pages]
    interior = pages[int(has_cover):]
    writing_titles = re.compile(r"Law \d{2} Reflection|Journal")
    for number, page in enumerate(interior, 1):
        lines = page.strip().splitlines()
        if lines[:2] != ["THE 14 LAWS TO GROOVE", str(number)]:
            raise ValueError(f"Interior page {number} has incorrect numbering")
        body = lines[2:]
        if number in writing_pages:
            if body != [writing_pages[number]]:
                raise ValueError(f"Interior writing page {number} contains unexpected content")
        elif not body or writing_titles.fullmatch(body[0]):
            raise ValueError(f"Unexpected blank or writing page at interior page {number}")


def book_writing_pages():
    writing_pages = {}
    end = 3 + 6
    for number, length in enumerate(CHAPTER_PAGES, 1):
        end += length
        writing_pages[end] = f"Law {number:02d} Reflection"
    return writing_pages | {n: "Journal" for n in range(INTERIOR_PAGES - 19, INTERIOR_PAGES + 1)}


def build(path, texts, title, toc=False, cover=None, journal_pages=0, reflections=False,
          expected_pages=None, writing_pages=None, digital=False):
    register_fonts()
    story = []
    if cover:
        story.extend([Image(str(cover), width=PAGE[0], height=PAGE[1], kind="proportional"),
                      NextPageTemplate("right"), PageBreak()])
    for index, text in enumerate(texts):
        publisher = text.startswith("# GROOVEVILLE LLC\n")
        if index:
            if toc and index <= 2:
                story.append(NextPageTemplate("author" if index == 1 else "right"))
            story.append(PageBreak())
        if toc and index == 2:
            story.extend(flow("# Contents"))
            contents = TableOfContents()
            contents.levelStyles = [style("Entry", "Serif", 10, 17, 3)]
            contents.tableStyle.add("FONTNAME", (0, 0), (-1, -1), "Serif")
            story.extend([contents, NextPageTemplate("right"), PageBreak()])
        story.extend(flow(text, publisher=publisher, author_note=text.startswith("# A Word from the Author\n")))
        chapter_match = re.match(r"# LAW (\d{2}) —", text)
        if reflections and chapter_match:
            story.extend([PageBreak(), LinedPage(f"Law {chapter_match[1]} Reflection")])
    for _ in range(journal_pages):
        story.extend([PageBreak(), LinedPage("Journal")])
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=path.parent) as folder:
        candidate = Path(folder) / path.name
        doc = ReviewDocument(candidate, title, bool(cover), digital=digital, book_front=toc)
        doc.multiBuild(story)
        verify(candidate, texts)
        if expected_pages is not None:
            verify_print_layout(candidate, expected_pages, writing_pages, bool(cover))
        candidate.replace(path)
    print(path.relative_to(ROOT))


def chapter(number):
    source, pdf = chapter_paths(number)
    text = source.read_text()
    validate_source(number, text)
    length = CHAPTER_PAGES[number - 1]
    build(pdf, [text], f"Law {number:02d} — {TITLES[number - 1]}", reflections=True,
          expected_pages=length, writing_pages={length: f"Law {number:02d} Reflection"})


def book():
    front = ROOT / "book/front-matter"
    back = ROOT / "book/back-matter"
    texts = [(front / name).read_text() for name in
             ("publisher.md", "author.md", "introduction.md")]
    for number in range(1, 15):
        source, pdf = chapter_paths(number)
        text = source.read_text()
        validate_source(number, text)
        verify(pdf, [text])
        texts.append(text)
    texts.append((back / "conclusion.md").read_text())
    folder = ROOT / "exports/complete-book"
    for edition in ("Print", "Digital"):
        build(folder / f"The_14_Laws_to_Groove_FINAL_{edition}.pdf", texts,
              "THE 14 LAWS TO GROOVE: Lessons for a Stronger Tomorrow", toc=True,
              journal_pages=20, reflections=True, expected_pages=INTERIOR_PAGES,
              writing_pages=book_writing_pages(), digital=edition == "Digital")


def guide():
    source = ROOT / "guide/educator-community-discussion-guide.md"
    texts = re.split(r"\n(?=# LAW \d{2} — )", source.read_text())
    expected = [f"# LAW {i:02d} — {title}" for i, title in enumerate(TITLES, 1)]
    if [text.splitlines()[0] for text in texts[1:]] != expected:
        raise ValueError("Educator guide chapters are missing or out of order")
    build(ROOT / "exports/complete-book/the-14-laws-to-groove-educator-guide.pdf",
          texts, "The 14 Laws to Groove — Educator & Community Discussion Guide")


def checkpoint(number):
    source, pdf = chapter_paths(number)
    text = source.read_text()
    validate_source(number, text)
    verify(pdf, [text])
    stem = source.stem
    review = ROOT / f"reviews/{stem}.md"
    outline = ROOT / f"outlines/{stem}.md"
    files = (source, pdf, review, outline)
    commit = run("git", "log", "-1", "--format=%H", "--", *(str(file) for file in files)).strip()
    for file in files:
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
    commands.add_parser("guide")
    for name in ("chapter", "checkpoint"):
        commands.add_parser(name).add_argument("number", type=int, choices=range(1, 15))
    args = parser.parse_args()
    if args.command == "status":
        print((ROOT / "progress.json").read_text(), end="")
    elif args.command == "book":
        book()
    elif args.command == "guide":
        guide()
    elif args.command == "chapter":
        chapter(args.number)
    else:
        checkpoint(args.number)


if __name__ == "__main__":
    main()

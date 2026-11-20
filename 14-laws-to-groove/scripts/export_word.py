"""Export an editable Word edition from the approved manuscript and sketch assets."""

import re

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

from produce import ROOT, TITLES, chapter_paths

EXPORT = ROOT / "exports/complete-book/The_14_Laws_to_Groove_Illustrated.docx"
FONT = "DejaVu Serif"
PURPLE = RGBColor.from_string("592260")
# Cached page numbers from the current Word layout. The PAGEREF fields can refresh after edits.
WORD_CHAPTER_STARTS = (9, 17, 25, 33, 41, 49, 56, 67, 75, 83, 91, 98, 106, 114)


def element(tag, **attributes):
    node = OxmlElement(f"w:{tag}")
    for name, value in attributes.items():
        node.set(qn(f"w:{name}"), str(value))
    return node


def inline(paragraph, text):
    for part in re.split(r"(\*\*[^*]+\*\*|\*[^*]+\*)", text):
        if part.startswith("**") and part.endswith("**"):
            paragraph.add_run(part[2:-2]).bold = True
        elif part.startswith("*") and part.endswith("*"):
            paragraph.add_run(part[1:-1]).italic = True
        elif part:
            paragraph.add_run(part)


def bookmark(paragraph, name, number):
    paragraph._p.insert(1, element("bookmarkStart", id=number, name=name))
    paragraph._p.append(element("bookmarkEnd", id=number))


def contents_link(document, name, label, page_number):
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(9)
    paragraph.paragraph_format.keep_with_next = False
    link = element("hyperlink", anchor=name)
    run = element("r")
    text = element("t")
    text.text = label
    run.append(text)
    link.append(run)
    paragraph._p.append(link)
    section = document.sections[0]
    text_width = section.page_width - section.left_margin - section.right_margin
    paragraph.paragraph_format.tab_stops.add_tab_stop(
        text_width, WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS,
    )
    paragraph.add_run().add_tab()
    field = element("fldSimple", instr=f"PAGEREF {name}")
    run = element("r")
    text = element("t")
    text.text = str(page_number)
    run.append(text)
    field.append(run)
    paragraph._p.append(field)


def image(document, path, width):
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.line_spacing = 1.0
    paragraph.add_run().add_picture(str(path), width=Inches(width))


def source(document, path, target=None, illustration=None, illustration_before=None, front=False):
    for index, block in enumerate(re.split(r"\n\s*\n", path.read_text().strip())):
        if illustration_before and block == illustration_before:
            image(document, illustration, 3.05)
        heading = re.match(r"^(#{1,3}) (.*)$", block)
        if heading:
            paragraph = document.add_heading(heading.group(2), len(heading.group(1)))
            if index == 0:
                paragraph.paragraph_format.page_break_before = True
                if target:
                    bookmark(paragraph, *target)
        else:
            inline(document.add_paragraph(style="Front Text" if front else "Normal"), " ".join(block.splitlines()))
    if illustration and not illustration_before:
        image(document, illustration, 3.05)


def configure(document):
    section = document.sections[0]
    section.page_width = Inches(6)
    section.page_height = Inches(9)
    section.left_margin = Inches(0.72)
    section.right_margin = Inches(0.72)
    section.top_margin = Inches(0.71)
    section.bottom_margin = Inches(0.70)
    section.header_distance = Inches(0.32)
    section.footer_distance = Inches(0.33)
    normal = document.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string("211824")
    normal.paragraph_format.line_spacing = Pt(14)
    normal.paragraph_format.space_after = Pt(6)
    for name, size in (("Heading 1", 21), ("Heading 2", 12), ("Heading 3", 11)):
        heading = document.styles[name]
        heading.font.name = FONT
        heading.font.size = Pt(size)
        heading.font.color.rgb = PURPLE
        heading.paragraph_format.space_after = Pt(6)
    styles = document.styles
    front = styles.add_style("Front Text", normal.type)
    front.base_style = normal
    front.font.size = Pt(10)
    front.paragraph_format.line_spacing = Pt(11.2)
    front.paragraph_format.left_indent = Inches(-0.18)
    front.paragraph_format.right_indent = Inches(-0.18)
    front.paragraph_format.space_after = Pt(1)
    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    label = header.add_run("THE 14 LAWS TO GROOVE")
    label.font.name, label.font.size, label.font.color.rgb = FONT, Pt(8), PURPLE
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer._p.append(element("fldSimple", instr="PAGE"))
    metadata = document.core_properties
    metadata.title = "The 14 Laws to Groove: Lessons for a Stronger Tomorrow"
    metadata.author = "Jabari Jaja"
    metadata.subject = "Grooveville LLC"


def export():
    document = Document()
    configure(document)
    front = ROOT / "book/front-matter"
    source(document, front / "publisher.md", front=True)
    document.paragraphs[0].paragraph_format.page_break_before = False
    image(document, ROOT / "assets/publisher/grooveville-black.png", 0.55)
    source(document, front / "author.md", front=True)

    document.add_heading("Contents", 1).paragraph_format.page_break_before = True
    contents_link(document, "Introduction", "Introduction", 4)
    for n, (title, start) in enumerate(zip(TITLES, WORD_CHAPTER_STARTS, strict=True), 1):
        contents_link(document, f"Law{n:02}", f"LAW {n:02} — {title}", start)
    contents_link(document, "Conclusion", "Conclusion", 122)
    source(document, front / "introduction.md", target=("Introduction", 0))

    for n in range(1, 15):
        chapter, _ = chapter_paths(n)
        sketch = ROOT / "assets/illustrations" / f"law-{n:02}.png"
        before = {1: "### Examine the Habit Before You Explain It", 6: "### Make the New Standard Easy to Recognize"}
        source(document, chapter, target=(f"Law{n:02}", n), illustration=sketch,
               illustration_before=before.get(n))

    source(document, ROOT / "book/back-matter/conclusion.md", target=("Conclusion", 15))
    document.save(EXPORT)


if __name__ == "__main__":
    export()

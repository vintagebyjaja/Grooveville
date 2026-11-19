# The 14 Laws to Groove

Lessons for a Stronger Tomorrow  
Jabari Jaja

This directory holds the manuscript and review editions. Review the print edition on the `migration` branch. The prior 87-page edition remains in Git history. Jabari Jaja has final editorial authority.
 Follow [the current editorial direction](EDITORIAL.md) when drafting or reviewing chapters.

## Production

Install ReportLab, the DejaVu fonts, and Poppler. Run the commands from this directory.

```sh
python scripts/produce.py status
python scripts/produce.py chapter 1
python scripts/produce.py book
python scripts/produce.py guide
```

Each law has a separate outline, Markdown manuscript, editorial review, and PDF. The chapter command checks the official title and six required sections, exports the PDF, verifies its physical dimensions and embedded fonts, and checks that its extracted prose matches the source. The book command requires all fourteen chapters and supporting material. It builds the table of contents, the interior review PDF, and a cover-inclusive PDF when the approved art is installed as `assets/cover/approved-cover.png`.

Commit the chapter source, outline, review and validated PDF together. Run `python scripts/produce.py checkpoint 1` after that commit, then commit the updated `progress.json`. The recorded hash identifies the chapter content commit. A Git commit cannot contain its own hash.

The approved cover is visible in the founder's brief. The exact image file is pending. Use the original supplied art when it becomes available.

## Review editions

The 6 × 9-inch main review PDF has exactly 162 numbered interior pages and includes one lined reflection page after every law and 20 lined journal pages after the references. The educator and community discussion guide is independently editable in `guide/` and has its own review PDF. Each chapter PDF also includes its reflection page.

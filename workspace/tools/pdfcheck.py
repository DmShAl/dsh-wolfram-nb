#!/usr/bin/env python
r"""Quick sanity check for a PDF produced by PDFConv.

Prints the page count, the text-layer stats (including Cyrillic), the first
lines of page 1, and optionally renders pages to PNG for a visual check.

Usage (Python is pinned to 3.14 by absolute path; no `py`/PATH lookup):
    C:\Tools\Scripts\Python314\python.exe tools\pdfcheck.py report.pdf
    C:\Tools\Scripts\Python314\python.exe tools\pdfcheck.py report.pdf --pages 1,3,5 --out _work
    C:\Tools\Scripts\Python314\python.exe tools\pdfcheck.py report.pdf --dpi 110 --text 400

Usually run through `tools\pdfcheck.cmd`, which uses the same interpreter.

Exit code 0 when the PDF opens and has a non-empty text layer, 2 otherwise.
With --strict-layout, layout warnings return 3 before the text-layer check.
"""

from __future__ import annotations

import argparse
import os
import sys


def cyrillic_count(text: str) -> int:
    return sum(1 for ch in text.lower() if "а" <= ch <= "я" or ch == "ё")


def layout_warnings(doc, pymupdf):
    """Cheap layout diagnostics: nearly empty pages, low body coverage, overflow, split tables.

    The body coverage excludes a bare page number in the footer. A wide horizontal
    rule at the bottom of one page and another at the top of the next is reported as
    a possible longtable continuation — the common LaTeX table split.
    """
    warnings = []
    body_boxes = []
    rules_by_page = []
    for number, page in enumerate(doc, 1):
        text = page.get_text().strip()
        images = page.get_images(full=True)
        if len(text) < 20 and not images:
            warnings.append(
                f"page {number}: almost empty (remove the empty appendix/float)")
            body_boxes.append(None)
            rules_by_page.append([])
            continue
        rects = []
        for block in page.get_text("blocks"):
            if len(block) < 5 or not str(block[4]).strip():
                continue
            label = str(block[4]).strip()
            # A bare page number in the footer is not body content.
            if block[1] > 0.90 * page.rect.height and label.isdigit():
                continue
            rects.append(pymupdf.Rect(block[:4]))
        for image in images:
            for rect in page.get_image_rects(image[0]):
                rects.append(rect)
                if (rect.x0 < page.rect.x0 - 1 or rect.y0 < page.rect.y0 - 1
                        or rect.x1 > page.rect.x1 + 1 or rect.y1 > page.rect.y1 + 1):
                    warnings.append(f"page {number}: image extends outside the page")
        if rects:
            box = rects[0]
            for rect in rects[1:]:
                box.include_rect(rect)
            body_boxes.append(box)
            coverage = box.height / page.rect.height if page.rect.height else 1.0
            if 1 < number < len(doc) and coverage < 0.40:
                warnings.append(
                    f"page {number}: body covers only {coverage:.0%} "
                    "(remove a sparse appendix or reduce the float)")
        else:
            body_boxes.append(None)
        rules = []
        for drawing in page.get_drawings():
            rect = drawing.get("rect")
            if rect is not None and rect.height < 2 and rect.width > 0.25 * page.rect.width:
                rules.append(rect)
        rules_by_page.append(rules)

    for index in range(len(doc) - 1):
        page = doc[index]
        next_page = doc[index + 1]
        bottom = any(rule.y0 > 0.78 * page.rect.height for rule in rules_by_page[index])
        top = any(rule.y0 < 0.22 * next_page.rect.height for rule in rules_by_page[index + 1])
        if bottom and top:
            warnings.append(
                f"pages {index + 1}/{index + 2}: possible table continuation "
                r"(try \newpage or \small before the table)")
    return warnings


def main() -> int:
    # Windows consoles default to a legacy code page; force UTF-8 so extracted
    # Russian text is readable instead of turning into mojibake.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    parser = argparse.ArgumentParser(description="Inspect a PDF: pages, text layer, page renders.")
    parser.add_argument("pdf", help="path to the PDF file")
    parser.add_argument("--pages", default="", help="comma-separated 1-based pages to render, e.g. 1,3,5")
    parser.add_argument("--out", default="", help="directory for rendered pages (default: next to the PDF)")
    parser.add_argument("--dpi", type=int, default=110, help="render resolution (default 110)")
    parser.add_argument("--text", type=int, default=300, help="characters of page 1 to print (default 300)")
    parser.add_argument("--strict-layout", action="store_true",
                        help="exit 3 when layout warnings are present")
    args = parser.parse_args()

    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf  # older installs
        except ImportError:
            print("pymupdf is not installed: pip install pymupdf", file=sys.stderr)
            return 2

    path = os.path.abspath(args.pdf)
    if not os.path.exists(path):
        print(f"no such file: {path}", file=sys.stderr)
        return 2

    doc = pymupdf.open(path)
    texts = [page.get_text() for page in doc]
    full = "".join(texts)
    print(f"file      : {path}")
    print(f"pages     : {doc.page_count}")
    print(f"size      : {os.path.getsize(path)} bytes")
    print(f"text chars: {len(full)}  (cyrillic: {cyrillic_count(full)})")
    print(f"images    : {sum(len(page.get_images(full=True)) for page in doc)}")

    first = texts[0].strip().replace("\n", " ") if texts else ""
    print(f"page 1    : {first[: args.text]}")

    wanted = [int(p) for p in args.pages.split(",") if p.strip().isdigit()]
    if wanted:
        out = os.path.abspath(args.out) if args.out else os.path.dirname(path)
        os.makedirs(out, exist_ok=True)
        for number in wanted:
            if not 1 <= number <= doc.page_count:
                print(f"skip page {number}: out of range", file=sys.stderr)
                continue
            pix = doc[number - 1].get_pixmap(dpi=args.dpi)
            target = os.path.join(out, f"page{number}.png")
            pix.save(target)
            print(f"rendered  : page {number} -> {target} ({pix.width}x{pix.height})")

    empty = [i + 1 for i, text in enumerate(texts) if text.strip() == ""]
    if empty:
        print(f"warning   : pages without a text layer: {empty}")

    layout = layout_warnings(doc, pymupdf)
    if layout:
        print("layout    : " + "; ".join(layout))
        if args.strict_layout:
            print("layout    : strict mode -> exit 3")
            return 3
    else:
        print("layout    : OK (no empty/short/overflow pages)")
    return 0 if full.strip() else 2


if __name__ == "__main__":
    raise SystemExit(main())

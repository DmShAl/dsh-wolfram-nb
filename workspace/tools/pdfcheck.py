#!/usr/bin/env python
"""Quick sanity check for a PDF produced by PDFConv.

Prints the page count, the text-layer stats (including Cyrillic), the first
lines of page 1, and optionally renders pages to PNG for a visual check.

Usage (Python is pinned to 3.14 by absolute path; no `py`/PATH lookup):
    C:\Tools\Scripts\Python314\python.exe tools\pdfcheck.py report.pdf
    C:\Tools\Scripts\Python314\python.exe tools\pdfcheck.py report.pdf --pages 1,3,5 --out _work
    C:\Tools\Scripts\Python314\python.exe tools\pdfcheck.py report.pdf --dpi 110 --text 400

Usually run through `tools\pdfcheck.cmd`, which uses the same interpreter.

Exit code 0 when the PDF opens and has a non-empty text layer, 2 otherwise.
"""

from __future__ import annotations

import argparse
import os
import sys


def cyrillic_count(text: str) -> int:
    return sum(1 for ch in text.lower() if "а" <= ch <= "я" or ch == "ё")


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
    return 0 if full.strip() else 2


if __name__ == "__main__":
    raise SystemExit(main())

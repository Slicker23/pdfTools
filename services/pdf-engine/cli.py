#!/usr/bin/env python3
"""CLI for PdfFlow PDF engine — extract and apply."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from extract import extract_document
from apply import apply_patch
from schema import Patch


def cmd_extract(args: argparse.Namespace) -> int:
    doc = extract_document(args.input, document_id=args.document_id)
    out = doc.to_json()
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    else:
        sys.stdout.write(out)
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    patch_raw = Path(args.patch).read_text(encoding="utf-8")
    patch = Patch.from_json(patch_raw)
    apply_patch(args.input, patch, args.output)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="PdfFlow PDF engine")
    sub = parser.add_subparsers(dest="command", required=True)

    p_extract = sub.add_parser("extract", help="PDF → JSON document model")
    p_extract.add_argument("input", help="Input PDF path")
    p_extract.add_argument("-o", "--output", help="Output JSON path (default stdout)")
    p_extract.add_argument("--document-id", help="Document id override")
    p_extract.set_defaults(func=cmd_extract)

    p_apply = sub.add_parser("apply", help="Apply patch JSON to PDF")
    p_apply.add_argument("input", help="Input PDF path")
    p_apply.add_argument("patch", help="Patch JSON path")
    p_apply.add_argument("output", help="Output PDF path")
    p_apply.set_defaults(func=cmd_apply)

    args = parser.parse_args()
    try:
        return args.func(args)
    except Exception as e:
        print(f"pdf-engine error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

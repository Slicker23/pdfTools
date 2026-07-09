"""Extract text blocks from PDF using pypdfium2 page objects."""
from __future__ import annotations

import ctypes
import re
import uuid
from dataclasses import dataclass
from typing import Optional

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from pypdfium2._helpers.pageobjects import PdfTextObj

from schema import BBox, Document, Font, Page, TextBlock, EDIT_MODEL_VERSION

GARBLED_OK = ".,;:!?'\"()[]{}-/\\&%@#*+=<>|~`^_$"


def looks_garbled(text: str) -> bool:
    if not text.strip():
        return False
    letters = weird = total = 0
    for c in text:
        if c.isspace():
            continue
        total += 1
        if c.isalnum():
            letters += 1
            continue
        if c in GARBLED_OK:
            continue
        weird += 1
    if total == 0:
        return False
    return weird / total > 0.15 or letters / total < 0.35


def _parse_font_name(raw: str) -> tuple[str, bool, bool]:
    lower = raw.lower()
    bold = bool(re.search(r"bold|black|heavy|semibold|demi", lower)) or "bold" in lower
    italic = bool(re.search(r"italic|oblique|ita", lower))
    name = raw
    if "+" in name:
        name = name.split("+", 1)[1]
    name = re.sub(r",?(Bold|Italic|Regular|MT)$", "", name, flags=re.I).strip()
    if not name:
        name = "Helvetica"
    return name, bold, italic


@dataclass
class CharSpan:
    text: str
    x: float
    y: float
    w: float
    h: float
    baseline: float
    font_size: float
    font_key: str
    font_name: str
    bold: bool
    italic: bool
    color: str


def _fill_color_hex(obj: PdfTextObj) -> str:
    """Read text fill color via PDFium raw API; fallback to near-black."""
    try:
        r = ctypes.c_uint()
        g = ctypes.c_uint()
        b = ctypes.c_uint()
        a = ctypes.c_uint()
        ok = pdfium_c.FPDFPageObj_GetFillColor(obj.raw, r, g, b, a)
        if not ok:
            return "#111111"
        return f"#{r.value:02x}{g.value:02x}{b.value:02x}"
    except Exception:
        return "#111111"


def _spans_from_page(page: pdfium.PdfPage) -> list[CharSpan]:
    spans: list[CharSpan] = []
    textpage = page.get_textpage()
    try:
        for obj in page.get_objects(
            filter=[pdfium_c.FPDF_PAGEOBJ_TEXT], textpage=textpage
        ):
            if not isinstance(obj, PdfTextObj):
                continue
            try:
                text = obj.extract().strip()
            except Exception:
                continue
            if not text:
                continue
            left, bottom, right, top = obj.get_bounds()
            w = max(right - left, 0.5)
            h = max(top - bottom, 0.5)
            try:
                font_size = float(obj.get_font_size() or h)
            except Exception:
                font_size = h
            try:
                pdf_font = obj.get_font()
                font_key = pdf_font.get_base_name() or pdf_font.get_family_name() or "Helvetica"
                font_name = font_key
                weight = pdf_font.get_weight()
                bold = weight >= 600
            except Exception:
                font_key = "Helvetica"
                font_name = "Helvetica"
                bold = False
            fname, name_bold, italic = _parse_font_name(font_name)
            bold = bold or name_bold
            color = _fill_color_hex(obj)
            spans.append(
                CharSpan(
                    text=text,
                    x=left,
                    y=bottom,
                    w=w,
                    h=h,
                    baseline=bottom,
                    font_size=font_size,
                    font_key=font_key,
                    font_name=fname,
                    bold=bold,
                    italic=italic,
                    color=color,
                )
            )
    finally:
        textpage.close()
    return spans


def _group_by_baseline(spans: list[CharSpan]) -> list[list[CharSpan]]:
    sorted_spans = sorted(spans, key=lambda s: (-s.baseline, s.x))
    lines: list[list[CharSpan]] = []
    for span in sorted_spans:
        placed = False
        for line in lines:
            ref = line[0]
            tol = max(span.font_size, ref.font_size) * 0.35
            if abs(span.baseline - ref.baseline) <= tol:
                line.append(span)
                placed = True
                break
        if not placed:
            lines.append([span])
    return lines


def _styles_match(a: CharSpan, b: CharSpan) -> bool:
    return (
        a.font_key == b.font_key
        and abs(a.font_size - b.font_size) < 0.25
        and a.italic == b.italic
        and a.bold == b.bold
    )


def _merge_spans(spans: list[CharSpan]) -> tuple[str, BBox, Font, float]:
    ordered = sorted(spans, key=lambda s: s.x)
    parts: list[str] = []
    for i, s in enumerate(ordered):
        if i > 0:
            prev = ordered[i - 1]
            gap = s.x - (prev.x + prev.w)
            if gap > 1 and not parts[-1].endswith(" ") and not s.text.startswith(" "):
                # Letter-spaced PDFs often emit one glyph per text object.
                letter_gap = (
                    len(prev.text.strip()) == 1
                    and len(s.text.strip()) == 1
                    and gap <= max(prev.font_size, s.font_size) * 0.45
                )
                word_gap = gap > max(prev.font_size, s.font_size) * 0.35
                if word_gap and not letter_gap:
                    parts.append(" ")
        parts.append(s.text)
    text = "".join(parts).strip()
    x0 = min(s.x for s in ordered)
    y0 = min(s.y for s in ordered)
    x1 = max(s.x + s.w for s in ordered)
    y1 = max(s.y + s.h for s in ordered)
    first = ordered[0]
    font = Font(
        name=first.font_name,
        size=first.font_size,
        bold=first.bold,
        italic=first.italic,
        color=first.color,
        embeddedFontRef=first.font_key,
    )
    bbox = BBox(px=x0, py=y0, pw=max(x1 - x0, 1), ph=max(y1 - y0, 1))
    baseline = first.baseline
    return text, bbox, font, baseline


def _split_line_at_column_gaps(spans: list[CharSpan]) -> list[list[CharSpan]]:
    ordered = sorted(spans, key=lambda s: s.x)
    if len(ordered) <= 1:
        return [ordered]

    runs: list[list[CharSpan]] = [[ordered[0]]]
    for s in ordered[1:]:
        prev = runs[-1][-1]
        gap = s.x - (prev.x + prev.w)
        height = max(prev.h, s.h)
        gap_max = max(height * 1.5, 24)
        if gap <= gap_max and _styles_match(prev, s):
            runs[-1].append(s)
        else:
            runs.append([s])
    return runs


def _should_use_bounded(spans: list[CharSpan], merged_text: str) -> bool:
    if len(spans) < 4 or len(merged_text) <= 20:
        return False
    single = sum(1 for s in spans if len(s.text.strip()) == 1)
    return single / len(spans) > 0.6


def _bounded_text(
    textpage: pdfium.PdfTextPage, spans: list[CharSpan]
) -> str | None:
    x0 = min(s.x for s in spans)
    y0 = min(s.y for s in spans)
    x1 = max(s.x + s.w for s in spans)
    y1 = max(s.y + s.h for s in spans)
    try:
        text = textpage.get_text_bounded(left=x0, bottom=y0, right=x1, top=y1)
        text = text.strip()
        if text and " " in text and not looks_garbled(text):
            return text
    except Exception:
        pass
    return None


def _merge_run_to_blocks(
    spans: list[CharSpan],
    page_num: int,
    textpage: pdfium.PdfTextPage | None = None,
) -> list[TextBlock]:
    if not spans:
        return []
    ordered = sorted(spans, key=lambda s: s.x)
    blocks: list[TextBlock] = []
    cur_group: list[CharSpan] = [ordered[0]]

    def flush(group: list[CharSpan]) -> None:
        if not group:
            return
        text, bbox, font, baseline = _merge_spans(group)
        if textpage and _should_use_bounded(group, text):
            bounded = _bounded_text(textpage, group)
            if bounded:
                text = bounded
        if not text or looks_garbled(text):
            return
        blocks.append(
            TextBlock(
                id=f"blk_{uuid.uuid4().hex[:12]}",
                page=page_num,
                text=text,
                bbox=bbox,
                font=font,
                lineCount=1,
                baselineY=baseline,
            )
        )

    for s in ordered[1:]:
        prev = cur_group[-1]
        gap = s.x - (prev.x + prev.w)
        max_gap = max(prev.font_size, s.font_size) * 0.75
        if _styles_match(prev, s) and gap <= max_gap:
            cur_group.append(s)
        else:
            flush(cur_group)
            cur_group = [s]
    flush(cur_group)
    return blocks


def extract_document(pdf_path: str, document_id: Optional[str] = None) -> Document:
    doc_id = document_id or f"doc_{uuid.uuid4().hex[:12]}"
    pdf = pdfium.PdfDocument(pdf_path)
    pages: list[Page] = []
    try:
        for page_index in range(len(pdf)):
            page = pdf[page_index]
            width, height = page.get_size()
            textpage = page.get_textpage()
            try:
                chars = _spans_from_page(page)
                blocks: list[TextBlock] = []
                for line in _group_by_baseline(chars):
                    for run in _split_line_at_column_gaps(line):
                        blocks.extend(
                            _merge_run_to_blocks(run, page_index + 1, textpage)
                        )
                pages.append(
                    Page(
                        number=page_index + 1,
                        width=float(width),
                        height=float(height),
                        blocks=blocks,
                    )
                )
            finally:
                textpage.close()
    finally:
        pdf.close()
    return Document(version=EDIT_MODEL_VERSION, documentId=doc_id, pages=pages)

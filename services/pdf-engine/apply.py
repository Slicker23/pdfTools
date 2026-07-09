"""Apply text block patches to PDF using pikepdf."""
from __future__ import annotations

from pathlib import Path
from statistics import median

import pikepdf
import pypdfium2 as pdfium
from pikepdf import Name, Pdf

from font_embed import ensure_dejavu, utf16_hex
from schema import BBox, BlockPatch, Patch

ENGINE_DIR = Path(__file__).resolve().parent
RENDER_DPI = 150


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    clean = hex_color.lstrip("#")
    if len(clean) == 3:
        clean = "".join(c * 2 for c in clean)
    r = int(clean[0:2], 16) / 255.0
    g = int(clean[2:4], 16) / 255.0
    b = int(clean[4:6], 16) / 255.0
    return r, g, b


def _rgb_to_pdf(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    return tuple(max(0.0, min(1.0, c)) for c in rgb)


def _escape_pdf_string(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", "")
    )


def _needs_unicode_font(text: str) -> bool:
    try:
        text.encode("latin-1")
        return False
    except UnicodeEncodeError:
        return True


def _whiteout_ops(bbox: BBox, bg_rgb: tuple[float, float, float], pad: float = 1.0) -> str:
    x = bbox.px - pad
    y = bbox.py - pad
    w = bbox.pw + pad * 2
    h = bbox.ph + pad * 2
    r, g, b = _rgb_to_pdf(bg_rgb)
    return f"q {r} {g} {b} rg {x} {y} {w} {h} re f Q\n"


def _helvetica_resource_name(bold: bool, italic: bool) -> str:
    if bold and italic:
        return "PdfFlowF1BI"
    if bold:
        return "PdfFlowF1B"
    if italic:
        return "PdfFlowF1I"
    return "PdfFlowF1"


def _text_ops(
    text: str,
    bbox: BBox,
    font_size: float,
    color: str,
    baseline_y: float | None,
    bold: bool = False,
    italic: bool = False,
    unicode_font: str | None = None,
) -> str:
    if not text.strip():
        return ""
    r, g, b = _hex_to_rgb(color)
    y = baseline_y if baseline_y is not None else bbox.py
    x = bbox.px

    if unicode_font:
        hex_text = utf16_hex(text)
        return (
            f"q BT /{unicode_font} {font_size} Tf {r} {g} {b} rg "
            f"1 0 0 1 {x} {y} Tm <{hex_text}> Tj ET Q\n"
        )

    escaped = _escape_pdf_string(text)
    font_name = _helvetica_resource_name(bold, italic)
    return (
        f"q BT /{font_name} {font_size} Tf {r} {g} {b} rg "
        f"1 0 0 1 {x} {y} Tm ({escaped}) Tj ET Q\n"
    )


def _ensure_helvetica_fonts(page: pikepdf.Page, pdf: Pdf) -> None:
    resources = page.obj.get("/Resources")
    if resources is None:
        resources = pikepdf.Dictionary()
        page.obj["/Resources"] = resources
    fonts = resources.get("/Font")
    if fonts is None:
        fonts = pikepdf.Dictionary()
        resources["/Font"] = fonts

    defs = {
        "/PdfFlowF1": Name("/Helvetica"),
        "/PdfFlowF1B": Name("/Helvetica-Bold"),
        "/PdfFlowF1I": Name("/Helvetica-Oblique"),
        "/PdfFlowF1BI": Name("/Helvetica-BoldOblique"),
    }
    for key, base in defs.items():
        if Name(key) not in fonts:
            fonts[Name(key)] = pdf.make_indirect(
                pikepdf.Dictionary(
                    Type=Name.Font,
                    Subtype=Name.Type1,
                    BaseFont=base,
                )
            )


def _append_stream(page: pikepdf.Page, pdf: Pdf, content: str) -> None:
    if not content:
        return
    stream = pdf.make_stream(content.encode("latin-1", errors="replace"))
    existing = page.obj.get("/Contents")
    if existing is None:
        page.obj["/Contents"] = stream
    elif isinstance(existing, pikepdf.Array):
        existing.append(stream)
    else:
        page.obj["/Contents"] = pikepdf.Array([existing, stream])


def _find_page_for_block(block: BlockPatch) -> int | None:
    if block.page is not None:
        return block.page - 1
    return 0


def _sample_bg_rgb(pdf_path: str, page_idx: int, bbox: BBox) -> tuple[float, float, float]:
    """Sample median background RGB under bbox via pypdfium2 page render."""
    fallback = (1.0, 1.0, 1.0)
    try:
        doc = pdfium.PdfDocument(pdf_path)
        try:
            if page_idx < 0 or page_idx >= len(doc):
                return fallback
            page = doc[page_idx]
            page_w, page_h = page.get_size()
            scale = RENDER_DPI / 72.0
            bitmap = page.render(scale=scale)
            pil = bitmap.to_pil()
            if pil.mode != "RGB":
                pil = pil.convert("RGB")

            x0 = int(bbox.px * scale)
            y0 = int((page_h - bbox.py - bbox.ph) * scale)
            x1 = int((bbox.px + bbox.pw) * scale)
            y1 = int((page_h - bbox.py) * scale)

            inset = max(2, int(min(bbox.pw, bbox.ph) * scale * 0.15))
            x0 = max(0, min(pil.width - 1, x0 + inset))
            y0 = max(0, min(pil.height - 1, y0 + inset))
            x1 = max(x0 + 1, min(pil.width, x1 - inset))
            y1 = max(y0 + 1, min(pil.height, y1 - inset))

            region = pil.crop((x0, y0, x1, y1))
            pixels = list(region.getdata())
            if not pixels:
                return fallback

            rs = [p[0] for p in pixels]
            gs = [p[1] for p in pixels]
            bs = [p[2] for p in pixels]
            return (
                median(rs) / 255.0,
                median(gs) / 255.0,
                median(bs) / 255.0,
            )
        finally:
            doc.close()
    except Exception:
        return fallback


def apply_patch(pdf_path: str, patch: Patch, output_path: str) -> None:
    if not patch.blocks:
        with Pdf.open(pdf_path) as pdf:
            pdf.save(output_path, linearize=True)
        return

    with Pdf.open(pdf_path) as pdf:
        pages_touched: set[int] = set()
        for block in patch.blocks:
            if not block.modified and not block.deleted:
                continue
            page_idx = _find_page_for_block(block)
            if page_idx is None or page_idx < 0 or page_idx >= len(pdf.pages):
                continue
            pages_touched.add(page_idx)

        for page_idx in pages_touched:
            _ensure_helvetica_fonts(pdf.pages[page_idx], pdf)

        for block in patch.blocks:
            if not block.modified and not block.deleted:
                continue
            page_idx = _find_page_for_block(block)
            if page_idx is None or page_idx < 0 or page_idx >= len(pdf.pages):
                continue
            page = pdf.pages[page_idx]
            bbox = block.bbox
            if bbox is None:
                continue

            bg_rgb = _sample_bg_rgb(pdf_path, page_idx, bbox)
            _append_stream(page, pdf, _whiteout_ops(bbox, bg_rgb))

            if block.deleted:
                continue

            text = block.text or ""
            font = block.font
            if font is None:
                continue

            unicode_font = None
            if _needs_unicode_font(text):
                unicode_font = ensure_dejavu(page, pdf, font.bold, font.italic)

            ops = _text_ops(
                text,
                bbox,
                font.size,
                font.color,
                block.baselineY,
                bold=font.bold,
                italic=font.italic,
                unicode_font=unicode_font,
            )
            _append_stream(page, pdf, ops)

        pdf.save(output_path, linearize=True)

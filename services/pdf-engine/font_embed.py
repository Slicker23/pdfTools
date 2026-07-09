"""Embed TrueType fonts for Unicode text in PDF content streams."""
from __future__ import annotations

from pathlib import Path

import pikepdf
from fontTools.ttLib import TTFont
from pikepdf import Array, Dictionary, Name, Pdf

ENGINE_DIR = Path(__file__).resolve().parent
FONTS_DIR = ENGINE_DIR / "fonts"

# Fallback when DejaVu not copied yet
NOTO_FALLBACK = ENGINE_DIR.parent.parent / "public" / "fonts" / "NotoSans-Regular.ttf"

DEJAVU_VARIANTS = {
    "regular": ("DejaVuSans.ttf", NOTO_FALLBACK),
    "bold": ("DejaVuSans-Bold.ttf", NOTO_FALLBACK),
    "italic": ("DejaVuSans-Oblique.ttf", NOTO_FALLBACK),
    "bold_italic": ("DejaVuSans-BoldOblique.ttf", NOTO_FALLBACK),
}

DEJAVU_RESOURCE = {
    "regular": "PdfFlowDV",
    "bold": "PdfFlowDVB",
    "italic": "PdfFlowDVI",
    "bold_italic": "PdfFlowDVBI",
}


def _resolve_font_path(variant: str) -> Path:
    filename, fallback = DEJAVU_VARIANTS[variant]
    path = FONTS_DIR / filename
    if path.is_file():
        return path
    if fallback.is_file():
        return fallback
    raise FileNotFoundError(
        f"Font not found: {path}. Run: bash scripts/setup-pdf-engine.sh"
    )


def _font_metrics(ttf_path: Path) -> tuple[list[int], int, int, int]:
    font = TTFont(ttf_path)
    head = font["head"]
    os2 = font.get("OS/2")
    bbox = [head.xMin, head.yMin, head.xMax, head.yMax]
    ascent = getattr(os2, "sTypoAscender", head.yMax) if os2 else head.yMax
    descent = getattr(os2, "sTypoDescender", head.yMin) if os2 else head.yMin
    cap = getattr(os2, "sCapHeight", ascent) if os2 else ascent
    return bbox, int(ascent), int(descent), int(cap)


def _tounicode_stream() -> bytes:
    return b"""\
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
"""


def embed_type0_font(pdf: Pdf, ttf_path: Path, base_name: str) -> pikepdf.Object:
    font_bytes = ttf_path.read_bytes()
    bbox, ascent, descent, cap = _font_metrics(ttf_path)

    font_file = pdf.make_stream(font_bytes)
    font_file[Name.Type] = Name.FontFile2

    descriptor = Dictionary(
        Type=Name.FontDescriptor,
        FontName=Name(f"/{base_name}"),
        Flags=32,
        FontBBox=bbox,
        ItalicAngle=0,
        Ascent=ascent,
        Descent=descent,
        CapHeight=cap,
        StemV=80,
        FontFile2=font_file,
    )

    cid_font = Dictionary(
        Type=Name.Font,
        Subtype=Name.CIDFontType2,
        BaseFont=Name(f"/{base_name}"),
        CIDToGIDMap=Name.Identity,
        DW=1000,
        FontDescriptor=pdf.make_indirect(descriptor),
    )

    type0 = Dictionary(
        Type=Name.Font,
        Subtype=Name.Type0,
        BaseFont=Name(f"/{base_name}"),
        Encoding=Name.Identity_H,
        DescendantFonts=Array([pdf.make_indirect(cid_font)]),
        ToUnicode=pdf.make_stream(_tounicode_stream()),
    )

    return pdf.make_indirect(type0)


def variant_key(bold: bool, italic: bool) -> str:
    if bold and italic:
        return "bold_italic"
    if bold:
        return "bold"
    if italic:
        return "italic"
    return "regular"


def ensure_dejavu(page: pikepdf.Page, pdf: Pdf, bold: bool, italic: bool) -> str:
    """Register DejaVu Type0 font on page; return PDF resource name."""
    key = variant_key(bold, italic)
    resource = DEJAVU_RESOURCE[key]

    resources = page.obj.get("/Resources")
    if resources is None:
        resources = Dictionary()
        page.obj["/Resources"] = resources
    fonts = resources.get("/Font")
    if fonts is None:
        fonts = Dictionary()
        resources["/Font"] = fonts

    if Name(f"/{resource}") not in fonts:
        ttf_path = _resolve_font_path(key)
        base_name = resource  # e.g. PdfFlowDV
        fonts[Name(f"/{resource}")] = embed_type0_font(pdf, ttf_path, base_name)

    return resource


def utf16_hex(text: str) -> str:
    encoded = text.encode("utf-16-be")
    return "FEFF" + encoded.hex().upper()

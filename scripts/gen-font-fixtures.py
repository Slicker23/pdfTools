#!/usr/bin/env python3
"""Byte-exact fixtures for M4 (font metrics + encoding -> advances & Unicode).

Deterministic because base-14 AFM widths are fixed and known:

  font-widths.pdf          Helvetica "AV" at 100pt; per-glyph advance + rightEdge.
  font-winansi.pdf         WinAnsiEncoding accented codes; assert Unicode.
  font-differences.pdf     /Encoding /Differences remap; assert Unicode.
  font-tounicode.pdf       /ToUnicode overrides encoding; assert Unicode.
  font-embedded-widths.pdf /Widths + /FirstChar override base-14 AFM.
  font-type0-identity.pdf  Type0 Identity-H + CIDFontType2 /W + /ToUnicode.
  font-tj-kern.pdf         TJ kerning adjustment; cumulative advance.

Content streams are unfiltered so interpreter output is exact and reproducible.
"""
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures")


class Builder:
    def __init__(self) -> None:
        self.buf = bytearray()
        self.offsets: dict[int, int] = {}

    def emit(self, b) -> None:
        self.buf.extend(b.encode("latin-1") if isinstance(b, str) else b)

    def obj(self, n: int, body) -> None:
        self.offsets[n] = len(self.buf)
        self.emit(f"{n} 0 obj\n")
        self.emit(body)
        self.emit("\nendobj\n")

    def stream_obj(self, n: int, content: bytes, extra: str = "") -> None:
        self.obj(
            n,
            b"<< /Length %d%s >>\nstream\n" % (len(content), extra.encode("latin-1"))
            + content
            + b"\nendstream",
        )

    def classic_xref(self, size: int, root: int = 1) -> None:
        pos = len(self.buf)
        self.emit("xref\n")
        self.emit(f"0 {size}\n")
        self.emit("0000000000 65535 f \n")
        for n in range(1, size):
            self.emit(f"{self.offsets.get(n, 0):010d} 00000 n \n")
        self.emit(f"trailer\n<< /Size {size} /Root {root} 0 R >>\n")
        self.emit(f"startxref\n{pos}\n%%EOF\n")

    def header(self) -> None:
        self.emit("%PDF-1.7\n")
        self.emit(b"%\xe2\xe3\xcf\xd3\n")


def base_page(b: Builder, resources: str, content: bytes) -> None:
    """objs 1-4: catalog, pages, page, content. Caller adds font objs from 5."""
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(
        3,
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 1000] "
        f"/Resources {resources} /Contents 4 0 R >>",
    )
    b.stream_obj(4, content)


def build_font_widths() -> bytes:
    b = Builder()
    b.header()
    base_page(b, "<< /Font << /F1 5 0 R >> >>", b"BT /F1 100 Tf 50 700 Td (AV) Tj ET\n")
    b.obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(6)
    return bytes(b.buf)


def build_font_winansi() -> bytes:
    b = Builder()
    b.header()
    # Codes 0xE9 (eacute), 0xFC (udieresis), 0xF1 (ntilde) under WinAnsiEncoding.
    base_page(
        b,
        "<< /Font << /F1 5 0 R >> >>",
        b"BT /F1 12 Tf 50 700 Td <E9FCF1> Tj ET\n",
    )
    b.obj(
        5,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
        "/Encoding /WinAnsiEncoding >>",
    )
    b.classic_xref(6)
    return bytes(b.buf)


def build_font_differences() -> bytes:
    b = Builder()
    b.header()
    # Remap code 65 ('A') to glyph "eacute" via /Differences.
    base_page(b, "<< /Font << /F1 5 0 R >> >>", b"BT /F1 12 Tf 50 700 Td (A) Tj ET\n")
    b.obj(
        5,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding 6 0 R >>",
    )
    b.obj(
        6,
        "<< /Type /Encoding /BaseEncoding /WinAnsiEncoding "
        "/Differences [65 /eacute] >>",
    )
    b.classic_xref(7)
    return bytes(b.buf)


def build_font_tounicode() -> bytes:
    b = Builder()
    b.header()
    # Encoding says code 65 = 'A', but ToUnicode remaps it to U+00E9 (should win).
    base_page(b, "<< /Font << /F1 5 0 R >> >>", b"BT /F1 12 Tf 50 700 Td (A) Tj ET\n")
    b.obj(
        5,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
        "/Encoding /WinAnsiEncoding /ToUnicode 6 0 R >>",
    )
    cmap = (
        b"/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n"
        b"1 begincodespacerange <00> <ff> endcodespacerange\n"
        b"1 beginbfchar <41> <00E9> endbfchar\n"
        b"endcmap end end\n"
    )
    b.stream_obj(6, cmap)
    b.classic_xref(7)
    return bytes(b.buf)


def build_font_embedded_widths() -> bytes:
    b = Builder()
    b.header()
    # Explicit /Widths (A = 1000) must override Helvetica's AFM width (667).
    base_page(b, "<< /Font << /F1 5 0 R >> >>", b"BT /F1 100 Tf 50 700 Td (A) Tj ET\n")
    b.obj(
        5,
        "<< /Type /Font /Subtype /TrueType /BaseFont /Helvetica "
        "/Encoding /WinAnsiEncoding /FirstChar 65 /LastChar 65 /Widths [1000] >>",
    )
    b.classic_xref(6)
    return bytes(b.buf)


def build_font_type0_identity() -> bytes:
    b = Builder()
    b.header()
    # Two 2-byte codes 0x0001, 0x0002 -> CID 1, CID 2 (Identity-H).
    base_page(
        b,
        "<< /Font << /F1 5 0 R >> >>",
        b"BT /F1 100 Tf 50 700 Td <00010002> Tj ET\n",
    )
    b.obj(
        5,
        "<< /Type /Font /Subtype /Type0 /BaseFont /Custom /Encoding /Identity-H "
        "/DescendantFonts [6 0 R] /ToUnicode 8 0 R >>",
    )
    b.obj(
        6,
        "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Custom "
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> "
        "/FontDescriptor 7 0 R /CIDToGIDMap /Identity /DW 1000 /W [1 [500 600]] >>",
    )
    b.obj(
        7,
        "<< /Type /FontDescriptor /FontName /Custom /Flags 4 "
        "/FontBBox [0 -200 1000 800] /Ascent 800 /Descent -200 "
        "/ItalicAngle 0 /StemV 80 /CapHeight 700 >>",
    )
    cmap = (
        b"/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n"
        b"1 begincodespacerange <0000> <ffff> endcodespacerange\n"
        b"2 beginbfchar <0001> <0048> <0002> <0069> endbfchar\n"
        b"endcmap end end\n"
    )
    b.stream_obj(8, cmap)
    b.classic_xref(9)
    return bytes(b.buf)


def build_font_tj_kern() -> bytes:
    b = Builder()
    b.header()
    # TJ: (A) then +120 (moves left 12) then (V). Cumulative advance = 66.7-12+66.7.
    base_page(
        b,
        "<< /Font << /F1 5 0 R >> >>",
        b"BT /F1 100 Tf 50 700 Td [(A) 120 (V)] TJ ET\n",
    )
    b.obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(6)
    return bytes(b.buf)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    fixtures = (
        ("font-widths.pdf", build_font_widths()),
        ("font-winansi.pdf", build_font_winansi()),
        ("font-differences.pdf", build_font_differences()),
        ("font-tounicode.pdf", build_font_tounicode()),
        ("font-embedded-widths.pdf", build_font_embedded_widths()),
        ("font-type0-identity.pdf", build_font_type0_identity()),
        ("font-tj-kern.pdf", build_font_tj_kern()),
    )
    for name, data in fixtures:
        with open(os.path.join(OUT_DIR, name), "wb") as f:
            f.write(data)
        print(f"wrote {name} ({len(data)} bytes)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Byte-exact stress fixtures for the M0-M3 integration audit.

These exercise edge cases the pikepdf/ghostscript corpus does not:

  audit-rotate.pdf      Rotated+translated cm combined with a text show. Exposes
                        any text-matrix composition (transpose) bug. Expected
                        origin (300,100), matrix [0 20 -20 0 300 100].
  audit-mediabox.pdf    Non-zero MediaBox origin [50 60 450 860]. Text at content
                        (100,700). Reveals default-user-space vs page-space
                        (MediaBox-lower-left) offset against pdfium.
  audit-nestedform.pdf  Page -> Fm1 (/Matrix +10,+10) -> Fm2 (/Matrix +20,+20)
                        -> text at (0,0). Expected origin (30,30). Tests nested
                        Form recursion, per-form resources, font resolution.
  audit-cycle.pdf       Fm1 references itself (/Fm1 Do) then shows (C) at (20,20).
                        Must terminate (visited guard) and emit exactly one span.

All content streams are unfiltered so geometry is exact.
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


def build_rotate() -> bytes:
    b = Builder()
    b.header()
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] "
             "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>")
    b.stream_obj(4, b"q 0 1 -1 0 300 100 cm BT /F1 20 Tf 0 0 Td (R) Tj ET Q\n")
    b.obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(6)
    return bytes(b.buf)


def build_mediabox() -> bytes:
    b = Builder()
    b.header()
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [50 60 450 860] "
             "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>")
    b.stream_obj(4, b"BT /F1 20 Tf 100 700 Td (M) Tj ET\n")
    b.obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(6)
    return bytes(b.buf)


def build_nestedform() -> bytes:
    b = Builder()
    b.header()
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] "
             "/Resources << /XObject << /Fm1 5 0 R >> >> /Contents 4 0 R >>")
    b.stream_obj(4, b"/Fm1 Do\n")
    fm1 = b"/Fm2 Do\n"
    b.obj(
        5,
        b"<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 400 400] "
        b"/Matrix [1 0 0 1 10 10] /Resources << /XObject << /Fm2 6 0 R >> >> "
        b"/Length %d >>\nstream\n" % len(fm1) + fm1 + b"\nendstream",
    )
    fm2 = b"BT /F1 10 Tf 0 0 Td (N) Tj ET\n"
    b.obj(
        6,
        b"<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 400 400] "
        b"/Matrix [1 0 0 1 20 20] /Resources << /Font << /F1 7 0 R >> >> "
        b"/Length %d >>\nstream\n" % len(fm2) + fm2 + b"\nendstream",
    )
    b.obj(7, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(8)
    return bytes(b.buf)


def build_cycle() -> bytes:
    b = Builder()
    b.header()
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] "
             "/Resources << /XObject << /Fm1 5 0 R >> >> /Contents 4 0 R >>")
    b.stream_obj(4, b"/Fm1 Do\n")
    fm1 = b"/Fm1 Do BT /F1 10 Tf 20 20 Td (C) Tj ET\n"
    b.obj(
        5,
        b"<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 200 200] "
        b"/Matrix [1 0 0 1 0 0] "
        b"/Resources << /XObject << /Fm1 5 0 R >> /Font << /F1 6 0 R >> >> "
        b"/Length %d >>\nstream\n" % len(fm1) + fm1 + b"\nendstream",
    )
    b.obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(7)
    return bytes(b.buf)


def build_corrupt() -> bytes:
    """Undecodable Flate streams must degrade to empty, never throw.

    Page 1: /Contents declares /FlateDecode but holds garbage -> pageSpans []
    Page 2: valid content shows (OK) and invokes a corrupt Form XObject -> the
            page text still comes through; the bad form degrades to empty.
    """
    b = Builder()
    b.header()
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] "
             "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>")
    b.stream_obj(4, b"this is not a valid deflate stream", extra=" /Filter /FlateDecode")
    b.obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.obj(6, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] "
             "/Resources << /Font << /F1 5 0 R >> /XObject << /Fm1 8 0 R >> >> "
             "/Contents 7 0 R >>")
    b.stream_obj(7, b"BT /F1 12 Tf 50 250 Td (OK) Tj ET\n/Fm1 Do\n")
    b.obj(
        8,
        b"<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 300 300] "
        b"/Filter /FlateDecode /Length 22 >>\nstream\n"
        + b"still not deflate data"
        + b"\nendstream",
    )
    b.classic_xref(9)
    return bytes(b.buf)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, data in (
        ("audit-rotate.pdf", build_rotate()),
        ("audit-mediabox.pdf", build_mediabox()),
        ("audit-nestedform.pdf", build_nestedform()),
        ("audit-cycle.pdf", build_cycle()),
        ("audit-corrupt.pdf", build_corrupt()),
    ):
        with open(os.path.join(OUT_DIR, name), "wb") as f:
            f.write(data)
        print(f"wrote {name} ({len(data)} bytes)")


if __name__ == "__main__":
    main()

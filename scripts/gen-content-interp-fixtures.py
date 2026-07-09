#!/usr/bin/env python3
"""Byte-exact fixtures for M3 (content-stream interpreter -> text spans).

  text-simple.pdf       One show at an absolute Td. Origin (100,700),
                        matrix [24 0 0 24 100 700].
  text-cm-tstar.pdf     A translating cm, then Td + T* (leading), width-free.
                        A at (50,650), B at (50,638).
  text-form-xobject.pdf Page invokes a Form XObject (/Matrix [1 0 0 1 30 40])
                        that shows text at Td 0 100. Origin (30,140).

Content streams are unfiltered so interpreter geometry is exact and
deterministic (no glyph widths needed - only explicit positioning is used).
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


def build_text_simple() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 800] "
             "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>")
    b.stream_obj(4, b"BT /F1 24 Tf 100 700 Td (Hi) Tj ET\n")
    b.obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(6)
    return bytes(b.buf)


def build_text_cm_tstar() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 800] "
             "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>")
    # cm translates the whole system by (50,50); Td 0 600 -> A at (50,650);
    # T* drops one leading (12) -> B at (50,638). No widths involved.
    b.stream_obj(
        4,
        b"q 1 0 0 1 50 50 cm BT /F1 10 Tf 12 TL 0 600 Td (A) Tj T* (B) Tj ET Q\n",
    )
    b.obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(6)
    return bytes(b.buf)


def build_text_form_xobject() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 800] "
             "/Resources << /XObject << /Fm1 5 0 R >> >> /Contents 4 0 R >>")
    b.stream_obj(4, b"/Fm1 Do\n")
    # Form XObject: /Matrix translates by (30,40); Td 0 100 -> origin (30,140).
    form = b"BT /F1 10 Tf 0 100 Td (X) Tj ET\n"
    b.obj(
        5,
        b"<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 400 800] "
        b"/Matrix [1 0 0 1 30 40] "
        b"/Resources << /Font << /F1 6 0 R >> >> /Length %d >>\nstream\n" % len(form)
        + form
        + b"\nendstream",
    )
    b.obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(7)
    return bytes(b.buf)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, data in (
        ("text-simple.pdf", build_text_simple()),
        ("text-cm-tstar.pdf", build_text_cm_tstar()),
        ("text-form-xobject.pdf", build_text_form_xobject()),
    ):
        with open(os.path.join(OUT_DIR, name), "wb") as f:
            f.write(data)
        print(f"wrote {name} ({len(data)} bytes)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Byte-exact fixtures for M2 (resources + content-stream access).

  content-array.pdf        A page whose /Contents is an array of two streams and
                           whose /Resources holds one /Font. Exercises content
                           concatenation and named resource lookup.
  inherited-resources.pdf  /Resources (with /Font /F1) live on an intermediate
                           /Pages node, not on the leaf page. Exercises resource
                           inheritance.

Content streams are left unfiltered so the expected decoded bytes are exact.
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


def build_content_array() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] "
             "/Resources << /Font << /F1 6 0 R >> >> /Contents [4 0 R 5 0 R] >>")
    b.stream_obj(4, b"BT /F1 12 Tf 72 720 Td (Hello) Tj ET\n")
    b.stream_obj(5, b"0 0 1 rg 10 10 100 100 re f\n")
    b.obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    b.classic_xref(7)
    return bytes(b.buf)


def build_inherited_resources() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    # /Resources sit on the intermediate /Pages node; the leaf page has none.
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 "
             "/Resources << /Font << /F1 5 0 R >> >> >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>")
    b.stream_obj(4, b"BT ET\n")
    b.obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>")
    b.classic_xref(6)
    return bytes(b.buf)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, data in (
        ("content-array.pdf", build_content_array()),
        ("inherited-resources.pdf", build_inherited_resources()),
    ):
        with open(os.path.join(OUT_DIR, name), "wb") as f:
            f.write(data)
        print(f"wrote {name} ({len(data)} bytes)")


if __name__ == "__main__":
    main()

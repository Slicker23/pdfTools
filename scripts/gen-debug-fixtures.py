#!/usr/bin/env python3
"""Byte-exact fixtures for the debug-mode structural audit.

  deep-pages.pdf     A linear chain of ~40k /Pages nodes (each an indirect
                     object referencing the next) ending in one leaf page.
                     Exercises walkPageTree recursion depth.
  cycle-pages.pdf    A page tree where an intermediate node's /Kids references
                     an ancestor (2 -> 3 -> 2) plus one real leaf. Must
                     terminate and still find the leaf.
  indirect-length.pdf  A content stream whose /Length is an indirect reference.
  xref-w0.pdf        An xref stream with /W [0 2 1] (type field width 0, so the
                     type defaults to 1 / in-use).
"""
import os
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures")
DEEP = 40000


def u16(v: int) -> bytes:
    return bytes([(v >> 8) & 0xFF, v & 0xFF])


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

    def classic_xref(self, size: int, root: int = 1) -> None:
        pos = len(self.buf)
        self.emit("xref\n")
        self.emit(f"0 {size}\n")
        self.emit("0000000000 65535 f \n")
        for n in range(1, size):
            off = self.offsets.get(n, 0)
            self.emit(f"{off:010d} 00000 n \n")
        self.emit(f"trailer\n<< /Size {size} /Root {root} 0 R >>\n")
        self.emit(f"startxref\n{pos}\n%%EOF\n")


def build_deep_pages() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    # Objects 2 .. DEEP+1 are intermediate Pages nodes; DEEP+2 is the leaf page.
    leaf = DEEP + 2
    for i in range(2, DEEP + 2):
        b.obj(i, f"<< /Type /Pages /Kids [{i + 1} 0 R] /Count 1 >>")
    b.obj(leaf, "<< /Type /Page /Parent %d 0 R /MediaBox [0 0 200 200] "
                "/Resources << >> >>" % (DEEP + 1))
    b.classic_xref(leaf + 1)
    return bytes(b.buf)


def build_cycle_pages() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Pages /Kids [2 0 R] /Count 1 >>")  # back-reference (cycle)
    b.obj(4, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 240] /Resources << >> >>")
    b.classic_xref(5)
    return bytes(b.buf)


def build_indirect_length() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] "
             "/Resources << >> /Contents 4 0 R >>")
    content = b"BT /F1 12 Tf (hi) Tj ET\n"
    b.obj(4, b"<< /Length 5 0 R >>\nstream\n" + content + b"\nendstream")
    b.obj(5, str(len(content)))  # indirect /Length value
    b.classic_xref(6)
    return bytes(b.buf)


def build_xref_w0() -> bytes:
    b = Builder()
    b.emit("%PDF-1.7\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] "
             "/Resources << >> /Contents 4 0 R >>")
    content = b"BT ET\n"
    b.obj(4, b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")

    off5 = len(b.buf)
    # W = [0 2 1]: no type field (defaults to in-use), 2-byte offset, 1-byte gen.
    data = bytearray()
    for n in (1, 2, 3, 4):
        data += u16(b.offsets[n]) + bytes([0])
    data += u16(off5) + bytes([0])  # obj 5 (self)
    xdata = zlib.compress(bytes(data))
    b.obj(5, b"<< /Type /XRef /Size 6 /W [0 2 1] /Index [1 5] "
             b"/Root 1 0 R /Filter /FlateDecode /Length %d >>\nstream\n" % len(xdata)
             + xdata + b"\nendstream")
    b.emit(f"startxref\n{off5}\n%%EOF\n")
    return bytes(b.buf)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, data in (
        ("deep-pages.pdf", build_deep_pages()),
        ("cycle-pages.pdf", build_cycle_pages()),
        ("indirect-length.pdf", build_indirect_length()),
        ("xref-w0.pdf", build_xref_w0()),
    ):
        with open(os.path.join(OUT_DIR, name), "wb") as f:
            f.write(data)
        print(f"wrote {name} ({len(data)} bytes)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Fixtures for M6 glyph outlines + text-to-path."""
import os
import struct

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures")
FONT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "fonts", "NotoSans-Regular.ttf")


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


def read_font_bbox(path: str) -> tuple[list[int], int, int]:
    with open(path, "rb") as f:
        data = f.read()
    # Minimal parse: find head table for unitsPerEm and bbox via fontTools-free scan
    num_tables = struct.unpack(">H", data[4:6])[0]
    head_off = None
    pos = 12
    for _ in range(num_tables):
        tag = data[pos : pos + 4].decode("ascii")
        off = struct.unpack(">I", data[pos + 8 : pos + 12])[0]
        if tag == "head":
            head_off = off
        pos += 16
    if head_off is None:
        return [0, -200, 1000, 900], 800, -200
    x0, y0, x1, y1 = struct.unpack(">hhhh", data[head_off + 36 : head_off + 44])
    ascent = y1
    descent = y0
    return [x0, y0, x1, y1], ascent, descent


def build_embedded_truetype() -> bytes:
    with open(FONT_PATH, "rb") as f:
        font_bytes = f.read()
    bbox, ascent, descent = read_font_bbox(FONT_PATH)

    b = Builder()
    b.header()
    content = b"BT /F1 24 Tf 1 0 0 1 50 700 Tm (Hi) Tj ET\n"
    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(
        3,
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    )
    b.stream_obj(4, content)
    b.obj(
        5,
        "<< /Type /Font /Subtype /TrueType /BaseFont /NotoSans "
        "/Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 "
        "/Widths [500] /FontDescriptor 6 0 R >>",
    )
    b.obj(
        6,
        "<< /Type /FontDescriptor /FontName /NotoSans /Flags 32 "
        f"/FontBBox {bbox} /Ascent {ascent} /Descent {descent} "
        "/ItalicAngle 0 /StemV 80 /CapHeight 700 /FontFile2 7 0 R >>",
    )
    b.stream_obj(7, font_bytes, " /Length1 %d" % len(font_bytes))
    b.classic_xref(8)
    return bytes(b.buf)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.isfile(FONT_PATH):
        print(f"skip: font not found at {FONT_PATH}")
        return
    data = build_embedded_truetype()
    out = os.path.join(OUT_DIR, "font-outline-ttf.pdf")
    with open(out, "wb") as f:
        f.write(data)
    print(f"wrote font-outline-ttf.pdf ({len(data)} bytes)")


if __name__ == "__main__":
    main()

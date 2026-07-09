#!/usr/bin/env python3
"""Generate byte-exact xref-variant fixtures that generators never emit.

Two shapes that exercise otherwise-untested branches of core/xref/build.ts:

  hybrid.pdf        A PDF-1.5 file with a classic xref *table* whose trailer
                    carries /XRefStm pointing at a compressed xref *stream*.
                    The single page (obj 3) lives compressed inside an ObjStm,
                    reachable only via the xref stream's type-2 entry. This is
                    the "hybrid reference" layout produced for backward compat.

  prev-crosstype.pdf  A base section using an xref *stream* for its cross
                    references, followed by an incremental update that uses a
                    classic xref *table* whose trailer /Prev points back at the
                    base xref stream. The increment redefines the page with a
                    larger MediaBox; newest-wins must be honoured across the
                    two different xref representations.

xref streams are zlib/Flate compressed (the parser always inflates them, which
matches real-world files).
"""
import os
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures")


def u16(v: int) -> bytes:
    return bytes([(v >> 8) & 0xFF, v & 0xFF])


class Builder:
    def __init__(self) -> None:
        self.buf = bytearray()
        self.offsets: dict[int, int] = {}

    def emit(self, b) -> None:
        self.buf.extend(b.encode("latin-1") if isinstance(b, str) else b)

    def obj_start(self, n: int) -> None:
        self.offsets[n] = len(self.buf)
        self.emit(f"{n} 0 obj\n")

    def obj(self, n: int, body) -> None:
        self.obj_start(n)
        self.emit(body)
        self.emit("\nendobj\n")

    @staticmethod
    def xref_line(off: int) -> str:
        return f"{off:010d} 00000 n \n"  # exactly 20 bytes


def build_hybrid() -> bytes:
    b = Builder()
    b.emit("%PDF-1.5\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")

    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    # Object 3 (the page) is a normal object, but the classic table below marks
    # it free; it is reachable only via the /XRefStm entry. This is exactly the
    # hybrid-reference contract: xref-stream entries override classic placeholders.
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 350] "
             "/Resources << >> /Contents 4 0 R >>")
    content = b"BT ET\n"
    b.obj(4, b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")

    # XRef stream (obj 5): provides the real entries for obj 3 and itself.
    off5 = len(b.buf)
    entry3 = bytes([0x01]) + u16(b.offsets[3]) + bytes([0x00])  # in-use at off3, gen 0
    entry5 = bytes([0x01]) + u16(off5) + bytes([0x00])          # in-use at off5, gen 0
    xdata = zlib.compress(entry3 + entry5)
    b.obj(5, b"<< /Type /XRef /Size 6 /W [1 2 1] /Index [3 1 5 1] "
             b"/Root 1 0 R /Filter /FlateDecode /Length %d >>\nstream\n" % len(xdata)
             + xdata + b"\nendstream")

    # Classic xref table (backward-compat). Obj 3 (page) and obj 5 (xref stream)
    # are listed as free placeholders; the /XRefStm supplies their real entries.
    classic_pos = len(b.buf)
    b.emit("xref\n")
    b.emit("0 6\n")
    b.emit("0000000003 65535 f \n")           # obj 0 free head -> 3
    b.emit(b.xref_line(b.offsets[1]))          # obj 1
    b.emit(b.xref_line(b.offsets[2]))          # obj 2
    b.emit("0000000005 00000 f \n")           # obj 3 placeholder -> 5 (real entry in XRefStm)
    b.emit(b.xref_line(b.offsets[4]))          # obj 4
    b.emit("0000000000 00000 f \n")           # obj 5 placeholder (real entry in XRefStm)
    b.emit(f"trailer\n<< /Size 6 /Root 1 0 R /XRefStm {off5} >>\n")
    b.emit(f"startxref\n{classic_pos}\n%%EOF\n")
    return bytes(b.buf)


def build_prev_crosstype() -> bytes:
    b = Builder()
    b.emit("%PDF-1.5\n")
    b.emit(b"%\xe2\xe3\xcf\xd3\n")

    b.obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    b.obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    b.obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] "
             "/Resources << >> /Contents 4 0 R >>")
    content = b"BT ET\n"
    b.obj(4, b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")

    # Base cross references live in an xref STREAM (obj 5), W = [1 2 2].
    off5 = len(b.buf)
    entries = bytearray()
    entries += bytes([0x00]) + u16(0) + u16(65535)                  # obj 0 free head
    for n in (1, 2, 3, 4):
        entries += bytes([0x01]) + u16(b.offsets[n]) + u16(0)       # in-use
    entries += bytes([0x01]) + u16(off5) + u16(0)                   # obj 5 (self)
    xdata = zlib.compress(bytes(entries))
    b.obj(5, b"<< /Type /XRef /Size 6 /W [1 2 2] /Index [0 6] "
             b"/Root 1 0 R /Filter /FlateDecode /Length %d >>\nstream\n" % len(xdata)
             + xdata + b"\nendstream")
    b.emit(f"startxref\n{off5}\n%%EOF\n")

    # Incremental update via a classic table, /Prev -> base xref stream.
    off3_new = len(b.buf)
    b.emit("3 0 obj\n")
    b.emit("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 600] "
           "/Resources << >> /Contents 4 0 R >>")
    b.emit("\nendobj\n")

    classic_pos = len(b.buf)
    b.emit("xref\n0 1\n")
    b.emit("0000000000 65535 f \n")
    b.emit("3 1\n")
    b.emit(b.xref_line(off3_new))
    b.emit(f"trailer\n<< /Size 6 /Root 1 0 R /Prev {off5} >>\n")
    b.emit(f"startxref\n{classic_pos}\n%%EOF\n")
    return bytes(b.buf)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, data in (
        ("hybrid.pdf", build_hybrid()),
        ("prev-crosstype.pdf", build_prev_crosstype()),
    ):
        path = os.path.join(OUT_DIR, name)
        with open(path, "wb") as f:
            f.write(data)
        print(f"wrote {path} ({len(data)} bytes)")


if __name__ == "__main__":
    main()

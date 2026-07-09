#!/usr/bin/env python3
"""Generate a byte-exact incremental-update PDF fixture.

Real-world PDFs are almost always saved incrementally: an original body +
classic xref + trailer, followed by one or more appended sections, each with
its own xref subsection and a trailer whose /Prev points at the previous
startxref. The newest definition of an object wins.

pikepdf/ghostscript always rewrite the whole file, so they never produce this
shape. We hand-build it here to exercise the /Prev chain + newest-wins merge in
core/xref/build.ts. Object 3 (the single page) is redefined in the increment
with a different MediaBox; a correct reader must report the NEW size.
"""
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures", "incremental.pdf")


def build() -> bytes:
    buf = bytearray()
    offsets: dict[int, int] = {}

    def emit(b) -> None:
        buf.extend(b.encode("latin-1") if isinstance(b, str) else b)

    def obj(n: int, body) -> None:
        offsets[n] = len(buf)
        emit(f"{n} 0 obj\n")
        emit(body)
        emit("\nendobj\n")

    def xref_line(off: int) -> str:
        return f"{off:010d} 00000 n \n"  # exactly 20 bytes

    emit("%PDF-1.7\n")
    emit(b"%\xe2\xe3\xcf\xd3\n")  # binary marker

    # --- Original body -----------------------------------------------------
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] "
           "/Resources << >> /Contents 4 0 R >>")
    content = b"BT ET\n"
    obj(4, b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")

    xref1 = len(buf)
    emit("xref\n0 5\n")
    emit("0000000000 65535 f \n")
    for n in (1, 2, 3, 4):
        emit(xref_line(offsets[n]))
    emit("trailer\n<< /Size 5 /Root 1 0 R >>\n")
    emit(f"startxref\n{xref1}\n%%EOF\n")

    # --- Incremental update: redefine object 3 with a larger MediaBox ------
    off3_new = len(buf)
    emit("3 0 obj\n")
    emit("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] "
         "/Resources << >> /Contents 4 0 R >>")
    emit("\nendobj\n")

    xref2 = len(buf)
    emit("xref\n")
    emit("0 1\n")
    emit("0000000000 65535 f \n")
    emit("3 1\n")
    emit(xref_line(off3_new))
    emit(f"trailer\n<< /Size 5 /Root 1 0 R /Prev {xref1} >>\n")
    emit(f"startxref\n{xref2}\n%%EOF\n")

    return bytes(buf)


def main() -> None:
    data = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(data)
    print(f"wrote {OUT} ({len(data)} bytes)")


if __name__ == "__main__":
    main()

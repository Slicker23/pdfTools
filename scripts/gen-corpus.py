#!/usr/bin/env python3
"""
Generate a diverse PDF corpus for the engine test suite.

Covers structural variants (classic xref, xref streams, object streams,
linearized, compressed/uncompressed, nested page tree, inherited MediaBox,
rotated pages, multiple page sizes, producer diversity via Ghostscript) and
encryption variants (RC4-40/128, AES-128, AES-256, owner-password, and
EncryptMetadata=false).

Output: tests/fixtures/corpus/*.pdf  (plus a manifest.json describing each).

Usage:  python3 scripts/gen-corpus.py
"""
import json
import pathlib
import shutil
import subprocess
import sys

try:
    import pikepdf
    from pikepdf import Array, Dictionary, Name, Pdf
except ImportError:
    sys.exit("pikepdf required: pip install pikepdf")

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures" / "corpus"

# (name, [ (width, height, rotate, inherit_mediabox) ... ])
PAGE_SIZES = {
    "A4": (595, 842),
    "Letter": (612, 792),
    "A5": (420, 595),
    "Legal": (612, 1008),
}

manifest: list[dict] = []


def content_for(title: str) -> bytes:
    text = (
        f"BT /F1 18 Tf 72 720 Td (John Developer) Tj ET\n"
        f"BT /F1 12 Tf 72 690 Td ({title}) Tj ET\n"
        f"BT /F1 10 Tf 72 670 Td (Built scalable web applications.) Tj ET\n"
    )
    return text.encode("latin-1")


def build_base(spec: list[tuple[int, int, int, bool]], inherit_wh=None) -> "pikepdf.Pdf":
    """Build a PDF whose pages follow spec = [(w,h,rotate,inherit)]."""
    pdf = Pdf.new()
    font = pdf.make_indirect(
        Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica)
    )
    kids = []
    for i, (w, h, rotate, inherit) in enumerate(spec):
        stream = pdf.make_stream(content_for(f"Page {i + 1}"))
        page = Dictionary(
            Type=Name.Page,
            Contents=stream,
            Resources=Dictionary(Font=Dictionary(F1=font)),
        )
        if not inherit:
            page.MediaBox = Array([0, 0, w, h])
        if rotate:
            page.Rotate = rotate
        kids.append(pdf.make_indirect(page))

    pages = Dictionary(Type=Name.Pages, Kids=Array(kids), Count=len(kids))
    if inherit_wh:
        pages.MediaBox = Array([0, 0, inherit_wh[0], inherit_wh[1]])
    pages_ref = pdf.make_indirect(pages)
    for k in kids:
        k.Parent = pages_ref
    pdf.Root.Pages = pages_ref
    # A docinfo string so encryption tests can verify STRING (not just stream)
    # decryption.
    pdf.docinfo[Name.Title] = "Secret Title 123"
    return pdf


def save(pdf: "pikepdf.Pdf", name: str, expect_pages: int, **kw) -> None:
    dst = OUT / name
    pdf.save(dst, **kw)
    manifest.append({"file": name, "pages": expect_pages, "encrypted": "encryption" in kw})
    print(f"wrote {name}")


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    # Multi-page doc: mixed sizes, a rotated page, and one page that inherits
    # its MediaBox from the Pages node.
    spec = [
        (*PAGE_SIZES["A4"], 0, False),
        (*PAGE_SIZES["Letter"], 90, False),
        (*PAGE_SIZES["A5"], 0, True),   # inherits A4 from root
        (*PAGE_SIZES["Legal"], 180, False),
    ]
    multi = build_base(spec, inherit_wh=PAGE_SIZES["A4"])
    n = 4

    # Structural save variants (saving the same Pdf object repeatedly is fine;
    # save() does not mutate it).
    save(multi, "multi_classic.pdf", n,
         object_stream_mode=pikepdf.ObjectStreamMode.disable, linearize=False)
    save(multi, "multi_objstm.pdf", n,
         object_stream_mode=pikepdf.ObjectStreamMode.generate)
    save(multi, "multi_linearized.pdf", n,
         object_stream_mode=pikepdf.ObjectStreamMode.generate, linearize=True)
    save(multi, "multi_uncompressed.pdf", n,
         object_stream_mode=pikepdf.ObjectStreamMode.disable,
         compress_streams=False, linearize=False)

    # Single large page.
    single = build_base([(1000, 1400, 0, False)])
    save(single, "single_large.pdf", 1,
         object_stream_mode=pikepdf.ObjectStreamMode.generate)

    # Encryption variants (empty user password unless noted).
    save(multi, "enc_rc4_40.pdf", n,
         encryption=pikepdf.Encryption(owner="o", user="", R=3, aes=False, metadata=False),
         object_stream_mode=pikepdf.ObjectStreamMode.disable)
    save(multi, "enc_rc4_128.pdf", n,
         encryption=pikepdf.Encryption(owner="o", user="", R=3, aes=False, metadata=False))
    save(multi, "enc_aes128.pdf", n,
         encryption=pikepdf.Encryption(owner="o", user="", R=4, aes=True))
    save(multi, "enc_aes128_nometa.pdf", n,
         encryption=pikepdf.Encryption(owner="o", user="", R=4, aes=True, metadata=False))
    save(multi, "enc_aes256.pdf", n,
         encryption=pikepdf.Encryption(owner="o", user="", R=6, aes=True))

    # AES-256 with a NON-empty user password -> must be opened with the owner
    # (or user) password. Recorded in the manifest so the test uses it.
    dst = OUT / "enc_aes256_userpw.pdf"
    multi.save(dst, encryption=pikepdf.Encryption(owner="ownerpw", user="userpw", R=6, aes=True))
    manifest.append({"file": "enc_aes256_userpw.pdf", "pages": n, "encrypted": True,
                     "password": "ownerpw"})
    print("wrote enc_aes256_userpw.pdf")

    # Producer diversity: re-render one file through Ghostscript if available.
    gs = shutil.which("gs")
    if gs:
        src = OUT / "multi_classic.pdf"
        dst = OUT / "multi_ghostscript.pdf"
        try:
            subprocess.run(
                [gs, "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite",
                 f"-sOutputFile={dst}", str(src)],
                check=True, capture_output=True,
            )
            manifest.append({"file": "multi_ghostscript.pdf", "pages": n, "encrypted": False})
            print("wrote multi_ghostscript.pdf")
        except subprocess.CalledProcessError as e:
            print(f"ghostscript skipped: {e}")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\n{len(manifest)} files -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

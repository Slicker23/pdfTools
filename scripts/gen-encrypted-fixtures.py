#!/usr/bin/env python3
"""
Generate encrypted PDF fixtures for the PDF engine crypto tests.

Uses pikepdf (a qpdf binding) to re-encrypt tests/fixtures/cv-like.pdf with the
three schemes M0 must decrypt. All fixtures use an EMPTY user password (and a
non-empty owner password) so the engine can open them with the default password.

Usage:  python3 scripts/gen-encrypted-fixtures.py
"""
import pathlib
import sys

try:
    import pikepdf
except ImportError:
    sys.exit("pikepdf is required: pip install pikepdf")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tests" / "fixtures" / "cv-like.pdf"
OUT = ROOT / "tests" / "fixtures" / "enc"


def save(name: str, enc: "pikepdf.Encryption") -> None:
    with pikepdf.open(SRC) as pdf:
        dst = OUT / name
        pdf.save(dst, encryption=enc)
        print(f"wrote {dst.relative_to(ROOT)}")


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing source fixture: {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)

    # RC4-128 (R3, no AES). metadata flag must be False for R < 4.
    save("rc4-128.pdf", pikepdf.Encryption(owner="owner", user="", R=3, aes=False, metadata=False))
    # AES-128 (R4)
    save("aes-128.pdf", pikepdf.Encryption(owner="owner", user="", R=4, aes=True))
    # AES-256 (R6)
    save("aes-256.pdf", pikepdf.Encryption(owner="owner", user="", R=6, aes=True))


if __name__ == "__main__":
    main()

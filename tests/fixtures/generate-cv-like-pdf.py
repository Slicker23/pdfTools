#!/usr/bin/env python3
"""Generate a two-column CV-like PDF for pdf-engine smoke tests."""
from __future__ import annotations

from pathlib import Path

import pikepdf
from pikepdf import Name, Pdf

FIXTURE = Path(__file__).resolve().parent / "cv-like.pdf"


def main() -> None:
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    w, h = 595, 842  # A4

    with Pdf.new() as pdf:
        page = pdf.add_blank_page(page_size=(w, h))

        # Colored sidebar (left column background)
        sidebar = (
            f"q 0.15 0.35 0.55 rg 0 0 180 {h} re f Q\n"
            # Sidebar white text
            f"BT /F1 14 Tf 1 1 1 rg 20 {h - 60} Td (Contact) Tj ET\n"
            f"BT /F1 11 Tf 1 1 1 rg 20 {h - 85} Td (email@example.com) Tj ET\n"
            f"BT /F1 11 Tf 1 1 1 rg 20 {h - 105} Td (+40 123 456 789) Tj ET\n"
            # Main column dark text
            f"BT /F2 18 Tf 0.07 0.07 0.07 rg 210 {h - 60} Td (John Developer) Tj ET\n"
            f"BT /F2 12 Tf 0.07 0.07 0.07 rg 210 {h - 90} Td (Senior Software Engineer) Tj ET\n"
            f"BT /F2 11 Tf 0.07 0.07 0.07 rg 210 {h - 130} Td (Experience) Tj ET\n"
            f"BT /F2 10 Tf 0.07 0.07 0.07 rg 210 {h - 155} Td (Built scalable web applications.) Tj ET\n"
        )

        stream = pdf.make_stream(sidebar.encode("latin-1"))
        page.obj["/Contents"] = stream
        page.obj["/Resources"] = pdf.make_indirect(
            pikepdf.Dictionary(
                Font=pikepdf.Dictionary(
                    F1=pikepdf.Dictionary(
                        Type=Name.Font,
                        Subtype=Name.Type1,
                        BaseFont=Name.Helvetica,
                    ),
                    F2=pikepdf.Dictionary(
                        Type=Name.Font,
                        Subtype=Name.Type1,
                        BaseFont=Name("/Helvetica-Bold"),
                    ),
                )
            )
        )
        pdf.save(FIXTURE)

    print(FIXTURE)


if __name__ == "__main__":
    main()

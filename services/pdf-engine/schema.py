"""JSON document model — mirrors src/lib/pdf/edit-model.ts"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional
import json

EDIT_MODEL_VERSION = 1


@dataclass
class BBox:
    px: float
    py: float
    pw: float
    ph: float

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass
class Font:
    name: str
    size: float
    bold: bool = False
    italic: bool = False
    color: str = "#111111"
    embeddedFontRef: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "size": self.size,
            "bold": self.bold,
            "italic": self.italic,
            "color": self.color,
        }
        if self.embeddedFontRef:
            d["embeddedFontRef"] = self.embeddedFontRef
        return d


@dataclass
class TextBlock:
    id: str
    page: int
    text: str
    bbox: BBox
    font: Font
    lineCount: int = 1
    baselineY: Optional[float] = None
    modified: Optional[bool] = None
    deleted: Optional[bool] = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "id": self.id,
            "page": self.page,
            "text": self.text,
            "bbox": self.bbox.to_dict(),
            "font": self.font.to_dict(),
            "lineCount": self.lineCount,
        }
        if self.baselineY is not None:
            d["baselineY"] = self.baselineY
        if self.modified is not None:
            d["modified"] = self.modified
        if self.deleted is not None:
            d["deleted"] = self.deleted
        return d


@dataclass
class Page:
    number: int
    width: float
    height: float
    blocks: list[TextBlock] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "number": self.number,
            "width": self.width,
            "height": self.height,
            "blocks": [b.to_dict() for b in self.blocks],
        }


@dataclass
class Document:
    version: int
    documentId: str
    pages: list[Page] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "documentId": self.documentId,
            "pages": [p.to_dict() for p in self.pages],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


@dataclass
class BlockPatch:
    id: str
    page: Optional[int] = None
    text: Optional[str] = None
    bbox: Optional[BBox] = None
    font: Optional[Font] = None
    lineCount: Optional[int] = None
    baselineY: Optional[float] = None
    modified: Optional[bool] = None
    deleted: Optional[bool] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "BlockPatch":
        bbox = None
        if "bbox" in d and d["bbox"]:
            b = d["bbox"]
            bbox = BBox(px=b["px"], py=b["py"], pw=b["pw"], ph=b["ph"])
        font = None
        if "font" in d and d["font"]:
            f = d["font"]
            font = Font(
                name=f.get("name", "Helvetica"),
                size=float(f.get("size", 12)),
                bold=bool(f.get("bold", False)),
                italic=bool(f.get("italic", False)),
                color=f.get("color", "#111111"),
                embeddedFontRef=f.get("embeddedFontRef"),
            )
        return cls(
            id=d["id"],
            page=d.get("page"),
            text=d.get("text"),
            bbox=bbox,
            font=font,
            lineCount=d.get("lineCount"),
            baselineY=d.get("baselineY"),
            modified=d.get("modified"),
            deleted=d.get("deleted"),
        )


@dataclass
class Patch:
    documentId: str
    blocks: list[BlockPatch] = field(default_factory=list)

    @classmethod
    def from_json(cls, raw: str) -> "Patch":
        data = json.loads(raw)
        return cls(
            documentId=data["documentId"],
            blocks=[BlockPatch.from_dict(b) for b in data.get("blocks", [])],
        )

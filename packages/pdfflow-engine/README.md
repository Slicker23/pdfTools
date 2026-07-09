# pdfflow-engine

**From-scratch PDF engine for text extraction, content-stream interpretation, and in-place text editing.**

`pdfflow-engine` parses PDF files at the COS (PDF object) level, walks content streams to recover positioned text runs, merges them into editable blocks, and applies changes back to the PDF using native incremental updates whenever possible — falling back to a pdf-lib whiteout-and-redraw overlay when necessary.

Works in **Node.js 20+** out of the box. The core parser and interpreter are **isomorphic** and can be bundled for browsers when you supply platform adapters.

---

## Table of contents

- [What it does](#what-it-does)
- [When to use it](#when-to-use-it)
- [Installation](#installation)
- [Quick start (Node.js)](#quick-start-nodejs)
- [Package entry points](#package-entry-points)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Extract: PDF → editable document](#extract-pdf--editable-document)
- [Apply: patch → PDF bytes](#apply-patch--pdf-bytes)
- [Edit session API](#edit-session-api)
- [Text layout and wrapping](#text-layout-and-wrapping)
- [Apply routing reference](#apply-routing-reference)
- [Low-level COS / interpreter API](#low-level-cos--interpreter-api)
- [Advanced: custom platforms](#advanced-custom-platforms)
- [Browser and bundler notes](#browser-and-bundler-notes)
- [Limitations](#limitations)
- [Development](#development)
- [License](#license)

---

## What it does

| Capability | Description |
|------------|-------------|
| **Parse** | Read PDF cross-reference tables, object streams, encrypted files, and compressed streams (Flate, LZW, ASCII85, etc.) |
| **Interpret** | Tokenize and execute page content streams; recover text spans with font matrix, color, bbox, and stream locator |
| **Extract** | Merge adjacent spans into `PdfEditTextBlock` objects suitable for UI editors or batch pipelines |
| **Edit natively** | Rewrite `Tj`/`TJ` show operators in-place via incremental PDF updates — original fonts preserved |
| **Edit via overlay** | White out changed regions and redraw with pdf-lib when style, encoding, or layout requires it |
| **Insert text** | Append new `BT…ET` runs for user-created blocks |
| **Move / flatten** | Relocate text runs or convert them to vector paths when supported |

Unlike wrappers around Poppler or MuPDF, this engine is written in TypeScript and designed to run **in-process** in Node or the browser — no subprocess, no Python sidecar.

---

## When to use it

**Good fit:**

- Building a PDF text editor (web or desktop)
- Server-side batch text replacement in invoices, forms, or reports
- Inspecting PDF content streams for debugging or analysis
- Pipelines that need both **read** (spans/locators) and **write** (incremental update) in one library

**Not a fit (yet or by design):**

- Full-page rasterization or print preview (use PDF.js or a renderer)
- OCR or scanned PDF text recovery
- Complex vector graphics editing, image manipulation, or form field logic
- React hooks / Web Worker session (available in the [pdfFlow-Engine repo](https://github.com/ennkaos/pdfFlow-Engine) source, not exported from this package yet)

---

## Installation

```bash
npm install pdfflow-engine pdf-lib zod
```

**Recommended for Unicode overlay text:**

```bash
npm install @pdf-lib/fontkit
```

**Node overlay background sampling** (auto-installed as optional deps):

- `@napi-rs/canvas` — samples pixel colors under text for seamless whiteout
- `pdfium-native` — alternative render path

### Peer dependencies

| Package | Required | Purpose |
|---------|----------|---------|
| `pdf-lib` | **Yes** | Overlay redraw, font embedding, page drawing |
| `zod` | **Yes** | Runtime validation of the edit document model |
| `@pdf-lib/fontkit` | Optional | Unicode and custom TTF fonts in overlay mode |

---

## Quick start (Node.js)

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { pdfEngineExtract, pdfEngineApply } from "pdfflow-engine/node";

const input = await readFile("document.pdf");

// 1. Extract editable text blocks
const doc = await pdfEngineExtract(input);
console.log(doc.pages[0].blocks.map((b) => b.text));

// 2. Modify a block
const block = doc.pages[0].blocks[0];
block.text = "Updated heading";
block.modified = true;

// 3. Build a patch and apply
const patch = {
  documentId: doc.documentId,
  blocks: [
    {
      id: block.id,
      page: block.page,
      text: block.text,
      bbox: block.bbox,
      font: block.font,
      locator: block.locator,
      modified: true,
    },
  ],
};

const output = await pdfEngineApply(input, patch);
await writeFile("edited.pdf", output);
```

**Verify dependencies loaded:**

```typescript
import { pdfEngineConfigured } from "pdfflow-engine/node";

if (!(await pdfEngineConfigured())) {
  throw new Error("Install pdf-lib: npm install pdf-lib");
}
```

---

## Package entry points

| Import | Environment | What you get |
|--------|-------------|--------------|
| `pdfflow-engine` | Node + browser (with adapters) | Types, COS core, session, layout, apply helpers |
| `pdfflow-engine/node` | Node.js only | `pdfEngineExtract`, `pdfEngineApply`, `nodeAdapters`, `nodeOverlayPlatform` |

### `pdfflow-engine` (isomorphic)

```typescript
import {
  // Edit model
  EDIT_MODEL_VERSION,
  parsePdfEditDocument,
  parsePdfEditPatch,
  buildPdfEditPatch,
  type PdfEditDocument,
  type PdfEditTextBlock,
  type PdfEditPatch,

  // Session
  applyIntentToState,
  exportPatchFromDocument,
  snapshotFromBlock,

  // Routing
  predictBlockApply,

  // Layout
  layoutBlockWithinPage,
  wrapParagraph,

  // Low-level
  CosDocument,
  encodeLocator,
  decodeLocator,
} from "pdfflow-engine";
```

### `pdfflow-engine/node` (batteries included)

```typescript
import {
  pdfEngineExtract,
  pdfEngineApply,
  pdfEngineConfigured,
  extractDocument,
  applyPatch,
  nodeAdapters,
  nodeOverlayPlatform,
  createDejaVuOutlineReader,
} from "pdfflow-engine/node";
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your application                          │
│  (editor UI, batch script, API route, worker)                   │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             ▼                               ▼
┌────────────────────────┐      ┌───────────────────────────────┐
│   Edit session layer   │      │   High-level Node helpers     │
│ applyIntentToState     │      │ pdfEngineExtract / Apply      │
│ exportPatchFromDocument│      │ extractDocument / applyPatch  │
└────────────┬───────────┘      └───────────────┬───────────────┘
             │                                   │
             ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Apply router (plan.ts)                       │
│  predictBlockApply → native-in-place | overlay | insert | …   │
└──────┬──────────────────────────────┬───────────────────────────┘
       │                              │
       ▼                              ▼
┌──────────────────┐        ┌───────────────────────────────────┐
│  Native apply    │        │  Overlay apply (pdf-lib)            │
│  editText        │        │  whiteout + redraw + font embed     │
│  insertText      │        │  (style changes, multiline, Unicode)│
│  relocateText    │        └───────────────────────────────────┘
│  flattenText     │
│  incremental xref│
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     COS core (isomorphic)                        │
│  CosDocument · xref · filters · content interpreter · fonts   │
└─────────────────────────────────────────────────────────────────┘
```

**Design principles:**

1. **Native first** — preserve original PDF structure and fonts when a block has a valid `locator` and the change is encodable.
2. **Overlay fallback** — pdf-lib redraws text when native edit is unsafe or impossible.
3. **Incremental updates** — native edits append new objects and xref sections instead of rewriting the whole file.
4. **Isomorphic core** — parsing and interpretation have no Node/browser imports; platform code supplies `inflate`/`deflate`.

---

## Data model

All edit state flows through a versioned, Zod-validated JSON model (`EDIT_MODEL_VERSION = 1`).

### `PdfEditDocument`

```typescript
interface PdfEditDocument {
  version: 1;
  documentId: string;       // stable ID for patch matching
  pages: PdfEditPage[];
}

interface PdfEditPage {
  number: number;           // 1-based page index
  width: number;            // points
  height: number;           // points
  blocks: PdfEditTextBlock[];
}
```

### `PdfEditTextBlock`

Each block represents one editable unit of text on a page.

```typescript
interface PdfEditTextBlock {
  id: string;               // usually equals locator for extracted blocks
  page: number;
  text: string;
  bbox: { px: number; py: number; pw: number; ph: number };  // PDF user space, bottom-left origin
  font: {
    name: string;           // e.g. "Helvetica", "Roboto"
    size: number;
    bold: boolean;
    italic: boolean;
    color: string;          // "#RRGGBB"
    embeddedFontRef?: string;
  };
  lineCount: number;

  // Native edit support
  locator?: string;         // "p1:s42:o1024" — page, stream object, byte offset
  encodableChars?: string;  // chars the embedded font can render natively
  segments?: Array<{ locator: string; text: string; bbox: PdfEditBBox }>;  // merged runs

  // Change tracking
  modified?: boolean;
  deleted?: boolean;
  created?: boolean;        // user-added block → native insert
  overlay?: boolean;        // force overlay even with locator (style change)

  // Position / style baselines for moved or restyled blocks
  originalBbox?: PdfEditBBox;
  originalFont?: PdfEditFont;
  baselineY?: number;
  insertAt?: { px: number; py: number };

  // Advanced
  flattenToPath?: boolean;
  supportsOutlines?: boolean;
}
```

### `PdfEditPatch`

A minimal diff sent to the apply pipeline:

```typescript
interface PdfEditPatch {
  documentId: string;
  blocks: PdfEditBlockPatch[];  // partial blocks with at least { id, page }
}
```

Use `buildPdfEditPatch(document, blocks)` or `exportPatchFromDocument(document, originals)` to produce patches from editor state.

### Locators

A **locator** pinpoints the exact `Tj`/`TJ` operator in a page content stream:

```
p{page}:s{streamObjectNumber}:o{byteOffset}
```

Example: `p1:s42:o1024` → page 1, indirect object 42, operator starts at byte 1024.

Blocks **without** a locator can still be edited via the overlay path. Blocks **with** merged `segments` always use overlay (multiple native runs).

---

## Extract: PDF → editable document

### High-level (Node)

```typescript
import { pdfEngineExtract } from "pdfflow-engine/node";

const doc = await pdfEngineExtract(pdfBytes);
// doc.pages[n].blocks — editable text blocks with bbox, font, locator
```

### What happens internally

1. `CosDocument.open(bytes)` parses xref, decrypts if needed, resolves page tree.
2. For each page, content streams are decoded (including Form XObjects).
3. The content interpreter executes operators and collects `TextSpan` objects.
4. Adjacent mergeable spans are grouped (`merge-text-spans`) into single blocks.
5. Font metadata, encodable character sets, and outline support are attached per block.

### Low-level span access

```typescript
import { CosDocument } from "pdfflow-engine";
import { nodeAdapters } from "pdfflow-engine/node";

const cos = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
const page = cos.pages()[0];
const { spans, pageHeight } = await cos.pageSpans(page);

for (const span of spans) {
  console.log(span.text, span.bbox, span.source);
}
```

Each `TextSpan` includes:

- `text` — decoded Unicode string
- `bbox` — `[x0, y0, x1, y1]` in PDF user space
- `matrix` — text rendering matrix
- `fontSize`, `fillColor`, `fontDict`
- `source` — `{ streamNum, regionStart }` for locator encoding

---

## Apply: patch → PDF bytes

### High-level (Node)

```typescript
import { pdfEngineApply } from "pdfflow-engine/node";

const output = await pdfEngineApply(originalBytes, patch);
```

### Apply strategies

The router (`predictBlockApply`) picks one strategy per block:

| Strategy | When | Mechanism |
|----------|------|-----------|
| `skip` | Block unchanged | No-op |
| `native-in-place` | Same style, encodable, single-line, has locator | Rewrite show operator bytes |
| `native-move` | Position changed, encodable | Relocate run in content stream |
| `native-insert` | `created: true` block | Append new `BT…ET` to page stream |
| `native-flatten` | `flattenToPath: true` + outline font | Replace text with vector paths |
| `overlay` | Style change, multiline, unencodable, no locator, merged segments | pdf-lib whiteout + redraw |

### Inspect routing before apply

```typescript
import { predictBlockApply, snapshotFromBlock } from "pdfflow-engine";

const original = snapshotFromBlock(block);
const plan = predictBlockApply(block, original);

console.log(plan.strategy);  // e.g. "native-in-place" | "overlay"
console.log(plan.overlay);   // true if pdf-lib will run
console.log(plan.reason);    // e.g. "style" | "multiline" | "no-locator"
```

### Manual apply (isomorphic)

When you need control over adapters and overlay platform:

```typescript
import { applyFullPatch } from "pdfflow-engine";
import { nodeAdapters, nodeOverlayPlatform } from "pdfflow-engine/node";

const output = await applyFullPatch(
  pdfBytes,
  patch,
  nodeAdapters,
  nodeOverlayPlatform
);
```

**Two-phase apply** (e.g. preview native first, overlay on main thread):

```typescript
import { applyNativePatch, applyOverlayFull } from "pdfflow-engine";
import { nodeAdapters, nodeOverlayPlatform } from "pdfflow-engine/node";

const { bytes, overlayBlocks } = await applyNativePatch(pdfBytes, patch, nodeAdapters);
const final = await applyOverlayFull(bytes, overlayBlocks, nodeAdapters, nodeOverlayPlatform);
```

---

## Edit session API

Framework-agnostic state management for building editors. Track originals, apply intents, export patches.

```typescript
import {
  applyIntentToState,
  exportPatchFromDocument,
  snapshotFromBlock,
  computeSessionMeta,
  cloneDocument,
} from "pdfflow-engine";

// Snapshot originals at load time
const originals = new Map(
  doc.pages.flatMap((p) => p.blocks.map((b) => [b.id, snapshotFromBlock(b)]))
);

let document = doc;

// Change text (auto word-wrap within page margins)
document = applyIntentToState(document, originals, {
  kind: "updateText",
  id: blockId,
  text: "New paragraph text",
});

// Change style (may force overlay on apply)
document = applyIntentToState(document, originals, {
  kind: "updateStyle",
  id: blockId,
  patch: { color: "#0066cc", size: 14, bold: true },
});

// Move block
document = applyIntentToState(document, originals, {
  kind: "updatePosition",
  id: blockId,
  position: { px: 72, py: 700 },
});

// Add new text block
document = applyIntentToState(document, originals, {
  kind: "addBlock",
  block: {
    id: crypto.randomUUID(),
    page: 1,
    text: "New note",
    created: true,
    insertAt: { px: 72, py: 500 },
    bbox: { px: 72, py: 500, pw: 200, ph: 14 },
    font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111111" },
    lineCount: 1,
  },
});

// Delete / reset
document = applyIntentToState(document, originals, { kind: "removeBlock", id: blockId });
document = applyIntentToState(document, originals, { kind: "resetBlock", id: blockId });
document = applyIntentToState(document, originals, { kind: "resetAll" });

// Export patch for apply
const patch = exportPatchFromDocument(document, originals);
const meta = computeSessionMeta(document, originals);
// meta.changedBlocks, meta.overlayCount, etc.
```

### Session intents

| Intent | Effect |
|--------|--------|
| `updateText` | Replace text, re-layout within page bounds |
| `updateStyle` | Font name, size, color, bold, italic |
| `updatePosition` | Move bbox, sets `originalBbox` if first move |
| `updateFlatten` | Toggle vector flatten on download |
| `removeBlock` | Mark deleted |
| `resetBlock` | Restore one block from snapshot |
| `resetAll` | Restore entire document |
| `addBlock` | Insert created block |

---

## Text layout and wrapping

Long text is word-wrapped to stay within page margins.

```typescript
import {
  layoutBlockWithinPage,
  wrapParagraph,
  layoutTextLines,
  PAGE_TEXT_MARGIN,
  TEXT_LINE_HEIGHT,
} from "pdfflow-engine";

const page = { width: 595, height: 842 };
const laidOut = layoutBlockWithinPage(block, page);
// laidOut.bbox.ph expanded, laidOut.lineCount updated, text may contain \n
```

The session layer calls `layoutBlockWithinPage` automatically on text and style updates. Explicit `\n` in stored text triggers multiline overlay on apply.

---

## Apply routing reference

`predictBlockApply(block, original?)` returns an `ApplyPlan`:

```typescript
interface ApplyPlan {
  strategy: "skip" | "overlay" | "native-in-place" | "native-move"
          | "native-insert" | "native-flatten";
  reason?: "no-locator" | "style" | "unencodable" | "multiline"
         | "created" | "moved" | "outlined";
  overlay: boolean;
}
```

**Overlay triggers:**

- No `locator` on block
- Text contains `\n` (multiline)
- Font family / bold / italic changed (unless native font swap is possible)
- Font size or color changed
- Character not in `encodableChars`
- Block has multiple `segments` (merged spans)
- Block explicitly sets `overlay: true`
- Block was moved (`originalBbox` differs from `bbox`)

**Native insert triggers:**

- `created: true` on block

---

## Low-level COS / interpreter API

The core module (`export * from "./core"`) exposes the full read/write stack:

```typescript
import {
  CosDocument,
  tokenizeContent,
  interpretContent,
  editText,
  insertTextBlocks,
  writeIncrementalUpdate,
  encodeLocator,
  decodeLocator,
} from "pdfflow-engine";
```

### Open a document

```typescript
const doc = await CosDocument.open(bytes, {
  inflate: myAdapters.inflate,
  password: "optional",
});
```

### Read page content as tokens

```typescript
const stream = await doc.pageContentStream(page);
const ops = tokenizeContent(stream);
```

### Native text edit

```typescript
const locator = decodeLocator("p1:s42:o1024");
const result = await editText(doc, {
  locator,
  newText: "Hello",
}, adapters);
// result.bytes — new PDF bytes with incremental update
```

---

## Advanced: custom platforms

### `PlatformAdapters`

Required for inflate/deflate of PDF streams:

```typescript
interface PlatformAdapters {
  inflate(data: Uint8Array): Uint8Array;
  deflate?(data: Uint8Array): Uint8Array | Promise<Uint8Array>;
}
```

Node ships `nodeAdapters` (zlib). Browser apps use `CompressionStream` — see `platform-browser.ts` in the PdfFlow source repo.

### `OverlayPlatform`

Required for overlay apply — background color sampling and Unicode font loading:

```typescript
interface OverlayPlatform {
  sampleBgRgb(
    input: Uint8Array,
    pageIdx: number,
    bbox: PdfEditBBox,
    pageHeight: number,
    blockId?: string
  ): Promise<{ r: number; g: number; b: number }>;

  loadUnicodeFont(pdfDoc: PDFDocument): Promise<PDFFont>;
}
```

Node ships `nodeOverlayPlatform` (uses `@napi-rs/canvas` for bg sampling, Noto Sans for Unicode).

---

## Browser and bundler notes

The COS parser and content interpreter work in modern browsers when bundled (Vite, webpack, esbuild).

**You must provide:**

1. `PlatformAdapters` with `inflate` (and preferably async `deflate` for incremental writes)
2. `OverlayPlatform` for overlay apply — or pre-sample background colors and pass them in
3. Peer deps (`pdf-lib`, `zod`) in your bundle

**Not included in this npm package (yet):**

- React hooks (`usePdfDocument`, `useEnginePreview`)
- Web Worker session client
- pdf.js background sampling helpers

These live in the PdfFlow application under `src/lib/pdf-engine/browser/`. You can copy or import from source until a `pdfflow-engine/browser` export is published.

**Bundler externals** (if not bundling peers):

```javascript
// esbuild / tsup example
external: ["pdf-lib", "@pdf-lib/fontkit", "zod"]
```

---

## Limitations

- **Text only** — edits text runs, not images, paths, or annotations (except flatten-to-path for supported fonts).
- **Overlay fidelity** — redrawn text may differ slightly from original embedded fonts; native path preserves original rendering when possible.
- **Encrypted PDFs** — read supported with password; write requires successful decrypt.
- **Complex layouts** — tables and multi-column text may merge into fewer blocks than visual lines; tune with `merge-text-spans` helpers.
- **Custom font files for overlay** — Node overlay expects bundled fonts or your own `OverlayPlatform.loadUnicodeFont` implementation.

---

## Development

This package is developed in the [pdfFlow-Engine repository](https://github.com/ennkaos/pdfFlow-Engine) at `packages/pdfflow-engine/`. Source lives in `src/lib/pdf-engine/` at the repo root.

### Build from source

```bash
git clone https://github.com/ennkaos/pdfFlow-Engine.git
cd pdfFlow-Engine
npm install
npm run build:engine    # outputs packages/pdfflow-engine/dist/
npm test                # 220+ engine tests
```

### Publish to npm

```bash
npm run build:engine
npm publish -w pdfflow-engine --access public
```

### Run tests

```bash
npm test                           # full suite
npx vitest run tests/engine/       # engine tests only
```

---

## License

**Open source under [AGPL-3.0](./LICENSE) — copyright owned by Alexandru Bucur.**

Open source does **not** mean you give up ownership. You remain the **copyright
holder** and **project owner**. The license grants others permission to use the
code under specific rules.

| You keep | Others can |
|----------|------------|
| Copyright and authorship | Use, study, and modify the code |
| Control over the official project | Fork the project (must stay open under AGPL) |
| Right to offer commercial licenses | Contribute back (PRs licensed under AGPL) |
| Trademark / brand ("pdfflow-engine") | Run it in production (including SaaS) |

**AGPL-3.0 in plain terms:**

- ✅ Free to use, modify, and distribute
- ✅ Must keep copyright notices and license text
- ✅ Changes and forks must also be open source (same license)
- ✅ If you run a **network service** (SaaS) using this code, you must offer
  source code to users of that service
- ❌ Cannot remove your name or claim you wrote the original engine
- ❌ Cannot take a fork closed-source without violating the license

**Commercial use without AGPL obligations?** Contact
**bucur.alexandru0106@gmail.com** for a separate commercial license (dual
licensing).

Peer dependencies (`pdf-lib`, `zod`, etc.) remain under their own licenses.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution terms.

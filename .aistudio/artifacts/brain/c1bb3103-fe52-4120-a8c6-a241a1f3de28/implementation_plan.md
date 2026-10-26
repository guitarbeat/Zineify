# Zine-ify: Stylesheet Recovery & `taste-skill` App-Screen Refinement Plan

An architectural and visual refinement plan that fixes the root cause of the unstyled HTML preview shown in your screenshot while applying the confirmed **`Leonxlnx/taste-skill`** (`tasteskill v2`) App-Screen house rules across the draggable GridStack Zine-ify workspace.

---

## User Review & Critical Decisions

> [!WARNING]
> **Root Cause of Unstyled HTML in Your Screenshot**
> In your screenshot, Zine-ify rendered as raw, unstyled browser HTML for three compounding reasons:
> 1. **Restrictive Content-Security-Policy (`index.html`)**: The hardcoded CSP `<meta>` tag only permitted two SHA-256 inline script hashes and `connect-src 'self' ws: http://localhost:8001`. When served inside the HTTPS preview environment (`https://*.run.app`), Vite's module scripts and `wss:` connections are blocked, preventing `src/core/main.js` from executing.
> 2. **JS-Only Stylesheet Injection**: Because `index.html` had no `<link rel="stylesheet" href="/src/styles/index.css" />` in `<head>`, any script or CSP block caused the entire stylesheet to never load.
> 3. **Service Worker Cache Stale Lock (`public/sw.js`)**: The Service Worker used a cache-first responder (`cached || fetchPromise`) under `zine-ify-v1`, serving stale cached responses across rebuilds.

> [!IMPORTANT]
> **Confirmed `taste-skill` House Rules for Zine-ify**
> - **Keep the Draggable GridStack Cards & Logo Sticker**: Preserve the framed workbench, draggable GridStack snap-cards, and the Zine-ify logo sticker in the Brand card.
> - **One Ground, One Ink, One Coral-Red Accent**: Unify the palette around warm paper ground (`#f4f1ea` light / `#0d0d0d` dark), crisp editorial ink (`#111111` / `#fafafa`), and a single coral-red accent (`#ff5555`) reserved for primary actions and cut lines—eliminating competing secondary mustard/yellow fills.
> - **Sentence-Case Labels & Two-Font Cap**: Replace tiny uppercase letter-spaced micro-labels (`0.55rem–0.67rem` tracked all-caps) with readable sentence-case labels, and cap typography at two families (`Fraunces` for editorial headings + `Plus Jakarta Sans` with `tabular-nums` for UI and numeric counters).
> - **Flat Tonal Surfaces & Unboxed Counts**: Replace gradients, glows, and heavy shadows on small buttons with flat tonal surface steps and crisp `1px` hairlines, and unbox static pill badges (`0/8`, status tags) into clean inline `tabular-nums` text.

---

## 1. Overview & Core Concept

**Zine-ify** is a client-side studio utility that transforms multi-page PDFs and images into printable 8-page mini-zine imposition sheets with interactive 3D fold previews. Under `Leonxlnx/taste-skill`, Zine-ify is classified as an **App Screen**—a calm, high-trust workspace where every control, counter, and canvas panel serves page curation, imposition accuracy, and print output.

Our goal is twofold:
1. **Guarantee Bulletproof Stylesheet & Asset Delivery**: Link `/src/styles/index.css` directly in `<head>`, relax the CSP `<meta>` tag so HTTPS/WSS preview environments and Vite module bundles never get blocked, and switch the Service Worker in development/preview to network-first with cache version bumping so stale unstyled snapshots can never persist.
2. **Apply `taste-skill` App-Screen Discipline to GridStack Cards**: Strip away visual noise (competing yellow accent fills, tiny tracked-out uppercase labels, pill-wrapped counters, and heavy offset button shadows) while keeping the tactile GridStack card workbench and Zine-ify brand sticker that give the app its identity.

---

## 2. User Experience & Visual Design

### Aesthetic Direction & Domain Exemplars
- **Tactile Print Workbench Meets Modern Studio Utility**: Inspired by Linear and Figma's calm property panels blended with physical risograph/zine print-shop clarity.
- **High-Craft Light Mode Default + Carbon Dark Mode**: Warm archival paper ground in light mode and deep carbon-black in dark mode, with cards sitting one subtle tonal step above the workspace ground.

### Color & Atmospheric Polarity
| Semantic Role | Light Mode Token | Dark Mode Token | Usage Discipline |
| :--- | :--- | :--- | :--- |
| **Workspace Ground** | `#ebe6dc` (Outer Frame) / `#f4f1ea` (Canvas) | `#080808` (Outer Frame) / `#0d0d0d` (Canvas) | Calm, non-competing studio surface |
| **Card Surface** | `#faf8f4` (Elevated Card) / `#efebe2` (Subtle Well) | `#141414` (Elevated Card) / `#1c1c1c` (Subtle Well) | Flat tonal hierarchy without heavy drop-shadow clutter |
| **Primary Ink** | `#111111` | `#f5f5f3` | Card titles, primary controls, active values |
| **Muted Ink** | `#57534e` | `#a1a1aa` | Sentence-case field labels, helper descriptions, page counts |
| **Single Accent (Coral-Red)** | `#ff5555` (Hover `#e03e3e`) | `#ff5555` (Hover `#ff6b6b`) | Reserved strictly for primary CTA (`Export PDF`), active selection states, and zine cut lines |
| **Structural Hairline** | `#dcd6ca` (`1px solid`) | `#262626` (`1px solid`) | Clean `1px` borders separating cards, headers, and input controls |

### Typography & Scannable Hierarchy
- **Two-Font Cap**:
  - **Display (`--font-display`)**: `'Fraunces', Georgia, serif` for card header titles and empty-state headings (`font-weight: 600`, tight tracking `-0.02em`).
  - **UI & Numeric (`--font-sans`)**: `'Plus Jakarta Sans', -apple-system, sans-serif` across all buttons, form labels, selects, and counters—eliminating the third monospace font stack from general UI labels.
- **Sentence-Case Labels**: All form labels (`PageLayout`, `Margin`, `Scaling`, `Duplex`, `Slotassignment`), card sub-labels, and buttons use natural sentence case (`0.78rem–0.85rem`, `font-weight: 500`, normal letter-spacing) instead of `0.55rem–0.67rem` uppercase tracked caps.
- **Tabular Numerals (`tabular-nums`)**: Every counter (`0/8` pages, sheet badges, margin inputs, zoom percentages, and page slot indices) enforces `font-variant-numeric: tabular-nums` as plain unboxed inline text.

### Layout, Spatial Architecture & Interactive Flows
- **GridStack 12-Column Workbench**:
  - **Left Column (`w: 3`)**:
    - **Brand Card (`card-brand`)**: Preserves the Zine-ify logo sticker (`/icons/zine-ify-logo.jpg`), paired with clean flat icon controls for Theme Toggle, Undo, Redo, Reset Layout, and the **Preview Fold** toggle button (`#view3dBtn`).
    - **Display Card (`card-display`)**: Houses the segmented Simple / Pro mode switch and dark/light indicator without overlapping neighboring cards.
    - **Upload Card (`card-upload`)**: Clean dashed dropzone with sentence-case helper text and unboxed `tabular-nums` page counter (`0/8`).
    - **Settings Card (`card-settings`)**: Sentence-case field labels, flat tonal `<select>` and `<input>` controls, and a single coral-red primary action button (`#generateBtn`).
  - **Right Column (`w: 9`)**:
    - **Pages Card (`card-pages`)**: Scannable thumbnail strip with hover/focus **90° Rotate** (`↻`), **Delete** (`×`), and drag-reorder handles.
    - **Print Sheet Preview (`card-preview`)**: High-clarity imposition canvas showing fold lines and coral-red cut marks, with flat zoom controls.
    - **On-Demand 3D Fold, Booklet & Fold Guide Cards (`card-3d`, `card-booklet`, `card-howto`)**: Toggled cleanly via **Preview Fold** (`#view3dBtn`), synchronized with GridStack so there is never empty ghost space when hidden.

---

## 3. Key Product Decisions & Trade-Offs

1. **Direct `<link rel="stylesheet">` + Relaxed CSP vs. Strict Hash-Locked Inline CSP**
   - *Decision*: Add `<link rel="stylesheet" href="/src/styles/index.css" />` directly in `index.html` and update the CSP `<meta>` policy to allow `'self' 'unsafe-inline'` for scripts/styles and `https: wss: ws: http:` for connections.
   - *Rationale*: In Vite + cloud preview environments, hash-locked CSP blocks module preloads and stylesheet injection, causing the exact unstyled HTML failure seen in the screenshot. Linking the CSS directly guarantees instant styling on first paint with zero Flash of Unstyled Content (FOUC).
2. **One Accent Color (`#ff5555`) vs. Multi-Accent Brutalist Palette**
   - *Decision*: Retire the secondary mustard-yellow (`#ffd166`) button/badge fills and use tonal paper/ink surfaces for secondary controls, reserving `#ff5555` exclusively for primary actions and active states.
   - *Rationale*: Follows your confirmed `taste-skill` choice ("One ground, one ink, and one coral-red accent color") so primary actions and zine cut marks command immediate visual hierarchy.
3. **Unboxed `tabular-nums` Counts vs. Pill Badges**
   - *Decision*: Render `0/8` page counts, sheet counts, and status indicators as plain right-aligned `tabular-nums` text in muted ink instead of bordered pill chips.
   - *Rationale*: Directly implements your confirmed `taste-skill` rule ("Remove pill badges and use plain tabular-nums text counts") and matches the universal Zero-Pill discipline.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        index.html (<head> CSS Link)                     │
│   Direct <link rel="stylesheet" href="/src/styles/index.css"> + Safe CSP│
└───────────────────┬─────────────────────────────────────┬───────────────┘
                    │                                     │
                    ▼                                     ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│     Design Tokens & Stylesheets       │ │  Service Worker & PWA Layer   │
│  • One Ground / One Ink / One Accent  │ │  • Bump cache to zine-ify-v2  │
│  • Two-Font Cap (Fraunces + Plus      │ │  • Purge stale v1 HTML/CSS    │
│    Jakarta Sans with tabular-nums)    │ │  • Network-first for HTML/CSS │
│  • Flat tonal borders (1px solid)     │ └───────────────────────────────┘
│  • Sentence-case labels & unboxed     │
│    tabular-nums metadata counts       │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   GridStack 12-Column App-Screen Workbench              │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ Left Rail (w: 3)        │  │ Main Studio Stage (w: 9)             │  │
│  │ • Brand Sticker + Tools │  │ • Page Strip (90° Rotate, Reorder)   │  │
│  │ • Display Mode Switch   │  │ • Print Sheet Imposition Canvas      │  │
│  │ • Upload Dropzone (0/8) │  │ • On-Demand 3D Fold / Booklet /      │  │
│  │ • Settings & Export CTA │  │   Fold Guide Cards (Preview Fold)    │  │
│  └─────────────────────────┘  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Implementation Steps
1. **Fix Unstyled HTML & Stale Cache Delivery**:
   - Add `<link rel="stylesheet" href="/src/styles/index.css" />` to `<head>` in `index.html`.
   - Update the `<meta http-equiv="Content-Security-Policy">` tag in `index.html` so HTTPS/WSS preview connections, Google Fonts, and Vite scripts/styles load without CSP blocks.
   - Convert `tailwind.config.js` plugin imports to clean ESM imports compatible with `"type": "module"`, and bump `CACHE_VERSION` in `public/sw.js` to `zine-ify-v2` with network-first navigation/stylesheet handling so any cached unstyled page is immediately evicted.
2. **Enforce `taste-skill` Tokens & Surface Rules**:
   - Update design tokens so `--accent` (`#ff5555`) is the sole accent color, replacing secondary yellow (`#ffd166`) surface fills with calm tonal paper steps (`--surface-subtle`, `--surface-elevated`) and `1px solid` structural hairlines.
   - Replace heavy offset shadows (`3px 3px 0px`) and button gradients/glows on cards and small controls with flat tonal surfaces and crisp `1px` borders.
3. **Typography, Sentence-Case Labels & Unboxed `tabular-nums` Counts**:
   - Remove `text-transform: uppercase` and wide letter-spacing (`0.08em–0.16em`) from card headers, form labels, buttons, dropzone copy, and status counters.
   - Update copy and labels in `index.html` to clean sentence case while keeping the Zine-ify logo sticker in the Brand card and maintaining all test selectors (`#pageCountBadge`, `#sheetCountBadge`, `#view3dBtn`, `#generateBtn`, `.page-rotate-btn`, etc.).
   - Style `#pageCountBadge`, `#sheetCountBadge`, and status indicators as plain inline `tabular-nums` text without pill borders or background chips.

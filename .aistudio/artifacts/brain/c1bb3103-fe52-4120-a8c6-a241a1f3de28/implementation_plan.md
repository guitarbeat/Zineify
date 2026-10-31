# Realistic Pinned-End Slit & Clean Cut View

Refine the 3D **Cut** step (`4. Cut`) so all 8 panels stay seamlessly aligned along the top, bottom, and vertical fold creases, the center slit stays **pinned closed at both stop points** (`x = -w` and `x = +w`) while arching open in the center like real cut paper, all vertical red borders/bars are removed so **only the horizontal cut line is red**, and the large black banner is replaced with a **compact scissors icon**.

## User Review & Critical Decisions

> [!IMPORTANT]
> All choices confirmed in your answers are directly reflected below:

- **Confirmed Decision 1 — Pinned Closed at Stop Points, Arched Open in Center**: Instead of shifting the entire inner panels up and down (which made the vertical stop lines at `x = -w` and `x = +w` look cut and stepped), the slit vertices are **pinned to `0` at `x = -w` and `x = +w`** and arch open smoothly in the center (`x = 0`) using a cosine lens profile.
- **Confirmed Decision 2 — All 8 Panels Stay Aligned Around the Sheet Perimeter**: The top edge (`y = +h`), bottom edge (`y = -h`), and vertical fold lines (`x = -w` and `x = +w`) remain 100% flush and unbroken with the outer panels.
- **Confirmed Decision 3 — Remove Vertical Red Borders & Vertical T-Bars**: Remove the 4-sided red boxes on Pages 4, 3, 7, and 8 and the tall vertical red end-caps so **only the horizontal center slit is crimson red**, preventing any vertical fold crease from looking like a cut line.
- **Confirmed Decision 4 — Compact Scissors Icon**: Replace the large black `CUT CENTER SLIT HERE` pill banner and `STOP CUT` banners with a compact, unobtrusive **scissors icon (`✂`)** on the slit and small circular stop dots at the two endpoints.

---

## 1. Overview & Core Concept

- **What It Does**: Accurately models the physics of a single horizontal slit cut across the middle two columns of an 8-page zine sheet.
- **Why**: Previously, translating the entire inner panel rectangles vertically detached them from the outer columns along the vertical fold creases (`x = -w` and `x = +w`) and drew thick red vertical borders along those creases, making it look like an "H" cut or a punched-out hole. Pinning the corners at `(-w, 0)` and `(+w, 0)` and arching only the center of the slit makes the cut unmistakable.

---

## 2. User Experience & Visual Design

- **Sheet Continuity**:
  - Top edge (`Pages 5, 4, 3, 2`) and bottom edge (`Pages 6, 7, 8, 1`) remain in a single continuous horizontal line across all four columns.
  - Vertical creases at `x = -w`, `x = 0`, and `x = +w` use neutral gray fold guides (`#b8b8b8`)—never red.
- **Pinned-End Lens Slit Opening (`Step 4: Cut`)**:
  - At `x = -w` (between Pages 5/6 and 4/7) and `x = +w` (between Pages 3/8 and 2/1), the slit lips meet at a **closed point** (`gap = 0`).
  - Moving toward `x = 0`, the upper and lower lips arch smoothly apart (`±cos((x/w) * π/2)`) and lift slightly forward in 3D (`+Z`), forming a realistic eye/lens-shaped slit opening that reveals the dark cutting mat inside.
- **Compact Scissors & Dashed Horizontal Cut Line**:
  - A crisp **dashed crimson line** traces the upper and lower lips of the horizontal slit from `(-w, 0)` to `(+w, 0)`, terminating in small circular stop dots (`•`) at both ends.
  - A compact circular **`✂` scissors badge** sits cleanly at the center of the slit without covering the surrounding pages.

---

## 3. Technical Architecture & Vertex Deformation

```
  Top Sheet Edge (y = +h) — Continuous & Unbroken Across All 4 Panels
  ┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
  │                 │                 │                 │                 │
  │     Page 5      │     Page 4      │     Page 3      │     Page 2      │
  │                 │                 │                 │                 │
  │                 │        _.- ✂ -._│_.- - - -._      │                 │
  ├─────────────────● ─ ─ .-'─────────┼─────────'-. ─ ─ ●─────────────────┤
  │                 │     '-._        │        _.-'     │                 │
  │                 │         '- - - -┼- - - -'         │                 │
  │     Page 6      │     Page 7      │     Page 8      │     Page 1      │
  │                 │                 │                 │   Front Cover   │
  │                 │                 │                 │                 │
  └─────────────────┴─────────────────┴─────────────────┴─────────────────┘
                    ▲                                   ▲
             Pinned Closed                       Pinned Closed
             at (x = -w, y = 0)                  at (x = +w, y = 0)
```

- **Subdivided Inner Panel Meshes (`Zine3DViewer.js`)**:
  - Create dedicated `PlaneGeometry(w, h, 16, 12)` geometries for each panel so inner panels (`Pages 4, 3, 7, 8`) can smoothly deform along the slit edge while keeping their outer edges (`x = ±w` and `y = ±h`) locked at zero offset.
  - For each vertex `(vx, vy)` on an inner panel (`4, 3, 7, 8`):
    - Compute global `sheetX ∈ [-w, +w]` across the two inner columns.
    - Compute `arch = Math.cos((sheetX / w) * (Math.PI / 2))`, which equals `0` at `sheetX = -w` and `sheetX = +w`, and `1` at `sheetX = 0`.
    - Compute `slitProximity = Math.pow(1 - distFromCenterCrease / h, 2)`, which equals `1` at the `y = 0` slit and `0` at the top/bottom sheet edges (`y = ±h`).
    - Displace `y` by `(isTop ? +1 : -1) * cutInspection * maxOpenY * arch * slitProximity` and `z` by `cutInspection * maxLiftZ * arch * slitProximity`.
- **Arched Dashed Cut Line & Compact Scissors Badge**:
  - Position each dash along the upper and lower slit lips using the same `arch(x)` curve so the dashed red lines hug the parted paper edges and converge to a single closed point at `x = -w` and `x = +w`.
  - Render a lens-shaped dark interior mesh behind the parted lips that tapers to `0` height at `x = ±w`.
  - Replace the wide text callout and stop banners with a compact circular `✂` icon mesh and two small circular endpoint dots at `(-w, 0)` and `(+w, 0)`.

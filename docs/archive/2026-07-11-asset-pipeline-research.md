# AI Asset-Generation Pipeline — Research Findings & Recommendation

*2026-07-11. Deep-research run: 5 search angles, 15 sources fetched, 25 falsifiable claims extracted, 22 confirmed by 3-vote adversarial verification, 1 refuted, 2 unverified (rate-limited). Sources cited inline.*

## The question

Set up a pipeline (likely its own mini-repo) that mass-produces game-ready assets for Idle Adventure's real UI using AI image generation: terrain tiles, ~dozens of monsters, item/gear/consumable icons, UI elements, biome/town backdrops — delivered into a PWA/React app.

## 1. Art style: pixel art, and the reason is the pipeline, not nostalgia

The single most decision-relevant finding: **the "can AI do pixel art?" question splits by model type.**

- **General-purpose models (Gemini "Nano Banana" line, gpt-image, Flux)** output high-resolution images only — Gemini's image line has no native low-res output — so they produce anti-aliased "pixel-look" art whose implied grid drifts and whose colours aren't quantized. Every open-source repair tool exists *because* of this ([pixeldetector](https://github.com/Astropulse/pixeldetector), [spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper), [ComfyUI-PixelArt-Detector](https://github.com/dimtoneff/ComfyUI-PixelArt-Detector) — all confirmed).
- **Purpose-built models produce TRUE pixel art at native resolution.** [Retro Diffusion](https://retrodiffusion.ai/) (confirmed 3-0): single tiles 16–64px, wang tilesets 16–32px, sprites 64–384px depending on tier, built-in `remove_bg` transparency, and tileset-specific model variants. The claim "current AI models cannot produce grid-aligned pixel art" was **refuted** in verification precisely because specialized models can — the caveat only holds for generalist models.

**Why pixel art wins for us** (beyond model support):

1. **Style consistency becomes mechanical, not hopeful.** Coercing every asset to one fixed palette (Lospec palettes, k-means quantization — confirmed solved in multiple free tools) forces coherence across hundreds of assets as a *post-process guarantee*. Painterly art has no equivalent lever — consistency lives and dies in generation.
2. **Small sizes hide generation flaws.** A 32px tile has nowhere to put weird AI artifacts.
3. **Reference-image conditioning covers the rest.** Gemini 3.1 Flash accepts up to 10 object + 4 character reference images for consistency; Gemini 3 Pro blends up to 14 inputs (both confirmed). Retro Diffusion animation runs off a reference sprite. A "style bible" folder of ~10 approved anchor assets becomes a pipeline input.
4. The open-source fallback is also proven: SDXL + the pixel-art-xl LoRA + post-processing is the documented community stack (confirmed).

**Resolution guidance:** generate at the model's comfortable size, snap down to target. Suggested targets: 32px terrain tiles, 48–64px monsters, 24–32px item icons. Retro Diffusion can hit these natively; Gemini output goes through the snap/downscale stage.

## 2. Animation: static + CSS effects first; sprite sheets are ready when we want them

- Sprite sheets remain the delivery format, and **AI animation-from-a-reference-sprite is a shipping vendor feature, not hypothetical**: Retro Diffusion takes an input sprite (32–256px frames), generates 4/6/8/10/12/16 frames, and returns a **PNG spritesheet directly** via `return_spritesheet: true` (confirmed 3-0). Scenario hosts a dedicated "Retro Diffusion Animation" model (confirmed).
- The open-source [sprite-gen](https://github.com/aldegad/sprite-gen) pipeline (confirmed) demonstrates the full pattern: one reference drawing + an action list → per-action row strips → frame decomposition (connected-component analysis) → PNG atlas + JSON manifest with frame rects and per-state animation data.
- **But we're turn-based.** Most combat/gather feedback reads fine as CSS/shader effects on static sprites: bob, hit-flash, shake, fade, palette-swap. Recommendation: **v1 ships static sprites + CSS effects; per-monster idle/attack animation is a later, cheap add** ($0.14–0.25/animation via RD) once the static set is locked.

## 3. Web delivery for the 20×60 grid

- **Format:** PNG sprite atlas + JSON manifest (frame rects keyed by name) — the confirmed sprite-gen pattern. Pixel-art PNGs at 32px are tiny; atlasing is about request count and cache atomicity, not bytes. WebP/AVIF gains are negligible at these sizes and lossy modes can smear pixel edges.
- **Rendering pixel art crisp** (both MDN claims confirmed): `image-rendering: pixelated` on the scaled elements, and **integer scale factors only** — non-integer `devicePixelRatio` (e.g. 110% browser zoom) draws pixels at unequal sizes. The UI should pick the largest integer scale that fits rather than scaling fluidly. Canvas `drawImage` has the same integer-multiple constraint.
- **DOM vs canvas:** 20×60 = 1,200 cells, turn-based, re-render-on-action (our existing model). DOM divs with atlas `background-position` is fine at this scale and keeps the current "re-render from state" architecture; `@pixi/tilemap`/WebGL is the escalation path only if we later want smooth scrolling/particles (this claim went unverified — treat as plausible, not load-bearing).
- UI chrome (panels, buttons): CSS + a few SVGs; doesn't need the generation pipeline at all, or uses it only for decorative elements. Same pipeline *stages* apply when it does (palette, QA), different target sizes — so one pipeline, per-kind profiles.

## 4. Pipeline mechanics (the confirmed recipe)

**Transparency:**
- Retro Diffusion: native — `remove_bg: true` returns transparent output (confirmed). No chroma-key step needed.
- Gemini: returns **base64 PNG/JPEG only, no alpha documented** (confirmed) → prompt for a solid magenta background and chroma-key it out (the confirmed [spriteforge](https://github.com/hassard0/spriteforge) pattern). Use **soft-alpha unmixing** rather than hard keying to keep anti-aliased edges (confirmed sprite-gen technique).

**Post-processing chain (all steps have free, confirmed tooling):**
1. Decode (base64 → PNG).
2. Background removal (skip for RD; chroma-key for Gemini).
3. **Pixel-snap + true-res downscale**: detect implied pixel size, snap to uniform grid, nearest-neighbour downscale — pixeldetector (MIT) or spritefusion-pixel-snapper (detects pixel size, snaps grid, k-means palette quantization, preserves dithering).
4. **Palette coercion** to the game's fixed palette — multiple confirmed algorithms (PIL quantize, OpenCV/pyclustering k-means), Lospec palette loading, palette-from-reference-image. *Yes to limiting the palette* — it's the coherence lever (see §1).
5. Trim/pad to target cell size; pack into atlas + JSON manifest.

## 5. AI layers beyond generation: yes, and we're unusually well-positioned

Confirmed real-world patterns:
- **Vision → description → generate**: spriteforge runs a Gemini vision model over a reference image to produce a structured character description, then prompts the image model with it (confirmed 2-1).
- **Catalog → prompt → generate → decompose → atlas**: sprite-gen end-to-end (confirmed).

Our specific advantage: **the asset manifest already exists — it's `src/data/`.** Every monster, material, tool, food, and biome is a defId in a typed catalog. The pipeline's first stage is a diff: `defIds in catalog − assets on disk = work list`. That's the same invariant-test pattern we just beaded for recipes (idle-adventure-7dt), pointed at art. New content added to the game data automatically becomes a pending asset.

Recommended AI stages:
1. **Prompt expansion (LLM):** catalog row (defId, kind, tier/gate, biome, existing flavor text) + style bible → generation prompt. Cheap, deterministic-ish, reviewable as text before spending on images.
2. **Vision QA gate:** after post-processing, a vision model scores each candidate: style-bible match, silhouette readability *at actual render size* (downscale before judging!), background cleanliness, palette compliance (this one's checkable in code, not AI). Auto-retry up to N with prompt feedback.
3. **Human review board:** a generated contact-sheet HTML page per batch (asset at 1×/2×/4× on light/dark/terrain backgrounds) with approve/reject. Human stays the final gate; the AI layers exist to make the human review 30 good candidates instead of 300 raw ones.

## 6. Costs & vendors (mid-2026, confirmed where marked)

| Vendor | Role | Pricing (confirmed) | Notes |
|---|---|---|---|
| **Retro Diffusion** | Primary: tiles, sprites, icons, tilesets, animation | Fast ~$0.03 / Plus ~$0.06 / Pro $0.18 per image; animation $0.14–0.25 | True pixel res, `remove_bg`, wang tilesets, spritesheet output; 429+Retry-After; keyless `/v1/status` before batches |
| **Gemini image (Nano Banana)** | Backgrounds, non-pixel art, vision QA, prompt expansion | Tiering confirmed (3.1-flash-lite / 3.1-flash / 3-pro-image), per-image price unverified | Reference-image consistency (10 obj + 4 char); base64 PNG/JPEG, no alpha |
| **SDXL + pixel-art-xl LoRA** | Open-source fallback / local batch | GPU time only | The confirmed community stack; ComfyUI post nodes exist |
| Scenario.gg | Hosts RD models + LoRA training UI | unverified | Convenience layer over the same models |

Ballpark for our whole catalog: ~200 assets × 4 candidates × $0.06 ≈ **$50** on RD Plus. Generation cost is a non-issue; the scarce resource is review attention — which is what the QA stages optimize.

**⚠️ Unresolved:** commercial-licensing terms for RD/Scenario output were not verified in this run — read the ToS before committing (flagged as pipeline-bead task). **Update (48l.2, 2026-07-11):** RD is explicitly built and sold for commercial game assets (paid API, marketed "for Games & Sprites"); paid output is usable in the game — no POC blocker. The `/terms` page is JS-rendered (not machine-fetchable), so the exact clause wasn't captured verbatim. General legal caveat (industry-wide, not RD-specific): purely AI-generated art gets **no US copyright protection** — shippable, but you can't stop others copying it. Irrelevant for a POC; **read the exact ToS clause at retrodiffusion.ai/terms before any commercial launch.**

## Recommended architecture — `idle-adventure-assets` mini-repo

```
manifest  →  prompt  →  generate  →  post  →  qa  →  pack  →  deliver
(diff vs     (LLM +      (RD API;     (snap,   (vision  (atlas   (PNG atlas +
 src/data)    style       Gemini for   palette, gate +   + JSON)   manifest.json
              bible)      backdrops)   trim)    retry)             → game repo)
```

- **Build** (thin, bun/TS like the game): manifest differ reading the game's `src/data` via import; prompt expander; API clients; orchestrator with per-kind profiles (tile/monster/icon/backdrop: sizes, model, palette, QA thresholds); contact-sheet reviewer.
- **Buy/use:** generation (RD + Gemini APIs); post tools (pixeldetector / pixel-snapper — Python, shell out or port the ~simple algorithms); free atlas packing.
- **State:** every asset stores its provenance (prompt, model, seed/params, QA scores) in a sidecar JSON — regeneration and style-drift audits need it.
- **Deliver:** the game repo consumes only the packed atlas + manifest, keyed by defId. The web app never knows the pipeline exists.

**Decisions needed before building:** art direction sign-off (pixel art? tile size? palette — pick a Lospec palette or derive one), RD licensing check, and whether backdrops are pixel-consistent or a deliberately different painted style.

## Pilot findings (48l.7 — 2026-07-11)

Ran 5 real catalog assets through Retro Diffusion end-to-end with zero infrastructure (throwaway Python), then the review ladder: Claude first-gate → user judgment (hosted contact-sheet artifact) → **GO verdict, build the pipeline stage-by-stage.** 20 candidates, $0.54 spent.

**Assets & styles that worked** (live `/v1/styles/selector`, auth `X-RD-Token`):
- terrain tile → `rd_tile__single_tile` **and** `rd_plus__mc_texture` — *both tile seamlessly* (verified 3×3 self-adjacency). `mc_texture` is the more uniform ground/stone. Native 32px, no `remove_bg`.
- monster → `rd_plus__default`, 64px native, `remove_bg:true` → clean RGBA.
- icon → `rd_plus__topdown_item`, `remove_bg:true`.
- Cost dry-run: POST `/v1/inferences` with `check_cost:true` returns `balance_cost` free — **always price a batch before spending.**

**Verified vendor facts (this run):** RD returns **true native pixel resolution** — 32px tiles came back as exact 32×32 grids, 64px sprites as clean 64px RGBA. The heavy pixel-snap stage the research feared is a *Gemini* problem; for RD it's near-nil. Response shape: `{ base64_images: [raw-b64-png], balance_cost, remaining_balance, model }`, no `data:` prefix. New account seeded ~$5 balance; 429 carries Retry-After.

**Calibration findings baked into the pipeline profiles:**
1. **Sizes locked at 32 (terrain) / 48 (monster) / 24 (icon)** — user confirmed the downscaled target sizes are right. Generate at a clean multiple of the target and **nearest-neighbour snap** — the pilot's non-integer 64→48 / 64→24 LANCZOS downscale smeared the grid and made sprites read "taller than wide." Never non-integer downscale pixel art.
2. **24px weapon icons** — a thin vertical blade collapses to ~1px and nearly vanishes at 24px. User held the 24px cell, so fix via **prompt composition** (diagonal, chunkier blade filling the frame), not a bigger cell.
3. **Prompt vocabulary matters** — "grass tile" rendered as bare dirt; terrain prompts need explicit "mossy/overgrown green." Feeds the 48l.2 style-bible prompt preamble.
4. **Grid busy-ness risk** — tiles are high-frequency speckle with no larger-scale structure; may read noisy tiled across the 20×60 board. Deferred to the in-game trial (folded into 48l.6 game consumption).

**Winners (user pick):** leftmost/#1 candidate for every asset (boar_1, iron-sword_1, ration_1, plains_1, mountain_1). Pilot artifacts (candidates, contact sheet, gen/post scripts) live in the session scratchpad; not committed (throwaway by design).

# ARC / Light Studies

[Open the demo](https://tront.xyz/ltc/) · [Trent Sterling](https://tront.xyz/)

A standalone Three.js lab for polygonal area-light shading with Linearly
Transformed Cosines. Draw what a light emits, work the receiving material, and
inspect a shading point or compare it with a progressively sampled reference.

Seven scenes: After Hours, Visibility study, Nocturne, Softbox studio, Impact
range, Surface works, and Reference studio. Everything needed to run is embedded
in `index.html`. Download it from Options and open locally; no runtime CDN,
account, upload service, or server is required.

## Version 5.0

- Contextual selection: click a surface or emitter, edit it in one panel, inspect
  it, then return to the selected tool. Responsive desktop and phone layouts.
- Emission editor: draw, erase, undo, stamps, local PNG/JPEG/WebP import, and
  pulse/scroll/sweep animation. Painted emission feeds both lighting paths.
- Surface brushes: coating, polish, scuff, restoration, spray and wipe; soft
  edges, continuous strokes, aligned cursor and undo. These are authored finish
  edits, not fluid physics or an anisotropic BRDF.
- After Hours: a painted storefront sign, pavement, curved metal bench, movable
  maintenance panel, camera bookmarks and an interruptible light sweep.
- Visibility study: one horizontal rectangular constant emitter and one planar
  rectangular blocker, with translation, height, size and yaw controls. The
  inspector shows the blocked region and subtracted LTC integral. Compare
  supports sampled GGX and an independently ray-tested fitted LTC reference,
  separating visibility error from the GGX approximation.
- Versioned local setup files retain emission images, animation, surface maps,
  finishes, camera and blocker settings. v3/v4 files remain readable.
- Repeatable desktop performance script with controlled camera paths, light and
  edge counts, painted emission, paired shadow cases, separate filtering/shading
  GPU queries and JSON containing hardware, resolution and raw samples.

## Controls

- **Scene menu:** choose an environment. **Explore / Surface / Light:** tools.
- **Inspect:** Explain or Compare. **Back to scene** or **Escape:** return.
- Drag to orbit, right-drag to look, wheel to dolly; WASD to move, Q/E vertically.
- Choose a brush to start painting; stop brushing to orbit with the left button.
  Right-drag still looks around. Ctrl/Cmd+Z undoes a surface edit.
- **Options:** save/open setup, download HTML, photo mode, graphics and help.
- **Paper:** citations and scope. On phones: Options > Paper & credit.

Requires JavaScript, WebGL 2 and floating-point render targets. The GGX fit and
textured-emission filtering are approximations. Shadows are restricted to the
one-blocker stage; other scenes use unshadowed direct lighting. There is no
indirect illumination or reflection of non-emissive scene geometry. Box UVs can
repeat a stroke on multiple faces; the new curved bench has continuous UVs.
Scene changes retain edits in memory; save a setup to keep the current scene
across page reloads.

## Research and third-party credit

**Eric Heitz, Jonathan Dupuy, Stephen Hill, and David Neubelt.**
*Real-Time Polygonal-Light Shading with Linearly Transformed Cosines.*
ACM Transactions on Graphics 35(4), SIGGRAPH 2016.

- [Authors' project](https://eheitzresearch.wordpress.com/415-2/)
- [Publication / DOI](https://doi.org/10.1145/2897824.2925895)
- [Reference code](https://github.com/selfshadow/ltc_code)

**Aakash KT, Parikshit Sakurikar, and P. J. Narayanan.**
*Fast Analytic Soft Shadows from Area Lights.* EGSR 2021.
[Publication](https://diglib.eg.org/items/b4d101ec-840e-4269-b549-ef16ea70d8f9).
The controlled stage follows visible-emitter integration, using an original,
restricted implementation. It does not implement the paper's general algorithm.

The inherited lookup tables were regenerated locally, not copied from the
published binary tables. The fitting source and retained Three.js MIT / LTC
reference license notices are embedded in the HTML. Paper and Help retain the
research attribution and technical notes.

## Development and verification

Edit `src/lab.js`, `src/shaders.js`, `src/v5*.js`, and the CSS/UI sources, then run
`python tools/embed-ui.py`. The result remains one standalone HTML document.

Install the pinned dependency with `npm install` and Chromium with
`npx playwright install chromium`. Run `npm test` for baseline, v5 editing,
setup and delivery checks. `npm run test:shadows` runs the longer GPU reference
comparison. Set `LTC_HARDWARE=1` for native GPU baseline tests; otherwise that
suite defaults to software WebGL. New v5 tests explicitly use native Chromium.

`node qa/benchmark.cjs` exports `qa/benchmark-results.json`. It warms the complete
24-position path before measuring 24 positions per case. GPU timing uses
`EXT_disjoint_timer_query_webgl2`; unavailable/disjoint timings are null. The
fallback blocking wall time includes submission and synchronization. Shadow
work runs inside shading, so its incremental cost is the matched off/on
comparison, not a separately timed pass. These are desktop measurements, not
headset results or a portable performance guarantee.

`node qa/capture.cjs` captures the social image; `node qa/thumbnails.cjs` captures
the scene previews. Both use the actual renderer. QA screenshots and JSON
receipts are ignored by Git. See [VALIDATION.md](VALIDATION.md) for release evidence
and [ROADMAP.md](ROADMAP.md) for remaining research work.

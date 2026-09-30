# ARC / Light Studies

[Open the demo](https://tront.xyz/ltc/) · [Trent Sterling](https://tront.xyz/)

An interactive Three.js lab for polygonal area-light shading with Linearly
Transformed Cosines. Paint the receiving materials, reshape the emitter, then
inspect a shading point or compare against a progressively sampled GGX reference.

Five scenes: Nocturne, Softbox studio, Impact range, Surface works, and Reference
studio. Everything needed to run the demo is embedded in `index.html`. Download
it from Options and open it locally; no server or runtime CDN is required.

## Controls

- **Scenes:** choose an environment. **Scene / Paint / Lights:** contextual tools.
- **Inspect:** Explain or Compare. **Back to scene** or **Escape:** return.
- Drag to orbit, right-drag to look, wheel to dolly; WASD to move, Q/E vertically.
- **Options:** save/open a setup, download the HTML, photo mode, graphics, help.
- **Paper:** citation, research links, and scope. On phones, use Options → Paper & credit.

Requires JavaScript, WebGL 2, and floating-point render targets. This is
unshadowed direct lighting with an approximate GGX fit and approximate textured
emission filtering. It does not provide cast shadows, indirect illumination,
or reflections of non-emissive scene geometry.

## Research and third-party credit

**Eric Heitz, Jonathan Dupuy, Stephen Hill, and David Neubelt.**
*Real-Time Polygonal-Light Shading with Linearly Transformed Cosines.*
ACM Transactions on Graphics 35(4), SIGGRAPH 2016.

- [Authors' project](https://eheitzresearch.wordpress.com/415-2/)
- [Publication / DOI](https://doi.org/10.1145/2897824.2925895)
- [Reference code](https://github.com/selfshadow/ltc_code)

The lookup tables were regenerated locally, not copied from the published binary
tables. The fitting source and retained Three.js MIT / LTC reference license
notices are embedded in the HTML. The interface's Paper and Help panels retain
the research attribution and technical notes.

## Development

`index.html` is the standalone application. The publication UI sources in
`src/ui.css` and `src/ui.js` are embedded with `python tools/embed-ui.py` after
editing. No bundler is needed for the renderer.

Browser QA: install the pinned dev dependency with `npm install`, install Chromium
with `npx playwright install chromium`, then run `npm test`. Software WebGL is the
default; set `LTC_HARDWARE=1` to exercise the native graphics path. `LTC_URL` can
point the same checks at a served page. Screenshots and JSON receipts go in `qa/`
and are excluded from source control. `node qa/capture.cjs` captures the OG image
from the actual renderer.

### Version 4.1.0

Publication pass over Light Studies v4: metadata and OG image, portfolio/source
links, offline download, keyboard-contained dialogs, explicit photo-mode exit,
reachable panel controls on phones, larger touch controls, and graphics recovery
actions. The lighting technique and five scenes are preserved.

Validated in Chromium on an RTX 5070 Ti via ANGLE/D3D11: **63 checks passed**
(60 rendering/interface checks and 3 download/graphics-recovery checks).
These are correctness and interaction checks, not a GPU performance benchmark.

See [ROADMAP.md](ROADMAP.md) for the separate next-version work.

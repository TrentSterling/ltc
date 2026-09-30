# V5 release validation

Verified on Windows 11 in Chromium with ANGLE/D3D11 on an NVIDIA RTX 5070 Ti.

- Baseline suite: 60 checks passed, including all original scenes, inspection,
  comparison, keyboard dialogs, setup round trips, offline operation and five
  responsive viewport sizes.
- V5 suite: 14 grouped checks passed for emission strokes/undo, scene persistence,
  curved-surface painting, save/restore, rejection without mutation, selection
  restoration, independent visibility quadrature and editor layouts.
- Editing workflow suite: 10 checks covering real pointer selection, continuous
  strokes, UI undo, movable panel, sweep cancellation, imported image reaching
  the GPU atlas, animation, blocker dragging, legacy files and scene reset.
- Delivery suite: 3 checks passed for exact standalone download, unsupported
  graphics recovery and context-loss recovery.

The GPU visibility test compares four receiver neighborhoods against 8,192
independent ray-tested fitted-LTC samples per emitter. Maximum relative error
was 0.117%. Dense independent CPU area quadrature at four points had maximum
absolute integral error 0.00000211. These sampled checks validate the restricted
stage, not arbitrary scenes or the accuracy of the LTC approximation to GGX.

The performance study runs six cases over a complete 24-position warm-up path
and 24 measured positions. It exports separate filtering/shading GPU queries,
blocking wall time, camera positions, resolution, hardware and raw samples.
Shadow work is part of shading; compare the paired off/on runs. Shared-machine
load and driver behavior affect these short runs, so they are diagnostic data,
not a performance guarantee. No headset performance claim is made.

Reproduce with `LTC_HARDWARE=1 npm test`, `npm run test:shadows`, and
`npm run benchmark`. In PowerShell set `$env:LTC_HARDWARE='1'` before `npm test`.
JSON receipts and screenshots are written to `qa/` and ignored by Git.

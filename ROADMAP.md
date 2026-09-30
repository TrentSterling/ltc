# Next version

The next major iteration builds on this published baseline. These are planned
experiments, not features present in v4.1.

1. **A deliberate UI redesign.** Keep one scene picker, contextual editing tools,
   and a clear inspection entry/exit. Audit complete tasks on desktop and touch:
   editing a light, painting a surface, comparing a result, saving, and returning
   to the scene. Improve hierarchy and discoverability without deleting advanced
   controls. Avoid accumulating permanent tabs and unrelated gadgets.
2. **Controlled shadow stage.** Investigate a constant rectangular emitter and
   one movable convex blocker. Show blocked and visible emitter regions in the
   inspector. Validate against a sampled visibility reference before expanding
   geometry or combining it with textured lights. Review and credit the relevant
   follow-up research before implementation.
3. **Paint the emitter.** A small emission canvas with drawing, erasing, stamps,
   local image import, and simple pulse/scroll/sweep animation. Keep emission
   texture editing separate from polygon-outline editing; expose filtering error
   in Compare.
4. **Improve surface painting.** Surface-aligned brush feedback, continuous fast
   strokes, predictable undo, spray/wipe interactions, and directional polishing
   trails. Describe these as authored material edits rather than physical fluid
   or abrasion simulations.
5. **After Hours.** A composed night storefront scene: editable luminous sign,
   pavement, curved metal bench, and movable maintenance panel. Add short,
   interruptible demonstrations of light sweeping over different finishes.
6. **Repeatable performance study.** Controlled camera paths and light counts;
   solid versus textured emitters, edge counts, and overlapping lights. Measure
   shading, filtering, and shadow work separately where supported. Export results
   with hardware and resolution. Keep desktop results distinct from headset tests.
7. **Anisotropic brushing.** A separate material-model milestone with the correct
   anisotropic GGX fit, lookup scheme, comparison reference, and research credit.
   Brush direction should alter the material response, not stretch an existing
   highlight as a visual substitute.

Keep the standalone HTML deliverable, prominent paper attribution, explicit
approximation boundaries, and rendering/interaction regression checks throughout.

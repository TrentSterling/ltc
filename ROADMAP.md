# After v5

V5 delivers the contextual UI, emitter painting, improved surface brushes,
After Hours, controlled analytic shadows, and a repeatable desktop performance
study. The standalone HTML and research attribution remain part of the release.

The next material milestone is **anisotropic brushing**: use an appropriate
anisotropic GGX fit, lookup scheme and independent reference. Brush direction
must alter the material response, rather than stretching an isotropic highlight.

Future shadow research should expand beyond the current horizontal rectangular
emitter and single planar blocker only after independent visibility validation.
Multiple blockers, textured emission with occlusion, arbitrary scene geometry,
and general scene shadows are not supported by the v5 stage.

Performance work can extend the exported desktop study with GPU-specific
analysis, more geometry and light overlap scenarios, and separate headset runs.
Desktop results must not be presented as headset performance.

# GCSE practical assessment

Open **Assessment mode** in the GCSE lab, or open a specific practical directly with a URL such as `/?assessment=antibiotics`.

## Build the setup

The bench starts empty and uses the main practical's Three.js room and apparatus geometry. Drag a numbered equipment label onto it. Nearby compatible components snap together; connected child parts follow their support when it moves. Drag a child away to detach it. Independent tools can sit anywhere on the bench.

- **Check my setup** evaluates equipment selection, actual connection geometry and applicable arrangement rules.
- **Remove** returns the selected piece to the library. **Clear bench** removes everything. **Undo** restores the previous arrangement.
- Keyboard: focus an equipment label and press Enter to add/select it. On the bench, use the arrow keys to move it (Shift for finer movement), Enter to snap, Delete to remove, and Escape to cancel a move.
- A cancelled drag or a drop outside the bench preserves the previous arrangement.

## Method, evaluation and feedback

Method steps and answer options are shuffled for each new attempt. Steps can be dragged or moved with their arrow buttons. Method order and scientific explanations are checked independently. All answer text wraps, and sections scroll at smaller viewport sizes.

Changing checked work clears that section's old score until it is checked again. Results show a practice score, section breakdowns and next steps, with a downloadable feedback report. These scores are not exam-board GCSE grade predictions.

## Implementation

- `assessment-ui.js` / `.css`: full-viewport native interface, accessible controls, feedback and results.
- `assessment-bench.js` / `.css`: pointer/keyboard interaction, 3D scene and visual connections.
- `assessment-models.js`: individual apparatus models and physical attachment anchors.
- `assessment-assembly.js`: DOM-independent assembly definitions, snapping, bounds and evaluation.
- `assessment.js`: practical questions and session/score management.

Assembly positions use a 1000 × 600 coordinate system with bottom-centre anchors. Each connection defines two item IDs, a relative offset and tolerance. Marks are recomputed from positions, never awarded from a remembered snap alone. Electrical connections also define terminal locations and visible leads. Model anchors seat visually different glassware sizes without changing the scoring coordinates.

There are dedicated assemblies for the six detailed practicals, with additional circuit/support relationships for applicable practicals. Other practicals retain all their equipment and assess selection; unrelated tools are not forced into artificial connections. The scene is a guided spatial assembly exercise, not a general circuit or rigid-body physics simulator.

## Verification

`node qa_assessment_assembly.mjs` checks all 41 practical definitions, attainable full-mark arrangements, snapping/detaching, boundaries and score integration.

`npm run test:assessment` additionally runs the browser interaction suite using this workspace's existing Playwright loader. It covers real dragging, keyboard controls, undo, method ordering, all assessment stages, responsive layouts and all practical equipment libraries. Screenshots and the browser report are saved to `output/playwright/assessment-spatial/`.

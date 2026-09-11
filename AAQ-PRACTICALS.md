# OCR AAQ Human Biology practicals

Choose **OCR AAQ Human Biology** in the qualification dropdown. The original GCSE Chemistry, Biology and Physics workspace stays available under **OCR GCSE Combined Science**. Switching courses preserves the current GCSE setup and the Human Biology results for the open page.

Each activity has a Three.js equipment scene, four guided stages, an adjustable condition, a live measurement, a results notebook, CSV export and a practice question. Use **New trial** to repeat or compare conditions. **Reset** clears only the selected Human Biology practical. Method cards preview the corresponding setup; previews do not automatically record a reading.

## Topic mapping

Mapped against the [OCR Human Biology specification, version 7, June 2026](https://www.ocr.org.uk/Images/697578-specification-cambridge-advanced-national-in-human-biology.pdf). These are original learning activities; topic links are included in the app.

| Activity | Main unit |
| --- | --- |
| Calibrated microscopy | F173 |
| DNA sample preparation | F172 |
| DNA electrophoresis | F173, linked to F172 |
| Protein colorimetry | F173 |
| Cell fractionation | F170 |
| Respiration and metabolism | F174 |
| Lipase and digestion | F174 |
| Biochemical food tests | F173 |
| Spirometry | F170 |
| Cardiovascular response | F170 |
| Visual response time | F176 |
| Antimicrobial screening | F177 |

This is a selected suite of practical learning activities, not complete qualification coverage or an OCR prescribed list. F175 is not represented. Several activities use supporting models to explore specification concepts rather than reproduce a specified laboratory protocol. Simulation outputs do not replace practical competence or authentic hands-on NEA evidence.

## Models and data

All readings are synthetic and deterministic. Identical conditions give identical readings; a zero repeat range is not a claim of zero uncertainty in real experiments. Biological response curves and DNA recovery are illustrative. Dimensional calculations include magnification, centrifugal force, ventilation, cardiac output and free-fall time. Antimicrobial zones are not clinical efficacy rankings, and the ruler activity is a conscious visual response rather than a spinal reflex.

Protein colorimetry uses a linear teaching calibration and allows estimation of a model unknown only after recorded standards bracket its concentration. Food-test colours are displayed as observations rather than plotted as continuous numeric measurements. CSV files identify their synthetic origin. Notes and results remain in memory for the open page and are not stored remotely.

## Development

- `aaq-catalog.js`: content, course mapping, conditions and questions.
- `aaq-models.js`: calculations and repeat summaries.
- `aaq-scene.js`: apparatus, lighting and animations.
- `aaq.js` / `aaq.css`: qualification switch and Human Biology interface.
- `qa_aaq.mjs`: browser and model regression checks. Requires Playwright; this workspace also provides `qa_playwright_loader.mjs` for its installed Chrome runtime.

Run `npm start`, then open the local server. `?course=aaq` opens Human Biology directly. Run `npm run vercel-build` to package all assets in `public/`. The existing deployment workflow is unchanged.

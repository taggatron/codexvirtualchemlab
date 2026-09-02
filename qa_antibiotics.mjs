import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/antibiotics-qa';
const url = process.env.LAB_URL || 'http://127.0.0.1:4177/';
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`${url}?antibiotics-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const click = async (x, y = 837) => { await page.mouse.click(x, y); await page.waitForTimeout(100); };
const capture = async name => { await page.waitForTimeout(180); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); return state(); };

await click(320, 32);                 // Biology subject
await click(130, 343);                // Antibiotic-disc practical
const initial = await capture('01-aseptic-field-ready');

await click(381);                     // prepare aseptically
await advance(2800);
const disinfecting = await capture('02a-plate-lifted-wipe-underneath');
await advance(1450);
const wipeToWaste = await capture('02b-used-wipe-to-waste');
await advance(800);
const wipeDisposal = await capture('02c-used-wipe-disposed');
await advance(300);
const flippedBeforeMarker = await capture('02d-plate-flipped-before-marker');
await advance(900);
const undersideMarking = await capture('02e-marker-on-exposed-underside');
await advance(1050);
const disinfected = await capture('03-sterile-field-prepared');

await click(381);                     // inoculate
await advance(2350);
const inoculating = await capture('04-minimum-lid-opening-and-swabbing');
await advance(3050);
const inoculated = await capture('05-bacterial-lawn-inoculated');

await click(381);                     // place discs
await advance(2750);
const placing = await capture('06-forceps-placing-coded-discs');
await advance(2600);
const discsPlaced = await capture('07-all-discs-equally-spaced');

await click(381);                     // tape, invert, incubate
await advance(1750);
const inverting = await capture('08-cross-taped-and-inverting');
await advance(2250);
const growing = await capture('09-lawn-and-zones-developing');
await advance(3400);
const grown = await capture('10-grown-sealed-plate');

await click(381);                     // measure through lid
await advance(1500);
const measuring = await capture('11-ruler-measuring-zones');
await advance(4050);
const complete = await capture('12-results-complete');

const practical = complete.antibiotic_disc_practical;
const summary = {
  errors,
  renderer: initial.renderer,
  initial_phase: initial.antibiotic_disc_practical?.phase,
  disinfecting_phase: disinfecting.antibiotic_disc_practical?.phase,
  plate_lifted_for_underplate_wipe: disinfecting.antibiotic_disc_practical?.aseptic_technique?.plate_lifted_for_underplate_wipe,
  wipe_under_plate: disinfecting.antibiotic_disc_practical?.aseptic_technique?.wipe_under_plate,
  wipe_moving_to_waste: !wipeToWaste.antibiotic_disc_practical?.aseptic_technique?.used_wipe_disposed_after_cleaning,
  used_wipe_disposed: wipeDisposal.antibiotic_disc_practical?.aseptic_technique?.used_wipe_disposed_after_cleaning,
  plate_flip_fraction_before_marker: flippedBeforeMarker.antibiotic_disc_practical?.aseptic_technique?.plate_flip_fraction_before_marking,
  marker_on_exposed_underside: undersideMarking.antibiotic_disc_practical?.aseptic_technique?.marker_writing_on_exposed_underside,
  disinfectant_label: initial.antibiotic_disc_practical?.aseptic_technique?.disinfectant?.label,
  bench_disinfected: disinfected.antibiotic_disc_practical?.aseptic_technique?.bench_disinfected,
  inoculation_phase: inoculating.antibiotic_disc_practical?.phase,
  minimal_lid_opening: inoculating.antibiotic_disc_practical?.aseptic_technique?.minimal_lid_opening,
  swab_tip: inoculating.antibiotic_disc_practical?.aseptic_technique?.inoculating_swab_tip,
  discs_placed: discsPlaced.antibiotic_disc_practical?.discs?.filter(disc => disc.placed).length,
  inverted: inverting.antibiotic_disc_practical?.plate?.inverted_for_incubation,
  growing_fraction: growing.antibiotic_disc_practical?.plate?.bacterial_lawn_growth_fraction,
  incubation_hours: grown.antibiotic_disc_practical?.incubation?.duration_hours,
  measuring_count: measuring.antibiotic_disc_practical?.measurement?.measured_count,
  final_results: practical?.results,
  conclusion: practical?.conclusion,
  complete: complete.complete,
  tab: complete.tab,
  safety: practical?.safety,
  sidebar: complete.right_sidebar_layout
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!initial.renderer?.enabled) throw new Error('WebGL renderer is not enabled.');
if (!initial.antibiotic_disc_practical) throw new Error('Antibiotic practical did not load from the Biology rail.');
if (initial.antibiotic_disc_practical.aseptic_technique.disinfectant.label !== '70% IMS') throw new Error('Disinfectant label is not 70% IMS.');
if (disinfecting.antibiotic_disc_practical.stage !== 1 || !disinfecting.antibiotic_disc_practical.aseptic_technique.plate_lifted_for_underplate_wipe || !disinfecting.antibiotic_disc_practical.aseptic_technique.wipe_under_plate) throw new Error('Plate lift and under-plate wipe sequence failed.');
if (!wipeDisposal.antibiotic_disc_practical.aseptic_technique.used_wipe_disposed_after_cleaning) throw new Error('Used wipe was not disposed after cleaning.');
if (flippedBeforeMarker.antibiotic_disc_practical.aseptic_technique.plate_flip_fraction_before_marking < .98 || !flippedBeforeMarker.antibiotic_disc_practical.aseptic_technique.plate_flipped_before_underside_marking) throw new Error('Plate did not flip fully before underside marking.');
if (!undersideMarking.antibiotic_disc_practical.aseptic_technique.marker_writing_on_exposed_underside || undersideMarking.antibiotic_disc_practical.aseptic_technique.plate_flip_fraction_before_marking < .98) throw new Error('Marker did not write while the underside was exposed.');
if (!disinfected.antibiotic_disc_practical.aseptic_technique.bench_disinfected) throw new Error('Aseptic preparation sequence failed.');
if (inoculating.antibiotic_disc_practical.stage !== 3 || !inoculating.antibiotic_disc_practical.aseptic_technique.minimal_lid_opening) throw new Error('Aseptic inoculation sequence failed.');
if (!inoculating.antibiotic_disc_practical.aseptic_technique.swab_tip_clear_of_table_and_agar || inoculating.antibiotic_disc_practical.aseptic_technique.inoculating_swab_tip.clearance_above_agar < 0) throw new Error('Inoculating swab tip dropped below the agar or table.');
if (discsPlaced.antibiotic_disc_practical.discs.filter(disc => disc.placed).length !== 4) throw new Error('Not all four coded discs were placed.');
if (!grown.antibiotic_disc_practical.plate.cross_taped_not_circumference_sealed || !grown.antibiotic_disc_practical.plate.inverted_for_incubation || grown.antibiotic_disc_practical.incubation.duration_hours !== 48) throw new Error('Safe incubation state failed.');
if (!practical || practical.results.length !== 4 || !complete.complete || complete.tab !== 'graph') throw new Error('Measurement completion/results state failed.');
const diameters = practical.results.map(result => result.zone_diameter_mm);
if (JSON.stringify(diameters) !== JSON.stringify([18, 24, 30, 0])) throw new Error(`Unexpected zone diameters: ${diameters.join(', ')}`);
if (practical.discs.find(disc => disc.code === 'C')?.measured_zone_diameter_mm !== 0) throw new Error('Sterile-water control should have a 0 mm inhibition zone.');
if (!practical.safety.plate_never_reopened_after_incubation) throw new Error('Closed-plate safety state is missing.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();

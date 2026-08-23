import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/antibiotics-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4177/?antibiotics-qa=${Date.now()}`, { waitUntil: 'networkidle' });
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
await advance(1650);
const disinfecting = await capture('02-disinfecting-and-wiping');
await advance(1850);
const disinfected = await capture('03-sterile-field-prepared');

await click(381);                     // inoculate
await advance(2350);
const inoculating = await capture('04-minimum-lid-opening-and-swabbing');
await advance(2350);
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
await advance(1950);
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
  bench_disinfected: disinfected.antibiotic_disc_practical?.aseptic_technique?.bench_disinfected,
  inoculation_phase: inoculating.antibiotic_disc_practical?.phase,
  minimal_lid_opening: inoculating.antibiotic_disc_practical?.aseptic_technique?.minimal_lid_opening,
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
if (disinfecting.antibiotic_disc_practical.stage !== 1 || !disinfected.antibiotic_disc_practical.aseptic_technique.bench_disinfected) throw new Error('Aseptic preparation sequence failed.');
if (inoculating.antibiotic_disc_practical.stage !== 3 || !inoculating.antibiotic_disc_practical.aseptic_technique.minimal_lid_opening) throw new Error('Aseptic inoculation sequence failed.');
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

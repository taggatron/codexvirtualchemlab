import { chromium } from './qa_playwright_shim.mjs';
import fs from 'node:fs';

const out = 'output/nuclear-radiation-qa';
const baseUrl = process.env.LAB_URL || 'http://127.0.0.1:4173';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`${baseUrl}/?nuclear-radiation-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);
const click = async (x, y, pause = 70) => { await page.mouse.click(x, y); if (pause) await page.waitForTimeout(pause) };
const capture = async name => { await page.waitForTimeout(180); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); return state() };
const assert = (condition, message) => { if (!condition) throw new Error(message) };

async function selectNuclear() {
  await click(435, 32);
  const seen = new Set();
  for (let y = 105; y <= 850; y += 22) {
    await click(130, y, 18);
    const snapshot = await state();
    if (snapshot.practical) seen.add(snapshot.practical);
    if (/nuclear radiation/i.test(snapshot.practical || '')) return snapshot;
  }
  throw new Error(`Could not locate Nuclear radiation. Saw: ${[...seen].join(', ')}`)
}

const sourceButton = () => click(363, 837);
const absorberButton = () => click(509, 837);
const measureButton = () => click(638, 837);
const resetButton = () => click(740, 837);

await selectNuclear();
const initial = await capture('01-shielded-store-ready');
assert(initial.renderer.enabled && !initial.renderer.legacy_2d_apparatus, 'Nuclear practical did not load its WebGL rig.');
assert(initial.nuclear_radiation?.apparatus?.source_handling?.includes('lead-lined'), 'Shielded source handling is missing.');
assert(!('optical_rail' in initial.nuclear_radiation.apparatus) && initial.nuclear_radiation.apparatus.alignment.includes('without a visible rail or scale'), 'The removed rail or scale is still described as visible.');
assert(initial.nuclear_radiation.apparatus.scaler.includes('compact angled') && initial.nuclear_radiation.apparatus.scaler.includes('clear of the GM tube'), 'The compact angled scaler layout is not reported.');
assert(initial.control_label_layout?.all_visible_button_labels_fit && initial.control_label_layout.visible_button_count >= 4, `A visible nuclear control label does not fit its button: ${JSON.stringify(initial.control_label_layout)}`);

await sourceButton(); // alpha
await advance(900);
const alphaMoving = await capture('02-alpha-source-transfer');
assert(alphaMoving.nuclear_radiation.stage === 1 && alphaMoving.nuclear_radiation.source_transfer_progress > .45 && alphaMoving.nuclear_radiation.source_transfer_progress < .6, 'Alpha carrier is not midway through its transfer.');
await advance(1000);
const alphaReady = await capture('03-alpha-ready-open-beam');
assert(alphaReady.nuclear_radiation.stage === 2, 'Alpha source did not lock into the fixed holder.');

await measureButton();
await advance(5000);
const alphaOpenMid = await capture('04-alpha-open-beam-counting');
assert(alphaOpenMid.nuclear_radiation.counting && alphaOpenMid.nuclear_radiation.displayed_count === 234, 'Alpha open-beam count did not advance deterministically.');
await advance(5100);
const alphaOpen = await capture('05-alpha-open-beam-reading');
assert(alphaOpen.nuclear_radiation.displayed_count === 468 && alphaOpen.nuclear_radiation.equivalent_count_rate_cpm === 2808, 'Alpha open-beam reading is incorrect.');

await absorberButton(); // paper
await advance(720);
const paperMoving = await capture('06-paper-lowering');
assert(paperMoving.nuclear_radiation.stage === 3 && paperMoving.nuclear_radiation.absorber.transition_progress > .45, 'Paper is not visibly moving into the holder.');
await advance(800);
await measureButton();
await advance(4400);
const alphaPaperMid = await capture('07-alpha-stopped-by-paper');
assert(alphaPaperMid.nuclear_radiation.counting && alphaPaperMid.nuclear_radiation.displayed_count <= 2, 'Paper should reduce alpha to near-background count.');
await advance(5700);
const alphaPaper = await state();
assert(alphaPaper.nuclear_radiation.displayed_count === 5, 'Alpha-through-paper reading is incorrect.');

await sourceButton(); // beta, paper stays selected
await advance(1900);
await measureButton();
await advance(5000);
const betaPaperMid = await capture('08-beta-passes-paper');
assert(betaPaperMid.nuclear_radiation.source.id === 'beta' && betaPaperMid.nuclear_radiation.displayed_count === 274, 'Beta-through-paper animation/count is incorrect.');
await advance(5100);
await absorberButton(); // aluminium
await advance(1500);
await measureButton();
await advance(10100);
const betaAluminium = await capture('09-beta-stopped-by-aluminium');
assert(betaAluminium.nuclear_radiation.displayed_count === 11, 'Aluminium should reduce beta to a near-background count.');

await sourceButton(); // gamma, aluminium stays selected
await advance(1900);
await measureButton();
await advance(5000);
const gammaAluminiumMid = await capture('10-gamma-penetrates-aluminium');
assert(gammaAluminiumMid.nuclear_radiation.source.id === 'gamma' && gammaAluminiumMid.nuclear_radiation.displayed_count === 159, 'Gamma-through-aluminium animation/count is incorrect.');
await advance(5100);
await absorberButton(); // lead
await advance(1500);
await measureButton();
await advance(5000);
const gammaLeadMid = await capture('11-gamma-reduced-by-lead');
assert(gammaLeadMid.nuclear_radiation.displayed_count === 37, 'Lead attenuation should leave a reduced gamma count.');
await advance(5100);
const complete = await capture('12-three-comparisons-complete');
assert(complete.complete && complete.nuclear_radiation.canonical_comparisons_complete, 'Canonical penetration comparisons did not complete.');
assert(complete.nuclear_radiation.displayed_count === 74 && complete.nuclear_radiation.readings_saved.length === 6, 'Final gamma/lead count or saved readings are incorrect.');

await click(1270, 32);
const focus = await capture('13-focus-equipment-layout');
assert(focus.focus_mode, 'Focus mode did not open for equipment inspection.');
assert(focus.control_label_layout?.all_visible_button_labels_fit, 'A nuclear control label overflows in focus mode.');
await click(1360, 32);
await resetButton();
const reset = await capture('14-reset');
assert(reset.nuclear_radiation.stage === 0 && reset.nuclear_radiation.source.id === 'none' && reset.nuclear_radiation.readings_saved.length === 0, 'Reset did not secure sources and clear the study.');
assert(errors.length === 0, errors.join('\n'));

const summary = {
  errors,
  renderer: initial.renderer,
  initial: initial.nuclear_radiation,
  alpha_transfer: alphaMoving.nuclear_radiation,
  alpha_open: alphaOpen.nuclear_radiation,
  alpha_paper: alphaPaper.nuclear_radiation,
  beta_paper_mid: betaPaperMid.nuclear_radiation,
  beta_aluminium: betaAluminium.nuclear_radiation,
  gamma_aluminium_mid: gammaAluminiumMid.nuclear_radiation,
  gamma_lead_complete: complete.nuclear_radiation,
  focus_mode: focus.focus_mode,
  reset: reset.nuclear_radiation
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ errors, final_readings: complete.nuclear_radiation.readings_saved, renderer: initial.renderer }, null, 2));
await browser.close();

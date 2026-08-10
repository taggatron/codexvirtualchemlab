import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/newton-logger-qa';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const capture = async name => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};
const selectNewton = async () => {
  await page.mouse.click(435, 32);
  await page.waitForTimeout(100);
  await page.mouse.click(135, 182);
  await page.waitForTimeout(400);
};

await page.goto(`http://127.0.0.1:4173/?newton-logger-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });
await selectNewton();

const initial = await capture('01-initial-shared-logger');
const controlY = initial.responsive_layout.logical_canvas_px.height - 63;
await page.mouse.click(initial.newton2.control_layout.plus_x_px + initial.newton2.control_layout.force_button_width_px / 2, controlY);
const increasedForce = await state();
await page.mouse.click(initial.newton2.control_layout.minus_x_px + initial.newton2.control_layout.force_button_width_px / 2, controlY);
const restoredForce = await state();
const releaseX = initial.newton2.control_layout.release_x_px + initial.newton2.control_layout.release_button_width_px / 2;
await page.mouse.click(releaseX, controlY);
await advance(2100);
const afterGate1 = await capture('02-gate-1-reading');
await advance(900);
const afterGate2 = await capture('03-both-gate-readings');
await advance(500);
const complete = await capture('04-completed-run');

await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(350);
const compact = await capture('05-compact-landscape');
const reset = initial;

const summary = {
  errors,
  renderer: initial.renderer,
  initial: initial.newton2,
  force_controls: { increased_force_n: increasedForce.newton2.accelerating_force_n, restored_force_n: restoredForce.newton2.accelerating_force_n },
  after_gate_1: afterGate1.newton2,
  after_gate_2: afterGate2.newton2,
  complete: complete.newton2,
  compact: { responsive: compact.responsive_layout, newton2: compact.newton2 },
  reset: reset.newton2
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!initial.renderer.enabled || initial.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer was not enabled.');
if (increasedForce.newton2.accelerating_force_n !== 0.3 || restoredForce.newton2.accelerating_force_n !== 0.2) throw new Error('Force controls regressed.');
if (!initial.newton2.light_gate_system.connected_to_same_data_logger) throw new Error('Both gates do not report one shared logger.');
if (initial.newton2.light_gate_system.cable_count !== 2) throw new Error('Expected two gate-to-logger cables.');
if (initial.newton2.light_gate_system.gate_1.velocity_m_per_s !== null || initial.newton2.light_gate_system.gate_2.velocity_m_per_s !== null) throw new Error('Logger should begin with two blank readings.');
if (!(afterGate1.newton2.light_gate_system.gate_1.velocity_m_per_s > 0) || afterGate1.newton2.light_gate_system.gate_2.velocity_m_per_s !== null) throw new Error('Gate 1 did not latch independently before Gate 2.');
if (!(afterGate2.newton2.light_gate_system.gate_2.velocity_m_per_s > afterGate2.newton2.light_gate_system.gate_1.velocity_m_per_s)) throw new Error('Gate 2 should record the larger velocity.');
if (!complete.complete || complete.newton2.trolley_running) throw new Error('Trolley run did not complete.');
if (!complete.newton2.trolley_appearance.rounded_chassis || complete.newton2.trolley_appearance.rubber_wheels !== 4 || complete.newton2.trolley_appearance.relative_size_from_previous !== 0.86) throw new Error('Smaller rounded trolley appearance contract is missing.');
if (compact.responsive_layout.mode !== 'compact landscape') throw new Error('Compact landscape layout did not activate.');
if (reset.newton2.light_gate_system.gate_1.velocity_m_per_s !== null || reset.newton2.light_gate_system.gate_2.velocity_m_per_s !== null) throw new Error('A fresh/reset scene did not clear both logger readings.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();

import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/osmosis-visual-final';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`http://127.0.0.1:4173/?osmosis-visual=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const capture = async name => { await page.waitForTimeout(120); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); return JSON.parse(await page.evaluate(() => window.render_game_to_text())); };
await page.mouse.click(320, 32);
await page.mouse.click(135, 236);
await capture('01-forceps-ready');
await page.mouse.click(387, 657);
await advance(650);
const lowerEarly = await state();
await advance(250);
const transfer = await capture('02-forceps-grip-transfer');
await advance(1900);
await advance(2700);
await capture('03-water-molecules-and-arrows');
await advance(3000);
await page.mouse.click(387, 657);
await advance(1900);
const blotEarly = await state();
await advance(300);
const blotTransfer = await capture('04-forceps-transfer-to-blotting-paper');
await advance(720);
await capture('05-two-sheet-blotting-press');
const snapshot = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const rotationSnapshots = [lowerEarly, transfer, blotEarly, blotTransfer].map(entry => entry.potato_osmosis_practical.animation.synchronized_forceps_and_potato_rotation);
for (const rotation of rotationSnapshots) {
  if (!rotation?.same_rate_and_direction || !rotation.remain_parallel || rotation.relative_angle_degrees !== 0 || rotation.potato_angle_degrees !== rotation.forceps_angle_degrees) throw new Error(`Forceps/potato rotation lost synchronization: ${JSON.stringify(rotation)}`);
  if (!rotation.grip_offset_rotates_with_shared_angle || !rotation.grip_aligned_to_potato_midpoint || rotation.grip_point_offset_from_potato_midpoint_scene_units !== 0) throw new Error(`Forceps grip left the potato midpoint: ${JSON.stringify(rotation)}`);
}
for (const [from, to] of [[rotationSnapshots[0], rotationSnapshots[1]], [rotationSnapshots[2], rotationSnapshots[3]]]) {
  const potatoDelta = +(to.potato_angle_degrees - from.potato_angle_degrees).toFixed(3), forcepsDelta = +(to.forceps_angle_degrees - from.forceps_angle_degrees).toFixed(3);
  if (!potatoDelta || potatoDelta !== forcepsDelta) throw new Error(`Forceps/potato rotation rates or directions differ: ${JSON.stringify({ from, to, potatoDelta, forcepsDelta })}`);
}
fs.writeFileSync(`${out}/summary.json`, JSON.stringify({ errors, stage: snapshot.potato_osmosis_practical.stage, animation: snapshot.potato_osmosis_practical.animation, rotation_snapshots: rotationSnapshots }, null, 2));
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ errors, stage: snapshot.potato_osmosis_practical.stage, rotation_snapshots: rotationSnapshots }, null, 2));
await browser.close();

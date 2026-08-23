import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/transformation-qa';
const url = process.env.LAB_URL || 'http://127.0.0.1:4176/';
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeExecutable,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
const checkpoints = {};
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const capture = async (name, project = value => value) => {
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const snapshot = await state();
  checkpoints[name] = project(snapshot);
  return snapshot;
};
const clickPrimary = async () => { await page.mouse.click(377, 837); await page.waitForTimeout(80); };

let finalState;
try {
  await page.goto(`${url}?transformation-qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.evaluate(() => { window.__manualSimulationTime = true; });

  await page.mouse.click(320, 32);
  await page.mouse.click(135, 235);
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.id === 'transformation' && snapshot.renderer?.enabled;
  });
  const initial = await capture('01-sterile-setup', snapshot => ({ renderer: snapshot.renderer, stage: snapshot.bacterial_transformation_practical?.stage, controls: snapshot.controls, micropipette: snapshot.bacterial_transformation_practical?.micropipette }));

  await clickPrimary();
  await advance(900);
  const labelsMid = await capture('02-labels-appearing', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, animation: snapshot.bacterial_transformation_practical?.animations }));
  await advance(1100);
  assert((await state()).bacterial_transformation_practical.stage === 2, 'Control labelling did not finish.');

  await clickPrimary();
  await advance(350);
  const tipPickup = await capture('03a-fresh-tip-pickup', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, animation: snapshot.bacterial_transformation_practical?.animations, micropipette: snapshot.bacterial_transformation_practical?.micropipette }));
  await advance(700);
  const aspirationMid = await capture('03b-first-stop-aspiration', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, animation: snapshot.bacterial_transformation_practical?.animations, micropipette: snapshot.bacterial_transformation_practical?.micropipette }));
  await advance(5300);
  const plasmidMid = await capture('03c-plasmid-to-plus-dna', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, animation: snapshot.bacterial_transformation_practical?.animations, controls: snapshot.bacterial_transformation_practical?.controls, micropipette: snapshot.bacterial_transformation_practical?.micropipette }));
  await advance(1550);
  assert((await state()).bacterial_transformation_practical.stage === 4, 'Cell/plasmid addition did not finish.');

  await clickPrimary();
  await advance(3000);
  const heatMid = await capture('04-paired-heat-shock', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, temperature_c: snapshot.temperature_c, animation: snapshot.bacterial_transformation_practical?.animations }));
  await advance(3000);
  assert((await state()).bacterial_transformation_practical.stage === 6, 'Heat-shock sequence did not finish.');

  await clickPrimary();
  await advance(1150);
  const recoveryMid = await capture('05-lb-recovery', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, recovery: snapshot.bacterial_transformation_practical?.recovery }));
  await advance(4750);
  assert((await state()).bacterial_transformation_practical.stage === 8, 'Recovery did not finish.');

  await clickPrimary();
  await advance(1550);
  const platingDispense = await capture('06a-plate-second-stop-dispense', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, animation: snapshot.bacterial_transformation_practical?.animations, micropipette: snapshot.bacterial_transformation_practical?.micropipette }));
  await advance(7150);
  const platingMid = await capture('06-four-plate-spreading', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, animation: snapshot.bacterial_transformation_practical?.animations }));
  await advance(4000);
  assert((await state()).bacterial_transformation_practical.stage === 10, 'Four-plate inoculation did not finish.');

  await clickPrimary();
  await advance(3300);
  const incubationMid = await capture('07-sealed-incubation', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, simulated_time_s: snapshot.bacterial_transformation_practical?.simulated_time_s, animation: snapshot.bacterial_transformation_practical?.animations }));
  await advance(2200);
  const revealMid = await capture('08-blue-light-reveal', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, simulated_time_s: snapshot.bacterial_transformation_practical?.simulated_time_s }));
  await advance(1100);
  finalState = await capture('09-final-plate-results', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, complete: snapshot.complete, plates: snapshot.bacterial_transformation_practical?.plates, conclusion: snapshot.bacterial_transformation_practical?.conclusion, evaluation_ready: snapshot.practical_evaluation?.ready }));

  await page.mouse.click(1174, 98);
  await page.waitForTimeout(100);
  const completedMethodState = await state();
  const evaluationY = (completedMethodState.right_sidebar_layout.evaluation_button_top_y + completedMethodState.right_sidebar_layout.evaluation_button_bottom_y) / 2;
  await page.mouse.click(1285, evaluationY);
  const evaluationState = await capture('10-evaluation-modal', snapshot => ({ open: snapshot.evaluation_modal?.open, ready: snapshot.practical_evaluation?.ready }));
  await page.keyboard.press('Escape');

  await page.mouse.click(517, 837);
  const resetState = await capture('11-reset', snapshot => ({ stage: snapshot.bacterial_transformation_practical?.stage, complete: snapshot.complete, tab: snapshot.tab }));
  const cultureRow = resetState.right_sidebar_layout.reactant_rows[0];
  await page.mouse.click(1275, (cultureRow.top_y + cultureRow.bottom_y) / 2);
  const cultureSafety = await capture('12-culture-safety', snapshot => snapshot.reactant_interaction?.popup);
  await page.keyboard.press('Escape');

  assert(initial.renderer.enabled && !initial.renderer.context_lost, 'WebGL renderer is not healthy.');
  assert(initial.bacterial_transformation_practical.micropipette.model === 'adjustable P20' && initial.bacterial_transformation_practical.micropipette.plunger_stops === 2, 'Detailed P20 micropipette metadata is missing.');
  assert(labelsMid.bacterial_transformation_practical.stage === 1 && labelsMid.bacterial_transformation_practical.animations.tube_and_plate_labelling, 'Labelling animation state is incorrect.');
  assert(tipPickup.bacterial_transformation_practical.animations.fresh_tip_pickup && tipPickup.bacterial_transformation_practical.micropipette.active_operation.includes('fit fresh tip'), 'Fresh-tip pickup choreography is missing.');
  assert(aspirationMid.bacterial_transformation_practical.animations.two_stop_plunger && aspirationMid.bacterial_transformation_practical.animations.liquid_visible_in_tip, 'First-stop aspiration or visible liquid-column state is missing.');
  assert(plasmidMid.bacterial_transformation_practical.stage === 3 && plasmidMid.bacterial_transformation_practical.controls.plus_dna_receives_plasmid && !plasmidMid.bacterial_transformation_practical.controls.minus_dna_receives_plasmid, 'Plasmid control assignment is incorrect.');
  assert(heatMid.temperature_c === 42 && heatMid.bacterial_transformation_practical.animations.tubes_move_ice_to_heat_block_and_back, 'Paired 42 °C heat shock was not represented.');
  assert(recoveryMid.bacterial_transformation_practical.stage === 7, 'LB recovery animation state is incorrect.');
  assert(platingDispense.bacterial_transformation_practical.animations.two_stop_plunger && platingDispense.bacterial_transformation_practical.micropipette.active_operation.includes('dispense'), 'Plate second-stop dispense choreography is missing.');
  assert(platingMid.bacterial_transformation_practical.animations.agar_spreading, 'Agar spreading animation state is missing.');
  assert(incubationMid.bacterial_transformation_practical.animations.colonies_grow_progressively, 'Incubation/growth animation state is missing.');
  assert(finalState.complete && finalState.tab === 'graph' && finalState.practical_evaluation.ready, 'Completion, results tab or evaluation state failed.');
  const plates = finalState.bacterial_transformation_practical.plates;
  assert(plates.length === 4 && plates.every(plate => plate.observed), 'All four plates were not observed.');
  assert(plates.find(plate => plate.id === 'plus_amp_ara')?.fluorescent === true, '+DNA LB/amp/ara should fluoresce.');
  assert(plates.find(plate => plate.id === 'plus_amp')?.growth === true && plates.find(plate => plate.id === 'plus_amp')?.fluorescent === false, '+DNA LB/amp selection result is incorrect.');
  assert(plates.find(plate => plate.id === 'minus_lb')?.colonies === 'lawn', '−DNA LB viability control is incorrect.');
  assert(plates.find(plate => plate.id === 'minus_amp')?.colonies === 0, '−DNA LB/amp negative selection control is incorrect.');
  assert(evaluationState.evaluation_modal.open && evaluationState.practical_evaluation.ready, 'Completed evaluation did not open.');
  assert(resetState.bacterial_transformation_practical.stage === 0 && !resetState.complete && resetState.tab === 'bench', 'Reset did not restore the initial practical.');
  const culturePopup = cultureSafety.reactant_interaction.popup;
  assert(culturePopup.reactant === 'Teaching-strain E. coli' && culturePopup.rating.includes('KEEP SEALED') && culturePopup.safe_handling.includes('aseptic'), 'Transformation culture safety guidance is incomplete.');
  assert(errors.length === 0, errors.join('\n'));

  fs.writeFileSync(`${out}/summary.json`, JSON.stringify({ errors, checkpoints }, null, 2));
  console.log(JSON.stringify({ errors, checkpoints }, null, 2));
} finally {
  await browser.close();
}

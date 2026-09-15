import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out = 'output/playwright/assessment-spatial';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const wait = () => page.waitForTimeout(180);
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).assessment_mode);
const phase = async name => { await page.locator(`.assessment-phase[data-phase="${name}"]`).click(); await wait(); };
const getSession = async expression => page.evaluate(expression);
const setup = async id => {
  await page.evaluate(id => { const { state, practicals, draw } = window.__lab; state.selected = practicals.findIndex(p => p.id === id); state.subject = practicals[state.selected].subject; state.assessmentMode = true; state.assessmentSession = null; draw(); }, id);
  await page.locator('.assembly-canvas').waitFor();
  await page.waitForFunction(() => document.querySelector('.assembly-canvas')?.style.visibility === 'visible');
  await wait();
};
const palette = id => page.locator(`.assessment-equipment[data-item-id="${id}"]`);
async function benchPoint(x, y) {
  const r = await page.locator('.assembly-viewport').boundingBox();
  const scale = Math.min(r.width / 1000, r.height / 600);
  return { x: r.x + (r.width - scale * 1000) / 2 + x * scale, y: r.y + (r.height - scale * 600) / 2 + y * scale };
}
async function dragTo(id, x, y, fromBench = false) {
  const source = fromBench ? page.locator(`.assembly-item-label[data-item-id="${id}"]`) : palette(id);
  await source.scrollIntoViewIfNeeded();
  const r = await source.boundingBox(), dest = await benchPoint(x, y);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(dest.x, dest.y, { steps: 15 }); await page.mouse.up(); await wait();
}
try {
  await page.goto(`http://127.0.0.1:4173/?spatialQA=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__lab && window.render_game_to_text);
  // Enter through the actual GCSE canvas header control.
  const enter = await page.evaluate(() => { const r = window.__lab.getRegions().find(r => r.id === 'toggle-assessment-mode'); const c = document.getElementById('lab').getBoundingClientRect(), scale = window.__lab.getScale(); return { x: c.x + (r.x + r.w / 2) * scale, y: c.y + (r.y + r.h / 2) * scale }; });
  await page.mouse.click(enter.x, enter.y); await wait();
  assert.equal((await state()).active, true);
  await setup('respiration');
  assert.equal((await state()).assembly.items.length, 0);
  await page.getByRole('button', { name: 'Check my setup', exact: true }).click();
  assert.equal((await state()).total_score, 0, 'Empty bench earns zero');
  await page.screenshot({ path: `${out}/01-empty-bench.png` });
  await dragTo('water_bath', 400, 500);
  await dragTo('conical_flask', 365, 480);
  await dragTo('bung_delivery_tube', 395, 330);
  await dragTo('gas_syringe', 585, 315);
  await dragTo('stopwatch', 815, 480);
  let snapshot = await state();
  assert.equal(snapshot.assembly.items.length, 5);
  assert.equal(snapshot.assembly.connections.filter(c => c.valid).length, 3, 'All respiration joints snap');
  await page.getByRole('button', { name: 'Check my setup', exact: true }).click();
  snapshot = await state(); assert.equal(snapshot.total_score, snapshot.assembly.max);
  await page.screenshot({ path: `${out}/02-connected-respiration.png` });
  // Reposition child to detach, making previous marks stale.
  await dragTo('gas_syringe', 780, 300, true);
  snapshot = await state(); assert.equal(snapshot.apparatus_checked, false); assert.equal(snapshot.total_score, 0);
  assert.equal(snapshot.assembly.connections.filter(c => c.valid).length, 2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await wait();
  assert.equal((await state()).assembly.connections.filter(c => c.valid).length, 3);
  // An irrelevant item affects selection marks, and can be removed.
  await palette('rubber_balloon').focus(); await page.keyboard.press('Enter'); await wait();
  assert.equal((await state()).assembly.items.length, 6);
  await page.keyboard.press('Delete'); await wait(); assert.equal((await state()).assembly.items.length, 5);
  // Pointer cancellation and out-of-bench drops never add equipment.
  const before = (await state()).assembly.items.length;
  const extra = palette('open_beaker'); await extra.scrollIntoViewIfNeeded(); const r = await extra.boundingBox();
  await page.mouse.move(r.x+20,r.y+20); await page.mouse.down(); await page.mouse.move(8,8,{steps:8}); await page.mouse.up(); await wait();
  assert.equal((await state()).assembly.items.length, before);
  await palette('stopwatch').focus(); await page.keyboard.press('Enter'); await wait();
  const originalX = (await state()).assembly.items.find(item=>item.id==='stopwatch').x;
  await page.keyboard.press('ArrowLeft'); await wait();
  assert.equal((await state()).assembly.items.find(item=>item.id==='stopwatch').x, originalX-20);
  await page.keyboard.press('ArrowRight'); await wait();
  await page.getByRole('button', { name: 'Clear bench', exact: true }).click(); await wait();
  assert.equal((await state()).assembly.items.length,0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await wait();
  assert.equal((await state()).assembly.items.length,5);
  await page.getByRole('button', { name: 'Check my setup', exact: true }).click();
  await phase('method');
  console.log('PASS: physical dragging, snapping, detach, undo, keyboard and clear.');
  const beforeMethodDrag = await getSession(() => [...window.__lab.state.assessmentSession.orderedStepIds]);
  await page.locator('.assessment-method-step').first().dragTo(page.locator('.assessment-method-step').nth(1)); await wait();
  assert.notDeepEqual(await getSession(() => window.__lab.state.assessmentSession.orderedStepIds), beforeMethodDrag);

  const ordered = await getSession(() => ({ actual: window.__lab.state.assessmentSession.orderedStepIds, correct: window.__lab.state.assessmentSession.data.methodChallenge.correctOrder }));
  assert.notDeepEqual(beforeMethodDrag, ordered.correct, 'Method begins scrambled');
  // Real up controls put all five steps in their known scientifically correct order.
  for (let target = 0; target < ordered.correct.length; target++) {
    while (true) {
      const index = await getSession(() => window.__lab.state.assessmentSession.orderedStepIds);
      const current = index.indexOf(ordered.correct[target]); if (current <= target) break;
      await page.locator(`.assessment-method-step[data-step-id="${ordered.correct[target]}"] button`).first().click(); await wait();
    }
  }
  await page.getByRole('button', { name: 'Check step order', exact: true }).click();
  assert.equal((await state()).method_order_checked, true);
  assert.equal((await state()).method_questions_checked, false, 'Order check does not mark questions');
  const answers = await getSession(() => window.__lab.state.assessmentSession.data.methodChallenge.reasoningQuestions.map(q => ({ id: q.id, correct: q.options.findIndex(o=>o.correct) })));
  for (const q of answers) await page.locator(`input[name="assessment-questions-${q.id}"][value="${q.correct}"]`).check();
  await page.getByRole('button', { name: 'Check answers', exact: true }).click();
  assert.equal((await state()).method_questions_checked, true);
  await page.locator('.assessment-main').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: `${out}/03-method-large-text.png` });
  await phase('limitations');
  const improvements = await getSession(() => window.__lab.state.assessmentSession.data.limitationsChallenge.map(q => ({ id: q.id, correct: q.options.findIndex(o=>o.correct) })));
  for (const q of improvements) await page.locator(`input[name="assessment-limitations-${q.id}"][value="${q.correct}"]`).check();
  await page.getByRole('button', { name: 'Check improvements', exact: true }).click();
  await phase('summary'); snapshot = await state(); assert.equal(snapshot.total_score, snapshot.max_score);
  await page.screenshot({ path: `${out}/04-results.png` });
  await page.getByRole('button', { name: 'Back to lab', exact: true }).click();
  assert.equal((await state()).active, false);
  // The requested antibiotic practical has individually assembled plate components.
  await setup('antibiotics');
  await dragTo('petri_dish', 470, 440);
  await dragTo('antibiotic_discs', 445, 409);
  await dragTo('control_disc', 534, 409);
  await dragTo('petri_lid', 470, 395);
  await dragTo('bunsen_burner', 190, 460);
  for (const [id,x,y] of [['sterile_swab',740,340],['sterile_forceps',805,510],['marker',400,540],['ruler',665,540]]) await dragTo(id,x,y);
  await page.getByRole('button', { name: 'Check my setup', exact: true }).click(); snapshot = await state();
  assert.equal(snapshot.total_score, snapshot.assembly.max, 'Antibiotics fully assembled');
  console.log('PASS: all stages scored correctly; antibiotic plate assembled.');
  await page.screenshot({ path: `${out}/05-antibiotics-assembled.png` });
  await phase('method'); await page.screenshot({ path: `${out}/06-antibiotics-method.png` });
  for (const size of [{width:1280,height:720},{width:1024,height:768},{width:844,height:390},{width:2560,height:1440}]) {
    await page.setViewportSize(size); await phase('apparatus'); await wait();
    const overflow = await page.locator('.assessment-app').evaluate(node => ({w:node.clientWidth,scroll:node.scrollWidth}));
    assert.ok(overflow.scroll <= overflow.w+2, `No horizontal page overflow ${size.width}`);
    await page.screenshot({ path: `${out}/07-responsive-${size.width}.png` });
  }
  await page.setViewportSize({width:1600,height:1000});
  // Smoke-render all current GCSE practical libraries and every distinct model kind.
  const ids = await getSession(() => window.__lab.practicals.map(p=>p.id));
  for (const [index,id] of ids.entries()) {
    await setup(id);
    await page.evaluate(async () => { const {state,draw} = window.__lab; const mod = await import('./assessment-assembly.js?v=20260916-1'); state.assessmentSession.assemblySpec.items.filter(i=>i.required).forEach((item,index)=>mod.placeAssemblyItem(state.assessmentSession,item.id,180+(index%4)*190,450+Math.floor(index/4)*70,{snap:false})); draw(); });
    await wait();
    assert.equal(await page.locator('.assembly-fallback').count(),0, `3D rendering for ${id}`);
    if (index%10===0) console.log(`Rendered ${index+1}/${ids.length} practical libraries.`);
  }
  assert.deepEqual(errors, [], 'No browser errors');
  fs.writeFileSync(`${out}/report.json`, JSON.stringify({passed:true,practicals:ids.length,errors},null,2));
  console.log(`PASS: spatial drag/drop, snap/detach/undo/delete, scoring, method, results, responsive and ${ids.length} practicals.`);
} finally { await browser.close(); }

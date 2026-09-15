import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { assessmentDatabase, createAssessmentSession, checkApparatusPhase } from './assessment.js';
import { createAssemblySpec, placeAssemblyItem, removeAssemblyItem, clearAssembly, getSnapCandidate, evaluateAssembly, serializeAssembly } from './assessment-assembly.js';

const sessionFor = id => ({ assemblySpec: createAssemblySpec({ id }, assessmentDatabase[id]), placedEquipment: {} });

// Assemble every connected component from its relative joint definitions. This
// checks that all detailed practicals have consistent, physically achievable
// relationships, including the titration loop through the tile and flask.
function assemble(session) {
  const { items, connections, rules } = session.assemblySpec;
  for (const item of items.filter(i => i.required)) {
    if (session.placedEquipment[item.id]) continue;
    session.placedEquipment[item.id] = { x: 420, y: 510 };
    const queue = [item.id];
    while (queue.length) {
      const id = queue.shift(), point = session.placedEquipment[id];
      for (const c of connections) {
        const reverse = c.b === id;
        if (c.a !== id && !reverse) continue;
        const other = reverse ? c.a : c.b;
        const target = { x: point.x + (reverse ? -c.dx : c.dx), y: point.y + (reverse ? -c.dy : c.dy) };
        if (session.placedEquipment[other]) assert.deepEqual(session.placedEquipment[other], target, `Inconsistent connection ${c.id}`);
        else { session.placedEquipment[other] = target; queue.push(other); }
      }
    }
  }
  for (const rule of rules) if (rule.type === 'separation') session.placedEquipment[rule.a] = { x: 850, y: 500 };
}

for (const id of ['respiration', 'rates', 'temp', 'titration', 'specificheat', 'antibiotics']) {
  const session = sessionFor(id);
  assert.equal(evaluateAssembly(session).score, 0, `${id}: an empty bench earns no marks`);
  assemble(session);
  const checked = evaluateAssembly(session);
  assert.equal(checked.score, checked.max, `${id}: complete assembly must earn full marks`);
  assert(checked.connections.every(c => c.valid));
  assert.equal(new Set(session.assemblySpec.items.map(i => i.id)).size, session.assemblySpec.items.length);
  assert.equal(serializeAssembly(session).items.length, session.assemblySpec.items.filter(i => i.required).length);
}

{
  const session = sessionFor('respiration');
  placeAssemblyItem(session, 'water_bath', 400, 500);
  const preview = getSnapCandidate(session, 'conical_flask', 382, 490);
  assert.equal(preview.connectionId, 'water_bath__conical_flask');
  assert.equal(session.placedEquipment.conical_flask, undefined, 'Preview is read-only');
  assert.equal(placeAssemblyItem(session, 'conical_flask', 382, 490).connectionId, preview.connectionId);
  assert.deepEqual(session.placedEquipment.conical_flask, { x: 365, y: 480 });
  placeAssemblyItem(session, 'bung_delivery_tube', 402, 337);
  placeAssemblyItem(session, 'gas_syringe', 590, 320);
  assert.equal(evaluateAssembly(session).connections.filter(c => c.valid).length, 3);
  placeAssemblyItem(session, 'water_bath', 480, 520, { snap: false });
  assert.equal(evaluateAssembly(session).connections.filter(c => c.valid).length, 3, 'Moving a parent moves its assembled descendants');
  assert.deepEqual(session.placedEquipment.conical_flask, { x: 445, y: 500 });
  placeAssemblyItem(session, 'bung_delivery_tube', 600, 280, { snap: false });
  assert.equal(evaluateAssembly(session).connections.find(c => c.id === 'conical_flask__bung_delivery_tube').valid, false, 'A moved child detaches from its parent');
  assert.equal(evaluateAssembly(session).connections.find(c => c.id === 'bung_delivery_tube__gas_syringe').valid, true, 'A moved child carries its own attached parts');
  removeAssemblyItem(session, 'bung_delivery_tube');
  assert.equal(evaluateAssembly(session).connections.filter(c => c.valid).length, 1, 'Removal cannot leave a stale connector mark');
  assert(!session.assemblyConnections.includes('bung_delivery_tube__gas_syringe'));
  placeAssemblyItem(session, 'water_bath', 480, 520);
  assert.equal(Object.keys(session.placedEquipment).filter(id => id === 'water_bath').length, 1, 'Redragging never duplicates an item');
  const before = JSON.stringify(session.placedEquipment);
  placeAssemblyItem(session, 'unknown', 200, 400);
  placeAssemblyItem(session, 'water_bath', NaN, 400);
  assert.equal(JSON.stringify(session.placedEquipment), before, 'Invalid inputs cannot corrupt positions');
  clearAssembly(session);
  assert.equal(evaluateAssembly(session).score, 0);
  assert.equal(session.assemblyConnections.length, 0);
}

{
  const session = sessionFor('temp');
  placeAssemblyItem(session, 'copper_can', 400, 500);
  assert.equal(evaluateAssembly(session).score, 0, 'A distractor alone earns no selection marks');
  placeAssemblyItem(session, 'glass_beaker', 200, 500);
  assert.equal(evaluateAssembly(session).score, 1, 'A distractor removes the two selection marks');
  removeAssemblyItem(session, 'copper_can');
  assert.equal(evaluateAssembly(session).score, 3);
  placeAssemblyItem(session, 'glass_beaker', -1000, -1000, { snap: false });
  const item = session.assemblySpec.items.find(i => i.id === 'glass_beaker');
  assert(session.placedEquipment.glass_beaker.x >= item.width / 2);
  assert(session.placedEquipment.glass_beaker.y >= item.height);
}

{
  const session = sessionFor('antibiotics');
  assemble(session);
  session.placedEquipment.bunsen_burner = { ...session.placedEquipment.petri_dish };
  const result = evaluateAssembly(session);
  assert.equal(result.score, result.max - 1);
  assert(result.feedback.some(f => f.ruleId === 'flame_clearance' && f.status === 'incorrect'));
  const missing = session.assemblySpec.items.find(i => i.id === 'control_disc');
  assert(missing.required, 'The sterile-water control is assessed independently');
}

{
  const practical = { id: 'transformation', gear: ['Microtubes', 'Sterile-tip rack', 'Ice bath', 'Four sealed agar plates', 'Blue-light viewer', 'Additional measuring equipment'] };
  const model = createAssemblySpec(practical, { apparatusChallenge: { palette: [{ id: 'bad', name: 'Plastic spoon', isCorrect: false }] } });
  assert.equal(model.items.filter(i => i.required).length, 6, 'Fallback retains every gear entry, including entries after the fourth');
  assert.equal(model.connections.length, 0, 'Independent equipment does not get artificial attachment rules');
  assert.equal(model.items.find(i => i.id === 'bad').required, false);
}

console.log('Spatial assessment engine: all 6 detailed assemblies, snapping, moves, invalidation, distractors, boundaries and fallback coverage passed.');

// Read only the static metadata literal. Importing app.js would require a DOM,
// WebGL context and event loop, none of which the assessment engine depends on.
const appSource = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const practicalLiteral = appSource.match(/const practicals = (\[[\s\S]*?\n\]);/);
assert(practicalLiteral, 'Practical metadata remains discoverable');
const practicals = runInNewContext(`(${practicalLiteral[1]})`);
const counts = [];

for (const practical of practicals) {
  const session = createAssessmentSession(practical);
  const model = session.assemblySpec;
  assert.equal(evaluateAssembly(session).score, 0, `${practical.id}: session starts with an empty bench`);
  if (!['respiration', 'rates', 'temp', 'titration', 'specificheat', 'antibiotics'].includes(practical.id)) {
    assert(model.items.filter(i => i.required).length >= practical.gear.length, `${practical.id}: no gear was discarded`);
  }
  const positions = {};
  for (const item of model.items.filter(i => i.required)) {
    if (positions[item.id]) continue;
    positions[item.id] = { x: 0, y: 0 };
    const component = [item.id], queue = [item.id];
    while (queue.length) {
      const id = queue.shift(), point = positions[id];
      for (const c of model.connections) {
        const reverse = c.b === id;
        if (c.a !== id && !reverse) continue;
        const other = reverse ? c.a : c.b;
        const target = { x: point.x + (reverse ? -c.dx : c.dx), y: point.y + (reverse ? -c.dy : c.dy) };
        if (positions[other]) assert.deepEqual(positions[other], target, `${practical.id}: joint graph must be consistent`);
        else { positions[other] = target; queue.push(other); component.push(other); }
      }
    }
    const componentItems = component.map(id => model.items.find(i => i.id === id));
    const left = Math.min(...componentItems.map(i => positions[i.id].x - i.width / 2));
    const right = Math.max(...componentItems.map(i => positions[i.id].x + i.width / 2));
    const top = Math.min(...componentItems.map(i => positions[i.id].y - i.height));
    const bottom = Math.max(...componentItems.map(i => positions[i.id].y));
    assert(right - left <= 964 && bottom - top <= 564, `${practical.id}: complete apparatus must fit inside the bench`);
    const dx = (1000 - right - left) / 2, dy = 545 - bottom;
    for (const id of component) positions[id] = { x: positions[id].x + dx, y: positions[id].y + dy };
  }
  for (const rule of model.rules) if (rule.type === 'separation') positions[rule.a] = { x: 850, y: 500 };
  for (const [id, point] of Object.entries(positions)) {
    placeAssemblyItem(session, id, point.x, point.y);
    assert.deepEqual(session.placedEquipment[id], point, `${practical.id}: bounds must permit the correct placement of ${id}`);
  }
  const result = evaluateAssembly(session);
  assert.equal(result.score, result.max, `${practical.id}: a fully assembled setup must be attainable using the placement API`);
  assert(result.connections.every(c => c.valid), `${practical.id}: every joint must be simultaneously correct`);
  checkApparatusPhase(session);
  assert.equal(session.apparatusScore, result.max, `${practical.id}: legacy assessment scoring integrates the new model`);
  assert.equal(session.apparatusMaxScore, result.max);
  if (practical.id === 'free') assert.equal(result.max, 0, 'An equipment-free practical has no impossible selection marks');
  if (practical.id === 'ivdevices') {
    assert.equal(model.connections.filter(c => c.kind === 'wire').length, 4);
    assert.equal(model.connections.find(c => c.b === 'item_2').ports.length, 2, 'Parallel voltmeter has a lead at both component terminals');
    assert(model.connections.every(c => c.group === false), 'Flexible wires do not rigidly move the circuit components');
  }
  counts.push(`${practical.id}:${result.max}`);
}
console.log(`All ${practicals.length} practical sessions create successfully and achieve their complete spatial mark allocation: ${counts.join(', ')}`);

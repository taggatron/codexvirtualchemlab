// Spatial apparatus assessment. All coordinates are bottom-centre positions on a
// 1000 × 600 bench; rendering and input adapters can scale this without changing
// the scientific relationships or scoring. This module has no DOM dependencies.

export const ASSEMBLY_BENCH = Object.freeze({ width: 1000, height: 600, padding: 18 });

const SIZES = {
  flask: [130, 165], bung: [120, 65], tube: [90, 160], syringe: [225, 65], bath: [260, 150],
  stopwatch: [84, 100], beaker: [160, 160], cylinder: [80, 205], cup: [130, 135], lid: [145, 24],
  thermometer: [58, 180], stand: [210, 345], burette: [54, 260], pipette: [65, 190],
  tile: [180, 35], cross: [180, 35], block: [160, 155], heater: [70, 185], meter: [180, 100],
  insulation: [190, 175], petri: [230, 95], discs: [135, 36], forceps: [110, 100], swab: [65, 130],
  bunsen: [110, 175], ruler: [230, 35], marker: [125, 30], funnel: [130, 145], tripod: [170, 170],
  crucible: [115, 90], balance: [200, 95], rack: [190, 115], paper: [120, 165], spring: [65, 135],
  masses: [90, 110], power: [180, 110], leads: [140, 70], electrodes: [100, 165], lamp: [145, 230],
  wire: [230, 40], magnet: [155, 65], generic: [135, 110]
};

function equipmentKind(name) {
  const n = String(name).toLowerCase();
  const patterns = [
    ['petri', /petri|agar plates?/], ['discs', /disc/], ['swab', /swab/], ['forceps', /forceps|tongs/],
    ['stopwatch', /stopwatch|timer|counter/], ['balance', /balance/], ['syringe', /gas syringe/],
    ['bung', /bung|delivery tube/], ['bath', /water bath|trough|ripple tank/], ['cup', /polystyrene/],
    ['lid', /\blid\b/], ['burette', /burette/], ['pipette', /pipette|capillary/],
    ['thermometer', /thermometer|temperature probe/], ['insulation', /insulat.*jacket|foam/],
    ['heater', /immersion heater|heating mantle/], ['block', /metal block|aluminium block|leslie cube/],
    ['meter', /joulemeter|ammeter|voltmeter|logger|scaler/], ['power', /power (pack|supply)|dc.*supply/],
    ['stand', /clamp stand|stand.*boss/], ['tripod', /tripod/], ['bunsen', /bunsen|burner/],
    ['crucible', /crucible/], ['cross', /cross/], ['tile', /tile|heatproof mat/],
    ['flask', /flask/], ['cylinder', /measuring cylinder|plastic cylinder/], ['beaker', /beaker|eureka can/],
    ['rack', /rack/], ['tube', /test tubes?|boiling tube/], ['funnel', /funnel/],
    ['paper', /chromatography|filter paper|white paper/], ['ruler', /ruler|tape measure|temperature scale/],
    ['marker', /marker/], ['spring', /spring/], ['masses', /mass hanger|slotted mass/],
    ['electrodes', /electrode/], ['leads', /leads|crocodile clips/], ['lamp', /lamp/],
    ['wire', /wire/], ['magnet', /magnet|iron core/]
  ];
  return patterns.find(([, pattern]) => pattern.test(n))?.[0] || 'generic';
}

function makeItem(id, name, kind = equipmentKind(name), required = true, description = '', dimensions = {}) {
  const [width, height] = SIZES[kind] || SIZES.generic;
  return { id, name, kind, required, description, width, height, ...dimensions };
}

function relation(a, b, dx, dy, label, feedback, options = {}) {
  return { id: `${a}__${b}`, a, b, dx, dy, label, feedback, tolerance: 26, snapRadius: 65, ...options };
}

const redPort = (ax = -.3, ay = -.25, bx = -.3, by = -.25) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, color: '#db5b53' });
const blackPort = (ax = .3, ay = -.25, bx = .3, by = -.25) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, color: '#36404a' });
const wire = (...ports) => ({ kind: 'wire', group: false, ports });

/** Build an apparatus model from the actual practical, including every gear item. */
export function createAssemblySpec(practical = {}, data = {}) {
  const id = practical.id || data.practicalId;
  const explicit = ['respiration', 'rates', 'temp', 'titration', 'specificheat'].includes(id);
  const palette = data.apparatusChallenge?.palette || [];
  let items = explicit
    ? palette.map(p => makeItem(p.id, p.name, equipmentKind(p.name), p.isCorrect !== false, p.role || p.distractorReason || ''))
    : (practical.gear || palette.filter(p => p.isCorrect !== false).map(p => p.name)).map((g, index) => makeItem(`item_${index}`, typeof g === 'string' ? g : g.name));
  const connections = [];
  const rules = [];
  let brief = 'Choose the apparatus needed for this investigation and arrange it on the bench. Bring parts together where they belong; independent measuring tools can sit anywhere.';
  const add = (...args) => connections.push(relation(...args));
  const kind = (itemId, itemKind, dimensions = {}) => {
    const item = items.find(i => i.id === itemId);
    if (item) Object.assign(item, { kind: itemKind, width: SIZES[itemKind]?.[0] || item.width, height: SIZES[itemKind]?.[1] || item.height }, dimensions);
  };

  if (id === 'respiration') {
    brief = 'Build a sealed yeast respiration apparatus. Keep the reaction flask in a water bath and connect it to a device that measures gas volume.';
    kind('bung_delivery_tube', 'bung');
    add('water_bath', 'conical_flask', -35, -20, 'Flask supported in the water bath', 'Lower the reaction flask into the water bath to control its temperature.');
    add('conical_flask', 'bung_delivery_tube', 30, -150, 'Airtight bung in the flask neck', 'Fit the bung into the flask neck so gas cannot escape.');
    add('bung_delivery_tube', 'gas_syringe', 190, -15, 'Delivery tube connected to the gas syringe', 'Bring the syringe inlet to the delivery-tube outlet to collect the gas.');
  } else if (id === 'rates') {
    brief = 'Prepare the disappearing-cross experiment. The reaction flask must stand over the cross; keep the bath, measuring cylinders and timer ready alongside it.';
    kind('paper_cross', 'cross');
    add('paper_cross', 'conical_flask', 0, -12, 'Flask centred over the visible cross', 'Place the flask on top of the cross so you can observe it through the solution.');
  } else if (id === 'temp') {
    brief = 'Build an insulated calorimeter: support the cup, close it with a lid and position the temperature probe inside the liquid.';
    add('glass_beaker', 'polystyrene_cup', 0, -15, 'Cup supported inside the beaker', 'Place the polystyrene cup inside the support beaker.');
    add('polystyrene_cup', 'cup_lid', 0, -128, 'Insulating lid fitted to the cup', 'Fit the lid across the top of the cup to reduce heat loss.');
    add('cup_lid', 'digital_thermometer', 12, 80, 'Temperature probe through the lid', 'Pass the thermometer through the lid with its tip inside the cup.');
  } else if (id === 'titration') {
    brief = 'Build a stable titration setup. Hold the burette vertically, place the receiving flask under its jet and use the white tile to see the endpoint.';
    kind('clamp_stand', 'stand');
    add('clamp_stand', 'burette', 85, -185, 'Burette secured vertically in the clamp', 'Move the burette to the clamp on the right of the stand.');
    add('burette', 'conical_flask', 0, 185, 'Burette jet above the flask opening', 'Position the conical flask directly below the burette jet.');
    add('white_tile', 'conical_flask', 0, -12, 'Flask standing on the white tile', 'Place the white tile beneath the flask to make the endpoint easier to see.');
  } else if (id === 'specificheat') {
    brief = 'Assemble the insulated metal-block experiment. Insert the heater and thermometer in separate bores, and connect the heater to the energy meter.';
    add('insulating_jacket', 'metal_block', 0, -10, 'Insulating jacket around the block', 'Fit the insulating jacket around the metal block to reduce heat loss.');
    add('metal_block', 'immersion_heater', -35, -25, 'Heater inserted into the block', 'Lower the heater into the left-hand bore of the metal block.');
    add('metal_block', 'digital_thermometer', 35, -25, 'Temperature probe in the second bore', 'Lower the temperature probe into the other bore so it measures the metal temperature.');
    add('immersion_heater', 'joulemeter', 265, 20, 'Heater connected through the joulemeter', 'Place the joulemeter beside the heater to connect the energy-measurement leads.', { group: false });
  } else if (id === 'antibiotics') {
    brief = 'Prepare the disc-diffusion plate: add antibiotic and control discs, replace the lid and keep sterile tools and measuring equipment ready. Keep the flame clear of the plate.';
    items = [
      makeItem('petri_dish', 'Nutrient-agar Petri dish', 'petri', true, 'Culture plate containing nutrient agar.'),
      makeItem('antibiotic_discs', 'Coded antibiotic discs', 'discs', true, 'A matched set of antibiotic test discs.'),
      makeItem('control_disc', 'Sterile-water control disc', 'discs', true, 'A control for comparison with the antibiotic discs.', { width: 40, height: 24 }),
      makeItem('petri_lid', 'Petri-dish lid', 'lid', true, 'Cover for the prepared plate.', { width: 240, height: 38 }),
      makeItem('sterile_swab', 'Sterile swab', 'swab', true, 'For spreading the bacterial culture evenly.'),
      makeItem('sterile_forceps', 'Sterile forceps', 'forceps', true, 'For handling discs without touching them.'),
      makeItem('bunsen_burner', 'Bunsen burner · safety flame', 'bunsen', true, 'Place safely away from the plate and loose equipment.'),
      makeItem('marker', 'Black marker', 'marker', true, 'For labelling the outside of the dish base.'),
      makeItem('ruler', 'Millimetre ruler', 'ruler', true, 'For measuring inhibition-zone diameters.')
    ];
    add('petri_dish', 'antibiotic_discs', -25, -31, 'Antibiotic discs spaced on the agar', 'Place the antibiotic discs on the nutrient agar.');
    add('petri_dish', 'control_disc', 64, -31, 'Control disc alongside the antibiotic discs', 'Add the sterile-water control disc to the plate.');
    add('petri_dish', 'petri_lid', 0, -45, 'Lid covering the prepared dish', 'Replace the Petri-dish lid over the prepared plate.');
    rules.push({ id: 'flame_clearance', type: 'separation', a: 'bunsen_burner', b: 'petri_dish', minDistance: 230, label: 'Flame kept clear of the culture plate', feedback: 'Move the Bunsen burner away from the Petri dish; the plate must not be heated.' });
  } else if (id === 'ivdevices' && items.length >= 4) {
    brief = 'Assemble the test circuit with the ammeter in series and the voltmeter in parallel across the component. Snap the terminal connections into place to complete the circuit.';
    kind('item_0', 'power'); kind('item_1', 'meter'); kind('item_2', 'meter');
    const component = items.find(i => i.id === 'item_3');
    if (component) { component.kind = 'component'; component.width = 170; component.height = 105; }
    add('item_0', 'item_1', 200, -130, 'Supply positive connected to the series ammeter', 'Connect the positive supply terminal to the ammeter input.', wire(redPort(-.3, -.25, -.35, -.25)));
    add('item_1', 'item_3', 250, 130, 'Ammeter output connected in series with the component', 'Connect the ammeter output to the component input to measure the current through it.', wire(redPort(.35, -.25, -.4, -.3)));
    add('item_0', 'item_3', 450, 0, 'Component return connected to supply negative', 'Complete the series loop from the component output to the negative supply terminal.', wire(blackPort(.3, -.25, .4, -.3)));
    add('item_3', 'item_2', 0, -220, 'Voltmeter connected across both component terminals', 'Connect the voltmeter in parallel across the component, with one lead at each terminal.', wire(redPort(-.4, -.3, -.35, -.25), blackPort(.4, -.3, .35, -.25)));
  } else if (id === 'electro' && items.length >= 4) {
    brief = 'Build the electrolysis cell. Support both electrodes in the electrolyte and connect each to its own power-supply terminal using the crocodile leads.';
    items.push(makeItem('electrolyte_beaker', 'Beaker of copper chloride solution', 'beaker', true, 'The cell contains the electrolyte and two separated graphite electrodes.', { width: 200, height: 160 }));
    kind('item_0', 'electrodes'); kind('item_1', 'leads'); kind('item_2', 'power');
    add('electrolyte_beaker', 'item_0', 0, -20, 'Separated electrodes dipping into the electrolyte', 'Lower both electrodes into the beaker so their tips are immersed and the electrodes do not touch.');
    add('item_2', 'item_1', 180, -60, 'Red and black leads connected to the power supply', 'Connect one lead to each power-supply terminal.', wire(redPort(-.3, -.25, -.4, -.35), blackPort(.3, -.25, -.4, -.1)));
    add('item_1', 'item_0', 180, 40, 'Anode positive and cathode negative connected separately', 'Clip the positive lead to the anode and the negative lead to the cathode.', wire(redPort(.4, -.35, -.3, -.95), blackPort(.4, -.1, .3, -.95)));
  } else {
    // Do not invent assembly joints for instruments that simply sit alongside
    // each other. These known physical relationships are meaningful to assess.
    const byKind = target => items.find(i => i.kind === target)?.id;
    const linkKinds = (aKind, bKind, dx, dy, label, feedback, options = {}) => {
      const a = byKind(aKind), b = byKind(bKind);
      if (a && b && a !== b) add(a, b, dx, dy, label, feedback, options);
    };
    if (id === 'chrom') {
      linkKinds('beaker', 'paper', 0, -20, 'Chromatography paper supported in the beaker', 'Lower the paper vertically into the beaker with the sample baseline above the solvent.');
    } else if (id === 'salts') {
      linkKinds('beaker', 'funnel', 0, -140, 'Filter funnel above the collecting beaker', 'Position the funnel over the beaker so it collects the filtrate.');
    } else if (id === 'mass') {
      linkKinds('tripod', 'crucible', 0, -160, 'Crucible supported above the burner', 'Place the crucible on the top of the tripod support.');
      linkKinds('tripod', 'bunsen', 0, 0, 'Burner beneath the tripod', 'Place the Bunsen burner beneath the supported crucible.');
    } else if (id === 'displacement') {
      // The rack is listed before the tubes; identify each by name explicitly.
      const tubes = items.find(i => /4 test tubes/i.test(i.name));
      if (tubes) { kind(tubes.id, 'tube', { width: 140 }); add(byKind('rack'), tubes.id, 0, -20, 'Test tubes supported in the rack', 'Stand the test tubes upright in the rack.'); }
    } else if (id === 'density') {
      linkKinds('beaker', 'cylinder', 170, 0, 'Cylinder under the Eureka-can spout', 'Move the measuring cylinder beneath the side spout to collect displaced water.');
    } else if (id === 'hooke') {
      linkKinds('stand', 'spring', 75, -180, 'Spring suspended from the clamp', 'Hang the spring from the clamp, clear of the stand.');
      linkKinds('spring', 'masses', 0, 100, 'Mass hanger attached to the spring', 'Attach the mass hanger to the lower end of the spring.');
      linkKinds('spring', 'ruler', 90, 0, 'Ruler aligned beside the spring', 'Place the ruler beside the spring and pointer to read extension.', { group: false });
      const rulerId = byKind('ruler'); if (rulerId) kind(rulerId, 'ruler', { width: 35, height: 250 });
    } else if (id === 'lipase') {
      const tube = items.find(i => /test tube/i.test(i.name));
      if (tube) { kind(tube.id, 'tube'); add(byKind('bath'), tube.id, 0, -20, 'Reaction tube in the water bath', 'Stand the reaction tube in the water bath to control its temperature.'); }
    } else if (id === 'pondweed') {
      linkKinds('beaker', 'tube', 0, -15, 'Pondweed tube supported in the beaker', 'Position the tube containing pondweed in the beaker.');
      // The lamp and ruler remain independent: their separation is the variable.
    } else if (id === 'fieldlines') {
      linkKinds('magnet', 'paper', 0, -50, 'Paper supported above the magnet', 'Place the paper above the magnet before adding filings.');
    } else if (id === 'wirelength') {
      const specimen = items.find(i => /nichrome/i.test(i.name));
      if (specimen) kind(specimen.id, 'wire');
      linkKinds('ruler', 'wire', 0, -10, 'Resistance wire aligned with the ruler', 'Lay the wire and contacts alongside the ruler so its length can be measured.');
      linkKinds('power', 'meter', 240, -150, 'Power supply connected through the ammeter', 'Connect the supply and ammeter in series before connecting the test wire.', wire(redPort()));
      linkKinds('meter', 'wire', 220, 150, 'Test wire connected to the measuring circuit', 'Connect the measured wire length into the series circuit and place the voltmeter across it.', wire(redPort(.35, -.25, -.45, -.5), blackPort(-.35, -.25, .45, -.5)));
      linkKinds('power', 'wire', 460, 0, 'Return lead completes the wire circuit', 'Return the wire output to the negative supply terminal.', wire(blackPort(.3, -.25, .45, -.5)));
    } else if (id === 'convection') {
      const tube = items.find(i => /convection tube/i.test(i.name));
      if (tube) { kind(tube.id, 'tube', { width: 240, height: 250 }); add(byKind('stand'), tube.id, 125, -100, 'Convection tube secured in the clamp', 'Support the glass convection tube in the clamp.'); }
      linkKinds('tile', 'bunsen', 0, -10, 'Burner on the heatproof mat', 'Stand the Bunsen burner on the heatproof mat.');
    }
  }

  // Generic metadata originally exposed only four items. Rebuild from the full
  // gear list above, while retaining explicitly-labelled distractors.
  if (!explicit) {
    const distractors = palette.filter(p => p.isCorrect === false);
    for (const p of distractors) {
      if (!items.some(i => i.id === p.id)) items.push(makeItem(p.id, p.name, equipmentKind(p.name), false, p.distractorReason || 'Not needed for this investigation.'));
    }
  }
  const ids = new Set(items.map(i => i.id));
  const safeConnections = connections.filter(c => ids.has(c.a) && ids.has(c.b));
  return { practicalId: id, width: 1000, height: 600, items, connections: safeConnections, rules, brief };
}

function placed(session) { return session.placedEquipment || {}; }
function spec(session) { return session.assemblySpec || { items: [], connections: [], rules: [] }; }
function finitePoint(point) { return point && Number.isFinite(point.x) && Number.isFinite(point.y); }
function hasItem(session, id) { return spec(session).items.some(i => i.id === id) && finitePoint(placed(session)[id]); }
function connectionFits(connection, positions) {
  const a = positions[connection.a], b = positions[connection.b];
  return finitePoint(a) && finitePoint(b) && Math.hypot(b.x - a.x - connection.dx, b.y - a.y - connection.dy) <= (connection.tolerance ?? 26);
}

// Only children of the part being dragged follow it. Moving a probe out of its
// vessel therefore detaches it; moving the vessel carries its assembled parts.
function movingDescendants(session, rootId) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of spec(session).connections || []) {
      if (c.group === false || !result.has(c.a) || result.has(c.b) || !connectionFits(c, placed(session))) continue;
      result.add(c.b); changed = true;
    }
  }
  return result;
}

function boundedPoint(session, id, x, y, moving = new Set([id])) {
  const model = spec(session), positions = placed(session), origin = positions[id];
  let minX = 0, maxX = model.width || 1000, minY = 0, maxY = model.height || 600;
  for (const moveId of moving) {
    const item = model.items.find(i => i.id === moveId);
    if (!item) continue;
    const relative = finitePoint(origin) && finitePoint(positions[moveId])
      ? { x: positions[moveId].x - origin.x, y: positions[moveId].y - origin.y } : { x: 0, y: 0 };
    const p = ASSEMBLY_BENCH.padding;
    minX = Math.max(minX, (item.minX ?? item.width / 2 + p) - relative.x);
    maxX = Math.min(maxX, (item.maxX ?? (model.width || 1000) - item.width / 2 - p) - relative.x);
    minY = Math.max(minY, (item.minY ?? item.height + p) - relative.y);
    maxY = Math.min(maxY, (item.maxY ?? (model.height || 600) - p) - relative.y);
  }
  return { x: Math.min(Math.max(x, minX), maxX), y: Math.min(Math.max(y, minY), maxY) };
}

/** Get a compatible nearby joint without changing any state. */
export function getSnapCandidate(session, id, x, y) {
  if (!spec(session).items.some(i => i.id === id) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const moving = movingDescendants(session, id);
  const positions = placed(session), origin = positions[id];
  let nearest = null;
  for (const connection of spec(session).connections || []) {
    // A connection to any moving child can anchor the whole moving assembly.
    const aMoves = moving.has(connection.a), bMoves = moving.has(connection.b);
    if (aMoves === bMoves) continue;
    const movingId = aMoves ? connection.a : connection.b;
    const otherId = aMoves ? connection.b : connection.a;
    if (!hasItem(session, otherId)) continue;
    const other = positions[otherId];
    const relative = movingId !== id && finitePoint(origin) && finitePoint(positions[movingId])
      ? { x: positions[movingId].x - origin.x, y: positions[movingId].y - origin.y } : { x: 0, y: 0 };
    const target = {
      x: other.x + (aMoves ? -connection.dx : connection.dx) - relative.x,
      y: other.y + (aMoves ? -connection.dy : connection.dy) - relative.y
    };
    const bounded = boundedPoint(session, id, target.x, target.y, moving);
    if (Math.hypot(bounded.x - target.x, bounded.y - target.y) > 0.01) continue;
    const distance = Math.hypot(x - target.x, y - target.y);
    if (distance <= (connection.snapRadius ?? 65) && (!nearest || distance < nearest.distance)) {
      nearest = { connectionId: connection.id, otherId, x: target.x, y: target.y, distance, label: connection.label };
    }
  }
  return nearest;
}

function refreshConnections(session) {
  session.assemblyConnections = (spec(session).connections || []).filter(c => connectionFits(c, placed(session))).map(c => c.id);
}

/** Place or move one apparatus item. Existing attached descendants move with it. */
export function placeAssemblyItem(session, id, x, y, { snap = true } = {}) {
  if (!spec(session).items.some(i => i.id === id) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  session.placedEquipment ||= {};
  const moving = movingDescendants(session, id), origin = session.placedEquipment[id];
  const candidate = snap ? getSnapCandidate(session, id, x, y) : null;
  const point = boundedPoint(session, id, candidate?.x ?? x, candidate?.y ?? y, moving);
  if (finitePoint(origin)) {
    const dx = point.x - origin.x, dy = point.y - origin.y;
    for (const child of moving) {
      if (child !== id && finitePoint(session.placedEquipment[child])) {
        session.placedEquipment[child] = { x: session.placedEquipment[child].x + dx, y: session.placedEquipment[child].y + dy };
      }
    }
  }
  session.placedEquipment[id] = point;
  refreshConnections(session);
  return candidate;
}

export function removeAssemblyItem(session, id) {
  if (session.placedEquipment) delete session.placedEquipment[id];
  refreshConnections(session);
}

export function clearAssembly(session) {
  session.placedEquipment = {};
  session.assemblyConnections = [];
}

function evaluateRule(rule, positions) {
  const a = positions[rule.a], b = positions[rule.b];
  if (!finitePoint(a) || (rule.type !== 'position' && !finitePoint(b))) return 'missing';
  if (rule.type === 'separation') return Math.hypot(a.x - b.x, a.y - b.y) >= rule.minDistance ? 'correct' : 'incorrect';
  if (rule.type === 'position') return a.x >= rule.minX && a.x <= rule.maxX && a.y >= rule.minY && a.y <= rule.maxY ? 'correct' : 'incorrect';
  return 'incorrect';
}

/** Marks are always recomputed from geometry, never from remembered snap events. */
export function evaluateAssembly(session) {
  const model = spec(session), positions = placed(session), required = model.items.filter(i => i.required);
  const feedback = [];
  let score = 0;
  for (const item of required) {
    const present = hasItem(session, item.id);
    if (present) score++;
    feedback.push({ status: present ? 'correct' : 'missing', itemId: item.id, message: present ? `${item.name} selected.` : `Add ${item.name.toLowerCase()} to the bench.` });
  }
  const unnecessary = model.items.filter(i => !i.required && hasItem(session, i.id));
  const unknown = Object.keys(positions).filter(id => !model.items.some(item => item.id === id));
  const hasRequired = required.some(i => hasItem(session, i.id));
  if (hasRequired && !unnecessary.length && !unknown.length) {
    score += 2;
    feedback.push({ status: 'correct', message: 'Apparatus choices are appropriate; no unnecessary equipment has been added.' });
  }
  for (const item of unnecessary) feedback.push({ status: 'incorrect', itemId: item.id, message: `Remove ${item.name.toLowerCase()}. ${item.description || 'It is not needed for this investigation.'}` });
  for (const id of unknown) feedback.push({ status: 'incorrect', itemId: id, message: 'Remove the unrecognised apparatus item from this bench.' });
  const connections = (model.connections || []).map(connection => {
    const valid = connectionFits(connection, positions);
    const status = valid ? 'correct' : hasItem(session, connection.a) && hasItem(session, connection.b) ? 'incorrect' : 'missing';
    if (valid) score++;
    feedback.push({ status, connectionId: connection.id, message: valid ? connection.label : connection.feedback });
    return { id: connection.id, a: connection.a, b: connection.b, label: connection.label, valid, status };
  });
  for (const rule of model.rules || []) {
    const status = evaluateRule(rule, positions);
    if (status === 'correct') score++;
    feedback.push({ status, ruleId: rule.id, message: status === 'correct' ? rule.label : rule.feedback });
  }
  return { score, max: required.length + connections.length + (model.rules || []).length + (required.length ? 2 : 0), feedback, connections };
}

export function serializeAssembly(session) {
  const result = evaluateAssembly(session);
  return {
    coordinateSystem: '1000 × 600; equipment position is bottom centre',
    items: spec(session).items.filter(item => hasItem(session, item.id)).map(item => ({ id: item.id, name: item.name, kind: item.kind, ...placed(session)[item.id] })),
    connections: result.connections,
    score: result.score,
    max: result.max
  };
}

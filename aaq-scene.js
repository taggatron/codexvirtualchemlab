import * as THREE from './vendor/three.module.js?v=20260823-1';
import { calculateAAQResult } from './aaq-models.js';
import { createMainsLead } from './mains-leads.js?v=20260908-4';

// The AAQ bench uses actual three-dimensional apparatus. Each view owns its
// geometries, materials and textures, so switching practicals releases GPU work.
const C = { ivory: 0xf0f1e9, teal: 0x15877f, dark: 0x183a47, metal: 0x778e96, glass: 0xd8f5ff, blue: 0x539ac9, purple: 0x805bc5, orange: 0xe4a357 };
const AAQ_MAINS_SOCKETS = { left: [-3.7, 1.25, -3.145], right: [3.7, 1.25, -3.145] };
const clamp = v => Math.max(0, Math.min(1, v));
const phase = (s, n) => s.stage >= n ? 1 : s.stage === n - 1 && s.running ? clamp(s.progress || 0) : 0;
const smooth = x => x * x * (3 - 2 * x);
function mat(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .4, metalness: .04, ...options }); }
function glass(opacity = .29) { return new THREE.MeshPhysicalMaterial({ color: C.glass, transparent: true, opacity, roughness: .08, metalness: .03, side: THREE.DoubleSide, depthWrite: false, clearcoat: .6 }); }
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = !material.transparent; m.receiveShadow = true; parent.add(m); return m;
}
function box(p, w, h, d, material, x = 0, y = 0, z = 0) { return mesh(p, new THREE.BoxGeometry(w, h, d), material, x, y, z); }
function roundedGeometry(w, h, d, radius = .08) {
  const r = Math.min(radius, w / 3, h / 3, d / 3), s = new THREE.Shape(), a = w / 2, b = h / 2;
  s.moveTo(-a + r, -b); s.lineTo(a - r, -b); s.quadraticCurveTo(a, -b, a, -b + r); s.lineTo(a, b - r); s.quadraticCurveTo(a, b, a - r, b); s.lineTo(-a + r, b); s.quadraticCurveTo(-a, b, -a, b - r); s.lineTo(-a, -b + r); s.quadraticCurveTo(-a, -b, -a + r, -b);
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(.005, d - r * 2), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 5, steps: 1 }); geo.center(); return geo;
}
function round(p, w, h, d, material, x = 0, y = 0, z = 0, r = .06) { return mesh(p, roundedGeometry(w, h, d, r), material, x, y, z); }
function cylinder(p, r, h, material, x = 0, y = 0, z = 0, top = r) { return mesh(p, new THREE.CylinderGeometry(top, r, h, 48), material, x, y, z); }
function sphere(p, r, material, x = 0, y = 0, z = 0) { return mesh(p, new THREE.SphereGeometry(r, 28, 18), material, x, y, z); }
function ring(p, r, thickness, material, x = 0, y = 0, z = 0, horizontal = true) { const m = mesh(p, new THREE.TorusGeometry(r, thickness, 12, 64), material, x, y, z); if (horizontal) m.rotation.x = Math.PI / 2; return m; }
function hose(p, points, radius, color) { return mesh(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v))), 64, radius, 10, false), mat(color, { roughness: .67 })); }
function segment(p, a, b, radius, material) { const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), m = cylinder(p, radius, va.distanceTo(vb), material); m.position.copy(va).add(vb).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize()); return m; }
function seeded(seed = 51) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296); }
function canvasTexture(w, h, paint) { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); paint?.(ctx, w, h); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return { canvas, ctx, texture }; }
function textPlane(p, text, w, h, x, y, z, opts = {}) {
  const tx = canvasTexture(Math.max(256, Math.round(w * 320)), Math.max(64, Math.round(h * 320)), (ctx, width, height) => {
    ctx.fillStyle = opts.background || '#f0f1e9'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = opts.color || '#183a47'; ctx.font = `700 ${opts.fontSize || Math.round(height * .48)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, width / 2, height / 2, width * .94);
  });
  const m = mesh(p, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx.texture, side: THREE.DoubleSide, toneMapped: false }), x, y, z); m.castShadow = false; return m;
}
function button(p, x, y, z, color = C.teal, r = .058) { const m = cylinder(p, r, .025, mat(color), x, y, z); m.rotation.x = Math.PI / 2; return m; }
function dial(p, x, y, z, r = .13) {
  const m = cylinder(p, r, .09, mat(C.dark), x, y, z); m.rotation.x = Math.PI / 2; box(p, .02, r * .65, .008, mat(0xd6e9ea), x, y + r * .22, z + .05); return m;
}
function instrument(p, x, z, w, h, d, label) {
  const g = new THREE.Group(); g.position.set(x, .04, z); p.add(g); round(g, w, h, d, mat(C.ivory), 0, h / 2, 0, .1); round(g, w * .98, .14, d * 1.01, mat(C.dark), 0, .12, 0, .035);
  for (const fx of [-1, 1]) for (const fz of [-1, 1]) cylinder(g, .1, .08, mat(0x203039), fx * (w / 2 - .15), .01, fz * (d / 2 - .15));
  if (label) textPlane(g, label, w * .84, .15, 0, h - .16, d / 2 + .105);
  return g;
}
function tube(p, x, z, color = 0x6dbccc, height = 1.36, radius = .17, liquidLevel = .57) {
  const g = new THREE.Group(); g.position.set(x, .08, z); p.add(g);
  mesh(g, new THREE.CylinderGeometry(radius, radius, height - radius, 40, 1, true), glass(), 0, (height + radius) / 2, 0);
  const bottom = sphere(g, radius, glass(), 0, radius, 0); bottom.scale.y = .9;
  ring(g, radius, .018, glass(.6), 0, height, 0);
  const fill = cylinder(g, radius * .87, height * liquidLevel, mat(color, { transparent: true, opacity: .72, roughness: .2, depthWrite: false }), 0, radius + height * liquidLevel / 2, 0);
  const meniscus = cylinder(g, radius * .87, .014, mat(color, { transparent: true, opacity: .64, roughness: .1, depthWrite: false }), 0, radius + height * liquidLevel, 0);
  for (let i = 1; i <= 4; i++) box(g, radius * .65, .013, .012, mat(0x789ca6), radius * .36, height * (.23 + i * .13), radius * .94);
  return { g, fill, meniscus, height, radius };
}
function rack(p, x = 0, z = 0, width = 3.4) {
  const g = new THREE.Group(); g.position.set(x, 0, z); p.add(g); const wood = mat(0xd4e1df);
  round(g, width, .13, .8, wood, 0, .16, 0); round(g, width, .11, .55, wood, 0, .8, -.035);
  for (const side of [-1, 1]) { box(g, .13, .77, .65, wood, side * (width / 2 - .1), .44, 0); }
  return g;
}
function pipette(p, x, y, z, color = C.teal) {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  cylinder(g, .095, .64, mat(C.ivory)); cylinder(g, .1, .16, mat(color), 0, .39, 0); cylinder(g, .036, .18, mat(C.metal), 0, .54, 0); cylinder(g, .09, .04, mat(color), 0, .65, 0);
  cylinder(g, .025, .43, glass(.62), 0, -.52, 0, .057); textPlane(g, '100 µL', .14, .2, 0, .06, .097, { fontSize: 23 }); return g;
}
function beaker(p, x, z, color = 0x81c6d9, r = .5, height = 1.05) {
  const g = new THREE.Group(); g.position.set(x, .08, z); p.add(g);
  mesh(g, new THREE.CylinderGeometry(r, r * .93, height, 64, 1, true), glass(), 0, height / 2, 0); cylinder(g, r * .93, .035, glass(.4), 0, .03, 0); ring(g, r, .025, glass(.6), 0, height, 0);
  const liquid = cylinder(g, r * .9, height * .55, mat(color, { transparent: true, opacity: .52, roughness: .15, depthWrite: false }), 0, height * .28, 0);
  for (let i = 1; i < 5; i++) { box(g, .17, .012, .01, mat(0x6a929e), r * .18, i * height / 6, r * .985); }
  return { g, liquid };
}
function makeMonitor(p, x, y, z, w = 1.6, h = .95) {
  round(p, w + .12, h + .13, .09, mat(C.dark), x, y, z, .025);
  const tx = canvasTexture(640, 360); const panel = mesh(p, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx.texture, toneMapped: false }), x, y, z + .05); panel.castShadow = false;
  return { ...tx, paint(draw) { draw(tx.ctx, tx.canvas.width, tx.canvas.height); tx.texture.needsUpdate = true; } };
}
function monitorBase(ctx, w, h, title) {
  ctx.fillStyle = '#0b2830'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#19464c'; ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 56; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = '#a8d4d4'; ctx.font = '600 21px system-ui'; ctx.textAlign = 'left'; ctx.fillText(title, 25, 34);
}
function readout(screen, title, value, unit, sub = 'READY') {
  screen.paint((c, w, h) => { monitorBase(c, w, h, title); c.fillStyle = '#8ae5c3'; c.font = '600 97px system-ui'; c.fillText(value, 30, 195); c.font = '500 28px system-ui'; c.fillStyle = '#c9e6e6'; c.fillText(unit, 35, 238); c.font = '600 21px system-ui'; c.fillStyle = '#8eafb6'; c.fillText(sub, 35, 315); });
}
function disposeTree(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { materials.add(m); for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); } });
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
}

export class AAQScene {
  constructor(canvas) {
    this.canvas = canvas; this.available = false; this.contextLost = false; this.key = ''; this.updates = []; this.lastScreen = -1; this.width = 1; this.height = 1;
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.08;
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xeaf0ef); this.scene.fog = new THREE.Fog(0xeaf0ef, 13, 24);
      this.camera = new THREE.PerspectiveCamera(37, 1, .1, 40); this.camera.position.set(0, 4.1, 8.8); this.camera.lookAt(0, 1.1, 0);
      this.root = new THREE.Group(); this.scene.add(this.root); this.buildRoom(); this.available = true;
      this.onLost = e => { e.preventDefault(); this.contextLost = true; };
      this.onRestored = () => { this.contextLost = false; this.key = ''; this.canvas.dispatchEvent(new CustomEvent('aaqneedsredraw')); };
      canvas.addEventListener('webglcontextlost', this.onLost); canvas.addEventListener('webglcontextrestored', this.onRestored);
    } catch (error) { console.warn('The AAQ 3D bench could not initialise.', error); }
  }
  buildRoom() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x597c81, 2.6));
    const key = new THREE.DirectionalLight(0xfffaf0, 3.4); key.position.set(-4, 8, 6); key.castShadow = true; key.shadow.mapSize.set(1536, 1536); Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -4 }); key.shadow.bias = -.0004; key.shadow.normalBias = .025; this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xa8e5ff, 1.5); fill.position.set(5, 4, -2); this.scene.add(fill);
    box(this.scene, 18, .28, 10, mat(0x247389, { roughness: .77 }), 0, -.16, 0);
    box(this.scene, 18, .08, .1, mat(0x87afb7), 0, -.04, 4.4);
    const wall = mesh(this.scene, new THREE.PlaneGeometry(18, 8), mat(0xe7ecea, { roughness: .94 }), 0, 3.85, -3.3); wall.receiveShadow = true;
    const points = [];
    for (let x = -9; x <= 9; x += .85) points.push(x, 0, -3.28, x, 8, -3.28);
    for (let y = 0; y < 8; y += .64) points.push(-9, y, -3.28, 9, y, -3.28);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); this.scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc4cecd, transparent: true, opacity: .6 })));
    // Physical splashback trim and wall sockets give the bench a useful scale.
    box(this.scene, 18, .11, .13, mat(0xd5ddda), 0, .13, -3.22);
    for (const x of [-3.7, 3.7]) {
      round(this.scene, .48, .32, .06, mat(0xf5f5ef), x, 1.25, -3.18, .03);
      for (const side of [-1, 1]) { box(this.scene, .017, .045, .01, mat(0x68777a), x + side * .055, 1.24, -3.14); }
      box(this.scene, .03, .038, .01, mat(0x68777a), x, 1.31, -3.14);
      round(this.scene, .067, .115, .021, mat(0xe4e9e5), x + .168, 1.265, -3.135, .009);
      box(this.scene, .034, .015, .005, mat(0xc45c54), x + .168, 1.295, -3.121);
    }
  }
  connectMains(apparatus, id, inletLocal, socketSide, via) {
    // Apparatus groups retain their own offsets; cable geometry belongs to the
    // scene root so the route and wall plug share one coordinate system.
    apparatus.updateWorldMatrix(true, false);
    const inlet = this.root.worldToLocal(apparatus.localToWorld(new THREE.Vector3(...inletLocal)));
    Object.assign(apparatus.userData, { powerSource: 'mains', mainsId: id, rearInlet: inletLocal.slice() });
    return createMainsLead(this.root, { id, socket: AAQ_MAINS_SOCKETS[socketSide], appliance: inlet.toArray(), direction: [0, 0, -1], via, floorY: .05 });
  }
  resize(width, height, dpr = 1) {
    if (!this.available) return;
    this.width = Math.max(1, width); this.height = Math.max(1, height); this.renderer.setPixelRatio(Math.min(2, Math.max(1, dpr)));
    this.renderer.setSize(this.width, this.height, false); this.camera.aspect = this.width / this.height;
    this.camera.fov = this.camera.aspect < 1.15 ? Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37 / 2)) * 1.15 / this.camera.aspect))) : 37;
    this.camera.updateProjectionMatrix();
  }
  switchPractical(practical) {
    disposeTree(this.root); this.root.clear(); this.updates = []; this.lastScreen = -1; this.lastState = ''; this.key = `${practical.id}:${practical.scene}`;
    const builders = { microscopy: 'microscopy', dna: 'dna', gel: 'gel', colorimeter: 'colorimeter', centrifuge: 'centrifuge', respirometer: 'respirometer', enzyme: 'enzyme', foodtest: 'foodtest', spirometer: 'spirometer', pulse: 'pulse', reflex: 'reflex', antimicrobial: 'antimicrobial' };
    this[builders[practical.scene] || 'microscopy'](practical);
  }
  render(time, state, practical) {
    if (!this.available || this.contextLost || !practical) return;
    if (this.key !== `${practical.id}:${practical.scene}`) this.switchPractical(practical);
    const t = this.reducedMotion ? 0 : (Number(time) || 0) / 1000, s = { stage: 0, progress: 0, parameter: practical.parameter?.value ?? 0, ...state };
    s.output = calculateAAQResult(practical, s.parameter, s.trialIndex || 0);
    const screenFrame = Math.floor((Number(time) || 0) / 70), signature = `${s.stage}:${s.parameter}:${s.result?.value ?? ''}:${Boolean(s.running)}:${Math.round(s.progress * 100)}`, redraw = signature !== this.lastState || (s.running && screenFrame !== this.lastScreen);
    this.lastState = signature;
    this.updates.forEach(update => update(s, t, redraw)); this.lastScreen = screenFrame; this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost); this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    if (this.scene) disposeTree(this.scene); this.scene?.traverse(o => { if (o.isLight) o.shadow?.dispose(); }); this.renderer?.dispose(); this.available = false;
  }
  microscopy() {
    const p = this.root, g = new THREE.Group(); g.position.x = -1.3; p.add(g); const ivory = mat(C.ivory), dark = mat(C.dark), steel = mat(C.metal, { metalness: .8, roughness: .22 });
    round(g, 1.8, .24, 1.5, ivory, 0, .17, 0, .12); round(g, 1.47, .1, 1.19, dark, 0, .1, 0);
    this.connectMains(g, 'aaq-microscope-illuminator', [0, .2, -.75], 'left', [[-3.12, .05, -2.55], [-2.45, .05, -1.65], [-1.5, .05, -1.12]]);
    const arm = new THREE.Shape(); arm.moveTo(-.43, .26); arm.lineTo(-.4, 2.5); arm.quadraticCurveTo(-.42, 2.89, .22, 2.94); arm.lineTo(.48, 2.58); arm.lineTo(.12, 2.44); arm.lineTo(-.02, .39); arm.closePath();
    const armGeo = new THREE.ExtrudeGeometry(arm, { depth: .35, bevelEnabled: true, bevelSegments: 4, bevelSize: .06, bevelThickness: .05, steps: 1 });
    // Centre the arm thickness, then turn its side profile clockwise into the
    // front–back plane: the foot sits on the rear of the base and the curved
    // upper arm reaches forward to the optical head above the specimen.
    armGeo.translate(0, -.26, -.175);
    // Keep the foot fixed while bringing the upper support onto the body tube,
    // below the eyepiece, so the rotated curve cannot cover the viewing lens.
    armGeo.scale(1, .86, 1);
    armGeo.translate(0, .26, 0);
    const armMesh = mesh(g, armGeo, ivory, 0, 0, -.25);
    armMesh.name = 'microscope-rear-support-arm';
    armMesh.rotation.y = -Math.PI / 2;
    round(g, 1.35, .11, .95, dark, 0, 1.12, .18); box(g, .38, .01, .55, mat(0x111c22), 0, 1.184, .24);
    const slide = box(g, .88, .035, .37, glass(.74), 0, 1.21, .25); box(g, .15, .006, .14, mat(0xbd8cce, { transparent: true, opacity: .7 }), 0, 1.233, .25);
    for (const x of [-.44, .43]) { box(g, .065, .024, .33, steel, x, 1.235, .13); }
    cylinder(g, .32, .09, steel, 0, 1.75, .2); const objectives = new THREE.Group(); objectives.position.set(0, 1.75, .2); g.add(objectives);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, x = Math.cos(a) * .21, z = Math.sin(a) * .21; cylinder(objectives, .075, .28 + i * .035, steel, x, -.18, z); cylinder(objectives, .081, .038, mat([0xd2474d, 0xe0b33c, 0x4c8dcc][i]), x, -.22, z); }
    const head = new THREE.Group(); head.position.set(0, 2.29, .18); head.rotation.x = -.35; g.add(head); cylinder(head, .21, .57, ivory); cylinder(head, .13, .25, dark, 0, .4, 0); cylinder(head, .15, .05, dark, 0, .55, 0); cylinder(head, .108, .01, mat(0x275872, { metalness: .6 }), 0, .582, 0);
    for (const side of [-1, 1]) { const coarse = cylinder(g, .21, .15, dark, side * .69, .94, -.33); coarse.rotation.z = Math.PI / 2; const fine = cylinder(g, .12, .21, steel, side * .73, .94, -.33); fine.rotation.z = Math.PI / 2; }
    cylinder(g, .22, .1, dark, 0, .4, .22); const lamp = cylinder(g, .16, .016, mat(0xeaf7df, { emissive: 0xe0eab3, emissiveIntensity: .25 }), 0, .46, .22); textPlane(g, 'COMPOUND MICROSCOPE', 1.3, .16, 0, .22, .815);
    const field = canvasTexture(768, 768), fieldMesh = mesh(p, new THREE.CircleGeometry(1.15, 96), new THREE.MeshBasicMaterial({ map: field.texture, toneMapped: false }), 1.5, 1.63, .45); fieldMesh.rotation.x = -.13;
    ring(p, 1.2, .065, mat(C.ivory), 1.5, 1.63, .45, false).rotation.x = -.13; textPlane(p, 'MICROSCOPE FIELD OF VIEW', 2.46, .22, 1.5, 3, .45, { background: '#e7ecea' });
    let lastField = '';
    this.updates.push((s, t, redraw) => {
      slide.position.x = (1 - smooth(phase(s, 1))) * .32; objectives.rotation.y = phase(s, 2) * Math.PI * .66; lamp.material.emissiveIntensity = .2 + phase(s, 1) * .6;
      const signature = `${s.parameter}:${s.stage}:${Math.round(phase(s, 2) * 12)}`;
      if (!redraw || signature === lastField) return; lastField = signature;
      const c = field.ctx, rng = seeded(871), focus = phase(s, 2); c.fillStyle = '#eee3f1'; c.fillRect(0, 0, 768, 768); c.filter = `blur(${(1 - focus) * 3}px)`;
      const mag = Math.max(.5, Math.min(2.8, Number(s.parameter) / 20 || 1)), spacing = 125 * mag;
      for (let row = -2; row < 9; row++) for (let col = -2; col < 9; col++) { const x = col * spacing + (row % 2) * spacing * .4 + (rng() - .5) * 26, y = row * spacing * .8 + (rng() - .5) * 35, r = spacing * (.33 + rng() * .12); c.beginPath(); c.ellipse(x, y, r, r * .74, rng(), 0, Math.PI * 2); c.fillStyle = '#d3b3dc'; c.fill(); c.strokeStyle = '#9671ad'; c.lineWidth = 3; c.stroke(); c.beginPath(); c.ellipse(x + r * .1, y, r * .24, r * .2, 0, 0, Math.PI * 2); c.fillStyle = '#714194'; c.fill(); c.beginPath(); c.arc(x + r * .13, y - 2, r * .067, 0, Math.PI * 2); c.fillStyle = '#472866'; c.fill(); }
      const r = 75 * mag; c.beginPath(); c.ellipse(384, 340, r, r * .74, 0, 0, Math.PI * 2); c.fillStyle = '#d3b3dc'; c.fill(); c.strokeStyle = '#80589b'; c.lineWidth = 4; c.stroke(); c.beginPath(); c.ellipse(394, 339, r * .24, r * .2, 0, 0, Math.PI * 2); c.fillStyle = '#714194'; c.fill(); c.filter = 'none'; const yMeasure = 340 + r * .74 + 22; c.strokeStyle = '#54356b'; c.lineWidth = 3; c.beginPath(); c.moveTo(384 - r, yMeasure - 8); c.lineTo(384 - r, yMeasure + 8); c.moveTo(384 - r, yMeasure); c.lineTo(384 + r, yMeasure); c.moveTo(384 + r, yMeasure - 8); c.lineTo(384 + r, yMeasure + 8); c.stroke(); c.font = '600 23px system-ui'; c.fillStyle = '#54356b'; c.textAlign = 'center'; c.fillText('60 µm', 384, yMeasure + 35); c.lineWidth = 7; c.beginPath(); c.moveTo(550 - 25 * mag, 650); c.lineTo(550 + 25 * mag, 650); c.stroke(); c.fillText('20 µm', 550, 687); field.texture.needsUpdate = true;
    });
  }
  dna() {
    const p = this.root; rack(p, -.2, .1, 2.7); const tubes = [-.95, -.2, .55].map((x, i) => tube(p, x, .15, [0x9bbc8a, 0xbcc8a4, 0xcbdaca][i], 1.9, .23, .48));
    tubes.forEach((o, i) => { textPlane(o.g, ['LYSATE', 'FILTERED', 'DNA'][i], .37, .14, 0, .55, .235); });
    const ethanol = cylinder(tubes[2].g, .2, .55, mat(0xe2f0f1, { transparent: true, opacity: .26, depthWrite: false }), 0, 1.32, 0);
    const strands = new THREE.Group(); tubes[2].g.add(strands);
    for (let i = 0; i < 23; i++) { const pts = []; for (let j = 0; j <= 16; j++) pts.push([Math.sin(j * .8 + i) * .08 + Math.cos(i * 2) * .08, .8 + j * .038, Math.cos(j * .65 + i) * .065]); hose(strands, pts, .006 + (i % 3) * .001, 0xfefbef); }
    beaker(p, -2.25, .35, 0xb3c59a, .48, .9); textPlane(p, 'CELL EXTRACT', .88, .15, -2.25, .48, .79);
    const bottle = new THREE.Group(); bottle.position.set(2.05, 0, .15); p.add(bottle); cylinder(bottle, .37, 1.18, glass(.45), 0, .68, 0); cylinder(bottle, .18, .24, glass(), 0, 1.37, 0); cylinder(bottle, .2, .2, mat(C.teal), 0, 1.57, 0); textPlane(bottle, 'ICE-COLD ETHANOL', .61, .32, 0, .72, .37); cylinder(bottle, .33, .7, mat(0xc9e5ef, { transparent: true, opacity: .3, depthWrite: false }), 0, .46, 0);
    const rod = segment(p, [.56, 1.36, .15], [1.11, 2.6, .15], .023, glass(.78));
    textPlane(p, 'DNA PRECIPITATION', 2.45, .22, -.2, .22, .68, { background: '#d4e1df' });
    this.updates.push(s => { const prep = phase(s, 2), extract = phase(s, 3), volume = .3 + Number(s.parameter) / 8 * .7; ethanol.scale.y = Math.max(.01, prep * volume); ethanol.position.y = 1.04 + .28 * prep * volume; strands.visible = extract > 0; strands.children.forEach((strand, i) => { strand.visible = i / strands.children.length < s.output.value / 100; }); strands.scale.y = Math.max(.01, extract); strands.position.y = (1 - extract) * .8; rod.position.y = phase(s, 4) * .35; });
  }
  gel() {
    const p = this.root, tank = new THREE.Group(); tank.position.set(-.7, 0, .25); p.add(tank);
    round(tank, 3.5, .2, 2.24, mat(C.dark), 0, .16, 0); box(tank, 3.22, .09, 1.95, mat(0x174851), 0, .33, 0);
    for (const x of [-1.64, 1.64]) box(tank, .08, .46, 2.1, glass(.45), x, .48, 0);
    for (const z of [-1.05, 1.05]) box(tank, 3.28, .46, .06, glass(.45), 0, .48, z);
    box(tank, 3.16, .21, 1.94, mat(0x99d8dd, { transparent: true, opacity: .17, depthWrite: false }), 0, .49, 0);
    box(tank, 2.7, .06, 1.56, mat(0x559a91, { transparent: true, opacity: .52 }), 0, .49, -.02);
    const bands = [], wells = [];
    for (let lane = 0; lane < 5; lane++) {
      const x = -1.03 + lane * .51; const well = box(tank, .27, .035, .09, mat(0x172f43), x, .548, -.65); wells.push(well);
      for (let band = 0; band < 4; band++) { const b = box(tank, .245 - band * .015, .012, .027 + (lane === 0 ? 0 : .016), new THREE.MeshBasicMaterial({ color: lane === 0 ? 0xd2f4c4 : 0x9eef7c, transparent: true, opacity: .8 }), x, .563, -.64); b.userData.lane = lane; b.userData.distance = .27 + (band * .27) + ((lane * 3 + band) % 3) * .065; bands.push(b); }
      const label = textPlane(tank, lane === 0 ? 'L' : `${lane}`, .2, .16, x, .44, 1.096, { background: '#183a47', color: '#d3e7e5' });
    }
    for (const [z, color] of [[-.94, 0x1c2530], [.94, 0xce4a51]]) { segment(tank, [-1.42, .6, z], [1.42, .6, z], .035, mat(color, { metalness: .5 })); }
    textPlane(tank, 'AGAROSE ELECTROPHORESIS', 2.62, .16, 0, .19, 1.16, { background: '#183a47', color: '#d3e7e5' });
    const supply = instrument(p, 2.05, -.25, 1.46, 1.03, 1.31, 'POWER SUPPLY'); const screen = makeMonitor(supply, 0, .56, .75, 1.09, .45); dial(supply, .46, .25, .76, .072); button(supply, -.47, .25, .76, 0xc54d54, .06);
    this.connectMains(supply, 'aaq-electrophoresis-supply', [0, .28, -.655], 'right', [[3.17, .05, -2.45], [2.75, .05, -1.6], [2.08, .05, -1.3]]);
    hose(p, [[.73, .62, 1.19], [1.15, .35, 1.5], [2.5, .22, 1.24], [2.61, .31, .5]], .028, 0xc5454f); hose(p, [[.72, .63, -.69], [1.04, .27, -.84], [2.63, .2, -.71], [2.5, .29, .5]], .025, 0x24303c);
    const pip = pipette(p, -1.73, 1.78, -.38, C.purple); pip.rotation.z = -.16;
    this.updates.push((s, t, redraw) => { const loaded = phase(s, 2), running = phase(s, 3); pip.position.y = 1.77 - Math.sin(loaded * Math.PI) * .42; pip.position.x = -1.73 + loaded * 1.52; bands.forEach(b => { b.visible = loaded > .1; b.position.z = -.64 + smooth(running) * b.userData.distance * (b.userData.lane === 0 ? 1 : s.output.value / 40); b.material.opacity = .45 + loaded * .45; }); if (redraw) readout(screen, 'ELECTROPHORESIS', s.stage < 2 ? '0' : '100', 'V', running >= 1 ? 'SEPARATION COMPLETE' : s.running && s.stage === 2 ? 'RUNNING' : 'READY'); });
  }
  colorimeter() {
    const p = this.root, g = instrument(p, -.85, .1, 2.64, 1.44, 1.8, 'COLORIMETER · ABSORBANCE');
    this.connectMains(g, 'aaq-colorimeter', [0, .29, -.9], 'left', [[-3.1, .05, -2.5], [-2.5, .05, -1.7], [-1.0, .05, -1.24]]);
    const screen = makeMonitor(g, -.35, .79, 1.01, 1.33, .65); dial(g, .95, .61, 1.01); button(g, .76, .3, 1.01); button(g, 1.04, .3, 1.01, C.blue);
    round(g, .69, .1, .65, mat(C.dark), .68, 1.47, -.16); const slot = box(g, .23, .025, .23, mat(0x061920), .68, 1.535, -.16);
    const cuvette = new THREE.Group(); cuvette.position.set(.68, 1.54, -.16); g.add(cuvette); box(cuvette, .21, .53, .21, glass(.4), 0, .27, 0); const liquid = box(cuvette, .177, .37, .177, mat(0x9373ba, { transparent: true, opacity: .65 }), 0, .2, 0); box(cuvette, .24, .08, .24, mat(C.dark), 0, .57, 0);
    rack(p, 1.95, .15, 1.75); const standards = [];
    for (let i = 0; i < 4; i++) { const x = 1.34 + i * .41, o = tube(p, x, .16, new THREE.Color(0xe2dded).lerp(new THREE.Color(0x7252a3), i / 3), 1.31, .135); textPlane(o.g, `${i * 2}`, .19, .15, 0, .46, .14); standards.push(o); }
    textPlane(p, 'CALIBRATION STANDARDS', 1.6, .18, 1.96, .19, .65, { background: '#d4e1df' });
    const plate = round(p, 1.65, .04, .8, mat(0xf5f4ee), -.82, .08, 1.58); const notes = textPlane(p, 'BLANK → STANDARDS → SAMPLE', 1.49, .49, -.82, .108, 1.58); notes.rotation.x = -Math.PI / 2;
    this.updates.push((s, t, redraw) => { cuvette.position.y = 1.54 - .38 * phase(s, 2); liquid.material.color.setHex(0x9373ba).lerp(new THREE.Color(0x552d86), Math.min(.85, Math.max(0, Number(s.parameter) / 5))); if (redraw) readout(screen, 'ABSORBANCE', phase(s, 3) >= 1 && s.result ? Number(s.result.value).toFixed(3) : s.stage >= 2 ? '0.000' : '—', s.result?.unit || 'AU', phase(s, 3) >= 1 ? 'READING STABLE' : s.stage >= 1 ? 'BLANK REFERENCED' : 'INSERT BLANK'); });
  }
  centrifuge() {
    const p = this.root, g = instrument(p, -.85, .2, 2.82, 1.32, 2.32, 'BENCHTOP CENTRIFUGE');
    this.connectMains(g, 'aaq-centrifuge', [0, .31, -1.16], 'left', [[-3.1, .05, -2.55], [-2.5, .05, -1.75], [-1.1, .05, -1.41]]);
    cylinder(g, 1.03, .13, mat(C.dark), 0, 1.35, -.12); cylinder(g, .91, .07, mat(0x465c64, { metalness: .6 }), 0, 1.43, -.12);
    const rotor = new THREE.Group(); rotor.position.set(0, 1.48, -.12); g.add(rotor); cylinder(rotor, .66, .12, mat(0x627781, { metalness: .8 })); cylinder(rotor, .17, .2, mat(C.dark), 0, .12, 0);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, x = Math.sin(a) * .68, z = Math.cos(a) * .68; cylinder(rotor, .122, .12, mat(0x10212a), x, .02, z); cylinder(rotor, .084, .2, mat(i % 2 ? 0xb14853 : 0xf0cd74), x, .08, z); cylinder(rotor, .105, .07, mat(0xe1e6df), x, .2, z); }
    const lid = new THREE.Group(); lid.position.set(0, 1.4, -1.13); g.add(lid); cylinder(lid, 1.08, .12, mat(C.ivory), 0, 0, 1.01); cylinder(lid, .94, .03, glass(.3), 0, -.08, 1.01); lid.rotation.x = -1.02;
    const screen = makeMonitor(g, -.25, .68, 1.28, 1.49, .52); dial(g, 1.02, .58, 1.28, .12); button(g, 1.03, .31, 1.28);
    rack(p, 1.93, .22, 1.34); const samples = [1.65, 2.2].map(x => tube(p, x, .23, 0x9ca981, 1.65, .2, .67)); const upper = [], lower = [];
    for (const sample of samples) { upper.push(cylinder(sample.g, .171, .8, mat(0xd3dbac, { transparent: true, opacity: .57 }), 0, .81, 0)); lower.push(cylinder(sample.g, .172, .27, mat(0x77825b, { transparent: true, opacity: .88 }), 0, .3, 0)); }
    textPlane(p, 'PELLET + SUPERNATANT', 1.65, .18, 1.93, .19, .72, { background: '#d4e1df' });
    this.updates.push((s, t, redraw) => { const prep = phase(s, 2), spun = phase(s, 3); lid.rotation.x = -1.02 * (1 - prep) - (s.stage >= 3 ? .88 : 0); rotor.rotation.y = s.running && s.stage === 2 ? t * 11 : spun * 16; upper.forEach(o => o.visible = spun > .4); lower.forEach(o => o.visible = spun > .4); samples.forEach(o => o.fill.material.opacity = .7 * (1 - spun)); if (redraw) readout(screen, 'ROTOR SPEED', s.running && s.stage === 2 ? String(Math.round((Number(s.parameter) || 3000) * Math.min(1, spun * 4))) : '0', 'rpm', s.stage >= 3 ? 'CYCLE COMPLETE' : prep >= 1 ? 'ROTOR BALANCED' : 'BALANCE SAMPLE PAIRS'); });
  }
  respirometer() {
    const p = this.root; round(p, 4.95, .18, 1.42, mat(C.ivory), 0, .17, .15);
    const chamber = beaker(p, -1.65, .1, 0xb7cda0, .55, 1.22); chamber.liquid.visible = false; cylinder(chamber.g, .57, .13, mat(C.dark), 0, 1.25, 0); cylinder(chamber.g, .09, .2, mat(C.metal), 0, 1.42, 0);
    const rng = seeded(341); for (let i = 0; i < 19; i++) { const a = rng() * Math.PI * 2, r = rng() * .39; const seed = sphere(chamber.g, .084, mat([0x9d8c62, 0xab9863, 0x789664][i % 3]), Math.cos(a) * r, .16 + rng() * .2, Math.sin(a) * r); seed.scale.set(1, .69, .75); }
    cylinder(chamber.g, .43, .04, mat(0xd1d6c5), 0, .56, 0); for (let i = 0; i < 11; i++) sphere(chamber.g, .042, mat(0xf4f1df), (rng() - .5) * .57, .63, (rng() - .5) * .57);
    textPlane(chamber.g, 'RESPIRATION CHAMBER', .8, .25, 0, .9, .555);
    const control = beaker(p, -2.47, -.94, 0xb7cda0, .36, 1.05); control.liquid.visible = false; cylinder(control.g, .38, .1, mat(C.dark), 0, 1.08, 0); for (let i = 0; i < 10; i++) sphere(control.g, .061, mat(0xaabfc1), (rng() - .5) * .42, .17 + rng() * .16, (rng() - .5) * .42); textPlane(control.g, 'INERT CONTROL', .64, .18, 0, .7, .37); hose(p, [[-2.47, 1.21, -.94], [-2.47, 1.67, -.94], [-1.93, 1.75, -.94], [-1.62, 1.75, -.94]], .028, 0xb7d2d6);
    cylinder(p, .018, .17, mat(0xc84959), -1.71, 1.75, -.94).rotation.z = Math.PI / 2;
    round(p, .7, 2.3, .15, mat(C.ivory), .75, 1.37, -.28); hose(p, [[.58, 2.4, 0], [.58, .64, 0], [.75, .48, 0], [.93, .64, 0], [.93, 2.4, 0]], .047, 0xbfdae0);
    hose(p, [[-1.65, 1.6, .1], [-1.65, 2.12, .1], [-.65, 2.4, -.06], [.58, 2.4, 0]], .039, 0xa5c4ce);
    const left = cylinder(p, .024, .93, mat(0xc84959), .58, 1.1, .012), right = cylinder(p, .024, .93, mat(0xc84959), .93, 1.1, .012); hose(p, [[.58, .65, .012], [.59, .55, .012], [.75, .5, .012], [.92, .55, .012], [.93, .65, .012]], .025, 0xc84959);
    for (let i = 0; i < 16; i++) { box(p, i % 5 === 0 ? .14 : .075, .012, .014, mat(C.dark), .75, .7 + i * .105, -.19); }
    textPlane(p, 'mm', .22, .12, .75, 2.36, -.19); textPlane(p, 'MANOMETER', .86, .17, .77, .24, .89);
    const timer = instrument(p, 2, .2, .87, .68, .62, 'TIMER'); timer.userData.powerSource = 'battery'; const screen = makeMonitor(timer, 0, .32, .42, .65, .32);
    this.updates.push((s, t, redraw) => { const q = phase(s, 3), displacement = Math.min(.65, s.output.oxygenVolume / 4) * q; left.scale.y = 1 + displacement; left.position.y = 1.1 + displacement * .465; right.scale.y = 1 - displacement; right.position.y = 1.1 - displacement * .465; if (redraw) readout(screen, 'ELAPSED', `${Math.floor(q * 5)}:${String(Math.floor(q * 300) % 60).padStart(2, '0')}`, 'min : sec', 'SEALED SYSTEM'); });
  }
  enzyme() {
    const p = this.root, bath = instrument(p, -.7, .15, 3.18, .86, 2.05, 'THERMOSTATIC WATER BATH');
    this.connectMains(bath, 'aaq-lipase-water-bath', [0, .27, -1.025], 'left', [[-3.15, .05, -2.45], [-2.5, .05, -1.6], [-.85, .05, -1.29]]);
    box(bath, 2.85, .06, 1.72, mat(0x51747f, { metalness: .75 }), 0, .9, 0); box(bath, 2.7, .08, 1.55, mat(0x6dc1d5, { transparent: true, opacity: .58, roughness: .1 }), 0, .94, 0);
    for (const x of [-1.47, 1.47]) box(bath, .07, .12, 1.85, mat(C.metal, { metalness: .7 }), x, .97, 0);
    const samples = [-1.65, -.83, -.01].map((x, i) => { const o = tube(p, x, .13, 0xe387b3, 1.4, .19, .49); o.g.position.y = .69; textPlane(o.g, ['LIPASE', 'REPEAT', 'CONTROL'][i], .35, .13, 0, .6, .195); return o; });
    const screen = makeMonitor(bath, -.8, .44, 1.14, .86, .36); dial(bath, .99, .43, 1.14); button(bath, .69, .34, 1.14);
    const drop = sphere(p, .044, mat(0xf6edd8, { transparent: true, opacity: .86 }), -1.65, 2.33, .13); const pip = pipette(p, -1.65, 2.86, .13, C.orange);
    const timer = instrument(p, 1.98, -.15, 1.25, 1.15, 1.1, 'LIPASE ENDPOINT'); timer.userData.powerSource = 'battery'; const endpoint = makeMonitor(timer, 0, .64, .65, 1.04, .6); button(timer, -.35, .25, .66);
    const lipid = beaker(p, 2.95, .66, 0xf4e8ce, .36, .72); textPlane(lipid.g, 'LIPID EMULSION', .72, .17, 0, .43, .43);
    this.updates.push((s, t, redraw) => {
      const reacted = phase(s, 3), hasEndpoint = s.output.endpointSeconds !== null, fade = hasEndpoint ? reacted : 0;
      pip.position.y = 2.86 - Math.sin(reacted * Math.PI) * .27; drop.visible = s.running && s.stage === 2 && reacted < .2; drop.position.y = 2.3 - (reacted * 12 % 1) * .65;
      samples.forEach((sample, i) => { sample.fill.material.color.setHex(0xe387b3).lerp(new THREE.Color(0xf3eada), i < 2 ? fade : 0); sample.meniscus.material.color.copy(sample.fill.material.color); });
      if (redraw) { readout(screen, 'BATH TEMP', Number(s.parameter).toFixed(0), '°C', s.stage >= 1 ? 'TEMPERATURE STABLE' : 'SET TEMPERATURE'); readout(endpoint, 'ELAPSED TIME', String(Math.round(reacted * (s.output.endpointSeconds || 300))), 'seconds', reacted >= 1 ? hasEndpoint ? 'PINK ENDPOINT REACHED' : 'NO ENDPOINT OBSERVED' : 'CONTROL REMAINS PINK'); }
    });
  }
  foodtest() {
    const p = this.root; rack(p, -.65, .15, 3.35); const labels = ['SAMPLE', 'POSITIVE', 'WATER'];
    const tubes = [-1.64, -.65, .34].map((x, i) => { const o = tube(p, x, .15, 0x71b8d1, 1.93, .255, .53); textPlane(o.g, labels[i], .46, .17, 0, .58, .26); return o; });
    const deposits = [new THREE.Group(), new THREE.Group()]; const rng = seeded(944);
    deposits.forEach((deposit, index) => { tubes[index].g.add(deposit); for (let i = 0; i < 30; i++) sphere(deposit, .02 + rng() * .014, mat(0xbb5130), (rng() - .5) * .3, .2 + rng() * .16, (rng() - .5) * .3); });
    const pip = pipette(p, -1.64, 2.65, .15, C.teal); textPlane(p, 'BENEDICT’S · MATCHED CONTROLS', 3.02, .18, -.65, .19, .69, { background: '#d4e1df' });
    const bath = instrument(p, 2.04, -.15, 1.55, .96, 1.76, 'WATER BATH'); cylinder(bath, .63, .04, mat(0x6697a3), 0, 1.01, 0); cylinder(bath, .55, .012, mat(0x7fc4d2, { transparent: true, opacity: .7 }), 0, 1.04, 0); dial(bath, .5, .43, .98, .1); const screen = makeMonitor(bath, -.2, .46, .98, .75, .38);
    this.connectMains(bath, 'aaq-benedicts-water-bath', [0, .28, -.88], 'right', [[3.16, .05, -2.45], [2.85, .05, -1.65], [2.1, .05, -1.43]]);
    this.updates.push((s, t, redraw) => { const mixed = phase(s, 2), reaction = phase(s, 3), category = s.output.value, colours = [0x71b8d1, 0x6eab65, 0xd9bc48, 0xd68b3e, 0xbb5130]; pip.position.x = -1.64 + mixed * 1.98; pip.position.y = 2.65 - Math.sin(mixed * Math.PI * 3) * .15; tubes.forEach((o, i) => { o.fill.material.color.setHex(0x71b8d1).lerp(new THREE.Color(i === 0 ? colours[category] : i === 1 ? colours[4] : colours[0]), reaction); o.meniscus.material.color.copy(o.fill.material.color); }); deposits.forEach((d, i) => { d.visible = reaction > .4 && (i === 1 || category > 0); d.scale.y = Math.max(.01, reaction * (i === 0 ? category / 4 : 1)); d.children.forEach(o => o.material.color.setHex(i === 0 ? colours[Math.max(1, category)] : colours[4])); }); if (redraw) readout(screen, 'WATER TEMP', s.stage >= 2 ? '80' : '20', '°C', reaction >= 1 ? 'HEATING COMPLETE' : 'MATCHED HEATING'); });
  }
  spirometer() {
    const p = this.root, g = instrument(p, -1.15, .05, 2.62, 1.61, 1.68, 'SPIROMETER · VOLUME / TIME'); const screen = makeMonitor(g, 0, .96, .96, 2.14, .99); button(g, -.86, .28, .96); dial(g, .88, .3, .96, .09);
    this.connectMains(g, 'aaq-desktop-spirometer', [0, .29, -.84], 'left', [[-3.14, .05, -2.5], [-2.5, .05, -1.62], [-1.27, .05, -1.22]]);
    const drum = new THREE.Group(); drum.position.set(1.67, .03, .02); p.add(drum); round(drum, 1.45, .17, 1.4, mat(C.ivory), 0, .17, 0); cylinder(drum, .6, .15, mat(C.dark), 0, .38, 0);
    const bellows = new THREE.Group(); bellows.position.y = .5; drum.add(bellows);
    for (let i = 0; i < 11; i++) { cylinder(bellows, .54 + (i % 2) * .035, .061, mat(i % 2 ? 0xbdcbc8 : 0xdde3d9), 0, .033 + i * .073, 0); }
    cylinder(bellows, .6, .09, mat(C.teal), 0, .87, 0); const top = cylinder(drum, .045, 1.36, mat(C.metal, { metalness: .75 }), .65, .89, 0);
    hose(p, [[.1, .61, .67], [.45, .3, 1.05], [1.39, .27, 1.2], [2.24, .54, .68]], .095, 0xb9d4d9);
    const mouthpiece = cylinder(p, .12, .44, mat(C.ivory), 2.33, .59, .62); mouthpiece.rotation.z = -.85; textPlane(drum, 'VOLUME CHAMBER', 1.37, .14, 0, .2, .755);
    this.updates.push((s, t, redraw) => { const measuring = s.running && s.stage === 2, q = phase(s, 3), omega = s.output.breathingRate / 60 * Math.PI * 2, breath = measuring ? Math.sin(t * omega) : Math.sin(q * Math.PI * 2); bellows.scale.y = .88 + breath * (.09 + s.output.tidalVolume * .14); if (!redraw) return; screen.paint((c, w, h) => { monitorBase(c, w, h, 'VOLUME / TIME'); const amplitude = s.stage >= 2 ? 1 : .15; c.strokeStyle = '#86e8bc'; c.lineWidth = 4; c.beginPath(); for (let x = 25; x < w - 22; x++) { const norm = (x - 25) / (w - 47), a = norm * s.output.breathingRate * Math.PI - (measuring ? t * omega : 0), y = 176 - Math.sin(a) * (27 + s.output.tidalVolume * 43) * amplitude; x === 25 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); c.fillStyle = '#d6ece7'; c.font = '600 25px system-ui'; c.fillText(s.result ? `${Number(s.result.value).toFixed(2)} ${s.result.unit}` : `${s.output.breathingRate} breaths/min · TV ${s.output.tidalVolume} dm³`, 25, 298); c.fillStyle = '#80a8aa'; c.font = '20px system-ui'; c.fillText('0 s', 25, 336); c.fillText('30 s', 550, 336); }); });
  }
  pulse() {
    const p = this.root, g = instrument(p, -.72, -.1, 3.05, 2.08, 1.23, 'PHYSIOLOGICAL MONITOR'); const screen = makeMonitor(g, -.1, 1.24, .74, 2.47, 1.34); dial(g, 1.16, .33, .75, .1); button(g, -.95, .31, .75); textPlane(g, 'NIBP', .38, .14, .85, .56, .75);
    this.connectMains(g, 'aaq-physiological-monitor', [0, .32, -.615], 'left', [[-3.15, .05, -2.5], [-2.4, .05, -1.61], [-.88, .05, -1.16]]);
    const cuff = new THREE.Group(); cuff.position.set(1.97, .55, .68); cuff.rotation.z = -.45; p.add(cuff); const body = cylinder(cuff, .49, 1.13, mat(0x243f54, { roughness: .95 })); body.rotation.z = Math.PI / 2; const opening = cylinder(cuff, .37, 1.15, mat(0x122c3b, { side: THREE.DoubleSide })); opening.rotation.z = Math.PI / 2;
    const band = cylinder(cuff, .496, .29, mat(0x486979)); band.rotation.z = Math.PI / 2; textPlane(cuff, 'ADULT', .51, .16, 0, 0, .5, { background: '#486979', color: '#eff6f1' });
    hose(p, [[.39, .42, .73], [.4, .24, 1.44], [1.15, .16, 1.62], [2.13, .35, 1.03]], .043, 0x253e4e);
    const sensor = round(p, .49, .2, .73, mat(C.ivory), -2.39, .23, .87); box(p, .42, .09, .58, mat(C.teal), -2.39, .13, .87); hose(p, [[-2.39, .2, .54], [-2.57, .15, -.25], [-1.79, .21, -.32]], .02, 0x3c6d73);
    this.updates.push((s, t, redraw) => { const reading = phase(s, 3), running = s.running && s.stage === 2; cuff.scale.y = 1 + (running ? Math.sin(t * 2) * .03 : 0); if (!redraw) return; screen.paint((c, w, h) => { monitorBase(c, w, h, 'ECG · LEAD II'); const bpm = s.result ? Number(s.result.value) : s.output.value; c.strokeStyle = '#83eab7'; c.lineWidth = 3; c.beginPath(); for (let x = 20; x < 420; x++) { const q = ((x / 115 + (running ? t * bpm / 60 : 0)) % 1), spike = Math.exp(-(((q - .47) / .02) ** 2)) * -72 + Math.exp(-(((q - .43) / .022) ** 2)) * 22 + Math.exp(-(((q - .52) / .022) ** 2)) * 30 - Math.exp(-(((q - .72) / .08) ** 2)) * 17, y = 143 + spike * (s.stage >= 1 ? 1 : .08); x === 20 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); c.fillStyle = '#91edc1'; c.font = '600 75px system-ui'; c.fillText(reading ? String(Math.round(bpm)) : '—', 455, 150); c.font = '20px system-ui'; c.fillText('bpm', 470, 185); c.fillStyle = '#81c8ec'; c.font = '600 25px system-ui'; c.fillText('Stroke volume', 25, 242); c.font = '600 38px system-ui'; c.fillText(reading ? `${s.output.strokeVolume} cm³` : '— cm³', 25, 300); c.fillStyle = '#d9d9ae'; c.font = '600 24px system-ui'; c.fillText(s.stage >= 3 ? `CO ${s.output.cardiacOutput} dm³/min` : 'ACQUIRING SIGNAL', 295, 292); }); });
  }
  reflex() {
    const p = this.root, dark = mat(C.dark), steel = mat(C.metal, { metalness: .76, roughness: .22 }); round(p, 2.93, .16, 1.78, mat(C.ivory), -.4, .16, .22); cylinder(p, .061, 3.6, steel, -1.29, 1.96, -.16);
    segment(p, [-1.29, 3.68, -.16], [.42, 3.68, -.16], .045, steel); const clampBlock = round(p, .36, .25, .3, dark, .24, 3.61, -.12); dial(p, .24, 3.61, .07, .068);
    const ruler = new THREE.Group(); ruler.position.set(.24, 2.73, .13); p.add(ruler); box(ruler, .29, 1.8, .052, mat(0xf4dfa2));
    const tx = canvasTexture(180, 1400, (c, w, h) => { c.fillStyle = '#f4dfa2'; c.fillRect(0, 0, w, h); c.fillStyle = '#554b31'; c.strokeStyle = '#554b31'; c.font = '500 33px system-ui'; for (let i = 0; i <= 100; i++) { const y = 1345 - i * 12.8; c.lineWidth = i % 10 === 0 ? 3 : 2; c.beginPath(); c.moveTo(0, y); c.lineTo(i % 10 === 0 ? 81 : i % 5 === 0 ? 57 : 34, y); c.stroke(); if (i % 10 === 0) c.fillText(String(i / 2), 100, y + 11); } }); mesh(ruler, new THREE.PlaneGeometry(.278, 1.79), new THREE.MeshBasicMaterial({ map: tx.texture, toneMapped: false }), 0, 0, .028);
    const hand = new THREE.Group(); hand.position.set(.83, 1.76, .7); hand.rotation.y = -.12; p.add(hand); const skin = mat(0xd6a282, { roughness: .64 }); const palm = sphere(hand, .34, skin); palm.scale.set(1.32, .58, 1); const wrist = cylinder(hand, .2, .7, skin, .6, 0, 0); wrist.rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) { const finger = round(hand, .47 - i * .035, .14, .135, skin, -.34, .01, -.23 + i * .155, .048); finger.rotation.y = -.11; }
    const thumb = round(hand, .43, .17, .18, skin, -.11, .15, .36, .06); thumb.rotation.y = -.65;
    const timer = instrument(p, 2.23, -.56, 1.21, 1.35, .87, 'REACTION TIME'); timer.userData.powerSource = 'battery'; const screen = makeMonitor(timer, 0, .84, .55, .95, .39); textPlane(p, 'RULER-DROP TEST', 2.39, .18, -.4, .19, 1.15);
    this.updates.push((s, t, redraw) => { const release = phase(s, 3), fall = smooth(Math.min(1, release * 2.6)), cm = Number(s.parameter); ruler.position.y = 2.73 - fall * (cm / 50) * 1.64; thumb.rotation.y = -.65 + fall * .39; hand.position.y = 1.76 + phase(s, 1) * .06; if (redraw) readout(screen, 'RESPONSE', s.result ? String(Number(s.result.value).toFixed(0)) : release > .5 ? String(s.output.value) : '—', s.result?.unit || 'ms', s.stage >= 3 ? 'CATCH RECORDED' : 'READY TO RELEASE'); });
  }
  antimicrobial() {
    const p = this.root, dishes = [], rng = seeded(193), positions = [[-1.45, .05], [1.27, .03]];
    positions.forEach(([x, z], index) => {
      const g = new THREE.Group(); g.position.set(x, .08, z); p.add(g); cylinder(g, 1.11, .08, glass(.42), 0, .075, 0); mesh(g, new THREE.CylinderGeometry(1.11, 1.11, .2, 80, 1, true), glass(.49), 0, .15, 0); ring(g, 1.11, .025, glass(.7), 0, .25, 0); cylinder(g, 1.04, .045, mat(0xdbbd7a, { transparent: true, opacity: .92, roughness: .27 }), 0, .14, 0);
      const colonies = new THREE.Group(); g.add(colonies); const colonyMat = mat(0xb4a164);
      for (let i = 0; i < 320; i++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * .98, px = Math.cos(a) * r, pz = Math.sin(a) * r; if (Math.hypot(px + .42, pz) < .084 || Math.hypot(px - .42, pz) < .084) continue; const cell = sphere(colonies, .009 + rng() * .011, colonyMat, px, .17, pz); cell.scale.y = .4; }
      const zone = cylinder(g, .08, .008, mat(0xf3d894, { transparent: true, opacity: .88 }), -.42, .18, 0);
      for (const [j, xx] of [-.42, .42].entries()) { cylinder(g, .08, .012, mat(0xf6f1df), xx, .194, 0); const letter = textPlane(g, j === 0 ? 'C' : 'W', .12, .12, xx, .203, 0); letter.rotation.x = -Math.PI / 2; }
      const lid = new THREE.Group(); lid.position.set(.16, .5, -.33); lid.rotation.x = -.36; g.add(lid); cylinder(lid, 1.14, .035, glass(.14)); ring(lid, 1.14, .023, glass(.45)); dishes.push({ g, colonies, zone, lid });
      textPlane(p, index === 0 ? 'C: CANDIDATE  ·  W: WATER' : 'REPEAT PLATE', 2.25, .18, x, .2, 1.43, { background: '#247389', color: '#e3f1ec' });
    });
    const caliper = new THREE.Group(); caliper.userData.powerSource = 'battery'; caliper.position.set(0, .11, 1.99); caliper.rotation.y = -.13; p.add(caliper); box(caliper, 2.48, .055, .17, mat(C.metal, { metalness: .8 })); box(caliper, .09, .05, .5, mat(C.metal), -.9, 0, -.2); const movingJaw = box(caliper, .09, .05, .5, mat(C.metal), .54, 0, -.2); round(caliper, .56, .1, .3, mat(C.dark), .49, .09, 0);
    const tx = canvasTexture(320, 100); const reading = mesh(caliper, new THREE.PlaneGeometry(.44, .15), new THREE.MeshBasicMaterial({ map: tx.texture, toneMapped: false }), .49, .2, 0); reading.rotation.x = -Math.PI / 2;
    this.updates.push((s, t, redraw) => { const prep = phase(s, 2), growth = phase(s, 3), diameter = s.output.value, radius = .08 * diameter / 6;
      dishes.forEach(d => { d.lid.position.y = .5 - prep * .22; d.lid.rotation.x = -.36 * (1 - prep); d.colonies.visible = growth > .02; d.colonies.children.forEach((cell, i) => { cell.visible = i / d.colonies.children.length < growth && Math.hypot(cell.position.x + .42, cell.position.z) > radius; }); d.zone.scale.set(diameter / 6, 1, diameter / 6); d.zone.visible = growth > .1 && diameter > 6; });
      movingJaw.position.x = -.9 + .45 + diameter / 24; if (redraw) { const c = tx.ctx; c.fillStyle = '#bccbb5'; c.fillRect(0, 0, 320, 100); c.fillStyle = '#223a34'; c.font = '600 55px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(growth >= 1 ? `${diameter.toFixed(1)} mm` : '— mm', 160, 50); tx.texture.needsUpdate = true; }
    });
  }
}

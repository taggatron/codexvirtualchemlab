import * as THREE from './vendor/three.module.js?v=20260823-1';
import { LabRenderer3D } from './lab3d.js?v=20260908-4';

// Assessment objects are individual pieces of apparatus. They share the main
// practical's materials and vessel geometry, without bringing its completed rig
// (or its animation state) onto the student's empty bench.
const material = (colour, roughness = .48, metalness = .04) => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness });
const steel = () => material(0xa8bec6, .24, .75);
const glass = () => new THREE.MeshPhysicalMaterial({ color: 0xc8edf6, transparent: true, opacity: .46, transmission: .24, roughness: .08, metalness: 0, ior: 1.46, thickness: .06, clearcoat: .8, side: THREE.DoubleSide, depthWrite: false });
const ink = () => new THREE.MeshBasicMaterial({ color: 0x234451, side: THREE.DoubleSide });

function mesh(group, geometry, mat, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(x, y, z);
  group.add(object);
  return object;
}

function box(group, width, height, depth, mat, x = 0, y = height / 2, z = 0) {
  return mesh(group, new THREE.BoxGeometry(width, height, depth), mat, x, y, z);
}

function cylinder(group, radius, height, mat, x = 0, y = height / 2, z = 0, topRadius = radius) {
  return mesh(group, new THREE.CylinderGeometry(topRadius, radius, height, 48), mat, x, y, z);
}

function ring(group, radius, thickness, mat, x = 0, y = 0, z = 0) {
  const object = mesh(group, new THREE.TorusGeometry(radius, thickness, 10, 56), mat, x, y, z);
  object.rotation.x = Math.PI / 2;
  return object;
}

function rod(group, from, to, radius, mat) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), vector = b.clone().sub(a);
  const object = mesh(group, new THREE.CylinderGeometry(radius, radius, vector.length(), 16), mat);
  object.position.copy(a.add(b).multiplyScalar(.5));
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  return object;
}

function curve(group, points, radius, mat, segments = 64) {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return mesh(group, new THREE.TubeGeometry(path, segments, radius, 12, false), mat);
}

function profile(group, points, mat) {
  return mesh(group, new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 64), mat);
}

function printed(group, text, width, height, x, y, z, { top = false, colour = '#173d4b', background = '#edf6ef', fontSize = 80 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = Math.max(96, Math.round(512 * height / width));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colour; ctx.font = `700 ${fontSize}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 24);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const object = mesh(group, new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide }), x, y, z);
  if (top) object.rotation.x = -Math.PI / 2;
  return object;
}

function shared(renderer, method, ...args) {
  return LabRenderer3D.prototype[method].call(renderer, ...args);
}

function petriDish(lid = false) {
  const group = new THREE.Group(), transparent = glass(), edge = material(0xafd6dd, .23, .24);
  if (lid) {
    cylinder(group, 1.04, .035, transparent, 0, .22);
    mesh(group, new THREE.CylinderGeometry(1.04, 1.04, .20, 72, 1, true), transparent, 0, .12);
    ring(group, 1.04, .027, edge, 0, .025);
    ring(group, 1.04, .018, transparent, 0, .23);
  } else {
    cylinder(group, 1, .035, transparent, 0, .035);
    mesh(group, new THREE.CylinderGeometry(1, 1, .20, 72, 1, true), transparent, 0, .12);
    cylinder(group, .935, .095, material(0xd7d398, .56), 0, .10);
    ring(group, 1, .026, edge, 0, .025);
    ring(group, 1, .024, transparent, 0, .22);
    ring(group, .922, .012, material(0xb3b67b, .6), 0, .15);
  }
  return group;
}

function discs(control = false) {
  const group = new THREE.Group(), colours = ['#4a799f', '#9b558e', '#c47c31'];
  const positions = control ? [[0, 0, 'C']] : [[-.36, -.12, 'P'], [.36, -.12, 'E'], [0, .35, 'T']];
  positions.forEach(([x, z, code], index) => {
    cylinder(group, .19, .045, material(0xfffcdf, .84), x, .025, z);
    const stamp = printed(group, code, .26, .26, x, .050, z, { top: true, colour: control ? '#53686f' : colours[index], background: '#fffcdf', fontSize: 260 });
    stamp.renderOrder = 2;
  });
  return group;
}

function forceps() {
  const group = new THREE.Group(), metal = steel();
  for (const side of [-1, 1]) {
    rod(group, [-.98, .12, 0], [.28, .12, side * .16], .025, metal);
    rod(group, [.28, .12, side * .16], [.94, .08, side * .065], .021, metal);
    for (let i = 0; i < 9; i++) rod(group, [-.55 + i * .065, .145, side * .055], [-.55 + i * .065, .145, side * .13], .012, material(0x708790, .3, .65));
  }
  return group;
}

function swab() {
  const group = new THREE.Group();
  rod(group, [-1, .1, 0], [.69, .1, 0], .025, material(0xd4b477, .83));
  const cotton = mesh(group, new THREE.SphereGeometry(.09, 28, 16), material(0xfffefa, 1), .82, .1);
  cotton.scale.set(2.3, 1, 1);
  return group;
}

function ruler() {
  const group = new THREE.Group(), rule = material(0xe3d8a9, .6);
  box(group, 3, .045, .43, rule);
  for (let i = 0; i <= 60; i++) {
    const major = i % 10 === 0, medium = i % 5 === 0;
    box(group, .009, .006, major ? .20 : medium ? .14 : .08, ink(), -1.43 + i * .0475, .049, -.19 + (major ? .1 : medium ? .07 : .04));
    if (major) printed(group, String(i / 2), .16, .10, -1.43 + i * .0475, .05, .115, { top: true, background: '#e3d8a9', fontSize: 200 });
  }
  return group;
}

function marker() {
  const group = new THREE.Group(), black = material(0x26353d, .38);
  rod(group, [-.82, .105, 0], [.55, .105, 0], .105, black);
  rod(group, [.55, .105, 0], [.9, .105, 0], .12, material(0x0e1a22, .3));
  rod(group, [-.9, .105, 0], [-.82, .105, 0], .045, black);
  box(group, .32, .035, .055, material(0x577c83, .3), .72, .23);
  return group;
}

function addSafetyFlame(group) {
  const amber = new THREE.MeshBasicMaterial({ color: 0xffad35, transparent: true, opacity: .85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const core = new THREE.MeshBasicMaterial({ color: 0xfff1a6, transparent: true, opacity: .88, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const outer = profile(group, [[0, 0], [.07, .04], [.13, .23], [.105, .42], [.045, .62], [0, .83]], amber);
  outer.position.y = 1.305;
  const inner = profile(group, [[0, 0], [.06, .045], [.067, .17], [.035, .31], [0, .47]], core);
  inner.position.set(0, 1.305, .04);
}

function bung(withDelivery = false) {
  const group = new THREE.Group(), rubber = material(0x303b43, .94);
  cylinder(group, .28, .34, rubber, 0, .17, 0, .34);
  cylinder(group, .059, .006, material(0x10191d), 0, .343);
  ring(group, .064, .015, material(0x57666b, .73), 0, .347);
  if (withDelivery) {
    curve(group, [[0, .2, 0], [0, .61, 0], [.19, .78, 0], [.65, .78, 0], [1.05, .65, 0]], .047, glass());
    rod(group, [1.02, .66, 0], [1.36, .66, 0], .057, material(0x64858b, .6));
  }
  return group;
}

function deliveryTube() {
  const group = new THREE.Group(), tubing = material(0x709ca5, .4);
  curve(group, [[-1.12, .06, 0], [-1.12, .45, 0], [-.76, .7, 0], [.65, .7, 0], [1.10, .45, 0], [1.10, .07, 0]], .057, tubing);
  for (const x of [-1.12, 1.10]) ring(group, .063, .012, steel(), x, .12);
  return group;
}

function syringe() {
  const group = new THREE.Group(), transparent = glass(), dark = material(0x263c47, .62);
  const barrel = mesh(group, new THREE.CylinderGeometry(.20, .20, 1.72, 64, 1, true), transparent, -.2, .25);
  barrel.rotation.z = Math.PI / 2;
  rod(group, [-1.32, .25, 0], [-1.06, .25, 0], .065, transparent);
  for (const x of [-1.06, .66]) { const rim = ring(group, .20, .023, transparent, x, .25); rim.rotation.z = Math.PI / 2; }
  rod(group, [.14, .25, 0], [1.37, .25, 0], .06, material(0xe1edf0, .25));
  rod(group, [.12, .25, 0], [.22, .25, 0], .176, dark);
  box(group, .055, .57, .18, material(0xc2d6de, .32), 1.4, .29);
  box(group, .06, .65, .12, material(0xc2d6de, .32), .72, .29);
  for (let i = 0; i < 15; i++) box(group, .012, i % 5 === 0 ? .11 : .06, .012, ink(), -.98 + i * .10, .31, .198);
  printed(group, '100 mL', .52, .13, -.37, .17, .21, { background: '#d4e9ec', fontSize: 95 });
  return group;
}

function waterBath() {
  const group = new THREE.Group(), body = material(0xe7eeed, .28), trim = steel();
  box(group, 2.15, .62, 1.5, body);
  for (const x of [-1, 1]) box(group, .15, .38, 1.5, body, x, .8);
  for (const z of [-.68, .68]) box(group, 2, .38, .14, body, 0, .8, z);
  box(group, 1.85, .035, 1.22, new THREE.MeshPhysicalMaterial({ color: 0x66bfd3, transparent: true, opacity: .72, roughness: .15, clearcoat: .8 }), 0, .88);
  for (const x of [-1, 1]) rod(group, [x, 1, -.7], [x, 1, .7], .036, trim);
  for (const z of [-.7, .7]) rod(group, [-1, 1, z], [1, 1, z], .036, trim);
  box(group, 1.25, .36, .055, material(0x1a3541), 0, .32, .77);
  printed(group, '20.0 °C', .85, .22, -.05, .32, .805, { background: '#10292c', colour: '#9cf1d3', fontSize: 95 });
  const dial = cylinder(group, .085, .06, trim, .81, .31, .78); dial.rotation.x = Math.PI / 2;
  return group;
}

function cup() {
  const group = new THREE.Group(), white = material(0xf6f5e9, .9);
  profile(group, [[0, .025], [.40, .025], [.51, .09], [.60, 1.18], [.56, 1.18], [.47, .12], [0, .12]], white);
  ring(group, .58, .025, white, 0, 1.18);
  for (let i = 0; i < 6; i++) ring(group, .495 + i * .014, .008, material(0xe6e5d9, .9), 0, .32 + i * .11);
  return group;
}

function cupLid() {
  const group = new THREE.Group(), white = material(0xf3f2e8, .87);
  cylinder(group, .64, .055, white);
  ring(group, .62, .022, white, 0, .06);
  cylinder(group, .056, .004, material(0x64767c), 0, .057);
  return group;
}

function stand(includeClamp) {
  const group = new THREE.Group(), dark = material(0x254d5d, .42), metal = steel();
  box(group, 1.35, .15, .90, dark);
  rod(group, [-.4, .15, -.15], [-.4, 3.1, -.15], .046, metal);
  cylinder(group, .09, .10, metal, -.4, .18, -.15);
  if (includeClamp) {
    const holder = clamp(); holder.position.set(-.37, 2.42, -.15); group.add(holder);
  }
  return group;
}

function clamp() {
  const group = new THREE.Group(), metal = steel(), dark = material(0x33454c, .7);
  box(group, .22, .23, .25, dark, 0, 0);
  rod(group, [0, 0, 0], [.85, 0, 0], .04, metal);
  for (const side of [-1, 1]) {
    rod(group, [.7, 0, 0], [1.02, 0, side * .22], .035, metal);
    rod(group, [1.02, 0, side * .22], [1.25, 0, side * .12], .052, material(0xd58a65, .86));
  }
  rod(group, [0, .08, .15], [0, .08, .29], .025, metal);
  box(group, .15, .06, .035, dark, 0, .08, .29);
  return group;
}

function burette() {
  const group = new THREE.Group(), transparent = glass();
  mesh(group, new THREE.CylinderGeometry(.10, .10, 3.05, 40, 1, true), transparent, 0, 1.98);
  ring(group, .105, .017, transparent, 0, 3.51);
  cylinder(group, .066, 2.6, new THREE.MeshPhysicalMaterial({ color: 0xc5edf1, opacity: .58, transparent: true, roughness: .14 }), 0, 1.85);
  for (let i = 0; i < 36; i++) box(group, i % 5 === 0 ? .10 : .06, .012, .008, ink(), .028, .58 + i * .078, .104);
  cylinder(group, .085, .18, material(0xeaf0e9, .3), 0, .38);
  rod(group, [-.18, .38, 0], [.28, .38, 0], .045, material(0x347aa1, .25));
  cylinder(group, .04, .27, transparent, 0, .16, 0, .066);
  return group;
}

function pipette() {
  const group = new THREE.Group(), transparent = glass();
  rod(group, [0, .08, 0], [0, 2.5, 0], .04, transparent);
  const bulb = mesh(group, new THREE.SphereGeometry(.19, 40, 24), transparent, 0, 1.1); bulb.scale.y = 2.25;
  ring(group, .046, .012, material(0x406a93), 0, 2.05);
  return group;
}

function tile(cross = false, heatproof = false) {
  const group = new THREE.Group(), mat = material(heatproof ? 0x8e999a : 0xf5f5ed, heatproof ? .96 : .38);
  box(group, 1.85, .07, 1.43, mat);
  if (cross) for (const angle of [-Math.PI / 4, Math.PI / 4]) {
    const stroke = box(group, 1.35, .007, .09, material(0x182b35), 0, .077); stroke.rotation.y = angle;
  }
  return group;
}

function block() {
  const group = new THREE.Group(), metal = material(0xb6bfc4, .38, .78);
  cylinder(group, .65, 1.3, metal);
  for (const [x, radius] of [[-.24, .11], [.24, .055]]) {
    cylinder(group, radius, .007, material(0x26363d), x, 1.305);
    ring(group, radius + .018, .018, steel(), x, 1.305);
  }
  printed(group, '1 kg', .61, .28, 0, .60, .653, { background: '#b6bfc4', fontSize: 120 });
  return group;
}

function heater() {
  const group = new THREE.Group(), metal = steel(), black = material(0x27353a);
  curve(group, [[-.12, 1.45, 0], [-.12, .28, 0], [0, .10, 0], [.12, .28, 0], [.12, 1.45, 0]], .05, metal);
  cylinder(group, .25, .3, black, 0, 1.57);
  for (const x of [-.12, .12]) rod(group, [x, 1.70, 0], [x, 1.91, 0], .04, material(x < 0 ? 0x363f45 : 0xc94c47));
  return group;
}

function insulation() {
  const group = new THREE.Group(), felt = material(0x74786e, .98);
  profile(group, [[.67, 0], [.85, 0], [.85, 1.22], [.67, 1.22], [.67, 0]], felt);
  for (let i = 0; i < 8; i++) ring(group, .85, .012, material(0x62685f, 1), 0, .1 + i * .14);
  box(group, .12, 1.1, .025, material(0xbeb696, .96), 0, .6, .862);
  return group;
}

function meter(name) {
  const group = new THREE.Group(), yellow = material(0xe6ae36, .5), dark = material(0x273741, .54);
  box(group, 1.05, 1.48, .42, yellow);
  box(group, .88, 1.28, .025, dark, 0, .76, .223);
  const units = /ammeter|current/.test(name) ? 'A' : /joule|energy/.test(name) ? 'J' : /volt/.test(name) ? 'V' : /ohm|resistance/.test(name) ? 'Ω' : '0.00';
  printed(group, units === '0.00' ? units : `0.00 ${units}`, .73, .34, 0, 1.13, .25, { background: '#cedbc0', fontSize: 95 });
  const dial = cylinder(group, .21, .06, material(0x101e26), 0, .63, .28); dial.rotation.x = Math.PI / 2;
  box(group, .04, .19, .028, material(0xf6eee0), 0, .68, .32);
  for (const [x, colour] of [[-.25, 0x14242c], [.25, 0xc84441]]) {
    const socket = ring(group, .075, .025, material(colour), x, .27, .26); socket.rotation.x = 0;
  }
  return group;
}

function powerSupply() {
  const group = new THREE.Group(), dark = material(0x1c3947), light = material(0xe5ebdf, .34);
  box(group, 1.75, 1.12, 1.08, light);
  box(group, 1.62, .91, .025, dark, 0, .58, .552);
  printed(group, '0.0 V', .77, .29, -.27, .79, .572, { background: '#0e2f34', colour: '#8ee4c3', fontSize: 95 });
  const dial = cylinder(group, .17, .085, material(0x899ca2, .3, .56), .51, .77, .615); dial.rotation.x = Math.PI / 2;
  for (const [x, colour] of [[-.38, 0x151b21], [.07, 0xcb4a43]]) {
    const port = ring(group, .092, .033, material(colour), x, .32, .59); port.rotation.x = 0;
  }
  printed(group, 'DC', .21, .14, .56, .31, .573, { background: '#1c3947', colour: '#dcecea', fontSize: 180 });
  return group;
}

function circuitComponent() {
  const group = new THREE.Group(), board = material(0xe5e9df, .45), dark = material(0x243d48, .46), metal = steel();
  box(group, 2.05, .62, .76, board);
  box(group, 1.94, .48, .025, dark, 0, .33, .391);

  // Two accessible binding posts are the electrical endpoints used by the
  // assessment's series and parallel leads.
  for (const [x, colour] of [[-.79, 0xc84945], [.79, 0x182b34]]) {
    const socket = cylinder(group, .14, .12, material(colour, .37), x, .29, .44);
    socket.rotation.x = Math.PI / 2;
    const recess = cylinder(group, .055, .008, material(0x071319), x, .29, .505);
    recess.rotation.x = Math.PI / 2;
    const trim = ring(group, .14, .012, metal, x, .29, .486); trim.rotation.x = 0;
  }

  // An upright toggle makes the open switch readable in the bench camera.
  box(group, .34, .13, .30, dark, -.63, .685);
  cylinder(group, .11, .045, metal, -.63, .77);
  rod(group, [-.63, .79, 0], [-.77, 1.06, 0], .037, metal);
  const toggleTip = mesh(group, new THREE.SphereGeometry(.07, 24, 16), material(0x132e3b), -.77, 1.06); toggleTip.scale.y = 1.25;

  // Resistor is a separate raised part with its characteristic colour bands.
  rod(group, [-.35, .84, 0], [.92, .84, 0], .022, metal);
  const resistor = cylinder(group, .115, .67, material(0xd1bb8b, .57), .30, .84); resistor.rotation.z = Math.PI / 2;
  for (const [x, colour] of [[.05, 0x725139], [.16, 0x172127], [.33, 0x725139], [.55, 0xb19745]]) {
    const band = cylinder(group, .119, .044, material(colour, .62), x, .84); band.rotation.z = Math.PI / 2;
  }
  for (const x of [-.33, .91]) rod(group, [x, .63, 0], [x, .84, 0], .023, metal);
  printed(group, '100 Ω', .99, .27, .02, .33, .411, { background: '#243d48', colour: '#f3f5e9', fontSize: 120 });
  return group;
}

function leads(single = false) {
  const group = new THREE.Group();
  const colours = single ? [0xb98856] : [0xc44d45, 0x2c3c45];
  colours.forEach((colour, i) => {
    const z = i * .22, mat = material(colour, .56);
    curve(group, [[-1.15, .07, z], [-.83, .32, z], [-.15, .1, z + .21], [.55, .36, z], [1.12, .08, z]], single ? .022 : .033, mat);
    if (!single) for (const x of [-1.15, 1.12]) {
      rod(group, [x, .08, z], [x + (x < 0 ? -.22 : .22), .08, z], .058, mat);
      rod(group, [x + (x < 0 ? -.22 : .22), .08, z], [x + (x < 0 ? -.33 : .33), .08, z], .025, steel());
    }
  });
  return group;
}

function electrodes() {
  const group = new THREE.Group();
  for (const [x, colour] of [[-.37, 0xc0443e], [.37, 0x203a48]]) {
    cylinder(group, .065, 1.6, material(0x455259, .84), x, .8);
    cylinder(group, .10, .21, material(colour, .5), x, 1.66);
    cylinder(group, .035, .1, steel(), x, 1.8);
  }
  return group;
}

function lamp() {
  const group = new THREE.Group(), dark = material(0x2f697a, .37);
  cylinder(group, .60, .13, dark);
  rod(group, [0, .14, 0], [0, .86, -.1], .057, steel());
  rod(group, [0, .86, -.1], [-.3, 1.34, 0], .057, steel());
  const shade = mesh(group, new THREE.ConeGeometry(.44, .57, 48, 1, true), dark, -.3, 1.32, .02); shade.rotation.z = -.6;
  const bulb = mesh(group, new THREE.SphereGeometry(.14, 32, 20), new THREE.MeshPhysicalMaterial({ color: 0xffffdf, roughness: .25, clearcoat: .5 }), -.42, 1.06, .04);
  bulb.scale.y = 1.3;
  return group;
}

function spring() {
  const group = new THREE.Group(), points = [], turns = 12;
  for (let i = 0; i <= turns * 24; i++) {
    const q = i / (turns * 24), angle = q * Math.PI * 2 * turns;
    points.push([Math.cos(angle) * .20, .26 + q * 1.80, Math.sin(angle) * .20]);
  }
  curve(group, points, .027, steel(), 288);
  for (const y of [.12, 2.2]) { const hook = ring(group, .13, .024, steel(), 0, y); hook.rotation.x = 0; }
  return group;
}

function masses() {
  const group = new THREE.Group(), brass = material(0xb5a160, .33, .75);
  cylinder(group, .37, .08, steel());
  for (let i = 0; i < 4; i++) {
    cylinder(group, .34, .12, brass, 0, .15 + i * .135);
    box(group, .35, .125, .035, material(0x756841, .5), .19, .15 + i * .135);
  }
  rod(group, [0, .08, 0], [0, 1.14, 0], .023, steel());
  const hook = ring(group, .13, .022, steel(), .10, 1.18); hook.rotation.x = 0;
  return group;
}

function rack() {
  const group = new THREE.Group(), wood = material(0xbc925c, .82);
  box(group, 2.1, .10, .68, wood);
  for (const x of [-.94, .94]) box(group, .11, .72, .65, wood, x, .43);
  for (const z of [-.27, .27]) box(group, 2.1, .10, .13, wood, 0, .80, z);
  for (let i = 0; i < 5; i++) box(group, .09, .10, .5, wood, -.83 + i * .415, .8);
  return group;
}

function paper(name) {
  const group = new THREE.Group(), white = material(0xfffceb, .97);
  if (/chromato|strip/.test(name)) {
    box(group, .62, 1.95, .018, white);
    box(group, .51, .009, .009, material(0x697c7d), 0, .28, .014);
    mesh(group, new THREE.CircleGeometry(.035, 24), material(0x303347), 0, .29, .025);
  } else {
    cylinder(group, .80, .01, white);
    ring(group, .77, .005, material(0xe0dfd0), 0, .013);
  }
  return group;
}

function magnet() {
  const group = new THREE.Group();
  box(group, .85, .26, .40, material(0xb74143, .38), -.425);
  box(group, .85, .26, .40, material(0x366e9c, .38), .425);
  printed(group, 'N', .32, .22, -.48, .265, 0, { top: true, colour: '#fff9ea', background: '#b74143', fontSize: 220 });
  printed(group, 'S', .32, .22, .48, .265, 0, { top: true, colour: '#fff9ea', background: '#366e9c', fontSize: 220 });
  return group;
}

function inferKind(item) {
  if (item.kind && item.kind !== 'generic') return item.kind;
  const name = `${item.id || ''} ${item.name || ''} ${item.label || ''}`.toLowerCase();
  const matches = [
    [/petri.*lid|lid.*petri/, 'lid'], [/petri|agar.*dish/, 'petri'], [/disc/, 'discs'], [/swab/, 'swab'], [/forceps|tweezer|tongs/, 'forceps'],
    [/bunsen|burner/, 'bunsen'], [/thermometer|temperature.*probe/, 'thermometer'], [/stopwatch|timer/, 'stopwatch'], [/water.?bath/, 'bath'],
    [/burette/, 'burette'], [/pipette|dropper/, 'pipette'], [/flask/, 'flask'], [/beaker/, 'beaker'], [/measuring.*cylinder/, 'cylinder'],
    [/delivery|rubber.*tube|tubing/, 'tube'], [/syringe/, 'syringe'], [/bung|stopper/, 'bung'], [/stand/, 'stand'], [/clamp/, 'clamp'],
    [/heat.?proof|tile/, 'tile'], [/cross/, 'cross'], [/tripod|gauze/, 'tripod'], [/crucible|evaporat/, 'crucible'], [/funnel/, 'funnel'],
    [/balance|scale/, 'balance'], [/rack/, 'rack'], [/ruler|metre|meter.*rule/, 'ruler'], [/marker|pen/, 'marker'], [/filter.*paper|chromato/, 'paper'],
    [/polystyrene|calorimeter|cup/, 'cup'], [/lid/, 'lid'], [/insulat/, 'insulation'], [/metal.*block|aluminium|copper.*block/, 'block'], [/heater/, 'heater'],
    [/power.*supply|battery|cell/, 'power'], [/test.*socket|switch.*resistor|resistor.*switch/, 'component'], [/electrode/, 'electrodes'], [/leads|cables/, 'leads'], [/wire/, 'wire'], [/ammeter|voltmeter|joulemeter|multimeter/, 'meter'],
    [/spring/, 'spring'], [/mass|weight/, 'masses'], [/lamp|light/, 'lamp'], [/magnet/, 'magnet'], [/paper/, 'paper']
  ];
  return matches.find(([pattern]) => pattern.test(name))?.[1] || 'generic';
}

/**
 * Create a single, independently draggable assessment component.
 * The returned root has its bottom at y=0 and is centred on x/z. It has no
 * scene parent and does not register any practical animation callbacks.
 * @param {LabRenderer3D} renderer Main practical renderer, used for shared models.
 * @param {{id?: string, name?: string, label?: string, kind?: string}} item
 */
export function createAssessmentModel(renderer, item = {}) {
  const kind = inferKind(item), name = `${item.id || ''} ${item.name || ''} ${item.label || ''}`.toLowerCase();
  let model;
  switch (kind) {
    case 'flask': model = shared(renderer, 'flask', 0, 0xd9eff0); model.remove(model.userData.liquid, model.userData.meniscus); break;
    case 'beaker': model = shared(renderer, 'beaker', 0, 0xd9eff0); model.remove(model.userData.liquidVolume, model.userData.liquidMeniscus); break;
    case 'cylinder': model = shared(renderer, 'measuringCylinder', 0); break;
    case 'thermometer': model = shared(renderer, 'thermometer', 20); break;
    case 'bunsen':
      model = shared(renderer, 'bunsen', false);
      // The main practical includes a wall gas tap and a long supply hose. These
      // are room fixtures, not part of the draggable burner footprint.
      for (const child of [...model.children]) if (child.userData.gasTap || child.userData.gasHoseFlaredCuff || child.geometry?.type === 'TubeGeometry') model.remove(child);
      if (/safety/.test(name)) addSafetyFlame(model);
      break;
    case 'balance': model = shared(renderer, 'balance', 0); delete model.userData.mainsAppliance; break;
    case 'tripod': model = shared(renderer, 'tripod'); break;
    case 'crucible':
      model = /evaporat/.test(name) ? shared(renderer, 'evaporatingBasin', 0) : shared(renderer, 'crucible', { lidOn: false, empty: true });
      if (!/evaporat|lid/.test(name)) for (const child of [...model.children]) if (child.isGroup) model.remove(child);
      break;
    case 'funnel': model = shared(renderer, 'filterFunnel'); if (!/paper/.test(name)) model.remove(model.children[1]); break;
    case 'stopwatch': {
      model = shared(renderer, 'digitalStopwatch');
      const display = model.userData.display, ctx = display.context;
      ctx.fillStyle = '#cbdac4'; ctx.fillRect(0, 0, 512, 220);
      ctx.fillStyle = '#253e38'; ctx.font = '700 108px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('00:00', 256, 110);
      display.texture.needsUpdate = true;
      break;
    }
    case 'petri': model = petriDish(); break;
    case 'lid': model = /petri|plate/.test(name) ? petriDish(true) : cupLid(); break;
    case 'discs': model = discs(/control|water/.test(name)); break;
    case 'forceps': model = forceps(); model.rotation.z = -.58; break;
    case 'swab': model = swab(); model.rotation.z = Math.PI / 2 - .15; break;
    case 'ruler': model = ruler(); if (item.height > item.width) model.rotation.z = Math.PI / 2; break;
    case 'marker': model = marker(); break;
    case 'bung': model = bung(/delivery/.test(name)); break;
    case 'tube': model = /test.*tube|boiling.*tube/.test(name) ? shared(renderer, 'testTube', 0) : deliveryTube(); break;
    case 'syringe': model = syringe(); break;
    case 'bath': model = waterBath(); break;
    case 'cup': model = cup(); break;
    case 'stand': model = stand(/clamp/.test(name)); break;
    case 'clamp': model = clamp(); break;
    case 'burette': model = burette(); break;
    case 'pipette': model = pipette(); break;
    case 'tile': model = tile(false, /heat|mat/.test(name)); break;
    case 'cross': model = tile(true); break;
    case 'block': model = block(); break;
    case 'heater': model = heater(); break;
    case 'insulation': model = insulation(); break;
    case 'meter': model = meter(name); break;
    case 'power': model = powerSupply(); break;
    case 'component': model = circuitComponent(); break;
    case 'leads': model = leads(); break;
    case 'wire': model = leads(true); break;
    case 'electrodes': model = electrodes(); break;
    case 'lamp': model = lamp(); break;
    case 'spring': model = spring(); break;
    case 'masses': model = masses(); break;
    case 'rack': model = rack(); break;
    case 'paper': model = paper(name); break;
    case 'magnet': model = magnet(); break;
    default: {
      // Uncatalogued apparatus still has a stable, tangible bench object rather
      // than a failed image or an invisible hit target.
      model = new THREE.Group();
      box(model, 1.12, .62, .72, material(0x769ea3, .6));
      box(model, .92, .35, .025, material(0xecf1e7), 0, .35, .373);
      printed(model, (item.name || item.label || 'Apparatus').slice(0, 26), .86, .28, 0, .35, .390, { fontSize: 46 });
    }
  }

  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const centre = bounds.getCenter(new THREE.Vector3());
  model.position.x -= centre.x; model.position.y -= bounds.min.y; model.position.z -= centre.z;
  const root = new THREE.Group(); root.add(model);
  root.name = `assessment-${item.id || kind}`;
  root.userData.assessmentKind = kind;
  root.userData.assessmentItemId = item.id || kind;
  // These attachment points describe the actual geometry before the bench
  // renderer fits it into the logical assessment footprint.
  const sourceAnchors = {
    flask: { opening: [0, 1.95, 0], base: [0, 0, 0] },
    beaker: { opening: [0, 1.35, 0], inside: [0, .085, 0] },
    cup: { opening: [0, 1.18, 0], base: [0, .025, 0] },
    petri: { opening: [0, .22, 0], agar: [0, .15, 0] },
    lid: /petri|plate/.test(name) ? { cover: [0, .2025, 0], centre: [0, .22, 0] } : { cover: [0, 0, 0], centre: [0, .057, 0] },
    bung: { base: [0, 0, 0], outlet: /delivery/.test(name) ? [1.36, .66, 0] : [0, .34, 0] },
    syringe: { inlet: [-1.32, .25, 0] },
    bath: { inside: [0, .635, 0] },
    stand: { grip: [.76, 2.42, -.15] },
    burette: { jet: [0, .025, 0], axis: [0, .025, 0] },
    tile: { surface: [0, .07, 0] }, cross: { surface: [0, .081, 0] },
    tripod: { surface: [0, 1.87, 0] },
    thermometer: { tip: [0, 0, 0] },
    block: { heaterBore: [-.24, .24, 0], probeBore: [.24, .24, 0] },
    heater: { tip: [0, .05, 0] }
  }[kind] || {};
  model.updateMatrix();
  root.userData.assessmentAnchors = Object.fromEntries(Object.entries(sourceAnchors).map(([key, point]) => [key, new THREE.Vector3(...point).applyMatrix4(model.matrix).toArray()]));
  root.userData.assessmentUnitScale = 1;
  root.traverse(object => { if (object.isMesh) { object.castShadow = !object.material?.transparent; object.receiveShadow = true; } });
  root.updateMatrixWorld(true);
  return root;
}

/**
 * Seat correctly connected apparatus on its real mesh attachment points.
 * Logical screen positions remain the source of truth for marking. This only
 * reconciles the differently shaped 3D models with those logical footprints.
 * The caller restores baseline positions before every render; scales are reset
 * here so attaching, detaching and repeated rendering never accumulate scale.
 */
export function alignAssessmentModels(models, session) {
  const spec = session?.assemblySpec, positions = session?.placedEquipment || {};
  if (!spec) return;
  const itemById = new Map(spec.items.map(item => [item.id, item]));
  const edges = (spec.connections || []).filter(connection => {
    if (connection.group === false) return false;
    const a = positions[connection.a], b = positions[connection.b];
    return a && b && models.has(connection.a) && models.has(connection.b)
      && Number.isFinite(a.x + a.y + b.x + b.y)
      && Math.hypot(b.x - a.x - connection.dx, b.y - a.y - connection.dy) <= (connection.tolerance ?? 26);
  });
  for (const model of models.values()) {
    model.userData.assessmentOriginalScale ||= model.scale.toArray();
    model.scale.fromArray(model.userData.assessmentOriginalScale);
    model.updateMatrixWorld(true);
  }
  const kind = id => itemById.get(id)?.kind;
  const bounds = model => { model.updateMatrixWorld(true); return new THREE.Box3().setFromObject(model); };
  const anchor = (model, key) => {
    const point = model.userData.assessmentAnchors?.[key];
    model.updateMatrixWorld(true);
    return point ? model.localToWorld(new THREE.Vector3(...point)) : model.getWorldPosition(new THREE.Vector3());
  };
  const moveAnchor = (model, key, target) => {
    const current = anchor(model, key), next = target.clone();
    if (model.parent) { model.parent.worldToLocal(current); model.parent.worldToLocal(next); }
    model.position.add(next.sub(current)); model.updateMatrixWorld(true);
  };
  const shiftY = (model, y) => { model.position.y += y; model.updateMatrixWorld(true); };
  const seatBottom = (model, y) => shiftY(model, y - bounds(model).min.y);
  const alignXZ = (model, point) => {
    const current = model.getWorldPosition(new THREE.Vector3());
    current.x = point.x; current.z = point.z;
    if (model.parent) model.parent.worldToLocal(current);
    model.position.x = current.x; model.position.z = current.z; model.updateMatrixWorld(true);
  };
  const width = model => { const b = bounds(model); return b.max.x - b.min.x; };
  const fitWidth = (model, target) => {
    const present = width(model);
    if (present > .0001) model.scale.multiplyScalar(target / present);
    model.updateMatrixWorld(true);
  };
  const matching = (a, b) => edges.filter(edge => kind(edge.a) === a && kind(edge.b) === b);

  // Supporting vessels first: later necks, lids and probes inherit their final
  // physical position rather than the nominal drawing-box height.
  for (const edge of matching('bath', 'flask')) {
    const bath = models.get(edge.a), flask = models.get(edge.b), floor = anchor(bath, 'inside');
    flask.position.z = bath.position.z;
    seatBottom(flask, floor.y + .008);
  }
  for (const edge of matching('beaker', 'cup')) {
    const beaker = models.get(edge.a), cup = models.get(edge.b), floor = anchor(beaker, 'inside');
    fitWidth(cup, width(beaker) * .90);
    alignXZ(cup, floor); seatBottom(cup, floor.y + .005);
  }
  for (const edge of edges.filter(edge => ['tile', 'cross', 'tripod'].includes(kind(edge.a)) && ['flask', 'crucible', 'beaker'].includes(kind(edge.b)))) {
    const support = models.get(edge.a), vessel = models.get(edge.b), surface = anchor(support, 'surface');
    alignXZ(vessel, surface); seatBottom(vessel, surface.y + .009);
  }

  // A burette stays vertical through the clamp; its receiving flask is centred
  // on the jet. Preserve the flask's real support, then close the pouring gap.
  for (const edge of matching('stand', 'burette')) {
    const stand = models.get(edge.a), burette = models.get(edge.b), grip = anchor(stand, 'grip');
    const axis = anchor(burette, 'axis'); grip.y = axis.y; moveAnchor(burette, 'axis', grip);
  }
  for (const edge of matching('burette', 'flask')) {
    const burette = models.get(edge.a), flask = models.get(edge.b), jet = anchor(burette, 'jet'), opening = anchor(flask, 'opening');
    const destination = jet.clone(); destination.y = opening.y; moveAnchor(flask, 'opening', destination);
    for (const supportEdge of edges.filter(candidate => candidate.b === edge.b && ['tile', 'cross'].includes(kind(candidate.a)))) {
      alignXZ(models.get(supportEdge.a), anchor(flask, 'opening'));
    }
    const adjustedOpening = anchor(flask, 'opening'); adjustedOpening.y += .14; moveAnchor(burette, 'jet', adjustedOpening);
  }

  for (const edge of matching('flask', 'bung')) {
    const flask = models.get(edge.a), stopper = models.get(edge.b), neck = anchor(flask, 'opening');
    // The narrow end of the tapered stopper enters the neck. A combined
    // delivery tube makes the object's bounding-box centre offset from it.
    const neckRadius = .17 * flask.scale.x;
    stopper.scale.multiplyScalar(neckRadius * .98 / (.28 * stopper.scale.x));
    stopper.updateMatrixWorld(true);
    neck.y -= .035; moveAnchor(stopper, 'base', neck);
  }
  for (const edge of matching('bung', 'syringe')) {
    const stopper = models.get(edge.a), syringe = models.get(edge.b);
    moveAnchor(syringe, 'inlet', anchor(stopper, 'outlet'));
  }

  for (const edge of matching('petri', 'discs')) {
    const dish = models.get(edge.a), disc = models.get(edge.b), agar = anchor(dish, 'agar');
    disc.position.z = dish.position.z;
    seatBottom(disc, agar.y + .006);
  }
  for (const edge of matching('petri', 'lid')) {
    const dish = models.get(edge.a), lid = models.get(edge.b), rim = anchor(dish, 'opening');
    fitWidth(lid, width(dish) * 1.03);
    // Seat the underside of the cover just above the rim; its skirt descends
    // around the plate rather than perching on top of it.
    rim.y += .03; moveAnchor(lid, 'cover', rim);
  }
  for (const edge of matching('cup', 'lid')) {
    const cup = models.get(edge.a), lid = models.get(edge.b), rim = anchor(cup, 'opening');
    fitWidth(lid, width(cup) * 1.03);
    rim.y += .015; moveAnchor(lid, 'cover', rim);
  }
  for (const edge of matching('lid', 'thermometer')) {
    const lid = models.get(edge.a), probe = models.get(edge.b), hole = anchor(lid, 'centre');
    const cupEdge = edges.find(candidate => candidate.b === edge.a && kind(candidate.a) === 'cup');
    if (cupEdge) { const b = bounds(models.get(cupEdge.a)); hole.y = b.min.y + (b.max.y - b.min.y) * .22; }
    else hole.y -= .65;
    moveAnchor(probe, 'tip', hole);
  }
  for (const edge of edges.filter(edge => kind(edge.a) === 'block' && ['heater', 'thermometer'].includes(kind(edge.b)))) {
    const block = models.get(edge.a), probe = models.get(edge.b);
    moveAnchor(probe, 'tip', anchor(block, kind(edge.b) === 'heater' ? 'heaterBore' : 'probeBore'));
  }
  for (const model of models.values()) model.updateMatrixWorld(true);
}

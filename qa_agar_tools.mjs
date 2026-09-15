import { chromium } from 'playwright';
import fs from 'node:fs';

// Run with: node --loader ./qa_playwright_loader.mjs qa_agar_tools.mjs
const out = 'output/playwright/agar-tools';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], failures = [], measurements = [], transfers = [], submerged = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(error.message));
const assert = (condition, message) => { if (!condition) failures.push(message); };
const tolerance = 1e-5;

try {
  await page.goto(`http://127.0.0.1:4176/?agar-tools-qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__lab && typeof window.render_game_to_text === 'function');
  await page.evaluate(async () => {
    window.__manualSimulationTime = true;
    const { LabRenderer3D } = await import('./lab3d.js?v=20260916-agar-tools-1');
    window.__agarQaTHREE = await import('./vendor/three.module.js?v=20260823-1');
    const render = LabRenderer3D.prototype.render;
    LabRenderer3D.prototype.render = function (...args) {
      window.__agarQaRenderer = this;
      return render.apply(this, args);
    };
    const { state, practicals, draw } = window.__lab;
    Object.assign(state, { selected: practicals.findIndex(practical => practical.id === 'agardiffusion'), subject: 'biology', tab: 'bench', running: false, complete: false, agarDiffusionStage: 0, agarDiffusionTimer: 0 });
    draw();
  });
  await page.waitForFunction(() => {
    window.__lab.draw();
    const renderer = window.__agarQaRenderer;
    return renderer?.available && !renderer.sceneCompiling && renderer.dynamic.some(item => item.kind === 'agarDiffusion');
  });

  const sample = async (stage, q = 0) => {
    const renderAgain = await page.evaluate(({ stage, q }) => {
      Object.assign(window.__lab.state, { agarDiffusionStage: stage, agarDiffusionTimer: q * ({ 1: 3.4, 3: 4.2, 7: 4.4 }[stage] || 1), running: false });
      window.__lab.draw();
      return window.__agarQaRenderer.sceneCompiling;
    }, { stage, q });
    if (renderAgain) await page.waitForFunction(() => !window.__agarQaRenderer.sceneCompiling);
    return page.evaluate(({ stage, q, renderAgain }) => {
      if (renderAgain) window.__lab.draw();
      const renderer = window.__agarQaRenderer, THREE = window.__agarQaTHREE;
      renderer.scene.updateMatrixWorld(true);
      const d = renderer.dynamic.find(item => item.kind === 'agarDiffusion');
      const index = Math.min(2, Math.floor(q * 3)), local = Math.min(1, Math.max(0, q * 3 - index));
      const box = object => { object.geometry.computeBoundingBox(); return object.geometry.boundingBox; };
      const vertices = bounds => {
        const result = [];
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) result.push(new THREE.Vector3(x, y, z));
        return result;
      };
      const cubes = d.cubes.map(cube => {
        const points = vertices(box(cube.full)).map(point => cube.full.localToWorld(point));
        const localPoints = points.map(point => cube.group.worldToLocal(point.clone()));
        const actualSize = new THREE.Box3().setFromPoints(localPoints).getSize(new THREE.Vector3());
        return { sizeCm: cube.sizeCm, side: cube.side, actualSize: actualSize.toArray(), position: cube.group.getWorldPosition(new THREE.Vector3()).toArray(), top: Math.max(...points.map(point => point.y)), bottom: Math.min(...points.map(point => point.y)) };
      });
      const activeCube = d.cubes[index];
      const face = (mesh, sign) => {
        const bounds = box(mesh), x = sign < 0 ? bounds.max.x : bounds.min.x;
        const corners = [];
        for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(activeCube.group.worldToLocal(mesh.localToWorld(new THREE.Vector3(x, y, z))));
        const faceBox = new THREE.Box3().setFromPoints(corners), centre = faceBox.getCenter(new THREE.Vector3());
        const cubeBounds = box(activeCube.full), expectedX = sign < 0 ? cubeBounds.min.x : cubeBounds.max.x;
        return {
          error: Math.max(...corners.map(point => Math.abs(point.x - expectedX))),
          overlapY: Math.min(faceBox.max.y, cubeBounds.max.y) - Math.max(faceBox.min.y, cubeBounds.min.y),
          overlapZ: Math.min(faceBox.max.z, cubeBounds.max.z) - Math.max(faceBox.min.z, cubeBounds.min.z),
          centre: centre.toArray()
        };
      };
      const calliperFaces = [face(d.calliperFixedJaw, -1), face(d.calliperMovingJaw, 1)];
      const forcepsFaces = d.forcepsPads.map((pad, padIndex) => face(pad, padIndex === 0 ? -1 : 1));
      const acid = d.beakers.map((beaker, cubeIndex) => {
        const liquid = beaker.userData.liquidVolume, meniscus = beaker.userData.liquidMeniscus;
        const meniscusY = meniscus.getWorldPosition(new THREE.Vector3()).y;
        const points = vertices(box(d.cubes[cubeIndex].full)).map(point => liquid.worldToLocal(d.cubes[cubeIndex].full.localToWorld(point)));
        const liquidBounds = box(liquid), radius = liquid.geometry.parameters.radiusTop;
        return { cube: cubeIndex + 1, surfaceClearance: meniscusY - cubes[cubeIndex].top, floorClearance: Math.min(...points.map(point => point.y)) - liquidBounds.min.y, radiusClearance: radius - Math.max(...points.map(point => Math.hypot(point.x, point.z))) };
      });
      return { stage, q, index, local, cubes, rimTop: new THREE.Box3().setFromObject(d.beakers[index]).max.y, calliperVisible: d.callipers.visible, calliperFaces, measuredGapCm: (calliperFaces[1].centre[0] - calliperFaces[0].centre[0]) / .26, display: d.calliperDisplay.lastKey, forcepsVisible: d.forceps.visible, forcepsFaces, rotationError: d.forceps.getWorldQuaternion(new THREE.Quaternion()).angleTo(activeCube.group.getWorldQuaternion(new THREE.Quaternion())), acid };
    }, { stage, q, renderAgain });
  };
  const capture = async name => page.screenshot({ path: `${out}/${name}.png` });
  const initial = await sample(0);
  const resting = await sample(4);
  for (const cube of initial.cubes) {
    assert(cube.actualSize.every(dimension => Math.abs(dimension - cube.sizeCm * .26) < tolerance), `${cube.sizeCm} cm cube geometry has incorrect dimensions: ${cube.actualSize}`);
  }

  for (let index = 0; index < 3; index++) {
    for (const local of [.30, .5, .72]) {
      const result = await sample(1, (index + local) / 3);
      measurements.push(result);
      assert(result.calliperVisible, `Calipers hidden while measuring cube ${index + 1}`);
      assert(result.calliperFaces.every(face => face.error < tolerance && face.overlapY > 0 && face.overlapZ > 0), `Caliper contact failed for cube ${index + 1}, local ${local}: ${JSON.stringify(result.calliperFaces)}`);
      assert(Math.abs(result.measuredGapCm - (index + 1)) < tolerance, `Caliper gap does not measure ${index + 1} cm: ${result.measuredGapCm}`);
      assert(result.display === `${result.measuredGapCm.toFixed(1)} cm`, `Caliper display disagrees with observed gap: ${result.display}`);
      if (local === .5) await capture(`measure-${index + 1}cm`);
    }
  }

  const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
  for (const stage of [3, 7]) {
    for (let index = 0; index < 3; index++) {
      for (const local of [0, .10, .199, .20, .201, .32, .5, .68, .799, .80, .86, .861, .98, 1]) {
        const result = await sample(stage, (index + local) / 3);
        const moving = result.cubes.map((cube, cubeIndex) => Math.min(distance(cube.position, initial.cubes[cubeIndex].position), distance(cube.position, resting.cubes[cubeIndex].position)) > tolerance);
        const movingCount = moving.filter(Boolean).length;
        const gripGap = result.forcepsFaces[1].centre[0] - result.forcepsFaces[0].centre[0];
        assert(movingCount <= 1, `Stage ${stage} q=${result.q}: ${movingCount} cubes moving at once`);
        if (local === .10 || local === .98) assert(gripGap > result.cubes[result.index].side + tolerance, `Forceps fail to open before or after transfer at stage ${stage}, q=${result.q}`);
        if (local === .5) assert(result.cubes[result.index].bottom > result.rimTop, `Cube bottom does not clear beaker rim during horizontal transfer at stage ${stage}, q=${result.q}`);
        const beforeMotion = local < .20, afterMotion = local > .80;
        if (beforeMotion || afterMotion) assert(movingCount === 0, `Cube moves outside grip interval at stage ${stage}, cube ${index + 1}, local ${local}`);
        if (movingCount) {
          assert(result.forcepsVisible, `Moving cube lacks forceps at stage ${stage}, q=${result.q}`);
          assert(result.forcepsFaces.every(face => face.error < tolerance && face.overlapY > 0 && face.overlapZ > 0), `Forceps contact failed at stage ${stage}, q=${result.q}: ${JSON.stringify(result.forcepsFaces)}`);
          assert(result.rotationError < tolerance, `Cube and forceps rotation differ at stage ${stage}, q=${result.q}`);
        }
        transfers.push({ stage, q: result.q, index: result.index, local: result.local, movingCount, forcepsVisible: result.forcepsVisible, gripGap, rimClearance: result.cubes[result.index].bottom - result.rimTop, contacts: result.forcepsFaces, rotationError: result.rotationError });
        if (stage === 3 && local === .32) await capture(`lift-${index + 1}cm`);
        if (stage === 3 && local === .68) await capture(`lower-${index + 1}cm`);
        if (stage === 7 && local === .32) await capture(`remove-${index + 1}cm`);
      }
    }
  }
  for (const stage of [4, 6]) {
    const result = await sample(stage);
    submerged.push({ stage, acid: result.acid });
    assert(result.acid.every(cube => cube.surfaceClearance >= -tolerance && cube.floorClearance >= -tolerance && cube.radiusClearance >= -tolerance), `Stage ${stage}: cube is outside the acid volume: ${JSON.stringify(result.acid)}`);
  }
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  const summary = { passed: failures.length === 0, errors, failures, dimensions: initial.cubes.map(cube => ({ sizeCm: cube.sizeCm, actualSize: cube.actualSize })), measurements: measurements.map(result => ({ cube: result.index + 1, local: result.local, gapCm: result.measuredGapCm, display: result.display, contacts: result.calliperFaces })), transfers, submerged };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ passed: summary.passed, measurements: measurements.length, transferSamples: transfers.length, errors, failures, output: out }, null, 2));
  if (failures.length) throw new Error(failures.join('\n'));
} finally {
  await browser.close();
}

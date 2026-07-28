const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => {
  value = clamp(value);
  return value * value * (3 - 2 * value);
};

export function thermalViewColour(temperature) {
  const stops = [
    [20, [7, 20, 60]],
    [32, [32, 52, 118]],
    [39, [61, 97, 169]],
    [52, [154, 78, 163]],
    [64, [222, 50, 91]],
    [74, [255, 105, 38]],
    [82, [255, 221, 55]],
    [90, [255, 251, 209]]
  ];
  const value = Math.max(stops[0][0], Math.min(stops.at(-1)[0], temperature));
  let lower = stops[0], upper = stops.at(-1);
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      lower = stops[i - 1];
      upper = stops[i];
      break;
    }
  }
  const q = (value - lower[0]) / Math.max(.001, upper[0] - lower[0]);
  const rgb = lower[1].map((channel, index) => Math.round(channel + (upper[1][index] - channel) * q));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function thermalViewRgba(temperature, alpha) {
  return thermalViewColour(temperature).replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
}

function normalisedId(id = '') {
  return id.toLowerCase().replaceAll(' ', '_');
}

function pathPolygon(context, points) {
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
}

function paintThermalShape(context, points, temperature, seed = 0, edgeTemperature = temperature - 7) {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  context.save();
  pathPolygon(context, points);
  context.clip();
  const surface = context.createLinearGradient(left, top, right, bottom);
  surface.addColorStop(0, thermalViewColour(temperature + 3));
  surface.addColorStop(.48, thermalViewColour(temperature));
  surface.addColorStop(1, thermalViewColour(edgeTemperature));
  context.fillStyle = surface;
  context.fillRect(left - 2, top - 2, right - left + 4, bottom - top + 4);
  for (let i = 0; i < 18; i++) {
    const px = left + ((i * 47 + seed * 29) % 101) / 100 * (right - left);
    const py = top + ((i * 71 + seed * 13) % 97) / 96 * (bottom - top);
    const radius = 2 + ((i * 11 + seed) % 7);
    context.fillStyle = i % 3 === 0 ? 'rgba(255,246,202,.065)' : 'rgba(10,7,43,.055)';
    context.beginPath();
    context.arc(px, py, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  pathPolygon(context, points);
  context.strokeStyle = thermalViewColour(edgeTemperature);
  context.globalAlpha = .72;
  context.lineWidth = 1.8;
  context.stroke();
  context.globalAlpha = 1;
}

function thermalFlaskPose(frame, horizon, floorY, logicalWidth) {
  const stage = frame.stage || 0, timer = Math.max(0, frame.timer || 0);
  const q = stage === 1 ? clamp(timer / 2.65) : stage > 1 ? 1 : 0;
  const approach = stage === 1 ? smooth(q / .42) : 0;
  const returnQ = stage === 1 ? smooth((q - .78) / .22) : 0;
  const startX = logicalWidth * .18, pourX = logicalWidth * .34;
  let x = startX + (pourX - startX) * approach;
  let y = floorY - 2 - 48 * approach - Math.sin(Math.PI * approach) * (returnQ ? 0 : 8);
  if (returnQ > 0) {
    x = pourX + (startX - pourX) * returnQ;
    y = floorY - 50 + 48 * returnQ;
  }
  const tilt = stage === 1 ? 1.18 * smooth((q - .28) / .24) * (1 - returnQ) : 0;
  const remainingHotWater = stage === 0 ? 0 : stage === 1 ? 1 - smooth((q - .42) / .35) : .16;
  return { x, y, tilt, remainingHotWater, horizon };
}

function drawThermalFlask(context, frame, pose, scale) {
  const glassTemperature = frame.heat > .02 ? 30 + 29 * Math.max(.2, pose.remainingHotWater) : 21;
  context.save();
  context.translate(pose.x, pose.y);
  context.rotate(pose.tilt);
  context.scale(scale, scale);

  context.shadowColor = 'rgba(6,4,28,.7)';
  context.shadowBlur = 9;
  context.shadowOffsetY = 5;
  context.fillStyle = 'rgba(5,8,36,.45)';
  context.beginPath();
  context.ellipse(0, 4, 45, 11, 0, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = 'transparent';

  const flaskPath = () => {
    context.beginPath();
    context.moveTo(-13, -126);
    context.lineTo(-13, -90);
    context.bezierCurveTo(-14, -76, -46, -49, -53, -22);
    context.bezierCurveTo(-60, 6, -34, 15, 0, 15);
    context.bezierCurveTo(34, 15, 60, 6, 53, -22);
    context.bezierCurveTo(46, -49, 14, -76, 13, -90);
    context.lineTo(13, -126);
    context.closePath();
  };

  flaskPath();
  const glass = context.createLinearGradient(-55, -65, 55, -40);
  glass.addColorStop(0, thermalViewColour(glassTemperature - 7));
  glass.addColorStop(.4, thermalViewColour(glassTemperature + 4));
  glass.addColorStop(.7, thermalViewColour(glassTemperature));
  glass.addColorStop(1, thermalViewColour(glassTemperature - 9));
  context.fillStyle = glass;
  context.globalAlpha = .86;
  context.fill();
  context.globalAlpha = 1;

  if (pose.remainingHotWater > .025) {
    context.save();
    flaskPath();
    context.clip();
    const waterY = 3 - pose.remainingHotWater * 43;
    const waterTemperature = 27 + 52 * pose.remainingHotWater;
    const liquid = context.createLinearGradient(0, waterY - 20, 0, 14);
    liquid.addColorStop(0, thermalViewColour(waterTemperature + 3));
    liquid.addColorStop(1, thermalViewColour(waterTemperature - 9));
    context.fillStyle = liquid;
    context.globalAlpha = .92;
    context.fillRect(-58, waterY, 116, 32 - waterY);
    context.fillStyle = thermalViewColour(waterTemperature + 5);
    context.beginPath();
    context.ellipse(0, waterY, Math.max(16, 47 - pose.remainingHotWater * 13), 5, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  flaskPath();
  context.strokeStyle = thermalViewColour(glassTemperature + 4);
  context.globalAlpha = .8;
  context.lineWidth = 2.2;
  context.stroke();
  context.globalAlpha = 1;
  context.strokeStyle = thermalViewColour(glassTemperature - 10);
  context.lineWidth = 4;
  context.beginPath();
  context.ellipse(0, -126, 14, 4.5, 0, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = 'rgba(221,228,255,.32)';
  context.lineWidth = 1.3;
  context.beginPath();
  context.moveTo(-8, -119);
  context.lineTo(-8, -93);
  context.bezierCurveTo(-9, -77, -35, -55, -42, -28);
  context.stroke();
  context.restore();
}

function drawThermalCube(context, frame, centreX, floorY, cubeScale) {
  const c = Math.cos(frame.angle || 0), s = Math.sin(frame.angle || 0);
  const surfaces = Object.fromEntries((frame.surfaces || []).map(surface => [normalisedId(surface.id), surface]));
  const project = ([x, y, z]) => {
    const screenX = x * c + z * s, depth = -x * s + z * c;
    return { x: centreX + screenX * cubeScale, y: floorY - y * cubeScale * .91 - depth * cubeScale * .19, depth };
  };
  const faces = [
    { id: 'matt_black', normal: Math.cos(frame.angle || 0), vertices: [[-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1]] },
    { id: 'white_paint', normal: -Math.sin(frame.angle || 0), vertices: [[1, 0, 1], [1, 0, -1], [1, 2, -1], [1, 2, 1]] },
    { id: 'brushed_metal', normal: -Math.cos(frame.angle || 0), vertices: [[1, 0, -1], [-1, 0, -1], [-1, 2, -1], [1, 2, -1]] },
    { id: 'polished_metal', normal: Math.sin(frame.angle || 0), vertices: [[-1, 0, -1], [-1, 0, 1], [-1, 2, 1], [-1, 2, -1]] }
  ];
  const average = (frame.surfaces || []).reduce((sum, surface) => sum + surface.temperature, 0) / Math.max(1, (frame.surfaces || []).length);

  context.save();
  context.fillStyle = 'rgba(4,4,27,.64)';
  context.filter = 'blur(7px)';
  context.beginPath();
  context.ellipse(centreX + 5, floorY + 7, cubeScale * 1.55, cubeScale * .33, 0, 0, Math.PI * 2);
  context.fill();
  context.filter = 'none';

  if (frame.heat > .035) {
    const glow = context.createRadialGradient(centreX, floorY - cubeScale * .95, cubeScale * .18, centreX, floorY - cubeScale * .9, cubeScale * 2.2);
    glow.addColorStop(0, thermalViewColour(Math.min(90, average + 18)));
    glow.addColorStop(.18, thermalViewRgba(average + 7, .67));
    glow.addColorStop(.52, thermalViewRgba(21 + (average - 21) * .46, .3));
    glow.addColorStop(1, 'rgba(18,12,69,0)');
    context.globalCompositeOperation = 'screen';
    context.fillStyle = glow;
    context.fillRect(centreX - cubeScale * 2.35, floorY - cubeScale * 3.2, cubeScale * 4.7, cubeScale * 3.8);
    context.globalCompositeOperation = 'source-over';
  }

  const visibleFaces = faces.filter(face => face.normal > .001).sort((a, b) => {
    const da = a.vertices.reduce((sum, vertex) => sum + project(vertex).depth, 0);
    const db = b.vertices.reduce((sum, vertex) => sum + project(vertex).depth, 0);
    return db - da;
  });
  visibleFaces.forEach((face, index) => {
    const surface = surfaces[face.id] || { temperature: 21 };
    paintThermalShape(context, face.vertices.map(project), surface.temperature, index + face.id.length, surface.temperature - (face.id.includes('metal') ? 9 : 5));
  });

  const topPoints = [[-1, 2, -1], [1, 2, -1], [1, 2, 1], [-1, 2, 1]].map(project);
  paintThermalShape(context, topPoints, average * .84 + 21 * .16, 19, average - 13);

  const railTemperature = 21 + (average - 21) * .42;
  context.strokeStyle = thermalViewColour(railTemperature);
  context.lineWidth = Math.max(2, cubeScale * .055);
  context.lineJoin = 'round';
  const upperLoop = [[-1.04, 2.03, -1.04], [1.04, 2.03, -1.04], [1.04, 2.03, 1.04], [-1.04, 2.03, 1.04], [-1.04, 2.03, -1.04]].map(project);
  context.beginPath();
  upperLoop.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.stroke();
  const lowerLoop = [[-1.04, .02, -1.04], [1.04, .02, -1.04], [1.04, .02, 1.04], [-1.04, .02, 1.04], [-1.04, .02, -1.04]].map(project);
  context.beginPath();
  lowerLoop.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.stroke();

  const topCentre = project([0, 2.02, 0]);
  const neckHeight = cubeScale * .52, neckWidth = cubeScale * .42;
  const neckGradient = context.createLinearGradient(topCentre.x - neckWidth / 2, topCentre.y - neckHeight, topCentre.x + neckWidth / 2, topCentre.y);
  neckGradient.addColorStop(0, thermalViewColour(railTemperature - 5));
  neckGradient.addColorStop(.48, thermalViewColour(average + 8));
  neckGradient.addColorStop(1, thermalViewColour(railTemperature));
  context.fillStyle = neckGradient;
  context.fillRect(topCentre.x - neckWidth / 2, topCentre.y - neckHeight, neckWidth, neckHeight);
  context.fillStyle = thermalViewColour(Math.min(90, average + 13));
  context.beginPath();
  context.ellipse(topCentre.x, topCentre.y - neckHeight, neckWidth / 2, neckWidth * .18, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = thermalViewColour(Math.max(21, average - 17));
  context.beginPath();
  context.ellipse(topCentre.x, topCentre.y - neckHeight, neckWidth * .33, neckWidth * .105, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = thermalViewColour(railTemperature - 4);
  context.lineWidth = 2;
  context.stroke();

  if (frame.heat > .2) {
    context.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const plume = context.createLinearGradient(0, topCentre.y - neckHeight - 12, 0, topCentre.y - neckHeight - 58);
      plume.addColorStop(0, thermalViewRgba(54, .44));
      plume.addColorStop(1, 'rgba(70,52,143,0)');
      context.strokeStyle = plume;
      context.lineWidth = 5 - i;
      context.beginPath();
      context.moveTo(topCentre.x + (i - 1) * 6, topCentre.y - neckHeight - 3);
      context.bezierCurveTo(topCentre.x - 13 + i * 9, topCentre.y - neckHeight - 20, topCentre.x + 15 - i * 8, topCentre.y - neckHeight - 35, topCentre.x + (i - 1) * 10, topCentre.y - neckHeight - 58);
      context.stroke();
    }
  }
  context.restore();

  const visible = visibleFaces.map(face => ({ face, surface: surfaces[face.id] || { temperature: 21 } })).sort((a, b) => b.face.normal - a.face.normal)[0];
  const targetFace = visible?.face || faces[0];
  const targetVertices = targetFace.vertices.map(project);
  return {
    reticleX: targetVertices.reduce((sum, point) => sum + point.x, 0) / targetVertices.length,
    reticleY: targetVertices.reduce((sum, point) => sum + point.y, 0) / targetVertices.length,
    facingId: visible?.face.id || normalisedId(frame.facing?.id)
  };
}

export function drawThermalBenchScene(context, options) {
  const { x = 0, y = 0, width, height, frame, reticle = true } = options;
  const scale = height / 360, logicalWidth = width / Math.max(.001, scale);
  const horizon = 150, floorY = 290;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.translate(x, y);
  context.scale(scale, scale);

  const wall = context.createLinearGradient(0, 0, 0, horizon);
  wall.addColorStop(0, '#121b50');
  wall.addColorStop(.62, '#17184d');
  wall.addColorStop(1, '#23164f');
  context.fillStyle = wall;
  context.fillRect(0, 0, logicalWidth, horizon);

  context.strokeStyle = 'rgba(98,108,184,.2)';
  context.lineWidth = 1;
  const verticalStep = Math.max(52, logicalWidth / 9);
  for (let gx = (logicalWidth % verticalStep) / 2; gx < logicalWidth; gx += verticalStep) {
    context.beginPath();
    context.moveTo(gx, 0);
    context.lineTo(gx, horizon);
    context.stroke();
  }
  for (let gy = 25; gy < horizon; gy += 42) {
    context.beginPath();
    context.moveTo(0, gy);
    context.lineTo(logicalWidth, gy);
    context.stroke();
  }

  const bench = context.createLinearGradient(0, horizon, 0, 360);
  bench.addColorStop(0, '#17265e');
  bench.addColorStop(.54, '#111c50');
  bench.addColorStop(1, '#091331');
  context.fillStyle = bench;
  context.fillRect(0, horizon, logicalWidth, 360 - horizon);
  context.fillStyle = 'rgba(86,62,145,.16)';
  context.fillRect(0, horizon, logicalWidth, 3);

  context.strokeStyle = 'rgba(82,89,167,.14)';
  for (let gx = -logicalWidth; gx < logicalWidth * 2; gx += 62) {
    context.beginPath();
    context.moveTo(logicalWidth / 2 + (gx - logicalWidth / 2) * .33, horizon);
    context.lineTo(gx, 360);
    context.stroke();
  }
  for (let gy = 198; gy < 360; gy += 42) {
    const inset = (gy - horizon) * .28;
    context.beginPath();
    context.moveTo(inset, gy);
    context.lineTo(logicalWidth - inset, gy);
    context.stroke();
  }

  const flaskPose = thermalFlaskPose(frame, horizon, floorY, logicalWidth);
  drawThermalFlask(context, frame, flaskPose, Math.min(1, logicalWidth / 530));

  const cubeScale = Math.min(63, logicalWidth * .14);
  const cubeLayout = drawThermalCube(context, frame, logicalWidth * .54, floorY, cubeScale);

  if (frame.stage === 1) {
    const pourQ = clamp(((frame.timer || 0) / 2.65 - .43) / .28);
    if (pourQ > 0 && pourQ < 1) {
      const neckX = logicalWidth * .54, neckY = floorY - cubeScale * 2.37;
      context.strokeStyle = thermalViewColour(78);
      context.lineCap = 'round';
      context.lineWidth = 5;
      context.globalAlpha = Math.sin(Math.PI * pourQ) * .9;
      context.beginPath();
      context.moveTo(neckX - 5, neckY - 38);
      context.bezierCurveTo(neckX - 3, neckY - 26, neckX + 3, neckY - 16, neckX, neckY - 3);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  if (reticle) {
    context.strokeStyle = 'rgba(244,248,255,.94)';
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(cubeLayout.reticleX - 14, cubeLayout.reticleY);
    context.lineTo(cubeLayout.reticleX - 4, cubeLayout.reticleY);
    context.moveTo(cubeLayout.reticleX + 4, cubeLayout.reticleY);
    context.lineTo(cubeLayout.reticleX + 14, cubeLayout.reticleY);
    context.moveTo(cubeLayout.reticleX, cubeLayout.reticleY - 14);
    context.lineTo(cubeLayout.reticleX, cubeLayout.reticleY - 4);
    context.moveTo(cubeLayout.reticleX, cubeLayout.reticleY + 4);
    context.lineTo(cubeLayout.reticleX, cubeLayout.reticleY + 14);
    context.stroke();
    context.fillStyle = 'rgba(244,248,255,.94)';
    context.fillRect(cubeLayout.reticleX - 1, cubeLayout.reticleY - 1, 2, 2);
  }

  for (let i = 0; i < 360; i++) {
    const px = (i * 83 + 17) % Math.max(1, Math.floor(logicalWidth));
    const py = (i * 47 + 29) % 360;
    context.fillStyle = i % 3 ? 'rgba(216,222,255,.025)' : 'rgba(0,0,20,.035)';
    context.fillRect(px, py, i % 5 === 0 ? 2 : 1, 1);
  }
  context.fillStyle = 'rgba(8,7,30,.06)';
  for (let scanY = 1; scanY < 360; scanY += 3) context.fillRect(0, scanY, logicalWidth, 1);
  context.restore();

  return {
    reticleX: x + cubeLayout.reticleX * scale,
    reticleY: y + cubeLayout.reticleY * scale,
    facingId: cubeLayout.facingId,
    sceneObjects: ['tiled wall', 'bench surface', 'hot-water flask', 'rotating Leslie cube', 'filler neck', 'cube rails']
  };
}

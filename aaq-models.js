// Deterministic teaching models. These are synthetic readings, never patient data.
// Unit conversions and physical relationships are kept separate from the UI.
export function calculateAAQResult(practical, parameter, trialIndex = 0) {
  const x = Number(parameter);
  const round = (v, dp = 2) => Number(v.toFixed(dp));
  const result = (value, label, unit, explanation, extra = {}) => ({ value, label, unit, explanation, ...extra });
  switch (practical.scene) {
    case 'microscopy': {
      const total = x * 10, size = 60;
      return result(size, 'Cell diameter', 'µm', `A ${round(size * total / 1000)} mm image at ×${total} represents ${size} µm. Changing magnification changes the image, not the actual cell size.`, { magnification: total, imageSizeMm: round(size * total / 1000) });
    }
    case 'dna': {
      const recovery = Math.min(100, 100 * (1 - Math.exp(-x / 2)));
      return result(round(recovery, 1), 'Relative DNA recovery', '%', 'A conceptual precipitation model: recovery approaches a limit as cold ethanol is added. This percentage is illustrative, not a laboratory yield prediction.');
    }
    case 'gel': {
      const distance = 80 - 20 * Math.log10(Math.max(100, x));
      return result(round(Math.max(0, distance), 1), 'Migration distance', 'mm', 'At a fixed voltage, gel concentration and run time, smaller fragments travel farther. Compare against a DNA ladder; distance is approximately linear with log₁₀(fragment length) over this modelled range.');
    }
    case 'colorimeter':
      return result(round(.18 * x, 3), 'Absorbance', 'AU', 'The blank-corrected teaching calibration is A = 0.180 × concentration (g dm⁻³). Measure standards before interpolating an unknown; real calibrations need repeats and a verified linear range.', { slope: .18 });
    case 'centrifuge':
      return result(round(1.118e-5 * 8 * x * x, 0), 'Relative centrifugal force', '×g', 'RCF = 1.118 × 10⁻⁵ × radius (cm) × speed² (rpm). The rotor radius is 8.0 cm. Balance opposite tubes before closing the lid; the illustrated layers are schematic.');
    case 'respirometer': {
      const rate = .18 * Math.pow(2, (x - 20) / 10) * Math.exp(-Math.pow(Math.max(0, x - 37) / 10, 2));
      return result(round(rate, 3), 'Oxygen uptake', 'cm³ min⁻¹', 'Oxygen uptake is inferred from a pressure change after carbon dioxide is absorbed, corrected against an equal-volume control. This temperature-response model uses a fixed sample mass and 5-minute interval.', { oxygenVolume: round(rate * 5, 3) });
    }
    case 'enzyme': {
      const rate = x >= 65 ? 0 : Math.exp(-Math.pow((x - 37) / (x > 37 ? 13 : 23), 2)) / 24;
      return result(round(rate * 1000, 2), 'Relative reaction rate', '10⁻³ s⁻¹', rate > .001 ? `Pink fades as fatty acids lower the pH. The modelled endpoint is ${round(1 / rate, 1)} s; rate = 1 / endpoint time. This is an illustrative temperature response for a fixed enzyme preparation.` : 'No endpoint within the observation window. High temperature has greatly reduced enzyme activity in this model.', { endpointSeconds: rate > .001 ? round(1 / rate, 1) : null });
    }
    case 'foodtest': {
      const colours = ['blue', 'green', 'yellow', 'orange', 'brick-red'];
      const index = Math.min(4, Math.max(0, Math.ceil(x)));
      return result(index, 'Benedict’s observation', 'colour category', 'Benedict’s test screens for reducing sugars; it is not specific to glucose. Fixed reagent volumes and heating time make the sample comparison meaningful. Colour categories give only a semi-quantitative estimate.', { display: colours[index], qualitative: true });
    }
    case 'spirometer': {
      const tidal = .5 + .009 * x, frequency = 12 + .22 * x;
      return result(round(tidal * frequency, 2), 'Minute ventilation', 'dm³ min⁻¹', `Tidal volume ${round(tidal, 2)} dm³ × breathing frequency ${round(frequency, 1)} min⁻¹. These are synthetic responses for one model participant, not reference or diagnostic values.`, { tidalVolume: round(tidal, 2), breathingRate: round(frequency, 1) });
    }
    case 'pulse': {
      const heartRate = Math.round(72 + .85 * x), stroke = 70 + .3 * x;
      return result(heartRate, 'Heart rate', 'beats min⁻¹', `With a modelled stroke volume of ${round(stroke, 1)} cm³, cardiac output is ${round(heartRate * stroke / 1000, 2)} dm³ min⁻¹. Individual exercise responses vary; this is not a clinical assessment.`, { cardiacOutput: round(heartRate * stroke / 1000, 2), strokeVolume: round(stroke, 1) });
    }
    case 'reflex':
      return result(round(Math.sqrt(2 * (x / 100) / 9.81) * 1000, 0), 'Visual response time', 'ms', 't = √(2d/g), with catch distance converted from cm to m and g = 9.81 m s⁻². Catching a falling ruler is a conscious visual–motor response, not a spinal reflex. Repeat with the same hand and release position.');
    case 'antimicrobial':
      return result(x === 0 ? 6 : round(6 + 8 * Math.sqrt(Math.log(1 + x / 2)), 1), 'Inhibition-zone diameter', 'mm', 'The 6 mm water-control disc has no halo. Keep organism, inoculum, agar depth and incubation identical. This synthetic dose-response cannot rank clinical effectiveness; diffusion and susceptibility both affect zone size.');
    default: throw new Error(`Unknown Human Biology model: ${practical.scene}`);
  }
}

export function summariseAAQResults(rows) {
  const groups = new Map();
  for (const row of rows) {
    const values = groups.get(row.parameter) || [];
    values.push(row.value);
    groups.set(row.parameter, values);
  }
  return [...groups].sort((a, b) => a[0] - b[0]).map(([parameter, values]) => ({ parameter, count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, range: Math.max(...values) - Math.min(...values) }));
}

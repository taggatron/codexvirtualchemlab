// Assessment and Testing Mode Module for OCR GCSE Combined Science Lab
// Provides interactive practical assessments: apparatus selection and bench arrangement,
// method step sequencing and scientific reasoning questions, and addressing procedural limitations
// with apparatus upgrades (e.g. gas syringe vs balloon, extended temperature ranges, colorimeters, insulation).

const C = {
  navy: '#0b1d28',
  slate: '#132836',
  cardBg: '#ffffff',
  ink: '#17313e',
  muted: '#5e727e',
  teal: '#087f75',
  tealDark: '#065952',
  cyan: '#4fc3b5',
  paper: '#f4f7f6',
  line: '#cbd7da',
  lineLight: '#e4ecec',
  orange: '#e48b35',
  red: '#c9453b',
  redLight: '#fbeeed',
  green: '#28874f',
  greenLight: '#eaf7ef',
  blue: '#2073a6',
  purple: '#6b4ea3',
  yellow: '#e0981e',
  yellowLight: '#fff8ea'
};

// Helper: rounded rectangle
function rr(ctx, x, y, w, h, r = 8, fill = null, stroke = null, lineWidth = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

// Helper: text
function text(ctx, str, x, y, size = 12, color = C.ink, weight = 600, align = 'left', baseline = 'middle') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Inter,system-ui,sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(String(str ?? ''), x, y);
  ctx.restore();
}

// Helper: wrap text into lines
function wrapText(ctx, str, maxWidth, size = 11, weight = 600) {
  ctx.font = `${weight} ${size}px Inter,system-ui,sans-serif`;
  const words = String(str || '').split(/\s+/);
  const lines = [];
  let curLine = '';
  for (const word of words) {
    const testLine = curLine ? `${curLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      curLine = testLine;
    } else {
      if (curLine) lines.push(curLine);
      curLine = word;
    }
  }
  if (curLine) lines.push(curLine);
  return lines;
}

// Draw wrapped text
function drawWrapped(ctx, str, x, y, maxWidth, size = 11, color = C.ink, weight = 600, lineHeight = 15, maxLines = 8, align = 'left') {
  const lines = wrapText(ctx, str, maxWidth, size, weight).slice(0, maxLines);
  lines.forEach((line, i) => {
    text(ctx, line, x, y + i * lineHeight, size, color, weight, align, 'top');
  });
  return lines.length * lineHeight;
}

// ----------------------------------------------------------------------------
// Practical Assessment Datasets
// ----------------------------------------------------------------------------

export const assessmentDatabase = {
  respiration: {
    practicalId: 'respiration',
    title: 'Anaerobic Respiration in Yeast',
    subject: 'biology',
    icon: '◍',
    color: '#a462ba',
    taskScenario: 'Investigate how temperature affects the rate of anaerobic respiration in yeast and accurately quantify the volume of carbon dioxide produced over 10 minutes.',
    apparatusChallenge: {
      instruction: 'Select the 5 essential pieces of apparatus to measure gas volume accurately across different temperatures, and arrange them into their correct functional positions.',
      slots: [
        { id: 'vessel', label: 'Reaction Vessel', requiredItem: 'conical_flask', hint: 'Vessel holding yeast + glucose solution' },
        { id: 'seal', label: 'Gas Seal & Delivery', requiredItem: 'bung_delivery_tube', hint: 'Airtight bung with bent glass delivery tube' },
        { id: 'collector', label: 'Gas Collection Device', requiredItem: 'gas_syringe', hint: 'Calibrated instrument to measure gas volume quantitatively' },
        { id: 'temperature', label: 'Temperature Control', requiredItem: 'water_bath', hint: 'Maintains uniform constant temperature' },
        { id: 'timer', label: 'Timing Device', requiredItem: 'stopwatch', hint: 'Times the 10-minute gas collection period' }
      ],
      palette: [
        { id: 'conical_flask', name: 'Conical Flask (250 cm³)', icon: '⚗️', isCorrect: true, role: 'Reaction vessel for yeast & sugar' },
        { id: 'bung_delivery_tube', name: 'Bung with Delivery Tube', icon: '🪈', isCorrect: true, role: 'Airtight seal directing gas' },
        { id: 'gas_syringe', name: '100 cm³ Gas Syringe', icon: '💉', isCorrect: true, role: 'Measures gas volume quantitatively' },
        { id: 'water_bath', name: 'Electric Water Bath', icon: '♨️', isCorrect: true, role: 'Maintains constant temperature' },
        { id: 'stopwatch', name: 'Digital Stopwatch', icon: '⏱️', isCorrect: true, role: 'Accurate interval timing' },
        { id: 'rubber_balloon', name: 'Rubber Balloon', icon: '🎈', isCorrect: false, distractorReason: 'Qualitative only: elastic resistance causes back-pressure and cannot measure cm³ accurately' },
        { id: 'open_beaker', name: 'Open Beaker', icon: '🥛', isCorrect: false, distractorReason: 'Open container: carbon dioxide gas would escape into the room' },
        { id: 'evaporating_basin', name: 'Evaporating Basin', icon: '🥣', isCorrect: false, distractorReason: 'Used for crystallising solutions, not collecting gas' },
        { id: 'burette', name: '50 cm³ Burette', icon: '📏', isCorrect: false, distractorReason: 'Used for dispensing liquid titrants, not gas collection' }
      ]
    },
    methodChallenge: {
      scrambledSteps: [
        { id: 'step_temp', text: 'Set the thermostatic water bath to the designated temperature (e.g. 30 °C) and allow flasks to equilibrate for 5 minutes.' },
        { id: 'step_mix', text: 'Measure equal volumes of yeast suspension and glucose solution and mix thoroughly in the conical flask.' },
        { id: 'step_seal', text: 'Immediately insert the rubber bung with delivery tube tightly into the flask neck and connect to the gas syringe.' },
        { id: 'step_time', text: 'Start the stopwatch immediately and record the volume of carbon dioxide in the syringe every minute for 10 minutes.' },
        { id: 'step_repeat', text: 'Repeat the procedure at 4 further temperatures (e.g. 10 °C, 20 °C, 40 °C, 50 °C) using identical concentrations.' }
      ],
      correctOrder: ['step_temp', 'step_mix', 'step_seal', 'step_time', 'step_repeat'],
      reasoningQuestions: [
        {
          id: 'q_layer',
          prompt: 'Why is liquid paraffin often layered on top of the yeast-glucose mixture in anaerobic respiration investigations?',
          options: [
            { text: 'To prevent oxygen from entering the mixture, ensuring only anaerobic respiration occurs.', correct: true },
            { text: 'To provide a source of lipids for the yeast to respire instead of glucose.', correct: false },
            { text: 'To act as a thermal insulator preventing the mixture from losing heat.', correct: false },
            { text: 'To colour the mixture so bubbles can be counted visually.', correct: false }
          ],
          explanation: 'Liquid paraffin forms a barrier that prevents atmospheric oxygen dissolving into the mixture, ensuring anaerobic conditions (fermentation).'
        },
        {
          id: 'q_equilibrate',
          prompt: 'Why must the yeast and glucose solutions be placed in the water bath before mixing them together?',
          options: [
            { text: 'To ensure both solutions reach the target temperature before the reaction starts.', correct: true },
            { text: 'To sterilise the yeast cells so only bacteria can respire.', correct: false },
            { text: 'To evaporate excess water and concentrate the glucose.', correct: false },
            { text: 'To allow carbon dioxide to dissolve completely in the liquid.', correct: false }
          ],
          explanation: 'Equilibrating ensures the reaction begins at the exact intended temperature rather than gradually warming up during the timed trial.'
        },
        {
          id: 'q_high_temp',
          prompt: 'Why does carbon dioxide production cease entirely when the water bath temperature exceeds 60 °C?',
          options: [
            { text: 'The respiratory enzymes in the yeast denature as high kinetic energy breaks tertiary bonds.', correct: true },
            { text: 'Carbon dioxide gas condenses back into liquid glucose at high temperatures.', correct: false },
            { text: 'The yeast cells switch to photosynthesis at higher temperatures.', correct: false },
            { text: 'All the glucose molecules have evaporated from the flask.', correct: false }
          ],
          explanation: 'Above optimum temperature, active sites of intracellular respiratory enzymes denature permanently, preventing substrate binding.'
        }
      ]
    },
    limitationsChallenge: [
      {
        id: 'lim_gas_collection',
        title: 'Apparatus Limitation: Gas Collection Method',
        scenario: 'A student sets up the investigation using a rubber balloon stretched over the flask neck, estimating rate by observing how large the balloon inflates.',
        limitation: 'A balloon provides only a qualitative visual estimate; elasticity exerts back-pressure and volume cannot be read in cm³.',
        upgradePrompt: 'Which apparatus upgrade should replace the balloon to address this limitation?',
        options: [
          {
            text: '100 cm³ Gas Syringe with airtight bung and delivery tube',
            correct: true,
            advantage: 'Provides calibrated, low-friction quantitative volume readings (cm³) at precise time intervals.'
          },
          {
            text: 'Larger party balloon with a tape measure wrapped around its circumference',
            correct: false,
            advantage: 'Still subjective, balloons expand non-spherically, and elastic tension still resists gas output.'
          },
          {
            text: 'Open beaker with a metric ruler placed beside the liquid level',
            correct: false,
            advantage: 'Gas will escape into the room and cannot be measured.'
          }
        ],
        markScheme: 'Award 1 mark for selecting gas syringe; 1 mark for explaining it measures volume quantitatively vs time.'
      },
      {
        id: 'lim_temperature_range',
        title: 'Range & Interval Limitation: Number of Temperatures Tested',
        scenario: 'The preliminary student method only tested two temperatures: 20 °C and 40 °C.',
        limitation: 'Two data points can only draw a straight line; they cannot determine the non-linear enzyme curve, optimum temperature, or denaturing point.',
        upgradePrompt: 'How should the temperature range and test conditions be upgraded to resolve this limitation?',
        options: [
          {
            text: 'Test at least 5 temperatures across a 10–60 °C range (e.g. 10, 20, 30, 40, 50, 60 °C) with a thermostatically controlled water bath.',
            correct: true,
            advantage: 'Enables plotting a full bell-shaped rate curve to identify the optimum peak and the threshold where enzymes denature.'
          },
          {
            text: 'Repeat the 20 °C trial 10 times to get a very reliable average at room temperature.',
            correct: false,
            advantage: 'Does not investigate the effect of varying temperature.'
          },
          {
            text: 'Test two very high temperatures (70 °C and 90 °C) instead.',
            correct: false,
            advantage: 'Yeast enzymes are already fully denatured above 60 °C, so both will yield zero rate.'
          }
        ],
        markScheme: 'Award 1 mark for testing a wider range (10–60 °C); 1 mark for smaller regular intervals to identify the optimum peak.'
      },
      {
        id: 'lim_repeats',
        title: 'Reliability Limitation: Single Trial Protocol',
        scenario: 'Only one trial was recorded at each temperature, leading to uncertainty if a bubble leaked.',
        limitation: 'A single trial cannot reveal anomalous results or prove repeatability.',
        upgradePrompt: 'What procedural improvement must be added to evaluate and improve reliability?',
        options: [
          {
            text: 'Perform at least 3 repeat trials at each temperature, discard any anomalies, and calculate a concordant mean.',
            correct: true,
            advantage: 'Reduces the effect of random experimental errors and demonstrates repeatability.'
          },
          {
            text: 'Use twice as much glucose so that one trial produces a very large volume.',
            correct: false,
            advantage: 'Changes reactant concentration without improving reliability or detecting anomalies.'
          },
          {
            text: 'Guess the value of repeat trials by extrapolating from the first test.',
            correct: false,
            advantage: 'Fabricating data is unscientific and invalid.'
          }
        ],
        markScheme: 'Award 1 mark for 3 repeats; 1 mark for identifying anomalies and calculating a mean.'
      }
    ]
  },

  rates: {
    practicalId: 'rates',
    title: 'Rates of Reaction — Sodium Thiosulfate & Acid',
    subject: 'chemistry',
    icon: '⏱',
    color: '#e89a35',
    taskScenario: 'Investigate how temperature affects the reaction rate between sodium thiosulfate solution and hydrochloric acid by measuring the time taken for a black cross to become obscured by sulfur precipitate.',
    apparatusChallenge: {
      instruction: 'Select the 5 essential pieces of apparatus to carry out the disappearing cross investigation accurately across multiple temperatures.',
      slots: [
        { id: 'vessel', label: 'Reaction Vessel', requiredItem: 'conical_flask', hint: 'Transparent flat-bottomed vessel to view cross from above' },
        { id: 'cross', label: 'Visual Indicator', requiredItem: 'paper_cross', hint: 'High-contrast printed marker placed beneath the flask' },
        { id: 'temp_control', label: 'Temperature Control', requiredItem: 'water_bath', hint: 'Conditions thiosulfate to exact temperatures' },
        { id: 'measuring', label: 'Solution Measurement', requiredItem: 'measuring_cylinders', hint: 'Accurately measures 50 cm³ thiosulfate & 10 cm³ acid' },
        { id: 'timer', label: 'Timing Device', requiredItem: 'stopwatch', hint: 'Times until cross is completely obscured' }
      ],
      palette: [
        { id: 'conical_flask', name: 'Conical Flask (100 cm³)', icon: '⚗️', isCorrect: true, role: 'Reaction vessel viewed from above' },
        { id: 'paper_cross', name: 'Paper with Black Cross', icon: '➕', isCorrect: true, role: 'Standard reference marker' },
        { id: 'water_bath', name: 'Electric Water Bath', icon: '♨️', isCorrect: true, role: 'Uniform temperature conditioning' },
        { id: 'measuring_cylinders', name: 'Measuring Cylinders (50 & 10 cm³)', icon: '🧪', isCorrect: true, role: 'Accurate reagent volume control' },
        { id: 'stopwatch', name: 'Digital Stopwatch', icon: '⏱️', isCorrect: true, role: 'Measures obscuration time in seconds' },
        { id: 'burette', name: '50 cm³ Burette', icon: '📏', isCorrect: false, distractorReason: 'Used for titrations; unnecessary for fixed 50 cm³ volumes' },
        { id: 'crucible', name: 'Porcelain Crucible', icon: '🥣', isCorrect: false, distractorReason: 'Opaque vessel: cross cannot be viewed through the base' },
        { id: 'filter_funnel', name: 'Filter Funnel + Paper', icon: '☕', isCorrect: false, distractorReason: 'Filtering sulfur would stop the timed observation' }
      ]
    },
    methodChallenge: {
      scrambledSteps: [
        { id: 'step_measure', text: 'Measure 50 cm³ of sodium thiosulfate solution and 10 cm³ of dilute hydrochloric acid using separate clean measuring cylinders.' },
        { id: 'step_bath', text: 'Place the thiosulfate flask into a thermostatically controlled water bath until it reaches the desired temperature.' },
        { id: 'step_cross', text: 'Place the flask directly onto the printed black cross on a flat, well-lit surface.' },
        { id: 'step_add', text: 'Add the hydrochloric acid, swirl once to mix, and start the stopwatch immediately.' },
        { id: 'step_watch', text: 'Look directly down through the neck from above and stop the timer the instant the black cross is no longer visible.' }
      ],
      correctOrder: ['step_measure', 'step_bath', 'step_cross', 'step_add', 'step_watch'],
      reasoningQuestions: [
        {
          id: 'q_separate_cylinders',
          prompt: 'Why must separate measuring cylinders be used for the sodium thiosulfate and hydrochloric acid?',
          options: [
            { text: 'To prevent premature reaction and sulfur precipitate forming inside the measuring cylinder.', correct: true },
            { text: 'Because acid dissolves glass measuring cylinders.', correct: false },
            { text: 'To ensure the thiosulfate cools down before mixing.', correct: false },
            { text: 'To change the pH of the acid before the experiment.', correct: false }
          ],
          explanation: 'Using the same cylinder would cross-contaminate the reagents, triggering premature sulfur formation before timing starts.'
        },
        {
          id: 'q_cross_first',
          prompt: 'Why must the flask be positioned on the cross BEFORE adding the hydrochloric acid?',
          options: [
            { text: 'Because at higher temperatures the reaction starts immediately and moving a reacting flask introduces timing delays and spill hazards.', correct: true },
            { text: 'To keep the black cross warm from the flask base.', correct: false },
            { text: 'To ensure the acid falls from a greater height.', correct: false },
            { text: 'To calibrate the stopwatch display.', correct: false }
          ],
          explanation: 'Positioning on the cross first ensures timing starts at t = 0 without losing initial reaction seconds or spilling hot acid.'
        },
        {
          id: 'q_same_observer',
          prompt: 'Why should the SAME observer view the disappearing cross throughout all trials?',
          options: [
            { text: 'Human eyesight and judgment of when the cross is obscured vary between individuals, so one observer keeps this systematic error consistent.', correct: true },
            { text: 'Because having two observers makes sulfur precipitate faster.', correct: false },
            { text: 'To ensure the light intensity in the room doubles.', correct: false },
            { text: 'Because GCSE rules forbid team practical work.', correct: false }
          ],
          explanation: 'Judging the disappearance is subjective. Having one consistent observer ensures individual visual threshold bias is controlled.'
        }
      ]
    },
    limitationsChallenge: [
      {
        id: 'lim_rates_colorimeter',
        title: 'Apparatus Limitation: Subjective Human Eye Observation',
        scenario: 'The student determines the endpoint by human eye when they can no longer see the cross.',
        limitation: 'Human judgment of when the cross disappears is subjective and prone to observer bias and reaction time errors.',
        upgradePrompt: 'Which digital apparatus upgrade replaces human judgment with an objective, quantitative measurement?',
        options: [
          {
            text: 'Light sensor / Digital Colorimeter connected to a data logger measuring % light transmission over time.',
            correct: true,
            advantage: 'Measures turbidity quantitatively with zero subjective bias, producing a continuous transmission vs time graph.'
          },
          {
            text: 'Stronger magnifying glass placed above the flask neck.',
            correct: false,
            advantage: 'Still relies on subjective human eyesight and distorts the view.'
          },
          {
            text: 'A darker cross drawn with thick waterproof black marker.',
            correct: false,
            advantage: 'Does not remove subjective human eyesight judgment.'
          }
        ],
        markScheme: 'Award 1 mark for colorimeter / light sensor with data logger; 1 mark for quantitative light transmission measurement.'
      },
      {
        id: 'lim_rates_temp_range',
        title: 'Range & Temperature Control Limitation',
        scenario: 'Trials were carried out at room temperature (20 °C) and 25 °C only, without an insulated or heated bath.',
        limitation: 'A 5 °C difference is too narrow to determine the relationship between temperature and reaction rate, and solutions cool to the room during timing.',
        upgradePrompt: 'How should the temperature range and thermal management be upgraded?',
        options: [
          {
            text: 'Test 5 distinct temperatures (e.g. 20, 30, 40, 50, 60 °C) using a thermostatically controlled water bath to keep temperature steady.',
            correct: true,
            advantage: 'Spans a wide 40 °C range showing exponential rate increase (particles have higher kinetic energy and collide more frequently with E ≥ Ea).'
          },
          {
            text: 'Heat the flask directly over a roaring blue Bunsen burner to 100 °C.',
            correct: false,
            advantage: 'Dangerous boiling of toxic sulfur dioxide gas and uncontrollable rapid reaction.'
          },
          {
            text: 'Keep the temperature at 0 °C using an ice bath for all trials.',
            correct: false,
            advantage: 'Does not investigate how varying temperature affects rate.'
          }
        ],
        markScheme: 'Award 1 mark for wide range (20–60 °C at 10 °C intervals); 1 mark for thermostatically controlled water bath.'
      }
    ]
  },

  temp: {
    practicalId: 'temp',
    title: 'Temperature Changes in Neutralisation',
    subject: 'chemistry',
    icon: '🌡',
    color: '#d85f58',
    taskScenario: 'Investigate the temperature profile when increasing volumes of hydrochloric acid are added to a fixed volume of sodium hydroxide solution, determining the maximum temperature rise and neutralisation point.',
    apparatusChallenge: {
      instruction: 'Select the 5 essential pieces of apparatus to minimise thermal losses and measure temperature changes accurately.',
      slots: [
        { id: 'vessel', label: 'Insulated Reaction Vessel', requiredItem: 'polystyrene_cup', hint: 'Low thermal conductivity vessel' },
        { id: 'support', label: 'Support Beaker', requiredItem: 'glass_beaker', hint: 'Prevents polystyrene cup from tipping over' },
        { id: 'lid', label: 'Insulating Lid', requiredItem: 'cup_lid', hint: 'Reduces heat loss by convection and evaporation' },
        { id: 'sensor', label: 'Temperature Sensor', requiredItem: 'digital_thermometer', hint: 'Accurate probe reading to ±0.1 °C' },
        { id: 'measuring', label: 'Volume Measurement', requiredItem: 'measuring_cylinder', hint: 'Measures exact reagent volumes in cm³' }
      ],
      palette: [
        { id: 'polystyrene_cup', name: 'Expanded Polystyrene Cup', icon: '🥤', isCorrect: true, role: 'Thermal insulator minimising heat loss' },
        { id: 'glass_beaker', name: '250 cm³ Beaker (Support)', icon: '🥛', isCorrect: true, role: 'Stabilises the lightweight cup' },
        { id: 'cup_lid', name: 'Card/Plastic Lid with Hole', icon: '🔘', isCorrect: true, role: 'Minimises convection & evaporation' },
        { id: 'digital_thermometer', name: 'Digital Thermometer (0.1 °C)', icon: '🌡️', isCorrect: true, role: 'Rapid, precise temperature reading' },
        { id: 'measuring_cylinder', name: 'Measuring Cylinder (25 cm³)', icon: '🧪', isCorrect: true, role: 'Measures acid additions accurately' },
        { id: 'copper_can', name: 'Thin Copper Can', icon: '🥫', isCorrect: false, distractorReason: 'High thermal conductivity: heats surroundings rapidly' },
        { id: 'bunsen_burner', name: 'Bunsen Burner', icon: '🔥', isCorrect: false, distractorReason: 'Adds external heat, invalidating neutralisation enthalpy' },
        { id: 'filter_paper', name: 'Filter Paper', icon: '📄', isCorrect: false, distractorReason: 'No solid precipitate to separate in this solution reaction' }
      ]
    },
    methodChallenge: {
      scrambledSteps: [
        { id: 'step_base', text: 'Measure 30 cm³ of 1.0 mol/dm³ sodium hydroxide and transfer into the polystyrene cup supported in a beaker.' },
        { id: 'step_initial', text: 'Place the lid on the cup, insert the thermometer, and record the initial baseline temperature.' },
        { id: 'step_add', text: 'Add 5 cm³ of dilute hydrochloric acid using a measuring cylinder, replace the lid, and swirl gently.' },
        { id: 'step_peak', text: 'Monitor the thermometer display and record the highest temperature reached.' },
        { id: 'step_repeat', text: 'Repeat with additional 5 cm³ portions of acid up to 40 cm³, plotting temperature against total acid added.' }
      ],
      correctOrder: ['step_base', 'step_initial', 'step_add', 'step_peak', 'step_repeat'],
      reasoningQuestions: [
        {
          id: 'q_why_polystyrene',
          prompt: 'Why is a polystyrene cup used instead of a standard glass beaker as the reaction vessel?',
          options: [
            { text: 'Polystyrene is a good thermal insulator, reducing heat loss by conduction to the surroundings.', correct: true },
            { text: 'Polystyrene reacts with alkali to generate extra heat.', correct: false },
            { text: 'Glass would neutralise the acid before the reaction occurs.', correct: false },
            { text: 'Polystyrene allows the student to see through the walls clearly.', correct: false }
          ],
          explanation: 'Polystyrene has very low thermal conductivity, keeping released heat inside the solution for an accurate ΔT measurement.'
        },
        {
          id: 'q_why_lid',
          prompt: 'What mode of heat transfer does fitting an insulated lid primarily prevent?',
          options: [
            { text: 'Convection and evaporation of warm liquid vapour.', correct: true },
            { text: 'Radiation of gamma rays from the nucleus.', correct: false },
            { text: 'Electrochemical conduction through the bench.', correct: false },
            { text: 'Magnetic induction.', correct: false }
          ],
          explanation: 'The lid prevents hot air and water vapour escaping, substantially reducing convective and evaporative cooling.'
        },
        {
          id: 'q_temp_drops',
          prompt: 'Why does the temperature begin to decrease once more than 30 cm³ of acid has been added?',
          options: [
            { text: 'All the sodium hydroxide has reacted; excess cold acid now dilutes and cools the warm mixture.', correct: true },
            { text: 'The reaction becomes endothermic at higher acid volumes.', correct: false },
            { text: 'The sodium chloride crystals absorb latent heat to melt.', correct: false },
            { text: 'The thermometer stops working after 5 minutes.', correct: false }
          ],
          explanation: 'Once all OH⁻ ions have reacted (neutralisation complete), no further exothermic heat is released, so extra room-temperature acid cools the solution.'
        }
      ]
    },
    limitationsChallenge: [
      {
        id: 'lim_temp_heat_loss',
        title: 'Apparatus Limitation: Thermal Losses to Surroundings',
        scenario: 'A student conducts the reaction in an uninsulated glass beaker without a lid.',
        limitation: 'Heat is lost rapidly to the air and bench, making the measured maximum temperature lower than theoretical enthalpy.',
        upgradePrompt: 'Which apparatus upgrade best addresses this limitation?',
        options: [
          {
            text: 'Polystyrene cup fitted inside a second polystyrene cup with an insulating lid.',
            correct: true,
            advantage: 'Provides double-walled thermal insulation and eliminates convective heat loss from the surface.'
          },
          {
            text: 'Wrap the glass beaker in aluminium foil.',
            correct: false,
            advantage: 'Aluminium is a metal with high thermal conductivity that conducts heat away quickly.'
          },
          {
            text: 'Conduct the experiment on an open metal tripod.',
            correct: false,
            advantage: 'Increases thermal conduction into the metal tripod legs.'
          }
        ],
        markScheme: 'Award 1 mark for polystyrene cup + lid; 1 mark for explaining it minimises conductive and convective heat losses.'
      },
      {
        id: 'lim_temp_resolution',
        title: 'Instrument Precision Limitation: Thermometer Scale',
        scenario: 'The student uses a standard mercury/alcohol thermometer marked in 1 °C divisions.',
        limitation: 'Reading resolution is limited to ±0.5 °C with parallax error.',
        upgradePrompt: 'Which upgrade improves measurement precision and reduces reading uncertainty?',
        options: [
          {
            text: 'A digital temperature probe with data logger reading to ±0.1 °C.',
            correct: true,
            advantage: 'Higher resolution (0.1 °C) and electronic logging removes parallax error and records the exact peak instant.'
          },
          {
            text: 'A longer ruler held next to the liquid thermometer.',
            correct: false,
            advantage: 'Does not change the resolution of the thermometer scale.'
          },
          {
            text: 'Touching the outside of the cup to judge heat with the hand.',
            correct: false,
            advantage: 'Extremely imprecise, subjective, and creates a burn hazard.'
          }
        ],
        markScheme: 'Award 1 mark for digital temperature probe; 1 mark for higher precision (0.1 °C) and eliminating parallax.'
      }
    ]
  },

  titration: {
    practicalId: 'titration',
    title: 'Acid–Alkali Titration',
    subject: 'chemistry',
    icon: '↧',
    color: '#c2578c',
    taskScenario: 'Determine the exact volume of 0.100 mol/dm³ sodium hydroxide required to neutralise 25.0 cm³ of hydrochloric acid of unknown concentration using phenolphthalein indicator.',
    apparatusChallenge: {
      instruction: 'Select the 5 essential pieces of apparatus to perform a high-precision volumetric titration.',
      slots: [
        { id: 'burette', label: 'Variable Dispenser', requiredItem: 'burette', hint: 'Graduated tube with stopcock measuring to 0.05 cm³' },
        { id: 'stand', label: 'Burette Support', requiredItem: 'clamp_stand', hint: 'Holds burette vertically at eye level' },
        { id: 'pipette', label: 'Fixed Volume Transfer', requiredItem: 'volumetric_pipette', hint: 'Transfers exactly 25.0 cm³ of acid' },
        { id: 'flask', label: 'Titration Vessel', requiredItem: 'conical_flask', hint: 'Allows swirling without liquid splashing out' },
        { id: 'tile', label: 'Colour Contrast Aid', requiredItem: 'white_tile', hint: 'Enables detection of first pale pink tint' }
      ],
      palette: [
        { id: 'burette', name: '50 cm³ Burette + Tap', icon: '📏', isCorrect: true, role: 'Dispenses titrant in 0.05 cm³ drops' },
        { id: 'clamp_stand', name: 'Clamp Stand & Burette Clamp', icon: '🔬', isCorrect: true, role: 'Maintains vertical burette alignment' },
        { id: 'volumetric_pipette', name: '25.0 cm³ Volumetric Pipette + Filler', icon: '🧪', isCorrect: true, role: 'High accuracy fixed aliquot transfer' },
        { id: 'conical_flask', name: 'Conical Flask (250 cm³)', icon: '⚗️', isCorrect: true, role: 'Sloped walls prevent splashing during swirl' },
        { id: 'white_tile', name: 'Glazed White Ceramic Tile', icon: '⬜', isCorrect: true, role: 'Maximum visual contrast for colour change' },
        { id: 'beaker', name: 'Open Beaker', icon: '🥛', isCorrect: false, distractorReason: 'Straight vertical walls allow liquid to splash out when swirled' },
        { id: 'measuring_cylinder', name: '50 cm³ Measuring Cylinder', icon: '🧪', isCorrect: false, distractorReason: 'Insufficient precision (±0.5 cm³) compared to volumetric pipette (±0.06 cm³)' },
        { id: 'bunsen_burner', name: 'Bunsen Burner', icon: '🔥', isCorrect: false, distractorReason: 'Titrations are performed at room temperature; heating decomposes indicators' }
      ]
    },
    methodChallenge: {
      scrambledSteps: [
        { id: 'step_pipette', text: 'Use a volumetric pipette and filler to transfer exactly 25.0 cm³ of hydrochloric acid into a clean conical flask.' },
        { id: 'step_indicator', text: 'Add 2–3 drops of phenolphthalein indicator and place the flask on a white tile beneath the burette.' },
        { id: 'step_fill', text: 'Rinse and fill the burette with sodium hydroxide solution, ensuring the jet space below the tap is full and record initial reading.' },
        { id: 'step_rough', text: 'Perform a rough titration by running in NaOH with constant swirling until the solution turns permanently pale pink.' },
        { id: 'step_accurate', text: 'Repeat accurately, adding NaOH dropwise near the endpoint until concordant titres (within 0.10 cm³) are obtained.' }
      ],
      correctOrder: ['step_pipette', 'step_indicator', 'step_fill', 'step_rough', 'step_accurate'],
      reasoningQuestions: [
        {
          id: 'q_why_conical',
          prompt: 'Why is a conical flask preferred over a beaker for holding the acid solution during titration?',
          options: [
            { text: 'The sloping walls allow continuous, vigorous swirling without splashing drops of solution out.', correct: true },
            { text: 'Conical flasks hold more volume than beakers.', correct: false },
            { text: 'Conical flasks are made of special glass that catalyses neutralisation.', correct: false },
            { text: 'A beaker would react with the phenolphthalein indicator.', correct: false }
          ],
          explanation: 'Continuous swirling is vital to mix reactants; conical flask walls prevent loss of drops, which would cause an inaccurate titre.'
        },
        {
          id: 'q_meniscus',
          prompt: 'How must the liquid level in the burette be read to avoid parallax error?',
          options: [
            { text: 'At eye level, looking straight at the bottom of the curved liquid meniscus.', correct: true },
            { text: 'From above, looking down into the burette barrel.', correct: false },
            { text: 'From below, reading the top outer edges of the liquid.', correct: false },
            { text: 'By rounding to the nearest 5 cm³ mark.', correct: false }
          ],
          explanation: 'Reading at eye level from the bottom of the meniscus ensures consistent, accurate volume readings without parallax distortion.'
        },
        {
          id: 'q_white_tile',
          prompt: 'Why is a white ceramic tile placed beneath the conical flask?',
          options: [
            { text: 'To clearly detect the very first faint, permanent colour change (colourless to pale pink).', correct: true },
            { text: 'To protect the wooden laboratory bench from spills.', correct: false },
            { text: 'To conduct heat away from the flask.', correct: false },
            { text: 'To make the flask sit higher up towards the burette tip.', correct: false }
          ],
          explanation: 'The neutralisation endpoint is marked by the first persistent faint pink tinge. A white background makes this subtle shift instantly visible.'
        }
      ]
    },
    limitationsChallenge: [
      {
        id: 'lim_titr_dropwise',
        title: 'Technique Limitation: Overshooting the Endpoint',
        scenario: 'The student leaves the burette tap flowing rapidly and stops only when the flask turns deep magenta/purple.',
        limitation: 'Overshooting the endpoint by several cm³ adds excess alkali, resulting in an artificially high titre calculation.',
        upgradePrompt: 'How should the delivery technique be improved near the endpoint?',
        options: [
          {
            text: 'Add titrant drop-by-drop with continuous swirling within 1 cm³ of the expected endpoint until one single drop produces a permanent pale pink tint.',
            correct: true,
            advantage: 'Pins down the stoichiometric equivalence point to within a single drop (±0.05 cm³).'
          },
          {
            text: 'Add 10 drops of extra indicator so the colour change happens earlier.',
            correct: false,
            advantage: 'Indicators are weak acids; excess indicator skews the titre volume.'
          },
          {
            text: 'Pour the acid into the burette instead.',
            correct: false,
            advantage: 'Does not solve the rapid-flow overshooting problem.'
          }
        ],
        markScheme: 'Award 1 mark for dropwise addition; 1 mark for swirling and stopping at first permanent pale pink colour.'
      },
      {
        id: 'lim_titr_concordance',
        title: 'Reliability Limitation: Non-Concordant Titres',
        scenario: 'The student records only two titres: 24.50 cm³ and 22.80 cm³, and takes the average of both.',
        limitation: 'A difference of 1.70 cm³ indicates at least one rough trial or severe anomaly; averaging non-concordant results yields an invalid concentration.',
        upgradePrompt: 'What rule must be followed regarding repeat titrations and calculating the mean titre?',
        options: [
          {
            text: 'Continue repeats until at least two concordant titres within 0.10 cm³ of each other are obtained, and calculate the mean from those concordant runs only.',
            correct: true,
            advantage: 'Discards rough or anomalous trials, guaranteeing high accuracy and repeatability.'
          },
          {
            text: 'Simply take the higher value because more liquid is always better.',
            correct: false,
            advantage: 'Unscientific and systematically biased.'
          },
          {
            text: 'Average the rough trial with the first accurate trial.',
            correct: false,
            advantage: 'The rough trial is intentionally an overshoot to find the ballpark and must never be averaged.'
          }
        ],
        markScheme: 'Award 1 mark for repeating until concordant within 0.10 cm³; 1 mark for averaging only concordant titres.'
      }
    ]
  },

  specificheat: {
    practicalId: 'specificheat',
    title: 'Specific Heat Capacity of Metals',
    subject: 'physics',
    icon: 'ΔT',
    color: '#d06b38',
    taskScenario: 'Determine the specific heat capacity of a 1.00 kg metal block (aluminium or copper) from the electrical energy supplied by an immersion heater and the resulting temperature rise measured by a digital thermometer.',
    apparatusChallenge: {
      instruction: 'Select the 5 essential pieces of apparatus to measure electrical work done and temperature change while minimising thermal dissipation.',
      slots: [
        { id: 'block', label: '1.00 kg Metal Block', requiredItem: 'metal_block', hint: 'Solid cylinder with 2 pre-drilled vertical bores' },
        { id: 'heater', label: 'Immersion Heater', requiredItem: 'immersion_heater', hint: 'Transfers electrical energy into the block core' },
        { id: 'meter', label: 'Energy / Power Meter', requiredItem: 'joulemeter', hint: 'Measures total electrical energy supplied in Joules' },
        { id: 'insulation', label: 'Thermal Jacket & Lid', requiredItem: 'insulating_jacket', hint: 'Minimises thermal energy dissipation to air' },
        { id: 'sensor', label: 'Temperature Sensor', requiredItem: 'digital_thermometer', hint: 'Measures initial and peak temperature' }
      ],
      palette: [
        { id: 'metal_block', name: '1.00 kg Aluminium Block', icon: '🧱', isCorrect: true, role: 'Known mass test specimen' },
        { id: 'immersion_heater', name: '12 V Immersion Heater', icon: '🔌', isCorrect: true, role: 'Supplies controlled thermal energy' },
        { id: 'joulemeter', name: 'Digital Joulemeter', icon: '📟', isCorrect: true, role: 'Direct measurement of energy (J)' },
        { id: 'insulating_jacket', name: 'Foam Insulation Jacket + Bored Lid', icon: '🧥', isCorrect: true, role: 'Prevents heat loss to surroundings' },
        { id: 'digital_thermometer', name: 'Digital Thermometer Probe', icon: '🌡️', isCorrect: true, role: 'Monitors temperature rise Δθ' },
        { id: 'bunsen_burner', name: 'Bunsen Burner', icon: '🔥', isCorrect: false, distractorReason: 'Cannot measure energy input in Joules accurately' },
        { id: 'iron_filings', name: 'Iron Filings', icon: '🧂', isCorrect: false, distractorReason: 'Used for magnetic field mapping' },
        { id: 'spring', name: 'Helical Steel Spring', icon: '🌀', isCorrect: false, distractorReason: 'Apparatus for Hooke’s Law force-extension' }
      ]
    },
    methodChallenge: {
      scrambledSteps: [
        { id: 'step_mass', text: 'Weigh the clean metal block on an electronic balance to verify its mass is exactly 1.00 kg.' },
        { id: 'step_paste', text: 'Add a few drops of thermal paste (or water) into both probe holes to ensure good thermal contact.' },
        { id: 'step_assemble', text: 'Wrap the block in the insulating foam jacket and lid, then insert the heater and thermometer probe fully.' },
        { id: 'step_heat', text: 'Record initial temperature, switch on the 12 V power supply, and heat the block until approximately 18,000 J have been transferred.' },
        { id: 'step_peak', text: 'Switch off the heater and continue observing until the maximum peak temperature is reached before calculating c = ΔE / (m × Δθ).' }
      ],
      correctOrder: ['step_mass', 'step_paste', 'step_assemble', 'step_heat', 'step_peak'],
      reasoningQuestions: [
        {
          id: 'q_thermal_paste',
          prompt: 'Why is thermal paste (or oil/water) placed in the thermometer bore hole?',
          options: [
            { text: 'Air is a poor thermal conductor; the paste replaces air pockets to ensure rapid heat conduction from metal to probe.', correct: true },
            { text: 'To lubricate the metal block so the probe does not jam.', correct: false },
            { text: 'To stop the metal block from rusting during heating.', correct: false },
            { text: 'To increase the electrical resistance of the thermometer.', correct: false }
          ],
          explanation: 'Air has very low thermal conductivity. Thermal paste conducts heat directly into the sensor nib, eliminating lag.'
        },
        {
          id: 'q_post_heating_peak',
          prompt: 'Why must you continue recording temperature for several minutes AFTER switching off the heater?',
          options: [
            { text: 'It takes time for thermal energy to conduct from the central heater element through the block to the thermometer.', correct: true },
            { text: 'The heater continues to generate new electrical energy even when switched off.', correct: false },
            { text: 'To allow the block to cool down to 0 °C before doing the calculation.', correct: false },
            { text: 'Because digital meters only update every 5 minutes.', correct: false }
          ],
          explanation: 'Heat conduction through solid metal takes time. The true maximum temperature occurs slightly after power is cut.'
        }
      ]
    },
    limitationsChallenge: [
      {
        id: 'lim_shc_heat_loss',
        title: 'Thermal Dissipation Limitation: Energy Loss to Air',
        scenario: 'A student heats an uninsulated bare metal block standing on a stone workbench.',
        limitation: 'Thermal energy escapes into the ambient air and bench by conduction and radiation, making the measured temperature rise too small.',
        upgradePrompt: 'What effect does this heat loss have on the calculated value of specific heat capacity (c), and how is it resolved?',
        options: [
          {
            text: 'Measured Δθ is too small, so calculated c = ΔE/(mΔθ) is artificially TOO HIGH. Upgraded by wrapping in thick foam insulation and standing on an insulated mat.',
            correct: true,
            advantage: 'Traps the supplied heat inside the block so measured Δθ reflects the full electrical energy input.'
          },
          {
            text: 'Calculated c becomes too low; resolved by heating the block faster with two Bunsen burners.',
            correct: false,
            advantage: 'Adds unmeasured heat and worsens thermal losses.'
          },
          {
            text: 'Calculated c is unaffected because mass is constant.',
            correct: false,
            advantage: 'Incorrect: energy loss directly alters the denominator (Δθ).'
          }
        ],
        markScheme: 'Award 1 mark for identifying calculated c is too high; 1 mark for foam jacket + lid + insulating base.'
      }
    ]
  }
};

// Generic fallback generator for practicals not explicitly detailed above
export function getPracticalAssessment(practical) {
  if (assessmentDatabase[practical.id]) return assessmentDatabase[practical.id];
  
  // Synthesise intelligent GCSE assessment based on practical metadata and gear
  const gearItems = practical.gear || ['Standard Glassware', 'Electronic Sensor', 'Reaction Vessel'];
  const steps = practical.steps || ['Prepare apparatus', 'Set conditions', 'Carry out trial', 'Record measurement'];
  
  return {
    practicalId: practical.id,
    title: practical.title,
    subject: practical.subject || 'chemistry',
    icon: practical.icon || '🔬',
    color: practical.color || C.teal,
    taskScenario: `Conduct the GCSE practical investigation for: ${practical.title}. ${practical.objective}`,
    apparatusChallenge: {
      instruction: 'Select the required apparatus for this investigation and assign each item to its operational workbench slot.',
      slots: gearItems.slice(0, 4).map((g, idx) => ({
        id: `slot_${idx}`,
        label: `Station ${idx + 1}: ${g}`,
        requiredItem: `item_${idx}`,
        hint: `Required apparatus: ${g}`
      })),
      palette: [
        ...gearItems.slice(0, 4).map((g, idx) => ({
          id: `item_${idx}`,
          name: g,
          icon: '🔬',
          isCorrect: true,
          role: `Essential equipment: ${g}`
        })),
        { id: 'distractor_1', name: 'Open Evaporating Basin', icon: '🥣', isCorrect: false, distractorReason: 'Not suitable for this specific procedure' },
        { id: 'distractor_2', name: 'Uncalibrated Plastic Spoon', icon: '🥄', isCorrect: false, distractorReason: 'Lacks quantitative measurement precision' }
      ]
    },
    methodChallenge: {
      scrambledSteps: steps.map((s, idx) => ({ id: `step_${idx}`, text: s })),
      correctOrder: steps.map((_, idx) => `step_${idx}`),
      reasoningQuestions: [
        {
          id: 'gen_q1',
          prompt: `Why is it critical to control variables strictly during the ${practical.title} practical?`,
          options: [
            { text: 'To ensure validity, so that any observed change in the dependent variable is caused solely by the independent variable.', correct: true },
            { text: 'To ensure the experiment finishes as quickly as possible.', correct: false },
            { text: 'Because measuring instruments only function when variables are constant.', correct: false },
            { text: 'To avoid needing repeat trials.', correct: false }
          ],
          explanation: 'Controlling all other variables ensures the test is fair and valid, establishing true causality.'
        },
        {
          id: 'gen_q2',
          prompt: 'What is the primary scientific purpose of repeating measurements at each test condition?',
          options: [
            { text: 'To identify anomalous data points and calculate a concordant mean, improving reliability.', correct: true },
            { text: 'To change the independent variable automatically.', correct: false },
            { text: 'To test whether the chemicals have changed colour permanently.', correct: false },
            { text: 'To satisfy safety regulations without taking new readings.', correct: false }
          ],
          explanation: 'Repeating trials enables identification of random anomalies and calculation of a reliable mean.'
        }
      ]
    },
    limitationsChallenge: [
      {
        id: 'gen_lim1',
        title: 'Apparatus Precision & Measurement Limitation',
        scenario: 'A student uses basic manual visual observation or low-resolution equipment for recording data.',
        limitation: 'Manual visual judgment introduces human reaction time uncertainty and subjective parallax error.',
        upgradePrompt: 'Which apparatus upgrade best addresses this procedural limitation?',
        options: [
          {
            text: 'Use calibrated digital sensors with an automated data logger (e.g. digital probe, colorimeter, or light gates).',
            correct: true,
            advantage: 'Removes human reaction time and records high-frequency, high-resolution quantitative data continuously.'
          },
          {
            text: 'Ask a friend to watch the clock instead.',
            correct: false,
            advantage: 'Still relies on human reaction time and judgment.'
          },
          {
            text: 'Conduct the experiment in the dark.',
            correct: false,
            advantage: 'Impairs observation and creates safety hazards.'
          }
        ],
        markScheme: 'Award 1 mark for calibrated digital sensor / data logger; 1 mark for removing human reaction time.'
      },
      {
        id: 'gen_lim2',
        title: 'Range of Conditions & Temperature Limitation',
        scenario: 'Only two values of the independent variable were tested in the preliminary investigation.',
        limitation: 'Two data points cannot reveal a non-linear relationship or identify optimum/saturation points.',
        upgradePrompt: 'How should the experimental range be upgraded to address this limitation?',
        options: [
          {
            text: 'Test at least 5 distinct values across a broad, realistic range at regular intervals (e.g. across 10–60 °C or 5 concentrations).',
            correct: true,
            advantage: 'Enables plotting a complete response curve to identify trends, proportionality, and threshold limits.'
          },
          {
            text: 'Keep all conditions constant and take only one measurement.',
            correct: false,
            advantage: 'Provides zero information about the effect of changing variables.'
          },
          {
            text: 'Extrapolate the graph without collecting further data.',
            correct: false,
            advantage: 'Extrapolation without evidence is scientifically invalid.'
          }
        ],
        markScheme: 'Award 1 mark for testing 5+ values across a broad range; 1 mark for regular intervals.'
      }
    ]
  };
}

// ----------------------------------------------------------------------------
// Assessment Session Management
// ----------------------------------------------------------------------------

export function createAssessmentSession(practical) {
  const data = getPracticalAssessment(practical);
  
  return {
    practicalId: practical.id,
    data,
    currentPhase: 'apparatus', // 'apparatus' | 'method' | 'limitations' | 'summary'
    
    // Phase 1: Apparatus state
    selectedEquipment: new Set(),
    slotAssignments: {}, // slotId -> itemId
    apparatusChecked: false,
    apparatusScore: 0,
    apparatusFeedback: null,
    
    // Phase 2: Method state
    orderedStepIds: [...data.methodChallenge.scrambledSteps.map(s => s.id)],
    methodOrderChecked: false,
    methodOrderScore: 0,
    questionAnswers: {}, // questionId -> optionIndex
    methodQuestionsChecked: false,
    methodQuestionsScore: 0,
    
    // Phase 3: Limitations state
    limitationAnswers: {}, // limId -> optionIndex
    limitationsChecked: false,
    limitationsScore: 0,
    
    // Scroll offsets
    scrollOffsets: {
      apparatus: 0,
      method: 0,
      limitations: 0,
      summary: 0
    },
    
    // Computed totals
    totalScore: 0,
    maxPossibleScore: 0,
    grade: 'Pending'
  };
}

// Check Apparatus phase
export function checkApparatusPhase(session) {
  const challenge = session.data.apparatusChallenge;
  let score = 0;
  let max = challenge.slots.length + 2; // Marks for slots + marks for avoiding distractors
  const feedbackItems = [];
  
  // Check slot assignments
  challenge.slots.forEach(slot => {
    const assignedId = session.slotAssignments[slot.id];
    if (assignedId === slot.requiredItem) {
      score += 1;
      feedbackItems.push({ slot: slot.label, status: 'correct', message: `✓ Correct: Assigned required ${slot.hint}.` });
    } else if (assignedId) {
      const item = challenge.palette.find(p => p.id === assignedId);
      feedbackItems.push({ slot: slot.label, status: 'incorrect', message: `✕ Incorrect: ${item?.name || 'Selected item'} does not match ${slot.label}.` });
    } else {
      feedbackItems.push({ slot: slot.label, status: 'missing', message: `⚠ Empty: ${slot.label} was not assigned.` });
    }
  });
  
  // Check distractors avoided
  const chosenDistractors = Array.from(session.selectedEquipment)
    .map(id => challenge.palette.find(p => p.id === id))
    .filter(p => p && !p.isCorrect);
  
  if (chosenDistractors.length === 0) {
    score += 2;
    feedbackItems.push({ slot: 'Selection Precision', status: 'correct', message: '✓ Full marks: No distractor apparatus selected.' });
  } else {
    chosenDistractors.forEach(d => {
      feedbackItems.push({ slot: 'Distractor Identified', status: 'incorrect', message: `✕ Penalty: ${d.name} is unsuitable (${d.distractorReason}).` });
    });
  }
  
  session.apparatusScore = score;
  session.apparatusChecked = true;
  session.apparatusFeedback = feedbackItems;
  updateSessionTotals(session);
}

// Check Method phase
export function checkMethodPhase(session) {
  const challenge = session.data.methodChallenge;
  let orderScore = 0;
  const correct = challenge.correctOrder;
  
  // Award 1 mark per correctly positioned step
  session.orderedStepIds.forEach((id, idx) => {
    if (id === correct[idx]) orderScore += 1;
  });
  session.methodOrderScore = orderScore;
  session.methodOrderChecked = true;
  
  // Check reasoning questions
  let qScore = 0;
  challenge.reasoningQuestions.forEach(q => {
    const ansIdx = session.questionAnswers[q.id];
    if (ansIdx != null && q.options[ansIdx]?.correct) {
      qScore += 2; // 2 marks per GCSE question
    }
  });
  session.methodQuestionsScore = qScore;
  session.methodQuestionsChecked = true;
  updateSessionTotals(session);
}

// Check Limitations phase
export function checkLimitationsPhase(session) {
  const challenges = session.data.limitationsChallenge;
  let score = 0;
  
  challenges.forEach(lim => {
    const ansIdx = session.limitationAnswers[lim.id];
    if (ansIdx != null && lim.options[ansIdx]?.correct) {
      score += 3; // 3 marks per limitation upgrade (1 mark apparatus, 1 mark range/control, 1 mark reasoning)
    }
  });
  
  session.limitationsScore = score;
  session.limitationsChecked = true;
  updateSessionTotals(session);
}

// Update total scores and estimated GCSE grade
export function updateSessionTotals(session) {
  const challenge = session.data;
  const maxApparatus = challenge.apparatusChallenge.slots.length + 2;
  const maxOrder = challenge.methodChallenge.correctOrder.length;
  const maxQuestions = challenge.methodChallenge.reasoningQuestions.length * 2;
  const maxLimitations = challenge.limitationsChallenge.length * 3;
  
  const totalMax = maxApparatus + maxOrder + maxQuestions + maxLimitations;
  const currentTotal = session.apparatusScore + session.methodOrderScore + session.methodQuestionsScore + session.limitationsScore;
  
  session.maxPossibleScore = totalMax;
  session.totalScore = currentTotal;
  
  const pct = totalMax > 0 ? (currentTotal / totalMax) * 100 : 0;
  if (pct >= 85) session.grade = 'Grade 9';
  else if (pct >= 75) session.grade = 'Grade 8';
  else if (pct >= 65) session.grade = 'Grade 7';
  else if (pct >= 55) session.grade = 'Grade 6';
  else if (pct >= 45) session.grade = 'Grade 5';
  else if (pct >= 35) session.grade = 'Grade 4 (Pass)';
  else session.grade = 'Working Towards';
}

// ----------------------------------------------------------------------------
// Assessment Mode Canvas Rendering
// ----------------------------------------------------------------------------

export function drawAssessmentMode(ctx, W, H, state, practicals, hit) {
  const practical = practicals[state.selected] || practicals[0];
  
  // Ensure session exists for this practical
  if (!state.assessmentSession || state.assessmentSession.practicalId !== practical.id) {
    state.assessmentSession = createAssessmentSession(practical);
  }
  const session = state.assessmentSession;
  
  // Clear full backdrop with dark slate theme
  ctx.save();
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 0, W, H);
  
  // Subtle top grid glow
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, 'rgba(8, 127, 117, 0.18)');
  grad.addColorStop(1, 'rgba(11, 29, 40, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 240);
  ctx.restore();

  // Top header bar (y = 0 to 68)
  drawAssessmentTopBar(ctx, W, H, session, practical, hit);
  
  // Main stage body (y = 68 to H)
  const bodyY = 70;
  const bodyH = H - bodyY;
  
  if (session.currentPhase === 'apparatus') {
    drawApparatusPhase(ctx, W, bodyY, bodyH, session, practical, hit);
  } else if (session.currentPhase === 'method') {
    drawMethodPhase(ctx, W, bodyY, bodyH, session, practical, hit);
  } else if (session.currentPhase === 'limitations') {
    drawLimitationsPhase(ctx, W, bodyY, bodyH, session, practical, hit);
  } else if (session.currentPhase === 'summary') {
    drawSummaryPhase(ctx, W, bodyY, bodyH, session, practical, hit);
  }
}

// Top Bar: Brand, Practical Selector, Phase Navigation Tabs, Score Pill, Exit
function drawAssessmentTopBar(ctx, W, H, session, practical, hit) {
  const barH = 66;
  rr(ctx, 0, 0, W, barH, 0, C.slate, 'rgba(255,255,255,0.08)', 1);
  
  // Brand / Mode badge
  text(ctx, 'GCSE SCIENCE PRACTICAL', 24, 23, 10.5, C.cyan, 800);
  text(ctx, 'ASSESSMENT MODE', 24, 43, 17, '#ffffff', 850);
  
  // Practical selector pill
  const pillX = 230;
  const pillW = Math.min(320, W * 0.24);
  rr(ctx, pillX, 14, pillW, 38, 19, 'rgba(255,255,255,0.07)', 'rgba(79, 195, 181, 0.35)');
  text(ctx, practical.icon, pillX + 20, 33, 15, '#ffffff', 800, 'center');
  const maxTitleW = pillW - 60;
  const truncatedTitle = practical.title.length > 26 ? `${practical.title.slice(0, 24)}…` : practical.title;
  text(ctx, truncatedTitle, pillX + 38, 33, 12, '#ffffff', 750);
  
  // Phase Tabs
  const phases = [
    { id: 'apparatus', label: '① Apparatus Setup' },
    { id: 'method', label: '② Method & Steps' },
    { id: 'limitations', label: '③ Limitations & Upgrades' },
    { id: 'summary', label: '④ Results & Score' }
  ];
  
  const tabsX = pillX + pillW + 18;
  const tabW = Math.min(150, Math.max(105, (W - tabsX - 250) / 4));
  
  phases.forEach((phase, idx) => {
    const tx = tabsX + idx * (tabW + 6);
    const isActive = session.currentPhase === phase.id;
    rr(ctx, tx, 16, tabW, 34, 8, isActive ? C.teal : 'rgba(255,255,255,0.05)', isActive ? C.cyan : 'rgba(255,255,255,0.1)');
    text(ctx, phase.label, tx + tabW / 2, 33, tabW < 125 ? 9.5 : 10.8, isActive ? '#ffffff' : C.line, 750, 'center');
    hit('assessment-phase-tab', tx, 16, tabW, 34, phase.id);
  });
  
  // Score indicator
  const scoreX = W - 220;
  rr(ctx, scoreX, 15, 105, 36, 18, 'rgba(8, 127, 117, 0.25)', C.teal);
  text(ctx, `Score: ${session.totalScore}/${session.maxPossibleScore || 20}`, scoreX + 52, 33, 11, C.cyan, 800, 'center');
  
  // Exit / Back to Lab button
  const exitX = W - 105;
  rr(ctx, exitX, 15, 85, 36, 18, 'rgba(201, 69, 59, 0.25)', C.red);
  text(ctx, '✕ EXIT LAB', exitX + 42, 33, 10.5, '#ffffff', 800, 'center');
  hit('assessment-exit', exitX, 15, 85, 36);
}

// ----------------------------------------------------------------------------
// Phase 1: Apparatus Selection & Bench Arrangement
// ----------------------------------------------------------------------------

function drawApparatusPhase(ctx, W, topY, bodyH, session, practical, hit) {
  const challenge = session.data.apparatusChallenge;
  const pad = 24;
  const contentW = W - pad * 2;
  
  // Instruction banner
  const bannerH = 58;
  rr(ctx, pad, topY + 12, contentW, bannerH, 12, C.slate, 'rgba(255,255,255,0.1)');
  text(ctx, 'ACTIVITY 1: APPARATUS SELECTION & PRACTICAL BENCH ARRANGEMENT', pad + 18, topY + 28, 11.5, C.cyan, 800);
  text(ctx, challenge.instruction, pad + 18, topY + 48, 11, C.line, 550);
  
  // Two columns: Left = Palette of equipment (select), Right = Workbench slots (arrange)
  const colY = topY + bannerH + 22;
  const colH = bodyH - bannerH - 36;
  const paletteW = Math.max(340, Math.min(460, contentW * 0.42));
  const benchW = contentW - paletteW - 18;
  const benchX = pad + paletteW + 18;
  
  // LEFT COLUMN: Equipment Selection Palette
  rr(ctx, pad, colY, paletteW, colH, 14, '#102431', 'rgba(255,255,255,0.1)');
  text(ctx, 'EQUIPMENT LIBRARY (SELECT REQUISITE APPARATUS)', pad + 18, colY + 20, 10.5, C.cyan, 800);
  text(ctx, 'Click items to include. Beware of realistic GCSE distractors!', pad + 18, colY + 36, 9.8, C.muted, 550);
  
  const itemH = 46;
  const itemGap = 7;
  const startListY = colY + 50;
  
  challenge.palette.forEach((item, idx) => {
    const iy = startListY + idx * (itemH + itemGap);
    if (iy + itemH > colY + colH - 12) return;
    
    const isSelected = session.selectedEquipment.has(item.id);
    const isAssigned = Object.values(session.slotAssignments).includes(item.id);
    
    let bg = isSelected ? 'rgba(8, 127, 117, 0.32)' : 'rgba(255,255,255,0.04)';
    let stroke = isSelected ? C.teal : 'rgba(255,255,255,0.12)';
    
    if (session.apparatusChecked) {
      if (isSelected && item.isCorrect) {
        bg = 'rgba(40, 135, 79, 0.35)';
        stroke = C.green;
      } else if (isSelected && !item.isCorrect) {
        bg = 'rgba(201, 69, 59, 0.35)';
        stroke = C.red;
      }
    }
    
    rr(ctx, pad + 14, iy, paletteW - 28, itemH, 9, bg, stroke, isSelected ? 1.5 : 1);
    
    // Icon badge
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(pad + 38, iy + itemH / 2, 15, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, item.icon, pad + 38, iy + itemH / 2, 14, '#ffffff', 800, 'center');
    
    // Label & Role
    text(ctx, item.name, pad + 62, iy + 16, 11, '#ffffff', 750);
    const roleText = session.apparatusChecked && !item.isCorrect ? `⚠️ Distractor: ${item.distractorReason}` : item.role;
    text(ctx, roleText, pad + 62, iy + 32, 9.5, session.apparatusChecked && !item.isCorrect ? '#ff9a90' : C.muted, 600);
    
    // Selection checkbox indicator
    const checkX = pad + paletteW - 42;
    rr(ctx, checkX, iy + 14, 18, 18, 5, isSelected ? C.teal : 'rgba(255,255,255,0.1)', isSelected ? C.cyan : 'rgba(255,255,255,0.3)');
    if (isSelected) {
      text(ctx, '✓', checkX + 9, iy + 23, 11, '#ffffff', 850, 'center');
    }
    
    hit('assessment-toggle-equipment', pad + 14, iy, paletteW - 28, itemH, item.id);
  });
  
  // RIGHT COLUMN: Virtual Workbench Arrangement Slots
  rr(ctx, benchX, colY, benchW, colH, 14, '#0d1f2b', 'rgba(255,255,255,0.1)');
  
  // Workbench header
  text(ctx, 'VIRTUAL APPARATUS BENCH (PHYSICAL SETUP)', benchX + 20, colY + 20, 10.5, C.cyan, 800);
  text(ctx, 'Assign selected equipment into functional positions from left to right.', benchX + 20, colY + 36, 9.8, C.muted, 550);
  
  const slotCount = challenge.slots.length;
  const slotH = Math.min(80, (colH - 180) / slotCount);
  const slotGap = 8;
  const slotStartY = colY + 52;
  
  challenge.slots.forEach((slot, idx) => {
    const sy = slotStartY + idx * (slotH + slotGap);
    const assignedId = session.slotAssignments[slot.id];
    const assignedItem = challenge.palette.find(p => p.id === assignedId);
    
    let slotBg = 'rgba(255,255,255,0.03)';
    let slotBorder = 'rgba(255,255,255,0.15)';
    
    if (session.apparatusChecked) {
      const isCorrectSlot = assignedId === slot.requiredItem;
      slotBg = isCorrectSlot ? 'rgba(40, 135, 79, 0.22)' : 'rgba(201, 69, 59, 0.22)';
      slotBorder = isCorrectSlot ? C.green : C.red;
    } else if (assignedItem) {
      slotBg = 'rgba(8, 127, 117, 0.22)';
      slotBorder = C.teal;
    }
    
    rr(ctx, benchX + 18, sy, benchW - 36, slotH, 10, slotBg, slotBorder, 1.2);
    
    // Position Number
    ctx.fillStyle = C.teal;
    ctx.beginPath();
    ctx.arc(benchX + 42, sy + slotH / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(idx + 1), benchX + 42, sy + slotH / 2, 11, '#ffffff', 800, 'center');
    
    // Slot details
    text(ctx, slot.label.toUpperCase(), benchX + 66, sy + 20, 10.5, C.cyan, 800);
    text(ctx, slot.hint, benchX + 66, sy + 38, 9.5, C.muted, 550);
    
    // Assigned item box or placeholder
    const assignBtnW = 185;
    const assignBtnX = benchX + benchW - assignBtnW - 30;
    const assignBtnY = sy + (slotH - 34) / 2;
    
    if (assignedItem) {
      rr(ctx, assignBtnX, assignBtnY, assignBtnW, 34, 7, 'rgba(8, 127, 117, 0.65)', C.cyan);
      text(ctx, `${assignedItem.icon} ${assignedItem.name}`, assignBtnX + 10, assignBtnY + 17, 9.5, '#ffffff', 700);
    } else {
      rr(ctx, assignBtnX, assignBtnY, assignBtnW, 34, 7, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.2)');
      text(ctx, '+ Click to Assign Selected', assignBtnX + assignBtnW / 2, assignBtnY + 17, 9.5, C.line, 650, 'center');
    }
    hit('assessment-slot-assign', assignBtnX, assignBtnY, assignBtnW, 34, slot.id);
  });
  
  // Bench Action Buttons: CHECK SETUP & PROCEED TO METHOD
  const bottomBarY = colY + colH - 68;
  rr(ctx, benchX + 18, bottomBarY, benchW - 36, 56, 10, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.1)');
  
  // Check button
  const checkW = 180;
  const checkX = benchX + 32;
  rr(ctx, checkX, bottomBarY + 10, checkW, 36, 8, C.teal, C.cyan);
  text(ctx, session.apparatusChecked ? '✓ SETUP EVALUATED' : 'CHECK APPARATUS SETUP', checkX + checkW / 2, bottomBarY + 28, 10.5, '#ffffff', 800, 'center');
  hit('assessment-check-apparatus', checkX, bottomBarY + 10, checkW, 36);
  
  // Marks awarded indicator
  if (session.apparatusChecked) {
    const maxMarks = challenge.slots.length + 2;
    text(ctx, `Marks: ${session.apparatusScore} / ${maxMarks}`, checkX + checkW + 24, bottomBarY + 28, 11.5, C.cyan, 800);
  }
  
  // Proceed to Step 2 button
  const nextW = 180;
  const nextX = benchX + benchW - nextW - 32;
  rr(ctx, nextX, bottomBarY + 10, nextW, 36, 8, 'rgba(8, 127, 117, 0.3)', C.teal);
  text(ctx, 'NEXT: METHOD STEPS →', nextX + nextW / 2, bottomBarY + 28, 10.5, '#ffffff', 800, 'center');
  hit('assessment-next-phase', nextX, bottomBarY + 10, nextW, 36, 'method');
}

// ----------------------------------------------------------------------------
// Phase 2: Method Step Sequencing & Scientific Reasoning Questions
// ----------------------------------------------------------------------------

function drawMethodPhase(ctx, W, topY, bodyH, session, practical, hit) {
  const challenge = session.data.methodChallenge;
  const pad = 24;
  const contentW = W - pad * 2;
  
  // Instruction banner
  const bannerH = 58;
  rr(ctx, pad, topY + 12, contentW, bannerH, 12, C.slate, 'rgba(255,255,255,0.1)');
  text(ctx, 'ACTIVITY 2: METHOD SEQUENCING & SCIENTIFIC REASONING QUESTIONS', pad + 18, topY + 28, 11.5, C.cyan, 800);
  text(ctx, 'Arrange the method steps in correct chronological order and answer targeted GCSE exam reasoning questions.', pad + 18, topY + 48, 11, C.line, 550);
  
  // Two columns: Left = Step sequencing, Right = Method reasoning questions
  const colY = topY + bannerH + 20;
  const colH = bodyH - bannerH - 34;
  const leftW = Math.max(380, Math.min(520, contentW * 0.46));
  const rightW = contentW - leftW - 18;
  const rightX = pad + leftW + 18;
  
  // LEFT COLUMN: Step Ordering
  rr(ctx, pad, colY, leftW, colH, 14, '#102431', 'rgba(255,255,255,0.1)');
  text(ctx, 'METHOD STEP SEQUENCING (CHRONOLOGICAL ORDER)', pad + 18, colY + 20, 10.5, C.cyan, 800);
  text(ctx, 'Use ▲ / ▼ buttons to arrange steps in order of execution.', pad + 18, colY + 36, 9.8, C.muted, 550);
  
  const stepCount = session.orderedStepIds.length;
  const cardH = Math.min(68, (colH - 140) / stepCount);
  const cardGap = 7;
  const stepStartY = colY + 50;
  
  session.orderedStepIds.forEach((stepId, idx) => {
    const sy = stepStartY + idx * (cardH + cardGap);
    const stepObj = challenge.scrambledSteps.find(s => s.id === stepId);
    const isCorrectPosition = session.methodOrderChecked && challenge.correctOrder[idx] === stepId;
    
    let bg = 'rgba(255,255,255,0.04)';
    let stroke = 'rgba(255,255,255,0.12)';
    if (session.methodOrderChecked) {
      bg = isCorrectPosition ? 'rgba(40, 135, 79, 0.25)' : 'rgba(201, 69, 59, 0.25)';
      stroke = isCorrectPosition ? C.green : C.red;
    }
    
    rr(ctx, pad + 14, sy, leftW - 28, cardH, 9, bg, stroke, 1);
    
    // Step number pill
    rr(ctx, pad + 24, sy + (cardH - 24) / 2, 24, 24, 6, C.teal);
    text(ctx, String(idx + 1), pad + 36, sy + cardH / 2, 11, '#ffffff', 800, 'center');
    
    // Step text
    const textW = leftW - 130;
    drawWrapped(ctx, stepObj?.text || '', pad + 56, sy + 12, textW, 9.5, '#ffffff', 600, 13, 3);
    
    // Up / Down reorder buttons
    const btnW = 24;
    const btnX = pad + leftW - 48;
    if (idx > 0) {
      rr(ctx, btnX, sy + 8, btnW, 20, 4, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.2)');
      text(ctx, '▲', btnX + 12, sy + 18, 9, '#ffffff', 800, 'center');
      hit('assessment-step-up', btnX, sy + 8, btnW, 20, idx);
    }
    if (idx < stepCount - 1) {
      rr(ctx, btnX, sy + cardH - 28, btnW, 20, 4, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.2)');
      text(ctx, '▼', btnX + 12, sy + cardH - 18, 9, '#ffffff', 800, 'center');
      hit('assessment-step-down', btnX, sy + cardH - 28, btnW, 20, idx);
    }
  });
  
  // Check Order button
  const orderBtnY = colY + colH - 56;
  const orderCheckW = 160;
  rr(ctx, pad + 14, orderBtnY, orderCheckW, 36, 8, C.teal, C.cyan);
  text(ctx, session.methodOrderChecked ? '✓ ORDER CHECKED' : 'CHECK STEP ORDER', pad + 14 + orderCheckW / 2, orderBtnY + 18, 10.5, '#ffffff', 800, 'center');
  hit('assessment-check-order', pad + 14, orderBtnY, orderCheckW, 36);
  
  if (session.methodOrderChecked) {
    text(ctx, `Order Score: ${session.methodOrderScore} / ${challenge.correctOrder.length}`, pad + 18 + orderCheckW + 15, orderBtnY + 18, 11, C.cyan, 800);
  }
  
  // RIGHT COLUMN: Scientific Reasoning Questions
  rr(ctx, rightX, colY, rightW, colH, 14, '#0d1f2b', 'rgba(255,255,255,0.1)');
  text(ctx, 'SCIENTIFIC REASONING & GCSE METHOD EXPLANATIONS', rightX + 20, colY + 20, 10.5, C.cyan, 800);
  text(ctx, 'Explain the scientific rationale behind key steps in the standard procedure.', rightX + 20, colY + 36, 9.8, C.muted, 550);
  
  const qList = challenge.reasoningQuestions;
  const qBoxH = Math.min(130, (colH - 130) / Math.max(1, qList.length));
  const qGap = 10;
  const qStartY = colY + 50;
  
  qList.forEach((q, qIdx) => {
    const qy = qStartY + qIdx * (qBoxH + qGap);
    if (qy + qBoxH > colY + colH - 58) return;
    
    rr(ctx, rightX + 16, qy, rightW - 32, qBoxH, 10, 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.1)');
    
    // Question Prompt
    text(ctx, `Q${qIdx + 1}:`, rightX + 26, qy + 16, 10.5, C.cyan, 800);
    drawWrapped(ctx, q.prompt, rightX + 50, qy + 10, rightW - 74, 9.8, '#ffffff', 650, 13, 2);
    
    // Multiple Choice Options
    const optStartY = qy + 36;
    const optH = 22;
    const optGap = 4;
    
    q.options.forEach((opt, optIdx) => {
      const oy = optStartY + optIdx * (optH + optGap);
      if (oy + optH > qy + qBoxH - 4) return;
      
      const isSelected = session.questionAnswers[q.id] === optIdx;
      let optBg = isSelected ? 'rgba(8, 127, 117, 0.35)' : 'rgba(255,255,255,0.04)';
      let optStroke = isSelected ? C.cyan : 'rgba(255,255,255,0.1)';
      
      if (session.methodQuestionsChecked) {
        if (opt.correct) {
          optBg = 'rgba(40, 135, 79, 0.4)';
          optStroke = C.green;
        } else if (isSelected && !opt.correct) {
          optBg = 'rgba(201, 69, 59, 0.4)';
          optStroke = C.red;
        }
      }
      
      rr(ctx, rightX + 24, oy, rightW - 48, optH, 5, optBg, optStroke, 1);
      
      // Option letter pill
      const letters = ['A', 'B', 'C', 'D'];
      text(ctx, letters[optIdx], rightX + 34, oy + optH / 2, 9, isSelected ? C.cyan : C.muted, 800);
      
      // Option text
      const optTextW = rightW - 80;
      const truncated = opt.text.length > 70 ? `${opt.text.slice(0, 68)}…` : opt.text;
      text(ctx, truncated, rightX + 50, oy + optH / 2, 9, '#ffffff', 600);
      
      hit('assessment-answer-option', rightX + 24, oy, rightW - 48, optH, { questionId: q.id, optionIndex: optIdx });
    });
  });
  
  // Right Column Bottom Actions
  const rightBottomY = colY + colH - 56;
  const checkQBtnW = 180;
  rr(ctx, rightX + 16, rightBottomY, checkQBtnW, 36, 8, C.teal, C.cyan);
  text(ctx, session.methodQuestionsChecked ? '✓ ANSWERS EVALUATED' : 'CHECK ANSWERS', rightX + 16 + checkQBtnW / 2, rightBottomY + 18, 10.5, '#ffffff', 800, 'center');
  hit('assessment-check-questions', rightX + 16, rightBottomY, checkQBtnW, 36);
  
  // Proceed to Limitations button
  const nextLimW = 200;
  const nextLimX = rightX + rightW - nextLimW - 16;
  rr(ctx, nextLimX, rightBottomY, nextLimW, 36, 8, 'rgba(8, 127, 117, 0.3)', C.teal);
  text(ctx, 'NEXT: LIMITATIONS & UPGRADES →', nextLimX + nextLimW / 2, rightBottomY + 18, 10, '#ffffff', 800, 'center');
  hit('assessment-next-phase', nextLimX, rightBottomY, nextLimW, 36, 'limitations');
}

// ----------------------------------------------------------------------------
// Phase 3: Addressing Limitations & Procedural Upgrades
// ----------------------------------------------------------------------------

function drawLimitationsPhase(ctx, W, topY, bodyH, session, practical, hit) {
  const challenges = session.data.limitationsChallenge;
  const pad = 24;
  const contentW = W - pad * 2;
  
  // Instruction banner
  const bannerH = 58;
  rr(ctx, pad, topY + 12, contentW, bannerH, 12, C.slate, 'rgba(255,255,255,0.1)');
  text(ctx, 'ACTIVITY 3: ADDRESSING LIMITATIONS & SELECTING PROCEDURAL UPGRADES', pad + 18, topY + 28, 11.5, C.cyan, 800);
  text(ctx, 'Evaluate limitations in standard procedures (e.g. gas collection apparatus, temperature ranges, sensors) and choose scientifically sound improvements.', pad + 18, topY + 48, 11, C.line, 550);
  
  const colY = topY + bannerH + 20;
  const colH = bodyH - bannerH - 34;
  const limCardCount = challenges.length;
  const cardW = (contentW - (limCardCount - 1) * 16) / limCardCount;
  
  challenges.forEach((lim, idx) => {
    const lx = pad + idx * (cardW + 16);
    rr(ctx, lx, colY, cardW, colH - 64, 14, '#0f2330', 'rgba(255,255,255,0.1)');
    
    // Header Badge
    rr(ctx, lx + 14, colY + 14, cardW - 28, 26, 6, 'rgba(224, 152, 30, 0.2)', C.yellow);
    text(ctx, `LIMITATION CHALLENGE ${idx + 1}`, lx + (cardW / 2), colY + 27, 9.5, C.yellow, 800, 'center');
    
    // Title
    text(ctx, lim.title, lx + 16, colY + 54, 12, '#ffffff', 800);
    
    // Scenario & Limitation description box
    const descH = 92;
    rr(ctx, lx + 14, colY + 68, cardW - 28, descH, 8, 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.08)');
    text(ctx, 'PROCEDURAL LIMITATION:', lx + 22, colY + 80, 9.2, C.orange, 800);
    drawWrapped(ctx, lim.limitation, lx + 22, colY + 92, cardW - 44, 9.5, C.line, 600, 13.5, 4);
    
    // Upgrade prompt
    const promptY = colY + 68 + descH + 12;
    text(ctx, 'CHOOSE EXPERIMENTAL UPGRADE:', lx + 16, promptY, 9.5, C.cyan, 800);
    
    // Selectable Upgrades
    const optStartY = promptY + 12;
    const optH = 68;
    const optGap = 8;
    
    lim.options.forEach((opt, optIdx) => {
      const oy = optStartY + optIdx * (optH + optGap);
      if (oy + optH > colY + colH - 74) return;
      
      const isSelected = session.limitationAnswers[lim.id] === optIdx;
      let bg = isSelected ? 'rgba(8, 127, 117, 0.35)' : 'rgba(255,255,255,0.04)';
      let stroke = isSelected ? C.cyan : 'rgba(255,255,255,0.12)';
      
      if (session.limitationsChecked) {
        if (opt.correct) {
          bg = 'rgba(40, 135, 79, 0.38)';
          stroke = C.green;
        } else if (isSelected && !opt.correct) {
          bg = 'rgba(201, 69, 59, 0.38)';
          stroke = C.red;
        }
      }
      
      rr(ctx, lx + 14, oy, cardW - 28, optH, 8, bg, stroke, isSelected ? 1.5 : 1);
      
      // Selector pill
      const radioX = lx + 26;
      const radioY = oy + 22;
      ctx.fillStyle = isSelected ? C.cyan : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(radioX, radioY, 7, 0, Math.PI * 2);
      ctx.fill();
      
      // Upgrade text
      drawWrapped(ctx, opt.text, lx + 42, oy + 8, cardW - 74, 9.5, '#ffffff', 750, 13, 2);
      // Advantage note
      drawWrapped(ctx, opt.advantage, lx + 42, oy + 36, cardW - 74, 8.8, isSelected ? C.cyan : C.muted, 550, 12, 2);
      
      hit('assessment-select-upgrade', lx + 14, oy, cardW - 28, optH, { limitationId: lim.id, optionIndex: optIdx });
    });
  });
  
  // Bottom Action Bar: Check Limitations & View Score
  const bottomY = colY + colH - 54;
  rr(ctx, pad, bottomY, contentW, 50, 10, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.1)');
  
  const checkLimW = 200;
  rr(ctx, pad + 16, bottomY + 7, checkLimW, 36, 8, C.teal, C.cyan);
  text(ctx, session.limitationsChecked ? '✓ UPGRADES EVALUATED' : 'CHECK UPGRADE CHOICES', pad + 16 + checkLimW / 2, bottomY + 25, 10.5, '#ffffff', 800, 'center');
  hit('assessment-check-limitations', pad + 16, bottomY + 7, checkLimW, 36);
  
  if (session.limitationsChecked) {
    const maxMarks = challenges.length * 3;
    text(ctx, `Limitations Score: ${session.limitationsScore} / ${maxMarks} marks`, pad + checkLimW + 36, bottomY + 25, 11, C.cyan, 800);
  }
  
  const summaryBtnW = 220;
  const summaryBtnX = pad + contentW - summaryBtnW - 16;
  rr(ctx, summaryBtnX, bottomY + 7, summaryBtnW, 36, 8, 'rgba(8, 127, 117, 0.45)', C.teal);
  text(ctx, 'VIEW FINAL GCSE SCORE & REPORT →', summaryBtnX + summaryBtnW / 2, bottomY + 25, 10.5, '#ffffff', 800, 'center');
  hit('assessment-next-phase', summaryBtnX, bottomY + 7, summaryBtnW, 36, 'summary');
}

// ----------------------------------------------------------------------------
// Phase 4: Final Assessment Summary & GCSE Grade Report
// ----------------------------------------------------------------------------

function drawSummaryPhase(ctx, W, topY, bodyH, session, practical, hit) {
  const pad = 24;
  const contentW = W - pad * 2;
  updateSessionTotals(session);
  
  // Top Banner
  const bannerH = 58;
  rr(ctx, pad, topY + 12, contentW, bannerH, 12, C.slate, 'rgba(255,255,255,0.1)');
  text(ctx, 'PRACTICAL SKILLS ASSESSMENT REPORT & GCSE GRADE CLASSIFICATION', pad + 18, topY + 28, 11.5, C.cyan, 800);
  text(ctx, `Comprehensive examiner breakdown for: ${practical.title} (${practical.subject.toUpperCase()})`, pad + 18, topY + 48, 11, C.line, 550);
  
  const cardY = topY + bannerH + 20;
  const cardH = bodyH - bannerH - 34;
  
  // Left Column: Grade Card & Score Breakdown
  const leftW = Math.max(340, Math.min(420, contentW * 0.38));
  const rightW = contentW - leftW - 18;
  const rightX = pad + leftW + 18;
  
  // GRADE CARD
  rr(ctx, pad, cardY, leftW, cardH, 14, '#102431', 'rgba(255,255,255,0.1)');
  
  // Grade Badge
  const gradeBadgeY = cardY + 24;
  const pct = session.maxPossibleScore > 0 ? Math.round((session.totalScore / session.maxPossibleScore) * 100) : 0;
  
  rr(ctx, pad + 24, gradeBadgeY, leftW - 48, 90, 12, 'rgba(8, 127, 117, 0.25)', C.teal);
  text(ctx, 'ESTIMATED GCSE GRADE', pad + (leftW / 2), gradeBadgeY + 20, 10, C.cyan, 800, 'center');
  text(ctx, session.grade, pad + (leftW / 2), gradeBadgeY + 48, 26, '#ffffff', 850, 'center');
  text(ctx, `Overall Result: ${session.totalScore} / ${session.maxPossibleScore} marks (${pct}%)`, pad + (leftW / 2), gradeBadgeY + 74, 11, C.line, 650, 'center');
  
  // Category Score Bars
  const scoreBreakdownY = gradeBadgeY + 112;
  text(ctx, 'SKILL DOMAIN BREAKDOWN:', pad + 24, scoreBreakdownY, 10.5, C.cyan, 800);
  
  const categories = [
    { name: 'Apparatus Selection & Setup', score: session.apparatusScore, max: session.data.apparatusChallenge.slots.length + 2 },
    { name: 'Method Step Sequencing', score: session.methodOrderScore, max: session.data.methodChallenge.correctOrder.length },
    { name: 'Scientific Method Reasoning', score: session.methodQuestionsScore, max: session.data.methodChallenge.reasoningQuestions.length * 2 },
    { name: 'Addressing Limitations & Upgrades', score: session.limitationsScore, max: session.data.limitationsChallenge.length * 3 }
  ];
  
  categories.forEach((cat, idx) => {
    const cy = scoreBreakdownY + 22 + idx * 46;
    const catPct = cat.max > 0 ? cat.score / cat.max : 0;
    
    text(ctx, cat.name, pad + 24, cy, 10, '#ffffff', 650);
    text(ctx, `${cat.score} / ${cat.max} marks`, pad + leftW - 24, cy, 10, C.cyan, 750, 'right');
    
    // Bar track
    rr(ctx, pad + 24, cy + 8, leftW - 48, 10, 5, 'rgba(255,255,255,0.08)');
    // Bar fill
    if (catPct > 0) {
      rr(ctx, pad + 24, cy + 8, (leftW - 48) * catPct, 10, 5, C.teal);
    }
  });
  
  // Left Column Actions: RETRY ASSESSMENT & RETURN TO LAB
  const leftActionsY = cardY + cardH - 100;
  const retryBtnW = leftW - 48;
  rr(ctx, pad + 24, leftActionsY, retryBtnW, 40, 9, C.teal, C.cyan);
  text(ctx, '🔄 RETRY THIS ASSESSMENT', pad + (leftW / 2), leftActionsY + 20, 11, '#ffffff', 800, 'center');
  hit('assessment-retry', pad + 24, leftActionsY, retryBtnW, 40);
  
  const returnBtnY = leftActionsY + 48;
  rr(ctx, pad + 24, returnBtnY, retryBtnW, 40, 9, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.2)');
  text(ctx, '🔬 RETURN TO SIMULATION LAB', pad + (leftW / 2), returnBtnY + 20, 11, '#ffffff', 750, 'center');
  hit('assessment-exit', pad + 24, returnBtnY, retryBtnW, 40);
  
  // RIGHT COLUMN: Model GCSE Answers & Examiner Guidance
  rr(ctx, rightX, cardY, rightW, cardH, 14, '#0d1f2b', 'rgba(255,255,255,0.1)');
  text(ctx, 'GCSE EXAMINER MARK SCHEME & MODEL ANSWERS', rightX + 22, cardY + 22, 11, C.cyan, 800);
  text(ctx, 'Key scientific justifications required to achieve Grade 8–9 marks.', rightX + 22, cardY + 38, 9.8, C.muted, 550);
  
  const reviewStartY = cardY + 54;
  const reviewH = 88;
  const reviewGap = 10;
  
  // Show key model answers
  const modelItems = [
    {
      title: 'Apparatus Rationale & Upgrades',
      content: session.data.limitationsChallenge[0]?.markScheme || 'Use calibrated sensors and gas-tight syringes to quantify gas volume and remove human reaction time.'
    },
    {
      title: 'Method Variable Controls',
      content: 'Maintain temperature with a thermostatically controlled water bath. Use identical reagent volumes and concentrations across all trials.'
    },
    {
      title: 'Addressing Experimental Limitations',
      content: session.data.limitationsChallenge[1]?.markScheme || 'Test at least 5 values across a wide range at regular intervals to accurately define the optimum response curve.'
    },
    {
      title: 'Repeatability & Anomalies',
      content: 'Conduct at least 3 repeats at each condition. Discard any obvious anomalies and calculate a concordant mean.'
    }
  ];
  
  modelItems.forEach((item, idx) => {
    const ry = reviewStartY + idx * (reviewH + reviewGap);
    if (ry + reviewH > cardY + cardH - 14) return;
    
    rr(ctx, rightX + 18, ry, rightW - 36, reviewH, 10, 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.1)');
    
    // Check circle
    ctx.fillStyle = C.teal;
    ctx.beginPath();
    ctx.arc(rightX + 38, ry + 26, 12, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, '✓', rightX + 38, ry + 26, 10, '#ffffff', 800, 'center');
    
    text(ctx, item.title.toUpperCase(), rightX + 58, ry + 26, 10, C.cyan, 800);
    drawWrapped(ctx, item.content, rightX + 58, ry + 42, rightW - 84, 9.5, '#ffffff', 550, 13.5, 3);
  });
}

// ----------------------------------------------------------------------------
// Pointer / Hit Event Handling
// ----------------------------------------------------------------------------

export function handleAssessmentPointerDown(region, point, state, practicals, draw) {
  if (!state.assessmentSession) return false;
  const session = state.assessmentSession;
  
  switch (region.id) {
    case 'assessment-phase-tab':
      session.currentPhase = region.data;
      draw();
      return true;
      
    case 'assessment-exit':
      state.assessmentMode = false;
      draw();
      return true;
      
    case 'assessment-toggle-equipment': {
      const itemId = region.data;
      if (session.selectedEquipment.has(itemId)) {
        session.selectedEquipment.delete(itemId);
        // Also remove from any slot assignment
        for (const slotKey in session.slotAssignments) {
          if (session.slotAssignments[slotKey] === itemId) {
            delete session.slotAssignments[slotKey];
          }
        }
      } else {
        session.selectedEquipment.add(itemId);
      }
      session.apparatusChecked = false;
      draw();
      return true;
    }
    
    case 'assessment-slot-assign': {
      const slotId = region.data;
      // Cycle through selected equipment to assign to this slot
      const selectedList = Array.from(session.selectedEquipment);
      if (selectedList.length === 0) {
        state.toast = 'Select equipment from the left library first, then assign it here.';
        draw();
        return true;
      }
      const currentAssigned = session.slotAssignments[slotId];
      const curIdx = selectedList.indexOf(currentAssigned);
      const nextItem = selectedList[(curIdx + 1) % (selectedList.length + 1)];
      if (nextItem) {
        session.slotAssignments[slotId] = nextItem;
      } else {
        delete session.slotAssignments[slotId];
      }
      session.apparatusChecked = false;
      draw();
      return true;
    }
    
    case 'assessment-check-apparatus':
      checkApparatusPhase(session);
      draw();
      return true;
      
    case 'assessment-next-phase':
      session.currentPhase = region.data;
      draw();
      return true;
      
    case 'assessment-step-up': {
      const idx = region.data;
      if (idx > 0) {
        const temp = session.orderedStepIds[idx];
        session.orderedStepIds[idx] = session.orderedStepIds[idx - 1];
        session.orderedStepIds[idx - 1] = temp;
        session.methodOrderChecked = false;
        draw();
      }
      return true;
    }
    
    case 'assessment-step-down': {
      const idx = region.data;
      if (idx < session.orderedStepIds.length - 1) {
        const temp = session.orderedStepIds[idx];
        session.orderedStepIds[idx] = session.orderedStepIds[idx + 1];
        session.orderedStepIds[idx + 1] = temp;
        session.methodOrderChecked = false;
        draw();
      }
      return true;
    }
    
    case 'assessment-check-order':
      checkMethodPhase(session);
      draw();
      return true;
      
    case 'assessment-answer-option': {
      const { questionId, optionIndex } = region.data;
      session.questionAnswers[questionId] = optionIndex;
      session.methodQuestionsChecked = false;
      draw();
      return true;
    }
    
    case 'assessment-check-questions':
      checkMethodPhase(session);
      draw();
      return true;
      
    case 'assessment-select-upgrade': {
      const { limitationId, optionIndex } = region.data;
      session.limitationAnswers[limitationId] = optionIndex;
      session.limitationsChecked = false;
      draw();
      return true;
    }
    
    case 'assessment-check-limitations':
      checkLimitationsPhase(session);
      draw();
      return true;
      
    case 'assessment-retry': {
      const practical = practicals[state.selected] || practicals[0];
      state.assessmentSession = createAssessmentSession(practical);
      draw();
      return true;
    }
  }
  
  return false;
}

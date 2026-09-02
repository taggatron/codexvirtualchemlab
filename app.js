import { drawThermalBenchScene } from './thermalview.js?v=20260823-1';
import * as assessment from './assessment.js?v=20260902-1';
const canvas = document.getElementById('lab'), visibleCtx = canvas.getContext('2d'), buffer = document.createElement('canvas'), webglCanvas = document.getElementById('webgl');

// Keep the catalogue and 2D interface interactive while the considerably larger
// Three.js renderer downloads and initialises. This facade preserves the renderer
// contract while WebGL warms in the background.
class DeferredLabRenderer {
  constructor(target) {
    this.canvas = target; this.impl = null; this.loading = null; this.idleHandle = 0; this.preloadTimer = 0;
    this.resizeArgs = null; this.lastRenderArgs = null; this.pendingSignature = '';
    target.style.visibility = 'hidden';
  }
  ensureLoaded() {
    if (this.impl) return Promise.resolve(this.impl);
    if (this.loading) return this.loading;
    if (this.preloadTimer) clearTimeout(this.preloadTimer);
    if (this.idleHandle && 'cancelIdleCallback' in window) cancelIdleCallback(this.idleHandle);
    this.preloadTimer = 0; this.idleHandle = 0;
    this.loading = import(`./lab3d.js?v=20260830-5`).then(({ LabRenderer3D }) => {
      const renderer = new LabRenderer3D(this.canvas);
      renderer.signature = this.pendingSignature;
      this.impl = renderer;
      if (this.resizeArgs) renderer.resize(...this.resizeArgs);
      if (this.lastRenderArgs) renderer.render(...this.lastRenderArgs);
      this.canvas.dispatchEvent(new CustomEvent('lab3dneedsredraw'));
      return renderer;
    }).catch(error => {
      console.warn('The 3D practical renderer could not be loaded; retaining the 2D interface.', error);
      return null;
    });
    return this.loading;
  }
  preload() {
    if (this.impl || this.loading || this.idleHandle || this.preloadTimer) return;
    // Leave a clear paint opportunity before starting WebGL and shader work.
    // The first pointer interaction bypasses this delay via ensureLoaded().
    this.preloadTimer = setTimeout(() => {
      this.preloadTimer = 0;
      if ('requestIdleCallback' in window) this.idleHandle = requestIdleCallback(() => this.ensureLoaded(), { timeout: 1000 });
      else this.ensureLoaded();
    }, 250);
  }
  resize(...args) { this.resizeArgs = args; this.impl?.resize(...args) }
  render(...args) { this.lastRenderArgs = args; if (this.impl) this.impl.render(...args); else this.preload() }
  projectToScreen(...args) { return this.impl?.projectToScreen(...args) || null }
  posFromScreen(...args) { return this.impl?.posFromScreen(...args) || null }
  advanceBunsenLoad(...args) { return this.impl?.advanceBunsenLoad(...args) || false }
  bunsenLoadState() { return this.impl?.bunsenLoadState() || null }
  get available() { return !!this.impl?.available }
  get info() { return this.impl?.info || { enabled: false, renderer: this.loading ? 'WebGL / Three.js loading' : 'deferred', objects: 0, context_lost: false, scene_compiling: !!this.loading, scene_warmup_frames: 0, canvas_visible: false } }
  get isTransitioning() { return !!this.impl?.isTransitioning }
  get bunsenTransitionActive() { return !!this.impl?.bunsenTransitionActive }
  get thermiteGlowFraction() { return this.impl?.thermiteGlowFraction || 0 }
  get osmosisRotationState() { return this.impl?.osmosisRotationState || null }
  get pourAlignment() { return this.impl?.pourAlignment || null }
  get antibioticPreparationState() { return this.impl?.antibioticPreparationState || null }
  get antibioticSwabTipState() { return this.impl?.antibioticSwabTipState || null }
  get signature() { return this.impl?.signature ?? this.pendingSignature }
  set signature(value) { this.pendingSignature = value; if (this.impl) this.impl.signature = value }
}

const lab3d = new DeferredLabRenderer(webglCanvas); let ctx = buffer.getContext('2d');
webglCanvas.addEventListener('lab3dneedsredraw', () => requestAnimationFrame(() => draw()));
canvas.addEventListener('pointerdown', () => lab3d.ensureLoaded(), { capture: true, once: true, passive: true });
const C = { navy: '#102a3a', ink: '#17313e', muted: '#657881', teal: '#087f75', cyan: '#4fc3b5', paper: '#f7f8f6', line: '#d8e0e2', orange: '#e48b35', red: '#b94b44', blue: '#3c78a8' };
const practicals = [
  { id: 'free', subject: 'chemistry', icon: '✦', color: '#6d5bd0', title: 'Free workspace', sub: 'Build your own experiment', objective: 'Choose equipment from the library and arrange your own practical.', eq: 'Your workspace — explore safely and build a setup.', word: '', steps: [], gear: [], reactants: [] },
  { id: 'rates', subject: 'chemistry', icon: '⏱', color: '#e89a35', title: 'Rates of reaction', sub: 'Sodium thiosulfate', objective: 'Measure how temperature changes reaction rate.', eq: 'Na₂S₂O₃(aq) + 2HCl(aq) → 2NaCl(aq) + SO₂(g) + S(s) + H₂O(l)', word: 'sodium thiosulfate + hydrochloric acid → sodium chloride + sulfur dioxide + sulfur + water', steps: ['Add sodium thiosulfate', 'Set the temperature', 'Add hydrochloric acid', 'Watch the cross disappear'], gear: ['Conical flask', 'Cross tile', 'Stopwatch'], reactants: ['Thiosulfate', 'Hydrochloric acid'] },
  { id: 'temp', subject: 'chemistry', icon: '🌡', color: '#d85f58', title: 'Temperature changes', sub: 'Neutralisation', objective: 'Record the temperature profile of neutralisation.', eq: 'H⁺(aq) + OH⁻(aq) → H₂O(l)', word: 'hydrochloric acid + sodium hydroxide → sodium chloride + water', steps: ['Add sodium hydroxide', 'Insert thermometer', 'Add hydrochloric acid', 'Record maximum temperature'], gear: ['Polystyrene cup', 'Thermometer', 'Measuring cylinder'], reactants: ['Sodium hydroxide', 'Hydrochloric acid'] },
  { id: 'titration', subject: 'chemistry', icon: '↧', color: '#c2578c', title: 'Acid–alkali titration', sub: 'Find an accurate titre', objective: 'Measure the volume of sodium hydroxide that exactly neutralises 25.0 cm³ of hydrochloric acid.', eq: 'HCl(aq) + NaOH(aq) → NaCl(aq) + H₂O(l)', word: 'hydrochloric acid + sodium hydroxide → sodium chloride + water', steps: ['Fill the burette with NaOH', 'Add phenolphthalein to HCl', 'Run to near the endpoint', 'Add NaOH dropwise to pale pink'], gear: ['50 cm³ burette', 'Clamp stand + boss', 'Burette clamp', 'Conical flask + white tile'], reactants: ['0.100 mol dm⁻³ NaOH', '25.0 cm³ HCl', 'Phenolphthalein'] },
  { id: 'salts', subject: 'chemistry', icon: '◇', color: '#308bc1', title: 'Preparing a salt', sub: 'Copper sulfate crystals', objective: 'Prepare pure, dry copper sulfate crystals.', eq: 'CuO(s) + H₂SO₄(aq) → CuSO₄(aq) + H₂O(l)', word: 'copper oxide + sulfuric acid → copper sulfate + water', steps: ['Warm sulfuric acid', 'Add copper oxide to excess', 'Filter the mixture', 'Evaporate and crystallise'], gear: ['Beaker', 'Filter funnel', 'Evaporating basin'], reactants: ['Sulfuric acid', 'Copper oxide'] },
  { id: 'mass', subject: 'chemistry', icon: '⚖', color: '#7c62b8', title: 'Conservation of mass', sub: 'Burn magnesium', objective: 'Compare mass before and after magnesium reacts with oxygen.', eq: '2Mg(s) + O₂(g) → 2MgO(s)', word: 'magnesium + oxygen → magnesium oxide', steps: ['Weigh Mg and crucible', 'Transfer to the gauze', 'Remove lid and heat Mg', 'Cool and reweigh'], gear: ['Balance', 'Crucible', 'Tripod', 'Bunsen burner'], reactants: ['Magnesium ribbon', 'Oxygen'] },
  { id: 'hydrogen', subject: 'chemistry', icon: '✹', color: '#e45d4f', title: 'Hydrogen squeaky pop test', sub: 'Test a reaction gas', objective: 'Generate hydrogen in a test tube and confirm it with a lit splint.', eq: 'Mg(s) + 2HCl(aq) → MgCl₂(aq) + H₂(g)', word: 'magnesium + hydrochloric acid → magnesium chloride + hydrogen', steps: ['Place Mg ribbon in test tube', 'Add dilute hydrochloric acid', 'Trap hydrogen with your thumb', 'Test with a lit splint'], gear: ['Test tube', 'Plastic cylinder', 'Magnesium ribbon', 'Lit splint'], reactants: ['Magnesium ribbon', 'Dilute hydrochloric acid'] },
  { id: 'co2', subject: 'chemistry', icon: '◉', color: '#4c8da8', title: 'Carbon dioxide test', sub: 'Bubble through limewater', objective: 'Confirm carbon dioxide using limewater.', eq: 'CO₂(g) + Ca(OH)₂(aq) → CaCO₃(s) + H₂O(l)', word: 'carbon dioxide + calcium hydroxide → calcium carbonate + water', steps: ['React carbonate with acid', 'Fit one-hole bungs and tube', 'Bubble below the limewater surface', 'Observe the milky precipitate'], gear: ['Two conical flasks', 'One-hole bungs', 'Delivery tube'], reactants: ['Calcium carbonate', 'Hydrochloric acid', 'Limewater'] },
  { id: 'electro', subject: 'chemistry', icon: '⚡', color: '#815bb4', title: 'Electrolysis', sub: 'Copper chloride', objective: 'Identify products formed at inert electrodes.', eq: 'Cu²⁺(aq) + 2Cl⁻(aq) → Cu(s) + Cl₂(g)', word: 'copper chloride → copper + chlorine', steps: ['Add copper chloride solution', 'Attach crocodile clips to the electrodes', 'Switch on the 6 V DC power pack', 'Remove, dry and reweigh the cathode'], gear: ['Graphite electrodes', 'Crocodile clips + leads', '6 V DC power pack', 'Electronic balance'], reactants: ['Copper chloride', 'Litmus paper'] },
  { id: 'flame', subject: 'chemistry', icon: '♨', color: '#e45845', title: 'Flame tests', sub: 'Identify metal ions', objective: 'Identify metal ions from their characteristic flame colours and absorption bands.', eq: 'M⁺(excited) → M⁺ + light', word: 'heated metal ions release characteristic wavelengths of visible light', steps: ['Choose a metallic salt', 'Scoop a small sample onto the spatula', 'Move the spatula into the roaring blue flame', 'Identify the colour and compare its spectrum'], gear: ['Metal spatula', 'Bunsen burner', 'Salt sample jars', 'Safety glasses'], reactants: ['Lithium chloride', 'Sodium chloride', 'Potassium chloride', 'Calcium chloride', 'Copper(II) chloride'] },
  { id: 'displacement', subject: 'chemistry', icon: '⇄', color: '#b96f3e', title: 'Metal displacement', sub: 'Reactivity in test tubes', objective: 'Compare how more reactive metals displace less reactive metals from their salt solutions.', eq: 'Zn(s) + CuSO₄(aq) → ZnSO₄(aq) + Cu(s)', word: 'zinc + copper sulfate → zinc sulfate + copper', steps: ['Label four test tubes and add salt solutions', 'Clean equal-sized metal strips', 'Lower each metal into its solution', 'Compare coatings and colour changes'], gear: ['Test-tube rack', '4 test tubes', 'Metal strips', 'Safety glasses'], reactants: ['Magnesium + CuSO₄', 'Zinc + CuSO₄', 'Iron + CuSO₄', 'Copper + AgNO₃'] },
  { id: 'alkali', subject: 'chemistry', icon: '◒', color: '#8d4d93', title: 'Alkali metals in water', sub: 'Lithium, sodium & potassium', objective: 'Compare the reactions of alkali metals with water in a protected simulation.', eq: '2M(s) + 2H₂O(l) → 2MOH(aq) + H₂(g)', word: 'alkali metal + water → metal hydroxide + hydrogen', steps: ['Check the water trough and safety screen', 'Use forceps to lower one tiny metal sample', 'Observe hydrogen bubbles, movement and flame colour', 'Record the increasing reactivity from lithium to potassium'], gear: ['Covered water trough', 'Safety screen', 'Forceps', 'Universal indicator'], reactants: ['Lithium sample', 'Sodium sample', 'Potassium sample'] },
  { id: 'chrom', subject: 'chemistry', icon: '🎨', color: '#dc6b83', title: 'Chromatography', sub: 'Separate food dyes', objective: 'Separate dyes and calculate Rf values.', eq: 'Rf = distance travelled by substance ÷ distance travelled by solvent', word: 'mixture of food dyes → separated dye components (physical separation)', steps: ['Spot dyes on pencil line', 'Add shallow solvent', 'Place paper in beaker', 'Calculate Rf values'], gear: ['Chromatography paper', 'Capillary tube', 'Beaker'], reactants: ['Food dye', 'Water'] },
  { id: 'water', subject: 'chemistry', icon: '💧', color: '#2d91c3', title: 'Water purification', sub: 'Analyse and distil', objective: 'Compare water samples and obtain pure water.', eq: 'H₂O(l) → H₂O(g) → H₂O(l)', word: 'liquid water → water vapour → liquid water (change of state)', steps: ['Measure and filter the sample', 'Run cooling water into the lower condenser inlet', 'Switch on the electric heating mantle', 'Collect and test the distillate'], gear: ['Round-bottom flask', 'Glass distillation column', 'Water-cooled condenser', 'Electric heating mantle'], reactants: ['Water sample', 'Universal indicator'] },
  { id: 'thermite', subject: 'chemistry', icon: '✺', color: '#d95b2f', title: 'Thermite demonstration', sub: 'Extreme exothermic reaction', objective: 'Observe a highly exothermic displacement reaction from behind a protective screen.', eq: 'Fe₂O₃(s) + 2Al(s) → 2Fe(l) + Al₂O₃(s)', word: 'iron(III) oxide + aluminium → molten iron + aluminium oxide', steps: ['Check the shield and sand containment', 'Aim the small blow torch from a safe distance', 'Ignite the magnesium fuse remotely', 'Observe sparks and molten iron behind the shield'], gear: ['Glass safety screen', 'Sand-filled metal can', 'Refractory reaction cup', 'Small blow torch'], reactants: ['Sealed thermite charge', 'Magnesium fuse'] },
  { id: 'starchleaf', subject: 'biology', icon: '🍃', color: '#3f8f4f', title: 'Test a leaf for starch', sub: 'Photosynthesis evidence', objective: 'Test a leaf for stored starch using hot water, ethanol and iodine solution.', eq: 'starch + iodine → blue-black starch–iodine complex', word: 'iodine changes from orange-brown to blue-black where starch is present', steps: ['Boil the leaf in water', 'Heat it in ethanol using a water bath', 'Rinse and spread it on a white tile', 'Add iodine and observe blue-black'], gear: ['Forceps', 'Hot-water beaker', 'Ethanol tube + water bath', 'White tile + dropping pipette'], reactants: ['Fresh green leaf', 'Ethanol', 'Iodine solution'] },
  { id: 'lipase', subject: 'biology', icon: '◌', color: '#d85c91', title: 'Lipase & milk temperature', sub: 'Enzyme activity', objective: 'Investigate how temperature affects lipase digestion of fat in milk.', eq: 'lipid + water —(lipase)→ fatty acids + glycerol', word: 'milk fat + water —(lipase)→ fatty acids + glycerol', steps: ['Condition milk mixture in a water bath', 'Add the same volume of lipase', 'Time the pink indicator turning colourless', 'Repeat at five temperatures'], gear: ['Electric water bath', 'Test tube + rack', 'Dropping pipette', 'Digital stopwatch'], reactants: ['Milk + sodium carbonate', 'Phenolphthalein', 'Lipase solution'] },
  { id: 'transformation', subject: 'biology', icon: '🧬', color: '#5b55a5', title: 'Bacterial transformation', sub: 'Plasmids, selection & GFP', objective: 'Model genetic engineering by transforming safe teaching-strain bacteria with a GFP plasmid and testing antibiotic selection and gene expression.', eq: 'plasmid DNA + competent bacterium → transformed bacterium', word: 'a bacterial cell takes up a plasmid carrying ampicillin resistance and an arabinose-controlled green fluorescent protein gene', steps: ['Label matched +DNA and −DNA controls, then add competent bacteria', 'Add GFP plasmid to +DNA only and keep both tubes ice-cold', 'Heat shock, return to ice, then add LB broth for recovery', 'Inoculate matched LB, LB/amp and LB/amp/ara agar plates', 'Incubate the sealed plates and compare growth under blue light'], gear: ['Sterile microtubes + adjustable P20 micropipette', 'Sterile-tip rack + used-tip waste cup', 'Ice bath + 42 °C heat block', 'Four sealed agar plates', 'Blue-light viewer'], reactants: ['Teaching-strain E. coli', 'GFP plasmid DNA', 'LB recovery broth', 'Ampicillin + arabinose agar'] },
  { id: 'respiration', subject: 'biology', icon: '◍', color: '#a462ba', title: 'Anaerobic respiration in yeast', sub: 'Temperature & carbon dioxide', objective: 'Investigate how temperature affects anaerobic respiration in equal yeast-and-sugar mixtures.', eq: 'C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂', word: 'glucose → ethanol + carbon dioxide', steps: ['Add the same mass of glucose to five labelled flasks', 'Add equal volumes of yeast suspension and fit identical balloons', 'Place the flasks in 10–60 °C water baths for the same 10 minutes', 'Compare balloon inflation and record the carbon dioxide volume'], gear: ['5 conical flasks + balloons', '5 thermostatic water baths', 'Measuring cylinder', 'Digital 10-minute timer'], reactants: ['Glucose powder', 'Yeast suspension', 'Warm water'] },
  { id: 'antibiotics', subject: 'biology', icon: '⊙', color: '#397f84', title: 'Antibiotic disc efficacy', sub: 'Bacillus subtilis & asepsis', objective: 'Compare how effectively different antibiotic discs inhibit Bacillus subtilis on nutrient agar using aseptic technique.', eq: 'zone diameter / mm = widest clear diameter through the centre of each disc', word: 'a larger zone of inhibition shows greater inhibition of bacterial growth under the controlled test conditions', steps: ['Disinfect beneath the lifted plate, dispose of the wipe, then flip and mark four sectors on the outside of the base', 'Spread Bacillus subtilis evenly while opening the Petri-dish lid as little as possible, then discard the swab safely', 'Place coded antibiotic and sterile-water control discs with sterile forceps', 'Cross-tape, invert and incubate the plate at 25 °C for 48 hours', 'Measure each clear inhibition zone through the disc centre and compare efficacy'], gear: ['Nutrient-agar Petri dish', 'Sterile swab + forceps', 'Bunsen burner (safety flame)', 'Black marker + metric ruler'], reactants: ['Bacillus subtilis culture', 'Antibiotic discs', '70% IMS surface disinfectant'] },
  { id: 'osmosis', subject: 'biology', icon: '▥', color: '#b67b42', title: 'Osmosis in potato tissue', sub: 'Sucrose concentration', objective: 'Investigate how sucrose concentration affects the mass of equal potato cylinders.', eq: '% change in mass = (final mass − initial mass) ÷ initial mass × 100', word: 'water moves through partially permeable cell membranes from a dilute solution to a more concentrated solution', steps: ['Measure equal potato cylinders and record initial mass', 'Immerse each chip in an equal volume of sucrose solution', 'Leave for the same time, then remove and blot dry', 'Reweigh and calculate percentage change in mass'], gear: ['Electronic balance', '100 cm³ beaker', 'Forceps', 'Blotting paper'], reactants: ['0.0–0.8 mol dm⁻³ sucrose', 'Equal potato cylinders', 'Distilled water'] },
  { id: 'agardiffusion', subject: 'biology', icon: '◫', color: '#c64882', title: 'Agar cube diffusion', sub: 'Surface area to volume ratio', objective: 'Investigate how agar-cube size affects the proportion reached by diffusion in a fixed time.', eq: 'percentage diffused = (total cube volume − pink core volume) ÷ total cube volume × 100', word: 'hydrochloric acid diffuses into alkaline phenolphthalein agar and turns the penetrated region colourless', steps: ['Measure the sides of 1 cm, 2 cm and 3 cm pink alkaline agar cubes', 'Lower each cube into the same volume and concentration of dilute hydrochloric acid', 'Leave all cubes immersed for the same 10 minutes', 'Remove, blot and cut each cube; measure the pink core and calculate percentage diffused'], gear: ['3 labelled acid beakers', 'Metric ruler + forceps', 'Digital timer', 'Cutting tile + scalpel'], reactants: ['Phenolphthalein alkaline agar cubes', 'Dilute hydrochloric acid', 'Blotting paper'] },
  { id: 'potometer', subject: 'biology', icon: '♧', color: '#2f8d73', title: 'Bubble potometer', sub: 'Wind & transpiration', objective: 'Investigate how wind speed affects water uptake by a leafy shoot using a bubble potometer.', eq: 'rate of water uptake = distance moved by air bubble ÷ time', word: 'water absorbed by the shoot replaces water lost from the leaves by transpiration', steps: ['Cut the leafy shoot underwater and seal it into a water-filled potometer', 'Introduce one air bubble and use the refiller to align it with zero', 'Expose the shoot to a measured wind speed for 5 minutes', 'Record bubble speed, reset and repeat at four wind speeds'], gear: ['Bubble potometer', 'Leafy shoot + bung', 'Refiller + stopcock', 'Desk fan + anemometer'], reactants: ['Fresh leafy shoot', 'Water', 'Petroleum jelly seal'] },
  { id: 'pondweed', subject: 'biology', icon: '🌿', color: '#2e7d32', title: 'Light intensity & pondweed', sub: 'Photosynthesis rate', objective: 'Investigate how light intensity affects the rate of photosynthesis in pondweed by measuring oxygen bubble production.', eq: '6CO₂ + 6H₂O —(light)→ C₆H₁₂O₆ + 6O₂', word: 'carbon dioxide + water —(light)→ glucose + oxygen', steps: ['Place pondweed in NaHCO₃ solution', 'Measure 10–50 cm from the beaker edge', 'Switch on the filament lamp to acclimatise', 'Count oxygen bubbles produced in 1 minute'], gear: ['Beaker', 'Boiling tube + pondweed', 'Funnel', 'Filament desk lamp', 'Meter ruler'], reactants: ['NaHCO₃ solution', 'Elodea pondweed', 'Water'] },
  { id: 'quadrats', subject: 'biology', icon: '▦', color: '#3b8b52', title: 'Random quadrat sampling', sub: 'Daisy population estimate', objective: 'Estimate daisy abundance in a meadow using unbiased random coordinates and repeated quadrat samples.', eq: 'estimated population = mean count × habitat area ÷ quadrat area', word: 'random quadrat samples provide an unbiased estimate of abundance across the whole habitat', steps: ['Measure out a 10 m × 10 m grid using two tape measures', 'Generate a random grid coordinate without choosing a favourable patch', 'Place the 1 m² quadrat at that coordinate', 'Count daisies rooted inside using one consistent edge rule', 'Repeat five times, calculate a mean and estimate the population'], gear: ['1 m² gridded quadrat', '10 m × 10 m grid', 'Random coordinate generator', 'Field tally counter'], reactants: ['Living grass turf', 'Daisy plants', 'Soil habitat'] },
  { id: 'capture', subject: 'biology', icon: '🪲', color: '#8b5a2b', title: 'Mark-release-recapture', sub: 'Animal population estimate', objective: 'Estimate a mobile animal population using pitfall traps and the Lincoln Index.', eq: 'population = (first catch × second catch) ÷ marked recaptured', word: 'a sample is captured, marked, released, and a second sample is captured to estimate population size', steps: ['Set pitfall traps overnight', 'Count the total number caught in the first sample and mark them', 'Release the marked animals back into the habitat and wait 24 hours', 'Recapture and count the total number caught and the number of marked recaptures'], gear: ['Pitfall traps', 'Non-toxic marker', 'Magnifying glass'], reactants: ['Ground beetles', 'Soil habitat'] },
  { id: 'shoretransect', subject: 'biology', icon: '≋', color: '#297f86', title: 'Rocky-shore belt transect', sub: 'Strata & species zonation', objective: 'Compare organism distribution through upper, middle and lower shore strata using a belt transect.', eq: '% cover = occupied grid squares ÷ total grid squares × 100', word: 'systematic quadrats along a shore gradient reveal changes in abundance and percentage cover', steps: ['Lay a belt transect from the upper shore towards the low-water mark', 'Place equal-area quadrats at fixed 2 m intervals in each shore stratum', 'Identify organisms and estimate percentage cover using the grid', 'Record six stations and compare zonation with distance down the shore'], gear: ['10 m tape measure', '1 m² gridded quadrat', 'Species identification key', 'Tide table + tally sheet'], reactants: ['Barnacles and limpets', 'Brown seaweed', 'Rock-pool habitat'] },
  { id: 'ripple', subject: 'physics', icon: '∿', color: '#1687ad', title: 'Wave speed in a ripple tank', sub: 'v = fλ water waves', objective: 'Measure water-wave speed from frequency and wavelength in a level ripple tank.', eq: 'v = fλ', word: 'wave speed (m s⁻¹) = frequency (Hz) × wavelength (m)', steps: ['Check that the ripple tank contains shallow water of constant depth and is level', 'Drive the straight dipper at a known frequency to produce plane wavefronts', 'Synchronise the strobe and measure the distance across ten wavelengths', 'Divide by ten, convert to metres, calculate v = fλ and repeat at five frequencies'], gear: ['Transparent ripple tank + levelling feet', 'Straight dipper + vibration motor', 'Signal generator + LED strobe', 'Metric ruler + depth gauge'], reactants: ['Shallow water at constant depth', 'Plane water wavefronts', 'Foam wave absorber'] },
  { id: 'newton2', subject: 'physics', icon: '⚡', color: '#0288d1', title: 'Newton’s 2nd Law', sub: 'F = m × a acceleration', objective: 'Investigate how trolley acceleration depends on applied force and mass using light gates.', eq: 'F = m × a   ⇒   a = F / m', word: 'accelerating force (N) = mass (kg) × acceleration (m s⁻²)', steps: ['Set hanging force (0.1 N - 0.5 N)', 'Position Light Gate 1 and Light Gate 2 on elevated track', 'Release trolley down the ramp', 'Automatic acceleration graph plotting'], gear: ['Elevated track & pulley', 'Rounded trolley + card', '2 × gates + shared logger', 'Hanging mass hanger'], reactants: ['Accelerating force (0.1 N - 0.5 N)', 'Constant trolley mass (1.0 kg)'] },
  { id: 'electromagnet', subject: 'physics', icon: '🧲', color: '#4361b3', title: 'Electromagnet strength', sub: 'Coil turns & paper clips', objective: 'Investigate how the number of wire turns around an iron core affects electromagnet strength.', eq: 'magnetic field strength B ∝ number of turns N × current I', word: 'more insulated-wire turns produce a stronger magnetic field when current is controlled', steps: ['Use 10 turns around the same iron core', 'Close the switch and lower the core', 'Lift and count the paper clips attracted', 'Repeat up to 50 turns and plot the result'], gear: ['Soft-iron core + coil', '3 V DC power supply', 'Push switch', 'Paper clips + tray'], reactants: ['10–50 insulated-wire turns', 'Constant 3 V supply', 'Identical steel paper clips'] },
  { id: 'convection', subject: 'physics', icon: '↻', color: '#ef7f3b', title: 'Convection currents', sub: 'Visible heat flow in water', objective: 'Visualise convection in water as an orange tracer circulates through a heated glass convection tube.', eq: 'density ρ decreases as temperature rises   ⇒   warm water rises', word: 'heated water expands and rises; cooler, denser water sinks to replace it', steps: ['Add one orange tracer crystal', 'Heat one lower corner gently', 'Watch warm coloured water rise', 'Trace the complete convection current'], gear: ['Glass convection tube', 'Clamp stand', 'Bunsen burner', 'Heatproof mat'], reactants: ['Water', 'Potassium dichromate tracer (simulation only)'] },
  { id: 'conduction', subject: 'physics', icon: '≋', color: '#b46b36', title: 'Conduction in metals', sub: 'Waxed drawing-pin race', objective: 'Compare thermal conduction along metal rods by timing when waxed drawing pins fall.', eq: 'energy transfer rate = kAΔT / L', word: 'vibrating particles and mobile electrons transfer thermal energy along the metal', steps: ['Attach pins with equal wax blobs', 'Heat equal rod ends together', 'Observe each wax blob soften', 'Record the order and fall times'], gear: ['Copper, aluminium & steel rods', 'Drawing pins + wax', 'Clamp stand', 'Bunsen burner'], reactants: ['Identical wax blobs', 'Equal-length metal rods'] },
  { id: 'thermal', subject: 'physics', icon: '◩', color: '#b7376d', title: 'Thermal radiation', sub: 'False-colour camera view', objective: 'Compare infrared radiation from hot surfaces using a thermal-imaging camera and heated Leslie cube.', eq: 'radiated power P = εσA(T⁴ − T₀⁴)', word: 'hotter, dull black surfaces emit infrared radiation more effectively than shiny surfaces', steps: ['Fill the Leslie cube with hot water', 'Aim the thermal camera at the scene', 'Bring the camera display toward you', 'Capture and compare the false-colour image'], gear: ['Thermal-imaging camera', 'Leslie cube', 'Insulated hot-water flask', 'Temperature scale'], reactants: ['Hot water', 'Matt-black & polished surfaces'] },
  { id: 'density', subject: 'physics', icon: '⚖', color: '#00897b', title: 'Density of solids', sub: 'Eureka can & balance', objective: 'Determine the density of an irregular solid object using a Eureka can and measuring cylinder.', eq: 'ρ = m / V', word: 'density (g/cm³) = mass (g) ÷ volume (cm³)', steps: ['Weigh irregular object on balance', 'Fill Eureka can up to spout', 'Lower object into Eureka can', 'Measure displaced water volume'], gear: ['Eureka can', 'Measuring cylinder', 'Electronic balance', 'Irregular solid'], reactants: ['Granite stone', 'Brass weight', 'Aluminum block', 'Steel nut'] },
  { id: 'hooke', subject: 'physics', icon: '↕', color: '#9b4f87', title: 'Force and extension of a spring', sub: 'Hooke’s law & proportionality', objective: 'Measure how a spring extends under increasing force, determine its spring constant and identify where proportionality ends.', eq: 'F = kx', word: 'force (N) = spring constant (N m⁻¹) × extension (m)', steps: ['Record the unloaded pointer position as zero extension', 'Add one 100 g slotted mass and wait for the spring to settle', 'Read total length at eye level and calculate extension', 'Repeat to 6 N, plot force against extension and find the linear gradient'], gear: ['Heavy clamp stand + boss', 'Steel helical spring', 'Vertical ruler + fiducial pointer', 'Mass hanger + safety tray'], reactants: ['Steel spring', '100 g slotted masses', 'Mass hanger and safety tray'] },
  { id: 'specificheat', subject: 'physics', icon: 'ΔT', color: '#d06b38', title: 'Specific heat capacity', sub: 'Compare heated metal blocks', objective: 'Determine and compare the specific heat capacities of 1.00 kg aluminium and copper blocks from electrical energy transferred and temperature rise.', eq: 'c = ΔE / (mΔθ)', word: 'specific heat capacity = energy transferred ÷ (mass × temperature change)', steps: ['Choose a metal and add a small amount of thermal paste to both pre-drilled bores', 'Fit the insulation and bored lid, then insert the heater and temperature probe fully', 'Switch on the low-voltage heater and record energy and temperature', 'Calculate c from ΔE ÷ (mΔθ), then compare the other metal'], gear: ['1.00 kg metal block', 'Immersion heater + probe', 'Insulating jacket', '12 V supply + joulemeter'], reactants: ['Aluminium or copper block', 'Thermal paste', 'Low-voltage electrical energy'] },
  { id: 'latentheat', subject: 'physics', icon: '⇡⇣', color: '#c66a43', title: 'Heating & cooling curves', sub: 'Latent heat and change of state', objective: 'Plot heating and cooling curves for paraffin wax or stearic acid and identify the constant-temperature change-of-state region.', eq: 'E = mL   during a change of state', word: 'energy is transferred while intermolecular bonds change, so temperature stays nearly constant during melting or freezing', steps: ['Clamp the boiling tube in the water bath and lower the thermometer into the solid sample', 'Heat gently and record temperature at equal time intervals through the melting plateau', 'Turn off the Bunsen and continue recording as the liquid cools and solidifies', 'Plot both curves and identify the plateau where latent heat is absorbed or released'], gear: ['Clamped 500 cm³ beaker water bath', 'Boiling tube + thermometer', 'Bunsen burner + heatproof mat', 'Clamp stand + timer'], reactants: ['Paraffin wax pellets', 'Stearic acid flakes', 'Hot water bath'] },
  { id: 'wirelength', subject: 'physics', icon: 'Ω', color: '#7a4eb0', title: 'Resistance of a wire', sub: 'Length of nichrome wire', objective: 'Investigate how the resistance of a uniform wire changes as its measured length increases.', eq: 'R = V / I   and   R = ρL / A', word: 'resistance = potential difference ÷ current; for one uniform wire, resistance increases with length', steps: ['Set the sliding contact to a measured length', 'Turn the power pack on briefly and read V and I', 'Turn the power pack off and calculate R = V ÷ I', 'Repeat for five lengths and plot R against L'], gear: ['100 cm metre ruler', 'Nichrome wire + crocodile clips', '1.5 V DC power pack', 'Ammeter + voltmeter'], reactants: ['20–100 cm wire lengths', 'Constant wire material & diameter', 'Low fixed potential difference'] },
  { id: 'ivdevices', subject: 'physics', icon: 'I–V', color: '#c94f72', title: 'Ohmic & non-ohmic devices', sub: 'Resistor, filament lamp & LED', objective: 'Compare current–potential difference characteristics for an ohmic resistor, a filament lamp and a light-emitting diode.', eq: 'R = V / I', word: 'current is proportional to potential difference only for an ohmic conductor at constant temperature', steps: ['Connect the ammeter in series and the voltmeter in parallel across the selected device', 'Sweep the supply from 0 to +6 V and save each settled current and potential difference', 'Switch off, reverse the polarity and repeat the sweep from 0 to −6 V', 'Compare the resistor, filament-lamp and LED I–V curves'], gear: ['Variable ±6 V DC power pack', 'Digital ammeter in series', 'Digital voltmeter in parallel', 'Switch + component test socket'], reactants: ['100 Ω fixed resistor', '6 V laboratory filament lamp', 'Red LED + 220 Ω protection resistor'] },
  { id: 'fieldlines', subject: 'physics', icon: '⌁', color: '#d45757', title: 'Magnetic field patterns', sub: 'Iron filings over magnets', objective: 'Reveal and compare magnetic-field patterns around one or two bar magnets using iron filings above paper.', eq: 'magnetic field direction outside a magnet: N → S', word: 'iron filings become temporary magnets and align along the local magnetic field', steps: ['Place the magnet configuration below the paper', 'Sprinkle a thin, even layer of iron filings', 'Tap the paper gently so the filings can rotate', 'Record single, attraction and repulsion patterns'], gear: ['Bar magnet(s)', 'White paper on clear support', 'Perforated filings shaker', 'Gentle tapping tool'], reactants: ['Fine iron filings (sealed simulation)', 'Single N–S bar magnet', 'Unlike-pole & like-pole pairs'] },
  { id: 'nuclear', subject: 'physics', icon: '☢', color: '#ffcc00', title: 'Nuclear radiation', sub: 'Alpha, Beta & Gamma', objective: 'Compare the penetrating power of alpha, beta and gamma radiation at a fixed source–detector distance using paper, aluminium and lead absorbers.', eq: 'count rate (counts min⁻¹) = corrected count ÷ time (min)', word: 'alpha is stopped by paper, beta by aluminium, gamma is reduced by thick lead', steps: ['Use tongs to place one sealed source at the fixed distance', 'Choose an absorber and lower it into the holder', 'Measure for 10 s and note the count and equivalent count rate', 'Compare α with paper, β with aluminium and γ with lead'], gear: ['Geiger–Müller tube + clamp', 'Digital scaler / counter', 'Lead-lined source store + tongs', 'Paper, aluminium and lead absorbers'], reactants: ['Americium-241 sealed source (Alpha)', 'Strontium-90 sealed source (Beta)', 'Cobalt-60 sealed source (Gamma)'] }
];
const graphSpecs = {
  rates: { xLabel: 'temperature / °C', yLabel: 'time for cross to disappear / s', xMin: 20, xMax: 60, yMin: 0, yMax: 50, yDp: 0 },
  temp: { xLabel: 'time / s', yLabel: 'temperature / °C', xMin: 0, xMax: 12, yMin: 20, yMax: 45, yDp: 0 },
  titration: { xLabel: 'NaOH added / cm³', yLabel: 'pH', xMin: 0, xMax: 30, yMin: 0, yMax: 14, yDp: 0 },
  salts: { xLabel: 'heating time / s', yLabel: 'temperature / °C', xMin: 0, xMax: 12, yMin: 20, yMax: 100, yDp: 0 },
  mass: { xLabel: 'heating time / s', yLabel: 'mass / g', xMin: 0, xMax: 12, yMin: 4, yMax: 4.2, yDp: 2 },
  hydrogen: { xLabel: 'time / s', yLabel: 'gas volume / cm³', xMin: 0, xMax: 12, yMin: 0, yMax: 50, yDp: 0 },
  co2: { xLabel: 'time / s', yLabel: 'limewater turbidity / %', xMin: 0, xMax: 12, yMin: 0, yMax: 100, yDp: 0 },
  electro: { xLabel: 'time / s', yLabel: 'gas volume / cm³', xMin: 0, xMax: 12, yMin: 0, yMax: 50, yDp: 0 },
  chrom: { xLabel: 'solvent front / cm', yLabel: 'mean dye distance / cm', xMin: 0, xMax: 10, yMin: 0, yMax: 8, yDp: 1 },
  water: { xLabel: 'heating time / s', yLabel: 'temperature / °C', xMin: 0, xMax: 12, yMin: 20, yMax: 100, yDp: 0 },
  thermite: { xLabel: 'elapsed time / s', yLabel: 'simulated core temperature / °C', xMin: 0, xMax: 8, yMin: 0, yMax: 2600, yDp: 0 },
  lipase: { xLabel: 'temperature / °C', yLabel: 'time for pink colour to disappear / s', xMin: 20, xMax: 60, yMin: 0, yMax: 120, yDp: 0 },
  respiration: { xLabel: 'water-bath temperature / °C', yLabel: 'carbon dioxide volume / cm³', xMin: 10, xMax: 60, yMin: 0, yMax: 90, yDp: 0 },
  osmosis: { xLabel: 'sucrose concentration / mol dm⁻³', yLabel: 'percentage change in mass / %', xMin: 0, xMax: 0.8, yMin: -20, yMax: 20, yDp: 0 },
  agardiffusion: { xLabel: 'agar cube side length / cm', yLabel: 'volume diffused / %', xMin: 1, xMax: 3, yMin: 0, yMax: 100, xDp: 0, yDp: 0 },
  potometer: { xLabel: 'wind speed / m s⁻¹', yLabel: 'bubble speed / mm min⁻¹', xMin: 0, xMax: 1.5, yMin: 0, yMax: 10, yDp: 1 },
  pondweed: { xLabel: 'distance from beaker edge / cm', yLabel: 'bubbles per minute', xMin: 10, xMax: 50, yMin: 0, yMax: 60, yDp: 0 },
  newton2: { xLabel: 'force / N', yLabel: 'acceleration / m s⁻²', xMin: 0, xMax: 0.6, yMin: 0, yMax: 1.2, yDp: 2 },
  electromagnet: { xLabel: 'number of wire turns', yLabel: 'paper clips lifted', xMin: 0, xMax: 50, yMin: 0, yMax: 15, yDp: 0 },
  density: { xLabel: 'volume / cm³', yLabel: 'mass / g', xMin: 0, xMax: 100, yMin: 0, yMax: 250, yDp: 1 },
  hooke: { xLabel: 'extension / m', yLabel: 'force / N', xMin: 0, xMax: 0.14, yMin: 0, yMax: 7, xDp: 2, yDp: 1 },
  specificheat: { xLabel: 'temperature rise / °C', yLabel: 'energy transferred / kJ', xMin: 0, xMax: 20, yMin: 0, yMax: 18, yDp: 1 },
  latentheat: { xLabel: 'time from start of stage / s', yLabel: 'sample temperature / °C', xMin: 0, xMax: 480, yMin: 20, yMax: 90, xDp: 0, yDp: 0 },
  wirelength: { xLabel: 'wire length / cm', yLabel: 'resistance / Ω', xMin: 0, xMax: 100, yMin: 0, yMax: 10, yDp: 1 },
  ivdevices: { xLabel: 'potential difference across device / V', yLabel: 'current / A', xMin: -6, xMax: 6, yMin: -.22, yMax: .22, xDp: 0, yDp: 2 }
};
const nonGraphResultIds = new Set(['free', 'titration', 'salts', 'mass', 'co2', 'electro', 'flame', 'displacement', 'chrom', 'starchleaf', 'transformation', 'antibiotics', 'quadrats', 'capture', 'shoretransect', 'ripple', 'convection', 'conduction', 'thermal', 'fieldlines', 'nuclear', 'ivdevices']);
nonGraphResultIds.add('alkali');
const GRAPH_SIDEBAR_HEADER_Y = 134, GRAPH_SIDEBAR_DESCRIPTION_OFFSET = 32;
function currentGraphModalKind(id = practicals[state.selected]?.id) {
  if (id === 'rates') return 'temperature-bar-chart';
  if (id === 'lipase') return 'lipase-bar-chart';
  if (id === 'latentheat') return 'latent-heat-dual-curve';
  if (id === 'ivdevices') return 'iv-device-curves';
  return graphSpecs[id] && !nonGraphResultIds.has(id) ? 'line-graph' : null;
}
function graphSidebarContentY(id = practicals[state.selected]?.id) {
  return state.tab === 'graph' && currentGraphModalKind(id) ? GRAPH_SIDEBAR_HEADER_Y : 132;
}
function graphSidebarDescriptionY(headerY) { return headerY + GRAPH_SIDEBAR_DESCRIPTION_OFFSET }
const subjects = [
  { id: 'chemistry', title: 'Chemistry', icon: '🧪', color: '#087f75' },
  { id: 'biology', title: 'Biology', icon: '🌿', color: '#2e7d32' },
  { id: 'physics', title: 'Physics', icon: '⚡', color: '#0288d1' }
];

const practicalEvaluations = {
  free: {
    iv: 'User-defined independent variable (factor deliberately varied).',
    dv: 'User-defined dependent variable (measured outcome or property).',
    cvs: 'Environmental temperature, reactant concentration, solution volume, glassware dimensions.',
    improvements: [
      'Use calibrated digital sensors (pH probe, temperature probe) rather than manual visual indicators.',
      'Perform at least 3 repeat trials per condition to identify anomalies and calculate a mean.',
      'Control ambient laboratory temperature using a thermostatically controlled water bath.'
    ]
  },
  rates: {
    iv: 'Temperature of sodium thiosulfate solution (°C)',
    dv: 'Time taken for the black cross to be obscured by sulfur precipitate (s)',
    cvs: 'Volume of sodium thiosulfate (50 cm³), volume of HCl (10 cm³), concentration of both reagents, size & thickness of cross, observer.',
    improvements: [
      'Use a digital colorimeter / light sensor with data logger to measure light transmission quantitatively instead of subjective human eyesight.',
      'Use a thermostatically controlled water bath to maintain exact temperature throughout each trial.',
      'Test smaller temperature intervals (e.g. 5 °C increments) to plot a smoother rate curve and identify trends accurately.'
    ]
  },
  temp: {
    iv: 'Volume of hydrochloric acid added to alkali (cm³)',
    dv: 'Maximum temperature reached during the exothermic reaction (°C)',
    cvs: 'Initial solution temperatures, concentration of HCl and NaOH (1.0 mol/dm³), total solution volume, vessel type.',
    improvements: [
      'Use a polystyrene cup in a glass beaker with a fitted lid (hole for thermometer) to minimise heat loss via conduction and convection.',
      'Use a digital thermometer reading to 0.1 °C to reduce measurement uncertainty.',
      'Repeat each volume combination 3 times to identify anomalies and calculate a mean maximum temperature.'
    ]
  },
  titration: {
    iv: 'Volume of NaOH added from burette (cm³)',
    dv: 'Exact volume (titre) required to neutralise 25.0 cm³ of HCl (cm³)',
    cvs: 'Volume of HCl in flask (25.0 cm³ using volumetric pipette), concentration of acid, indicator type (phenolphthalein) & volume (2 drops).',
    improvements: [
      'Swirl flask continuously and add titrant dropwise near endpoint to obtain concordant titres within 0.10 cm³ of each other.',
      'Place a white tile beneath the flask to detect the subtle initial colour change (colourless to permanent pale pink) clearly.',
      'Read burette meniscus at eye level from the bottom of the curve to eliminate parallax error.'
    ]
  },
  salts: {
    iv: 'Mass of insoluble copper(II) oxide added to warm sulfuric acid (g)',
    dv: 'Yield and purity of hydrated copper(II) sulfate crystals produced (g)',
    cvs: 'Volume (50 cm³) & concentration (1.0 mol/dm³) of sulfuric acid, heating temperature before addition, evaporation rate.',
    improvements: [
      'Add copper oxide in excess to ensure all acid is fully neutralized before filtering.',
      'Filter mixture while warm to remove unreacted CuO without crystallising product in the filter paper.',
      'Evaporate gently over a water bath to crystallisation point rather than heating to dryness to prevent thermal decomposition.'
    ]
  },
  mass: {
    iv: 'Duration of heating magnesium ribbon in crucible (s)',
    dv: 'Total mass of crucible + contents after reaction (g)',
    cvs: 'Initial mass of magnesium (4.01 g), crucible dimensions, air/oxygen supply.',
    improvements: [
      'Lift crucible lid periodically for 1–2 seconds to allow oxygen to enter while preventing white MgO smoke/powder from escaping.',
      'Heat, cool, and re-weigh to constant mass to ensure the oxidation reaction has gone to complete conversion.',
      'Clean magnesium ribbon with emery paper before weighing to remove pre-existing oxide layer.'
    ]
  },
  hydrogen: {
    iv: 'Mass / surface area of magnesium ribbon (g)',
    dv: 'Volume of hydrogen gas collected (cm³) and characteristic squeaky pop test sound',
    cvs: 'Volume (25 cm³) and concentration (1.0 mol/dm³) of dilute HCl, ambient temperature and pressure.',
    improvements: [
      'Collect gas over water into an inverted measuring cylinder or gas syringe to quantify gas volume vs time precisely.',
      'Use a bung with delivery tube attached immediately after adding magnesium to prevent gas escaping before collection.',
      'Repeat tests with identical ribbon lengths to ensure reliable pop audio detection.'
    ]
  },
  co2: {
    iv: 'Mass of calcium carbonate reacted with HCl (g)',
    dv: 'Turbidity / opacity of limewater as white CaCO₃ precipitate forms (%)',
    cvs: 'Volume (20 cm³) and concentration of limewater (Ca(OH)₂), delivery tube immersion depth, solution temperature.',
    improvements: [
      'Use a digital turbidity sensor or colorimeter to quantify limewater cloudiness objectively instead of visual timing.',
      'Ensure delivery tube tip remains fully submerged beneath limewater surface throughout gas evolution.',
      'Use a gas syringe in parallel to measure total CO₂ gas volume evolved over time.'
    ]
  },
  electro: {
    iv: 'Electric potential difference / current across graphite electrodes (V / A)',
    dv: 'Mass of copper deposited at cathode (g) and volume of chlorine gas at anode (cm³)',
    cvs: 'Concentration of CuCl₂ solution, electrode surface area & spacing, duration of electrolysis (minutes).',
    improvements: [
      'Gently rinse cathode with propanone/distilled water and air-dry thoroughly before weighing to avoid rubbing off copper deposit.',
      'Use inverted test tubes or gas syringes filled with solution over electrodes to collect evolved gases quantitatively.',
      'Maintain constant current using a rheostat / variable resistor to ensure uniform rate of deposition.'
    ]
  },
  flame: {
    iv: 'Type of metal chloride salt (Li⁺, Na⁺, K⁺, Ca²⁺, Cu²⁺)',
    dv: 'Characteristic flame emission color and absorption spectrum wavelengths (nm)',
    cvs: 'Bunsen burner setting (roaring blue flame), cleanliness of wire loop/spatula, sample quantity.',
    improvements: [
      'Clean nichrome wire with concentrated HCl and heat in roaring flame between tests until no flame color appears to prevent cross-contamination.',
      'Use flame emission spectroscopy for precise quantitative identification of mixed metal ions.',
      'Observe flame through blue cobalt glass when testing potassium to mask intense yellow sodium contamination.'
    ]
  },
  displacement: {
    iv: 'Type of metal strip added (Mg, Zn, Fe, Cu)',
    dv: 'Temperature change ΔT (°C), solution colour change, and displaced metal coating',
    cvs: 'Volume (25 cm³) & concentration (0.5 mol/dm³) of salt solutions, surface area of metal strips, reaction time.',
    improvements: [
      'Clean metal strips with sandpaper immediately before testing to remove oxide coating that delays reaction.',
      'Use an insulated polystyrene cup calorimeter with lid to measure exact temperature rise ΔT to calculate enthalpy change.',
      'Filter and weigh displaced metal after drying to compare stoichiometry quantitatively.'
    ]
  },
  alkali: {
    iv: 'Type of alkali metal added to water (lithium, sodium or potassium)',
    dv: 'Rate and vigour of fizzing, movement, temperature change and flame colour',
    cvs: 'Tiny sample size, water volume, water temperature, indicator concentration, same protected water trough and observation time.',
    improvements: [
      'Use only a teacher-controlled simulation or approved filmed demonstration: alkali metals react violently with water and must not be handled in a student practical.',
      'Use equal, freshly cut tiny samples stored under oil so oxide coating and surface area do not confound the comparison.',
      'Use a temperature probe and video analysis behind a safety screen to compare hydrogen production and reaction speed objectively.'
    ]
  },
  chrom: {
    iv: 'Type of food dye / pigment mixture',
    dv: 'Distance travelled by pigment spot (cm) and calculated Retention Factor (Rf)',
    cvs: 'Type of solvent (water), chromatography paper type, baseline height from bottom (1.5 cm), solvent front height.',
    improvements: [
      'Use a fine capillary tube to apply small, concentrated dye spots to prevent spreading and overlapping.',
      'Cover container with a lid to saturate internal atmosphere with solvent vapour and prevent solvent evaporation.',
      'Ensure pencil is used for baseline since ink would dissolve in solvent and contaminate the chromatogram.'
    ]
  },
  water: {
    iv: 'Type / origin of water sample (sea water, waste water, distilled water)',
    dv: 'Boiling point (°C), pH, and mass of dissolved solid residue remaining after evaporation (g)',
    cvs: 'Volume of water sample tested (50 cm³), distillation heating rate, condenser cooling water flow rate.',
    improvements: [
      'Run cooling water into the bottom inlet of the Liebig condenser to keep condenser completely full of cold water (counter-current flow).',
      'Add anti-bumping granules to heating flask to ensure smooth, even boiling without liquid splashing into delivery tube.',
      'Use a digital electrical conductivity meter to verify pure distillate has zero dissolved ionic salts.'
    ]
  },
  thermite: {
    iv: 'Mass ratio of aluminium powder to iron(III) oxide charge',
    dv: 'Peak core temperature reached (°C) and mass of molten iron produced (g)',
    cvs: 'Length of magnesium fuse, sand containment volume, distance behind protective blast screen.',
    improvements: [
      'Dry reactants thoroughly in an oven/desiccator before ignition to eliminate moisture that causes steam explosions.',
      'Use an infrared optical pyrometer to record peak thermal radiation safely from behind the blast shield.',
      'Ignite electronically or with a remote fuse to ensure complete operator isolation.'
    ]
  },
  starchleaf: {
    iv: 'Presence of photosynthesised starch in the sampled leaf tissue',
    dv: 'Final iodine colour: orange-brown if starch is absent or blue-black if starch is present',
    cvs: 'Leaf species and size, time in hot water and ethanol, water-bath temperature, volume and concentration of iodine.',
    improvements: [
      'Destarch the plant in darkness for 24–48 hours before exposing it to the chosen light condition so any starch detected formed during the test.',
      'Heat ethanol only in a water bath because ethanol is highly flammable; keep it away from naked flames and wear eye protection.',
      'Use equal-sized leaf discs and a colour chart or image analysis to make the iodine colour comparison less subjective.'
    ]
  },
  lipase: {
    iv: 'Temperature of the milk, sodium carbonate, phenolphthalein and lipase mixture (°C)',
    dv: 'Time taken for the pink phenolphthalein indicator to become colourless (s)',
    cvs: 'Volumes and concentrations of lipase, milk, sodium carbonate and phenolphthalein; total mixing; same endpoint colour.',
    improvements: [
      'Pre-equilibrate both the lipase and milk mixture in the thermostatically controlled water bath before mixing them.',
      'Use a colorimeter or pH probe with a data logger to detect the endpoint objectively instead of judging when pink disappears.',
      'Repeat each temperature at least three times, identify anomalies and calculate a mean time or mean rate (1 ÷ time).'
    ]
  },
  transformation: {
    iv: 'DNA treatment and growth medium: +plasmid or −plasmid; LB, LB + ampicillin, or LB + ampicillin + arabinose',
    dv: 'Presence and number of bacterial colonies, plus green fluorescence under blue light',
    cvs: 'Teaching strain and cell volume, plasmid volume, ice and heat-shock times, 42 °C heat-shock temperature, recovery time, agar volume, inoculum volume and incubation conditions.',
    improvements: [
      'Use a fresh sterile pipette tip for every transfer and keep lids closed wherever possible so plate growth can be attributed to the intended bacteria.',
      'Include both −DNA controls: LB confirms the cells were viable, while LB/amp confirms untransformed cells cannot grow when ampicillin is present.',
      'Repeat the transformation, count colonies on plates with separate colonies and calculate transformation efficiency per microgram of plasmid DNA.'
    ]
  },
  respiration: {
    iv: 'Temperature of the thermostatically controlled water bath (°C)',
    dv: 'Volume of carbon dioxide collected in the balloon after 10 minutes (cm³)',
    cvs: 'Yeast strain and concentration, glucose mass, yeast-suspension volume, flask and balloon size, mixing method, pH and incubation time.',
    improvements: [
      'Equilibrate the sugar solution and yeast separately at each target temperature before mixing so every trial starts at the intended temperature.',
      'Use a gas syringe or carbon-dioxide sensor instead of estimating gas from balloon size, because latex balloons need different pressures to stretch.',
      'Repeat each temperature at least three times, calculate a mean and test extra temperatures around 35–40 °C to locate the optimum more precisely.'
    ]
  },
  antibiotics: {
    iv: 'Antibiotic carried by each coded paper disc (including a sterile-water control)',
    dv: 'Diameter of the clear zone of inhibition measured through the disc centre (mm)',
    cvs: 'Bacillus subtilis strain and inoculum density, agar depth and composition, disc diameter and spacing, incubation temperature and time, Petri-dish size and measuring method.',
    improvements: [
      'Repeat each antibiotic on at least three identically inoculated plates, calculate a mean zone diameter and report the range or uncertainty.',
      'Use a sterile-water control disc and keep antibiotic discs equally spaced so a clear zone can be attributed to the antibiotic rather than handling or overlap.',
      'Measure two perpendicular diameters for an irregular zone with digital callipers or image analysis, then calculate their mean without opening the incubated plate.'
    ]
  },
  osmosis: {
    iv: 'Concentration of the surrounding sucrose solution (mol dm⁻³)',
    dv: 'Percentage change in mass of the potato cylinder (%)',
    cvs: 'Potato variety and source, cylinder diameter and length, initial mass, solution volume, immersion time, temperature and blotting method.',
    improvements: [
      'Cut cylinders with the same cork borer and trim them to the same length so surface area and starting volume are controlled.',
      'Blot every cylinder in the same way before reweighing so surface liquid does not falsely increase the final mass.',
      'Repeat each concentration at least three times, calculate a mean percentage change and test extra concentrations near the zero-change point.'
    ]
  },
  agardiffusion: {
    iv: 'Side length of the alkaline phenolphthalein agar cube (cm)',
    dv: 'Percentage of the original cube volume reached by hydrochloric acid diffusion (%)',
    cvs: 'Hydrochloric-acid concentration and volume, immersion time, agar composition, temperature, cube shape and blotting/cutting method.',
    improvements: [
      'Cut cubes with a template or cutting guide and check all three dimensions with callipers so the stated side lengths are accurate.',
      'Immerse the cubes simultaneously in identical acid volumes, keep them fully submerged and start one timer only after all three are covered.',
      'Repeat each size, measure the pink core in three perpendicular directions and calculate a mean diffusion depth to reduce cutting and reading uncertainty.'
    ]
  },
  potometer: {
    iv: 'Wind speed across the leaves (m s⁻¹), measured with the anemometer',
    dv: 'Rate of water uptake, measured as air-bubble distance travelled per minute (mm min⁻¹)',
    cvs: 'Leaf species and total leaf area, temperature, humidity, light intensity, measurement time, capillary bore and the same airtight shoot.',
    improvements: [
      'Cut the shoot underwater and assemble the completely water-filled apparatus underwater so air cannot enter the xylem.',
      'Seal every joint with petroleum jelly and check for leaks before introducing the single measurement bubble.',
      'Repeat each wind speed at least three times, calculate a mean and use a humidity and temperature sensor to confirm the other conditions remain constant.'
    ]
  },
  quadrats: {
    iv: 'Randomly generated sampling position on the 10 m × 10 m habitat grid (a sampling location rather than a deliberately changed treatment)',
    dv: 'Number of daisy plants rooted inside each 1 m² quadrat and the mean daisy density (plants m⁻²)',
    cvs: 'Quadrat area, habitat boundary, counting edge rule, sampling season and time, observer identification rule and number of repeats.',
    improvements: [
      'Use a random-number generator for both coordinates and reject duplicates so every habitat position has an equal chance of selection.',
      'Take more than five samples and continue until the running mean becomes stable, then calculate uncertainty or a confidence interval.',
      'Use the same rooted-inside boundary rule at every quadrat and have a second observer check ambiguous plants to improve repeatability.'
    ]
  },
  shoretransect: {
    iv: 'Distance down the shore from the upper-shore datum (m), grouped into upper, middle and lower shore strata',
    dv: 'Abundance of limpets and barnacles plus percentage cover of brown seaweed in each fixed-area quadrat',
    cvs: 'Quadrat size and grid, 2 m station interval, belt direction and width, tide state, organism identification rules and observer.',
    improvements: [
      'Repeat parallel belt transects at randomly selected positions within each shore stratum instead of relying on one line.',
      'Sample at the same tidal state and use a tide table so exposure time does not confound comparisons between repeats.',
      'Photograph every quadrat vertically with a scale and use grid or image analysis to make percentage-cover estimates less subjective.'
    ]
  },
  ripple: {
    iv: 'Frequency of the straight dipper, set by the signal generator (Hz)',
    dv: 'Wavelength measured from the ripple pattern (m) and calculated wave speed v = fλ (m s⁻¹)',
    cvs: 'Water depth, dipper amplitude and shape, measurement direction and region, tank level, water temperature and the same absorbing beach.',
    improvements: [
      'Measure across ten complete wavelengths and divide by ten so the percentage uncertainty from locating individual crests is reduced.',
      'Use a vertically mounted camera or projected screen with a synchronised strobe to freeze the pattern and remove ruler parallax.',
      'Repeat each frequency, calculate a mean and check the water depth before every series because shallow-water wave speed depends on depth.'
    ]
  },
  pondweed: {
    iv: 'Distance of filament lamp from the beaker edge (cm) [Light intensity ∝ 1 / distance²]',
    dv: 'Number of oxygen bubbles produced per minute (or volume of O₂ collected in cm³)',
    cvs: 'Sodium hydrogen carbonate (NaHCO₃) concentration, water bath temperature, pondweed length (8 cm), light wavelength.',
    improvements: [
      'Increase the number of intermediate distances tested (e.g. 5 cm intervals between 10–50 cm) to obtain a detailed rate curve.',
      'Place a glass water heat-shield between the filament lamp and beaker to prevent lamp heat from altering water temperature.',
      'Collect oxygen gas in an inverted measuring cylinder / micro-burette instead of counting bubbles to eliminate error from varying bubble sizes.'
    ]
  },
  newton2: {
    iv: 'Accelerating force F (N) [hanging mass] OR total mass m (kg) [trolley mass]',
    dv: 'Acceleration of trolley a (m/s²), calculated from light gate velocities (v₂ - v₁) / t',
    cvs: 'Track elevation angle, distance between light gates, width of trolley interrupt card (3.0 cm).',
    improvements: [
      'Slightly elevate the track to compensate for friction so the trolley travels at constant velocity when no external force acts.',
      'Use dual light-gates connected to a computer data logger to measure velocity and acceleration automatically without human reaction error.',
      'Keep total mass constant when varying force by transferring masses from trolley to mass hanger.'
    ]
  },
  electromagnet: {
    iv: 'Number of insulated-copper-wire turns around the soft-iron core (10, 20, 30, 40 or 50)',
    dv: 'Electromagnet strength, measured as the number of identical steel paper clips lifted',
    cvs: 'Current and supply voltage, iron-core material and dimensions, paper-clip type, lowering depth and lifting time.',
    improvements: [
      'Use a regulated low-voltage supply and an ammeter so current remains constant as the wire length and resistance change.',
      'Open the switch between trials to reduce coil heating, then demagnetise or replace the core to limit residual magnetism.',
      'Repeat each turn count at least three times with a rearranged paper-clip pile and calculate a mean.'
    ]
  },
  convection: {
    iv: 'Position and duration of heating at one lower corner of the water-filled convection tube',
    dv: 'Direction and speed of the visible orange tracer through the closed water path',
    cvs: 'Water volume and initial temperature, tube dimensions, tracer quantity and Bunsen flame setting.',
    improvements: [
      'Use only a tiny teacher-prepared tracer quantity; potassium dichromate is hazardous and this simulation must not be treated as handling guidance.',
      'Use a video tracker or timed distance markers to estimate the convection-current speed objectively.',
      'Allow the water and apparatus to return to room temperature before repeating from the same starting conditions.'
    ]
  },
  conduction: {
    iv: 'Metal used for the rod: copper, aluminium or steel',
    dv: 'Time from lighting the Bunsen to each waxed drawing pin falling (s)',
    cvs: 'Rod length and diameter, pin spacing, wax mass, starting temperature and distance from the flame.',
    improvements: [
      'Use equal masses of wax applied with a template so every drawing pin needs the same energy to detach.',
      'Heat the rods through one shared metal block so their end temperatures and heating start times are matched.',
      'Repeat the demonstration and use temperature probes along each rod instead of relying only on the wax-melting endpoint.'
    ]
  },
  thermal: {
    iv: 'Surface finish of the hot Leslie cube: matt black, white, brushed or polished metal',
    dv: 'Infrared surface temperature / apparent radiation intensity shown by the false-colour camera',
    cvs: 'Water temperature and volume, cube-face area, camera distance and angle, ambient temperature and emissivity setting.',
    improvements: [
      'Keep the camera perpendicular and at one fixed distance from each face so the sampled area stays constant.',
      'Set or compensate for emissivity before comparing true temperatures; polished metal can reflect surrounding infrared.',
      'Record several frames as the cube cools and compare readings at matched water temperatures.'
    ]
  },
  density: {
    iv: 'Material / object type of irregular solid (Granite, Brass, Aluminium, Steel)',
    dv: 'Displaced water volume V (cm³) in measuring cylinder and dry mass m (g) on balance',
    cvs: 'Water density (1.0 g/cm³), Eureka can fill level (filled until spout stops dripping before test).',
    improvements: [
      'Fill Eureka can until spout drips, then wait until dripping stops completely before placing measuring cylinder under spout.',
      'Lower solid object slowly using a thin thread to prevent splashing water or trapping air bubbles on the object surface.',
      'Read measuring cylinder meniscus at eye level to measure displaced volume with high precision.'
    ]
  },
  hooke: {
    iv: 'Downward force on the spring, changed in 1.0 N steps by adding 100 g slotted masses (using g ≈ 10 N kg⁻¹)',
    dv: 'Spring extension x (m), calculated from loaded length minus the unloaded reference length',
    cvs: 'The same spring, clamp and ruler; fixed upper attachment and ruler position; equal settling time; pointer read at eye level.',
    improvements: [
      'Clamp the ruler parallel and very close to the spring, then use a thin horizontal fiducial pointer so every reading is taken at the same reference point.',
      'Wait until oscillations have stopped before recording, read the scale at eye level and repeat each force while loading and unloading.',
      'Secure the heavy stand and place a safety tray below the hanger; add masses gently and stop before the spring is permanently deformed.'
    ]
  },
  specificheat: {
    iv: 'Electrical energy transferred to the 1.00 kg aluminium block (J), increased by heating for longer',
    dv: 'Temperature rise of the aluminium block, Δθ (°C), used with c = ΔE ÷ (mΔθ)',
    cvs: 'Block material and mass, heater power and insertion depth, probe position, insulation thickness and initial temperature.',
    improvements: [
      'Use thermal paste in both bores and insert the heater and probe fully so poor contact and trapped air do not reduce energy transfer to the block.',
      'Wrap the block closely in insulation, add an insulating lid and use a draught shield to reduce energy lost to the surroundings.',
      'Record energy with a joulemeter and temperature with a data logger, then use the gradient of energy against temperature rise rather than one pair of readings.'
    ]
  },
  latentheat: {
    iv: 'Direction of energy transfer (heating or cooling) and sample material (paraffin wax or stearic acid)',
    dv: 'Sample temperature (°C) recorded at equal time intervals to locate the melting / freezing plateau',
    cvs: 'Sample mass, boiling-tube dimensions, thermometer depth, water-bath volume, Bunsen setting, starting temperature and recording interval.',
    improvements: [
      'Keep the thermometer bulb central in the sample without touching the glass, and stir the water bath gently so the sample is heated evenly.',
      'Use a temperature probe and data logger to collect closely spaced readings through both plateaux without reaction-time or transcription errors.',
      'Repeat with the same sample mass and use a thermostatically controlled bath; insulate the cooling setup from draughts so heating and cooling curves can be compared fairly.'
    ]
  },
  wirelength: {
    iv: 'Length of nichrome wire between the fixed and sliding crocodile contacts (20, 40, 60, 80 or 100 cm)',
    dv: 'Resistance R (Ω), calculated from the measured potential difference and current using R = V ÷ I',
    cvs: 'Wire material and diameter, supply potential difference, wire temperature, contact pressure and the same meters/leads.',
    improvements: [
      'Turn the power pack off between readings and use a low potential difference so the wire does not heat and change resistance.',
      'Measure length from the same edge of each crocodile contact and keep the wire straight against a metre ruler.',
      'Repeat each length at least three times, calculate a mean resistance and use more length intervals before drawing a best-fit line.'
    ]
  },
  ivdevices: {
    iv: 'Potential difference across the selected component, including both positive and negative polarity',
    dv: 'Current through the component measured by the series ammeter',
    cvs: 'The same meters, leads, voltage intervals and settling time; keep the resistor temperature controlled and use the LED protection resistor.',
    improvements: [
      'Use a data logger to sample voltage and current simultaneously at smaller intervals, especially around the LED turn-on voltage.',
      'Switch off between filament-lamp readings and repeat the sweep in both directions to investigate heating and thermal lag.',
      'Repeat each sweep, identify anomalous readings and plot a smooth curve of best fit instead of joining noisy points mechanically.'
    ]
  },
  fieldlines: {
    iv: 'Bar-magnet arrangement: one magnet, unlike poles facing or like poles facing',
    dv: 'Shape, direction and relative concentration of the iron-filings pattern above the paper',
    cvs: 'Magnet strength and distance below the paper, filings mass and spread area, paper thickness and tapping method.',
    improvements: [
      'Use only a thin, even filings layer so individual filings can rotate freely instead of forming heavy clumps.',
      'Keep magnet positions fixed with a template below the paper and tap the support gently by the same amount each time.',
      'Use a plotting compass at a grid of points to add field direction arrows; iron filings show shape and strength but not field direction.'
    ]
  }
};
const chromPigments = [
  { id: 'magenta', label: 'Magenta', color: '#e23d79', hex: 0xe23d79, x: -.39, end: .61 },
  { id: 'blue', label: 'Blue', color: '#2879d8', hex: 0x2879d8, x: -.13, end: .75 },
  { id: 'yellow', label: 'Yellow', color: '#f0bd2e', hex: 0xf0bd2e, x: .13, end: .31 },
  { id: 'green', label: 'Green', color: '#36a568', hex: 0x36a568, x: .39, end: .5 }
];
const chromSolventDistanceCm = 7.2;
function chromMeasurementData() { const q = Math.max(0, Math.min(1, state.progress)), start = -.63, travel = 1.4, solvent = chromSolventDistanceCm * q; return chromPigments.map(d => { const distance = chromSolventDistanceCm * ((d.end - start) / travel) * q; return { id: d.id, label: d.label, color: d.color, distance_cm: +distance.toFixed(1), rf: solvent > 0 ? +(distance / solvent).toFixed(2) : null } }) }
const electroMasses = { cathodeBefore: 12.40, anodeBefore: 12.35, copperGain: 0.84 };
function electroMassData() { const q = Math.max(0, Math.min(1, state.progress)), cathodeAfter = electroMasses.cathodeBefore + electroMasses.copperGain * q; return { cathode: { electrode: 'Cathode', polarity: 'negative', before_g: electroMasses.cathodeBefore, after_g: +cathodeAfter.toFixed(2), change_g: +(cathodeAfter - electroMasses.cathodeBefore).toFixed(2) }, anode: { electrode: 'Anode', polarity: 'positive', before_g: electroMasses.anodeBefore, after_g: electroMasses.anodeBefore, change_g: 0 } } }
const electroWeighDuration = 4.8;
function electroWeighPhase() { if (state.electroRecorded) return 'weighed on balance'; if (!state.electroWeighing) return state.complete ? 'ready to remove and weigh' : 'immersed in solution'; const t = state.electroWeighTimer; return t < .8 ? 'lifting from solution' : t < 2.5 ? 'moving to balance' : t < 3.6 ? 'lowering onto balance' : 'balance settling' }
function electroBalanceReading() { if (state.electroRecorded) return electroMasses.cathodeBefore + electroMasses.copperGain; if (!state.electroWeighing || state.electroWeighTimer < 3.55) return 0; const settle = Math.max(0, Math.min(1, (state.electroWeighTimer - 3.55) / (electroWeighDuration - 3.55))), wobble = Math.sin(state.electroWeighTimer * 24) * (1 - settle) * .28; return +(electroMasses.cathodeBefore + electroMasses.copperGain + wobble).toFixed(2) }
const thermiteDuration = 8;
function thermitePhase() { if (state.complete) return 'cooling molten iron product'; if (!state.running) return 'shielded setup ready'; const t = state.thermiteTimer; return t < 1.1 ? 'blow torch approaching' : t < 2.6 ? 'magnesium fuse burning' : t < 3.15 ? 'violent ignition flash' : t < 5.9 ? 'white-hot spark fountain' : 'reaction decaying' }
const displacementDuration = 6.4;
const displacementTrials = [
  { metal: 'Magnesium', metalSymbol: 'Mg', solution: 'CuSO₄(aq)', displaced: 'Cu', equation: 'Mg(s) + CuSO₄(aq) → MgSO₄(aq) + Cu(s)', observation: 'Blue → colourless; red-brown copper coating', rate: 1 },
  { metal: 'Zinc', metalSymbol: 'Zn', solution: 'CuSO₄(aq)', displaced: 'Cu', equation: 'Zn(s) + CuSO₄(aq) → ZnSO₄(aq) + Cu(s)', observation: 'Blue fades; red-brown copper coating', rate: .86 },
  { metal: 'Iron', metalSymbol: 'Fe', solution: 'CuSO₄(aq)', displaced: 'Cu', equation: 'Fe(s) + CuSO₄(aq) → FeSO₄(aq) + Cu(s)', observation: 'Blue → pale green; copper coating', rate: .68 },
  { metal: 'Copper', metalSymbol: 'Cu', solution: 'AgNO₃(aq)', displaced: 'Ag', equation: 'Cu(s) + 2AgNO₃(aq) → Cu(NO₃)₂(aq) + 2Ag(s)', observation: 'Silver crystals form; solution turns blue', rate: .8 }
];
const flameTestSalts = [
  { id: 'lithium', symbol: 'Li⁺', salt: 'Lithium chloride', formula: 'LiCl', flame: 'crimson red', flameHex: '#e83e55', solidHex: 0xf3f0ed, bands: [460.3, 610.4, 670.8] },
  { id: 'sodium', symbol: 'Na⁺', salt: 'Sodium chloride', formula: 'NaCl', flame: 'intense yellow', flameHex: '#ffd21f', solidHex: 0xf4f2ec, bands: [568.3, 589.0, 589.6] },
  { id: 'potassium', symbol: 'K⁺', salt: 'Potassium chloride', formula: 'KCl', flame: 'lilac', flameHex: '#bd82ff', solidHex: 0xeee9f2, bands: [404.4, 404.7, 766.5] },
  { id: 'calcium', symbol: 'Ca²⁺', salt: 'Calcium chloride', formula: 'CaCl₂', flame: 'orange-red', flameHex: '#ff6338', solidHex: 0xeee9df, bands: [422.7, 616.2, 643.9] },
  { id: 'copper', symbol: 'Cu²⁺', salt: 'Copper(II) chloride', formula: 'CuCl₂', flame: 'blue-green', flameHex: '#2de0bd', solidHex: 0x4aa990, bands: [510.5, 521.8, 578.2] }
];
const equipment = [
  { id: 'flask', icon: '⚗', name: 'Conical flask', sub: 'Mix and react liquids' },
  { id: 'beaker', icon: '▱', name: 'Beaker', sub: 'Hold and heat liquids' },
  { id: 'tube', icon: '▯', name: 'Test tube', sub: 'Small-scale reactions' },
  { id: 'bunsen', icon: '♨', name: 'Bunsen burner', sub: 'Heat apparatus' },
  { id: 'tripod', icon: '⌂', name: 'Tripod and gauze', sub: 'Support when heating' },
  { id: 'balance', icon: '⚖', name: 'Electronic balance', sub: 'Measure mass' },
  { id: 'thermometer', icon: '🌡', name: 'Thermometer', sub: 'Measure temperature' },
  { id: 'phmeter', icon: 'pH', name: 'pH meter', sub: 'Measure acidity' }
];
const reactantShelf = [
  { id: 'hcl', icon: 'HCl', name: 'Hydrochloric acid', formula: 'HCl(aq)', unit: 'mL', max: 100, step: 5, color: 0xbce8ef, ph: 1 },
  { id: 'naoh', icon: 'OH', name: 'Sodium hydroxide', formula: 'NaOH(aq)', unit: 'mL', max: 100, step: 5, color: 0xd1eef2, ph: 13 },
  { id: 'h2so4', icon: 'H₂', name: 'Sulfuric acid', formula: 'H₂SO₄(aq)', unit: 'mL', max: 100, step: 5, color: 0xd4e9c7, ph: 1 },
  { id: 'cuso4', icon: 'Cu', name: 'Copper sulfate', formula: 'CuSO₄(s)', unit: 'g', max: 25, step: 1, color: 0x198bd1, ph: 6 },
  { id: 'cuo', icon: 'CuO', name: 'Copper oxide', formula: 'CuO(s)', unit: 'g', max: 20, step: 1, color: 0x25282b, ph: 7 },
  { id: 'mg', icon: 'Mg', name: 'Magnesium', formula: 'Mg(s)', unit: 'g', max: 10, step: .5, color: 0xbfc7ca, ph: 7 },
  { id: 'caco3', icon: 'Ca', name: 'Calcium carbonate', formula: 'CaCO₃(s)', unit: 'g', max: 25, step: 1, color: 0xe8e6d9, ph: 7 },
  { id: 'lime', icon: 'CO₂', name: 'Limewater', formula: 'Ca(OH)₂(aq)', unit: 'mL', max: 100, step: 5, color: 0xe8eee8, ph: 11 }
];
const freeReactionRules = [
  { id: 'hcl-naoh', reactants: ['hcl', 'naoh'], symbol: 'HCl(aq) + NaOH(aq) → NaCl(aq) + H₂O(l)', word: 'hydrochloric acid + sodium hydroxide → sodium chloride + water', kind: 'neutralisation', product: 'sodium chloride + water', productColor: 0xb9e7e7, heat: 8, duration: 2.8 },
  { id: 'h2so4-naoh', reactants: ['h2so4', 'naoh'], symbol: 'H₂SO₄(aq) + 2NaOH(aq) → Na₂SO₄(aq) + 2H₂O(l)', word: 'sulfuric acid + sodium hydroxide → sodium sulfate + water', kind: 'neutralisation', product: 'sodium sulfate + water', productColor: 0xb9e7e7, heat: 10, duration: 3.1 },
  { id: 'hcl-cuo', reactants: ['hcl', 'cuo'], symbol: 'CuO(s) + 2HCl(aq) → CuCl₂(aq) + H₂O(l)', word: 'copper oxide + hydrochloric acid → copper chloride + water', kind: 'dissolving', product: 'copper chloride solution', productColor: 0x3f9ed0, heat: 4, duration: 3.2 },
  { id: 'h2so4-cuo', reactants: ['h2so4', 'cuo'], symbol: 'CuO(s) + H₂SO₄(aq) → CuSO₄(aq) + H₂O(l)', word: 'copper oxide + sulfuric acid → copper sulfate + water', kind: 'dissolving', product: 'copper sulfate solution', productColor: 0x268ed2, heat: 4, duration: 3.2 },
  { id: 'hcl-mg', reactants: ['hcl', 'mg'], symbol: 'Mg(s) + 2HCl(aq) → MgCl₂(aq) + H₂(g)', word: 'magnesium + hydrochloric acid → magnesium chloride + hydrogen', kind: 'gas', gas: 'H₂', product: 'magnesium chloride + hydrogen gas', productColor: 0x9edce7, heat: 5, duration: 3.5 },
  { id: 'h2so4-mg', reactants: ['h2so4', 'mg'], symbol: 'Mg(s) + H₂SO₄(aq) → MgSO₄(aq) + H₂(g)', word: 'magnesium + sulfuric acid → magnesium sulfate + hydrogen', kind: 'gas', gas: 'H₂', product: 'magnesium sulfate + hydrogen gas', productColor: 0x9edce7, heat: 5, duration: 3.5 },
  { id: 'hcl-caco3', reactants: ['hcl', 'caco3'], symbol: 'CaCO₃(s) + 2HCl(aq) → CaCl₂(aq) + CO₂(g) + H₂O(l)', word: 'calcium carbonate + hydrochloric acid → calcium chloride + carbon dioxide + water', kind: 'gas', gas: 'CO₂', product: 'calcium chloride + carbon dioxide', productColor: 0xdad6b6, heat: 3, duration: 3.4 },
  { id: 'h2so4-caco3', reactants: ['h2so4', 'caco3'], symbol: 'CaCO₃(s) + H₂SO₄(aq) → CaSO₄(s) + CO₂(g) + H₂O(l)', word: 'calcium carbonate + sulfuric acid → calcium sulfate + carbon dioxide + water', kind: 'gas-precipitate', gas: 'CO₂', precipitate: true, product: 'calcium sulfate + carbon dioxide', productColor: 0xd8d2b8, heat: 3, duration: 3.4 },
  { id: 'mg-cuso4', reactants: ['mg', 'cuso4'], symbol: 'Mg(s) + CuSO₄(aq) → MgSO₄(aq) + Cu(s)', word: 'magnesium + copper sulfate → magnesium sulfate + copper', kind: 'displacement', precipitate: true, product: 'magnesium sulfate + copper', productColor: 0x9f6e45, heat: 2, duration: 3.2 },
  { id: 'naoh-cuso4', reactants: ['naoh', 'cuso4'], symbol: 'CuSO₄(aq) + 2NaOH(aq) → Cu(OH)₂(s) + Na₂SO₄(aq)', word: 'copper sulfate + sodium hydroxide → copper hydroxide + sodium sulfate', kind: 'precipitate', precipitate: true, product: 'copper hydroxide precipitate', productColor: 0x4d8fb7, duration: 2.8 },
  { id: 'lime-cuso4', reactants: ['lime', 'cuso4'], symbol: 'CuSO₄(aq) + Ca(OH)₂(aq) → Cu(OH)₂(s) + CaSO₄(s)', word: 'copper sulfate + limewater → copper hydroxide + calcium sulfate', kind: 'precipitate', precipitate: true, product: 'copper hydroxide precipitate', productColor: 0x4d8fb7, duration: 2.8 },
  { id: 'hcl-lime', reactants: ['hcl', 'lime'], symbol: '2HCl(aq) + Ca(OH)₂(aq) → CaCl₂(aq) + 2H₂O(l)', word: 'hydrochloric acid + limewater → calcium chloride + water', kind: 'neutralisation', product: 'calcium chloride + water', productColor: 0xb9e7e7, heat: 5, duration: 2.8 },
  { id: 'h2so4-lime', reactants: ['h2so4', 'lime'], symbol: 'H₂SO₄(aq) + Ca(OH)₂(aq) → CaSO₄(s) + 2H₂O(l)', word: 'sulfuric acid + limewater → calcium sulfate + water', kind: 'precipitate', precipitate: true, product: 'calcium sulfate precipitate', productColor: 0xd9d4bd, heat: 6, duration: 3 },
  { id: 'lime-co2', reactants: ['lime', 'CO₂'], symbol: 'Ca(OH)₂(aq) + CO₂(g) → CaCO₃(s) + H₂O(l)', word: 'limewater + carbon dioxide → calcium carbonate + water', kind: 'precipitate', precipitate: true, product: 'milky calcium carbonate', productColor: 0xe8e6d9, duration: 3 }
];
const state = { selected: 0, subject: 'chemistry', subjectTabX: 149, subjectTabW: 114, sidebarScroll: { chemistry: 0, biology: 0, physics: 0 }, running: false, complete: false, temp: 20, ph: 7, time: 0, volume: 0, progress: 0, tab: 'equipment', graphModal: false, evaluationModal: false, assessmentMode: false, assessmentSession: null, focusMode: false, methodDropdown: false, methodStepSelection: null, reactantSafety: null, points: [], hover: null, drag: null, pour: null, burner: false, coolingWater: false, particles: [], layout: null, flamePhase: 0, transferred: 0, workspace: [], nextItem: 1, dose: null, reaction: null, massStage: 0, massLidOn: true, massTransfer: null, massBefore: 4.01, massAfter: null, hydrogenStage: 0, hydrogenTimer: 0, hydrogenAudioPlayed: false, hydrogenGas: 0, saltsStage: 0, saltsTimer: 0, chromSelectedDye: null, electroRecorded: false, electroWeighing: false, electroWeighTimer: 0, titrationStage: 0, titrationVolume: 0, titrationDropTimer: 0, titrationDrops: 0, titrationIndicator: false, titrationIndicatorTimer: 0, titrationRecorded: false, ratesStage: 0, ratesStageTimer: 0, ratesTrialIndex: 0, ratesTargetTemp: 20, ratesBathTemp: 20, ratesConditioning: false, ratesResults: [], thermiteTimer: 0, thermiteAudioPlayed: false, displacementStage: 0, displacementTimer: 0, displacementRecorded: false, flameTestStage: 0, flameTestTimer: 0, flameTestSalt: 0, flameTestTested: [], starchStage: 0, starchTimer: 0, lipaseStage: 0, lipaseTimer: 0, lipaseTrialIndex: 0, lipaseTargetTemp: 20, lipaseBathTemp: 20, lipaseConditioning: false, lipaseResults: [], respirationStage: 0, respirationTimer: 0, respirationResults: [], osmosisStage: 0, osmosisTimer: 0, osmosisTrialIndex: 0, osmosisConcentration: 0, osmosisResults: [], potometerStage: 0, potometerTimer: 0, potometerTrialIndex: 0, potometerWindSpeed: 0, potometerBubbleMm: 0, potometerResults: [], pondweedDistance: 20, pondweedLampOn: true, pondweedTimer: 0, pondweedBubbles: 0, pondweedResults: [], quadratStage: 0, quadratTimer: 0, quadratSampleIndex: 0, quadratCurrentCount: 0, quadratResults: [], captureStage: 0, captureTimer: 0, captureFirstCatch: 16, captureSecondCatch: 20, captureRecaptured: 6, meadowWindClock: 0, transectStage: 0, transectTimer: 0, transectStationIndex: 0, transectDistanceM: 0, transectCurrentObservation: null, transectResults: [], shoreTideClock: 0, shoreTideProgress: 0, rippleStage: 0, rippleTimer: 0, rippleTrialIndex: 0, rippleFrequencyHz: 4, rippleTenWavelengthCm: 0, rippleWavelengthCm: 0, rippleSpeedMs: 0, rippleResults: [], rippleWaveClock: 0, newtonForce: 0.2, newtonMass: 1.0, newtonPos: 0, newtonVel: 0, newtonAcc: 0.2, newtonTimer: 0, newtonRunning: false, newtonGate1Time: null, newtonGate2Time: null, newtonGate1Velocity: null, newtonGate2Velocity: null, newtonResults: [], electromagnetStage: 0, electromagnetTimer: 0, electromagnetTrialIndex: 0, electromagnetTurns: 10, electromagnetClips: 0, electromagnetResults: [], convectionStage: 0, convectionTimer: 0, conductionStage: 0, conductionTimer: 0, thermalStage: 0, thermalTimer: 0, thermalCaptured: false, densityStage: 0, densitySample: 0, densityTimer: 0, densityRecorded: false, densityResults: [], hookeStage: 0, hookeTimer: 0, hookeTrialIndex: 0, hookeForceN: 0, hookeResults: [], shcStage: 0, shcTimer: 0, shcEnergyJ: 0, shcTemperatureC: 20, shcResults: [], wireStage: 0, wireTimer: 0, wireTrialIndex: 0, wireLengthCm: 20, wireVoltageV: 1.5, wireResults: [], fieldStage: 0, fieldTimer: 0, fieldConfigIndex: 0, fieldResults: [], nuclearStage: 0, nuclearTimer: 0, nuclearSource: 0, nuclearPreviousSource: 0, nuclearSourceTransition: 1, nuclearAbsorber: 0, nuclearCount: 0, nuclearAnimAbsorber: 0, nuclearAnimProgress: 1, nuclearResults: [], nuclearPulseClock: 0 };
state.shcMaterial = 'aluminium';
Object.assign(state, { transformationStage: 0, transformationTimer: 0, transformationResults: [] });
Object.assign(state, { antibioticStage: 0, antibioticTimer: 0, antibioticResults: [], antibioticMeasuredIndex: -1 });
Object.assign(state, { agarDiffusionStage: 0, agarDiffusionTimer: 0, agarDiffusionResults: [] });
Object.assign(state, { latentStage: 0, latentTimer: 0, latentMaterial: 'paraffin', latentTemperatureC: 20, latentPhaseFraction: 0, latentHeatingResults: [], latentCoolingResults: [] });
Object.assign(state, { ivStage: 0, ivTimer: 0, ivDeviceIndex: 0, ivPreviousDeviceIndex: 0, ivDeviceTransition: 1, ivSupplyV: 0, ivDeviceV: 0, ivCurrentA: 0, ivLastSampleIndex: 0, ivSweepReadings: [], ivResults: [], ivPulseClock: 0 });
state.toast = 'Click equipment to add it, or drag it onto the bench.';
state.hookeFocusModal = false;
state.hookeFocusProgress = 0;
Object.assign(state, { pondweedCountAnimating: false, pondweedCountTimer: 0, pondweedPendingBpm: null });
const pondweedCountAnimationDuration = 2;
const alkaliMetals = [
  { id: 'lithium', name: 'Lithium', symbol: 'Li', color: '#bf5961', flame: 'no visible flame', observation: 'Floats, fizzes gently and moves slowly across the water surface.', duration: 3.4, temperatureRise: 18 },
  { id: 'sodium', name: 'Sodium', symbol: 'Na', color: '#d89235', flame: 'yellow-orange flame', observation: 'Melts into a silvery ball, darts rapidly and burns with a yellow-orange flame.', duration: 2.75, temperatureRise: 42 },
  { id: 'potassium', name: 'Potassium', symbol: 'K', color: '#8c63bc', flame: 'lilac flame', observation: 'Skates vigorously, ignites with a lilac flame and produces the strongest fizzing.', duration: 2.25, temperatureRise: 64 }
];
Object.assign(state, { alkaliStage: 0, alkaliTimer: 0, alkaliMetal: 0, alkaliResults: [], alkaliReactionProgress: 0 });
function alkaliMetal() { return alkaliMetals[Math.max(0, Math.min(alkaliMetals.length - 1, state.alkaliMetal || 0))] }
function alkaliStepIndex() { return state.alkaliStage === 0 || state.alkaliStage === 5 ? 0 : state.alkaliStage === 1 ? 1 : state.alkaliStage === 2 || state.alkaliStage === 3 ? 2 : 3 }
function resetAlkaliPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 7;
  state.alkaliStage = 0; state.alkaliTimer = 0; state.alkaliMetal = 0; state.alkaliResults = []; state.alkaliReactionProgress = 0; state.lastReactant = alkaliMetals[0].id; state.tab = 'bench';
  state.toast = 'Simulation safety screen is in place. Lithium is the first tiny sample ready in the covered water trough.';
}
function activateAlkali(label) {
  const metal = alkaliMetal(), stage = state.alkaliStage;
  if (label === 'LOWER METAL' && stage === 0) {
    state.alkaliStage = 1; state.alkaliTimer = 0; state.alkaliReactionProgress = 0; state.progress = (state.alkaliResults.length + .05) / alkaliMetals.length; state.running = true; state.complete = false;
    state.toast = `Remote forceps are lowering a tiny ${metal.name.toLowerCase()} sample into the protected water trough.`;
  } else if (label === 'RECORD OBSERVATION' && stage === 3) {
    if (!state.alkaliResults.some(result => result.id === metal.id)) state.alkaliResults.push({ ...metal });
    state.progress = state.alkaliResults.length / alkaliMetals.length; state.alkaliStage = 4; state.running = false;
    state.complete = state.alkaliResults.length === alkaliMetals.length;
    state.toast = state.complete ? 'All three simulated observations are recorded. Reactivity increases from lithium to sodium to potassium.' : `${metal.name} recorded. Prepare the next protected trial with ${alkaliMetals[state.alkaliResults.length].name.toLowerCase()}.`;
    if (state.complete) state.tab = 'graph';
  } else if (label === 'NEXT METAL' && stage === 4 && !state.complete) {
    state.alkaliStage = 5; state.alkaliTimer = 0; state.running = true; state.progress = state.alkaliResults.length / alkaliMetals.length;
    state.toast = 'The forceps return to the sample tray while the used reaction is safely cleared from the simulation.';
  } else if (label === 'VIEW RESULTS' || label === 'RESULTS') {
    state.tab = 'graph';
    state.toast = state.alkaliResults.length ? 'Compare the three observations. Reactivity increases down Group 1.' : 'Complete at least one protected trial before opening the comparison.';
  } else if (label === 'RESET SERIES') resetAlkaliPractical();
}
let lastSelectedPractical = state.selected;
const ratesTemperatures = [20, 30, 40, 50, 60], ratesBathPosition = { x: 2.55, y: .43, z: -.42 }, ratesCrossPosition = { x: -.15, y: .12, z: .25 };
function ratesMeasuredTime(temp = state.ratesTargetTemp) { return +(42 * Math.pow(.72, (temp - 20) / 10)).toFixed(1) }
function ratesVisualDuration() { return 2.2 + ratesMeasuredTime() / 14 }
function ratesCrossVisibility() { const q = Math.max(0, Math.min(1, state.progress)); return 1 - q * q * (3 - 2 * q) }
function ratesReceiverWorld() { if (state.ratesStage !== 1) return state.ratesStage === 0 ? { ...ratesBathPosition } : { ...ratesCrossPosition }; const q = Math.max(0, Math.min(1, state.ratesStageTimer / 1.8)), ease = q * q * (3 - 2 * q); return { x: ratesBathPosition.x + (ratesCrossPosition.x - ratesBathPosition.x) * ease, y: ratesBathPosition.y + (ratesCrossPosition.y - ratesBathPosition.y) * ease + Math.sin(Math.PI * ease) * .72, z: ratesBathPosition.z + (ratesCrossPosition.z - ratesBathPosition.z) * ease } }
const starchStageDurations = { 1: 3.8, 3: 4.8, 5: 3.2, 7: 3.8 };
const lipaseTemperatures = [20, 30, 40, 50, 60];
function lipaseMeasuredTime(temp = state.lipaseTargetTemp) { return ({ 20: 68, 30: 39, 40: 22, 50: 34, 60: 104 })[temp] || 68 }
function lipaseVisualDuration(temp = state.lipaseTargetTemp) { return 2.7 + lipaseMeasuredTime(temp) / 25 }
function lipaseReactionProgress() { return state.lipaseStage < 2 ? 0 : state.lipaseStage > 2 ? 1 : Math.max(0, Math.min(1, state.lipaseTimer / lipaseVisualDuration())) }
const transformationStageDurations = { 1: 1.8, 3: 7.8, 5: 5.8, 7: 5.8, 9: 12.6, 11: 6.4 };
const transformationPlateResults = [
  { id: 'plus_amp_ara', treatment: '+DNA', medium: 'LB / amp / ara', colonies: 74, growth: true, fluorescent: true, explanation: 'Plasmid ampR permits growth; arabinose switches on GFP expression.' },
  { id: 'plus_amp', treatment: '+DNA', medium: 'LB / amp', colonies: 61, growth: true, fluorescent: false, explanation: 'Plasmid ampR permits growth, but without arabinose GFP remains off.' },
  { id: 'minus_lb', treatment: '−DNA', medium: 'LB', colonies: 'lawn', growth: true, fluorescent: false, explanation: 'Non-selective LB confirms that the untransformed control cells were viable.' },
  { id: 'minus_amp', treatment: '−DNA', medium: 'LB / amp', colonies: 0, growth: false, fluorescent: false, explanation: 'Without the plasmid, cells lack ampR and do not form colonies.' }
];
function transformationStageProgress() { const duration = transformationStageDurations[state.transformationStage]; return duration ? Math.max(0, Math.min(1, state.transformationTimer / duration)) : 0 }
const respirationTemperatures = [10, 20, 30, 40, 60], respirationFinalGasVolumes = [6, 22, 51, 78, 4], respirationStageDurations = { 1: 3.8, 3: 4.6, 5: 4.8, 7: 7.2 };
function respirationIncubationProgress() { const stage = state.respirationStage || 0; return stage < 7 ? 0 : stage > 7 ? 1 : Math.max(0, Math.min(1, state.respirationTimer / respirationStageDurations[7])) }
function respirationGasVolume(temperature, progress = respirationIncubationProgress()) { const index = respirationTemperatures.indexOf(temperature), finalVolume = respirationFinalGasVolumes[index] || 0, lag = temperature === 10 ? .2 : temperature === 60 ? .12 : .06, q = Math.max(0, Math.min(1, (progress - lag) / Math.max(.01, 1 - lag))); return +(finalVolume * (1 - Math.pow(1 - q, 1.65))).toFixed(1) }
const antibioticDiscs = [
  { id: 'penicillin', code: 'P', name: 'Penicillin', diameterMm: 18, colour: '#4e83b5', angle: -2.36 },
  { id: 'erythromycin', code: 'E', name: 'Erythromycin', diameterMm: 24, colour: '#a45d92', angle: -.78 },
  { id: 'tetracycline', code: 'T', name: 'Tetracycline', diameterMm: 30, colour: '#d28b3d', angle: .78 },
  { id: 'control', code: 'C', name: 'Sterile-water control', diameterMm: 0, colour: '#6e858c', angle: 2.36 }
];
const antibioticStageDurations = { 1: 7.2, 3: 5.2, 5: 5.2, 7: 7.2, 9: 5.4 };
function antibioticStageProgress() { const duration = antibioticStageDurations[state.antibioticStage]; return duration ? Math.max(0, Math.min(1, state.antibioticTimer / duration)) : 0 }
function antibioticGrowthProgress() { const stage = state.antibioticStage || 0; return stage < 7 ? 0 : stage > 7 ? 1 : antibioticStageProgress() }
function antibioticVisibleMeasurementCount() { if (state.antibioticStage < 9) return 0; if (state.antibioticStage > 9) return antibioticDiscs.length; return Math.min(antibioticDiscs.length, Math.floor(antibioticStageProgress() * antibioticDiscs.length + .001)) }
const osmosisConcentrations = [0, 0.2, 0.4, 0.6, 0.8], osmosisStageDurations = { 1: 2.6, 2: 5.4, 4: 3.4, 6: 3.2 }, osmosisInitialMass = 5;
function osmosisPercentChange(concentration = state.osmosisConcentration) { return ({ 0: 16, 0.2: 8, 0.4: 1.6, 0.6: -9, 0.8: -17 })[concentration] ?? 0 }
function osmosisFinalMass(concentration = state.osmosisConcentration) { return +(osmosisInitialMass * (1 + osmosisPercentChange(concentration) / 100)).toFixed(2) }
function osmosisDirection(concentration = state.osmosisConcentration) { const change = osmosisPercentChange(concentration); return change > 2 ? 'into the potato cells' : change < -2 ? 'out of the potato cells' : 'in both directions at almost equal rates' }
function osmosisProcessProgress() { const stage = state.osmosisStage || 0; if (stage < 2) return 0; if (stage > 2) return 1; return Math.max(0, Math.min(1, state.osmosisTimer / osmosisStageDurations[2])) }
const agarCubeSidesCm = [1, 2, 3], agarDiffusionDepthCm = .3, agarDiffusionStageDurations = { 1: 3.4, 3: 4.2, 5: 7.2, 7: 4.4, 9: 5.6 };
function agarDiffusionResult(sideCm) {
  const surfaceAreaCm2 = 6 * sideCm * sideCm, volumeCm3 = sideCm ** 3, coreSideCm = Math.max(0, sideCm - 2 * agarDiffusionDepthCm), coreVolumeCm3 = coreSideCm ** 3, diffusedVolumeCm3 = volumeCm3 - coreVolumeCm3;
  return { sideCm, surfaceAreaCm2, volumeCm3, surfaceAreaToVolume: +(surfaceAreaCm2 / volumeCm3).toFixed(2), diffusionDepthCm: agarDiffusionDepthCm, coreSideCm: +coreSideCm.toFixed(1), coreVolumeCm3: +coreVolumeCm3.toFixed(3), diffusedVolumeCm3: +diffusedVolumeCm3.toFixed(3), percentageDiffused: +(diffusedVolumeCm3 / volumeCm3 * 100).toFixed(1) };
}
function agarDiffusionSoakProgress() { const stage = state.agarDiffusionStage || 0; if (stage < 5) return 0; if (stage > 5) return 1; return Math.max(0, Math.min(1, state.agarDiffusionTimer / agarDiffusionStageDurations[5])) }
function agarDiffusionStageProgress() { const duration = agarDiffusionStageDurations[state.agarDiffusionStage]; return duration ? Math.max(0, Math.min(1, state.agarDiffusionTimer / duration)) : 0 }
function agarDiffusionStepIndex() { const stage = state.agarDiffusionStage || 0; return stage < 2 ? 0 : stage < 5 ? 1 : stage < 8 ? 2 : 3 }
function osmosisIsotonicConcentration() { const sorted = [...state.osmosisResults].sort((a, b) => a.concentration - b.concentration); for (let i = 1; i < sorted.length; i++) { const a = sorted[i - 1], b = sorted[i]; if (a.percentChange >= 0 && b.percentChange <= 0) return +(a.concentration + (0 - a.percentChange) * (b.concentration - a.concentration) / (b.percentChange - a.percentChange)).toFixed(2) } return null }
const potometerWindSpeeds = [0, 0.5, 1, 1.5], potometerDistancesMm = [12, 22, 34, 47], potometerStageDurations = { 1: 2.5, 3: 2.6, 5: 6.2 };
function potometerDistance(windSpeed = state.potometerWindSpeed) { const index = potometerWindSpeeds.indexOf(windSpeed); return potometerDistancesMm[index < 0 ? 0 : index] }
function potometerRate(windSpeed = state.potometerWindSpeed) { return +(potometerDistance(windSpeed) / 5).toFixed(1) }
function potometerStageProgress() { const stage = state.potometerStage || 0, duration = potometerStageDurations[stage]; return duration ? Math.max(0, Math.min(1, state.potometerTimer / duration)) : 0 }
const quadratSamples = [
  { xM: 2, yM: 7, daisies: 4, worldX: -1.85, worldZ: 3.48, rotation: -.18 },
  { xM: 8, yM: 3, daisies: 7, worldX: 1.72, worldZ: 2.36, rotation: .14 },
  { xM: 5, yM: 5, daisies: 5, worldX: -.04, worldZ: 2.98, rotation: -.08 },
  { xM: 1, yM: 2, daisies: 3, worldX: -2.35, worldZ: 2.14, rotation: .2 },
  { xM: 7, yM: 8, daisies: 6, worldX: 1.18, worldZ: 3.7, rotation: -.12 }
];
const quadratStageDurations = { 1: 3.5, 3: 1.25, 5: 2.4, 7: 4.2 };
function currentQuadratSample() { return quadratSamples[Math.min(quadratSamples.length - 1, state.quadratSampleIndex || 0)] }
function quadratStageProgress() { const duration = quadratStageDurations[state.quadratStage]; return duration ? Math.max(0, Math.min(1, state.quadratTimer / duration)) : 0 }
function quadratMean() { return state.quadratResults.length ? state.quadratResults.reduce((sum, result) => sum + result.daisies, 0) / state.quadratResults.length : 0 }
function quadratPopulationEstimate() { return Math.round(quadratMean() * 100) }
const captureStageDurations = { 1: 5.2, 3: 6.4, 5: 6.2, 7: 5.8 };
function captureStageProgress() { const duration = captureStageDurations[state.captureStage]; return duration ? Math.max(0, Math.min(1, state.captureTimer / duration)) : 0 }
function captureVisibleCounts() {
  const stage = state.captureStage || 0, q = captureStageProgress(), smooth = value => { value = Math.max(0, Math.min(1, value)); return value * value * (3 - 2 * value) };
  const firstCaught = stage < 1 ? 0 : stage === 1 ? Math.floor(smooth((q - .45) / .5) * state.captureFirstCatch + .001) : state.captureFirstCatch;
  const firstMarked = stage < 3 ? 0 : stage === 3 ? Math.floor(smooth((q - .43) / .47) * state.captureFirstCatch + .001) : state.captureFirstCatch;
  const released = stage < 5 ? 0 : stage === 5 ? Math.floor(smooth((q - .08) / .58) * state.captureFirstCatch + .001) : state.captureFirstCatch;
  const secondCaught = stage < 5 ? 0 : stage === 5 ? Math.floor(smooth((q - .7) / .3) * state.captureSecondCatch + .001) : stage === 7 ? Math.floor(smooth(q / .42) * state.captureSecondCatch + .001) : stage >= 6 ? state.captureSecondCatch : 0;
  const secondMarked = stage < 6 ? 0 : stage === 7 ? Math.floor(smooth((q - .38) / .5) * state.captureRecaptured + .001) : state.captureRecaptured;
  return { firstCaught, firstMarked, released, secondCaught, secondMarked }
}
const transectStations = [
  { distanceM: 0, zone: 'UPPER', limpets: 8, barnacleCover: 68, seaweedCover: 2 },
  { distanceM: 2, zone: 'UPPER', limpets: 10, barnacleCover: 59, seaweedCover: 5 },
  { distanceM: 4, zone: 'MIDDLE', limpets: 13, barnacleCover: 43, seaweedCover: 14 },
  { distanceM: 6, zone: 'MIDDLE', limpets: 11, barnacleCover: 27, seaweedCover: 33 },
  { distanceM: 8, zone: 'LOWER', limpets: 6, barnacleCover: 11, seaweedCover: 58 },
  { distanceM: 10, zone: 'LOWER', limpets: 2, barnacleCover: 3, seaweedCover: 82 }
];
const transectStageDurations = { 1: 3.15, 3: 2.15, 5: 2.45 };
function currentTransectStation() { return transectStations[Math.min(transectStations.length - 1, state.transectStationIndex || 0)] }
function transectStageProgress() { const duration = transectStageDurations[state.transectStage]; return duration ? Math.max(0, Math.min(1, state.transectTimer / duration)) : 0 }
const rippleTrials = [
  { frequencyHz: 4, tenWavelengthCm: 50 },
  { frequencyHz: 5, tenWavelengthCm: 40.2 },
  { frequencyHz: 6, tenWavelengthCm: 33 },
  { frequencyHz: 7, tenWavelengthCm: 28.8 },
  { frequencyHz: 8, tenWavelengthCm: 24.9 }
];
const rippleStageDurations = { 1: 2.4, 3: 3.2, 5: 2.8 };
function currentRippleTrial() { return rippleTrials[Math.min(rippleTrials.length - 1, state.rippleTrialIndex || 0)] }
function rippleStageProgress() { const duration = rippleStageDurations[state.rippleStage]; return duration ? Math.max(0, Math.min(1, state.rippleTimer / duration)) : 0 }
function rippleTrialMeasurement(trial = currentRippleTrial()) { const wavelengthCm = trial.tenWavelengthCm / 10, speedMs = trial.frequencyHz * trial.tenWavelengthCm / 1000; return { wavelengthCm, speedMs } }
function rippleMeanSpeed() { return state.rippleResults.length ? state.rippleResults.reduce((sum, result) => sum + result.speedMs, 0) / state.rippleResults.length : 0 }
const electromagnetTurnsSeries = [10, 20, 30, 40, 50];
const electromagnetClipSeries = [2, 4, 7, 10, 13];
const electromagnetStageDurations = { 1: 1.05, 3: 1.55, 5: 1.85 };
function electromagnetMeasuredClips(turns = state.electromagnetTurns) { const index = electromagnetTurnsSeries.indexOf(turns); return electromagnetClipSeries[index < 0 ? 0 : index] }
const hookeForcesN = [0, 1, 2, 3, 4, 5, 6];
const hookeExtensionsCm = [0, 2, 4, 6, 8, 10, 13];
const hookeStageDurations = { 1: 3.4 };
const hookeRulerUnloadedReadingCm = 20;
function hookeExtensionCm(force = state.hookeForceN) { const index = hookeForcesN.indexOf(force); return hookeExtensionsCm[index < 0 ? 0 : index] }
function hookeRulerReadingCm(force = state.hookeForceN) { return +(hookeRulerUnloadedReadingCm + hookeExtensionCm(force)).toFixed(1) }
function hookeTotalLengthCm(force = state.hookeForceN) { return 20 + hookeExtensionCm(force) }
function hookeSpringConstant() { return 50 }
function hookeStepIndex() { return state.complete ? 3 : state.hookeStage === 2 ? 2 : state.hookeStage === 1 || state.hookeResults.length ? 1 : 0 }
const shcStageDurations = { 1: 3.8, 3: 8 };
const shcEnergyReadingsJ = [0, 3600, 7200, 10800, 14400, 18000];
const shcMaterials = {
  aluminium: { label: 'ALUMINIUM', specificHeat: 900, colour: 0xaebbc0 },
  copper: { label: 'COPPER', specificHeat: 390, colour: 0xb96d45 }
};
function currentShcMaterial() { return shcMaterials[state.shcMaterial] || shcMaterials.aluminium }
function shcFinalTemperatureC() { return +(20 + 18000 / currentShcMaterial().specificHeat).toFixed(1) }
function shcTemperatureForEnergy(energyJ) { return +(20 + energyJ / currentShcMaterial().specificHeat).toFixed(1) }
function shcHeatingProgress() { return state.shcStage < 3 ? 0 : state.shcStage > 3 ? 1 : Math.max(0, Math.min(1, state.shcTimer / shcStageDurations[3])) }
function shcTemperatureRiseC() { return +(Math.max(0, state.shcTemperatureC - 20)).toFixed(1) }
function shcCalculatedSpecificHeat() { const rise = Math.max(0, state.shcTemperatureC - 20); return rise > 0 ? Math.round(state.shcEnergyJ / rise) : 0 }
function shcStepIndex() {
  if (state.complete || state.shcStage >= 4) return 3;
  if (state.shcStage === 3) return 2;
  if (state.shcStage === 2) return 1;
  if (state.shcStage === 1) return state.shcTimer / shcStageDurations[1] < .29 ? 0 : 1;
  return 0;
}
const latentMaterials = {
  paraffin: { label: 'PARAFFIN WAX', short: 'PARAFFIN', meltingPointC: 55, highTemperatureC: 82, solidColour: 0xf3eee0, liquidColour: 0xffe1a1, sampleForm: 'rounded translucent pellets' },
  stearic: { label: 'STEARIC ACID', short: 'STEARIC ACID', meltingPointC: 69, highTemperatureC: 88, solidColour: 0xf6f4e9, liquidColour: 0xffefc6, sampleForm: 'thin pearly flakes' }
};
const latentStageDurations = { 1: 3.8, 3: 12, 5: 10.5 };
const latentSimulatedStageSeconds = 480;
const latentSampleTimesS = Array.from({ length: 13 }, (_, index) => index * 40);
function currentLatentMaterial() { return latentMaterials[state.latentMaterial] || latentMaterials.paraffin }
function latentClamp(value) { return Math.max(0, Math.min(1, value)) }
function latentSmooth(value) { const q = latentClamp(value); return q * q * (3 - 2 * q) }
function latentHeatingTemperature(progress) {
  const q = latentClamp(progress), material = currentLatentMaterial(), mp = material.meltingPointC;
  if (q < .32) return 20 + (mp - 20) * latentSmooth(q / .32);
  if (q < .62) return mp + .8 * latentSmooth((q - .32) / .3);
  return mp + .8 + (material.highTemperatureC - mp - .8) * latentSmooth((q - .62) / .38);
}
function latentCoolingTemperature(progress) {
  const q = latentClamp(progress), material = currentLatentMaterial(), mp = material.meltingPointC, high = material.highTemperatureC;
  if (q < .28) return high + (mp + .7 - high) * latentSmooth(q / .28);
  if (q < .64) return mp + .7 - 1.4 * latentSmooth((q - .28) / .36);
  return mp - .7 + (24 - mp + .7) * latentSmooth((q - .64) / .36);
}
function latentPhaseFractionFor(stage = state.latentStage, progress = 0) {
  if (stage < 3) return 0;
  if (stage === 3) return latentSmooth((progress - .32) / .3);
  if (stage === 4) return 1;
  if (stage === 5) return 1 - latentSmooth((progress - .28) / .36);
  return 0;
}
function syncLatentHeatGraphPoints() {
  const normalise = (item, series) => ({ x: item.time_s / latentSimulatedStageSeconds, y: (item.temperature_c - 20) / 70, xValue: item.time_s, yValue: item.temperature_c, t: item.time_s, series });
  state.points = [...state.latentHeatingResults.map(item => normalise(item, 'heating')), ...state.latentCoolingResults.map(item => normalise(item, 'cooling'))];
}
function latentStepIndex() { return state.complete ? 3 : state.latentStage < 2 ? 0 : state.latentStage < 4 ? 1 : state.latentStage < 6 ? 2 : 3 }
const wireLengthsCm = [20, 40, 60, 80, 100];
const wireResistanceOhms = [1.8, 3.6, 5.4, 7.2, 9.0];
const wireStageDurations = { 1: 1.45, 4: 2.45 };
function wireResistance(length = state.wireLengthCm) { const index = wireLengthsCm.indexOf(length); return wireResistanceOhms[index < 0 ? 0 : index] }
function wireCurrent(length = state.wireLengthCm) { return +(state.wireVoltageV / wireResistance(length)).toFixed(2) }
function wireStepIndex() { return state.complete ? 3 : state.wireStage >= 3 ? 2 : state.wireStage >= 1 ? 1 : 0 }
const ivDeviceDefinitions = [
  { id: 'resistor', label: '100 Ω RESISTOR', short: 'RESISTOR', colour: '#3a9d8f', conclusion: 'A straight line through the origin: current is proportional to potential difference at constant temperature.' },
  { id: 'lamp', label: '6 V FILAMENT LAMP', short: 'FILAMENT LAMP', colour: '#e58b38', conclusion: 'The curve becomes shallower as the filament heats and its resistance increases.' },
  { id: 'led', label: 'RED LED + 220 Ω', short: 'RED LED', colour: '#d94a61', conclusion: 'Almost no reverse current; forward current rises only after the LED turn-on potential difference.' }
];
const ivSweepLevelsV = [0, 1, 2, 3, 4, 5, 6, 6, 0, 0, -1, -2, -3, -4, -5, -6];
const ivSweepIntervalS = .9, ivSweepDurationS = (ivSweepLevelsV.length - 1) * ivSweepIntervalS, ivDeviceChangeDurationS = 2.1;
function currentIvDevice() { return ivDeviceDefinitions[Math.max(0, Math.min(ivDeviceDefinitions.length - 1, state.ivDeviceIndex || 0))] }
function ivElectricalReading(deviceId = currentIvDevice().id, supplyV = state.ivSupplyV) {
  const supply = Math.max(-6, Math.min(6, Number(supplyV) || 0)), magnitude = Math.abs(supply), sign = Math.sign(supply);
  let voltage = supply, current = 0;
  if (deviceId === 'resistor') current = supply / 100;
  else if (deviceId === 'lamp') current = sign * .21 * Math.sqrt(magnitude / 6);
  else if (deviceId === 'led') {
    if (supply > 1.55) { current = (supply - 1.55) / 220; voltage = Math.min(supply, 1.55 + current * 18) }
    else if (supply < 0) current = -.00002;
  }
  return { supply_v: +supply.toFixed(3), voltage_v: +voltage.toFixed(3), current_a: +current.toFixed(5) };
}
function ivSweepSupply(timer = state.ivTimer) {
  const position = Math.max(0, Math.min(ivSweepLevelsV.length - 1, timer / ivSweepIntervalS)), index = Math.min(ivSweepLevelsV.length - 2, Math.floor(position)), local = position - index, eased = local * local * (3 - 2 * local);
  return ivSweepLevelsV[index] + (ivSweepLevelsV[index + 1] - ivSweepLevelsV[index]) * eased;
}
function ivStepIndex() { if (state.complete || state.ivStage === 5) return 3; if (state.ivStage >= 2) return 3; if (state.ivTimer >= ivSweepIntervalS * 8) return 2; if (state.ivStage === 1) return 1; return 0 }
const fieldConfigurations = [
  { id: 'single', label: 'SINGLE BAR MAGNET', short: 'single N–S', observation: 'Curved, symmetric loops spread from the north pole to the south pole.' },
  { id: 'attraction', label: 'UNLIKE POLES FACING', short: 'N facing S', observation: 'Dense, nearly straight filing chains bridge the gap between unlike poles.' },
  { id: 'repulsion', label: 'LIKE POLES FACING', short: 'N facing N', observation: 'Filing chains bow away from the central gap, leaving a weak neutral region.' }
];
const fieldStageDurations = { 1: 3.35, 3: 4.45, 5: 3.15 };
function fieldStepIndex() { return state.complete ? 3 : state.fieldStage >= 4 ? 3 : state.fieldStage >= 3 ? 2 : state.fieldStage >= 1 ? 1 : 0 }
const nuclearSources = [
  { id: 'none', short: 'NO SOURCE', symbol: '—', isotope: 'background', colour: '#60747c' },
  { id: 'alpha', short: 'α Am-241', symbol: 'α', isotope: 'Am-241', colour: '#ed654f' },
  { id: 'beta', short: 'β Sr-90', symbol: 'β', isotope: 'Sr-90', colour: '#42a7dc' },
  { id: 'gamma', short: 'γ Co-60', symbol: 'γ', isotope: 'Co-60', colour: '#f1bf3e' }
];
const nuclearAbsorbers = [
  { id: 'none', short: 'OPEN BEAM', label: 'none' },
  { id: 'paper', short: 'PAPER', label: 'paper' },
  { id: 'aluminium', short: 'ALUMINIUM', label: 'aluminium' },
  { id: 'lead', short: 'LEAD', label: 'lead' }
];
const nuclearCounts10s = [
  [4, 4, 4, 4],
  [468, 5, 4, 4],
  [612, 548, 11, 6],
  [384, 366, 318, 74]
];
const nuclearSourceTransitionDuration = 1.8;
const nuclearAbsorberTransitionDuration = 1.45;
function nuclearTargetCount10s(source = state.nuclearSource, absorber = state.nuclearAbsorber) { return nuclearCounts10s[source]?.[absorber] ?? 4 }
function nuclearTransmissionFraction(source = state.nuclearSource, absorber = state.nuclearAbsorber) { const open = nuclearTargetCount10s(source, 0); return source && open ? Math.max(0, Math.min(1, (nuclearTargetCount10s(source, absorber) - 4) / Math.max(1, open - 4))) : 0 }
function nuclearStepIndex() { if (state.complete || state.nuclearStage === 6) return 3; if (state.nuclearStage === 5) return 2; if (state.nuclearSource > 0 && state.nuclearStage >= 2) return 1; return 0 }
const convectionDuration = 8.4;
const conductionDuration = 9.4;
const conductionPinTimes = {
  copper: [1.55, 2.55, 3.75, 5.05],
  aluminium: [2.15, 3.45, 4.95, 6.55],
  steel: [3.35, 5.25, 7.15, 8.85]
};
const thermalStageDurations = { 1: 2.65, 3: 2.7 };
const thermalRotationRate = .22;
const thermalSurfaceDefinitions = [
  { id: 'matt_black', label: 'MATT BLACK', target: 82, swatch: '#ff5b24', normal: angle => Math.cos(angle) },
  { id: 'white_paint', label: 'WHITE PAINT', target: 74, swatch: '#f2a13b', normal: angle => -Math.sin(angle) },
  { id: 'brushed_metal', label: 'BRUSHED METAL', target: 52, swatch: '#9a4ea3', normal: angle => -Math.cos(angle) },
  { id: 'polished_metal', label: 'POLISHED METAL', target: 39, swatch: '#3d61a9', normal: angle => Math.sin(angle) }
];
function thermalClamp(value) { return Math.max(0, Math.min(1, value)) }
function thermalCubeAngle() { return -.24 + (state.thermalRotation || 0) }
function thermalHeatFraction() { return thermalClamp(((state.temp || 21) - 21) / 61) }
function thermalSurfaceReadings() {
  const heat = thermalHeatFraction();
  return thermalSurfaceDefinitions.map(surface => ({ ...surface, temperature: 21 + (surface.target - 21) * heat }));
}
function thermalFacingSurface() {
  const angle = thermalCubeAngle();
  return thermalSurfaceReadings().map(surface => ({ ...surface, visibility: surface.normal(angle) })).sort((a, b) => b.visibility - a.visibility)[0];
}
function thermalColour(temperature) {
  const stops = [
    [20, [7, 20, 60]],
    [39, [61, 97, 169]],
    [52, [154, 78, 163]],
    [74, [255, 105, 38]],
    [82, [255, 221, 55]],
    [90, [255, 251, 209]]
  ];
  const value = Math.max(stops[0][0], Math.min(stops.at(-1)[0], temperature));
  let lower = stops[0], upper = stops.at(-1);
  for (let i = 1; i < stops.length; i++) if (value <= stops[i][0]) { lower = stops[i - 1]; upper = stops[i]; break }
  const q = (value - lower[0]) / Math.max(.001, upper[0] - lower[0]), rgb = lower[1].map((channel, i) => Math.round(channel + (upper[1][i] - channel) * q));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}
const densitySamples = [
  { id: 'granite', name: 'Granite stone', mass: 187.5, vol: 75.0, density: 2.50, color: 0x78909c, shape: 'stone' },
  { id: 'brass', name: 'Brass weight', mass: 212.5, vol: 25.0, density: 8.50, color: 0xd4af37, shape: 'brass' },
  { id: 'aluminum', name: 'Aluminum block', mass: 108.0, vol: 40.0, density: 2.70, color: 0xb0bec5, shape: 'block' },
  { id: 'steel', name: 'Steel nut', mass: 157.0, vol: 20.0, density: 7.85, color: 0x546e7a, shape: 'nut' }
];
const densityTransferDuration = 3.6, densityImmersionDuration = 4.4;
function densityClamp(value) { return Math.max(0, Math.min(1, value)) }
function densitySmooth(value) { value = densityClamp(value); return value * value * (3 - 2 * value) }
function densityFillProgress() {
  if (state.densityStage < 2) return 0;
  if (state.densityStage > 2) return 1;
  return densitySmooth((state.densityTimer || 0) / .82);
}
function densityTransferProgress() {
  if (state.densityStage < 2) return 0;
  if (state.densityStage > 2) return 1;
  return densitySmooth(((state.densityTimer || 0) - .58) / (densityTransferDuration - .58));
}
function densityDisplacementProgress() {
  if (state.densityStage < 4) return 0;
  if (state.densityStage > 4) return 1;
  return densitySmooth(((state.densityTimer || 0) - .95) / (densityImmersionDuration - 1.2));
}
function densityStepIndex() {
  const s = state.densityStage || 0;
  return s === 0 ? 0 : s <= 2 ? 1 : s <= 4 ? 2 : 3;
}
function ratesStepIndex() { return state.ratesStage >= 4 ? 3 : state.ratesStage === 3 ? 2 : state.ratesStage >= 1 ? 1 : 0 }
function phVesselItems() { return state.workspace.filter(isPhVessel) }
function phMeterReading(meter) { const target = meter?.attachedTo && state.workspace.find(it => it.uid === meter.attachedTo && isPhVessel(it)); return Number.isFinite(target?.ph) ? target.ph : null }
function nearestPhVessel(meter, maxDistance = Infinity) { const origin = { x: meter?.x || 0, y: meter?.y || 0 }; return phVesselItems().map(target => { const anchor = workspaceScreenAnchor(target); return { target, distance: Math.hypot(origin.x - anchor.x, origin.y - anchor.y) } }).filter(candidate => candidate.distance <= maxDistance).sort((a, b) => a.distance - b.distance)[0] || null }
function dockPhMeter(meter, target) { if (!meter || !target || !isPhVessel(target)) return false; meter.attachedTo = target.uid; meter.x = target.x; meter.y = target.y; return true }
function autoPositionPhMeters(preferredTarget = null) { for (const meter of state.workspace.filter(it => it.type === 'phmeter')) { const current = meter.attachedTo && state.workspace.find(it => it.uid === meter.attachedTo && isPhVessel(it)); if (current) { meter.x = current.x; meter.y = current.y; continue } const choice = preferredTarget && isPhVessel(preferredTarget) ? preferredTarget : nearestPhVessel(meter)?.target; if (choice) dockPhMeter(meter, choice); else meter.attachedTo = null } }
function acidBaseAmount(contents, id, concentration) { return (contents || []).filter(entry => entry.id === id && entry.unit === 'mL').reduce((sum, entry) => sum + entry.amount / 1000 * concentration, 0) }
function solidMoles(contents, id, molarMass) { return (contents || []).filter(entry => entry.id === id && entry.unit === 'g').reduce((sum, entry) => sum + entry.amount / molarMass, 0) }
function calculateContainerPh(item) {
  const contents = item?.contents || [], liquidVolumeL = contents.filter(entry => entry.unit === 'mL').reduce((sum, entry) => sum + entry.amount / 1000, 0);
  if (liquidVolumeL <= 0) return null;
  let acidMoles = acidBaseAmount(contents, 'hcl', .1) + acidBaseAmount(contents, 'h2so4', .1);
  let baseMoles = acidBaseAmount(contents, 'naoh', .1) + acidBaseAmount(contents, 'lime', .001);
  const reaction = item.reaction, q = reaction ? Math.max(0, Math.min(1, reaction.progress || 0)) : 0, ruleId = reaction?.ruleId || '';
  if (ruleId === 'hcl-cuo' || ruleId === 'h2so4-cuo') acidMoles -= Math.min(acidMoles, 2 * solidMoles(contents, 'cuo', 79.545) * q);
  else if (ruleId === 'hcl-mg' || ruleId === 'h2so4-mg') acidMoles -= Math.min(acidMoles, 2 * solidMoles(contents, 'mg', 24.305) * q);
  else if (ruleId === 'hcl-caco3' || ruleId === 'h2so4-caco3') acidMoles -= Math.min(acidMoles, 2 * solidMoles(contents, 'caco3', 100.086) * q);
  else if (ruleId === 'naoh-cuso4' || ruleId === 'lime-cuso4') baseMoles -= Math.min(baseMoles, 2 * solidMoles(contents, 'cuso4', 159.609) * q);
  acidMoles = Math.max(0, acidMoles); baseMoles = Math.max(0, baseMoles);
  const excess = acidMoles - baseMoles;
  if (Math.abs(excess) < 1e-10) return 7;
  const concentration = Math.max(1e-14, Math.abs(excess) / liquidVolumeL), reading = excess > 0 ? -Math.log10(concentration) : 14 + Math.log10(concentration);
  return Math.max(0, Math.min(14, reading));
}
function refreshWorkspacePh() {
  for (const vessel of phVesselItems()) vessel.ph = calculateContainerPh(vessel);
  autoPositionPhMeters();
  const active = [...state.workspace].reverse().find(it => it.type === 'phmeter' && phMeterReading(it) != null), reading = phMeterReading(active);
  if (reading != null) state.ph = reading;
}
function reactionRuleFor(item) { const ids = new Set((item?.contents || []).map(c => c.id)); for (const gas of item?.generatedGases || []) ids.add(gas); return freeReactionRules.find(rule => rule.reactants.every(id => ids.has(id)) && !(item.reactedPairs || []).includes(rule.id)) || null }
function triggerWorkspaceReaction(item, rule) { if (!item || !rule) return; const previous = state.reaction; if (previous && !previous.complete) previous.complete = true; const reaction = { ruleId: rule.id, targetUid: item.uid, symbol: rule.symbol, word: rule.word, kind: rule.kind, product: rule.product, productColor: rule.productColor, gas: rule.gas || null, precipitate: !!rule.precipitate, heat: rule.heat || 0, duration: rule.duration || 3, t: 0, progress: 0, complete: false }; item.reactedPairs ??= []; item.reactedPairs.push(rule.id); item.reaction = reaction; state.reaction = reaction; state.running = true; state.complete = false; state.time = 0; state.progress = 0; state.lastReactant = rule.reactants.join('+'); state.toast = `Reaction started: ${rule.symbol}` }
function updateWorkspaceReaction(dt) { const reaction = state.reaction; if (!reaction || reaction.complete) return false; reaction.t += dt; reaction.progress = Math.min(1, reaction.t / reaction.duration); const item = state.workspace.find(a => a.uid === reaction.targetUid); if (item) item.reaction = reaction; state.running = true; state.progress = reaction.progress; state.time = reaction.t; state.temp = Math.max(state.temp, 20 + (reaction.heat || 0) * Math.sin(Math.min(1, reaction.progress) * Math.PI)); refreshWorkspacePh(); if (reaction.progress >= 1) { reaction.complete = true; state.running = false; state.toast = `Reaction complete: ${reaction.product}.`; if (item) { item.products ??= []; item.products.push({ ruleId: reaction.ruleId, label: reaction.product }); if (reaction.gas) { item.generatedGases ??= []; if (!item.generatedGases.includes(reaction.gas)) item.generatedGases.push(reaction.gas) } } } return true }
function currentGraphSpec() {
  const id = practicals[state.selected].id, spec = graphSpecs[id] || graphSpecs.rates;
  return id === 'specificheat' ? { ...spec, xMax: Math.ceil((shcFinalTemperatureC() - 20) / 10) * 10 } : spec;
}
function graphReading() { const id = practicals[state.selected].id, s = currentGraphSpec(); let xValue = id === 'chrom' ? state.progress * 10 : Math.min(s.xMax, state.time), yValue = state.temp; if (id === 'mass') yValue = 4.01 + .17 * state.progress; else if (id === 'hydrogen') yValue = state.hydrogenGas; else if (id === 'co2') yValue = 100 * state.progress; else if (id === 'electro') yValue = 48 * state.progress; else if (id === 'chrom') yValue = 6.4 * state.progress; else if (id === 'titration') { xValue = state.titrationVolume; yValue = state.ph } else if (id === 'thermite') { xValue = state.thermiteTimer; yValue = state.temp } else if (id === 'wirelength') { xValue = state.wireLengthCm; yValue = wireResistance() } const x = Math.max(0, Math.min(1, (xValue - s.xMin) / (s.xMax - s.xMin))), y = Math.max(0, Math.min(1, (yValue - s.yMin) / (s.yMax - s.yMin))); return { x, y, xValue, yValue, t: state.time } }
const asphaltTile = document.createElement('canvas'); asphaltTile.width = asphaltTile.height = 96; const asphaltCtx = asphaltTile.getContext('2d'); asphaltCtx.fillStyle = '#1b465c'; asphaltCtx.fillRect(0, 0, 96, 96); let asphaltSeed = 1297; const asphaltRandom = () => ((asphaltSeed = Math.imul(asphaltSeed, 1664525) + 1013904223 >>> 0) / 4294967296); for (let i = 0; i < 520; i++) { asphaltCtx.fillStyle = asphaltRandom() > .52 ? `rgba(137,186,201,${.06 + asphaltRandom() * .16})` : `rgba(3,26,40,${.08 + asphaltRandom() * .18})`; const r = .3 + asphaltRandom() * .9; asphaltCtx.beginPath(); asphaltCtx.arc(asphaltRandom() * 96, asphaltRandom() * 96, r, 0, Math.PI * 2); asphaltCtx.fill() }
let W = 0, H = 0, D = 1, VIEW_W = 0, VIEW_H = 0, UI_SCALE = 1, portraitPromptVisible = false, mobileLandscapeLayout = false, regions = [], rightSidebarLayoutSnapshot = null, hookeGuidanceHitbox = null;
function responsiveScale(width, height) {
  // Keep the three-column canvas inside smaller CSS viewports as well as
  // short phone landscapes. This matters on high-DPI displays where browser
  // zoom can make the physical window look large while innerWidth is much
  // smaller than the screenshot's pixel dimensions.
  const compactLandscape = width > height && (width < 1400 || height < 800);
  return compactLandscape ? Math.min(1, width / 1320, height / 760) : 1;
}
function resize() {
  D = Math.min(devicePixelRatio || 1, 2);
  VIEW_W = Math.max(1, innerWidth);
  VIEW_H = Math.max(1, innerHeight);
  portraitPromptVisible = VIEW_W <= 700 && VIEW_H > VIEW_W;
  UI_SCALE = portraitPromptVisible ? 1 : responsiveScale(VIEW_W, VIEW_H);
  mobileLandscapeLayout = !portraitPromptVisible && VIEW_W > VIEW_H && (UI_SCALE < 1 || matchMedia('(pointer: coarse)').matches);
  W = VIEW_W / UI_SCALE;
  H = VIEW_H / UI_SCALE;
  canvas.width = Math.round(VIEW_W * D);
  canvas.height = Math.round(VIEW_H * D);
  buffer.width = Math.round(VIEW_W * D);
  buffer.height = Math.round(VIEW_H * D);
  ctx.setTransform(D * UI_SCALE, 0, 0, D * UI_SCALE, 0, 0);
  document.body.classList.toggle('portrait-locked', portraitPromptVisible);
  webglCanvas.style.visibility = portraitPromptVisible ? 'hidden' : 'visible';
  if (portraitPromptVisible) lab3d.resize(0, 0, 1, 1, 1);
  else {
    const R = Math.max(260, Math.min(330, W * .23));
    lab3d.resize(270, 205, Math.max(1, W - 270 - R), Math.max(180, H - 333), UI_SCALE);
  }
  draw()
}
addEventListener('resize', resize);
addEventListener('orientationchange', resize);
document.addEventListener('fullscreenchange', resize);
function rr(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill() } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke() } }
function text(t, x, y, size = 14, color = C.ink, weight = 500, align = 'left') { ctx.fillStyle = color; ctx.font = `${weight} ${size}px Inter,system-ui`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y) }
function wrapTextLines(t, maxWidth, size = 10, weight = 600) { ctx.font = `${weight} ${size}px Inter,system-ui`; const words = String(t).split(/\s+/); const lines = []; let line = ''; for (const word of words) { const next = line ? `${line} ${word}` : word; if (!line || ctx.measureText(next).width <= maxWidth) line = next; else { lines.push(line); line = word } } if (line) lines.push(line); return lines }
function drawTextLines(lines, x, centreY, size = 10, color = C.ink, weight = 600, lineHeight = 13) { ctx.fillStyle = color; ctx.font = `${weight} ${size}px Inter,system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const firstY = centreY - (lines.length - 1) * lineHeight / 2; lines.forEach((line, i) => ctx.fillText(line, x, firstY + i * lineHeight)) }
function wrappedText(t, x, y, maxWidth, size = 10, color = C.ink, weight = 600, lineHeight = 13, maxLines = 2) { let lines = wrapTextLines(t, maxWidth, size, weight); if (lines.length > maxLines) { lines = lines.slice(0, maxLines); let last = lines[maxLines - 1]; while (last.length && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1); lines[maxLines - 1] = `${last.trim()}…` } ctx.fillStyle = color; ctx.font = `${weight} ${size}px Inter,system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight)); return lines.length }
function guidedReactantSafety(name, practicalId = practicals[state.selected]?.id) {
  const key = String(name).toLowerCase(), practical = practicals.find(item => item.id === practicalId);
  const detail = (rating, color, summary, handling, response, disposal) => ({ name, practicalId, practicalTitle: practical?.title || '', rating, color, summary, handling, response, disposal });
  if (practicalId === 'transformation') {
    if (key.includes('e. coli')) return detail('TEACHING CULTURE — KEEP SEALED', '#397f84', 'The practical models an approved non-pathogenic teaching strain, but every microbial culture must still be treated as a potential contaminant.', 'Use aseptic technique, fresh sterile tips and minimal lid opening. Wash hands before and after the practical. Keep all plates sealed after inoculation and never open an incubated plate.', 'Do not touch a spill or colony. Keep others away, alert the teacher and follow the school biological-spill procedure. Wash exposed skin thoroughly.', 'Put tubes, tips and sealed plates into the designated microbiological-waste stream for approved disinfection or pressure sterilisation; never use a normal bin or sink.');
    if (key.includes('plasmid')) return detail('LOW HAZARD — AVOID CONTAMINATION', '#5b55a5', 'The purified teaching plasmid is low hazard, but contaminating it or transferring it to the −DNA control would invalidate the comparison.', 'Keep the tube capped, use a fresh sterile tip and add plasmid only to the clearly labelled +DNA tube. Never mouth-pipette.', 'Tell the teacher about a spill or swapped tip. Wipe the area using the approved biological-work procedure and wash exposed skin.', 'Place the plasmid tube and used tips in the designated biological laboratory waste; do not return used liquid to the stock tube.');
    if (key.includes('lb recovery')) return detail('LOW HAZARD — STERILE MEDIUM', '#4f8f73', 'Sterile LB broth is low hazard before use, but after contact with bacteria it becomes microbiological material.', 'Use a fresh sterile tip for each tube, keep vessels capped and avoid aerosols or splashes.', 'Alert the teacher, contain a spill and use the school biological-spill procedure. Wash exposed skin with soap and water.', 'Unused sterile broth follows the local laboratory route; inoculated broth, tubes and tips require approved microbiological decontamination.');
    return detail('SELECTIVE AGAR — KEEP PLATES SEALED', '#8b6b45', 'The modelled agar contains ampicillin and arabinose. Avoid antibiotic contact and treat every inoculated plate as microbiological material.', 'Wear eye protection, handle plates by the base, cross-seal as directed and incubate only in the simulation or under teacher-controlled school procedures. Never reopen after incubation.', 'Keep a damaged or spilled plate contained, prevent access and alert the teacher. Wash exposed skin and follow the biological-spill procedure.', 'Dispose of every sealed inoculated plate through the approved microbiological-waste route for decontamination; never put it in a normal bin.');
  }
  if (practicalId === 'antibiotics') {
    if (key.includes('bacillus')) return detail('ASEPTIC CULTURE — KEEP SEALED', '#397f84', 'Bacillus subtilis is represented as an approved non-pathogenic teaching strain, but all microbial cultures must still be treated as potential contaminants.', 'Disinfect the bench before and after work, wash hands, use sterile tools and open the Petri-dish lid only far enough and for as little time as needed. Once incubated, do not reopen the plate.', 'Keep a spill contained, prevent access and alert the teacher. Do not touch colonies. Follow the school biological-spill procedure and wash exposed skin thoroughly.', 'Place every used swab, disc and sealed plate in the designated microbiological-waste container for pressure sterilisation or approved disinfectant treatment; never put cultures in a normal bin or sink.');
    if (key.includes('antibiotic')) return detail('LOW HAZARD / SENSITISATION', '#5a6fa2', 'Small teaching antibiotic discs are low hazard in normal use, but direct contact may trigger sensitisation or contaminate the test.', 'Handle discs only with sterile forceps. Avoid skin contact, keep discs separated and close the lid immediately after placement.', 'Wash skin after contact and tell the teacher if irritation occurs or if a disc is dropped outside the sterile field.', 'Dispose of every used disc with the sealed culture plate as microbiological waste; do not return exposed discs to the stock container.');
    return detail('FLAMMABLE 70% IMS DISINFECTANT', '#c96f43', 'The 70% industrial methylated spirit (IMS) surface disinfectant is flammable and may irritate eyes or damaged skin.', 'Wear eye protection, spray the bench lightly away from the face and wipe it fully, including beneath moved apparatus. Keep the bottle capped and far from flames, sparks and hot equipment.', 'Remove ignition sources, tell the teacher and absorb a small spill with the approved material. Rinse eyes or skin with water if exposed.', 'Let the cleaned surface air-dry. Put the used wipe in the designated waste container according to the school procedure.');
  }
  if (practicalId === 'nuclear') return detail('IONISING RADIATION — SEALED SOURCE', '#c99500', 'A radioactive source emits ionising radiation. The simulation shows sealed school sources; the animated tracks are an explanatory model and are not visible in a real experiment.', 'Teacher-controlled use only. Keep exposure time short, maximise distance, use the long-handled tongs, never touch a source and keep it in the lead-lined store whenever it is not clamped in the holder.', 'Do not approach or pick up a dropped or damaged source. Clear the area, prevent access and alert the responsible teacher or radiation-protection supervisor immediately.', 'Never discard a source. Use tongs to return an intact source to its labelled shielded store under the school’s local rules and source-accounting procedure.');
  if (practicalId === 'ivdevices') return detail('LOW VOLTAGE / HOT LAMP', '#b96b38', 'The school power pack is low voltage, but a filament lamp can become hot and an LED can be damaged by excessive forward current or reverse voltage.', 'Keep the supply off while changing devices or polarity. Use the LED protection resistor, begin at 0 V and do not touch the lamp until it has cooled.', 'Switch off and disconnect the power pack if a component overheats, smells unusual or a lead becomes damaged; report it to the teacher.', 'Allow the lamp to cool. Return intact components and leads to the electrical-equipment tray; damaged electronic parts follow the school e-waste route.');
  if (practicalId === 'alkali') return detail('HIGHLY REACTIVE — SIMULATION ONLY', '#944f8f', 'Lithium, sodium and potassium react exothermically with water, releasing flammable hydrogen and strongly alkaline hydroxide solution.', 'Do not carry out this comparison as a student practical. The screen, tiny stored-under-oil samples and remote forceps are represented only in this simulation or an approved teacher demonstration.', 'Keep clear of any real reaction and alert staff immediately for a spill, fire or splash. Never add water to an alkali-metal fire.', 'Only trained staff may quench and dispose of alkali-metal residues using the current school procedure; never put residues or contaminated water into a normal sink.');
  if (key.includes('thermite')) return detail('DEMONSTRATION ONLY', '#b53f32', 'The sealed charge can produce molten iron, intense heat, sparks and very bright light.', 'Teacher-controlled demonstration only. Keep the safety screen and sand containment in place and observe from the marked distance.', 'Do not approach until the teacher confirms the products are completely cool. Follow the laboratory emergency procedure for fire or burns.', 'Leave all charge residue and hot products for trained staff to dispose of.');
  if (key.includes('potassium dichromate')) return detail('TOXIC — SIMULATION ONLY', '#9d3b63', 'Potassium dichromate is toxic, carcinogenic, oxidising and environmentally hazardous; it is represented only as a simulation here.', 'Do not use this material in a student practical. A teacher should select a safer approved convection tracer for any real investigation.', 'Avoid all contact. If exposure occurs, alert staff immediately and follow the current SDS and school emergency procedure.', 'Treat as hazardous chemical waste; never pour it into a sink.');
  if (key.includes('magnesium fuse')) return detail('EXTREME HEAT / BRIGHT LIGHT', '#c44c32', 'Burning magnesium gives intense ultraviolet-rich light and can ignite nearby materials.', 'Ignite remotely behind the safety screen. Wear eye protection and never stare directly at the burning fuse.', 'For a burn or eye concern, alert staff immediately and cool affected skin with running water as directed by school procedure.', 'Allow residue to cool fully and place it in the designated solid-chemical waste.');
  if (key.includes('magnesium ribbon')) return detail('FLAMMABLE SOLID', '#d46b32', 'Magnesium can burn with an extremely bright white flame and remains hot after heating.', 'Wear eye protection, use tongs and keep only a small piece near the flame. Do not look directly at burning magnesium.', 'Alert staff. Cool a minor burn under running water; do not handle hot metal or attempt to extinguish burning magnesium with water.', 'Let solid residue cool, then use the labelled solid-chemical waste container.');
  if (key.includes('ethanol')) return detail('HIGHLY FLAMMABLE', '#d46b32', 'Ethanol vapour can ignite readily and may irritate eyes.', 'Wear eye protection and heat only in an electric hot-water bath. Keep the tube capped when appropriate and well away from naked flames.', 'Extinguish ignition sources and tell staff about a spill. Rinse eyes or skin with plenty of water if exposed.', 'Collect surplus ethanol in the labelled organic-liquid waste; do not pour it into the sink.');
  if (key.includes('silver nitrate') || key.includes('agno₃')) return detail('CORROSIVE / OXIDISING', '#b53f32', 'Silver nitrate can damage eyes, irritate or burn skin and leave persistent dark stains.', 'Wear splash goggles and gloves, use small quantities and keep it away from combustible material.', 'Rinse skin or eyes immediately with plenty of water and alert staff. Contain spills with the approved kit.', 'Collect all solution and contaminated solids as silver-containing hazardous waste.');
  if (key.includes('sulfuric acid')) return detail('CORROSIVE / IRRITANT', '#b53f32', 'Sulfuric acid can cause serious eye damage and skin burns; dilute school solutions still require careful handling.', 'Wear splash goggles, use a pipette filler and keep the container below eye level. Add slowly to prevent splashes.', 'Rinse affected skin or eyes immediately with plenty of water and alert staff. Neutralise spills only under staff direction.', 'Place surplus acid in the labelled acidic-waste stream or follow the school dilution procedure.');
  if (key.includes('hydrochloric') || /\bhcl\b/.test(key)) return detail('IRRITANT ACID', '#dc6748', 'Dilute hydrochloric acid can irritate skin and cause serious eye irritation; vapour should not be inhaled.', 'Wear splash goggles, use a pipette filler and add the acid slowly with the vessel kept below eye level.', 'Rinse skin or eyes immediately with plenty of water and tell staff. Cover and treat spills using the laboratory spill procedure.', 'Use the labelled acidic-waste container or the school-approved neutralisation procedure.');
  if (key.includes('sodium hydroxide') || key.includes('naoh')) return detail('CORROSIVE ALKALI', '#b53f32', 'Sodium hydroxide can cause serious eye damage and chemical burns, even when the solution appears clear.', 'Wear splash goggles, use a pipette filler and wipe drips from the burette or vessel promptly.', 'Rinse skin or eyes immediately with plenty of water and alert staff. Do not try to neutralise a spill without supervision.', 'Collect surplus solution as labelled alkaline waste or follow the school-approved neutralisation procedure.');
  if (key.includes('iodine')) return detail('HARMFUL / IRRITANT', '#8b4f79', 'Iodine solution can irritate eyes and skin, is harmful if swallowed and will stain surfaces.', 'Wear eye protection, use a dropping pipette and keep the reagent on the white tile or a spill tray.', 'Rinse exposed skin or eyes with water and tell staff. Blot a spill with the approved absorbent material.', 'Collect iodine-containing liquid and contaminated material in the labelled chemical-waste container.');
  if (key.includes('phenolphthalein')) return detail('IRRITANT / FLAMMABLE SOLVENT', '#d46b32', 'Indicator solution may contain ethanol, so it can irritate eyes and ignite near a flame.', 'Wear eye protection, use only a few drops and keep the bottle away from Bunsen burners and hot surfaces.', 'Remove ignition sources, tell staff and rinse affected skin or eyes with water.', 'Collect surplus indicator as labelled organic-liquid waste.');
  if (key.includes('copper chloride') || key.includes('copper(ii) chloride') || key.includes('cucl')) return detail('HARMFUL / ENVIRONMENTAL HAZARD', '#8b4f79', 'Copper chloride is harmful if swallowed, can irritate eyes and is hazardous to aquatic life.', 'Wear eye protection, avoid skin contact and use a spill tray. Wash hands after handling.', 'Rinse skin or eyes with water and tell staff. Keep spills out of sinks and drains.', 'Collect solution, salts and contaminated paper as copper-containing hazardous waste.');
  if (key.includes('cuso₄') || key.includes('copper sulfate')) return detail('HARMFUL / ENVIRONMENTAL HAZARD', '#8b4f79', 'Copper sulfate solution is harmful if swallowed, irritates eyes and is hazardous to aquatic life.', 'Wear eye protection, use small quantities and keep test tubes in a rack or spill tray.', 'Rinse affected skin or eyes with water and alert staff. Prevent spilled solution reaching drains.', 'Collect all copper-containing solutions and solids in the labelled hazardous-waste container.');
  if (key.includes('thiosulfate')) return detail('LOW HAZARD / GAS ON ACIDIFICATION', '#5f7f8c', 'Sodium thiosulfate is low hazard, but adding acid produces irritating sulfur dioxide gas.', 'Wear eye protection, use small classroom quantities and work in the ventilated area specified by the teacher.', 'Move to fresh air if breathing is uncomfortable and alert staff. Rinse splashes from skin or eyes with water.', 'Dispose of the reacted mixture using the school procedure; do not store an acidified mixture.');
  if (key.includes('copper oxide')) return detail('HARMFUL DUST', '#8b4f79', 'Copper oxide dust can irritate eyes and is harmful if swallowed or inhaled.', 'Wear eye protection, transfer gently with a spatula and avoid raising dust.', 'Move to fresh air after inhalation and rinse skin or eyes with water. Alert staff about exposure or spills.', 'Collect copper-containing powder and reaction residue as hazardous chemical waste.');
  if (key.includes('limewater')) return detail('IRRITANT ALKALI', '#dc6748', 'Limewater contains calcium hydroxide and can irritate eyes and skin.', 'Wear eye protection, keep the delivery tube secure and avoid splashing while gas bubbles through it.', 'Rinse skin or eyes with plenty of water and tell staff if irritation persists.', 'Use the labelled alkaline-waste stream or the school-approved disposal procedure.');
  if (key.includes('oxygen')) return detail('SUPPORTS COMBUSTION', '#d46b32', 'Oxygen is not flammable, but it makes other materials burn more vigorously.', 'Keep oxygen away from flames, sparks, oils and greases. Use only the small amount present in the apparatus.', 'Close the source if safe and alert staff if combustion becomes vigorous.', 'Vent small classroom quantities safely as directed; never seal oxygen in an unsuitable container.');
  if (key.includes('hot water')) return detail('SCALD HAZARD', '#d46b32', 'Hot water, steam and heated apparatus can scald skin and remain hot after the practical.', 'Use heat-resistant gloves where directed, pour slowly and keep the flask and cube stable and below face height.', 'Cool a scald under cool running water for at least 20 minutes and alert staff immediately.', 'Allow water and apparatus to cool before emptying or storing them.');
  if (key.includes('wax')) return detail('HOT SURFACE / MOLTEN WAX', '#d48a32', 'Heated rods and softened wax can burn skin; dropped pins may also remain hot.', 'Wear eye protection, use tongs and keep hands clear of the heated rod ends and falling pins.', 'Cool a burn under running water and alert staff. Do not pick up hot pins by hand.', 'Allow wax, rods and pins to cool completely before reuse or disposal.');
  if (key.includes('stearic acid')) return detail('HOT MOLTEN SAMPLE / IRRITANT', '#d48a32', 'Stearic acid is low hazard when cool but the molten sample, boiling tube and water bath can burn skin; dust may irritate eyes.', 'Wear eye protection, use a small amount, clamp the tube securely and keep the thermometer bulb away from the glass wall.', 'Cool a burn under running water for at least 20 minutes and alert staff. Rinse dust from eyes with clean water.', 'Allow the sample and glassware to solidify and cool fully, then follow the school procedure for reusable or solid chemical waste.');
  if (key.includes('steel spring') || key.includes('slotted mass') || key.includes('mass hanger')) return detail('STORED ENERGY / FALLING MASS', '#5f7f8c', 'A stretched spring stores energy, and slotted masses can fall or trap fingers if the stand or hanger is unstable.', 'Wear eye protection, secure the heavy stand, add one mass gently at a time and keep hands and feet away from the safety tray below.', 'Step back if the spring, clamp or stand shifts. Tell staff about a fallen mass, damaged spring or trapped finger.', 'Remove all masses before unclamping the spring and return the spring only if it has not been permanently stretched.');
  if (key.includes('thermal paste')) return detail('CONTACT IRRITANT', '#8b6b45', 'Thermal paste can irritate skin or eyes and can make equipment slippery if over-applied.', 'Use a small bead with the applicator, avoid skin contact and wipe excess paste from the block before heating.', 'Rinse exposed skin or eyes with water and tell staff. Wipe spills with the approved disposable material.', 'Place paste-contaminated wipes in the designated solid-waste container.');
  if (key.includes('low-voltage electrical energy') || key.includes('aluminium block')) return detail('HOT METAL / LOW-VOLTAGE ELECTRICAL', '#d48a32', 'The aluminium block, heater and probe can become hot while looking unchanged; damaged leads can also overheat.', 'Use only the specified low-voltage supply, keep the block insulated and switch off before touching probes, leads or metal.', 'Isolate the supply and alert staff if a lead becomes hot or damaged. Cool a burn under running water for at least 20 minutes.', 'Allow the block and probes to cool fully, disconnect the supply and return the equipment for inspection.');
  if (key.includes('petroleum jelly')) return detail('LOW HAZARD / SLIP RISK', '#4f8f73', 'Petroleum jelly is low hazard but makes floors and benches slippery and can contaminate glass joints.', 'Use a very small amount, avoid eye contact and wipe tools and hands after making the seal.', 'Wipe up spills immediately; rinse eyes with water if contact occurs.', 'Place contaminated wipes in the designated solid-waste container, not the sink.');
  if (key.includes('wire') || key.includes('supply') || key.includes('potential difference')) return detail('LOW-VOLTAGE ELECTRICAL', '#467aa6', 'Leads and resistance wire can heat if short-circuited, and damaged insulation may expose conductors.', 'Use only the specified low-voltage supply. Open the switch before moving clips and do not touch a wire that has become hot.', 'Switch off the supply and alert staff if a lead becomes hot, damaged or emits an odour.', 'Disconnect the supply before returning wire and leads for inspection or reuse.');
  if (key.includes('accelerating force') || key.includes('trolley mass')) return detail('MOVING / FALLING MASS', '#5f7f8c', 'A released trolley or hanging mass can strike hands or feet and may leave the end of the track.', 'Fit the stop block, keep the runway clear and catch the trolley only after it has slowed. Keep feet away from the hanging mass.', 'Stop the run and alert staff if a mass falls or the trolley leaves the track.', 'Secure the trolley and remove masses before dismantling the apparatus.');
  if (key.includes('iron filings') || key.includes('magnet') || key.includes('pole')) return detail('SEALED PARTICLES / STRONG MAGNET', '#467aa6', 'Loose iron filings can enter eyes; magnets can pinch fingers and affect sensitive devices.', 'Keep filings sealed above the paper, wear eye protection and keep magnets away from electronics and medical devices.', 'Do not rub the eye if particles escape; rinse gently and alert staff. Treat pinches with the school first-aid procedure.', 'Recover all filings with the designated tool and return magnets to their keepers.');
  if (key.includes('surface') || key.includes('metal rod')) return detail('HOT SURFACE', '#d48a32', 'Metal and coated surfaces may become hot while looking unchanged.', 'Assume heated surfaces are hot, use tongs or heat-resistant gloves and place them on a heatproof mat.', 'Cool a burn under running water and alert staff. Mark hot equipment so others do not touch it.', 'Let all items return to room temperature before storage.');
  if (key.includes('sodium carbonate') || key.includes('nahco₃')) return detail('LOW HAZARD / DUST IRRITANT', '#4f8f73', 'Carbonate powders and solutions are low hazard but may irritate eyes or skin.', 'Wear eye protection, avoid raising dust and use a spatula or pipette for measured quantities.', 'Rinse affected skin or eyes with water and wipe up spills promptly.', 'Dispose of small dilute quantities only according to the school laboratory procedure.');
  if (key.includes('universal indicator')) return detail('IRRITANT INDICATOR', '#8b4f79', 'Universal indicator may irritate eyes and skin and may contain a flammable solvent.', 'Wear eye protection, use drops rather than a free pour and keep it away from flames.', 'Rinse affected skin or eyes with water and alert staff if irritation persists.', 'Collect surplus indicator in the labelled liquid-waste container.');
  if (key.includes('chloride')) return detail('IRRITANT SALT', '#8b4f79', 'Metal-chloride samples can irritate eyes or skin; some metal salts are harmful if swallowed.', 'Wear eye protection, use a clean spatula, avoid dust and never taste laboratory chemicals.', 'Rinse skin or eyes with water and tell staff. Sweep spills with the approved method rather than using bare hands.', 'Collect used flame-test salts and contaminated material as labelled solid-chemical waste.');
  if (key.includes('water')) return detail('LOW HAZARD / SPILL RISK', '#3d86a8', 'Water is low hazard, but spills can make the floor slippery and can reach electrical equipment.', 'Keep vessels stable, wipe drips promptly and keep water away from plugs and power supplies.', 'Isolate electrical equipment before cleaning a spill and alert staff if water reaches a socket or lead.', 'Dispose of uncontaminated water as directed; contaminated water follows the reagent-specific waste route.');
  if (key.includes('stone') || key.includes('weight') || key.includes('block') || key.includes('steel nut')) return detail('IMPACT / PINCH HAZARD', '#5f7f8c', 'Dense samples can pinch fingers, damage glassware or splash water if dropped.', 'Lower the sample with the thread or tongs, keep feet clear and stabilise the Eureka can.', 'Tell staff about broken glass or an injury; do not pick up shards by hand.', 'Dry and return intact samples. Place broken or damaged items in the designated container.');
  return detail('LOW HAZARD', '#4f8f73', 'This material is low hazard in the small quantities shown, but normal laboratory hygiene still applies.', 'Wear eye protection where directed, do not ingest materials and wash hands after the practical.', 'Tell staff about any spill or exposure and rinse affected skin or eyes with water.', 'Return reusable material or use the labelled waste route specified by the teacher.');
}
function hit(id, x, y, w, h, data) { regions.push({ id, x, y, w, h, data }) }
function fittedButtonLabelLayout(label, w, h, baseSize = 12, weight = 700) {
  const value = String(label), horizontalPadding = Math.max(10, Math.min(18, w * .1)), availableWidth = Math.max(1, w - horizontalPadding);
  const measure = (line, size) => { ctx.font = `${weight} ${size}px Inter,system-ui`; return ctx.measureText(line).width };
  const baseWidth = measure(value, baseSize), oneLineSize = Math.min(baseSize, baseSize * availableWidth / Math.max(1, baseWidth) * .975);
  if (oneLineSize >= 10 || !value.includes(' ') || h < 30) {
    const fontSize = Math.max(7, oneLineSize), widest = measure(value, fontSize);
    return { lines: [value], fontSize, lineHeight: fontSize, availableWidth, widest, fits: widest <= availableWidth + .25 };
  }

  const words = value.split(/\s+/), candidates = [];
  for (let split = 1; split < words.length; split++) {
    const lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
    if (lines[0] === '·' || lines[1] === '·') continue;
    const widestAtBase = Math.max(...lines.map(line => measure(line, baseSize)));
    const fontSize = Math.min(10.5, baseSize * availableWidth / Math.max(1, widestAtBase) * .975, (h - 8) / 2.12);
    const widths = lines.map(line => measure(line, fontSize));
    candidates.push({ lines, fontSize, lineHeight: fontSize * 1.06, availableWidth, widest: Math.max(...widths), balance: Math.abs(widths[0] - widths[1]) });
  }
  candidates.sort((a, b) => b.fontSize - a.fontSize || a.balance - b.balance);
  const best = candidates[0];
  if (!best) {
    const fontSize = Math.max(7, oneLineSize), widest = measure(value, fontSize);
    return { lines: [value], fontSize, lineHeight: fontSize, availableWidth, widest, fits: widest <= availableWidth + .25 };
  }
  best.fontSize = Math.max(7, best.fontSize);
  best.widest = Math.max(...best.lines.map(line => measure(line, best.fontSize)));
  best.fits = best.widest <= availableWidth + .25 && best.lineHeight * best.lines.length <= h - 4;
  return best;
}
function drawFittedButtonLabel(label, x, y, w, h, color, weight = 700) {
  const layout = fittedButtonLabelLayout(label, w, h, 12, weight), centreY = y + h / 2;
  ctx.save();
  ctx.fillStyle = color; ctx.font = `${weight} ${layout.fontSize}px Inter,system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const firstY = centreY - (layout.lines.length - 1) * layout.lineHeight / 2;
  layout.lines.forEach((line, index) => ctx.fillText(line, x + w / 2, firstY + index * layout.lineHeight));
  ctx.restore();
  window.__buttonLabelAudit.push({ label: String(label), lines: layout.lines, font_size_px: +layout.fontSize.toFixed(2), widest_line_px: +layout.widest.toFixed(2), available_width_px: +layout.availableWidth.toFixed(2), button_width_px: +w.toFixed(2), fits: layout.fits });
}
function button(label, x, y, w, h, active = false) { rr(x, y, w, h, 8, active ? C.teal : '#fff', active ? C.teal : C.line); drawFittedButtonLabel(label, x, y, w, h, active ? '#fff' : C.ink); hit('button', x, y, w, h, label) }
function progressButton(label, x, y, w, h, progress = 0, active = false) {
  const q = Math.max(0, Math.min(1, progress));
  rr(x, y, w, h, 8, active ? '#e7f7f4' : '#fff', active ? C.teal : C.line);
  if (q > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.clip();
    const fill = ctx.createLinearGradient(x, y, x, y + h);
    fill.addColorStop(0, '#4fc3b5');
    fill.addColorStop(1, '#087f75');
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * q, h);
    ctx.restore();
  }
  drawFittedButtonLabel(label, x, y, w, h, '#000');
  hit('button', x, y, w, h, label);
}
function timedRatio(timer, duration, active = true) {
  return active && duration > 0 ? Math.max(0, Math.min(1, timer / duration)) : 0;
}
function flaskPath() { ctx.beginPath(); ctx.moveTo(-14, -76); ctx.lineTo(-14, -43); ctx.lineTo(-48, 20); ctx.quadraticCurveTo(-57, 42, -32, 48); ctx.quadraticCurveTo(0, 54, 32, 48); ctx.quadraticCurveTo(57, 42, 48, 20); ctx.lineTo(14, -43); ctx.lineTo(14, -76) }
function drawFlask(x, y, scale = 1, opt = {}) {
  const angle = opt.angle || 0, liquid = opt.liquid ?? .55, color = opt.color || '79,195,181'; ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  // grounding shadow
  ctx.save(); ctx.rotate(-angle); ctx.fillStyle = 'rgba(14,36,46,.18)'; ctx.filter = 'blur(5px)'; ctx.beginPath(); ctx.ellipse(0, 50, 54, 9, 0, 0, 7); ctx.fill(); ctx.filter = 'none'; ctx.restore();
  // liquid clipped to the vessel
  ctx.save(); flaskPath(); ctx.clip(); const top = 48 - liquid * 78; const lg = ctx.createLinearGradient(0, top, 0, 48); lg.addColorStop(0, `rgba(${color},.34)`); lg.addColorStop(.18, `rgba(${color},.64)`); lg.addColorStop(1, `rgba(${color},.88)`); ctx.fillStyle = lg; ctx.fillRect(-58, top, 116, 100); ctx.fillStyle = `rgba(${color},.36)`; ctx.beginPath(); ctx.ellipse(0, top, 43, 5, 0, 0, 7); ctx.fill(); ctx.restore();
  // glass body and rim
  const glass = ctx.createLinearGradient(-52, 0, 52, 0); glass.addColorStop(0, 'rgba(194,222,230,.45)'); glass.addColorStop(.12, 'rgba(255,255,255,.09)'); glass.addColorStop(.55, 'rgba(255,255,255,.02)'); glass.addColorStop(.88, 'rgba(163,208,220,.28)'); glass.addColorStop(1, 'rgba(255,255,255,.72)'); flaskPath(); ctx.fillStyle = glass; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(84,125,139,.82)'; ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, -76, 14, 3.8, 0, 0, 7); ctx.fillStyle = 'rgba(223,242,246,.46)'; ctx.fill(); ctx.strokeStyle = 'rgba(75,112,124,.75)'; ctx.stroke();
  // highlights and graduations
  ctx.strokeStyle = 'rgba(255,255,255,.78)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -68); ctx.lineTo(-8, -43); ctx.quadraticCurveTo(-34, 5, -38, 24); ctx.stroke(); ctx.strokeStyle = 'rgba(76,111,122,.42)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(24, 4 + i * 12); ctx.lineTo(34, 4 + i * 12); ctx.stroke() }
  if (opt.bubbles) { for (let i = 0; i < 11; i++) { const bx = -32 + (i * 17) % 63, by = 39 - ((state.time * (9 + i % 3) * 6 + i * 13) % Math.max(25, liquid * 65)); ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.beginPath(); ctx.arc(bx, by, 1.5 + i % 3 * .55, 0, 7); ctx.stroke() } }
  ctx.restore()
}
function drawBeaker(x, y, w = 118, h = 100, opt = {}) { ctx.save(); ctx.fillStyle = 'rgba(19,39,49,.17)'; ctx.filter = 'blur(5px)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 6, w * .55, 9, 0, 0, 7); ctx.fill(); ctx.filter = 'none'; const liq = opt.liquid ?? .45, top = y + h - (h - 12) * liq; ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.clip(); let g = ctx.createLinearGradient(x, top, x, y + h); g.addColorStop(0, opt.color || 'rgba(55,156,213,.36)'); g.addColorStop(1, opt.deep || 'rgba(21,105,176,.68)'); ctx.fillStyle = g; ctx.fillRect(x, top, w, h); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(x + w / 2, top, w / 2 - 4, 5, 0, 0, 7); ctx.fill(); ctx.restore(); ctx.strokeStyle = 'rgba(73,111,123,.85)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h - 5); ctx.quadraticCurveTo(x, y + h, x + 7, y + h); ctx.lineTo(x + w - 7, y + h); ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - 5); ctx.lineTo(x + w, y); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 10, y + 8); ctx.lineTo(x + 10, y + h - 18); ctx.stroke(); ctx.strokeStyle = 'rgba(73,111,123,.42)'; ctx.lineWidth = 1; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + w - 18, y + i * 18); ctx.lineTo(x + w - 5, y + i * 18); ctx.stroke() } }
function drawBunsen(x, baseY, lit = true) { ctx.save(); ctx.fillStyle = 'rgba(22,38,45,.22)'; ctx.filter = 'blur(6px)'; ctx.beginPath(); ctx.ellipse(x, baseY + 5, 52, 9, 0, 0, 7); ctx.fill(); ctx.filter = 'none'; let blueBase = ctx.createLinearGradient(x - 34, 0, x + 34, 0); blueBase.addColorStop(0, '#0a325b'); blueBase.addColorStop(.3, '#125496'); blueBase.addColorStop(.7, '#0d4279'); blueBase.addColorStop(1, '#082545'); ctx.fillStyle = blueBase; ctx.beginPath(); ctx.roundRect(x - 34, baseY - 12, 68, 15, 7); ctx.fill(); ctx.strokeStyle = '#071f38'; ctx.stroke(); let metal = ctx.createLinearGradient(x - 14, 0, x + 14, 0); metal.addColorStop(0, '#788991'); metal.addColorStop(.2, '#f0f5f7'); metal.addColorStop(.55, '#a4b3b8'); metal.addColorStop(.83, '#ffffff'); metal.addColorStop(1, '#6c7a80'); ctx.fillStyle = metal; ctx.beginPath(); ctx.roundRect(x - 8, baseY - 66, 16, 57, 3); ctx.fill(); ctx.strokeStyle = '#526066'; ctx.stroke(); ctx.fillStyle = '#26383e'; ctx.beginPath(); ctx.ellipse(x, baseY - 65, 7, 3, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 6, baseY - 4); ctx.quadraticCurveTo(x + 35, baseY - 2, x + 64, baseY + 18); ctx.stroke(); if (lit) { const flick = Math.sin(state.flamePhase * 1.2) * 0.5; let aura = ctx.createRadialGradient(x, baseY - 102, 5, x, baseY - 95, 54); aura.addColorStop(0, 'rgba(38,155,255,.28)'); aura.addColorStop(1, 'rgba(35,130,255,0)'); ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(x, baseY - 95, 55, 0, 7); ctx.fill(); let fg = ctx.createLinearGradient(x, baseY - 66, x, baseY - 145); fg.addColorStop(0, 'rgba(13,75,235,.98)'); fg.addColorStop(.34, 'rgba(26,151,255,.96)'); fg.addColorStop(.74, 'rgba(100,214,255,.82)'); fg.addColorStop(1, 'rgba(196,244,255,.12)'); ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(x - 9, baseY - 66); ctx.bezierCurveTo(x - 14, baseY - 91, x - 6 + flick, baseY - 122, x + flick, baseY - 148); ctx.bezierCurveTo(x + 9, baseY - 120, x + 14, baseY - 93, x + 9, baseY - 66); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(8,49,189,.92)'; ctx.beginPath(); ctx.moveTo(x - 5, baseY - 67); ctx.quadraticCurveTo(x - 6, baseY - 86, x, baseY - 111 - flick * .35); ctx.quadraticCurveTo(x + 6, baseY - 86, x + 5, baseY - 67); ctx.fill(); ctx.fillStyle = 'rgba(216,250,255,.92)'; ctx.beginPath(); ctx.moveTo(x - 2.5, baseY - 70); ctx.quadraticCurveTo(x - 3, baseY - 83, x, baseY - 92); ctx.quadraticCurveTo(x + 3, baseY - 83, x + 2.5, baseY - 70); ctx.fill() } ctx.restore() }
function drawThermometer(x, y) { ctx.save(); ctx.strokeStyle = '#a6b6ba'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - 100); ctx.lineTo(x, y + 6); ctx.stroke(); ctx.strokeStyle = '#c1443e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y - 80); ctx.lineTo(x, y + 8); ctx.stroke(); ctx.fillStyle = '#c1443e'; ctx.beginPath(); ctx.arc(x, y + 9, 8, 0, 7); ctx.fill(); ctx.strokeStyle = '#71858b'; ctx.lineWidth = 1; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + 5, y - 71 + i * 16); ctx.lineTo(x + 12, y - 71 + i * 16); ctx.stroke() } ctx.restore() }
function drawTestTube(x, y, scale = 1, opt = {}) { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = 'rgba(37,66,78,.16)'; ctx.filter = 'blur(4px)'; ctx.beginPath(); ctx.ellipse(0, 50, 18, 6, 0, 0, 7); ctx.fill(); ctx.filter = 'none'; ctx.save(); ctx.beginPath(); ctx.moveTo(-13, -62); ctx.lineTo(-13, 33); ctx.quadraticCurveTo(-13, 52, 0, 53); ctx.quadraticCurveTo(13, 52, 13, 33); ctx.lineTo(13, -62); ctx.closePath(); ctx.clip(); let g = ctx.createLinearGradient(0, 12, 0, 52); g.addColorStop(0, opt.cloudy ? 'rgba(245,245,232,.72)' : 'rgba(83,187,213,.25)'); g.addColorStop(1, opt.cloudy ? 'rgba(224,225,207,.9)' : 'rgba(39,139,182,.58)'); ctx.fillStyle = g; ctx.fillRect(-14, 12, 28, 45); ctx.restore(); ctx.strokeStyle = 'rgba(77,116,128,.85)'; ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(-13, -62); ctx.lineTo(-13, 33); ctx.quadraticCurveTo(-13, 52, 0, 53); ctx.quadraticCurveTo(13, 52, 13, 33); ctx.lineTo(13, -62); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, -62, 13, 3.5, 0, 0, 7); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.78)'; ctx.beginPath(); ctx.moveTo(-7, -50); ctx.lineTo(-7, 30); ctx.stroke(); ctx.restore() }
function drawTripod(x, baseY, scale = 1) { ctx.save(); ctx.translate(x, baseY); ctx.scale(scale, scale); ctx.strokeStyle = '#596a70'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-44, -82); ctx.lineTo(-60, 0); ctx.moveTo(44, -82); ctx.lineTo(60, 0); ctx.moveTo(0, -82); ctx.lineTo(0, 0); ctx.stroke(); ctx.fillStyle = '#738489'; ctx.fillRect(-52, -89, 104, 9); ctx.strokeStyle = '#d2d8d9'; ctx.lineWidth = 1; for (let i = -45; i <= 45; i += 10) { ctx.beginPath(); ctx.moveTo(i, -89); ctx.lineTo(i, -80); ctx.stroke() } ctx.restore() }
function drawBalance(x, y, scale = 1, opt = {}) { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = 'rgba(20,40,48,.2)'; ctx.filter = 'blur(5px)'; ctx.beginPath(); ctx.ellipse(0, 38, 64, 9, 0, 0, 7); ctx.fill(); ctx.filter = 'none'; let g = ctx.createLinearGradient(0, -34, 0, 40); g.addColorStop(0, '#6d7d84'); g.addColorStop(.5, '#35474f'); g.addColorStop(1, '#20333c'); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-65, -32, 130, 72, 12); ctx.fill(); ctx.strokeStyle = '#152b34'; ctx.stroke(); ctx.fillStyle = '#0c252d'; ctx.beginPath(); ctx.roundRect(-47, -19, 94, 28, 5); ctx.fill(); text(`${(opt.mass || 0).toFixed(2)} g`, 0, -5, 17, '#63e4ce', 750, 'center'); let tray = ctx.createRadialGradient(0, 18, 2, 0, 18, 38); tray.addColorStop(0, '#f5f7f7'); tray.addColorStop(1, '#87979c'); ctx.fillStyle = tray; ctx.beginPath(); ctx.ellipse(0, 22, 39, 10, 0, 0, 7); ctx.fill(); ctx.restore() }
function drawMeter(x, y, reading = null) { ctx.save(); ctx.translate(x, y); ctx.rotate(-.08); const body = ctx.createLinearGradient(-18, 0, 18, 0); body.addColorStop(0, '#8e1722'); body.addColorStop(.3, '#e3474f'); body.addColorStop(.62, '#c82332'); body.addColorStop(1, '#74111b'); ctx.fillStyle = body; ctx.strokeStyle = '#6f1019'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-4, 58); ctx.quadraticCurveTo(-7, 48, -8, 25); ctx.lineTo(-12, -25); ctx.quadraticCurveTo(-22, -35, -23, -52); ctx.lineTo(-23, -98); ctx.quadraticCurveTo(-22, -113, -10, -119); ctx.quadraticCurveTo(0, -125, 10, -119); ctx.quadraticCurveTo(22, -113, 23, -98); ctx.lineTo(23, -52); ctx.quadraticCurveTo(22, -35, 12, -25); ctx.lineTo(8, 25); ctx.quadraticCurveTo(7, 48, 4, 58); ctx.quadraticCurveTo(0, 68, -4, 58); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.roundRect(-16, -109, 5, 71, 3); ctx.fill(); rr(-18, -91, 36, 24, 4, '#121d22', '#ff7e80'); text(reading == null ? '– –' : reading.toFixed(2), 0, -79, reading == null ? 10 : 11, '#f4fff9', 800, 'center'); text('pH', 0, -101, 6.5, '#ffd7d8', 800, 'center'); ctx.fillStyle = '#343c3f'; ctx.beginPath(); ctx.ellipse(0, 58, 4.2, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore() }
function tripodGauzeScreenPoint(tripod) { if (!tripod) return null; const world = lab3d.posFromScreen(tripod.x, tripod.y); return world ? lab3d.projectToScreen(world.x, 2.1, world.z) : { x: tripod.x, y: tripod.y - 84 } }
function isHeatVessel(it) { return it?.type === 'beaker' || it?.type === 'flask' }
function isPhVessel(it) { return it?.type === 'beaker' || it?.type === 'tube' }
function workspaceScreenAnchor(it) { if (it?.type === 'phmeter' && it.attachedTo) { const target = state.workspace.find(a => a.uid === it.attachedTo && isPhVessel(a)); if (target) return workspaceScreenAnchor(target) } if (isHeatVessel(it) && it.snappedTo) { const support = state.workspace.find(a => a.uid === it.snappedTo && a.type === 'tripod'), point = tripodGauzeScreenPoint(support); if (point) return point } return { x: it.x, y: it.y } }
function nearestTripodForBeaker(it, maxDistance = 110) { if (!isHeatVessel(it)) return null; const anchor = { x: it.x, y: it.y }; return state.workspace.filter(a => a.type === 'tripod').map(tripod => ({ tripod, point: tripodGauzeScreenPoint(tripod) })).filter(a => a.point).map(a => ({ ...a, d: Math.hypot(anchor.x - a.point.x, anchor.y - a.point.y) })).filter(a => a.d <= maxDistance).sort((a, b) => a.d - b.d)[0] || null }
function snapBeakerToTripod(beaker, tripod) { beaker.snappedTo = tripod.uid; beaker.x = tripod.x; beaker.y = tripod.y; state.toast = `${beaker.type === 'flask' ? 'Flask' : 'Beaker'} placed securely on the tripod and gauze.` }
function workspaceHitRegions(it) { const anchor = workspaceScreenAnchor(it); if (it.type === 'bunsen') { const top = it.lit ? it.y - 210 : it.y - 135; hit('workspace-item', it.x - 74, top, 148, it.y + 48 - top, it.uid); hit('workspace-item', it.x + 42, it.y - 102, 178, 136, it.uid) } else if (it.type === 'phmeter' && it.attachedTo) hit('workspace-item', anchor.x - 48, anchor.y - 220, 96, 174, it.uid); else if (isHeatVessel(it) && it.snappedTo) hit('workspace-item', anchor.x - 78, anchor.y - 126, 156, 142, it.uid); else hit('workspace-item', it.x - 66, it.y - 94, 132, 154, it.uid) }
function drawWorkspaceItem(it, ghost = false) { if (!lab3d.available || ghost) { ctx.save(); if (ghost) ctx.globalAlpha = .58; const anchor = workspaceScreenAnchor(it); switch (it.type) { case 'flask': drawFlask(it.x, it.y, .88, { color: '106,191,211', liquid: .32 }); break; case 'beaker': drawBeaker(it.x - 48, it.y - 66, 96, 78, { liquid: .35 }); break; case 'tube': drawTestTube(it.x, it.y - 8, .84); break; case 'bunsen': drawBunsen(it.x, it.y + 51, it.lit); break; case 'tripod': drawTripod(it.x, it.y + 41, .82); break; case 'balance': drawBalance(it.x, it.y, .76, { mass: it.mass || 0 }); break; case 'thermometer': drawThermometer(it.x, it.y + 32); break; case 'phmeter': drawMeter(anchor.x, anchor.y - 66, phMeterReading(it)); break }ctx.restore() } if (!ghost) workspaceHitRegions(it) }
function drawWorkspace(x, w, benchY) { if (!state.workspace.length && !lab3d.available) { ctx.strokeStyle = 'rgba(74,130,137,.38)'; ctx.lineWidth = 2; ctx.setLineDash([7, 7]); rr(x + w * .18, benchY - 235, w * .64, 145, 18, null, 'rgba(74,130,137,.38)'); ctx.setLineDash([]); text('YOUR BENCH IS READY', x + w / 2, benchY - 174, 14, C.teal, 800, 'center'); text('Click an item in the equipment library', x + w / 2, benchY - 146, 13, C.muted, 600, 'center'); text('or drag it anywhere into this area', x + w / 2, benchY - 124, 11, C.muted, 500, 'center') } state.workspace.forEach(it => drawWorkspaceItem(it)); if (state.drag?.kind === 'palette') drawWorkspaceItem({ type: state.drag.type, x: state.drag.x, y: state.drag.y }, true); if (state.drag?.kind === 'workspace') { const it = state.workspace.find(a => a.uid === state.drag.uid); if (it) drawWorkspaceItem({ ...it, x: state.drag.x - state.drag.dx, y: state.drag.y - state.drag.dy }, true) } }
function registerWebGLInteractions(id, cx, cy) { const fallback = { target: { x: cx + 72, y: cy - 1 }, source: { x: cx - 155, y: cy - 1 } }; if (id === 'free') { const priority = { tripod: 0, bunsen: 1, beaker: 3, tube: 3, phmeter: 4 };[...state.workspace].sort((a, b) => (priority[a.type] ?? 2) - (priority[b.type] ?? 2)).forEach(workspaceHitRegions); state.layout = fallback; return } if (id === 'rates' || id === 'temp') { const sourceGround = lab3d.projectToScreen(-2.1, 0, .1), receiver = id === 'rates' ? ratesReceiverWorld() : { x: 1.25, y: 0, z: .05 }, targetGround = lab3d.projectToScreen(receiver.x, receiver.y, receiver.z); state.layout = { source: sourceGround ? { x: sourceGround.x, y: sourceGround.y - 62 } : fallback.source, target: targetGround ? { x: targetGround.x, y: targetGround.y - 62 } : fallback.target }; if (!state.pour && (id === 'temp' || state.ratesStage === 2)) hit('reagent', state.layout.source.x - 72, state.layout.source.y - 96, 144, 174, 'HCl(aq)') } else if (id === 'mass' && state.massStage === 2 && state.massLidOn) { const lid = lab3d.projectToScreen(1.3, 2.58, .05); if (lid) { hit('crucible-lid', lid.x - 62, lid.y - 38, 124, 76); state.layout = { ...fallback, lid } } else state.layout = fallback } else state.layout = fallback }
function header() {
  if (state.focusMode) return;
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 0, W, 64);
  text('PRACTICAL', 26, 25, 12, '#71d5c8', 800);
  text('LAB', 26, 43, 22, '#fff', 800);

  const tabStartX = 145, tabY = 12, tabH = 40, totalW = 350, tabW = (totalW - 8) / subjects.length;
  rr(tabStartX, tabY, totalW, tabH, 20, '#081a26', '#1a3344');

  const activeIndex = Math.max(0, subjects.findIndex(s => s.id === (state.subject || 'chemistry')));
  const targetX = tabStartX + 4 + activeIndex * tabW;
  if (state.subjectTabX == null) {
    state.subjectTabX = targetX;
  } else if (Math.abs(targetX - state.subjectTabX) > 0.5) {
    state.subjectTabX += (targetX - state.subjectTabX) * 0.32;
    requestAnimationFrame(() => draw(true));
  } else {
    state.subjectTabX = targetX;
  }

  const activeSubject = subjects[activeIndex] || subjects[0];
  rr(state.subjectTabX, tabY + 4, tabW, tabH - 8, 16, activeSubject.color, null);

  subjects.forEach((s, i) => {
    const tx = tabStartX + 4 + i * tabW;
    const isActive = (state.subject || 'chemistry') === s.id;
    text(`${s.icon} ${s.title}`, tx + tabW / 2, tabY + tabH / 2, 12.5, isActive ? '#ffffff' : '#8da4ad', 750, 'center');
    hit('subject-tab', tx, tabY + 4, tabW, tabH - 8, s.id);
  });

  const focusW = 104, assessW = 146;
  const focusX = W - focusW - 14, assessX = focusX - assessW - 10;
  text('OCR GCSE Combined Science', assessX - 16, 33, 11, '#9fb2b8', 600, 'right');
  rr(assessX, 16, assessW, 32, 16, state.assessmentMode ? C.teal : '#122b3b', state.assessmentMode ? '#4fc3b5' : '#2e4e63');
  text('📝 ASSESSMENT MODE', assessX + assessW / 2, 32, 10, '#ffffff', 800, 'center');
  hit('toggle-assessment-mode', assessX, 16, assessW, 32);
  rr(focusX, 16, focusW, 32, 16, state.focusMode ? C.teal : '#122b3b', '#2e4e63');
  text('FOCUS MODE ⛶', focusX + focusW / 2, 32, 10, '#ffffff', 800, 'center');
  hit('toggle-focus-mode', focusX, 16, focusW, 32);
}
function sidebarMetrics(subject = state.subject || 'chemistry') {
  const visible = practicals.map((p, i) => ({ ...p, originalIndex: i })).filter(p => (p.subject || 'chemistry') === subject);
  const cardH = 49, gap = 54, contentTop = 101, contentBottom = H - 32, contentHeight = Math.max(0, contentBottom - contentTop);
  return { visible, cardH, gap, contentTop, contentBottom, contentHeight, maxScroll: Math.max(0, visible.length * gap - 5 - contentHeight) };
}
function sidebarScrollBy(delta) {
  const subject = state.subject || 'chemistry', metrics = sidebarMetrics(subject), current = state.sidebarScroll?.[subject] || 0, next = Math.max(0, Math.min(metrics.maxScroll, current + delta));
  if (Math.abs(next - current) < .1) return false;
  state.sidebarScroll ??= {};
  state.sidebarScroll[subject] = next;
  return true;
}
function sidebar() {
  if (state.focusMode) return;
  const x = 0, y = 64, w = 270, currentSubject = state.subject || 'chemistry', metrics = sidebarMetrics(currentSubject), scroll = Math.max(0, Math.min(metrics.maxScroll, state.sidebarScroll?.[currentSubject] || 0));
  state.sidebarScroll ??= {};
  state.sidebarScroll[currentSubject] = scroll;
  ctx.fillStyle = '#eef3f2'; ctx.fillRect(x, y, w, H - y);
  text(`${currentSubject.toUpperCase()} PRACTICALS`, 20, 88, 10, C.muted, 800);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, metrics.contentTop, w, metrics.contentHeight); ctx.clip();
  metrics.visible.forEach((p, idx) => {
    const i = p.originalIndex;
    const yy = metrics.contentTop + idx * metrics.gap - scroll, sel = i === state.selected;
    if (yy + metrics.cardH < metrics.contentTop || yy > metrics.contentBottom) return;
    rr(10, yy, w - 20, metrics.cardH, 10, sel ? '#fff' : 'rgba(255,255,255,.34)', sel ? p.color : 'rgba(200,211,213,.5)');
    if (sel) { ctx.fillStyle = p.color; ctx.fillRect(10, yy + 7, 4, metrics.cardH - 14) }
    ctx.fillStyle = sel ? p.color : '#dde6e6';
    ctx.beginPath(); ctx.arc(36, yy + metrics.cardH / 2, 15, 0, 7); ctx.fill();
    text(p.icon, 36, yy + metrics.cardH / 2, p.icon === 'pH' ? 9 : 15, sel ? '#fff' : '#526870', 800, 'center');
    text(p.title, 59, yy + metrics.cardH * .36, 13, sel ? C.ink : '#526870', 750);
    text(p.sub, 59, yy + metrics.cardH * .71, 9.5, C.muted, 550);
    const hitTop = Math.max(yy, metrics.contentTop), hitBottom = Math.min(yy + metrics.cardH, metrics.contentBottom);
    hit('practical', 10, hitTop, w - 20, Math.max(0, hitBottom - hitTop), i)
  });
  ctx.restore();
  ctx.fillStyle = '#eef3f2'; ctx.fillRect(x, metrics.contentBottom, w, H - metrics.contentBottom);
  text('Press F for fullscreen', 20, H - 15, 9, C.muted, 600)
}
function chemicalTag(label, world, offsetY = 7, options = {}) { const p = lab3d.projectToScreen(...world); if (!p) return; const size = options.size || 10, height = options.height || 23, padding = options.padding || 20; ctx.font = `750 ${size}px Inter,system-ui`; const w = Math.max(options.minWidth || 60, ctx.measureText(label).width + padding), x = p.x - w / 2, y = p.y + offsetY; ctx.save(); ctx.shadowColor = 'rgba(7,31,45,.2)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2; rr(x, y, w, height, 6, 'rgba(255,255,255,.96)', 'rgba(95,125,137,.42)'); ctx.restore(); text(label, p.x, y + height / 2, size, C.ink, 750, 'center') }
function pondweedGeometry(distance = state.pondweedDistance || 20) {
  const beakerX = 1.5, beakerScale = 1.1, beakerEdgeX = beakerX - .7 * beakerScale, rulerUnitsPerCm = .05;
  const lampFaceX = beakerEdgeX - Math.max(10, Math.min(50, distance)) * rulerUnitsPerCm;
  return { beakerX, beakerScale, beakerEdgeX, rulerUnitsPerCm, lampFaceX, lampBaseX: lampFaceX - .67 };
}
function drawChemicalTags(id) {
  let massWorld = [1.3, 2.16, .05];
  if (state.massStage === 0 || state.massStage === 7) massWorld = [-2.5, .88, .2];
  const hydrogenLabel = state.hydrogenStage >= 1 ? 'MgCl₂(aq) + H₂(g)' : 'Mg(s) ribbon', titrationFlask = state.complete ? 'NaCl(aq) · pale pink' : '25.0 cm³ HCl(aq)', ratesWorld = ratesReceiverWorld();
  const pondweedWorld = pondweedGeometry();
  const trolleyX = -1.8 + (state.newtonPos || 0) * 3.5;
  const tags = {
    rates: [['HCl(aq)', [-2.1, 0, .1]], ['ELECTRIC WATER BATH', [2.73, .2, -.42], 45, { size: 8.2, height: 20, padding: 14, minWidth: 118 }], ...state.ratesStage >= 2 ? [['Na₂S₂O₃(aq)', [ratesWorld.x, ratesWorld.y, ratesWorld.z], 32]] : []],
    temp: [['HCl(aq)', [-2.1, 0, .1]], ['NaOH(aq)', [1.25, 0, .05]]],
    titration: [['0.100 mol dm⁻³ NaOH', [1.6, 3.16, .64], 0, { size: 8.6, height: 20, padding: 16, minWidth: 132 }], [titrationFlask, [.05, .08, .74], 15]],
    salts: [['CuSO₄(aq)', [0, 1.76, .1]]],
    mass: [[state.massStage >= 5 ? 'MgO(s)' : 'Mg(s)', massWorld]],
    hydrogen: [['dilute HCl(aq)', [-1.8, 0, .1]], [hydrogenLabel, [.65, .08, .02]]],
    co2: [['CaCO₃ + HCl', [-1.75, 0, .05]], ['Limewater', [1.75, 0, .05]]],
    electro: [['CuCl₂(aq)', [0, 0, .1]]],
    displacement: [['Mg + CuSO₄', [-2.1, 0, .16], 28, { size: 8.1, height: 20, padding: 12, minWidth: 94 }], ['Zn + CuSO₄', [-.7, 0, .16], 28, { size: 8.1, height: 20, padding: 12, minWidth: 94 }], ['Fe + CuSO₄', [.7, 0, .16], 28, { size: 8.1, height: 20, padding: 12, minWidth: 94 }], ['Cu + AgNO₃', [2.1, 0, .16], 28, { size: 8.1, height: 20, padding: 12, minWidth: 94 }]],
    water: [['Water sample', [-2.05, 0, .1], 28], ['Pure distillate', [1.55, 0, .04]]],
    thermite: [['Sand-filled safety can', [0, 0, .18], 15]],
    starchleaf: [['BOILING WATER', [-2.35, 0, .05], 22, { size: 8.2, minWidth: 104 }], ['ETHANOL · WATER BATH', [-.35, 0, -.42], 37, { size: 8.1, minWidth: 134 }], ['WARM RINSE', [1.28, 0, .16], 22, { size: 8.2, minWidth: 90 }], ['IODINE TILE', [2.55, 0, .15], 22, { size: 8.2, minWidth: 86 }]],
    lipase: [['LIPASE', [-2.05, 0, .05], 24], ['MILK + INDICATOR', [.24, .2, -.15], 27, { size: 8.2, minWidth: 118 }], ['ELECTRIC WATER BATH', [.55, 0, -.38], 44, { size: 8.1, minWidth: 128 }]],
    transformation: [],
    respiration: [['GLUCOSE', [-2.78, 0, .92], 24], ['YEAST SUSPENSION', [2.75, 0, .92], 26, { size: 8.1, minWidth: 108 }], ['SAME 10 MINUTES', [0, 0, 2.18], 18, { size: 8.1, minWidth: 104 }]],
    antibiotics: state.antibioticStage >= 7 ? [['SEALED · INVERTED · 25 °C', [0, .12, .05], 34, { size: 8.1, minWidth: 146 }]] : [['B. SUBTILIS · NUTRIENT AGAR', [0, .12, .05], 38, { size: 8.1, minWidth: 158 }], ['STERILE DISC SET', [2.35, .05, .74], 27, { size: 8.1, minWidth: 104 }]],
    osmosis: [[state.osmosisConcentration === 0 ? 'DISTILLED WATER · 0.0 M' : `${state.osmosisConcentration.toFixed(1)} M SUCROSE`, [0, 0, -.3], 30, { size: 8.1, minWidth: 126 }], ['BLOT DRY', [2.28, 0, .12], 25, { size: 8.1, minWidth: 72 }]],
    potometer: [['SEALED LEAFY SHOOT', [-.15, 2.48, -.15], -5, { size: 8.1, minWidth: 112 }], ['GRADUATED CAPILLARY', [1.32, .3, .02], 34, { size: 7.9, minWidth: 124 }], [`WIND ${state.potometerWindSpeed.toFixed(1)} m s⁻¹`, [-2.42, .38, -.25], 23, { size: 8.1, minWidth: 104 }]],
    pondweed: [['FILAMENT LAMP', [pondweedWorld.lampBaseX + .26, 1.72, -.6], -8], [`Elodea (${state.pondweedDistance} cm)`, [pondweedWorld.beakerX, -0.22, -.05], 39, { size: 8.2, minWidth: 110 }], ['Meter ruler', [pondweedWorld.beakerEdgeX - .95, -0.22, -.05], 39, { size: 8.2, minWidth: 96 }]],
    newton2: [['LIGHT GATE 1', [-0.6, 1.58, 0], -34, { size: 7.8, height: 19, padding: 12, minWidth: 76 }], ['LIGHT GATE 2', [1.0, 1.58, 0], -34, { size: 7.8, height: 19, padding: 12, minWidth: 76 }], [`TROLLEY · ${(state.newtonMass || 1).toFixed(1)} kg`, [trolleyX, 0.98, -0.42], 14, { size: 8.1, height: 20, padding: 13, minWidth: 92 }]],
    electromagnet: [[`${state.electromagnetTurns} WIRE TURNS`, [-.62, 2.62, .1], -7, { size: 8.4, minWidth: 96 }], ['STEEL PAPER CLIPS', [-.62, .12, .12], 28, { size: 8.2, minWidth: 104 }]],
    convection: [['ORANGE TRACER · SIMULATION', [-2.35, .08, .52], 17, { size: 7.9, minWidth: 132 }]],
    conduction: [['COPPER', [1.45, .91, -.86], 10, { size: 7.8, minWidth: 56 }], ['ALUMINIUM', [1.45, .91, 0], 10, { size: 7.8, minWidth: 70 }], ['STEEL', [1.45, .91, .86], 10, { size: 7.8, minWidth: 52 }]],
    thermal: state.thermalStage >= 3 ? [] : [['LESLIE CUBE', [0, .15, -.08], 22, { size: 8.2, minWidth: 82 }], ['THERMAL CAMERA', [2.52, .18, 1.1], 22, { size: 8.2, minWidth: 102 }]],
    latentheat: [...state.latentStage === 0 ? [[currentLatentMaterial().label, [2.05, .62, 1.25], 24, { size: 8.1, minWidth: 112 }]] : [], ['WATER BATH', [.32, .25, .08], 36, { size: 8, minWidth: 86 }]],
    wirelength: [],
    fieldlines: [[fieldConfigurations[state.fieldConfigIndex].label, [0, .22, .16], 33, { size: 8.1, minWidth: 142 }]]
  }[id] || [];
  if (id === 'lipase') tags.splice(0, tags.length, ['MILK + INDICATOR', [.55, .1, -.38], 44, { size: 8.2, minWidth: 118 }]);
  if (id === 'potometer') tags.splice(0, tags.length, ['SEALED LEAFY SHOOT', [-.15, 2.48, -.15], -5, { size: 8.1, minWidth: 112 }], ['GRADUATED CAPILLARY', [2.04, .3, .02], 34, { size: 7.9, minWidth: 124 }], [`WIND ${state.potometerWindSpeed.toFixed(1)} m s⁻¹`, [-2.42, .38, -.25], 23, { size: 8.1, minWidth: 104 }]);
  if (id === 'electromagnet') tags.splice(0, tags.length, [`${state.electromagnetTurns} WIRE TURNS`, [1.42, 2.62, .08], -7, { size: 8.4, minWidth: 96 }], ['STEEL PAPER CLIPS', [2.08, .12, .12], 28, { size: 8.2, minWidth: 104 }]);
  if (id === 'specificheat') tags.splice(0, tags.length, [`1.00 kg ${currentShcMaterial().label}`, [.15, .18, .08], 27, { size: 8.1, minWidth: 122 }]);
  tags.forEach(([label, world, offsetY, options]) => chemicalTag(label, world, offsetY, options));
  if (id === 'newton2') {
    const loggerScreen = lab3d.projectToScreen(-.28, .54, 1.46);
    if (loggerScreen) {
      const reading = value => Number.isFinite(value) ? value.toFixed(2) : '--.--';
      text('DATA LOGGER', loggerScreen.x, loggerScreen.y - 15, 5.5, '#89a8af', 800, 'center');
      text(`v₁  ${reading(state.newtonGate1Velocity)} m s⁻¹`, loggerScreen.x, loggerScreen.y - 3, 7.3, Number.isFinite(state.newtonGate1Velocity) ? '#8dffe5' : '#78979e', 800, 'center');
      text(`v₂  ${reading(state.newtonGate2Velocity)} m s⁻¹`, loggerScreen.x, loggerScreen.y + 10, 7.3, Number.isFinite(state.newtonGate2Velocity) ? '#8dffe5' : '#78979e', 800, 'center')
    }
  }
}
function drawTitrationControls(x, benchY) { const addingIndicator = state.titrationIndicatorTimer > 0, dropping = state.titrationDropTimer > 0, tapRunning = state.titrationStage === 2 && state.running, labels = ['ADD INDICATOR', 'OPEN TAP', 'TAP OPEN…', 'ADD ONE DROP', 'RECORD TITRE', 'RESET PRACTICAL'], label = addingIndicator ? 'ADDING INDICATOR…' : labels[state.titrationStage] || labels[0], status = addingIndicator ? 'ADDING 2 DROPS' : state.titrationStage === 0 ? 'HCl 25.0 cm³' : state.complete ? 'PALE PINK ENDPOINT' : `BURETTE ${state.titrationVolume.toFixed(2)} cm³`, q = addingIndicator ? timedRatio(state.titrationIndicatorTimer, titrationIndicatorDuration) : tapRunning ? timedRatio(state.titrationVolume, 24.8) : dropping ? 1 - timedRatio(state.titrationDropTimer, .42) : 0; progressButton(label, x + 30, benchY + 46, 150, 38, q, addingIndicator || tapRunning || dropping); rr(x + 190, benchY + 46, 164, 38, 8, '#f5f7f6', C.line); text(status, x + 272, benchY + 65, status.length > 19 ? 9.2 : 10.5, state.complete ? '#b23678' : C.ink, 750, 'center'); button('RESULTS', x + 364, benchY + 46, 84, 38, state.tab === 'graph') }
function drawMassControls(x, benchY) { const stage = state.massStage, primary = ['MOVE TO TRIPOD', 'TRANSFERRING…', 'REMOVE LID', 'LIGHT BUNSEN', 'HEATING…', 'COOL & REWEIGH', 'REWEIGHING…', 'RESET PRACTICAL'][stage] || 'MOVE TO TRIPOD', secondary = ['RECORD BEFORE', 'INITIAL MASS SAVED', 'LID CLOSED', 'READY TO HEAT', 'MAGNESIUM BURNING', 'MgO FORMED', 'BALANCE SETTLING', 'RECORD AFTER'][stage] || 'RECORD BEFORE', busy = stage === 1 || stage === 4 || stage === 6, q = stage === 1 || stage === 6 ? timedRatio(state.massTransfer?.t || 0, 1.55) : stage === 4 ? state.progress : 0; progressButton(primary, x + 30, benchY + 46, 144, 38, q, busy); button(secondary, x + 184, benchY + 46, 140, 38, false); button('RESULTS', x + 334, benchY + 46, 90, 38, state.tab === 'graph') }
function ratesPrimaryLabel() { if (state.ratesConditioning) return 'HEATING BATH…'; if (state.ratesStage === 0) return 'MOVE TO CROSS'; if (state.ratesStage === 1) return 'MOVING FLASK…'; if (state.ratesStage === 2) return 'ADD HCl'; if (state.ratesStage === 3) return 'REACTION RUNNING…'; return state.ratesResults.length < ratesTemperatures.length ? 'NEXT TEMPERATURE' : 'VIEW GRAPH' }
function drawRatesControls(x, benchY) { const primary = ratesPrimaryLabel(), busy = state.ratesConditioning || state.ratesStage === 1 || state.ratesStage === 3 || !!state.pour, conditioningSpan = Math.max(.01, state.ratesTargetTemp - 20), q = state.pour ? timedRatio(state.pour.t, 3.6) : state.ratesConditioning ? timedRatio(state.ratesBathTemp - 20, conditioningSpan) : state.ratesStage === 1 ? timedRatio(state.ratesStageTimer, 1.8) : state.ratesStage === 3 ? timedRatio(state.ratesStageTimer, ratesVisualDuration()) : 0; progressButton(primary, x + 30, benchY + 46, 158, 38, q, busy); button('RESET SERIES', x + 198, benchY + 46, 108, 38, false); button("BIRD'S EYE", x + 316, benchY + 46, 106, 38, state.tab === 'birdseye'); text(`TRIAL ${Math.min(ratesTemperatures.length, state.ratesTrialIndex + 1)} / ${ratesTemperatures.length}  ·  ${state.ratesTargetTemp} °C`, x + 30, benchY + 31, 9.5, '#d8e8ed', 750) }
function drawHydrogenControls(x, benchY) { const stage = state.hydrogenStage, primary = ['POUR DILUTE HCl', 'POURING…', 'COLLECTING H₂…', 'TEST WITH LIT SPLINT', 'IGNITING…', 'RESET PRACTICAL'][stage] || 'POUR DILUTE HCl', secondary = ['Mg RIBBON READY', 'ACID TRANSFER', 'THUMB SEALED', 'H₂ COLLECTED', 'SQUEAKY POP!', 'TEST COMPLETE'][stage] || 'Mg RIBBON READY', duration = stage === 1 ? 2.25 : stage === 2 ? 3.4 : stage === 4 ? 1.25 : 0, busy = !!duration && state.running; progressButton(primary, x + 30, benchY + 46, 168, 38, timedRatio(state.hydrogenTimer, duration, busy), busy); button(secondary, x + 208, benchY + 46, 138, 38, false); button('RECORD', x + 356, benchY + 46, 82, 38, false) }
function drawSaltsControls(x, benchY) { const stage = state.saltsStage, primary = ['POUR CuO', 'FILTER MIXTURE', 'HEAT SOLUTION', 'COOL & CRYSTALLISE', 'RESET PRACTICAL'][stage] || 'POUR CuO', secondary = ['ACID READY', 'CuO ADDED', 'FILTRATE READY', 'HEATING...', 'CRYSTALS FORMED'][stage] || 'ACID READY', duration = ({ 1: 2.5, 2: 3, 3: 4, 4: 5 })[stage] || 0; progressButton(primary, x + 30, benchY + 46, 178, 38, timedRatio(state.saltsTimer, duration, state.running), state.running); button(secondary, x + 218, benchY + 46, 142, 38, false) }
function drawWaterControls(x, benchY) { button(state.coolingWater ? 'WATER OFF' : 'WATER ON', x + 30, benchY + 46, 112, 38, state.coolingWater); progressButton(state.burner ? 'HEATER OFF' : 'HEATER ON', x + 152, benchY + 46, 112, 38, state.progress, state.burner && state.running); button('RECORD', x + 274, benchY + 46, 90, 38, false) }
function drawElectroControls(x, benchY) { progressButton(state.running || state.complete || state.electroWeighing ? 'RESET' : 'SWITCH ON', x + 30, benchY + 46, 112, 38, state.progress, state.running); progressButton('RECORD MASSES', x + 152, benchY + 46, 128, 38, timedRatio(state.electroWeighTimer, electroWeighDuration, state.electroWeighing), state.electroWeighing); button('RESULTS', x + 290, benchY + 46, 90, 38, state.tab === 'graph') }
function flameTestPrimaryLabel() { if (state.flameTestStage === 0) return 'SCOOP SALT'; if (state.flameTestStage === 1) return 'SCOOPING…'; if (state.flameTestStage === 2) return 'ENTER BLUE FLAME'; if (state.flameTestStage === 3) return 'TESTING…'; return state.flameTestTested.length === flameTestSalts.length ? 'RESET SERIES' : 'NEXT SALT' }
function drawFlameTestControls(x, benchY) { const salt = flameTestSalts[state.flameTestSalt], primary = flameTestPrimaryLabel(), busy = state.flameTestStage === 1 || state.flameTestStage === 3, duration = state.flameTestStage === 1 ? 2.15 : state.flameTestStage === 3 ? 3.15 : 0, status = state.flameTestStage >= 4 ? salt.flame.toUpperCase() : state.flameTestStage >= 2 ? `${salt.formula} ON SPATULA` : `${salt.formula} SELECTED`; progressButton(primary, x + 30, benchY + 46, 156, 38, timedRatio(state.flameTestTimer, duration, busy), busy); rr(x + 196, benchY + 46, 150, 38, 8, '#f5f7f6', C.line); text(status, x + 271, benchY + 65, status.length > 18 ? 8.5 : 9.5, state.flameTestStage >= 4 ? salt.flameHex : C.ink, 800, 'center'); button('SPECTRA', x + 356, benchY + 46, 88, 38, state.tab === 'graph') }
function drawThermiteControls(x, benchY) { const primary = state.complete ? 'RESET PRACTICAL' : state.running ? 'REACTION ACTIVE' : 'IGNITE FUSE', status = state.complete ? 'MOLTEN IRON FORMED' : state.running ? thermitePhase().toUpperCase() : 'SHIELD IN PLACE'; progressButton(primary, x + 30, benchY + 46, 150, 38, timedRatio(state.thermiteTimer, thermiteDuration, state.running), state.running); rr(x + 190, benchY + 46, 174, 38, 8, '#f5f7f6', C.line); text(status, x + 277, benchY + 65, status.length > 20 ? 8.5 : 9.5, state.running ? '#d95b2f' : C.ink, 800, 'center'); button('GRAPH', x + 374, benchY + 46, 76, 38, state.tab === 'graph') }
function drawDisplacementControls(x, benchY) { const labels = ['LOWER METALS', 'REACTIONS RUNNING…', 'RECORD RESULTS', 'RESET SERIES'], primary = labels[state.displacementStage] || labels[0], status = state.displacementStage === 0 ? '4 TEST TUBES READY' : state.displacementStage === 1 ? `${Math.round(state.progress * 100)}% OBSERVED` : state.displacementStage === 2 ? 'COATINGS FORMED' : 'SERIES RECORDED'; progressButton(primary, x + 30, benchY + 46, 164, 38, timedRatio(state.displacementTimer, displacementDuration, state.running), state.running); rr(x + 204, benchY + 46, 152, 38, 8, '#f5f7f6', C.line); text(status, x + 280, benchY + 65, 9.2, state.complete ? '#9a542c' : C.ink, 800, 'center'); button('RESULTS', x + 366, benchY + 46, 86, 38, state.tab === 'graph') }
function drawAlkaliControls(x, benchY) {
  const metal = alkaliMetal(), stage = state.alkaliStage || 0, labels = ['LOWER METAL', 'LOWERING…', 'REACTION RUNNING…', 'RECORD OBSERVATION', state.complete ? 'VIEW RESULTS' : 'NEXT METAL', 'CLEARING…'];
  const busy = [1, 2, 5].includes(stage);
  const duration = stage === 1 ? 1.85 : stage === 2 ? metal.duration : stage === 5 ? 1.35 : 0;
  progressButton(labels[stage] || labels[0], x + 30, benchY + 46, 164, 38, timedRatio(state.alkaliTimer, duration, busy), busy);
  button('RESULTS', x + 204, benchY + 46, 90, 38, state.tab === 'graph');
  text(`TRIAL ${Math.min(3, state.alkaliResults.length + 1)} / 3  ·  ${metal.name.toUpperCase()}  ·  SIMULATION ONLY`, x + 30, benchY + 31, 8.8, '#d8e8ed', 750);
}
function starchPrimaryLabel() { return ['BOIL LEAF', 'BOILING…', 'MOVE TO ETHANOL', 'DECOLOURISING…', 'RINSE LEAF', 'RINSING…', 'ADD IODINE', 'ADDING IODINE…', 'RESET PRACTICAL'][state.starchStage] || 'BOIL LEAF' }
function drawStarchControls(x, benchY) { const stage = state.starchStage || 0, busy = [1, 3, 5, 7].includes(stage), statuses = ['FRESH GREEN LEAF', 'IN BOILING WATER', 'LEAF SOFTENED', 'CHLOROPHYLL REMOVING', 'PALE LEAF READY', 'RINSING LEAF', 'ON WHITE TILE', 'IODINE SPREADING', 'BLUE-BLACK · STARCH']; progressButton(starchPrimaryLabel(), x + 30, benchY + 46, 166, 38, timedRatio(state.starchTimer, starchStageDurations[stage], busy), busy); rr(x + 206, benchY + 46, 164, 38, 8, '#f5f7f6', C.line); text(statuses[stage], x + 288, benchY + 65, (statuses[stage] || '').length > 19 ? 8.1 : 9.1, stage === 8 ? '#26344f' : C.ink, 800, 'center'); button('RESULT', x + 380, benchY + 46, 78, 38, state.tab === 'graph') }
function lipasePrimaryLabel() { if (state.lipaseConditioning) return 'HEATING BATH…'; if (state.lipaseStage === 0) return 'ADD LIPASE'; if (state.lipaseStage === 1) return 'ADDING LIPASE…'; if (state.lipaseStage === 2) return 'REACTION RUNNING…'; return state.lipaseResults.length < lipaseTemperatures.length ? 'NEXT TEMPERATURE' : 'VIEW GRAPH' }
function drawLipaseControls(x, benchY) { const busy = state.lipaseConditioning || state.lipaseStage === 1 || state.lipaseStage === 2, q = lipaseReactionProgress(), conditioningSpan = Math.max(.01, Math.abs(state.lipaseTargetTemp - 20)), fill = state.lipaseConditioning ? timedRatio(Math.abs(state.lipaseBathTemp - 20), conditioningSpan) : state.lipaseStage === 1 ? timedRatio(state.lipaseTimer, 1.8) : q; progressButton(lipasePrimaryLabel(), x + 30, benchY + 46, 166, 38, fill, busy); button('RESET SERIES', x + 206, benchY + 46, 110, 38, false); button('GRAPH', x + 326, benchY + 46, 76, 38, state.tab === 'graph'); text(`TRIAL ${Math.min(lipaseTemperatures.length, state.lipaseTrialIndex + 1)} / ${lipaseTemperatures.length}  ·  ${state.lipaseTargetTemp} °C  ·  ${Math.round(q * 100)}%`, x + 30, benchY + 31, 9.3, '#d8e8ed', 750) }
function transformationPrimaryLabel() { return ['LABEL CONTROLS', 'LABELLING…', 'ADD CELLS + DNA', 'PIPETTING…', 'ICE + HEAT SHOCK', 'HEAT SHOCK…', 'ADD LB + RECOVER', 'RECOVERING…', 'PLATE CELLS', 'SPREADING…', 'INCUBATE PLATES', 'INCUBATING…', 'VIEW RESULTS'][state.transformationStage || 0] || 'LABEL CONTROLS' }
function transformationStatus() { return ['STERILE SETUP READY', '+DNA / −DNA LABELS', 'CONTROLS LABELLED', 'PLASMID TO +DNA ONLY', 'TUBES ICE-COLD', '42 °C · 50 s', 'HEAT-SHOCK COMPLETE', 'LB RECOVERY', 'CELLS RECOVERED', 'FOUR PLATES INOCULATED', 'SEALED PLATES READY', '37 °C · OVERNIGHT', 'GFP RESULT REVEALED'][state.transformationStage || 0] || 'STERILE SETUP READY' }
function drawTransformationControls(x, benchY) { const stage = state.transformationStage || 0, busy = !!transformationStageDurations[stage]; progressButton(transformationPrimaryLabel(), x + 20, benchY + 46, 176, 38, transformationStageProgress(), busy && state.running); button('RESET', x + 206, benchY + 46, 82, 38, false); button('PLATES', x + 298, benchY + 46, 82, 38, state.tab === 'graph'); text(`pGLO-STYLE MODEL  ·  ${transformationStatus()}`, x + 20, benchY + 31, 8.8, '#d8e8ed', 750) }
function respirationPrimaryLabel() { return ['ADD GLUCOSE', 'ADDING GLUCOSE…', 'ADD YEAST', 'POURING YEAST…', 'FIT BALLOONS', 'FITTING BALLOONS…', 'START 10 MIN RUN', 'INCUBATING…', 'RECORD RESULTS', 'VIEW GRAPH'][state.respirationStage || 0] }
function respirationStageProgress() { const duration = respirationStageDurations[state.respirationStage]; return duration ? timedRatio(state.respirationTimer, duration, state.running) : state.respirationStage >= 8 ? 1 : 0 }
function drawRespirationControls(x, benchY) {
  const busy = [1, 3, 5, 7].includes(state.respirationStage), elapsedMinutes = state.respirationStage < 7 ? 0 : state.respirationStage === 7 ? respirationIncubationProgress() * 10 : 10;
  progressButton(respirationPrimaryLabel(), x + 20, benchY + 46, 174, 38, respirationStageProgress(), busy);
  button('RESET PRACTICAL', x + 204, benchY + 46, 116, 38, false);
  button('GRAPH', x + 330, benchY + 46, 76, 38, state.tab === 'graph');
  text(`5 TEMPERATURES  ·  EQUAL YEAST + GLUCOSE  ·  ${elapsedMinutes.toFixed(1)} / 10.0 min`, x + 20, benchY + 31, 8.7, '#d8e8ed', 750);
}
function antibioticPrimaryLabel() { return ['PREPARE ASEPTICALLY', 'CLEANING + MARKING…', 'INOCULATE AGAR', 'INOCULATING + DISPOSING…', 'PLACE DISCS', 'PLACING DISCS…', 'SEAL + INCUBATE', 'INCUBATOR RUNNING…', 'MEASURE ZONES', 'MEASURING ZONES…', 'VIEW RESULTS'][state.antibioticStage || 0] || 'PREPARE ASEPTICALLY' }
function drawAntibioticControls(x, benchY) {
  const stage = state.antibioticStage || 0, busy = !!antibioticStageDurations[stage] && state.running, measured = antibioticVisibleMeasurementCount(), growth = antibioticGrowthProgress();
  progressButton(antibioticPrimaryLabel(), x + 20, benchY + 46, 182, 38, busy ? antibioticStageProgress() : stage >= 8 ? 1 : 0, busy);
  button('RESET', x + 212, benchY + 46, 82, 38, false);
  button('RESULTS', x + 304, benchY + 46, 88, 38, state.tab === 'graph');
  text(stage >= 7 && stage <= 8 ? `GLASS-DOOR INCUBATOR  ·  25 °C  ·  ${(growth * 48).toFixed(0)} / 48 h` : stage >= 9 ? `${measured} / 4 ZONES MEASURED  ·  LID REMAINS CLOSED` : stage >= 2 ? '4 MARKED SECTORS  ·  SAFETY FLAME  ·  BIOHAZARD DISPOSAL' : 'ASEPTIC FIELD  ·  FLAME OFF WHILE DISINFECTING', x + 20, benchY + 31, 8.25, '#d8e8ed', 750);
}
function osmosisPrimaryLabel() { return ['LOWER CHIP', 'TRANSFERRING…', 'SOAKING…', 'REMOVE & BLOT', 'BLOTTING…', 'REWEIGH CHIP', 'REWEIGHING…', state.osmosisResults.length < osmosisConcentrations.length ? 'NEXT CONCENTRATION' : 'VIEW GRAPH'][state.osmosisStage || 0] }
function drawOsmosisControls(x, benchY) { const busy = [1, 2, 4, 6].includes(state.osmosisStage), q = osmosisProcessProgress(); progressButton(osmosisPrimaryLabel(), x + 30, benchY + 46, 174, 38, timedRatio(state.osmosisTimer, osmosisStageDurations[state.osmosisStage], busy), busy); button('RESET SERIES', x + 214, benchY + 46, 108, 38, false); button('GRAPH', x + 332, benchY + 46, 76, 38, state.tab === 'graph'); text(`TRIAL ${Math.min(osmosisConcentrations.length, state.osmosisTrialIndex + 1)} / ${osmosisConcentrations.length}  ·  ${state.osmosisConcentration.toFixed(1)} mol dm⁻³  ·  ${Math.round(q * 30)} min`, x + 30, benchY + 31, 9.1, '#d8e8ed', 750) }
function agarDiffusionPrimaryLabel() { return ['MEASURE CUBES', 'MEASURING…', 'LOWER INTO ACID', 'LOWERING…', 'START 10 MIN SOAK', 'DIFFUSING…', 'REMOVE & BLOT', 'BLOTTING…', 'CUT CUBES', 'CUTTING + REVEALING…', 'RECORD RESULTS', 'VIEW GRAPH'][state.agarDiffusionStage || 0] || 'MEASURE CUBES' }
function drawAgarDiffusionControls(x, benchY) {
  const stage = state.agarDiffusionStage || 0, busy = !!agarDiffusionStageDurations[stage] && state.running, elapsed = stage < 5 ? 0 : stage === 5 ? agarDiffusionSoakProgress() * 10 : 10;
  progressButton(agarDiffusionPrimaryLabel(), x + 22, benchY + 46, 190, 38, busy ? agarDiffusionStageProgress() : stage >= 10 ? 1 : 0, busy);
  button('RESET', x + 222, benchY + 46, 82, 38, false);
  button('GRAPH', x + 314, benchY + 46, 78, 38, state.tab === 'graph');
  text(`1, 2 + 3 cm CUBES  ·  DILUTE HCl  ·  ${elapsed.toFixed(1)} / 10.0 min`, x + 22, benchY + 31, 8.8, '#d8e8ed', 750);
}
function potometerPrimaryLabel() { return ['INTRODUCE BUBBLE', 'INTRODUCING…', 'ALIGN TO ZERO', 'ALIGNING…', 'START 5 MIN RUN', 'MEASURING…', state.potometerResults.length < potometerWindSpeeds.length ? 'NEXT WIND SPEED' : 'VIEW GRAPH'][state.potometerStage || 0] }
function drawPotometerControls(x, benchY) {
  const busy = [1, 3, 5].includes(state.potometerStage), q = potometerStageProgress(), elapsed = state.potometerStage === 5 ? q * 5 : state.potometerStage > 5 ? 5 : 0;
  progressButton(potometerPrimaryLabel(), x + 24, benchY + 46, 176, 38, q, busy);
  button('RESET SERIES', x + 210, benchY + 46, 108, 38, false);
  button('GRAPH', x + 328, benchY + 46, 76, 38, state.tab === 'graph');
  text(`TRIAL ${Math.min(potometerWindSpeeds.length, state.potometerTrialIndex + 1)} / ${potometerWindSpeeds.length}  ·  WIND ${state.potometerWindSpeed.toFixed(1)} m s⁻¹  ·  ${elapsed.toFixed(1)} min`, x + 24, benchY + 31, 8.8, '#d8e8ed', 750);
}
function quadratPrimaryLabel() {
  if (state.quadratStage === 9) return state.complete ? 'VIEW RESULTS' : 'RECORD SAMPLE';
  return ['LAY GRID TAPES', 'MEASURING…', 'GENERATE POINT', 'RANDOMISING…', 'PLACE QUADRAT', 'QUADRAT FALLING…', 'COUNT DAISIES', 'COUNTING…', 'RECORD SAMPLE'][state.quadratStage] || 'LAY GRID TAPES';
}
function drawQuadratControls(x, benchY) {
  const sample = currentQuadratSample(), busy = [1, 3, 5, 7].includes(state.quadratStage);
  progressButton(quadratPrimaryLabel(), x + 20, benchY + 46, 172, 38, quadratStageProgress(), busy);
  button('RESET STUDY', x + 202, benchY + 46, 104, 38, false);
  button('RESULTS', x + 316, benchY + 46, 88, 38, state.tab === 'graph');
  text(`SAMPLE ${Math.min(5, state.quadratSampleIndex + 1)} / 5  ·  RANDOM POINT (${sample.xM}, ${sample.yM})  ·  ${state.quadratStage >= 8 ? `${sample.daisies} DAISIES` : 'COUNT PENDING'}`, x + 20, benchY + 31, 8.6, '#d8e8ed', 750);
}
function capturePrimaryLabel() {
  if (state.captureStage === 9) return state.complete ? 'VIEW RESULTS' : 'RECORD';
  return ['SET TRAPS', 'SETTING + CAPTURING…', 'FIRST CAPTURE', 'COUNTING + MARKING…', 'RELEASE & WAIT', 'RELEASING + MIXING…', 'SECOND CAPTURE', 'RECAPTURE COUNT…', 'RECORD'][state.captureStage] || 'SET TRAPS';
}
function drawCaptureControls(x, benchY, w) {
  const busy = [1, 3, 5, 7].includes(state.captureStage);
  const compact = w < 650, primaryW = compact ? 138 : 180, resetX = x + (compact ? 158 : 210), resetW = compact ? 82 : 96, resultsX = x + (compact ? 248 : 316), resultsW = compact ? 52 : 88;
  progressButton(capturePrimaryLabel(), x + (compact ? 12 : 20), benchY + 46, primaryW, 38, captureStageProgress(), busy);
  button(compact ? 'RESET' : 'RESET STUDY', resetX, benchY + 46, resetW, 38, false);
  button(compact ? 'DATA' : 'RESULTS', resultsX, benchY + 46, resultsW, 38, state.tab === 'graph');
  let info = 'AWAITING TRAPS';
  if (state.captureStage >= 4) info = `MARKED: ${state.captureFirstCatch}`;
  if (state.captureStage >= 8) info = `RECAPTURE: ${state.captureSecondCatch} (MARKED: ${state.captureRecaptured})`;
  text(`LINCOLN INDEX  ·  ${info}`, x + (compact ? 12 : 20), benchY + 31, compact ? 7.7 : 8.6, '#d8e8ed', 750);
}
function transectPrimaryLabel() {
  if (state.transectStage === 7) return state.complete ? 'VIEW ZONATION' : 'NEXT POSITION';
  return ['LAY TRANSECT', 'EXTENDING TAPE…', 'MOVE QUADRAT', 'MOVING QUADRAT…', 'SURVEY QUADRAT', 'IDENTIFYING…', 'RECORD SAMPLE'][state.transectStage] || 'LAY TRANSECT';
}
function drawShoreTransectControls(x, benchY) {
  const station = currentTransectStation(), busy = [1, 3, 5].includes(state.transectStage);
  progressButton(transectPrimaryLabel(), x + 20, benchY + 46, 172, 38, transectStageProgress(), busy);
  button('RESET TRANSECT', x + 202, benchY + 46, 108, 38, false);
  button('ZONATION', x + 320, benchY + 46, 88, 38, state.tab === 'graph');
  text(`STATION ${Math.min(6, state.transectStationIndex + 1)} / 6  ·  ${station.distanceM} m  ·  ${station.zone} SHORE  ·  TIDE ${Math.round(state.shoreTideProgress * 100)}%`, x + 20, benchY + 31, 8.6, '#d8eef2', 750);
}
function ripplePrimaryLabel() {
  if (state.rippleStage === 7) return state.complete ? 'VIEW RESULTS' : 'NEXT FREQUENCY';
  return ['LEVEL TANK', 'LEVELLING…', 'START VIBRATOR', 'WAVES FORMING…', 'MEASURE 10 WAVES', 'STROBE + RULER…', 'RECORD SPEED'][state.rippleStage] || 'LEVEL TANK';
}
function drawRippleControls(x, benchY) {
  const trial = currentRippleTrial(), measured = state.rippleStage >= 6, busy = [1, 3, 5].includes(state.rippleStage), measurement = rippleTrialMeasurement(trial);
  progressButton(ripplePrimaryLabel(), x + 20, benchY + 46, 174, 38, rippleStageProgress(), busy);
  button('RESET SERIES', x + 204, benchY + 46, 108, 38, false);
  button('RESULTS', x + 322, benchY + 46, 82, 38, state.tab === 'graph');
  text(`TRIAL ${Math.min(5, state.rippleTrialIndex + 1)} / 5  ·  ${trial.frequencyHz.toFixed(1)} Hz  ·  ${measured ? `10λ ${trial.tenWavelengthCm.toFixed(1)} cm  ·  λ ${measurement.wavelengthCm.toFixed(2)} cm` : 'WAVELENGTH PENDING'}`, x + 20, benchY + 31, 8.5, '#d8eef4', 750);
}
let popAudioContext = null;
function primePopAudio() { try { const AudioCtor = window.AudioContext || window.webkitAudioContext; if (!AudioCtor) return; popAudioContext ??= new AudioCtor(); if (popAudioContext.state === 'suspended') popAudioContext.resume() } catch { popAudioContext = null } }
let geigerAudioCtx;
function playGeigerClick() {
  try {
    if (!geigerAudioCtx) geigerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (geigerAudioCtx.state === 'suspended') geigerAudioCtx.resume();
    const ac = geigerAudioCtx, now = ac.currentTime;
    const bufferSize = ac.sampleRate * 0.05, buffer = ac.createBuffer(1, bufferSize, ac.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.005));
    const noise = ac.createBufferSource(); noise.buffer = buffer;
    const filter = ac.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 1000;
    const gain = ac.createGain(); gain.gain.setValueAtTime(0.5, now);
    noise.connect(filter); filter.connect(gain); gain.connect(ac.destination);
    noise.start(now);
  } catch (e) {}
}

function playSqueakyPop() { if (state.hydrogenAudioPlayed) return; state.hydrogenAudioPlayed = true; primePopAudio(); const ac = popAudioContext; if (!ac) return; try { const now = ac.currentTime + .015, master = ac.createGain(); master.gain.setValueAtTime(.0001, now); master.gain.exponentialRampToValueAtTime(.46, now + .008); master.gain.exponentialRampToValueAtTime(.0001, now + .24); master.connect(ac.destination); const squeak = ac.createOscillator(), squeakGain = ac.createGain(); squeak.type = 'square'; squeak.frequency.setValueAtTime(1480, now); squeak.frequency.exponentialRampToValueAtTime(620, now + .17); squeakGain.gain.setValueAtTime(.18, now); squeakGain.gain.exponentialRampToValueAtTime(.0001, now + .2); squeak.connect(squeakGain).connect(master); squeak.start(now); squeak.stop(now + .22); const pop = ac.createOscillator(), popGain = ac.createGain(); pop.type = 'sine'; pop.frequency.setValueAtTime(230, now); pop.frequency.exponentialRampToValueAtTime(72, now + .08); popGain.gain.setValueAtTime(.8, now); popGain.gain.exponentialRampToValueAtTime(.0001, now + .11); pop.connect(popGain).connect(master); pop.start(now); pop.stop(now + .13); const frames = Math.floor(ac.sampleRate * .13), buffer = ac.createBuffer(1, frames, ac.sampleRate), samples = buffer.getChannelData(0); for (let i = 0; i < frames; i++)samples[i] = (Math.random() * 2 - 1) * (1 - i / frames); const noise = ac.createBufferSource(), filter = ac.createBiquadFilter(), noiseGain = ac.createGain(); noise.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = 1250; filter.Q.value = .8; noiseGain.gain.setValueAtTime(.35, now); noiseGain.gain.exponentialRampToValueAtTime(.0001, now + .13); noise.connect(filter).connect(noiseGain).connect(master); noise.start(now) } catch { } }
function playThermiteBurst() { if (state.thermiteAudioPlayed) return; state.thermiteAudioPlayed = true; primePopAudio(); const ac = popAudioContext; if (!ac) return; try { const now = ac.currentTime + .012, master = ac.createGain(); master.gain.setValueAtTime(.0001, now); master.gain.exponentialRampToValueAtTime(.27, now + .014); master.gain.exponentialRampToValueAtTime(.065, now + .34); master.gain.exponentialRampToValueAtTime(.0001, now + 1.45); master.connect(ac.destination); const boom = ac.createOscillator(), boomGain = ac.createGain(); boom.type = 'sine'; boom.frequency.setValueAtTime(96, now); boom.frequency.exponentialRampToValueAtTime(34, now + .62); boomGain.gain.setValueAtTime(.82, now); boomGain.gain.exponentialRampToValueAtTime(.0001, now + .72); boom.connect(boomGain).connect(master); boom.start(now); boom.stop(now + .75); const frames = Math.floor(ac.sampleRate * 1.35), buffer = ac.createBuffer(1, frames, ac.sampleRate), samples = buffer.getChannelData(0); for (let i = 0; i < frames; i++) { const q = i / frames, crackle = Math.random() > .972 ? 2.8 : 1; samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - q, 1.45) * crackle } const noise = ac.createBufferSource(), low = ac.createBiquadFilter(), high = ac.createBiquadFilter(), noiseGain = ac.createGain(); noise.buffer = buffer; low.type = 'lowpass'; low.frequency.setValueAtTime(4800, now); low.frequency.exponentialRampToValueAtTime(900, now + 1.25); high.type = 'highpass'; high.frequency.value = 80; noiseGain.gain.setValueAtTime(.68, now); noiseGain.gain.exponentialRampToValueAtTime(.0001, now + 1.34); noise.connect(low).connect(high).connect(noiseGain).connect(master); noise.start(now) } catch { } }
function drawFreeReactionCard(x, w) { const reaction = state.reaction, active = !reaction.complete, q = Math.max(0, Math.min(1, reaction.progress || 0)), y = 143; rr(x + 26, y, w - 52, 60, 8, active ? '#eaf5f3' : '#f1f5f3', active ? C.teal : '#a8c9bf'); text(active ? 'ACTIVE REACTION' : 'REACTION COMPLETE', x + 40, y + 13, 8.5, active ? C.teal : '#2f8067', 800); text(reaction.symbol, x + 40, y + 31, 11, C.ink, 700); wrappedText(reaction.word, x + 40, y + 49, w - 86, 8.8, C.muted, 600, 10, 1); if (active) { ctx.fillStyle = 'rgba(8,127,117,.16)'; ctx.fillRect(x + 40, y + 55, (w - 86) * q, 2) } }
function drawFocusModeTopBar(p) {
  const btnY = 14, btnH = 34;

  // 1. Graph modal popup button
  rr(16, btnY, 96, btnH, 17, state.graphModal ? C.teal : 'rgba(10, 28, 38, .85)', 'rgba(255,255,255,.2)');
  text('📊 Graph', 64, btnY + 17, 11, '#ffffff', 800, 'center');
  hit('open-graph-modal', 16, btnY, 96, btnH);

  // 2. Method dropdown button
  rr(120, btnY, 104, btnH, 17, state.methodDropdown ? C.teal : 'rgba(10, 28, 38, .85)', 'rgba(255,255,255,.2)');
  text('📋 Method', 172, btnY + 17, 11, '#ffffff', 800, 'center');
  hit('toggle-method-dropdown', 120, btnY, 104, btnH);

  // 3. Evaluation modal popup button
  rr(232, btnY, 120, btnH, 17, state.evaluationModal ? C.teal : 'rgba(10, 28, 38, .85)', 'rgba(255,255,255,.2)');
  text('⚖️ Evaluation', 292, btnY + 17, 11, '#ffffff', 800, 'center');
  hit('practical-evaluation', 232, btnY, 120, btnH);

  // Exit Focus button on top right
  rr(W - 136, btnY, 120, btnH, 17, 'rgba(10, 28, 38, .85)', 'rgba(255,255,255,.2)');
  text('↙️ Exit Focus', W - 76, btnY + 17, 11, '#ffffff', 800, 'center');
  hit('toggle-focus-mode', W - 136, btnY, 120, btnH);
}

function drawMethodDropdownPanel() {
  if (!state.methodDropdown) return;
  const p = practicals[state.selected];
  const steps = p.steps || [];
  const x = 120, y = 54, w = 440;
  const activeStep = liveMethodStepIndex(p);
  
  ctx.save();
  ctx.font = '650 11px Inter, sans-serif';
  const lineHeights = steps.map(s => {
    const lines = wrapTextLines(s, w - 60, 11, 650);
    const h = Math.max(32, lines.length * 16 + 12);
    return { lines, h };
  });
  const totalH = 48 + lineHeights.reduce((sum, item) => sum + item.h + 6, 0) + 8;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  rr(x, y, w, totalH, 12, '#ffffff', '#b4c7cd');
  ctx.restore();

  hit('method-dropdown-body', x, y, w, totalH);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, 38, [12, 12, 0, 0]);
  ctx.clip();
  ctx.fillStyle = p.color || C.teal;
  ctx.fillRect(x, y, w, 38);
  ctx.restore();

  text('PRACTICAL METHOD STEPS', x + 16, y + 19, 10, '#ffffff', 800);
  rr(x + w - 30, y + 8, 22, 22, 11, 'rgba(255,255,255,.25)');
  text('✕', x + w - 19, y + 19, 11, '#ffffff', 800, 'center');
  hit('toggle-method-dropdown', x + w - 30, y + 8, 22, 22);

  let curY = y + 48;
  steps.forEach((step, idx) => {
    const { lines, h } = lineHeights[idx];
    const isActive = idx === activeStep;
    
    rr(x + 12, curY, w - 24, h, 6, isActive ? 'rgba(8, 127, 117, .08)' : '#f6f9f8', isActive ? C.teal : '#e0e8e7');
    
    rr(x + 18, curY + 6, 20, 20, 10, isActive ? C.teal : '#7a8f96');
    text(String(idx + 1), x + 28, curY + 16, 9.5, '#ffffff', 800, 'center');

    lines.forEach((line, li) => {
      text(line, x + 46, curY + 16 + li * 16, 11, isActive ? C.ink : '#39484d', isActive ? 750 : 600);
    });

    hit('method-step', x + 12, curY, w - 24, h, { index: idx, source: 'focus-dropdown' });

    curY += h + 6;
  });
}

function main() {
  const L = state.focusMode ? 0 : 270, R = state.focusMode ? 0 : Math.max(260, Math.min(330, W * .23)), x = L, w = W - L - R, p = practicals[state.selected], free = p.id === 'free', wrappedObjective = ['titration', 'displacement', 'alkali', 'starchleaf', 'lipase', 'transformation', 'respiration', 'antibiotics', 'osmosis', 'potometer', 'quadrats', 'capture', 'shoretransect', 'ripple', 'electromagnet', 'convection', 'conduction', 'thermal', 'hooke', 'specificheat', 'latentheat', 'wirelength', 'ivdevices', 'fieldlines'].includes(p.id), equationY = wrappedObjective ? 151 : 143;
  if (!state.focusMode) {
    ctx.fillStyle = '#fff'; ctx.fillRect(x, 64, w, H - 64); text(p.title.toUpperCase(), x + 28, 91, 11, p.color || C.teal, 800); if (wrappedObjective) wrappedText(p.objective, x + 28, 113, Math.min(w - 56, 700), 17, C.ink, 650, 21, 2); else text(p.objective, x + 28, 119, 17, C.ink, 650); if (free) { if (state.reaction) drawFreeReactionCard(x, w); else { rr(x + 26, 143, w - 52, 54, 8, '#f1eefb'); text('QUICK START', x + 40, 158, 9, C.muted, 800); text(p.eq, x + 40, 179, 13, C.ink, 600) } } else { rr(x + 26, equationY, w - 52, 72, 8, '#f2f6f5'); text('SYMBOL EQUATION', x + 40, equationY + 17, 8.5, C.muted, 800); text(p.eq, x + 145, equationY + 17, 12, C.ink, 650); text('WORD EQUATION', x + 40, equationY + 47, 8.5, C.muted, 800); wrappedText(p.word, x + 145, equationY + 47, w - 190, 10.2, C.ink, 600, 12, 2) }
  }
  const benchY = H - 128, arenaTop = state.focusMode ? 0 : (free ? 205 : wrappedObjective ? 229 : 221); let wall = ctx.createLinearGradient(x, arenaTop, x, benchY); wall.addColorStop(0, '#f9fbfb'); wall.addColorStop(1, '#e9efef'); ctx.fillStyle = wall; ctx.fillRect(x, arenaTop, w, benchY - arenaTop);
  // glazed laboratory tiles
  ctx.strokeStyle = 'rgba(155,174,179,.24)'; ctx.lineWidth = 1; for (let gx = x; gx < x + w; gx += 42) { ctx.beginPath(); ctx.moveTo(gx, arenaTop); ctx.lineTo(gx, benchY); ctx.stroke() } for (let gy = arenaTop; gy < benchY; gy += 42) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke() } const glow = ctx.createRadialGradient(x + w * .53, benchY - 115, 0, x + w * .53, benchY - 115, w * .45); glow.addColorStop(0, state.burner ? 'rgba(71,179,255,.15)' : 'rgba(255,255,255,.62)'); glow.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = glow; ctx.fillRect(x, arenaTop, w, benchY - arenaTop);
  // blue resin worktop edge over a dark enamel cabinet frontage
  const shoreScene = p.id === 'shoretransect', meadowScene = p.id === 'quadrats' || p.id === 'capture', immersiveOutdoor = shoreScene || meadowScene;
  let topg = ctx.createLinearGradient(x, benchY, x, benchY + 25); topg.addColorStop(0, meadowScene ? '#376c35' : '#789aaa'); topg.addColorStop(.18, meadowScene ? '#294f2c' : '#4f788b'); topg.addColorStop(1, meadowScene ? '#183923' : '#244f66'); ctx.fillStyle = topg; ctx.fillRect(x, benchY, w, 25);
  const cabinetTop = benchY + 25, cabinetBottom = H - 5, cabinetHeight = cabinetBottom - cabinetTop;
  let frontg = ctx.createLinearGradient(x, cabinetTop, x, H); frontg.addColorStop(0, shoreScene ? '#174f63' : meadowScene ? '#264c2e' : '#454d52'); frontg.addColorStop(.42, shoreScene ? '#0d3a52' : meadowScene ? '#183b25' : '#343c41'); frontg.addColorStop(1, shoreScene ? '#071f34' : meadowScene ? '#0d2719' : '#20272b'); ctx.fillStyle = frontg; ctx.fillRect(x, cabinetTop, w, H - cabinetTop);
  let cabinetLip = ctx.createLinearGradient(x, cabinetTop, x, cabinetTop + 10); cabinetLip.addColorStop(0, 'rgba(8,15,19,.7)'); cabinetLip.addColorStop(1, 'rgba(255,255,255,.035)'); ctx.fillStyle = cabinetLip; ctx.fillRect(x, cabinetTop, w, 10);
  const panelCount = Math.max(2, Math.min(4, Math.floor(w / 230))), panelSpan = w / panelCount;
  ctx.save();
  if (!immersiveOutdoor) for (let i = 0; i < panelCount; i++) {
    const px = x + i * panelSpan + 7, py = cabinetTop + 8, pw = panelSpan - 14, ph = Math.max(38, cabinetHeight - 13);
    rr(px, py, pw, ph, 3, 'rgba(27,33,37,.24)', 'rgba(9,14,17,.58)');
    ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(px + 2, py + ph - 2); ctx.lineTo(px + 2, py + 2); ctx.lineTo(px + pw - 2, py + 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.52)'; ctx.beginPath(); ctx.moveTo(px + pw - 2, py + 2); ctx.lineTo(px + pw - 2, py + ph - 2); ctx.lineTo(px + 2, py + ph - 2); ctx.stroke();
    const inset = 7; ctx.strokeStyle = 'rgba(255,255,255,.075)'; ctx.strokeRect(px + inset + .5, py + inset + .5, pw - inset * 2 - 1, ph - inset * 2 - 1);
  }
  ctx.fillStyle = '#171d21'; ctx.fillRect(x, H - 5, w, 5); ctx.restore();
  const sceneBottom = immersiveOutdoor ? H : benchY;
  if (lab3d.available) ctx.clearRect(x, arenaTop, w, sceneBottom - arenaTop);
  const cx = x + w * .52, cy = benchY - 57; if (lab3d.available) { lab3d.resize(x, arenaTop, w, Math.max(180, sceneBottom - arenaTop), UI_SCALE); registerWebGLInteractions(p.id, cx, cy); ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillRect(x, arenaTop, w, sceneBottom - arenaTop); ctx.restore(); if (!free) drawChemicalTags(p.id); if (p.id === 'mass' && state.massStage === 2 && state.massLidOn && state.layout?.lid) { const lp = state.layout.lid; rr(lp.x - 76, lp.y - 64, 152, 27, 8, 'rgba(255,255,255,.96)', 'rgba(124,98,184,.6)'); text('CLICK LID TO REMOVE', lp.x, lp.y - 50, 9.5, '#6b52a6', 800, 'center') } if (p.id === 'hydrogen' && ((state.hydrogenStage === 4 && state.hydrogenTimer > .36) || state.hydrogenStage === 5)) { const active = state.hydrogenStage === 4, hp = lab3d.projectToScreen(.65, active ? 3.35 : 2.85, .02); if (hp) { rr(hp.x - 72, hp.y - 14, 144, 30, 9, active ? 'rgba(255,245,224,.97)' : 'rgba(232,247,241,.97)', active ? 'rgba(228,93,79,.72)' : 'rgba(8,127,117,.55)'); text(active ? 'SQUEAKY POP!' : 'HYDROGEN CONFIRMED', hp.x, hp.y + 1, 10, active ? '#c94b3f' : C.teal, 850, 'center') } } } else drawApparatus(p.id, cx, cy, w, benchY, x);
  if (state.focusMode) drawFocusModeTopBar(p);
  if (shoreScene) rr(x + 8, benchY + 18, w - 16, 86, 12, 'rgba(5,31,45,.78)', 'rgba(116,221,226,.28)');
  else if (meadowScene) rr(x + 8, benchY + 18, w - 16, 86, 12, 'rgba(12,43,24,.8)', 'rgba(164,224,137,.3)');
  // controls
  if (p.id === 'alkali') {
    drawAlkaliControls(x, benchY);
  } else {
  if (free) { button('CLEAR BENCH', x + 30, benchY + 46, 112, 38, false); button('UNDO LAST', x + 152, benchY + 46, 105, 38, false); text(`${state.workspace.length} item${state.workspace.length === 1 ? '' : 's'} on bench`, x + 278, benchY + 65, 11, '#d8e8ed', 650) } else if (p.id === 'rates') drawRatesControls(x, benchY); else if (p.id === 'mass') drawMassControls(x, benchY); else if (p.id === 'hydrogen') drawHydrogenControls(x, benchY); else if (p.id === 'titration') drawTitrationControls(x, benchY); else if (p.id === 'salts') drawSaltsControls(x, benchY); else if (p.id === 'water') drawWaterControls(x, benchY); else if (p.id === 'electro') drawElectroControls(x, benchY); else if (p.id === 'flame') drawFlameTestControls(x, benchY); else if (p.id === 'displacement') drawDisplacementControls(x, benchY); else if (p.id === 'thermite') drawThermiteControls(x, benchY); else if (p.id === 'starchleaf') drawStarchControls(x, benchY); else if (p.id === 'lipase') drawLipaseControls(x, benchY); else if (p.id === 'transformation') drawTransformationControls(x, benchY); else if (p.id === 'respiration') drawRespirationControls(x, benchY); else if (p.id === 'antibiotics') drawAntibioticControls(x, benchY); else if (p.id === 'osmosis') drawOsmosisControls(x, benchY); else if (p.id === 'agardiffusion') drawAgarDiffusionControls(x, benchY); else if (p.id === 'potometer') drawPotometerControls(x, benchY); else if (p.id === 'pondweed') drawPondweedControls(x, benchY, w); else if (p.id === 'quadrats') drawQuadratControls(x, benchY); else if (p.id === 'capture') drawCaptureControls(x, benchY, w); else if (p.id === 'shoretransect') drawShoreTransectControls(x, benchY); else if (p.id === 'ripple') drawRippleControls(x, benchY); else if (p.id === 'newton2') drawNewton2Controls(x, benchY, w); else if (p.id === 'electromagnet') drawElectromagnetControls(x, benchY); else if (p.id === 'convection') drawConvectionControls(x, benchY); else if (p.id === 'conduction') drawConductionControls(x, benchY); else if (p.id === 'thermal') drawThermalControls(x, benchY); else if (p.id === 'density') drawDensityControls(x, benchY); else if (p.id === 'hooke') drawHookeControls(x, benchY); else if (p.id === 'specificheat') drawSpecificHeatControls(x, benchY); else if (p.id === 'latentheat') drawLatentHeatControls(x, benchY); else if (p.id === 'wirelength') drawWireLengthControls(x, benchY); else if (p.id === 'ivdevices') drawIvDeviceControls(x, benchY); else if (p.id === 'fieldlines') drawFieldLineControls(x, benchY); else if (p.id === 'nuclear') drawNuclearControls(x, benchY); else { progressButton(state.running ? 'RESET' : 'START', x + 30, benchY + 46, 112, 38, state.progress, state.running); progressButton('ADD REAGENT', x + 152, benchY + 46, 120, 38, state.pour ? timedRatio(state.pour.t, 3.6) : 0, !!state.pour); button('RECORD', x + 282, benchY + 46, 90, 38, false) }
  }
  // meters
  rr(x + w - 190, benchY + 35, 164, 58, 8, '#f5f7f6');
  text(p.id === 'thermite' ? 'SIMULATED CORE' : p.id === 'displacement' ? 'SERIES STATUS' : p.id === 'flame' ? 'ACTIVE SAMPLE' : p.id === 'starchleaf' ? 'LEAF TEST' : p.id === 'lipase' ? 'ENZYME TRIAL' : p.id === 'transformation' ? 'TRANSFORMATION' : p.id === 'respiration' ? 'CARBON DIOXIDE' : p.id === 'antibiotics' ? 'INHIBITION ZONES' : p.id === 'osmosis' ? 'OSMOSIS TRIAL' : p.id === 'agardiffusion' ? 'DIFFUSION RESULT' : p.id === 'potometer' ? 'WATER UPTAKE' : p.id === 'pondweed' ? 'PHOTOSYNTHESIS' : p.id === 'quadrats' ? 'QUADRAT SAMPLE' : p.id === 'capture' ? 'CAPTURE COUNTS' : p.id === 'shoretransect' ? 'SHORE ZONATION' : p.id === 'ripple' ? 'WAVE SPEED' : p.id === 'newton2' ? 'ACCELERATION' : p.id === 'electromagnet' ? 'MAGNETIC LIFT' : p.id === 'convection' ? 'WATER FLOW' : p.id === 'conduction' ? 'PIN FALL TEST' : p.id === 'thermal' ? 'INFRARED VIEW' : p.id === 'density' ? 'DENSITY MEASURE' : p.id === 'hooke' ? 'FORCE / EXTENSION' : p.id === 'specificheat' ? 'ENERGY / TEMPERATURE' : p.id === 'latentheat' ? 'PHASE / TEMPERATURE' : p.id === 'wirelength' ? 'ELECTRICAL READING' : p.id === 'ivdevices' ? 'LIVE I–V READING' : p.id === 'fieldlines' ? 'FIELD PATTERN' : p.id === 'nuclear' ? 'RADIATION COUNT' : 'LIVE READINGS', x + w - 177, benchY + 49, 9, C.muted, 800);
  if (p.id === 'titration') {
    text(`${state.titrationVolume.toFixed(2)} cm³`, x + w - 177, benchY + 72, 15, '#b23678', 750);
    text(`pH ${state.ph.toFixed(1)}`, x + w - 78, benchY + 72, 14, C.blue, 700);
  } else if (p.id === 'flame') {
    const salt = flameTestSalts[state.flameTestSalt];
    text(salt.formula, x + w - 177, benchY + 72, 16, salt.flameHex, 800);
    text(state.flameTestStage >= 4 ? salt.flame.toUpperCase() : `${state.flameTestTested.length}/5 TESTED`, x + w - 72, benchY + 72, 8.5, state.flameTestStage >= 4 ? salt.flameHex : C.teal, 800, 'center');
  } else if (p.id === 'thermite') {
    text(`${state.temp.toFixed(0)} °C`, x + w - 177, benchY + 72, 16, '#d95b2f', 800);
    text(state.running ? 'ACTIVE' : 'SHIELDED', x + w - 72, benchY + 72, 9, state.running ? '#d95b2f' : C.teal, 800, 'center');
  } else if (p.id === 'displacement') {
    text(`${Math.round(state.progress * 100)}%`, x + w - 177, benchY + 72, 16, '#b96f3e', 800);
    text(state.complete ? 'COMPLETE' : state.running ? 'REACTING' : 'READY', x + w - 74, benchY + 72, 9, state.running ? '#b96f3e' : C.teal, 800, 'center');
  } else if (p.id === 'alkali') {
    const metal = alkaliMetal(), label = state.alkaliStage === 3 ? 'OBSERVE' : state.complete ? 'COMPLETE' : state.running ? 'REACTING' : 'READY';
    text(metal.symbol, x + w - 177, benchY + 72, 18, metal.color, 800);
    text(label, x + w - 74, benchY + 72, 9, label === 'REACTING' ? metal.color : C.teal, 800, 'center');
  } else if (p.id === 'starchleaf') {
    const leafStatus = state.starchStage >= 8 ? 'BLUE-BLACK' : state.starchStage >= 4 ? 'PALE LEAF' : state.starchStage >= 3 ? 'FADING LEAF' : 'GREEN LEAF';
    text(leafStatus, x + w - 177, benchY + 72, state.starchStage >= 8 ? 9.2 : 11.5, state.starchStage >= 8 ? '#26344f' : '#3f8f4f', 800);
    text(state.starchStage >= 8 ? 'STARCH +' : `${state.starchStage}/8`, x + w - 74, benchY + 72, state.starchStage >= 8 ? 8.7 : 9.5, state.starchStage >= 8 ? '#26344f' : C.teal, 800, 'center');
  } else if (p.id === 'lipase') {
    text(`${state.lipaseBathTemp.toFixed(1)} °C`, x + w - 177, benchY + 72, 15, '#d85c91', 800);
    text(state.lipaseStage >= 3 ? `${lipaseMeasuredTime()} s` : `pH ${state.ph.toFixed(1)}`, x + w - 74, benchY + 72, 10, state.lipaseStage >= 3 ? C.teal : C.ink, 800, 'center');
  } else if (p.id === 'transformation') {
    text(state.complete ? 'GFP ON' : `${state.transformationStage}/12`, x + w - 177, benchY + 72, state.complete ? 14 : 12, state.complete ? '#35b968' : '#5b55a5', 800);
    text(state.complete ? '3/4 GROW' : `${state.temp.toFixed(0)} °C`, x + w - 74, benchY + 72, 9.5, state.complete ? '#35b968' : C.teal, 800, 'center');
  } else if (p.id === 'respiration') {
    const q = respirationIncubationProgress(), peakVolume = respirationGasVolume(40, q);
    text(`${peakVolume.toFixed(1)} cm³`, x + w - 177, benchY + 72, 13.5, '#a462ba', 800);
    text(state.respirationStage >= 7 ? `${(q * 10).toFixed(1)} min` : `${state.respirationStage}/9`, x + w - 74, benchY + 72, 9.5, state.respirationStage >= 7 ? C.teal : C.ink, 800, 'center');
  } else if (p.id === 'antibiotics') {
    const measured = antibioticVisibleMeasurementCount(), largest = state.antibioticStage >= 8 ? 30 : 0;
    text(largest ? `${largest} mm max` : 'no growth yet', x + w - 177, benchY + 72, largest ? 12.5 : 10.2, '#397f84', 800);
    text(state.antibioticStage >= 9 ? `${measured}/4 read` : state.antibioticStage >= 7 ? '25 °C' : 'ASEPTIC', x + w - 74, benchY + 72, 9.2, C.teal, 800, 'center');
  } else if (p.id === 'osmosis') {
    const osmosisMass = state.osmosisStage >= 7 ? osmosisFinalMass() : state.osmosisStage >= 2 ? osmosisInitialMass + (osmosisFinalMass() - osmosisInitialMass) * osmosisProcessProgress() : osmosisInitialMass;
    text(`${osmosisMass.toFixed(2)} g`, x + w - 177, benchY + 72, 15, '#b67b42', 800);
    text(`${state.osmosisConcentration.toFixed(1)} M`, x + w - 74, benchY + 72, 10, C.teal, 800, 'center');
  } else if (p.id === 'agardiffusion') {
    const soak = agarDiffusionSoakProgress(), smallest = agarDiffusionResult(1);
    text(state.agarDiffusionStage >= 10 ? `${smallest.percentageDiffused}%` : `${(soak * 10).toFixed(1)} min`, x + w - 177, benchY + 72, 14, '#c64882', 800);
    text(state.agarDiffusionStage >= 10 ? '1 cm cube' : `${Math.round(soak * 100)}%`, x + w - 74, benchY + 72, 9.2, C.teal, 800, 'center');
  } else if (p.id === 'potometer') {
    const distance = state.potometerStage === 5 ? potometerDistance() * potometerStageProgress() : state.potometerStage >= 6 ? potometerDistance() : state.potometerBubbleMm;
    text(`${distance.toFixed(1)} mm`, x + w - 177, benchY + 72, 14.5, '#2f8d73', 800);
    text(`${state.potometerWindSpeed.toFixed(1)} m/s`, x + w - 74, benchY + 72, 9.5, C.teal, 800, 'center');
  } else if (p.id === 'quadrats') {
    const sample = currentQuadratSample(), visibleCount = state.quadratStage >= 8 ? sample.daisies : state.quadratCurrentCount;
    text(`${visibleCount || 0} daisies`, x + w - 177, benchY + 72, 13.2, '#3b8b52', 800);
    text(`${state.quadratResults.length}/5 saved`, x + w - 74, benchY + 72, 9.2, C.teal, 800, 'center');
  } else if (p.id === 'capture') {
    const counts = captureVisibleCounts();
    const firstLabel = state.complete ? `N ≈ ${Math.round(state.captureFirstCatch * state.captureSecondCatch / state.captureRecaptured)}` : state.captureStage >= 3 ? `${counts.firstMarked} MARKED` : `${counts.firstCaught} CAUGHT`;
    const secondLabel = state.captureStage >= 6 ? `${counts.secondMarked}/${counts.secondCaught} MARKS` : state.captureStage >= 5 ? `${counts.released} RELEASED` : 'SAMPLE 1';
    text(firstLabel, x + w - 177, benchY + 72, state.complete ? 14.5 : 10.2, '#8b5a2b', 800);
    text(secondLabel, x + w - 69, benchY + 72, 7.8, C.teal, 800, 'center');
  } else if (p.id === 'shoretransect') {
    const station = currentTransectStation();
    text(`${station.distanceM} m`, x + w - 177, benchY + 72, 15, '#297f86', 800);
    text(station.zone, x + w - 74, benchY + 72, 9.2, C.teal, 800, 'center');
  } else if (p.id === 'ripple') {
    const trial = currentRippleTrial(), measurement = rippleTrialMeasurement(trial), measured = state.rippleStage >= 6;
    text(measured ? `${measurement.speedMs.toFixed(3)} m/s` : 'λ pending', x + w - 177, benchY + 72, measured ? 12.5 : 11.5, '#1687ad', 800);
    text(`${trial.frequencyHz.toFixed(1)} Hz`, x + w - 74, benchY + 72, 10, C.teal, 800, 'center');
  } else if (p.id === 'pondweed') {
    const bpm = state.pondweedLampOn ? Math.round(52 / Math.pow((state.pondweedDistance || 10) / 10, 1.8) + 4) : 0;
    text(`${bpm} bpm`, x + w - 177, benchY + 72, 16, '#2e7d32', 800);
    text(`${state.pondweedDistance} cm`, x + w - 74, benchY + 72, 10, C.teal, 800, 'center');
  } else if (p.id === 'newton2') {
    const acc = +(state.newtonForce / state.newtonMass).toFixed(2);
    text(`${acc.toFixed(2)} m/s²`, x + w - 177, benchY + 72, 15, '#0288d1', 800);
    text(`F=${state.newtonForce}N`, x + w - 74, benchY + 72, 9, C.teal, 800, 'center');
  } else if (p.id === 'electromagnet') {
    text(`${state.electromagnetTurns} turns`, x + w - 177, benchY + 72, 13.5, '#4361b3', 800);
    text(state.electromagnetStage >= 6 ? `${state.electromagnetClips} clips` : state.electromagnetStage >= 1 ? 'ON' : 'OFF', x + w - 74, benchY + 72, 10, state.electromagnetStage >= 1 ? '#4361b3' : C.muted, 800, 'center');
  } else if (p.id === 'convection') {
    text(state.convectionStage >= 3 ? 'CLOCKWISE' : 'STILL', x + w - 177, benchY + 72, 12.5, '#ef7f3b', 800);
    text(`${state.temp.toFixed(0)} °C`, x + w - 74, benchY + 72, 10, state.convectionStage >= 3 ? '#ef7f3b' : C.muted, 800, 'center');
  } else if (p.id === 'conduction') {
    const fallen = Object.values(conductionPinTimes).flat().filter(t => state.conductionTimer >= t).length;
    text(`${fallen} / 12 pins`, x + w - 177, benchY + 72, 13.5, '#b46b36', 800);
    text(`${state.conductionTimer.toFixed(1)} s`, x + w - 74, benchY + 72, 10, C.teal, 800, 'center');
  } else if (p.id === 'thermal') {
    const facing = thermalFacingSurface();
    text(`${facing.temperature.toFixed(0)} °C`, x + w - 177, benchY + 72, 15, '#b7376d', 800);
    text(state.thermalStage >= 4 ? 'LIVE IR' : state.thermalStage >= 1 ? 'ROTATING' : 'AMBIENT', x + w - 74, benchY + 72, 9, state.thermalStage >= 1 ? '#b7376d' : C.muted, 800, 'center');
  } else if (p.id === 'density') {
    const sample = densitySamples[state.densitySample || 0], stage = state.densityStage || 0;
    const measuredMass = stage >= 1 ? sample.mass : 0;
    const displacedVolume = stage >= 5 ? sample.vol : stage === 4 ? sample.vol * densityDisplacementProgress() : 0;
    text(`${measuredMass.toFixed(1)} g`, x + w - 177, benchY + 72, 14, '#00897b', 800);
    text(stage >= 6 ? `${sample.density.toFixed(2)} g/cm³` : `${displacedVolume.toFixed(1)} cm³`, x + w - 74, benchY + 72, stage >= 6 ? 11 : 12, stage >= 6 ? '#00897b' : C.ink, 800, 'center');
  } else if (p.id === 'hooke') {
    text(`${state.hookeForceN.toFixed(1)} N`, x + w - 177, benchY + 72, 15, '#9b4f87', 800);
    text(`${hookeExtensionCm().toFixed(1)} cm`, x + w - 74, benchY + 72, 10.5, state.hookeForceN === 6 ? '#c65f37' : C.teal, 800, 'center');
  } else if (p.id === 'specificheat') {
    text(`${state.shcTemperatureC.toFixed(1)} °C`, x + w - 177, benchY + 72, 13.5, '#d06b38', 800);
    text(`${(state.shcEnergyJ / 1000).toFixed(1)} kJ`, x + w - 74, benchY + 72, 10.5, C.teal, 800, 'center');
  } else if (p.id === 'latentheat') {
    const phaseLabel = state.latentPhaseFraction < .08 ? 'SOLID' : state.latentPhaseFraction > .92 ? 'LIQUID' : state.latentStage === 5 ? 'FREEZING' : 'MELTING';
    text(`${state.latentTemperatureC.toFixed(1)} °C`, x + w - 177, benchY + 72, 13.5, '#c66a43', 800);
    text(phaseLabel, x + w - 74, benchY + 72, 9.2, state.latentPhaseFraction > .08 && state.latentPhaseFraction < .92 ? '#d18b35' : C.teal, 800, 'center');
  } else if (p.id === 'wirelength') {
    const live = state.wireStage >= 1 && state.wireStage <= 2;
    text(live ? `${state.wireVoltageV.toFixed(2)} V` : '0.00 V', x + w - 177, benchY + 72, 14, '#7a4eb0', 800);
    text(live ? `${wireCurrent().toFixed(2)} A` : `${wireResistance().toFixed(1)} Ω`, x + w - 74, benchY + 72, 11, live ? '#d45757' : C.ink, 800, 'center');
  } else if (p.id === 'ivdevices') {
    text(`${state.ivDeviceV >= 0 ? '+' : ''}${state.ivDeviceV.toFixed(2)} V`, x + w - 177, benchY + 72, 12.6, '#8c58a5', 800);
    text(`${(state.ivCurrentA * 1000).toFixed(1)} mA`, x + w - 74, benchY + 72, 9.8, currentIvDevice().colour, 800, 'center');
  } else if (p.id === 'fieldlines') {
    const aligned = state.fieldStage >= 4;
    text(`${state.fieldResults.length} / 3`, x + w - 177, benchY + 72, 15, '#d45757', 800);
    text(aligned ? 'ALIGNED' : state.fieldStage >= 1 ? 'LOOSE' : 'READY', x + w - 74, benchY + 72, 9.5, aligned ? '#d45757' : C.muted, 800, 'center');
  } else if (p.id === 'nuclear') {
    text(`${Math.floor(state.nuclearCount)} counts`, x + w - 177, benchY + 72, 12.6, nuclearSources[state.nuclearSource].colour, 800);
    text(state.running ? `${Math.max(0, 10 - state.nuclearTimer).toFixed(1)} s` : state.nuclearStage === 6 ? `${state.nuclearCount * 6} cpm` : 'READY', x + w - 74, benchY + 72, 9.5, state.running ? '#e2aa1b' : C.teal, 800, 'center');
  } else {
    text(`${state.temp.toFixed(1)} °C`, x + w - 177, benchY + 72, 17, C.red, 750);
    text(`pH ${state.ph.toFixed(1)}`, x + w - 78, benchY + 72, 14, C.blue, 700);
  }
}
function pondweedControlLayout(x, w) {
  const rowLeft = x + 20, readingLeft = x + w - 190, readingGap = 16, buttonGap = 10, lampWidth = 100, countWidth = 110;
  const distanceWidth = Math.max(44, Math.min(90, (readingLeft - readingGap - rowLeft - lampWidth - countWidth - buttonGap * 3) / 2));
  const minusX = rowLeft, plusX = minusX + distanceWidth + buttonGap, lampX = plusX + distanceWidth + buttonGap, countX = lampX + lampWidth + buttonGap;
  return { distanceWidth, minusX, plusX, lampX, lampWidth, countX, countWidth, readingLeft, readingGap: readingLeft - (countX + countWidth) };
}
function drawPondweedControls(x, benchY, w) {
  const layout = pondweedControlLayout(x, w);
  button('- 10cm', layout.minusX, benchY + 46, layout.distanceWidth, 38, false);
  button('+ 10cm', layout.plusX, benchY + 46, layout.distanceWidth, 38, false);
  button(state.pondweedLampOn ? 'LAMP OFF' : 'LAMP ON', layout.lampX, benchY + 46, layout.lampWidth, 38, state.pondweedLampOn);
  progressButton('COUNT 1 MIN', layout.countX, benchY + 46, layout.countWidth, 38, state.pondweedCountAnimating ? state.pondweedCountTimer / pondweedCountAnimationDuration : 0, state.pondweedCountAnimating);
}
function newton2ControlLayout(x, w) {
  const rowLeft = x + 20, readingLeft = x + w - 190, minimumReadingGap = 16, buttonGap = 10;
  const availableWidth = readingLeft - minimumReadingGap - rowLeft - buttonGap * 2;
  const releaseWidth = Math.max(112, Math.min(140, availableWidth * .42));
  const forceWidth = Math.max(44, Math.min(90, (availableWidth - releaseWidth) / 2));
  const minusX = rowLeft, plusX = minusX + forceWidth + buttonGap, releaseX = plusX + forceWidth + buttonGap;
  return { forceWidth, minusX, plusX, releaseX, releaseWidth, readingLeft, readingGap: readingLeft - (releaseX + releaseWidth) };
}
function drawNewton2Controls(x, benchY, w) {
  const layout = newton2ControlLayout(x, w);
  button('FORCE -0.1N', layout.minusX, benchY + 46, layout.forceWidth, 38, false);
  button('FORCE +0.1N', layout.plusX, benchY + 46, layout.forceWidth, 38, false);
  progressButton('RELEASE TROLLEY', layout.releaseX, benchY + 46, layout.releaseWidth, 38, state.newtonPos, state.newtonRunning);
}
function electromagnetPrimaryLabel() {
  const labels = ['CLOSE SWITCH', 'ENERGISING…', 'LOWER CORE', 'LOWERING…', 'LIFT CORE', 'LIFTING…', 'RECORD COUNT', 'NEXT COIL'];
  return state.electromagnetResults.length === electromagnetTurnsSeries.length && state.electromagnetStage === 7 ? 'VIEW GRAPH' : labels[state.electromagnetStage] || labels[0];
}
function drawElectromagnetControls(x, benchY) {
  const busy = [1, 3, 5].includes(state.electromagnetStage), count = state.electromagnetStage >= 6 ? state.electromagnetClips : 0;
  progressButton(electromagnetPrimaryLabel(), x + 20, benchY + 46, 164, 38, timedRatio(state.electromagnetTimer, electromagnetStageDurations[state.electromagnetStage], busy), busy);
  button('RESET SERIES', x + 194, benchY + 46, 108, 38, false);
  button('GRAPH', x + 312, benchY + 46, 78, 38, state.tab === 'graph');
  text(`TRIAL ${Math.min(5, state.electromagnetTrialIndex + 1)} / 5  ·  ${state.electromagnetTurns} turns  ·  ${count || '—'} clips`, x + 20, benchY + 31, 9.2, '#d8e8ed', 750);
}
function convectionPrimaryLabel() { return ['ADD TRACER', 'ADDING TRACER…', 'LIGHT BUNSEN', 'CONVECTION ACTIVE…', 'RESET DEMO'][state.convectionStage] || 'ADD TRACER' }
function drawConvectionControls(x, benchY) {
  const duration = state.convectionStage === 1 ? 1.9 : state.convectionStage === 3 ? convectionDuration : 0;
  progressButton(convectionPrimaryLabel(), x + 20, benchY + 46, 166, 38, timedRatio(state.convectionTimer, duration, state.running), state.running);
  button('OBSERVATION', x + 196, benchY + 46, 112, 38, state.tab === 'graph');
  button('RESET DEMO', x + 318, benchY + 46, 104, 38, false);
  text(state.convectionStage >= 3 ? 'ORANGE TRACER SHOWS CLOCKWISE WATER FLOW' : 'TEACHER DEMONSTRATION · SIMULATION ONLY', x + 20, benchY + 31, 8.8, '#d8e8ed', 750);
}
function drawConductionControls(x, benchY) {
  progressButton(state.conductionStage === 0 ? 'LIGHT BUNSEN' : state.running ? 'HEATING RODS…' : 'RESET DEMO', x + 20, benchY + 46, 154, 38, timedRatio(state.conductionTimer, conductionDuration, state.running), state.running);
  button('RESULTS', x + 184, benchY + 46, 92, 38, state.tab === 'graph');
  button('RESET DEMO', x + 286, benchY + 46, 106, 38, false);
  const fallen = Object.values(conductionPinTimes).flat().filter(t => state.conductionTimer >= t).length;
  text(`${fallen} / 12 PINS FALLEN  ·  ${state.conductionTimer.toFixed(1)} s`, x + 20, benchY + 31, 9.2, '#d8e8ed', 750);
}
function thermalPrimaryLabel() { return ['ADD HOT WATER', 'POURING WATER…', 'PICK UP CAMERA', 'CAMERA MOVING…', 'CAPTURE IMAGE', 'RESET DEMO'][state.thermalStage] || 'ADD HOT WATER' }
function drawThermalControls(x, benchY) {
  const facing = thermalFacingSurface();
  progressButton(thermalPrimaryLabel(), x + 20, benchY + 46, 162, 38, timedRatio(state.thermalTimer, thermalStageDurations[state.thermalStage], state.running), state.running);
  button('THERMAL VIEW', x + 192, benchY + 46, 112, 38, state.tab === 'graph');
  button('RESET DEMO', x + 314, benchY + 46, 106, 38, false);
  text(state.thermalStage >= 4 ? `LIVE FALSE-COLOUR VIEW · ${facing.label} ${facing.temperature.toFixed(0)} °C` : state.thermalStage >= 1 ? 'LESLIE CUBE WARMING & ROTATING · CAMERA READY' : 'AMBIENT LAB · 21 °C', x + 20, benchY + 31, 8.9, '#d8e8ed', 750);
}
function drawDensityControls(x, benchY) {
  const stage = state.densityStage || 0;
  const primaryLabel = stage === 0 ? 'WEIGH OBJECT' : stage === 1 ? 'FILL EUREKA CAN' : stage === 2 ? 'FILLING & MOVING…' : stage === 3 ? 'LOWER OBJECT' : stage === 4 ? 'LOWERING…' : stage === 5 ? 'RECORD DENSITY' : 'CHANGE SAMPLE';
  const busy = stage === 2 || stage === 4;
  const duration = stage === 2 ? densityTransferDuration : stage === 4 ? densityImmersionDuration : 0;
  progressButton(primaryLabel, x + 20, benchY + 46, 155, 38, timedRatio(state.densityTimer, duration, busy), busy);
  button('CHANGE SAMPLE', x + 185, benchY + 46, 140, 38, busy);
  button('RESET PRACTICAL', x + 335, benchY + 46, 145, 38, false);
}
function hookePrimaryLabel() {
  if (state.complete) return 'VIEW GRAPH';
  return ['RECORD ZERO', 'ADDING + SETTLING…', 'RECORD READING', 'ADD 100 g MASS'][state.hookeStage] || 'RECORD ZERO';
}
function drawHookeControls(x, benchY) {
  const busy = state.hookeStage === 1;
  progressButton(hookePrimaryLabel(), x + 20, benchY + 46, 176, 38, timedRatio(state.hookeTimer, hookeStageDurations[1], busy), busy);
  button('RESET SERIES', x + 206, benchY + 46, 108, 38, false);
  button('GRAPH', x + 324, benchY + 46, 76, 38, state.tab === 'graph');
  const status = state.hookeStage === 1 ? 'SPRING MOVING' : state.hookeStage === 2 ? 'SETTLED · READ AT EYE LEVEL' : state.complete ? 'PROPORTIONAL LIMIT FOUND' : `${state.hookeResults.length} / ${hookeForcesN.length} READINGS`;
  text(`${state.hookeForceN.toFixed(1)} N  ·  ${hookeTotalLengthCm().toFixed(1)} cm total  ·  ${status}`, x + 20, benchY + 31, 8.8, '#d8e8ed', 750);
}
function specificHeatPrimaryLabel() {
  if (state.complete) return 'VIEW GRAPH';
  return ['PREPARE BLOCK', 'INSULATING + INSERTING…', 'START HEATING', 'HEATING…', 'CALCULATE c', 'VIEW GRAPH'][state.shcStage] || 'PREPARE BLOCK';
}
function drawSpecificHeatControls(x, benchY) {
  const busy = state.shcStage === 1 || state.shcStage === 3;
  progressButton(specificHeatPrimaryLabel(), x + 20, benchY + 46, 174, 38, timedRatio(state.shcTimer, shcStageDurations[state.shcStage], busy), busy);
  button(`MATERIAL: ${currentShcMaterial().label}`, x + 204, benchY + 46, 150, 38, busy);
  button('RESET', x + 364, benchY + 46, 74, 38, false);
  button('GRAPH', x + 448, benchY + 46, 72, 38, state.tab === 'graph');
  const power = state.shcStage === 3 ? '24.0 W ON' : 'SUPPLY OFF', prepared = state.shcStage >= 2 ? 'PROBES SEATED' : 'BLOCK READY';
  text(`1.00 kg ${currentShcMaterial().label}  ·  ${prepared}  ·  ${power}  ·  ${(state.shcEnergyJ / 1000).toFixed(1)} kJ`, x + 20, benchY + 31, 8.9, '#d8e8ed', 750);
}
function latentHeatPrimaryLabel() {
  if (state.complete) return 'VIEW CURVES';
  return ['ASSEMBLE BATH', 'ASSEMBLING…', 'START HEATING', 'HEATING + LOGGING…', 'START COOLING', 'COOLING + LOGGING…', 'VIEW CURVES'][state.latentStage] || 'ASSEMBLE BATH';
}
function latentHeatControlLayout(x, w) {
  const rowLeft = x + 20, readingLeft = x + w - 190, gap = 10, ideal = [176, 154, 72, 78];
  const scale = Math.max(.76, Math.min(1, (readingLeft - 16 - rowLeft - gap * 3) / ideal.reduce((sum, width) => sum + width, 0)));
  const widths = ideal.map(width => Math.floor(width * scale)), positions = [rowLeft];
  for (let index = 1; index < widths.length; index++) positions.push(positions[index - 1] + widths[index - 1] + gap);
  return { positions, widths, readingLeft, readingGap: readingLeft - (positions[3] + widths[3]) };
}
function drawLatentHeatControls(x, benchY, w = W - x - (state.focusMode ? 0 : Math.max(260, Math.min(330, W * .23)))) {
  const busy = state.latentStage === 1 || state.latentStage === 3 || state.latentStage === 5;
  const layout = latentHeatControlLayout(x, w);
  progressButton(latentHeatPrimaryLabel(), layout.positions[0], benchY + 46, layout.widths[0], 38, timedRatio(state.latentTimer, latentStageDurations[state.latentStage], busy), busy);
  button(`SAMPLE: ${currentLatentMaterial().short}`, layout.positions[1], benchY + 46, layout.widths[1], 38, busy || state.latentStage > 2 && !state.complete);
  button('RESET', layout.positions[2], benchY + 46, layout.widths[2], 38, false);
  button('CURVES', layout.positions[3], benchY + 46, layout.widths[3], 38, state.tab === 'graph');
  const stageTime = [3, 5].includes(state.latentStage) ? Math.min(latentSimulatedStageSeconds, state.latentTimer / latentStageDurations[state.latentStage] * latentSimulatedStageSeconds) : state.latentStage >= 4 ? latentSimulatedStageSeconds : 0;
  const phase = state.latentPhaseFraction < .08 ? 'SOLID' : state.latentPhaseFraction > .92 ? 'LIQUID' : state.latentStage === 5 ? 'FREEZING PLATEAU' : 'MELTING PLATEAU';
  text(`${currentLatentMaterial().label}  ·  ${phase}  ·  ${stageTime.toFixed(0)} s  ·  ${state.latentTemperatureC.toFixed(1)} °C`, x + 20, benchY + 31, 8.8, '#d8e8ed', 750);
}
function wirePrimaryLabel() {
  if (state.complete) return 'VIEW GRAPH';
  return ['POWER PACK ON', 'POWER PACK STARTING…', 'POWER PACK OFF', 'NEXT LENGTH', 'MOVING CONTACT…'][state.wireStage] || 'POWER PACK ON';
}
function drawWireLengthControls(x, benchY) {
  const busy = state.wireStage === 1 || state.wireStage === 4;
  progressButton(wirePrimaryLabel(), x + 20, benchY + 46, 164, 38, timedRatio(state.wireTimer, wireStageDurations[state.wireStage], busy), busy);
  button('RESET SERIES', x + 194, benchY + 46, 108, 38, false);
  button('GRAPH', x + 312, benchY + 46, 78, 38, state.tab === 'graph');
  const live = state.wireStage >= 1 && state.wireStage <= 2;
  text(`TRIAL ${Math.min(5, state.wireTrialIndex + 1)} / 5  ·  ${state.wireLengthCm} cm  ·  ${live ? `${wireCurrent().toFixed(2)} A` : 'POWER PACK OFF'}`, x + 20, benchY + 31, 9.1, '#d8e8ed', 750);
}
function ivPrimaryLabel() {
  if (state.ivStage === 1) return 'SWEEP RUNNING…';
  if (state.ivStage === 2) return 'SAVE CURVE';
  if (state.ivStage === 3) return state.ivResults.length >= ivDeviceDefinitions.length ? 'VIEW CURVES' : 'NEXT DEVICE';
  if (state.ivStage === 4) return 'CHANGING DEVICE…';
  if (state.ivStage === 5 || state.complete) return 'VIEW CURVES';
  return 'RUN I–V SWEEP';
}
function drawIvDeviceControls(x, benchY) {
  const busy = state.ivStage === 1 || state.ivStage === 4, sweepQ = state.ivStage === 1 ? state.ivTimer / ivSweepDurationS : state.ivStage === 4 ? state.ivDeviceTransition : 0;
  progressButton(ivPrimaryLabel(), x + 20, benchY + 46, 154, 38, sweepQ, busy);
  button(`DEVICE · ${currentIvDevice().short}`, x + 184, benchY + 46, 148, 38, busy || state.ivStage > 0 && state.ivStage < 4);
  button('RESET', x + 342, benchY + 46, 70, 38, false);
  button('CURVES', x + 422, benchY + 46, 78, 38, state.tab === 'graph');
  const polarity = state.ivStage === 1 && state.ivTimer >= ivSweepIntervalS * 8 ? 'REVERSED POLARITY' : state.ivStage === 1 ? 'FORWARD SWEEP' : 'SUPPLY AT ZERO';
  text(`${state.ivResults.length} / 3 CURVES SAVED  ·  ${currentIvDevice().short}  ·  ${polarity}`, x + 20, benchY + 31, 8.7, '#d8e8ed', 750);
}
function fieldPrimaryLabel() {
  if (state.complete) return 'VIEW PATTERNS';
  return ['SPRINKLE FILINGS', 'SPRINKLING…', 'TAP PAPER', 'FILINGS ALIGNING…', 'RECORD PATTERN', 'CHANGING MAGNETS…'][state.fieldStage] || 'SPRINKLE FILINGS';
}
function drawFieldLineControls(x, benchY) {
  const busy = [1, 3, 5].includes(state.fieldStage);
  progressButton(fieldPrimaryLabel(), x + 20, benchY + 46, 172, 38, timedRatio(state.fieldTimer, fieldStageDurations[state.fieldStage], busy), busy);
  button('RESET STUDY', x + 202, benchY + 46, 104, 38, false);
  button('PATTERNS', x + 316, benchY + 46, 90, 38, state.tab === 'graph');
  text(`PATTERN ${Math.min(3, state.fieldConfigIndex + 1)} / 3  ·  ${fieldConfigurations[state.fieldConfigIndex].short.toUpperCase()}`, x + 20, benchY + 31, 8.9, '#d8e8ed', 750);
}
function drawNuclearControls(x, benchY) {
  button('SOURCE · ' + nuclearSources[state.nuclearSource].short, x + 20, benchY + 46, 146, 38, false);
  button('ABSORBER · ' + nuclearAbsorbers[state.nuclearAbsorber].short, x + 174, benchY + 46, 130, 38, false);
  progressButton(state.running ? 'STOP COUNT' : 'MEASURE 10 s', x + 312, benchY + 46, 112, 38, state.running ? state.nuclearTimer / 10 : 0, state.running);
  button('RESET', x + 432, benchY + 46, 76, 38, false);
  const phase = state.nuclearStage === 1 ? 'SOURCE TRANSFER' : state.nuclearStage === 3 ? 'ABSORBER MOVING' : state.running ? 'COUNTING' : state.nuclearStage === 6 ? 'READING HELD' : state.nuclearSource ? 'ALIGNED · READY' : 'SELECT A SEALED SOURCE';
  text(`${phase}  ·  ${state.nuclearResults.length} reading${state.nuclearResults.length === 1 ? '' : 's'} saved`, x + 20, benchY + 31, 8.7, '#d8e8ed', 750);
}
function drawPracticalEvaluationButton(x, y, w, h = 46) {
  const complete = state.complete;
  ctx.save();
  if (complete) {
    ctx.shadowColor = 'rgba(8, 177, 158, .68)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 2;
  }
  const fill = complete ? ctx.createLinearGradient(x, y, x + w, y + h) : '#eef7f6';
  if (complete) {
    fill.addColorStop(0, '#0aa292');
    fill.addColorStop(1, '#087f75');
  }
  rr(x, y, w, h, 8, fill, complete ? '#52d8c8' : C.teal);
  ctx.restore();

  const centreY = y + h / 2;
  ctx.fillStyle = complete ? 'rgba(255,255,255,.2)' : C.teal;
  ctx.beginPath();
  ctx.arc(x + 18, centreY, 11, 0, Math.PI * 2);
  ctx.fill();
  text(complete ? '✓' : '📊', x + 18, centreY, complete ? 11 : 10.5, '#fff', 800, 'center');
  text('OPEN EVALUATION', x + 36, centreY - 7, 9.6, complete ? '#fff' : C.ink, 800);
  text(complete ? 'READY — IV, DV, CVs & GCSE answers' : 'IV, DV, CVs & GCSE answers', x + 36, centreY + 8, complete ? 7.9 : 8.5, complete ? '#d9fffa' : C.teal, 650);
  text('↗', x + w - 14, centreY, 13, complete ? '#fff' : C.teal, 800, 'center');
  hit('practical-evaluation', x, y, w, h);
}
function drawGraphExpandButton(panelX, panelWidth) {
  const mobile = mobileLandscapeLayout, w = mobile ? 32 : 82, h = mobile ? 32 : 28, x = panelX + panelWidth - w - 18, y = mobile ? 82 : GRAPH_SIDEBAR_HEADER_Y - h / 2;
  rr(x, y, w, h, 7, '#ffffff', C.teal);
  if (mobile) {
    const left = x + 9, right = x + w - 9, top = y + 9, bottom = y + h - 9, arm = 4;
    ctx.save();
    ctx.strokeStyle = C.teal;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(left + arm, top); ctx.lineTo(left, top); ctx.lineTo(left, top + arm);
    ctx.moveTo(right - arm, top); ctx.lineTo(right, top); ctx.lineTo(right, top + arm);
    ctx.moveTo(left, bottom - arm); ctx.lineTo(left, bottom); ctx.lineTo(left + arm, bottom);
    ctx.moveTo(right, bottom - arm); ctx.lineTo(right, bottom); ctx.lineTo(right - arm, bottom);
    ctx.stroke();
    ctx.restore()
  } else text('↗  EXPAND', x + w / 2, y + h / 2, 9.2, C.teal, 800, 'center');
  hit('open-graph-modal', x, y, w, h);
}
function rightbar() {
  if (state.focusMode) return;
  const R = Math.max(260, Math.min(330, W * .23)), x = W - R, p = practicals[state.selected], dragLab = p.id === 'rates' || p.id === 'temp';
  rightSidebarLayoutSnapshot = null;
  hookeGuidanceHitbox = null;
  if (p.id === 'free') { drawFreeLibrary(x, R); return }
  ctx.fillStyle = '#f4f6f5';
  ctx.fillRect(x, 64, R, H - 64);

  const resultLabel = p.id === 'flame' ? 'SPECTRA' : p.id === 'starchleaf' ? 'RESULT' : p.id === 'transformation' ? 'PLATES' : p.id === 'shoretransect' ? 'ZONATION' : ['quadrats', 'capture', 'ripple', 'alkali', 'antibiotics'].includes(p.id) ? 'RESULTS' : p.id === 'convection' ? 'OBSERVATION' : p.id === 'thermal' ? 'THERMAL VIEW' : p.id === 'fieldlines' ? 'PATTERNS' : ['latentheat', 'ivdevices'].includes(p.id) ? 'CURVES' : ['mass', 'electro', 'titration', 'displacement', 'conduction'].includes(p.id) ? 'RESULTS' : p.id === 'chrom' ? 'MEASURE' : p.id === 'salts' ? 'VIEW RESULTS' : p.id === 'co2' ? "BIRD'S EYE" : 'GRAPH';
  if (p.id === 'rates') {
    if (mobileLandscapeLayout && state.tab === 'graph') {
      button('METHOD', x + 10, 82, 60, 32, state.tab === 'bench');
      button('GRAPH', x + 76, 82, 52, 32, true);
      button("BIRD'S EYE", x + 134, 82, 70, 32, false)
    } else {
      button('METHOD', x + 10, 82, 76, 32, state.tab === 'bench');
      button('GRAPH', x + 93, 82, 70, 32, state.tab === 'graph');
      button("BIRD'S EYE", x + 170, 82, R - 180, 32, state.tab === 'birdseye')
    }
  } else {
    button('METHOD', x + 18, 82, 92, 32, state.tab === 'bench');
    const resultWidth = mobileLandscapeLayout && state.tab === 'graph' && currentGraphModalKind(p.id) ? 86 : p.id === 'co2' ? 112 : 92;
    button(resultLabel, x + 118, 82, resultWidth, 32, p.id === 'co2' ? state.tab === 'birdseye' : state.tab === 'graph');
  }

  const graphContentY = graphSidebarContentY(p.id);
  if (state.tab === 'bench') {
    const compact = mobileLandscapeLayout || UI_SCALE < .995 || H < 790, contentTop = compact ? 122 : 126, contentBottom = H - (compact ? 9 : 14), cardX = x + 18, cardW = R - 36;
    const activeStep = liveMethodStepIndex(p);
    const headingHeight = compact ? 12 : 15, headingToContentGap = compact ? 3 : 7, baseSectionGap = compact ? 4 : 9, headingSize = compact ? 10.1 : 10.8;
    const methodSize = compact ? 9.2 : 10.6, methodLineHeight = compact ? 11.2 : 13.4, methodTextWidth = cardW - 58, methodCardGap = compact ? 3 : 5;
    const methodCards = p.steps.map(step => { const lines = wrapTextLines(step, methodTextWidth, methodSize, 650); return { step, lines, baseHeight: Math.max(compact ? 28 : 42, lines.length * methodLineHeight + (compact ? 7 : 16)), minHeight: Math.max(compact ? 24 : 42, lines.length * methodLineHeight + (compact ? 3 : 16)) } });
    const reactSize = compact ? 9.4 : 10.3, reactLineHeight = compact ? 10.8 : 12.6, reactRowGap = compact ? 2 : 4, reactTextWidth = R - 101;
    const reactantCards = p.reactants.map(name => { const lines = wrapTextLines(name, reactTextWidth, reactSize, 650); return { name, lines, baseHeight: Math.max(compact ? 20 : 28, lines.length * reactLineHeight + (compact ? 6 : 14)), minHeight: Math.max(compact ? 18 : 28, lines.length * reactLineHeight + (compact ? 3 : 14)) } });
    const gearGap = 8, gearW = (R - 48 - gearGap) / 2, gearSize = compact ? 8.1 : 9.3, gearLineHeight = compact ? 9.4 : 11.2, gearRowGap = compact ? 3 : 5;
    const gearCards = p.gear.slice(0, 4).map(name => ({ name, lines: wrapTextLines(name, gearW - 18, gearSize, 600) })), gearRows = Math.ceil(gearCards.length / 2);
    const gearRowCards = Array.from({ length: gearRows }, (_, row) => { const cards = gearCards.slice(row * 2, row * 2 + 2); return { cards, baseHeight: Math.max(compact ? 20 : 28, ...cards.map(card => card.lines.length * gearLineHeight + (compact ? 6 : 12))), minHeight: Math.max(compact ? 18 : 28, ...cards.map(card => card.lines.length * gearLineHeight + (compact ? 3 : 12))) } });
    const guideSize = compact ? 8.9 : 10, guideLineHeight = compact ? 10.6 : 12.2, guideLines = wrapTextLines(state.toast, R - 64, guideSize, 600), guideBaseHeight = Math.max(compact ? 42 : 62, guideLines.length * guideLineHeight + (compact ? 14 : 20)), guideMinHeight = compact ? Math.max(34, guideLines.length * guideLineHeight + 8) : guideBaseHeight, evaluationBaseHeight = compact ? 40 : 50, evaluationMinHeight = compact ? 36 : evaluationBaseHeight;
    const sectionHeadingBlock = headingHeight + headingToContentGap;
    const methodBaseHeight = sectionHeadingBlock + methodCards.reduce((sum, card) => sum + card.baseHeight, 0) + Math.max(0, methodCards.length - 1) * methodCardGap;
    const reactBaseHeight = sectionHeadingBlock + reactantCards.reduce((sum, card) => sum + card.baseHeight, 0) + Math.max(0, reactantCards.length - 1) * reactRowGap;
    const apparatusBaseHeight = sectionHeadingBlock + gearRowCards.reduce((sum, row) => sum + row.baseHeight, 0) + Math.max(0, gearRows - 1) * gearRowGap;
    const guidanceBaseHeight = sectionHeadingBlock + guideBaseHeight, evaluationBaseSectionHeight = sectionHeadingBlock + evaluationBaseHeight;
    const naturalHeight = methodBaseHeight + reactBaseHeight + apparatusBaseHeight + guidanceBaseHeight + evaluationBaseSectionHeight + baseSectionGap * 4;
    const minSectionGap = compact ? 1 : baseSectionGap;
    const minimumHeight = sectionHeadingBlock * 5 + methodCards.reduce((sum, card) => sum + card.minHeight, 0) + Math.max(0, methodCards.length - 1) * methodCardGap + reactantCards.reduce((sum, card) => sum + card.minHeight, 0) + Math.max(0, reactantCards.length - 1) * reactRowGap + gearRowCards.reduce((sum, row) => sum + row.minHeight, 0) + Math.max(0, gearRows - 1) * gearRowGap + guideMinHeight + evaluationMinHeight + minSectionGap * 4;
    const availableHeight = contentBottom - contentTop, compressionCapacity = Math.max(0, naturalHeight - minimumHeight), compressionRatio = compressionCapacity ? Math.min(1, Math.max(0, naturalHeight - availableHeight) / compressionCapacity) : 0;
    const compressHeight = (base, minimum) => base - (base - minimum) * compressionRatio;
    methodCards.forEach(card => { card.layoutHeight = compressHeight(card.baseHeight, card.minHeight) });
    reactantCards.forEach(card => { card.layoutHeight = compressHeight(card.baseHeight, card.minHeight) });
    gearRowCards.forEach(row => { row.layoutHeight = compressHeight(row.baseHeight, row.minHeight) });
    const compressedGuideHeight = compressHeight(guideBaseHeight, guideMinHeight), compressedEvaluationHeight = compressHeight(evaluationBaseHeight, evaluationMinHeight), compressedSectionGap = compressHeight(baseSectionGap, minSectionGap);
    const compressedNaturalHeight = naturalHeight - compressionCapacity * compressionRatio;
    const surplus = Math.max(0, availableHeight - compressedNaturalHeight), methodCardExtra = methodCards.length ? surplus * .38 / methodCards.length : 0, reactRowExtra = reactantCards.length ? surplus * .14 / reactantCards.length : 0, gearRowExtra = gearRows ? surplus * .1 / gearRows : 0, guideExtra = surplus * .2, evaluationExtra = surplus * .12, sectionGap = compressedSectionGap + surplus * .06 / 4;
    let cursorY = contentTop;

    text('METHOD', x + 22, cursorY + headingHeight / 2, headingSize, C.muted, 800); cursorY += sectionHeadingBlock;
    methodCards.forEach((card, i) => {
      const cardHeight = card.layoutHeight + methodCardExtra, current = i === activeStep, complete = i < activeStep || state.complete && i === activeStep, fill = current ? '#e6f5f2' : complete ? '#f0f7f5' : '#ffffff', border = current ? C.teal : complete ? '#a9d4cc' : C.line;
      ctx.save(); if (current) { ctx.shadowColor = 'rgba(8,127,117,.16)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2 } rr(cardX, cursorY, cardW, cardHeight, 8, fill, border); ctx.restore();
      if (current) { ctx.fillStyle = C.teal; ctx.fillRect(cardX, cursorY + 7, 3, cardHeight - 14) }
      const centreY = cursorY + cardHeight / 2; ctx.fillStyle = i <= activeStep ? C.teal : '#d8e0e2'; ctx.beginPath(); ctx.arc(cardX + 20, centreY, compact ? 9 : 10, 0, Math.PI * 2); ctx.fill(); text(String(i + 1), cardX + 20, centreY, compact ? 8 : 8.5, '#fff', 800, 'center');
      drawTextLines(card.lines, cardX + 40, centreY, methodSize, C.ink, current ? 700 : 625, methodLineHeight);
      hit('method-step', cardX, cursorY, cardW, cardHeight, { index: i, source: 'sidebar' });
      cursorY += cardHeight + (i < methodCards.length - 1 ? methodCardGap : 0)
    });

    const safetyHeading = ['quadrats', 'shoretransect', 'antibiotics'].includes(p.id) ? 'BIOLOGICAL SAMPLES — CLICK FOR SAFETY' : ['ripple', 'hooke', 'specificheat', 'latentheat', 'ivdevices'].includes(p.id) ? 'MATERIALS — CLICK FOR SAFETY' : p.id === 'nuclear' ? 'SEALED SOURCES — CLICK FOR SAFETY' : 'REACTANTS — CLICK FOR SAFETY';
    cursorY += sectionGap; text(safetyHeading, x + 22, cursorY + headingHeight / 2, headingSize, C.muted, 800); cursorY += sectionHeadingBlock;
    const reactantRows = [];
    reactantCards.forEach((card, i) => {
      const rowHeight = card.layoutHeight + reactRowExtra, selectedSalt = p.id === 'flame' && state.flameTestSalt === i;
      rr(x + 20, cursorY, R - 40, rowHeight, 6, selectedSalt ? '#fff4ef' : '#fff', selectedSalt ? flameTestSalts[i].flameHex : C.line);
      ctx.fillStyle = p.id === 'flame' ? flameTestSalts[i].flameHex : p.color;
      ctx.beginPath();
      ctx.arc(x + 35, cursorY + rowHeight / 2, 5, 0, 7);
      ctx.fill();
      drawTextLines(card.lines, x + 49, cursorY + rowHeight / 2, reactSize, C.ink, 650, reactLineHeight);
      ctx.fillStyle = C.teal; ctx.beginPath(); ctx.arc(x + R - 31, cursorY + rowHeight / 2, 8, 0, Math.PI * 2); ctx.fill();
      text('i', x + R - 31, cursorY + rowHeight / 2, 9.5, '#fff', 850, 'center');
      reactantRows.push({ name: card.name, top_y: +cursorY.toFixed(2), bottom_y: +(cursorY + rowHeight).toFixed(2) });
      hit('guided-reactant-safety', x + 20, cursorY, R - 40, rowHeight, { name: card.name, practicalId: p.id }); cursorY += rowHeight + (i < reactantCards.length - 1 ? reactRowGap : 0)
    });

    cursorY += sectionGap; text('APPARATUS', x + 22, cursorY + headingHeight / 2, headingSize, C.muted, 800); cursorY += sectionHeadingBlock;
    let gearCursorY = cursorY;
    gearRowCards.forEach((row, rowIndex) => {
      const rowHeight = row.layoutHeight + gearRowExtra;
      row.cards.forEach((card, column) => {
        const gx = x + 20 + column * (gearW + gearGap);
        rr(gx, gearCursorY, gearW, rowHeight, 6, '#fff', C.line);
        drawTextLines(card.lines, gx + 9, gearCursorY + rowHeight / 2, gearSize, C.ink, 600, gearLineHeight);
      });
      gearCursorY += rowHeight + (rowIndex < gearRows - 1 ? gearRowGap : 0);
    });
    cursorY = gearCursorY;

    cursorY += sectionGap; text('GUIDANCE', x + 22, cursorY + headingHeight / 2, headingSize, C.muted, 800); cursorY += sectionHeadingBlock;
    const guideHeight = compressedGuideHeight + guideExtra; rr(x + 20, cursorY, R - 40, guideHeight, 7, '#e8efed'); drawTextLines(guideLines, x + 32, cursorY + guideHeight / 2, guideSize, C.ink, 600, guideLineHeight);
    if (p.id === 'hooke') {
      const iconX = x + R - 39, iconY = cursorY + guideHeight - 18;
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(iconX - 2, iconY - 2, 5, 0, Math.PI * 2); ctx.moveTo(iconX + 2, iconY + 2); ctx.lineTo(iconX + 7, iconY + 7); ctx.stroke();
      hit('open-hooke-focus-modal', x + 20, cursorY, R - 40, guideHeight);
      hookeGuidanceHitbox = { x: x + 20, y: cursorY, width: R - 40, height: guideHeight };
    }
    cursorY += guideHeight;
    cursorY += sectionGap; text('PRACTICAL EVALUATION', x + 22, cursorY + headingHeight / 2, headingSize, C.muted, 800); cursorY += sectionHeadingBlock;
    const evaluationHeight = compressedEvaluationHeight + evaluationExtra; drawPracticalEvaluationButton(x + 20, cursorY, R - 40, evaluationHeight);
    const finalBottom = cursorY + evaluationHeight;
    rightSidebarLayoutSnapshot = { content_top_y: +contentTop.toFixed(2), content_bottom_y: +finalBottom.toFixed(2), available_bottom_y: +contentBottom.toFixed(2), evaluation_button_top_y: +cursorY.toFixed(2), evaluation_button_bottom_y: +finalBottom.toFixed(2), unused_vertical_space_px: +Math.max(0, contentBottom - finalBottom).toFixed(2), overflow_vertical_space_px: +Math.max(0, finalBottom - contentBottom).toFixed(2), compression_ratio: +compressionRatio.toFixed(3), method_stage_count: methodCards.length, method_stage_line_counts: methodCards.map(card => card.lines.length), reactant_rows: reactantRows, heading_to_content_gap_px: headingToContentGap, method_font_size_px: methodSize, reactant_font_size_px: reactSize, guidance_font_size_px: guideSize, all_method_stage_text_visible: true, all_reactant_text_visible: true, all_apparatus_text_visible: true, all_sidebar_components_visible: finalBottom <= contentBottom + .5, compact };
  } else if (p.id === 'rates' && state.tab === 'birdseye') drawRatesBirdsEye(x + 18, graphContentY, R - 36);
  else if (p.id === 'rates') drawRatesBarChart(x + 18, graphContentY, R - 36, 320);
  else if (p.id === 'co2' && state.tab === 'birdseye') drawCo2BirdsEye(x + 18, graphContentY, R - 36);
  else if (p.id === 'flame') drawAbsorptionSpectraPanel(x + 18, graphContentY, R - 36);
  else if (p.id === 'mass') drawMassResultsTable(x + 18, graphContentY, R - 36);
  else if (p.id === 'electro') drawElectrolysisResultsTable(x + 18, graphContentY, R - 36);
  else if (p.id === 'titration') drawTitrationResultsTable(x + 18, graphContentY, R - 36);
  else if (p.id === 'displacement') drawDisplacementResultsTable(x + 18, graphContentY, R - 36);
  else if (p.id === 'alkali') drawAlkaliResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'chrom') drawChromatogramPanel(x + 18, graphContentY, R - 36, Math.min(520, H - graphContentY - 30));
  else if (p.id === 'salts') drawSaltMicroscopeResults(x + 18, graphContentY, R - 36, Math.min(520, H - graphContentY - 30));
  else if (p.id === 'starchleaf') drawStarchLeafResult(x + 18, graphContentY, R - 36);
  else if (p.id === 'lipase') drawLipaseTemperatureChart(x + 18, graphContentY, R - 36);
  else if (p.id === 'transformation') drawTransformationResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'respiration') drawRespirationResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'antibiotics') drawAntibioticResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'osmosis') drawOsmosisMassChart(x + 18, graphContentY, R - 36);
  else if (p.id === 'quadrats') drawQuadratSamplingResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'capture') drawCaptureSamplingResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'shoretransect') drawShoreTransectResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'ripple') drawRippleTankResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'convection') drawConvectionObservation(x + 18, graphContentY, R - 36);
  else if (p.id === 'conduction') drawConductionResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'thermal') drawThermalResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'hooke') drawHookeResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'specificheat') drawSpecificHeatResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'latentheat') drawLatentHeatResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'ivdevices') drawIvDeviceResults(x + 18, graphContentY, R - 36);
  else if (p.id === 'fieldlines') drawFieldPatternResults(x + 18, graphContentY, R - 36);
  else drawGraph(x + 18, graphContentY, R - 36, 280);
  if (state.tab === 'graph' && currentGraphModalKind(p.id)) drawGraphExpandButton(x, R);
}

function drawEvaluationModal() {
  const p = practicals[state.selected];
  const evalData = practicalEvaluations[p.id] || practicalEvaluations.free;
  ctx.fillStyle = 'rgba(9, 23, 32, 0.68)';
  ctx.fillRect(0, 0, W, H);
  hit('close-evaluation-modal', 0, 0, W, H);

  // Expanded modal dimensions occupying ~85% width and ~82% height of screen
  const w = Math.min(1160, Math.max(760, Math.round(W * 0.85)));
  const h = Math.min(840, Math.max(580, Math.round(H * 0.82)));
  const x = (W - w) / 2;
  const y = (H - h) / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  rr(x, y, w, h, 18, '#ffffff', '#cbd6d8');
  ctx.restore();

  const pColor = p.color || C.teal;
  const headerH = 76;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, headerH, [18, 18, 0, 0]);
  ctx.clip();
  ctx.fillStyle = pColor;
  ctx.fillRect(x, y, w, headerH);
  ctx.restore();

  // Header icon
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.arc(x + 42, y + headerH / 2, 21, 0, Math.PI * 2);
  ctx.fill();
  text(p.icon, x + 42, y + headerH / 2, 16, '#ffffff', 800, 'center');

  // Header Titles
  text('PRACTICAL EVALUATION & GCSE VARIABLES', x + 76, y + 27, 10.5, 'rgba(255, 255, 255, 0.85)', 800);
  text(p.title, x + 76, y + 52, 20, '#ffffff', 800);

  // Close '✕' button
  rr(x + w - 52, y + 20, 36, 36, 18, 'rgba(255, 255, 255, 0.25)', null);
  text('✕', x + w - 34, y + 38, 15, '#ffffff', 800, 'center');
  hit('close-evaluation-modal', x + w - 52, y + 20, 36, 36);

  const padX = 32;
  const contentW = w - padX * 2;
  const bottomBtnH = 44;
  const bottomMargin = 24;
  const btnY = y + h - bottomMargin - bottomBtnH;
  
  // Available body height between header and bottom button
  const bodyTop = y + headerH + 20;
  const bodyH = btnY - 18 - bodyTop;

  let curY = bodyTop;

  // SECTION 1: EXPERIMENTAL VARIABLES
  text('EXPERIMENTAL VARIABLES', x + padX, curY, 10.5, C.muted, 800);
  curY += 18;

  // Dynamic height for variable boxes: ~36% of available body height
  const varBoxH = Math.max(120, Math.min(220, Math.round(bodyH * 0.36)));
  const varGap = 16;
  const varBoxW = (contentW - varGap * 2) / 3;

  // IV Box
  const ivX = x + padX;
  rr(ivX, curY, varBoxW, varBoxH, 12, '#f0f7f6', C.teal);
  rr(ivX + 12, curY + 12, varBoxW - 24, 24, 6, C.teal);
  text('INDEPENDENT (IV)', ivX + varBoxW / 2, curY + 24, 9.5, '#ffffff', 800, 'center');
  wrappedText(evalData.iv, ivX + 14, curY + 48, varBoxW - 28, 11, C.ink, 650, 16, 8);

  // DV Box
  const dvX = ivX + varBoxW + varGap;
  rr(dvX, curY, varBoxW, varBoxH, 12, '#fff8f2', C.orange);
  rr(dvX + 12, curY + 12, varBoxW - 24, 24, 6, C.orange);
  text('DEPENDENT (DV)', dvX + varBoxW / 2, curY + 24, 9.5, '#ffffff', 800, 'center');
  wrappedText(evalData.dv, dvX + 14, curY + 48, varBoxW - 28, 11, C.ink, 650, 16, 8);

  // CVs Box
  const cvsX = dvX + varBoxW + varGap;
  rr(cvsX, curY, varBoxW, varBoxH, 12, '#f5f3f9', '#7c62b8');
  rr(cvsX + 12, curY + 12, varBoxW - 24, 24, 6, '#7c62b8');
  text('CONTROL (CVs)', cvsX + varBoxW / 2, curY + 24, 9.5, '#ffffff', 800, 'center');
  wrappedText(evalData.cvs, cvsX + 14, curY + 48, varBoxW - 28, 10.8, C.ink, 650, 15.5, 9);

  curY += varBoxH + 24;

  // SECTION 2: PROCEDURAL IMPROVEMENTS & GCSE EXAM ANSWERS
  text('PROCEDURAL IMPROVEMENTS & GCSE EXAM ANSWERS', x + padX, curY, 10.5, C.muted, 800);
  curY += 18;

  // Dynamically calculate improvement box height so they stretch to fill all remaining space up to the bottom button
  const count = (evalData.improvements && evalData.improvements.length) || 3;
  const impAreaH = btnY - 20 - curY;
  const impGap = 12;
  const impH = Math.max(54, Math.floor((impAreaH - (count - 1) * impGap) / count));

  evalData.improvements.forEach((impText) => {
    rr(x + padX, curY, contentW, impH, 10, '#f8faf9', C.line);
    
    // Checkmark circle badge
    const checkX = x + padX + 24;
    const checkY = curY + impH / 2;
    ctx.fillStyle = C.teal;
    ctx.beginPath();
    ctx.arc(checkX, checkY, 13, 0, Math.PI * 2);
    ctx.fill();
    text('✓', checkX, checkY, 11, '#ffffff', 800, 'center');

    // Wrapped improvement text centered vertically inside impH
    const lines = wrapTextLines(impText, contentW - 64, 11.5, 650);
    const lineHeight = 17;
    const totalTextH = lines.length * lineHeight;
    const textStartY = curY + Math.max(14, (impH - totalTextH) / 2 + lineHeight / 2);
    lines.slice(0, 4).forEach((line, i) => {
      text(line, x + padX + 48, textStartY + i * lineHeight, 11.5, C.ink, 650);
    });

    curY += impH + impGap;
  });

  // Bottom action buttons: CLOSE and START ASSESSMENT
  const btnW = 210, btnGap = 16;
  const totalBtnW = btnW * 2 + btnGap;
  const btnX = x + (w - totalBtnW) / 2;
  rr(btnX, btnY, btnW, bottomBtnH, 10, 'rgba(8, 127, 117, 0.15)', C.teal);
  text('CLOSE EVALUATION', btnX + btnW / 2, btnY + bottomBtnH / 2, 11, C.teal, 800, 'center');
  hit('close-evaluation-modal', btnX, btnY, btnW, bottomBtnH);

  const testBtnX = btnX + btnW + btnGap;
  rr(testBtnX, btnY, btnW, bottomBtnH, 10, C.teal, C.teal);
  text('START ASSESSMENT 📝', testBtnX + btnW / 2, btnY + bottomBtnH / 2, 11, '#ffffff', 800, 'center');
  hit('start-practical-assessment', testBtnX, btnY, btnW, bottomBtnH);
}
function drawReactantSafetyModal() {
  const safety = state.reactantSafety;
  if (!safety) return;
  ctx.fillStyle = 'rgba(8, 22, 31, .7)';
  ctx.fillRect(0, 0, W, H);
  hit('close-reactant-safety-modal', 0, 0, W, H);

  const w = Math.min(700, W - 32), h = Math.min(548, H - 24), x = (W - w) / 2, y = (H - h) / 2, compact = h < 530;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 9;
  rr(x, y, w, h, 16, '#f8faf9', '#bdcbcf');
  ctx.restore();
  hit('reactant-safety-modal-body', x, y, w, h);

  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, 68, [16, 16, 0, 0]); ctx.clip();
  const header = ctx.createLinearGradient(x, y, x + w, y); header.addColorStop(0, safety.color); header.addColorStop(1, '#102a3a');
  ctx.fillStyle = header; ctx.fillRect(x, y, w, 68); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(x + 38, y + 34, 19, 0, Math.PI * 2); ctx.fill();
  text('!', x + 38, y + 34, 18, '#fff', 900, 'center');
  text('REACTANT HEALTH & SAFETY', x + 68, y + 23, 10, 'rgba(255,255,255,.84)', 850);
  text(safety.name, x + 68, y + 46, compact ? 16 : 18, '#fff', 850);
  text(safety.practicalTitle.toUpperCase(), x + w - 70, y + 23, 8.3, 'rgba(255,255,255,.72)', 750, 'right');
  rr(x + w - 52, y + 18, 34, 34, 17, 'rgba(255,255,255,.22)');
  text('✕', x + w - 35, y + 35, 15, '#fff', 850, 'center');
  hit('close-reactant-safety-modal', x + w - 52, y + 18, 34, 34);

  const innerX = x + 24, innerW = w - 48, labelSize = compact ? 8.8 : 9.3, bodySize = compact ? 9.4 : 10.2, bodyLineHeight = compact ? 11.5 : 13;
  const summaryY = y + 82, summaryH = compact ? 80 : 88;
  rr(innerX, summaryY, innerW, summaryH, 10, '#fff', safety.color);
  rr(innerX + 14, summaryY + 13, Math.min(190, innerW - 28), 22, 11, safety.color);
  text(safety.rating, innerX + 27, summaryY + 24, 8.6, '#fff', 850);
  const summaryLines = wrapTextLines(safety.summary, innerW - 28, bodySize, 650);
  drawTextLines(summaryLines, innerX + 14, summaryY + 54 + Math.max(0, summaryLines.length - 2) * 2, bodySize, C.ink, 650, bodyLineHeight);

  const availableBoxes = h - (summaryY - y) - summaryH - 69, boxGap = compact ? 7 : 9, boxH = (availableBoxes - boxGap * 2) / 3;
  const detailBox = (label, body, top, icon, tint) => {
    rr(innerX, top, innerW, boxH, 9, tint, C.line);
    ctx.fillStyle = safety.color; ctx.beginPath(); ctx.arc(innerX + 19, top + 20, 10, 0, Math.PI * 2); ctx.fill();
    text(icon, innerX + 19, top + 20, 9, '#fff', 850, 'center');
    text(label, innerX + 38, top + 17, labelSize, C.muted, 850);
    const lines = wrapTextLines(body, innerW - 52, bodySize, 600);
    drawTextLines(lines, innerX + 38, top + boxH / 2 + 9, bodySize, C.ink, 600, bodyLineHeight);
  };
  let detailY = summaryY + summaryH + boxGap;
  detailBox('SAFE HANDLING', safety.handling, detailY, '✓', '#f1f7f5'); detailY += boxH + boxGap;
  detailBox('SPILL OR EXPOSURE', safety.response, detailY, '+', '#fff8f2'); detailY += boxH + boxGap;
  detailBox('DISPOSAL', safety.disposal, detailY, '↓', '#f4f5f8');

  const closeW = 150, closeH = 36, closeX = x + (w - closeW) / 2, closeY = y + h - 48;
  rr(closeX, closeY, closeW, closeH, 8, C.teal, C.teal);
  text('CLOSE SAFETY INFO', closeX + closeW / 2, closeY + closeH / 2, 10.5, '#fff', 800, 'center');
  hit('close-reactant-safety-modal', closeX, closeY, closeW, closeH);
}
function drawApparatus(id, cx, cy, w, benchY, arenaX) {
  state.layout = { target: { x: cx + 72, y: cy - 1 }, source: { x: cx - 155, y: cy - 1 } }; if (id === 'free') { drawWorkspace(arenaX, w, benchY) } else if (id === 'electro') { drawBeaker(cx - 73, cy - 78, 146, 108, { liquid: .55, color: 'rgba(41,159,180,.34)', deep: 'rgba(20,126,153,.68)' }); ctx.strokeStyle = '#2d373b'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx - 35, cy - 112); ctx.lineTo(cx - 35, cy + 13); ctx.moveTo(cx + 35, cy - 112); ctx.lineTo(cx + 35, cy + 13); ctx.stroke(); ctx.strokeStyle = '#d3e2e5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 33, cy - 108); ctx.lineTo(cx - 33, cy + 9); ctx.stroke(); rr(cx - 78, cy - 151, 156, 38, 8, '#253c46', '#172c35'); text(state.running ? '6.0 V   ● ON' : '0.0 V   ○ OFF', cx, cy - 132, 13, state.running ? '#68eeaa' : '#cbd5d8', 750, 'center'); if (state.running) { for (let i = 0; i < 14; i++) { ctx.strokeStyle = i % 2 ? 'rgba(205,245,250,.9)' : 'rgba(118,222,235,.75)'; ctx.beginPath(); ctx.arc(cx + (i % 2 ? 35 : -35) + (i % 3 - 1) * 4, cy + 7 - ((state.time * (18 + i) % 72)), 2 + i % 3, 0, 7); ctx.stroke() } } } else if (id === 'displacement') { ctx.strokeStyle = '#43545a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx - 188, cy + 35); ctx.lineTo(cx + 188, cy + 35); ctx.moveTo(cx - 188, cy - 45); ctx.lineTo(cx + 188, cy - 45); ctx.stroke(); ['Mg', 'Zn', 'Fe', 'Cu'].forEach((metal, i) => { const tx = cx - 150 + i * 100; drawTestTube(tx, cy - 8, .94); ctx.fillStyle = i === 3 ? '#b86c3d' : '#aab5b8'; ctx.fillRect(tx - 5, cy - 85 + (state.displacementStage ? 46 : 0), 10, 72); text(metal, tx, cy - 108, 10, C.ink, 800, 'center') }) } else if (id === 'chrom') { drawBeaker(cx - 82, cy - 100, 164, 130, { liquid: .12, color: 'rgba(180,220,230,.28)', deep: 'rgba(90,174,194,.4)' }); ctx.fillStyle = '#fffef3'; ctx.shadowColor = 'rgba(20,40,48,.18)'; ctx.shadowBlur = 4; ctx.fillRect(cx - 43, cy - 128, 86, 149); ctx.shadowBlur = 0; ctx.strokeStyle = '#89969a'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx - 43, cy - 55); ctx.lineTo(cx + 43, cy - 55); ctx.stroke(); ctx.setLineDash([]);['#e34b4b', '#3669d1', '#efc438'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx - 25 + i * 25, cy - 50 - (state.running ? state.progress * (38 + i * 15) : 0), 4, 8 + state.progress * 12, 0, 0, 7); ctx.fill() }) } else if (id === 'salts') { ctx.strokeStyle = '#69777b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 58, benchY - 4); ctx.lineTo(cx - 42, benchY - 123); ctx.moveTo(cx + 58, benchY - 4); ctx.lineTo(cx + 42, benchY - 123); ctx.stroke(); ctx.strokeStyle = '#39484d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 60, benchY - 122); ctx.lineTo(cx + 60, benchY - 122); ctx.stroke(); drawBunsen(cx, benchY - 3, state.burner); drawBeaker(cx - 62, benchY - 220, 124, 90, { liquid: .5, color: 'rgba(38,151,212,.38)', deep: 'rgba(24,108,185,.65)' }); if (state.burner) { for (let i = 0; i < 5; i++) { ctx.strokeStyle = `rgba(255,255,255,${.18 - i * .025})`; ctx.beginPath(); ctx.arc(cx, benchY - 222 - i * 10, 20 + i * 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke() } } } else if (id === 'water') { drawBunsen(cx - 78, benchY - 4, state.burner); drawFlask(cx - 78, cy - 22, .82, { color: '80,161,195', liquid: .52, bubbles: state.burner }); ctx.strokeStyle = '#78919a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 68, cy - 82); ctx.quadraticCurveTo(cx - 5, cy - 138, cx + 58, cy - 55); ctx.lineTo(cx + 90, cy - 5); ctx.stroke(); drawBeaker(cx + 68, cy - 30, 60, 61, { liquid: state.running ? .48 : .14, color: 'rgba(150,218,232,.3)', deep: 'rgba(82,178,204,.45)' }) } else if (id === 'mass') { drawBalance(cx - 170, cy + 4, .72, { mass: state.running ? 4.18 : 4.01 }); drawTripod(cx + 70, benchY - 4, .9); drawBunsen(cx + 70, benchY - 3, state.burner); ctx.fillStyle = '#d7c7a9'; ctx.beginPath(); ctx.ellipse(cx + 70, benchY - 112, 38, 14, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#756c5c'; ctx.stroke(); text(state.running ? 'MgO: 4.18 g' : 'Mg: 4.01 g', cx - 170, cy - 68, 11, C.ink, 700, 'center') } else if (id === 'hydrogen') { drawFlask(cx - 90, cy, .92, { color: '190,220,225', liquid: .47, bubbles: state.running, label: 'Mg + HCl' }); ctx.strokeStyle = '#718990'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 80, cy - 75); ctx.quadraticCurveTo(cx - 15, cy - 130, cx + 55, cy - 70); ctx.lineTo(cx + 86, cy - 44); ctx.stroke(); drawTestTube(cx + 102, cy - 10, .9); if (state.running) { ctx.fillStyle = '#f16a42'; ctx.beginPath(); ctx.arc(cx + 135, cy - 93, 12 + Math.sin(state.flamePhase) * 4, 0, 7); ctx.fill(); text('POP!', cx + 135, cy - 118, 13, C.red, 800, 'center') } } else if (id === 'co2') { drawFlask(cx - 100, cy, .9, { color: '215,213,185', liquid: .5, bubbles: state.running, label: 'CaCO₃ + HCl' }); ctx.strokeStyle = '#718990'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 90, cy - 75); ctx.quadraticCurveTo(cx - 25, cy - 135, cx + 56, cy - 67); ctx.lineTo(cx + 92, cy - 43); ctx.stroke(); drawTestTube(cx + 108, cy - 8, .98, { cloudy: state.running }); if (state.running) text('MILKY', cx + 108, cy + 65, 11, C.teal, 800, 'center') } else if (id === 'nuclear') {
    rr(cx + 40, cy - 80, 140, 90, 8, '#2a3b45', '#162329');
    rr(cx + 50, cy - 70, 120, 45, 4, '#a3c4a8', '#89a88e');
    text(Math.floor(state.nuclearCount).toString().padStart(4, '0'), cx + 110, cy - 47, 24, '#1b3320', 800, 'center');
    text('COUNTS', cx + 110, cy - 20, 10, '#86a89c', 700, 'center');
    ctx.fillStyle = '#657881'; ctx.beginPath(); ctx.roundRect(cx - 30, cy - 45, 70, 20, 4); ctx.fill();
    ctx.fillStyle = '#17313e'; ctx.beginPath(); ctx.roundRect(cx - 30, cy - 40, 20, 10, 2); ctx.fill();
    ctx.strokeStyle = '#102a3a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx + 40, cy - 35); ctx.quadraticCurveTo(cx + 40, cy - 10, cx + 50, cy - 10); ctx.stroke();
    rr(cx - 160, cy - 35, 30, 40, 4, '#4a5b63', '#2a3b45');
    if (state.nuclearSource > 0) {
      const colors = ['transparent', '#e45d4f', '#308bc1', '#a0522d'];
      ctx.fillStyle = colors[state.nuclearSource];
      ctx.beginPath(); ctx.arc(cx - 145, cy - 15, 8, 0, Math.PI * 2); ctx.fill();
    }
    if (state.nuclearAnimProgress < 1 || state.nuclearAnimAbsorber > 0 || state.nuclearAbsorber > 0) {
      const absColors = ['transparent', '#fcfaf2', '#d5dadd', '#4b575e'];
      const currentAbs = state.nuclearAbsorber, prevAbs = state.nuclearAnimAbsorber;
      const drawAbs = (type, yOff) => {
        if (type === 0) return;
        ctx.fillStyle = absColors[type];
        ctx.fillRect(cx - 85, cy - 50 + yOff, 10, 70);
        ctx.strokeStyle = '#102a3a'; ctx.lineWidth = 1; ctx.strokeRect(cx - 85, cy - 50 + yOff, 10, 70);
      };
      if (state.nuclearAnimProgress < 1) {
        const q = state.nuclearAnimProgress, smooth = q * q * (3 - 2 * q);
        if (prevAbs > 0) drawAbs(prevAbs, smooth * 120);
        if (currentAbs > 0) drawAbs(currentAbs, -120 + smooth * 120);
      } else {
        drawAbs(currentAbs, 0);
      }
    }
  } else { const sourcePos = state.drag?.kind === 'HCl(aq)' ? { x: state.drag.x, y: state.drag.y } : state.pour ? { x: state.layout.target.x - 116, y: state.layout.target.y - 78 } : { ...state.layout.source }; const near = state.drag?.kind === 'HCl(aq)' && Math.hypot(state.drag.x - state.layout.target.x, state.drag.y - state.layout.target.y) < 145; if (near) { ctx.strokeStyle = 'rgba(13,160,139,.68)'; ctx.lineWidth = 3; ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.arc(state.layout.target.x, state.layout.target.y, 74 + Math.sin(state.flamePhase * 3) * 3, 0, 7); ctx.stroke(); ctx.setLineDash([]); text('RELEASE TO POUR', state.layout.target.x, state.layout.target.y - 115, 10, C.teal, 800, 'center') } drawFlask(state.layout.target.x, state.layout.target.y, 1.08, { color: id === 'temp' ? '182,91,127' : '232,205,74', liquid: .38 + state.transferred * .22, bubbles: state.running, label: id === 'temp' ? 'NaOH(aq)' : 'Na₂S₂O₃(aq)' }); let ang = state.pour ? 1.14 : 0; drawFlask(sourcePos.x, sourcePos.y, .9, { color: '186,221,226', liquid: Math.max(.15, .68 - state.transferred * .48), angle: ang, label: state.pour ? '' : 'HCl(aq)' }); hit('reagent', sourcePos.x - 58, sourcePos.y - 88, 116, 150, 'HCl(aq)'); if (state.pour) { const sx = sourcePos.x + Math.sin(ang) * 68, sy = sourcePos.y - Math.cos(ang) * 68; const tx = state.layout.target.x - 4, ty = state.layout.target.y - 72; let sg = ctx.createLinearGradient(sx, sy, tx, ty); sg.addColorStop(0, 'rgba(220,248,255,.95)'); sg.addColorStop(1, 'rgba(112,211,231,.62)'); ctx.strokeStyle = sg; ctx.lineWidth = 5 + Math.sin(state.time * 16); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + tx) / 2 + 8, (sy + ty) / 2 - 3, tx, ty); ctx.stroke(); ctx.lineCap = 'butt' } if (id === 'temp') { drawThermometer(state.layout.target.x + 22, state.layout.target.y - 8) } }
  state.particles.forEach(pt => { ctx.globalAlpha = Math.max(0, pt.life); ctx.strokeStyle = pt.color || 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.stroke(); ctx.globalAlpha = 1 });
  if (state.complete) { rr(cx - 105, cy - 165, 210, 38, 8, '#e4f4ed', '#84c8aa'); text('✓  Practical result captured', cx, cy - 146, 13, '#277655', 700, 'center') }
}
function drawFreeLibrary(x, R) { ctx.fillStyle = '#f4f6f5'; ctx.fillRect(x, 64, R, H - 64); button('EQUIPMENT', x + 15, 80, 125, 32, state.tab === 'equipment'); button('SHELF', x + 148, 80, 112, 32, state.tab === 'reactants'); text(state.tab === 'equipment' ? 'Click to add  •  Drag to place' : 'Drag onto a flask, beaker or test tube', x + 18, 125, 9.5, C.muted, 550); if (state.tab === 'equipment') { equipment.forEach((it, i) => { let yy = 143 + i * 55; rr(x + 15, yy, R - 30, 48, 9, '#fff', C.line); ctx.fillStyle = ['#5d7fd0', '#2c9ab0', '#55a27a', '#e58b3e', '#8063ba', '#397e9d', '#d85e57', '#cf3341'][i]; ctx.beginPath(); ctx.arc(x + 40, yy + 24, 16, 0, 7); ctx.fill(); text(it.icon, x + 40, yy + 24, it.icon === 'pH' ? 8 : 14, '#fff', 800, 'center'); text(it.name, x + 64, yy + 18, 12, C.ink, 750); text(it.sub, x + 64, yy + 34, 9.5, C.muted, 500); text('+', x + R - 34, yy + 24, 18, C.teal, 700, 'center'); hit('palette', x + 15, yy, R - 30, 48, it.id) }) } else { reactantShelf.forEach((it, i) => { let yy = 143 + i * 55; rr(x + 15, yy, R - 30, 48, 9, '#fff', C.line); ctx.fillStyle = `#${it.color.toString(16).padStart(6, '0')}`; ctx.beginPath(); ctx.arc(x + 40, yy + 24, 16, 0, 7); ctx.fill(); text(it.icon, x + 40, yy + 24, it.icon.length > 2 ? 7 : 10, it.color === 0x25282b ? '#fff' : C.ink, 800, 'center'); text(it.name, x + 64, yy + 17, 11.5, C.ink, 750); text(`${it.formula}  •  ${it.unit}`, x + 64, yy + 34, 9.2, C.muted, 550); text('↗', x + R - 34, yy + 24, 15, C.teal, 700, 'center'); hit('free-reactant', x + 15, yy, R - 30, 48, it.id) }) } rr(x + 15, H - 73, R - 30, 48, 9, '#e8efed'); text('TIP', x + 30, H - 57, 9, C.teal, 800); text(state.tab === 'equipment' ? 'Placed equipment stays draggable.' : 'Drop onto glassware to choose a dose.', x + 30, H - 40, 9.5, C.muted, 600) }
function drawDosePanel() { const d = state.dose, r = reactantShelf.find(a => a.id === d.reactantId), item = state.workspace.find(a => a.uid === d.targetUid); if (!r || !item) return; const w = 390, h = 190, x = (W - w) / 2, y = (H - h) / 2; ctx.fillStyle = 'rgba(9,27,35,.28)'; ctx.fillRect(270, 205, W - 270 - Math.max(260, Math.min(330, W * .23)), H - 333); rr(x, y, w, h, 16, '#fff', '#a9bdc1'); text('CHOOSE DOSE', x + 24, y + 25, 10, C.teal, 800); text(`${r.name} → ${equipment.find(e => e.id === item.type)?.name}`, x + 24, y + 50, 15, C.ink, 750); text(`${d.amount.toFixed(r.step < 1 ? 1 : 0)} ${r.unit}`, x + w - 25, y + 50, 19, r.unit === 'g' ? C.orange : C.blue, 800, 'right'); const sx = x + 35, sy = y + 96, sw = w - 70; ctx.strokeStyle = '#d2dde0'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy); ctx.stroke(); const ratio = d.amount / r.max; ctx.strokeStyle = C.teal; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sw * ratio, sy); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.strokeStyle = C.teal; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx + sw * ratio, sy, 10, 0, 7); ctx.fill(); ctx.stroke(); ctx.lineCap = 'butt'; text(`${r.step} ${r.unit}`, sx, y + 121, 9, C.muted, 600); text(`${r.max} ${r.unit}`, sx + sw, y + 121, 9, C.muted, 600, 'right'); hit('dose-slider', sx - 10, sy - 16, sw + 20, 32, { x: sx, w: sw }); rr(x + 164, y + 142, 92, 32, 8, '#fff', C.line); text('CANCEL', x + 210, y + 158, 11, C.muted, 700, 'center'); hit('dose-cancel', x + 164, y + 142, 92, 32); rr(x + 266, y + 142, 99, 32, 8, C.teal, C.teal); text('ADD DOSE', x + 315, y + 158, 11, '#fff', 750, 'center'); hit('dose-add', x + 266, y + 142, 99, 32) }
function massStepIndex() { return state.massStage >= 6 ? 3 : state.massStage >= 3 ? 2 : state.massStage >= 1 ? 1 : 0 }
function hydrogenStepIndex() { return state.hydrogenStage >= 4 ? 3 : state.hydrogenStage >= 2 ? 2 : state.hydrogenStage >= 1 ? 1 : 0 }
function saltsStepIndex() { return state.saltsStage >= 4 ? 3 : state.saltsStage >= 2 ? 2 : state.saltsStage >= 1 ? 1 : 0 }
function titrationStepIndex() { return state.titrationStage >= 3 ? 3 : state.titrationStage >= 2 ? 2 : state.titrationStage >= 1 ? 1 : 0 }
function thermiteStepIndex() { if (state.complete) return 3; if (!state.running) return 0; return state.thermiteTimer < 1.1 ? 1 : state.thermiteTimer < 2.6 ? 2 : 3 }
function displacementStepIndex() { return state.displacementStage === 0 ? 1 : state.displacementStage === 1 ? 2 : 3 }
function flameTestStepIndex() { return state.flameTestStage === 0 ? 0 : state.flameTestStage <= 2 ? 1 : state.flameTestStage === 3 ? 2 : 3 }
function starchStepIndex() { const stage = state.starchStage || 0; return stage < 2 ? 0 : stage < 4 ? 1 : stage < 6 ? 2 : 3 }
function lipaseStepIndex() { if (state.lipaseConditioning || state.lipaseStage === 0) return 0; if (state.lipaseStage === 1) return 1; if (state.lipaseStage === 2) return 2; return 3 }
function transformationStepIndex() { const stage = state.transformationStage || 0; return stage < 2 ? 0 : stage < 4 ? 1 : stage < 8 ? 2 : stage < 10 ? 3 : 4 }
function respirationStepIndex() { const stage = state.respirationStage || 0; return stage < 2 ? 0 : stage < 6 ? 1 : stage < 8 ? 2 : 3 }
function antibioticStepIndex() { const stage = state.antibioticStage || 0; return stage < 2 ? 0 : stage < 4 ? 1 : stage < 6 ? 2 : stage < 9 ? 3 : 4 }
function osmosisStepIndex() { const stage = state.osmosisStage || 0; return stage < 1 ? 0 : stage < 3 ? 1 : stage < 6 ? 2 : 3 }
function potometerStepIndex() { const stage = state.potometerStage || 0; return stage < 1 ? 0 : stage < 4 ? 1 : stage < 6 ? 2 : 3 }
function quadratStepIndex() { const stage = state.quadratStage || 0; return stage < 2 ? 0 : stage < 5 ? 1 : stage < 7 ? 2 : stage < 9 ? 3 : 4 }
function captureStepIndex() { const stage = state.captureStage || 0; return stage < 2 ? 0 : stage < 4 ? 1 : stage < 6 ? 2 : 3 }
function transectStepIndex() { const stage = state.transectStage || 0; return stage < 1 ? 0 : stage < 4 ? 1 : stage < 7 ? 2 : 3 }
function rippleStepIndex() { const stage = state.rippleStage || 0; return stage < 2 ? 0 : stage < 4 ? 1 : stage < 7 ? 2 : 3 }
function electromagnetStepIndex() { const stage = state.electromagnetStage || 0; return stage < 1 ? 0 : stage < 3 ? 1 : stage < 5 ? 2 : 3 }
function convectionStepIndex() { const stage = state.convectionStage || 0; return stage < 1 ? 0 : stage < 3 ? 1 : stage === 3 ? 2 : 3 }
function conductionStepIndex() { return state.conductionStage === 0 ? 0 : state.complete ? 3 : state.conductionTimer < 2.1 ? 1 : state.conductionTimer < 7.2 ? 2 : 3 }
function thermalStepIndex() { const stage = state.thermalStage || 0; return stage < 1 ? 0 : stage < 3 ? 1 : stage < 4 ? 2 : 3 }
function liveMethodStepIndex(p = practicals[state.selected]) {
  const stepReaders = {
    rates: ratesStepIndex, mass: massStepIndex, hydrogen: hydrogenStepIndex, titration: titrationStepIndex, salts: saltsStepIndex,
    flame: flameTestStepIndex, displacement: displacementStepIndex, alkali: alkaliStepIndex, thermite: thermiteStepIndex,
    starchleaf: starchStepIndex, lipase: lipaseStepIndex, transformation: transformationStepIndex, respiration: respirationStepIndex,
    antibiotics: antibioticStepIndex, osmosis: osmosisStepIndex, agardiffusion: agarDiffusionStepIndex, potometer: potometerStepIndex,
    quadrats: quadratStepIndex, capture: captureStepIndex, shoretransect: transectStepIndex, ripple: rippleStepIndex,
    electromagnet: electromagnetStepIndex, convection: convectionStepIndex, conduction: conductionStepIndex, thermal: thermalStepIndex,
    density: densityStepIndex, hooke: hookeStepIndex, specificheat: shcStepIndex, latentheat: latentStepIndex,
    wirelength: wireStepIndex, ivdevices: ivStepIndex, fieldlines: fieldStepIndex, nuclear: nuclearStepIndex
  };
  const selected = state.methodStepSelection;
  if (selected?.practicalId === p.id) return Math.max(0, Math.min(p.steps.length - 1, selected.index));
  if (state.complete) return Math.max(0, p.steps.length - 1);
  return Math.max(0, Math.min(p.steps.length - 1, stepReaders[p.id]?.() ?? Math.floor((state.progress || 0) * Math.max(1, p.steps.length - 1))));
}

const methodStageSeekTargets = {
  rates: { stage: 'ratesStage', timer: 'ratesStageTimer', values: [0, 1, 3, 4] },
  titration: { stage: 'titrationStage', timer: 'titrationIndicatorTimer', values: [0, 1, 2, 3] },
  salts: { stage: 'saltsStage', timer: 'saltsTimer', values: [0, 1, 2, 4] },
  mass: { stage: 'massStage', values: [0, 1, 3, 6] },
  hydrogen: { stage: 'hydrogenStage', timer: 'hydrogenTimer', values: [0, 1, 2, 4] },
  flame: { stage: 'flameTestStage', timer: 'flameTestTimer', values: [0, 1, 3, 4] },
  displacement: { stage: 'displacementStage', timer: 'displacementTimer', values: [0, 0, 1, 2] },
  alkali: { stage: 'alkaliStage', timer: 'alkaliTimer', values: [0, 1, 2, 4] },
  starchleaf: { stage: 'starchStage', timer: 'starchTimer', values: [0, 2, 4, 6] },
  lipase: { stage: 'lipaseStage', timer: 'lipaseTimer', values: [0, 1, 2, 3] },
  transformation: { stage: 'transformationStage', timer: 'transformationTimer', values: [0, 2, 4, 8, 10] },
  respiration: { stage: 'respirationStage', timer: 'respirationTimer', values: [0, 2, 6, 8] },
  antibiotics: { stage: 'antibioticStage', timer: 'antibioticTimer', values: [0, 2, 4, 6, 9] },
  osmosis: { stage: 'osmosisStage', timer: 'osmosisTimer', values: [0, 1, 3, 6] },
  agardiffusion: { stage: 'agarDiffusionStage', timer: 'agarDiffusionTimer', values: [0, 2, 5, 8] },
  potometer: { stage: 'potometerStage', timer: 'potometerTimer', values: [0, 1, 4, 6] },
  quadrats: { stage: 'quadratStage', timer: 'quadratTimer', values: [0, 2, 5, 7, 9] },
  capture: { stage: 'captureStage', timer: 'captureTimer', values: [0, 2, 4, 6] },
  shoretransect: { stage: 'transectStage', timer: 'transectTimer', values: [0, 1, 4, 7] },
  ripple: { stage: 'rippleStage', timer: 'rippleTimer', values: [0, 2, 4, 6] },
  electromagnet: { stage: 'electromagnetStage', timer: 'electromagnetTimer', values: [0, 1, 3, 5] },
  convection: { stage: 'convectionStage', timer: 'convectionTimer', values: [0, 1, 3, 4] },
  thermal: { stage: 'thermalStage', timer: 'thermalTimer', values: [0, 1, 3, 4] },
  density: { stage: 'densityStage', timer: 'densityTimer', values: [0, 1, 3, 5] },
  hooke: { stage: 'hookeStage', timer: 'hookeTimer', values: [0, 1, 2, 3] },
  specificheat: { stage: 'shcStage', timer: 'shcTimer', values: [1, 2, 3, 4] },
  latentheat: { stage: 'latentStage', timer: 'latentTimer', values: [1, 3, 5, 6] },
  wirelength: { stage: 'wireStage', timer: 'wireTimer', values: [0, 1, 3, 4] },
  fieldlines: { stage: 'fieldStage', timer: 'fieldTimer', values: [0, 1, 3, 4] },
  nuclear: { stage: 'nuclearStage', timer: 'nuclearTimer', values: [0, 2, 5, 6] }
};

function resetForMethodSeek(id) {
  const resetters = {
    rates: resetRatesPractical, titration: resetTitrationPractical, salts: resetSaltsPractical, mass: resetMassPractical,
    hydrogen: resetHydrogenPractical, electro: resetElectroPractical, flame: resetFlameTestPractical, displacement: resetDisplacementPractical,
    alkali: resetAlkaliPractical, thermite: resetThermitePractical, starchleaf: resetStarchPractical, lipase: resetLipasePractical,
    transformation: resetTransformationPractical, respiration: resetRespirationPractical, antibiotics: resetAntibioticPractical,
    osmosis: resetOsmosisPractical, agardiffusion: resetAgarDiffusionPractical, potometer: resetPotometerPractical,
    quadrats: resetQuadratPractical, capture: resetCapturePractical, shoretransect: resetShoreTransectPractical,
    ripple: resetRipplePractical, electromagnet: resetElectromagnetPractical, convection: resetConvectionPractical,
    conduction: resetConductionPractical, thermal: resetThermalPractical, density: resetDensityPractical, hooke: resetHookePractical,
    specificheat: resetSpecificHeatPractical, latentheat: resetLatentHeatPractical, wirelength: resetWireLengthPractical,
    ivdevices: resetIvDevicePractical, fieldlines: resetFieldLinePractical, nuclear: resetNuclearPractical
  };
  if (resetters[id]) resetters[id]();
  else if (id === 'pondweed') activatePondweed('RESET PRACTICAL');
  else if (id === 'newton2') activateNewton2('RESET PRACTICAL');
  else {
    state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = [];
    state.temp = id === 'temp' ? 25 : 20; state.ph = id === 'temp' ? 13 : 7; state.volume = 0;
    state.burner = false; state.coolingWater = false; state.transferred = 0; state.pour = null; state.chromSelectedDye = null;
  }
}

function seekMethodStep(index) {
  const p = practicals[state.selected];
  if (!p?.steps?.length) return;
  const targetIndex = Math.max(0, Math.min(p.steps.length - 1, Number(index) || 0));
  resetForMethodSeek(p.id);
  state.methodStepSelection = { practicalId: p.id, index: targetIndex };
  state.tab = 'bench'; state.running = false; state.complete = false; state.drag = null; state.pour = null; state.dose = null;
  state.graphModal = false; state.evaluationModal = false; state.reactantSafety = null;
  state.progress = p.steps.length > 1 ? targetIndex / (p.steps.length - 1) : 0;
  state.time = state.progress * 10;

  const stageTarget = methodStageSeekTargets[p.id];
  if (stageTarget) {
    state[stageTarget.stage] = stageTarget.values[targetIndex] ?? stageTarget.values.at(-1);
    if (stageTarget.timer) state[stageTarget.timer] = 0;
    state.progress = 0;
    state.time = 0;
  }

  if (p.id === 'rates') { state.transferred = targetIndex >= 2 ? 1 : 0; state.ratesBathTemp = state.ratesTargetTemp; state.progress = targetIndex === 3 ? 1 : 0; }
  else if (p.id === 'temp') { state.transferred = targetIndex >= 2 ? 1 : 0; state.temp = 25 + 17 * Math.sin(state.progress * Math.PI / 2); state.ph = Math.max(1, 13 - 12 * state.progress); }
  else if (p.id === 'titration') { state.titrationIndicator = targetIndex >= 1; state.titrationVolume = targetIndex < 2 ? 0 : targetIndex === 2 ? 20 : 24.8; state.volume = state.titrationVolume; state.ph = titrationPh(); }
  else if (p.id === 'salts') { state.burner = targetIndex === 3; state.temp = targetIndex === 3 ? 78 : 25; }
  else if (p.id === 'mass') { state.massLidOn = targetIndex < 2; state.burner = targetIndex === 2; state.temp = targetIndex === 2 ? 75 : 25; }
  else if (p.id === 'hydrogen') { state.transferred = targetIndex >= 1 ? 1 : 0; state.hydrogenGas = targetIndex >= 2 ? 40 : 0; }
  else if (p.id === 'co2') { state.progress = [0, .16, .48, 1][targetIndex] ?? state.progress; }
  else if (p.id === 'electro') { state.progress = [0, .08, .52, 1][targetIndex] ?? state.progress; state.electroRecorded = targetIndex === 3; }
  else if (p.id === 'thermite') { state.thermiteTimer = [0, .55, 1.75, 3.2][targetIndex] ?? 0; state.time = state.thermiteTimer; state.temp = targetIndex < 2 ? 25 : targetIndex === 2 ? 230 : 1900; }
  else if (p.id === 'alkali') { state.alkaliReactionProgress = targetIndex === 2 ? .55 : targetIndex > 2 ? 1 : 0; state.ph = targetIndex >= 2 ? 13.2 : 7; }
  else if (p.id === 'chrom') { state.progress = [0, .08, .28, 1][targetIndex] ?? state.progress; }
  else if (p.id === 'water') { state.coolingWater = targetIndex >= 1; state.burner = targetIndex >= 2; state.progress = targetIndex === 3 ? .82 : 0; state.volume = targetIndex === 3 ? 39 : 0; state.temp = targetIndex >= 2 ? 92 : 25; }
  else if (p.id === 'pondweed') { state.pondweedDistance = targetIndex >= 1 ? 30 : 20; state.pondweedLampOn = targetIndex >= 2; state.pondweedBubbles = targetIndex === 3 ? 18 : 0; }
  else if (p.id === 'newton2') { state.newtonForce = .3; state.newtonAcc = .3; state.newtonPos = targetIndex < 2 ? 0 : targetIndex === 2 ? .35 : 1; state.newtonVel = targetIndex < 2 ? 0 : Math.sqrt(2 * state.newtonAcc * state.newtonPos); }
  else if (p.id === 'conduction') { state.conductionStage = targetIndex ? 1 : 0; state.conductionTimer = [0, .6, 4.2, conductionDuration][targetIndex] ?? 0; state.burner = targetIndex > 0; }
  else if (p.id === 'hooke') { state.hookeForceN = targetIndex === 0 ? 0 : targetIndex < 3 ? 1 : 6; state.hookeResults = targetIndex ? [{ mass_g: 0, force_n: 0, total_length_cm: 20, extension_cm: 0, extension_m: 0, settled: true }] : []; }
  else if (p.id === 'specificheat') { state.shcEnergyJ = targetIndex >= 3 ? 18000 : 0; state.shcTemperatureC = targetIndex >= 3 ? shcFinalTemperatureC() : 20; state.temp = state.shcTemperatureC; }
  else if (p.id === 'latentheat') { state.burner = targetIndex === 1; state.latentTemperatureC = targetIndex === 0 ? 20 : targetIndex === 1 ? currentLatentMaterial().meltingPointC : targetIndex === 2 ? currentLatentMaterial().highTemperatureC : 24; state.temp = state.latentTemperatureC; state.latentPhaseFraction = targetIndex === 1 ? .5 : targetIndex === 2 ? 1 : 0; }
  else if (p.id === 'wirelength') { state.wireLengthCm = targetIndex === 3 ? 100 : 20; }
  else if (p.id === 'ivdevices') { state.ivStage = [0, 1, 1, 5][targetIndex] ?? 0; state.ivTimer = targetIndex === 2 ? ivSweepIntervalS * 9 : 0; state.ivSupplyV = targetIndex === 2 ? -1 : 0; }
  else if (p.id === 'fieldlines' && targetIndex === 3) state.fieldTimer = fieldStageDurations[3];
  else if (p.id === 'nuclear') { state.nuclearSource = targetIndex ? 1 : 0; state.nuclearPreviousSource = state.nuclearSource; state.nuclearSourceTransition = 1; state.nuclearAbsorber = targetIndex >= 2 ? 1 : 0; state.nuclearAnimAbsorber = state.nuclearAbsorber; state.nuclearAnimProgress = 1; state.nuclearCount = targetIndex === 3 ? nuclearTargetCount10s() : 0; }

  state.toast = `Method step ${targetIndex + 1} selected: ${p.steps[targetIndex]}.`;
  lab3d.signature = '';
  draw();
}
function drawLeafObservation(cx, cy, scale, colour, vein, iodineQ = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.rotate(-.16);
  ctx.shadowColor = 'rgba(14,42,27,.2)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  ctx.fillStyle = colour; ctx.strokeStyle = vein; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(0, -54); ctx.bezierCurveTo(32, -43, 47, -16, 40, 10); ctx.bezierCurveTo(34, 34, 13, 50, 0, 58); ctx.bezierCurveTo(-13, 50, -34, 34, -40, 10); ctx.bezierCurveTo(-47, -16, -32, -43, 0, -54); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
  ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, -48); ctx.quadraticCurveTo(-2, 8, 0, 67); ctx.stroke();
  ctx.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const y = -34 + i * 14, span = 26 - Math.abs(y) * .18; ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(span * .55, y - 5, span, y - 11); ctx.moveTo(0, y + 2); ctx.quadraticCurveTo(-span * .55, y - 3, -span, y - 9); ctx.stroke() }
  if (iodineQ > 0) { ctx.globalAlpha = iodineQ * .82; ctx.fillStyle = '#1d2542'; for (let i = 0; i < 18; i++) { const a = i * 2.399, r = 5 + (i % 6) * 5.8, px = Math.cos(a) * r, py = Math.sin(a) * r * 1.25; ctx.beginPath(); ctx.ellipse(px, py, 8 + i % 4, 6 + i % 3, a, 0, Math.PI * 2); ctx.fill() } }
  ctx.restore();
}
function drawStarchLeafResult(x, y, w) {
  const revealed = state.starchStage >= 8, cardY = y + 40, cardH = 286;
  text('IODINE TEST RESULT', x, y, 10, C.muted, 800);
  wrappedText('Compare the leaf before treatment with the iodine-treated, decolourised sample.', x, y + 18, w, 9, C.ink, 600, 11, 2);
  rr(x, cardY, w, cardH, 9, '#fff', C.line);
  const half = w / 2;
  text('BEFORE', x + half * .5, cardY + 19, 8.4, C.muted, 800, 'center');
  text('AFTER IODINE', x + half * 1.5, cardY + 19, 8.4, C.muted, 800, 'center');
  ctx.strokeStyle = '#e1e7e6'; ctx.beginPath(); ctx.moveTo(x + half, cardY + 13); ctx.lineTo(x + half, cardY + cardH - 15); ctx.stroke();
  drawLeafObservation(x + half * .5, cardY + 124, .86, '#4d9850', '#286233', 0);
  drawLeafObservation(x + half * 1.5, cardY + 124, .86, revealed ? '#242c4c' : '#e8dfb5', revealed ? '#10162c' : '#9e8754', revealed ? 1 : 0);
  text('chlorophyll present', x + half * .5, cardY + 218, 8.6, '#3f8f4f', 700, 'center');
  text(revealed ? 'blue-black' : 'awaiting iodine', x + half * 1.5, cardY + 218, 8.6, revealed ? '#26344f' : C.muted, 700, 'center');
  rr(x + 14, cardY + 238, w - 28, 34, 7, revealed ? '#e9edf7' : '#eef3f2', revealed ? '#96a2c1' : C.line);
  text(revealed ? 'POSITIVE: STARCH IS PRESENT' : 'Complete all four stages to reveal the result', x + w / 2, cardY + 255, revealed ? 9.4 : 8.6, revealed ? '#26344f' : C.muted, 800, 'center');
  const noteY = cardY + cardH + 18; rr(x, noteY, w, 78, 8, revealed ? '#e7f4ec' : '#eef3f2', revealed ? '#9bc9a6' : C.line);
  text(revealed ? 'CONCLUSION' : 'WHY ETHANOL?', x + 14, noteY + 17, 8.2, revealed ? '#2f7a42' : C.muted, 800);
  wrappedText(revealed ? 'The blue-black colour shows that the leaf contained starch made from glucose during photosynthesis.' : 'Ethanol removes green chlorophyll so the iodine colour change can be seen clearly.', x + 14, noteY + 38, w - 28, 9.2, C.ink, 600, 12, 3);
}
function drawTransformationPlateMiniature(cx, cy, radius, result, revealed) {
  ctx.save();
  ctx.shadowColor = revealed && result.fluorescent ? 'rgba(52,255,126,.7)' : 'rgba(20,43,50,.16)'; ctx.shadowBlur = revealed && result.fluorescent ? 16 : 5;
  ctx.fillStyle = revealed && result.fluorescent ? '#102d35' : '#f3ddb0'; ctx.strokeStyle = '#8fa4a8'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx - 3, cy - 3, radius - 5, Math.PI * 1.05, Math.PI * 1.72); ctx.stroke();
  if (revealed && result.growth) {
    const count = result.colonies === 'lawn' ? 35 : 18;
    for (let i = 0; i < count; i++) { const angle = i * 2.399, rradius = 4 + (i % 6) * (radius - 10) / 6, px = cx + Math.cos(angle) * rradius, py = cy + Math.sin(angle) * rradius * .82; ctx.globalAlpha = result.colonies === 'lawn' ? .42 : .96; ctx.fillStyle = result.fluorescent ? (i % 3 ? '#59ee84' : '#baff78') : '#f7f0d1'; ctx.beginPath(); ctx.arc(px, py, result.colonies === 'lawn' ? 2.2 : 2.7 + i % 2, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.globalAlpha = 1; ctx.restore();
}
function drawTransformationResults(x, y, w) {
  const revealed = state.complete && state.transformationResults.length === 4;
  text('PLASMID TRANSFORMATION', x, y, 10, C.muted, 800);
  wrappedText('Growth tests antibiotic selection; green fluorescence tests arabinose-controlled GFP expression.', x, y + 18, w, 9, C.ink, 600, 11, 3);
  const top = y + 58;
  transformationPlateResults.forEach((result, index) => {
    const cardY = top + index * 82, outcome = !revealed ? 'AWAITING INCUBATION' : result.fluorescent ? 'GROWTH · GREEN GFP' : result.growth ? result.colonies === 'lawn' ? 'HEAVY GROWTH · NO GFP' : 'GROWTH · NO GFP' : 'NO GROWTH';
    rr(x, cardY, w, 74, 8, revealed && result.fluorescent ? '#e9f8ee' : '#fff', revealed && result.fluorescent ? '#75c990' : C.line);
    drawTransformationPlateMiniature(x + 39, cardY + 37, 27, result, revealed);
    text(`${result.treatment}  ·  ${result.medium}`, x + 77, cardY + 18, 8.5, result.fluorescent && revealed ? '#23854c' : C.ink, 800);
    text(outcome, x + 77, cardY + 38, 8, !revealed ? C.muted : result.fluorescent ? '#28a85b' : result.growth ? '#8b6d37' : '#a04f4b', 800);
    wrappedText(revealed ? result.explanation : 'Complete the transformation and incubation to reveal this control.', x + 77, cardY + 55, w - 86, 7.5, C.muted, 600, 9, 2);
  });
  const noteY = top + 4 * 82 + 4; rr(x, noteY, w, 90, 8, revealed ? '#eceaf8' : '#eef3f2', revealed ? '#aca6d5' : C.line);
  text(revealed ? 'CONCLUSION' : 'CONTROL LOGIC', x + 14, noteY + 18, 8.3, revealed ? '#5b55a5' : C.muted, 800);
  wrappedText(revealed ? 'Ampicillin selects cells carrying the plasmid. Arabinose activates the GFP switch, so only +DNA LB/amp/ara colonies fluoresce.' : '−DNA LB checks viability; −DNA LB/amp checks selection; the two +DNA plates separate plasmid uptake from GFP induction.', x + 14, noteY + 40, w - 28, 9, C.ink, 600, 11.5, 4);
}
function drawLipaseTemperatureChart(x, y, w) {
  text('TEMPERATURE SERIES', x, y, 10, C.muted, 800);
  wrappedText('Shorter time means faster lipase activity. High temperature slows the enzyme after denaturation.', x, graphSidebarDescriptionY(y), w, 9, C.ink, 600, 11, 3);
  const chartY = y + 78, chartH = 286, left = x + 42, right = x + w - 10, top = chartY + 15, bottom = chartY + 230, gw = right - left, gh = bottom - top;
  rr(x, chartY, w, chartH, 8, '#fff', C.line);
  for (let i = 0; i <= 4; i++) { const yy = bottom - i * gh / 4, value = i * 30; ctx.strokeStyle = '#dce4e5'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke(); text(String(value), left - 7, yy, 7.8, C.muted, 550, 'right') }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  const barW = Math.min(28, gw / 8), gap = gw / lipaseTemperatures.length;
  lipaseTemperatures.forEach((temp, i) => { const result = state.lipaseResults.find(r => r.temperature === temp), value = result?.time || 0, bx = left + gap * (i + .5) - barW / 2, bh = value / 120 * gh; ctx.fillStyle = result ? temp === 40 ? '#3f9d78' : '#d85c91' : '#edf1f1'; ctx.fillRect(bx, bottom - bh, barW, Math.max(2, bh)); text(`${temp}°`, bx + barW / 2, bottom + 13, 8.2, C.muted, 650, 'center'); text(result ? `${value}s` : '—', bx + barW / 2, Math.max(top + 8, bottom - bh - 9), 8, result ? C.ink : '#aebabc', 750, 'center') });
  ctx.save(); ctx.translate(x + 12, top + gh / 2); ctx.rotate(-Math.PI / 2); text('time for colourless / s', 0, 0, 8.5, C.muted, 650, 'center'); ctx.restore();
  text('temperature / °C', left + gw / 2, chartY + 264, 8.5, C.muted, 650, 'center');
  const best = state.lipaseResults.length ? state.lipaseResults.reduce((a, b) => a.time < b.time ? a : b) : null, noteY = chartY + chartH + 18;
  rr(x, noteY, w, 78, 8, best ? '#e8f5f0' : '#eef3f2', best ? '#9acdb8' : C.line);
  text(best ? 'CURRENT FASTEST RATE' : 'RESULTS PENDING', x + 14, noteY + 17, 8.2, best ? '#2f8067' : C.muted, 800);
  wrappedText(best ? `${best.temperature} °C gave the shortest time (${best.time} s). Lipase is fastest near its optimum and slows when its active site changes shape.` : 'Run all five temperature trials to identify the enzyme optimum and the effect of denaturation.', x + 14, noteY + 38, w - 28, 9.1, C.ink, 600, 12, 3);
}
function drawOsmosisMassChart(x, y, w) {
  text('POTATO MASS CHANGE', x, y, 10, C.muted, 800);
  wrappedText('Positive values show net water entry; negative values show net water loss.', x, graphSidebarDescriptionY(y), w, 9, C.ink, 600, 11, 2);
  const chartY = y + 70, chartH = 304, left = x + 43, right = x + w - 10, top = chartY + 18, bottom = chartY + 225, gw = right - left, gh = bottom - top, zeroY = bottom - .5 * gh;
  rr(x, chartY, w, chartH, 8, '#fff', C.line);
  for (let i = 0; i <= 4; i++) {
    const value = 20 - i * 10, yy = top + i * gh / 4;
    ctx.strokeStyle = value === 0 ? '#92a6aa' : '#dce4e5'; ctx.lineWidth = value === 0 ? 1.8 : 1;
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
    text(String(value), left - 7, yy, 7.8, value === 0 ? C.ink : C.muted, value === 0 ? 750 : 550, 'right');
  }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  osmosisConcentrations.forEach(concentration => text(concentration.toFixed(1), left + concentration / .8 * gw, bottom + 13, 8, C.muted, 650, 'center'));
  const results = [...state.osmosisResults].sort((a, b) => a.concentration - b.concentration);
  if (results.length) {
    ctx.strokeStyle = '#b67b42'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
    results.forEach((result, i) => { const px = left + result.concentration / .8 * gw, py = bottom - (result.percentChange + 20) / 40 * gh; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) });
    ctx.stroke(); ctx.lineJoin = 'miter';
    results.forEach(result => { const px = left + result.concentration / .8 * gw, py = bottom - (result.percentChange + 20) / 40 * gh; ctx.fillStyle = '#fff'; ctx.strokeStyle = result.percentChange >= 0 ? '#368d72' : '#b85e4d'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke() });
  }
  const isotonic = osmosisIsotonicConcentration();
  if (isotonic != null) {
    const isoX = left + isotonic / .8 * gw; ctx.strokeStyle = '#6b4e9b'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(isoX, zeroY); ctx.lineTo(isoX, bottom); ctx.stroke(); ctx.setLineDash([]);
    text(`${isotonic.toFixed(2)} M`, isoX, zeroY - 10, 8.2, '#6b4e9b', 800, 'center');
  }
  ctx.save(); ctx.translate(x + 12, top + gh / 2); ctx.rotate(-Math.PI / 2); text('change in mass / %', 0, 0, 8.5, C.muted, 650, 'center'); ctx.restore();
  text('sucrose concentration / mol dm⁻³', left + gw / 2, chartY + 264, 8.2, C.muted, 650, 'center');
  const noteY = chartY + chartH + 17; rr(x, noteY, w, 80, 8, isotonic != null ? '#f0ebf7' : '#eef3f2', isotonic != null ? '#b8a6d3' : C.line);
  text(isotonic != null ? 'ISOTONIC POINT ESTIMATE' : 'RESULTS PENDING', x + 14, noteY + 17, 8.2, isotonic != null ? '#6b4e9b' : C.muted, 800);
  wrappedText(isotonic != null ? `The graph crosses 0% at about ${isotonic.toFixed(2)} mol dm⁻³. Here there is no net water movement, so the solution has a similar water potential to the potato tissue.` : 'Complete the concentration series to find where the line crosses 0% change in mass.', x + 14, noteY + 38, w - 28, 9.1, C.ink, 600, 12, 3);
}
function drawChromatogramPanel(x, y, w, h) { const q = Math.max(0, Math.min(1, state.progress)), splitQ = Math.max(0, Math.min(1, (q - .03) / .2)), selected = state.chromSelectedDye, measurements = chromMeasurementData(); text('CHROMATOGRAM', x, y, 10, C.muted, 800); wrappedText('Click a coloured pigment to measure from the graphite baseline.', x, y + 18, w, 9.1, C.ink, 600, 12, 2); const cardY = y + 37, cardH = Math.min(254, h - 270); rr(x, cardY, w, cardH, 8, '#fff', C.line); const paperW = Math.min(116, w - 84), paperH = cardH - 30, px = x + (w - paperW) / 2, py = cardY + 15; ctx.save(); ctx.fillStyle = 'rgba(20,42,50,.12)'; ctx.filter = 'blur(5px)'; ctx.fillRect(px + 3, py + 4, paperW, paperH); ctx.filter = 'none'; ctx.fillStyle = '#fffdf3'; ctx.fillRect(px, py, paperW, paperH); ctx.strokeStyle = '#d5d5ca'; ctx.lineWidth = 1; ctx.strokeRect(px + .5, py + .5, paperW - 1, paperH - 1); ctx.strokeStyle = 'rgba(211,203,181,.28)'; ctx.lineWidth = 1; for (let i = 12; i < paperH; i += 18) { ctx.beginPath(); ctx.moveTo(px + 5, py + i); ctx.lineTo(px + paperW - 5, py + i + Math.sin(i) * .8); ctx.stroke() } const baselineY = py + paperH - 38, solventY = baselineY - (paperH - 62) * q, centreX = px + paperW / 2; ctx.strokeStyle = '#697174'; ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px + 10, baselineY); ctx.lineTo(px + paperW - 10, baselineY); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#7c8585'; ctx.lineWidth = 1.6; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(px + 9, solventY); ctx.lineTo(px + paperW - 9, solventY); ctx.stroke(); ctx.setLineDash([]); text('graphite baseline', centreX, baselineY + 13, 7.2, '#59666a', 600, 'center'); text(q > .02 ? 'solvent front' : 'solvent front will appear', centreX, solventY - 10, 7.2, '#59666a', 600, 'center'); const ease = 1 - Math.pow(1 - q, 1.35); ctx.save(); ctx.globalAlpha = 1 - splitQ; ctx.fillStyle = '#1d2225'; ctx.beginPath(); ctx.arc(centreX, baselineY, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); chromPigments.forEach((d, i) => { const mx = centreX, my = baselineY - (d.end + .63) / 1.4 * (paperH - 62) * q, visible = Math.max(0, Math.min(1, (q - .03) / .18)), radius = 3.4 + q * 1.5; ctx.save(); ctx.globalAlpha = visible * (selected === d.id ? .98 : .86); const grad = ctx.createRadialGradient(mx, my, 0, mx, my, radius * 2.2); grad.addColorStop(0, d.color); grad.addColorStop(.5, d.color); grad.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(mx, my, radius * 1.65, radius * 1.25, 0, 0, Math.PI * 2); ctx.fill(); if (selected === d.id && visible) { ctx.globalAlpha = .88; ctx.strokeStyle = d.color; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(mx, baselineY); ctx.lineTo(mx, my); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(mx - 3, baselineY + 1); ctx.lineTo(mx + 3, baselineY + 1); ctx.lineTo(mx, baselineY + 6); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(mx - 3, my - 1); ctx.lineTo(mx + 3, my - 1); ctx.lineTo(mx, my - 6); ctx.closePath(); ctx.fill(); text(`${measurements[i].distance_cm.toFixed(1)} cm`, mx, my - 13, 7.5, d.color, 800, 'center') } ctx.restore(); if (visible) hit('chrom-dye', mx - 12, my - 14, 24, 28, d.id) }); ctx.restore(); const tableY = cardY + cardH + 22; text('MEASURED DISTANCES', x, tableY, 10, C.muted, 800); text('Click a pigment row to show its ruler.', x, tableY + 16, 8.8, C.muted, 550); chromPigments.forEach((d, i) => { const ry = tableY + 29 + i * 31, measurement = measurements[i], active = selected === d.id; rr(x, ry, w, 26, 6, active ? '#edf8f3' : '#fff', active ? d.color : C.line); ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(x + 13, ry + 13, 5, 0, Math.PI * 2); ctx.fill(); text(d.label, x + 26, ry + 13, 9.6, C.ink, 700); text(q > .02 ? `${measurement.distance_cm.toFixed(1)} cm` : '—', x + w - 90, ry + 13, 9.6, q > .02 ? d.color : C.muted, 800, 'right'); text(q > .02 ? `Rf ${measurement.rf.toFixed(2)}` : 'run separation', x + w - 10, ry + 13, 8.5, C.muted, 650, 'right'); hit('chrom-dye', x, ry, w, 26, d.id) }); const hintY = tableY + 29 + chromPigments.length * 31 + 11; rr(x, hintY, w, 46, 7, '#e8efed'); wrappedText(q > .02 ? 'Ruler distance is measured from the graphite baseline to the pigment centre.' : 'Start the separation, then click a pigment to measure it.', x + 12, hintY + 15, w - 24, 8.8, C.ink, 600, 11, 2) }
function drawRatesBirdsEye(x, y, w) { const q = Math.max(0, Math.min(1, state.progress)), visibility = ratesCrossVisibility(), paper = Math.min(w - 18, 218), px = x + (w - paper) / 2, py = y + 42, centreX = px + paper / 2, centreY = py + paper / 2; text("BIRD'S-EYE VIEW", x, y, 10, C.muted, 800); wrappedText('Look vertically through the flask. Stop the timer when the cross can no longer be seen.', x, y + 18, w, 9, C.ink, 600, 11, 2); ctx.save(); ctx.shadowColor = 'rgba(18,45,55,.15)'; ctx.shadowBlur = 8; rr(px, py, paper, paper, 7, '#fffef7', '#d8d8cc'); ctx.restore(); ctx.save(); ctx.globalAlpha = visibility; ctx.strokeStyle = '#121a1e'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(centreX - 37, centreY - 37); ctx.lineTo(centreX + 37, centreY + 37); ctx.moveTo(centreX + 37, centreY - 37); ctx.lineTo(centreX - 37, centreY + 37); ctx.stroke(); ctx.restore(); const liquid = ctx.createRadialGradient(centreX - 16, centreY - 20, 8, centreX, centreY, 76); liquid.addColorStop(0, `rgba(255,247,178,${.12 + .38 * q})`); liquid.addColorStop(.62, `rgba(225,199,67,${.16 + .56 * q})`); liquid.addColorStop(1, `rgba(159,133,22,${.1 + .48 * q})`); ctx.fillStyle = liquid; ctx.beginPath(); ctx.arc(centreX, centreY, 76, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(164,213,224,.88)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(centreX, centreY, 82, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(centreX - 9, centreY - 9, 66, Math.PI * 1.03, Math.PI * 1.64); ctx.stroke(); for (let i = 0; i < 44; i++) { const a = i * 2.399, r = 8 + (i % 8) * 7.4; if (r > 70) continue; ctx.globalAlpha = q * (.17 + (i % 4) * .1); ctx.fillStyle = i % 3 === 0 ? '#fff8ce' : '#e0c84f'; ctx.beginPath(); ctx.arc(centreX + Math.cos(a) * r, centreY + Math.sin(a) * r, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill() } ctx.globalAlpha = 1; const statusY = py + paper + 20; rr(x, statusY, w, 66, 8, q >= .93 ? '#fff1d5' : '#eaf5f2'); text(`${state.ratesTargetTemp} °C  ·  ${state.time.toFixed(1)} s`, x + 12, statusY + 19, 12, C.ink, 800); text(q >= .93 ? 'CROSS DISAPPEARED' : q > .25 ? 'CROSS FADING' : 'CROSS VISIBLE', x + 12, statusY + 42, 11, q >= .93 ? C.orange : C.teal, 800); text(`${Math.round((1 - visibility) * 100)}% obscured`, x + w - 12, statusY + 42, 9, C.muted, 650, 'right') }
function drawCo2BirdsEye(x, y, w) {
  const q = Math.max(0, Math.min(1, state.progress)), view = Math.min(w - 14, 220), px = x + (w - view) / 2, py = y + 42, cx = px + view / 2, cy = py + view / 2, radius = view * .39, visibility = Math.pow(1 - q, 1.35), status = q >= .9 ? 'MILKY' : q >= .25 ? 'CLOUDING' : 'CLEAR';
  text("BIRD'S-EYE LIMEWATER", x, y, 10, C.muted, 800); wrappedText('Look down through the limewater as carbon dioxide bubbles from the submerged inlet.', x, y + 18, w, 9, C.ink, 600, 11, 2);
  ctx.save(); ctx.shadowColor = 'rgba(18,45,55,.16)'; ctx.shadowBlur = 9; rr(px, py, view, view, 8, '#edf3f1', '#d3dddc'); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#f8faf7'; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.globalAlpha = .18 + visibility * .82; ctx.fillStyle = '#172d37'; ctx.beginPath(); ctx.arc(cx, cy, radius * .32, 0, Math.PI * 2); ctx.fill(); text('VISIBLE', cx, cy, 8.5, '#fff', 800, 'center'); ctx.globalAlpha = 1;
  const liquid = ctx.createRadialGradient(cx - radius * .24, cy - radius * .3, 3, cx, cy, radius); liquid.addColorStop(0, `rgba(250,253,249,${.12 + q * .72})`); liquid.addColorStop(.6, `rgba(236,239,229,${.18 + q * .76})`); liquid.addColorStop(1, `rgba(204,221,215,${.28 + q * .62})`); ctx.fillStyle = liquid; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  for (let i = 0; i < 52; i++) { const a = i * 2.399, r = radius * (.08 + (i % 9) * .095); if (r > radius * .88) continue; ctx.globalAlpha = q * (.16 + (i % 4) * .09); ctx.fillStyle = i % 4 === 0 ? '#fff' : '#d7d9d1'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.2 + (i % 3) * .8, 0, Math.PI * 2); ctx.fill() }
  ctx.globalAlpha = 1; if (state.running) { for (let i = 0; i < 7; i++) { const cycle = (state.time * (.7 + i * .06) + i * .137) % 1, a = i * 2.399, r = radius * (.06 + cycle * .68); ctx.strokeStyle = `rgba(255,255,255,${.8 - cycle * .42})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5 + cycle * 4, 0, Math.PI * 2); ctx.stroke() } }
  ctx.restore(); ctx.strokeStyle = 'rgba(113,157,167,.9)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx - 7, cy - 8, radius - 8, Math.PI * 1.02, Math.PI * 1.62); ctx.stroke();
  const tubeX = cx + radius * .34, tubeY = cy - radius * .28; ctx.fillStyle = '#526b73'; ctx.beginPath(); ctx.arc(tubeX, tubeY, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#dff5f7'; ctx.beginPath(); ctx.arc(tubeX, tubeY, 3.6, 0, Math.PI * 2); ctx.fill();
  const statusY = py + view + 18; rr(x, statusY, w, 72, 8, q >= .9 ? '#f2f0e8' : '#eaf5f2'); text(`TURBIDITY  ${Math.round(q * 100)}%`, x + 12, statusY + 20, 11, C.ink, 800); text(status, x + w - 12, statusY + 20, 10.5, q >= .9 ? '#6d7069' : C.teal, 850, 'right'); text(`${Math.round(visibility * 100)}% target visibility`, x + 12, statusY + 44, 9.5, C.muted, 650); text(state.running ? 'CO₂ bubbling' : state.complete ? 'reaction complete' : 'ready', x + w - 12, statusY + 44, 9.5, C.muted, 650, 'right');
}
function drawQuadratSamplingResults(x, y, w) {
  text('RANDOM QUADRAT RESULTS', x, y, 10, C.muted, 800);
  wrappedText('A random-number generator selected every coordinate, preventing the observer from choosing daisy-rich patches.', x, y + 18, w, 9, C.ink, 600, 11, 3);
  const cardY = y + 54, rowH = 30, cardH = 42 + quadratSamples.length * rowH;
  rr(x, cardY, w, cardH, 8, '#fff', C.line);
  text('SAMPLE', x + 12, cardY + 20, 7.8, C.muted, 800);
  text('GRID POINT', x + w * .48, cardY + 20, 7.8, C.muted, 800, 'center');
  text('DAISIES', x + w - 12, cardY + 20, 7.8, C.muted, 800, 'right');
  quadratSamples.forEach((sample, i) => {
    const result = state.quadratResults[i], ry = cardY + 38 + i * rowH;
    if (i % 2 === 0) { ctx.fillStyle = '#f2f7f3'; ctx.fillRect(x + 1, ry - 12, w - 2, rowH) }
    text(String(i + 1), x + 14, ry + 2, 9.4, C.ink, 700);
    text(`(${sample.xM}, ${sample.yM})`, x + w * .48, ry + 2, 9.4, result ? '#3b8b52' : C.muted, 750, 'center');
    text(result ? String(result.daisies) : '—', x + w - 14, ry + 2, 10, result ? '#3b8b52' : C.muted, 800, 'right');
  });
  const summaryY = cardY + cardH + 14, mean = quadratMean(), estimate = quadratPopulationEstimate();
  rr(x, summaryY, w, 78, 8, state.complete ? '#e7f4ea' : '#eef3f2', state.complete ? '#75b884' : C.line);
  text('MEAN DENSITY', x + 14, summaryY + 18, 8, C.muted, 800);
  text(state.quadratResults.length ? `${mean.toFixed(1)} daisies m⁻²` : 'awaiting samples', x + 14, summaryY + 39, 13.2, '#3b8b52', 800);
  text('100 m² ESTIMATE', x + w - 14, summaryY + 18, 8, C.muted, 800, 'right');
  text(state.quadratResults.length ? `${estimate} daisies` : '—', x + w - 14, summaryY + 39, 13.2, '#28754a', 800, 'right');
  wrappedText(state.complete ? 'Five unbiased repeats give an estimated meadow population of 500 daisies.' : 'Complete all five random positions before judging the meadow population.', x + 14, summaryY + 60, w - 28, 8.5, C.ink, 600, 10, 2);
}
function drawCaptureSamplingResults(x, y, w) {
  text('MARK-RELEASE-RECAPTURE RESULTS', x, y, 10, C.muted, 800);
  wrappedText('Using the Lincoln Index to estimate the population from two trap samples.', x, y + 18, w, 9, C.ink, 600, 11, 3);
  const cardY = y + 44, rowH = 30;
  rr(x, cardY, w, 102, 8, '#fff', C.line);
  text('FIRST CATCH (MARKED)', x + 14, cardY + 20, 8, C.muted, 800);
  text(state.captureStage >= 4 ? String(state.captureFirstCatch) : '—', x + w - 14, cardY + 20, 10, state.captureStage >= 4 ? '#8b5a2b' : C.muted, 800, 'right');
  
  text('SECOND CATCH (TOTAL)', x + 14, cardY + 50, 8, C.muted, 800);
  text(state.captureStage >= 8 ? String(state.captureSecondCatch) : '—', x + w - 14, cardY + 50, 10, state.captureStage >= 8 ? '#8b5a2b' : C.muted, 800, 'right');

  text('MARKED RECAPTURED', x + 14, cardY + 80, 8, C.muted, 800);
  text(state.captureStage >= 8 ? String(state.captureRecaptured) : '—', x + w - 14, cardY + 80, 10, state.captureStage >= 8 ? '#8b5a2b' : C.muted, 800, 'right');

  const summaryY = cardY + 116;
  const estimate = Math.round((state.captureFirstCatch * state.captureSecondCatch) / state.captureRecaptured);
  rr(x, summaryY, w, 68, 8, state.complete ? '#f4e9de' : '#eef3f2', state.complete ? '#b38259' : C.line);
  text('LINCOLN INDEX ESTIMATE', x + 14, summaryY + 18, 8, C.muted, 800);
  text(state.complete ? `${estimate} beetles` : 'awaiting samples', x + 14, summaryY + 39, 13.2, '#8b5a2b', 800);
}
function drawShoreTransectResults(x, y, w) {
  text('ROCKY-SHORE ZONATION', x, y, 10, C.muted, 800);
  wrappedText('The belt crosses equal upper, middle and lower shore strata at fixed 2 m stations.', x, y + 18, w, 9, C.ink, 600, 11, 3);
  const chartY = y + 56, chartH = 214, left = x + 34, right = x + w - 10, top = chartY + 18, bottom = chartY + 164, gw = right - left, gh = bottom - top;
  rr(x, chartY, w, chartH, 8, '#fff', C.line);
  for (let i = 0; i <= 4; i++) { const yy = bottom - i * gh / 4; ctx.strokeStyle = '#dfe7e6'; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke(); text(String(i * 25), left - 6, yy, 7.2, C.muted, 550, 'right') }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  const series = [
    { key: 'barnacleCover', colour: '#be8a55', label: 'barnacles %' },
    { key: 'seaweedCover', colour: '#297f68', label: 'seaweed %' },
    { key: 'limpets', colour: '#6c7480', label: 'limpets ×5' }
  ];
  series.forEach((item, si) => { ctx.strokeStyle = item.colour; ctx.lineWidth = 2; ctx.beginPath(); state.transectResults.forEach((result, i) => { const px = left + result.distanceM / 10 * gw, value = item.key === 'limpets' ? result.limpets * 5 : result[item.key], py = bottom - value / 100 * gh; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) }); ctx.stroke(); state.transectResults.forEach(result => { const px = left + result.distanceM / 10 * gw, value = item.key === 'limpets' ? result.limpets * 5 : result[item.key], py = bottom - value / 100 * gh; ctx.fillStyle = item.colour; ctx.beginPath(); ctx.arc(px, py, 3.3, 0, Math.PI * 2); ctx.fill() }); const lx = x + 13 + si * (w - 26) / 3; ctx.fillStyle = item.colour; ctx.fillRect(lx, chartY + 184, 9, 3); text(item.label, lx + 13, chartY + 186, 7.1, C.ink, 650) });
  [0, 2, 4, 6, 8, 10].forEach(distance => text(String(distance), left + distance / 10 * gw, bottom + 12, 7.2, C.muted, 550, 'center'));
  text('distance down shore / m', (left + right) / 2, bottom + 27, 7.5, C.muted, 650, 'center');
  const tableY = chartY + chartH + 12;
  transectStations.forEach((station, i) => { const result = state.transectResults[i], ry = tableY + i * 27; rr(x, ry, w, 23, 5, i % 2 ? '#fff' : '#eef5f4', C.line); text(`${station.distanceM} m · ${station.zone}`, x + 9, ry + 12, 8, result ? C.ink : C.muted, 700); text(result ? `L ${result.limpets} · B ${result.barnacleCover}% · S ${result.seaweedCover}%` : '—', x + w - 9, ry + 12, 7.8, result ? '#297f86' : C.muted, 750, 'right') });
}
function drawRippleTankResults(x, y, w) {
  text('RIPPLE-TANK RESULTS', x, y, 10, C.muted, 800);
  wrappedText('Wave speed should remain approximately constant while the shallow-water depth is controlled.', x, y + 18, w, 9, C.ink, 600, 11, 3);
  const chartY = y + 52, chartH = 140, left = x + 39, right = x + w - 10, top = chartY + 15, bottom = chartY + 101, gw = right - left, gh = bottom - top, yMin = .19, yMax = .21;
  rr(x, chartY, w, chartH, 8, '#fff', C.line);
  for (let i = 0; i <= 4; i++) {
    const value = yMin + i * (yMax - yMin) / 4, yy = bottom - i * gh / 4;
    ctx.strokeStyle = value === .2 ? '#9bb4bb' : '#dce6e8'; ctx.lineWidth = value === .2 ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
    text(value.toFixed(3), left - 6, yy, 6.9, value === .2 ? C.ink : C.muted, value === .2 ? 700 : 550, 'right');
  }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  rippleTrials.forEach(trial => text(String(trial.frequencyHz), left + (trial.frequencyHz - 4) / 4 * gw, bottom + 11, 7, C.muted, 600, 'center'));
  if (state.rippleResults.length) {
    ctx.strokeStyle = '#1687ad'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.beginPath();
    state.rippleResults.forEach((result, i) => { const px = left + (result.frequencyHz - 4) / 4 * gw, py = bottom - (result.speedMs - yMin) / (yMax - yMin) * gh; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) });
    ctx.stroke(); ctx.lineJoin = 'miter';
    state.rippleResults.forEach(result => { const px = left + (result.frequencyHz - 4) / 4 * gw, py = bottom - (result.speedMs - yMin) / (yMax - yMin) * gh; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1687ad'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(px, py, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke() });
  }
  text('frequency / Hz', left + gw / 2, chartY + 127, 7.4, C.muted, 650, 'center');
  const tableY = chartY + chartH + 10, rowH = 26;
  text('RAW MEASUREMENTS', x, tableY, 9.2, C.muted, 800);
  rr(x, tableY + 15, w, 25, 5, '#e9f2f4', C.line);
  text('f / Hz', x + 10, tableY + 28, 7, C.muted, 800);
  text('10λ / cm', x + w * .39, tableY + 28, 7, C.muted, 800, 'center');
  text('λ / cm', x + w * .66, tableY + 28, 7, C.muted, 800, 'center');
  text('v / m s⁻¹', x + w - 8, tableY + 28, 7, C.muted, 800, 'right');
  rippleTrials.forEach((trial, i) => {
    const result = state.rippleResults[i], measurement = rippleTrialMeasurement(trial), ry = tableY + 42 + i * rowH;
    rr(x, ry, w, 22, 5, i % 2 ? '#fff' : '#f4f8f8', C.line);
    text(trial.frequencyHz.toFixed(1), x + 10, ry + 11, 8.2, result ? C.ink : C.muted, 700);
    text(result ? trial.tenWavelengthCm.toFixed(1) : '—', x + w * .39, ry + 11, 8.2, result ? '#1687ad' : C.muted, 750, 'center');
    text(result ? measurement.wavelengthCm.toFixed(2) : '—', x + w * .66, ry + 11, 8.2, result ? '#1687ad' : C.muted, 750, 'center');
    text(result ? measurement.speedMs.toFixed(3) : '—', x + w - 8, ry + 11, 8.2, result ? '#1687ad' : C.muted, 800, 'right');
  });
  const meanY = tableY + 42 + rippleTrials.length * rowH + 8, mean = rippleMeanSpeed();
  rr(x, meanY, w, 70, 8, state.complete ? '#e6f3f7' : '#eef3f2', state.complete ? '#7eb8ca' : C.line);
  text('MEAN WAVE SPEED', x + 13, meanY + 18, 8, C.muted, 800);
  text(state.rippleResults.length ? `${mean.toFixed(3)} m s⁻¹` : 'awaiting measurements', x + 13, meanY + 40, 13.2, '#1687ad', 800);
  wrappedText(state.complete ? 'At constant depth, changing frequency changes wavelength but not the measured wave speed.' : `${state.rippleResults.length} of ${rippleTrials.length} frequencies recorded.`, x + 13, meanY + 57, w - 26, 8.3, C.ink, 600, 10, 2);
}
function drawRatesBarChart(x, y, w, h) {
  const values = ratesTemperatures.map(temp => state.ratesResults.find(r => r.temperature === temp));
  const chartY = y + 56, top = chartY + 27, left = x + 56, right = x + w - 12, bottom = chartY + h - 73, gw = right - left, gh = bottom - top, max = 50;
  text('TEMPERATURE REPEATS', x, y, 10, C.muted, 800);
  text('Time until the cross disappears', x, graphSidebarDescriptionY(y), 9, C.ink, 600);
  rr(x, chartY, w, h, 7, '#fff', C.line);
  ctx.strokeStyle = '#d7e0e2';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const yy = bottom - i * gh / 5;
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
    text(String(i * 10), left - 7, yy, 8, C.muted, 550, 'right');
  }
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  const slot = gw / ratesTemperatures.length, barW = Math.min(28, slot * .54);
  ratesTemperatures.forEach((temp, i) => {
    const result = values[i], xx = left + slot * (i + .5), value = result?.time ?? ratesMeasuredTime(temp), barH = value / max * gh;
    ctx.fillStyle = result ? C.orange : '#e8edef';
    ctx.beginPath();
    ctx.roundRect(xx - barW / 2, bottom - barH, barW, barH, [5, 5, 0, 0]);
    ctx.fill();
    if (!result) {
      ctx.strokeStyle = '#cbd6d8';
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    text(result ? `${value.toFixed(1)} s` : 'not run', xx, bottom - barH - 10, 7.8, result ? C.orange : C.muted, 750, 'center');
    text(String(temp), xx, bottom + 13, 8.5, C.ink, 650, 'center');
  });
  ctx.save();
  ctx.translate(x + 13, top + gh / 2);
  ctx.rotate(-Math.PI / 2);
  text('time for cross to disappear / s', 0, 0, 8.6, C.muted, 650, 'center');
  ctx.restore();
  text('temperature / °C', left + gw / 2, bottom + 60, 9, C.muted, 650, 'center');
  text(`${state.ratesResults.length} of ${ratesTemperatures.length} temperature trials complete`, x, chartY + h + 19, 10, C.muted, 650);
}
function wavelengthX(nm, x, w) { return x + Math.max(0, Math.min(1, (nm - 380) / 390)) * w }
function drawAbsorptionSpectraPanel(x, y, w) {
  text('ABSORPTION SPECTRA', x, y, 10, C.muted, 800);
  wrappedText('Black bands mark characteristic wavelengths absorbed by each metal ion.', x, y + 18, w, 9.1, C.ink, 600, 12, 2);
  const gradientStops = [[0, '#6f00ff'], [.09, '#4935ff'], [.22, '#008dff'], [.36, '#00cdd1'], [.48, '#35d16b'], [.62, '#f1e51d'], [.73, '#ff9a18'], [.84, '#f04422'], [1, '#910018']];
  flameTestSalts.forEach((salt, i) => {
    const yy = y + 46 + i * 75, active = state.flameTestSalt === i, tested = state.flameTestTested.includes(i);
    rr(x, yy, w, 67, 8, active ? '#fff7f4' : '#fff', active ? salt.flameHex : C.line);
    ctx.fillStyle = salt.flameHex; ctx.beginPath(); ctx.arc(x + 14, yy + 15, 5, 0, Math.PI * 2); ctx.fill();
    text(`${salt.symbol}  ${salt.salt}`, x + 26, yy + 15, 9.4, C.ink, 750);
    text(tested ? `✓ ${salt.flame}` : salt.flame, x + w - 9, yy + 15, 8.3, tested ? salt.flameHex : C.muted, 750, 'right');
    const sx = x + 10, sy = yy + 29, sw = w - 20, sh = 22, gradient = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    gradientStops.forEach(([stop, colour]) => gradient.addColorStop(stop, colour)); ctx.fillStyle = gradient; ctx.fillRect(sx, sy, sw, sh);
    salt.bands.forEach(nm => { const bx = wavelengthX(nm, sx, sw); ctx.fillStyle = '#050708'; ctx.fillRect(bx - 1.5, sy, 3, sh) });
    ctx.strokeStyle = 'rgba(23,49,62,.38)'; ctx.strokeRect(sx + .5, sy + .5, sw - 1, sh - 1);
    text(salt.bands.map(n => Number(n).toFixed(1)).join('  '), x + 10, yy + 59, 7.4, C.muted, 650);
    hit('flame-spectrum', x, yy, w, 67, i)
  });
  const axisY = y + 431; text('380 nm', x + 10, axisY, 7.8, C.muted, 650); text('VISIBLE LIGHT', x + w / 2, axisY, 7.8, C.muted, 800, 'center'); text('770 nm', x + w - 10, axisY, 7.8, C.muted, 650, 'right');
  rr(x, y + 453, w, 62, 8, '#e8efed'); text('WHY DARK BANDS?', x + 12, y + 470, 8.5, C.teal, 800); wrappedText('The same electron energy gaps that produce flame colours can absorb matching wavelengths. These spectra are simplified.', x + 12, y + 490, w - 24, 8.8, C.ink, 600, 11, 3)
}
function drawDisplacementResultsTable(x, y, w) { text('DISPLACEMENT SERIES', x, y, 10, C.muted, 800); text('All four metals displace a less reactive metal.', x, y + 17, 9, C.ink, 600); rr(x, y + 34, w, 402, 8, '#fff', C.line); rr(x + 10, y + 46, w - 20, 32, 6, '#f3ece7'); text('TEST TUBE', x + 20, y + 62, 8.1, C.muted, 800); text('OBSERVATION', x + w - 18, y + 62, 8.1, C.muted, 800, 'right'); displacementTrials.forEach((trial, i) => { const ry = y + 86 + i * 65, ready = state.complete || state.displacementRecorded; rr(x + 10, ry, w - 20, 57, 6, i % 2 ? '#faf9f7' : '#fffaf6', C.line); text(`${trial.metalSymbol} + ${trial.solution.replace('(aq)', '')}`, x + 20, ry + 17, 9.4, C.ink, 800); text(ready ? `displaces ${trial.displaced}` : 'observing…', x + 20, ry + 38, 8.6, ready ? '#a65e34' : C.muted, 700); wrappedText(ready ? trial.observation : '—', x + 100, ry + 16, w - 128, 8.2, ready ? C.ink : C.muted, 600, 10, 3) }); rr(x + 10, y + 352, w - 20, 72, 7, state.complete ? '#e8f3ee' : '#f1f4f3'); text(state.complete ? 'REACTIVITY ORDER' : 'COMPLETE THE SERIES', x + 22, y + 370, 8.4, state.complete ? C.teal : C.muted, 800); text(state.complete ? 'Mg > Zn > Fe > Cu > Ag' : 'Lower the metal strips first.', x + 22, y + 394, 11.3, C.ink, 800); wrappedText(state.complete ? 'A more reactive metal forms ions and the less reactive metal is deposited.' : 'Observe each test tube for a coating and colour change.', x + 22, y + 412, w - 44, 8.7, C.muted, 600, 10, 2) }
function drawMassResultsTable(x, y, w) { text('RESULTS TABLE', x, y, 10, C.muted, 800); rr(x, y + 20, w, 286, 8, '#fff', C.line); rr(x + 10, y + 32, w - 20, 34, 6, '#edf3f2'); text('MEASUREMENT', x + 20, y + 49, 8.5, C.muted, 800); text('MASS / g', x + w - 18, y + 49, 8.5, C.muted, 800, 'right'); const rows = [['Crucible + magnesium', 'before heating', state.massBefore], ['Crucible + magnesium oxide', 'after heating', state.massAfter]]; rows.forEach((row, i) => { const ry = y + 72 + i * 76; rr(x + 10, ry, w - 20, 66, 6, i ? '#f8faf9' : '#f4f7f6', C.line); text(row[0], x + 20, ry + 21, 10, C.ink, 700); text(row[1], x + 20, ry + 40, 9.4, C.muted, 550); text(row[2] == null ? '—' : row[2].toFixed(2), x + w - 18, ry + 31, 16, row[2] == null ? C.muted : (i ? C.teal : C.blue), 800, 'right') }); const gain = state.massAfter == null ? null : state.massAfter - state.massBefore; rr(x + 10, y + 230, w - 20, 63, 7, gain == null ? '#f1f4f3' : '#e7f5ef'); text(gain == null ? 'AFTER HEATING' : 'MASS INCREASE', x + 22, y + 249, 8.5, gain == null ? C.muted : C.teal, 800); text(gain == null ? 'Reweigh to complete the table.' : `${gain.toFixed(2)} g of oxygen gained`, x + 22, y + 272, 11, gain == null ? C.muted : C.ink, 700) }
function drawElectrolysisResultsTable(x, y, w) { const masses = electroMassData(), rows = [{ name: 'Cathode', polarity: 'negative (−)', ...masses.cathode, color: '#b76b3a' }, { name: 'Anode', polarity: 'positive (+)', ...masses.anode, color: C.red }]; text('ELECTRODE MASS TABLE', x, y, 10, C.muted, 800); text('Masses after drying the electrodes', x, y + 17, 9.2, C.ink, 600); rr(x, y + 34, w, 300, 8, '#fff', C.line); rr(x + 10, y + 46, w - 20, 38, 6, '#edf3f2'); text('ELECTRODE', x + 18, y + 65, 8, C.muted, 800); text('BEFORE / g', x + w - 126, y + 65, 7.5, C.muted, 800, 'center'); text('AFTER / g', x + w - 68, y + 65, 7.5, C.muted, 800, 'center'); text('Δ / g', x + w - 17, y + 65, 7.5, C.muted, 800, 'right'); rows.forEach((row, i) => { const ry = y + 92 + i * 67; rr(x + 10, ry, w - 20, 57, 6, i ? '#f8faf9' : '#fff8f2', C.line); ctx.fillStyle = row.color; ctx.beginPath(); ctx.arc(x + 20, ry + 20, 4, 0, Math.PI * 2); ctx.fill(); text(row.name, x + 29, ry + 18, 9.6, C.ink, 750); text(row.polarity, x + 29, ry + 37, 8.4, C.muted, 600); text(row.before_g.toFixed(2), x + w - 126, ry + 28, 10.5, C.ink, 700, 'center'); text(row.after_g.toFixed(2), x + w - 68, ry + 28, 11, i ? C.ink : '#ad5b2f', 800, 'center'); text(`${row.change_g > 0 ? '+' : ''}${row.change_g.toFixed(2)}`, x + w - 17, ry + 28, 10.5, row.change_g > 0 ? '#ad5b2f' : C.muted, 800, 'right') }); rr(x + 10, y + 232, w - 20, 90, 7, '#eaf5f2'); text(state.complete ? 'COPPER DEPOSIT COMPLETE' : 'LIVE CATHODE COATING', x + 22, y + 250, 8.5, C.teal, 800); wrappedText(`${masses.cathode.change_g.toFixed(2)} g Cu deposited: Cu²⁺ + 2e⁻ → Cu`, x + 22, y + 270, w - 44, 10, C.ink, 700, 12, 2); wrappedText('The inert graphite anode remains at 12.35 g.', x + 22, y + 300, w - 44, 9.2, C.muted, 600, 12, 2); if (state.electroRecorded) text('✓ masses recorded', x + w - 18, y + 318, 8.5, C.teal, 750, 'right') }
function drawTitrationResultsTable(x, y, w) { text('TITRATION RESULTS', x, y, 10, C.muted, 800); text('Read the burette at eye level to 2 d.p.', x, y + 17, 9.2, C.ink, 600); rr(x, y + 34, w, 284, 8, '#fff', C.line); rr(x + 10, y + 46, w - 20, 38, 6, '#edf3f2'); text('READING', x + 20, y + 65, 8.3, C.muted, 800); text('BURETTE / cm³', x + w - 18, y + 65, 8.3, C.muted, 800, 'right'); const rows = [['Initial reading', 0], ['Final reading', state.complete ? state.titrationVolume : null], ['Titre', state.complete ? state.titrationVolume : null]]; rows.forEach((row, i) => { const ry = y + 92 + i * 52; rr(x + 10, ry, w - 20, 43, 6, i === 2 ? '#fff5fa' : '#f8faf9', C.line); text(row[0], x + 20, ry + 21.5, 10, C.ink, i === 2 ? 750 : 650); text(row[1] == null ? '—' : row[1].toFixed(2), x + w - 18, ry + 21.5, 13, row[1] == null ? C.muted : i === 2 ? '#b23678' : C.ink, 800, 'right') }); rr(x + 10, y + 254, w - 20, 53, 7, state.complete ? '#fcebf4' : '#f1f4f3'); text(state.complete ? 'ENDPOINT FOUND' : 'TITRATION INCOMPLETE', x + 22, y + 270, 8.5, state.complete ? '#b23678' : C.muted, 800); wrappedText(state.complete ? 'First permanent pale pink: NaOH is now in a tiny excess.' : 'Add NaOH dropwise as the endpoint approaches.', x + 22, y + 289, w - 44, 9.2, C.ink, 600, 11, 2); if (state.titrationRecorded) text('✓ titre recorded', x + w - 18, y + 313, 8.5, C.teal, 750, 'right') }
function drawSaltMicroscopeResults(x, y, w, h) {
  const timer = state.saltsTimer || 0;
  const crystalQ = state.saltsStage === 4 ? Math.max(0, Math.min(1, (timer - 2.8) / 2.2)) : 0;
  const settled = state.saltsStage === 4 && timer >= 2.8;
  text('MICROSCOPE VIEW', x, y, 10, C.muted, 800);
  wrappedText('A simulated view down the microscope of the blue copper sulfate crystals.', x, y + 18, w, 9.1, C.ink, 600, 12, 2);
  const cardY = y + 38, cardH = Math.min(382, h - 180);
  rr(x, cardY, w, cardH, 9, '#132d3b', '#2b5966');
  text('40×', x + 16, cardY + 19, 10, '#b9e8ef', 800);
  text(settled ? 'FOCUS LOCKED' : 'LIVE PREVIEW', x + w - 16, cardY + 19, 8, settled ? '#7de6c5' : '#94b9c4', 800, 'right');
  const cx = x + w / 2, cy = cardY + Math.min(167, cardH * .47), radius = Math.min(w * .38, cardH * .36);
  ctx.save();
  ctx.shadowColor = 'rgba(4,18,25,.65)'; ctx.shadowBlur = 14; ctx.fillStyle = '#071b27'; ctx.beginPath(); ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
  const lens = ctx.createRadialGradient(cx - radius * .28, cy - radius * .34, radius * .05, cx, cy, radius * 1.15);
  lens.addColorStop(0, '#dff8fa'); lens.addColorStop(.42, '#8acbd8'); lens.addColorStop(1, '#28748d'); ctx.fillStyle = lens; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  for (let i = 1; i < 8; i++) { ctx.strokeStyle = `rgba(229,255,255,${.05 + i * .008})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, radius * i / 8, 0, Math.PI * 2); ctx.stroke() }
  ctx.strokeStyle = 'rgba(234,255,255,.18)'; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(cx - radius * .8, cy); ctx.lineTo(cx + radius * .8, cy); ctx.moveTo(cx, cy - radius * .8); ctx.lineTo(cx, cy + radius * .8); ctx.stroke(); ctx.setLineDash([]);
  const crystals = [
    [-.52, -.30, .62, .14, '#196fa6'], [.04, -.53, .66, -.34, '#2c91c5'], [.51, -.28, .48, .35, '#176b9e'],
    [-.35, .18, .55, -.58, '#3aa8d3'], [.24, .12, .73, .18, '#1f80b5'], [.55, .49, .42, -.22, '#236e9b'],
    [-.57, .56, .45, .54, '#2c8eb9'], [-.03, .59, .52, -.12, '#135f94'], [.26, .68, .34, .48, '#46b7d8']
  ];
  crystals.forEach(([nx, ny, len, angle, color], i) => {
    const grow = .38 + crystalQ * .62, scale = radius / 78, px = cx + nx * radius * .86, py = cy + ny * radius * .86, length = len * radius * .55 * grow, width = radius * (.055 + (i % 3) * .012) * grow;
    ctx.save(); ctx.translate(px, py); ctx.rotate(angle); ctx.globalAlpha = .42 + crystalQ * .52;
    const cg = ctx.createLinearGradient(-width, -length, width, length); cg.addColorStop(0, '#d8fbff'); cg.addColorStop(.16, color); cg.addColorStop(.58, color); cg.addColorStop(1, '#0d4e82'); ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(-width * .45, -length); ctx.lineTo(width * .7, -length * .78); ctx.lineTo(width, length * .62); ctx.lineTo(0, length); ctx.lineTo(-width, length * .7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(238,255,255,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-width * .15, -length * .78); ctx.lineTo(0, length * .78); ctx.moveTo(width * .48, -length * .55); ctx.lineTo(-width * .55, length * .62); ctx.stroke(); ctx.restore();
  });
  ctx.restore();
  ctx.strokeStyle = 'rgba(210,249,252,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2); ctx.stroke();
  const infoY = cardY + cardH - 58;
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x + 14, infoY - 19, w - 28, 1);
  text('SAMPLE', x + 16, infoY, 7.5, '#9cc4cc', 800); text('CuSO₄·5H₂O', x + 16, infoY + 18, 10.2, '#efffff', 750);
  text('CRYSTAL HABIT', x + w - 16, infoY, 7.5, '#9cc4cc', 800, 'right'); text('angular blue prisms', x + w - 16, infoY + 18, 9.2, '#efffff', 650, 'right');
  const noteY = cardY + cardH + 22;
  rr(x, noteY, w, 82, 8, settled ? '#e6f6f2' : '#eef3f2', settled ? '#9acdbd' : C.line);
  text(settled ? 'OBSERVATION' : 'MICROSCOPE READY', x + 14, noteY + 17, 8.2, settled ? C.teal : C.muted, 800);
  wrappedText(settled ? 'Distinct blue crystalline faces are visible after evaporation and cooling.' : 'Complete the cooling and crystallisation step to reveal the full crystal habit.', x + 14, noteY + 38, w - 28, 9.2, C.ink, 600, 12, 3);
}

function drawConvectionObservation(x, y, w) {
  const active = state.convectionStage >= 3, complete = state.convectionStage >= 4;
  text('CONVECTION OBSERVATION', x, y, 10, C.muted, 800);
  wrappedText('The tracer reveals bulk movement of water around the closed glass loop.', x, y + 18, w, 9.1, C.ink, 600, 12, 2);
  const cardY = y + 48, cardH = 286;
  rr(x, cardY, w, cardH, 9, '#102c40', '#496b78');
  const left = x + 54, right = x + w - 54, top = cardY + 55, bottom = cardY + 212;
  ctx.strokeStyle = 'rgba(203,238,245,.75)'; ctx.lineWidth = 19; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(left, top); ctx.lineTo(right, top); ctx.lineTo(right, bottom); ctx.lineTo(left, bottom); ctx.stroke();
  ctx.strokeStyle = 'rgba(111,194,214,.55)'; ctx.lineWidth = 11; ctx.stroke();
  if (active) {
    const q = (state.convectionTimer * .22) % 1;
    for (let i = 0; i < 18; i++) {
      const u = (q + i / 18) % 1, perimeter = 2 * ((right - left) + (bottom - top));
      let distance = u * perimeter, px = left, py = bottom;
      if (distance < bottom - top) py = bottom - distance;
      else if ((distance -= bottom - top) < right - left) { px = left + distance; py = top }
      else if ((distance -= right - left) < bottom - top) { px = right; py = top + distance }
      else { distance -= bottom - top; px = right - distance; py = bottom }
      ctx.fillStyle = i < 8 ? '#ff9b3f' : `rgba(255,143,46,${.28 + (18 - i) * .025})`;
      ctx.beginPath(); ctx.arc(px, py, i < 4 ? 5 : 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffbd55'; ctx.beginPath(); ctx.moveTo(left - 10, top + 42); ctx.lineTo(left, top + 26); ctx.lineTo(left + 10, top + 42); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(right - 10, bottom - 42); ctx.lineTo(right, bottom - 26); ctx.lineTo(right + 10, bottom - 42); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#4d9dff'; ctx.beginPath(); ctx.arc(left, bottom + 34, 18, 0, Math.PI * 2); ctx.fill();
  text('HEAT HERE', left, bottom + 62, 8.2, '#c6e8ff', 800, 'center');
  text(active ? 'WARM WATER RISES' : 'TRACER NOT YET MOVING', x + w / 2, cardY + 28, 9, active ? '#ffb45b' : '#9ab7c2', 800, 'center');
  text(complete ? 'COMPLETE CURRENT OBSERVED' : active ? 'CLOCKWISE CURRENT' : 'ADD TRACER, THEN HEAT', x + w / 2, cardY + 260, 9.2, complete ? '#7ce5c4' : '#d5edf2', 800, 'center');
  rr(x, cardY + cardH + 16, w, 104, 8, '#fff4e8', '#e6c49f');
  text('SAFETY NOTE', x + 14, cardY + cardH + 34, 8.4, '#b65c2b', 800);
  wrappedText('Potassium dichromate is hazardous. This is a simulation of a teacher demonstration, not handling guidance.', x + 14, cardY + cardH + 55, w - 28, 9.2, C.ink, 650, 12, 4);
}
function drawConductionResults(x, y, w) {
  text('DRAWING-PIN FALL TIMES', x, y, 10, C.muted, 800);
  text('Shorter time means faster heat transfer.', x, y + 17, 9.1, C.ink, 600);
  const cardY = y + 38;
  rr(x, cardY, w, 354, 8, '#fff', C.line);
  const rows = [
    { id: 'copper', label: 'Copper', color: '#c9793a' },
    { id: 'aluminium', label: 'Aluminium', color: '#9caeb5' },
    { id: 'steel', label: 'Steel', color: '#566c77' }
  ];
  rr(x + 10, cardY + 12, w - 20, 34, 6, '#edf3f2');
  text('ROD', x + 20, cardY + 29, 8, C.muted, 800);
  text('PIN 1', x + w - 150, cardY + 29, 7.5, C.muted, 800, 'center');
  text('PIN 2', x + w - 105, cardY + 29, 7.5, C.muted, 800, 'center');
  text('PIN 3', x + w - 60, cardY + 29, 7.5, C.muted, 800, 'center');
  text('PIN 4', x + w - 17, cardY + 29, 7.5, C.muted, 800, 'right');
  rows.forEach((row, i) => {
    const ry = cardY + 55 + i * 70, times = conductionPinTimes[row.id];
    rr(x + 10, ry, w - 20, 60, 6, i % 2 ? '#f8faf9' : '#fffaf6', C.line);
    ctx.fillStyle = row.color; ctx.beginPath(); ctx.arc(x + 21, ry + 18, 5, 0, Math.PI * 2); ctx.fill();
    text(row.label, x + 32, ry + 18, 9.3, C.ink, 800);
    text(i === 0 ? 'best conductor' : i === 1 ? 'intermediate' : 'slowest here', x + 20, ry + 40, 8.1, C.muted, 600);
    times.forEach((timeValue, j) => {
      const visible = state.conductionTimer >= timeValue || state.complete;
      text(visible ? `${timeValue.toFixed(1)}` : '—', x + w - 150 + j * 45, ry + 30, 9.6, visible ? row.color : C.muted, 800, j === 3 ? 'right' : 'center');
    });
  });
  rr(x + 10, cardY + 274, w - 20, 67, 7, state.complete ? '#e7f5ef' : '#f1f4f3');
  text(state.complete ? 'CONCLUSION' : 'DEMO IN PROGRESS', x + 22, cardY + 292, 8.4, state.complete ? C.teal : C.muted, 800);
  wrappedText(state.complete ? 'Copper conducts thermal energy fastest, followed by aluminium, then steel.' : 'Watch for each wax blob to soften and release its drawing pin.', x + 22, cardY + 314, w - 44, 9.2, C.ink, 650, 11, 3);
}
function drawFieldPatternMiniature(x, y, w, type, complete) {
  const h = 70, cx = x + w * .43, cy = y + 35;
  rr(x, y, w, h, 7, complete ? '#fffdf8' : '#f1f4f3', complete ? '#d9c5ad' : C.line);
  ctx.save();
  ctx.strokeStyle = complete ? 'rgba(55,61,59,.62)' : 'rgba(116,128,128,.25)';
  ctx.lineWidth = 1.1;
  if (type === 'single') {
    for (const bend of [12, 19, 27]) {
      ctx.beginPath(); ctx.moveTo(cx - 28, cy); ctx.bezierCurveTo(cx - 44, cy - bend, cx + 44, cy - bend, cx + 28, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 28, cy); ctx.bezierCurveTo(cx - 44, cy + bend, cx + 44, cy + bend, cx + 28, cy); ctx.stroke();
    }
    ctx.fillStyle = '#d84f52'; ctx.fillRect(cx - 30, cy - 8, 30, 16); ctx.fillStyle = '#3777b8'; ctx.fillRect(cx, cy - 8, 30, 16);
    text('N', cx - 15, cy, 7, '#fff', 800, 'center'); text('S', cx + 15, cy, 7, '#fff', 800, 'center');
  } else {
    const attract = type === 'attraction';
    ctx.fillStyle = attract ? '#d84f52' : '#3777b8'; ctx.fillRect(cx - 58, cy - 8, 22, 16); ctx.fillStyle = attract ? '#3777b8' : '#d84f52'; ctx.fillRect(cx - 36, cy - 8, 22, 16);
    ctx.fillStyle = attract ? '#d84f52' : '#d84f52'; ctx.fillRect(cx + 14, cy - 8, 22, 16); ctx.fillStyle = '#3777b8'; ctx.fillRect(cx + 36, cy - 8, 22, 16);
    text(attract ? 'N' : 'S', cx - 47, cy, 7, '#fff', 800, 'center'); text(attract ? 'S' : 'N', cx - 25, cy, 7, '#fff', 800, 'center');
    text('N', cx + 25, cy, 7, '#fff', 800, 'center'); text('S', cx + 47, cy, 7, '#fff', 800, 'center');
    if (attract) {
      for (const off of [-7, -3, 3, 7]) { ctx.beginPath(); ctx.moveTo(cx - 14, cy + off); ctx.bezierCurveTo(cx - 3, cy + off * .35, cx + 3, cy + off * .35, cx + 14, cy + off); ctx.stroke() }
    } else {
      for (const side of [-1, 1]) for (const bend of [16, 25]) { ctx.beginPath(); ctx.moveTo(cx + side * 14, cy); ctx.bezierCurveTo(cx + side * 8, cy - bend, cx + side * 48, cy - bend, cx + side * 58, cy); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + side * 14, cy); ctx.bezierCurveTo(cx + side * 8, cy + bend, cx + side * 48, cy + bend, cx + side * 58, cy); ctx.stroke() }
    }
  }
  ctx.restore();
}
function drawFieldPatternResults(x, y, w) {
  text('IRON-FILINGS PATTERNS', x, y, 10, C.muted, 800);
  wrappedText('Filings show field shape and relative strength; a compass is needed for direction.', x, y + 18, w, 9, C.ink, 600, 11, 3);
  const top = y + 52;
  fieldConfigurations.forEach((configuration, index) => {
    const recorded = state.fieldResults.some(result => result.id === configuration.id), cardY = top + index * 126;
    drawFieldPatternMiniature(x, cardY, w, configuration.id, recorded);
    text(configuration.label, x + 10, cardY + 83, 8.4, recorded ? '#d45757' : C.muted, 800);
    wrappedText(recorded ? configuration.observation : 'Complete and record this configuration to reveal its observation.', x + 10, cardY + 101, w - 20, 8.8, C.ink, 600, 10.5, 2);
  });
  if (state.complete) {
    rr(x, top + 380, w, 55, 7, '#e7f5ef', '#9acdbd');
    text('CONCLUSION', x + 12, top + 396, 8.2, C.teal, 800);
    wrappedText('Closer filing chains mark stronger field regions. Unlike poles link; like poles repel.', x + 12, top + 416, w - 24, 8.9, C.ink, 650, 10.5, 2);
  }
}
function drawThermalResults(x, y, w) {
  const surfaces = thermalSurfaceReadings(), facing = thermalFacingSurface(), angle = thermalCubeAngle();
  text('FALSE-COLOUR THERMAL IMAGE', x, y, 10, C.muted, 800);
  text('Live camera view matches the apparatus on the bench.', x, y + 17, 9.1, C.ink, 600);
  const cardY = y + 38, imageH = 216;
  rr(x, cardY, w, imageH, 9, '#071a38', '#4b5a86');
  drawThermalBenchScene(ctx, {
    x: x + 8,
    y: cardY + 8,
    width: w - 42,
    height: imageH - 16,
    frame: {
      heat: thermalHeatFraction(),
      angle,
      surfaces,
      facing,
      stage: state.thermalStage,
      timer: state.thermalTimer
    }
  });
  rr(x + 13, cardY + 13, Math.min(w - 58, 148), 22, 5, 'rgba(4,8,25,.7)');
  text(`${facing.label} · ${facing.temperature.toFixed(0)} °C`, x + 22, cardY + 24, 7.7, '#f4f8ff', 760);
  const palette = ctx.createLinearGradient(0, cardY + imageH - 14, 0, cardY + 14);
  palette.addColorStop(0, '#07143c'); palette.addColorStop(.28, '#6f1d84'); palette.addColorStop(.5, '#ff3f27'); palette.addColorStop(.75, '#ffdd37'); palette.addColorStop(1, '#fffbd1');
  ctx.fillStyle = palette; ctx.fillRect(x + w - 27, cardY + 14, 11, imageH - 28);
  text('90°', x + w - 12, cardY + 17, 7.2, '#dce9ff', 700, 'right');
  text('20°', x + w - 12, cardY + imageH - 16, 7.2, '#dce9ff', 700, 'right');
  surfaces.forEach((surface, i) => {
    const ry = cardY + imageH + 18 + i * 40;
    rr(x, ry, w, 34, 6, '#fff', C.line);
    ctx.fillStyle = thermalColour(surface.temperature); ctx.beginPath(); ctx.arc(x + 14, ry + 17, 5, 0, Math.PI * 2); ctx.fill();
    text(surface.label, x + 26, ry + 17, 8.6, C.ink, 750);
    text(`${surface.temperature.toFixed(0)} °C`, x + w - 12, ry + 17, 10, surface.swatch, 800, 'right');
  });
  const noteY = cardY + imageH + 186;
  rr(x, noteY, w, 70, 7, state.thermalCaptured ? '#e9f5f1' : '#eef3f2');
  text(state.thermalCaptured ? 'IMAGE CAPTURED' : state.thermalStage >= 1 ? 'LIVE ORIENTATION TRACKING' : 'CAMERA READY', x + 14, noteY + 18, 8.4, state.thermalCaptured ? C.teal : C.muted, 800);
  wrappedText('The same flask, cube, filler neck and bench stay aligned while each finish rotates through the fixed view.', x + 14, noteY + 39, w - 28, 8.9, C.ink, 600, 11, 3);
}

function drawAlkaliResults(x, y, w) {
  text('ALKALI METALS', x, y, 10, C.muted, 800);
  text('Protected simulation comparison', x, y + 17, 9, C.ink, 600);
  rr(x, y + 34, w, 378, 8, '#fff', C.line);
  rr(x + 10, y + 46, w - 20, 34, 6, '#f4edf7');
  text('METAL', x + 20, y + 63, 8.1, C.muted, 800);
  text('OBSERVATION', x + w - 18, y + 63, 8.1, C.muted, 800, 'right');
  alkaliMetals.forEach((metal, index) => {
    const rowY = y + 88 + index * 73, recorded = state.alkaliResults.some(result => result.id === metal.id);
    rr(x + 10, rowY, w - 20, 65, 6, recorded ? '#faf8fb' : '#f7f8f8', C.line);
    ctx.fillStyle = metal.color; ctx.beginPath(); ctx.arc(x + 22, rowY + 20, 5, 0, Math.PI * 2); ctx.fill();
    text(metal.name, x + 33, rowY + 18, 10, C.ink, 800);
    const flameLines = wrapTextLines(recorded ? metal.flame.toUpperCase() : 'PENDING', 66, 6.8, 750);
    drawTextLines(flameLines, x + 33, rowY + 43, 6.8, recorded ? metal.color : C.muted, 750, 8.2);
    wrappedText(recorded ? metal.observation : 'Complete this protected trial to reveal the observation.', x + 116, rowY + 16, w - 142, 8.3, recorded ? C.ink : C.muted, 600, 10.2, 4);
  });
  const complete = state.alkaliResults.length === alkaliMetals.length;
  rr(x + 10, y + 318, w - 20, 82, 7, complete ? '#eee9f5' : '#f1f4f3');
  text(complete ? 'REACTIVITY ORDER' : 'SIMULATION SAFETY', x + 22, y + 337, 8.4, complete ? '#70447d' : C.muted, 800);
  text(complete ? 'Li < Na < K' : 'Teacher demo / simulation only', x + 22, y + 359, 12, complete ? '#70447d' : C.ink, 800);
  wrappedText(complete ? 'The reactions become faster and more exothermic down Group 1.' : 'Observe behind the screen. Do not reproduce this as a student practical.', x + 22, y + 378, w - 44, 8.7, C.muted, 600, 10, 2);
}
function drawGraph(x, y, w, h) {
  const s = currentGraphSpec(), cardY = y + 36, top = cardY + 30, left = x + 58, right = x + w - 14, bottom = cardY + h - 55, gw = right - left, gh = bottom - top;
  const fmt = (v, dp = 0) => Number(v).toFixed(dp);
  text('RESULTS GRAPH', x, y, 10, C.muted, 800);
  rr(x, cardY, w, h, 7, '#fff', C.line);
  ctx.strokeStyle = '#d3dde0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const yy = top + i * gh / 5;
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
    const value = s.yMax - (s.yMax - s.yMin) * i / 5;
    text(fmt(value, s.yDp), left - 7, yy, 8, C.muted, 550, 'right');
  }
  for (let i = 0; i <= 2; i++) {
    const xx = left + i * gw / 2, value = s.xMin + (s.xMax - s.xMin) * i / 2;
    text(fmt(value, s.xDp ?? idDp(s.xMax)), xx, bottom + 13, 8, C.muted, 550, 'center');
  }
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  ctx.save();
  ctx.translate(x + 13, top + gh / 2);
  ctx.rotate(-Math.PI / 2);
  text(s.yLabel, 0, 0, 9, C.muted, 650, 'center');
  ctx.restore();
  text(s.xLabel, left + gw / 2, bottom + 42, 9, C.muted, 650, 'center');
  if (state.points.length) {
    ctx.strokeStyle = C.teal;
    ctx.lineWidth = 3;
    ctx.beginPath();
    state.points.forEach((p, i) => {
      const px = left + p.x * gw, py = bottom - p.y * gh;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
    state.points.forEach(p => {
      ctx.fillStyle = C.orange;
      ctx.beginPath();
      ctx.arc(left + p.x * gw, bottom - p.y * gh, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  text(`${state.points.length} reading${state.points.length === 1 ? '' : 's'} recorded`, x, cardY + h + 18, 11, C.muted, 600);
}
function drawRespirationResults(x, y, w) {
  const compact = H < 700, graphH = compact ? 136 : 182;
  drawGraph(x, y, w, graphH);
  const tableY = y + (compact ? 208 : 256), rowH = compact ? 19 : 24;
  text('EQUAL 10-MINUTE INCUBATIONS', x, tableY, 8.8, C.muted, 800);
  rr(x, tableY + 13, w, 24, 5, '#f3eaf6', C.line);
  text('BATH / °C', x + 10, tableY + 25, 7.2, C.muted, 800);
  text('BALLOON', x + w * .54, tableY + 25, 7.2, C.muted, 800, 'center');
  text('CO₂ / cm³', x + w - 10, tableY + 25, 7.2, C.muted, 800, 'right');
  respirationTemperatures.forEach((temperature, index) => {
    const result = state.respirationResults.find(item => item.temperature === temperature), ry = tableY + 40 + index * rowH, optimum = temperature === 40;
    rr(x, ry, w, compact ? 17 : 21, 4, optimum ? '#f7edf9' : index % 2 ? '#fff' : '#faf7fb', optimum && result ? '#b786c7' : C.line);
    text(String(temperature), x + 10, ry + (compact ? 10 : 11), 8, result ? C.ink : C.muted, 750);
    text(result ? result.balloon : 'pending', x + w * .54, ry + (compact ? 10 : 11), 7.8, result ? '#87519a' : C.muted, 700, 'center');
    text(result ? result.volume.toFixed(1) : '—', x + w - 10, ry + (compact ? 10 : 11), 8.2, result ? '#87519a' : C.muted, 800, 'right');
  });
  const summaryY = tableY + 48 + respirationTemperatures.length * rowH;
  rr(x, summaryY, w, 62, 7, state.complete ? '#f4eaf7' : '#eef3f2', state.complete ? '#b98bc8' : C.line);
  text('CONCLUSION', x + 12, summaryY + 16, 7.6, C.muted, 800);
  text(state.complete ? 'FASTEST NEAR 40 °C' : 'complete the equal-time run', x + 12, summaryY + 35, 10.8, '#87519a', 800);
  wrappedText(state.complete ? 'Cold slows enzyme activity; 60 °C damages yeast enzymes, so little CO₂ forms.' : 'Balloon inflation is an indirect measure of carbon dioxide production.', x + 12, summaryY + 51, w - 24, 7.7, C.ink, 600, 9, 2);
}
function drawAntibioticResults(x, y, w) {
  const compact = H < 700, revealedCount = antibioticVisibleMeasurementCount(), grown = state.antibioticStage >= 8, accent = '#397f84';
  text('INHIBITION-ZONE RESULTS', x, y, 10, C.muted, 800);
  wrappedText('Measure the widest clear diameter through each disc centre.', x, y + 17, w, 8.6, C.ink, 600, 11, 2);
  const dishCardY = y + 43, dishCardH = compact ? 158 : 190, cx = x + w / 2, cy = dishCardY + dishCardH / 2 + 2, radius = compact ? 62 : 76;
  rr(x, dishCardY, w, dishCardH, 8, '#fbfcf9', C.line);
  ctx.save();
  ctx.shadowColor = 'rgba(17,49,48,.18)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#dbe4c5'; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#95aaa4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx - 3, cy - 4, radius - 8, 0, Math.PI * 2); ctx.stroke();
  if (grown) {
    ctx.fillStyle = 'rgba(104,126,74,.34)';
    for (let i = 0; i < 76; i++) { const a = i * 2.399, rradius = 14 + (i % 12) * (radius - 24) / 12, px = cx + Math.cos(a) * rradius, py = cy + Math.sin(a) * rradius; ctx.beginPath(); ctx.arc(px, py, 1 + (i % 3) * .45, 0, Math.PI * 2); ctx.fill() }
  }
  const positions = [[-.39, -.39], [.39, -.39], [.39, .39], [-.39, .39]];
  antibioticDiscs.forEach((disc, index) => {
    const px = cx + positions[index][0] * radius, py = cy + positions[index][1] * radius, measured = index < revealedCount || state.antibioticResults.some(result => result.id === disc.id), zoneR = Math.max(0, disc.diameterMm / 30 * radius * .42);
    if (grown && disc.diameterMm) { ctx.fillStyle = 'rgba(246,249,226,.92)'; ctx.beginPath(); ctx.arc(px, py, zoneR, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = measured ? disc.colour : 'rgba(76,106,94,.4)'; ctx.lineWidth = measured ? 2.2 : 1.1; ctx.setLineDash(measured ? [] : [3, 3]); ctx.stroke(); ctx.setLineDash([]) }
    ctx.fillStyle = '#fffdf1'; ctx.strokeStyle = disc.colour; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); text(disc.code, px, py + .3, 7.2, disc.colour, 850, 'center');
    if (measured) { ctx.strokeStyle = disc.colour; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px - Math.max(9, zoneR), py); ctx.lineTo(px + Math.max(9, zoneR), py); ctx.stroke(); text(`${disc.diameterMm} mm`, px, py - Math.max(14, zoneR + 8), 7, disc.colour, 800, 'center') }
  });
  const tableY = dishCardY + dishCardH + 16;
  rr(x, tableY, w, 25, 5, '#eaf2f0', C.line); text('DISC', x + 10, tableY + 13, 7.3, C.muted, 800); text('ZONE / mm', x + w - 10, tableY + 13, 7.3, C.muted, 800, 'right');
  antibioticDiscs.forEach((disc, index) => {
    const ry = tableY + 31 + index * (compact ? 26 : 31), measured = index < revealedCount || state.antibioticResults.some(result => result.id === disc.id), rowH = compact ? 22 : 27;
    rr(x, ry, w, rowH, 5, index % 2 ? '#fff' : '#f8faf8', measured ? `${disc.colour}66` : C.line);
    ctx.fillStyle = disc.colour; ctx.beginPath(); ctx.arc(x + 12, ry + rowH / 2, 4, 0, Math.PI * 2); ctx.fill();
    text(`${disc.code} · ${disc.name}`, x + 22, ry + rowH / 2, compact ? 7.7 : 8.4, measured ? C.ink : C.muted, 700);
    text(measured ? String(disc.diameterMm) : '—', x + w - 10, ry + rowH / 2, 8.7, measured ? disc.colour : C.muted, 850, 'right');
  });
  const summaryY = tableY + 40 + antibioticDiscs.length * (compact ? 26 : 31);
  rr(x, summaryY, w, compact ? 67 : 82, 7, state.complete ? '#e7f1ef' : '#eef3f2', state.complete ? '#82b9b4' : C.line);
  text('CONCLUSION', x + 12, summaryY + 16, 7.5, C.muted, 800);
  text(state.complete ? 'TETRACYCLINE · 30 mm' : 'complete all measurements', x + 12, summaryY + 35, compact ? 9.3 : 10.4, accent, 850);
  wrappedText(state.complete ? 'Largest zone under these conditions. Diffusion, agar depth and inoculum affect zone size; the water control has no clear zone.' : 'Keep the incubated plate closed and read diameters through the lid.', x + 12, summaryY + 51, w - 24, compact ? 7.1 : 7.8, C.ink, 600, compact ? 8.5 : 9.5, compact ? 2 : 3);
}
function drawHookeResults(x, y, w) {
  const compact = H < 700, graphH = compact ? 132 : 176;
  drawGraph(x, y, w, graphH);
  const tableY = y + (compact ? 203 : 250), rowH = compact ? 16 : 22;
  text('SETTLED READINGS', x, tableY, 8.9, C.muted, 800);
  rr(x, tableY + 13, w, 24, 5, '#eee8f1', C.line);
  text('F / N', x + 10, tableY + 25, 7.3, C.muted, 800);
  text('L / cm', x + w * .53, tableY + 25, 7.3, C.muted, 800, 'center');
  text('x / cm', x + w - 10, tableY + 25, 7.3, C.muted, 800, 'right');
  hookeForcesN.forEach((force, i) => {
    const result = state.hookeResults.find(item => item.force_n === force), ry = tableY + 40 + i * rowH;
    rr(x, ry, w, compact ? 14 : 19, 4, i % 2 ? '#fff' : '#f7f4f8', force === 6 && result ? '#d7a17e' : C.line);
    text(force.toFixed(1), x + 10, ry + 9.5, 8, result ? C.ink : C.muted, 700);
    text(result ? result.total_length_cm.toFixed(1) : '—', x + w * .53, ry + 9.5, 8, result ? '#7f426f' : C.muted, 750, 'center');
    text(result ? result.extension_cm.toFixed(1) : '—', x + w - 10, ry + 9.5, 8, result ? force === 6 ? '#ba6037' : '#7f426f' : C.muted, 800, 'right');
  });
  const summaryY = tableY + 48 + hookeForcesN.length * rowH;
  rr(x, summaryY, w, 61, 7, state.complete ? '#f4eaf2' : '#eef3f2', state.complete ? '#c590b7' : C.line);
  text('LINEAR GRADIENT', x + 12, summaryY + 16, 7.6, C.muted, 800);
  text(state.hookeResults.length >= 6 ? 'k = 50 N m⁻¹' : 'awaiting linear readings', x + 12, summaryY + 34, 11.4, '#8d477a', 800);
  wrappedText(state.complete ? 'The 6 N point bends away: proportionality ends near 5 N.' : 'Record only when the pointer has stopped moving.', x + 12, summaryY + 50, w - 24, 7.8, C.ink, 600, 9, 2);
}
function drawSpecificHeatResults(x, y, w) {
  const compact = H < 700, graphH = compact ? 132 : 176;
  drawGraph(x, y, w, graphH);
  const tableY = y + (compact ? 203 : 250), rowH = compact ? 17 : 23;
  text('ENERGY AND TEMPERATURE', x, tableY, 8.9, C.muted, 800);
  rr(x, tableY + 13, w, 24, 5, '#f5eee8', C.line);
  text('t / s', x + 9, tableY + 25, 7.1, C.muted, 800);
  text('E / kJ', x + w * .53, tableY + 25, 7.1, C.muted, 800, 'center');
  text('θ / °C', x + w - 9, tableY + 25, 7.1, C.muted, 800, 'right');
  shcEnergyReadingsJ.forEach((energy, i) => {
    const result = state.shcResults.find(item => item.energy_j === energy), ry = tableY + 40 + i * rowH;
    rr(x, ry, w, compact ? 15 : 20, 4, i % 2 ? '#fff' : '#fbf6f2', C.line);
    text(String(i * 150), x + 9, ry + 10, 8, result ? C.ink : C.muted, 700);
    text(result ? (result.energy_j / 1000).toFixed(1) : '—', x + w * .53, ry + 10, 8, result ? '#c26032' : C.muted, 750, 'center');
    text(result ? result.temperature_c.toFixed(1) : '—', x + w - 9, ry + 10, 8, result ? '#c26032' : C.muted, 800, 'right');
  });
  const summaryY = tableY + 48 + shcEnergyReadingsJ.length * rowH;
  rr(x, summaryY, w, 66, 7, state.complete ? '#faeee7' : '#eef3f2', state.complete ? '#df9c76' : C.line);
  text('SPECIFIC HEAT CAPACITY', x + 12, summaryY + 16, 7.6, C.muted, 800);
  text(state.complete ? `${shcCalculatedSpecificHeat()} J kg⁻¹ °C⁻¹` : 'calculate after heating', x + 12, summaryY + 36, 11.4, '#c05f31', 800);
  wrappedText(state.complete ? `18,000 J ÷ (1.00 kg × ${shcTemperatureRiseC().toFixed(1)} °C) · ${currentShcMaterial().label}` : 'The gradient of E against Δθ equals mc.', x + 12, summaryY + 53, w - 24, 7.8, C.ink, 600, 9, 2);
}
function drawLatentCurvePlot(x, y, w, h, expanded = false) {
  const material = currentLatentMaterial(), left = x + (expanded ? 86 : 52), right = x + w - (expanded ? 32 : 12), top = y + (expanded ? 42 : 34), bottom = y + h - (expanded ? 66 : 48), gw = right - left, gh = bottom - top;
  rr(x, y, w, h, expanded ? 10 : 7, '#ffffff', C.line);
  const temperatureY = value => bottom - (value - 20) / 70 * gh, timeX = value => left + value / latentSimulatedStageSeconds * gw;
  ctx.fillStyle = 'rgba(211,143,55,.1)';
  const bandTop = temperatureY(material.meltingPointC + 1.35), bandBottom = temperatureY(material.meltingPointC - 1.35);
  ctx.fillRect(left, bandTop, gw, bandBottom - bandTop);
  ctx.strokeStyle = '#d8e1e3'; ctx.lineWidth = 1;
  const yTicks = [20, 34, 48, 62, 76, 90];
  yTicks.forEach(value => { const yy = temperatureY(value); ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke(); text(String(value), left - (expanded ? 14 : 7), yy, expanded ? 11 : 7.5, C.muted, 600, 'right') });
  [0, 120, 240, 360, 480].forEach(value => text(String(value), timeX(value), bottom + (expanded ? 21 : 13), expanded ? 11 : 7.5, C.muted, 600, 'center'));
  ctx.strokeStyle = C.ink; ctx.lineWidth = expanded ? 2.6 : 2; ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  const series = [
    { id: 'heating', label: 'HEATING', colour: '#d87436', results: state.latentHeatingResults },
    { id: 'cooling', label: 'COOLING', colour: '#3c82ad', results: state.latentCoolingResults }
  ];
  series.forEach(entry => {
    if (!entry.results.length) return;
    ctx.strokeStyle = entry.colour; ctx.lineWidth = expanded ? 4 : 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    entry.results.forEach((point, index) => { const px = timeX(point.time_s), py = temperatureY(point.temperature_c); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py) }); ctx.stroke();
    entry.results.forEach(point => { const px = timeX(point.time_s), py = temperatureY(point.temperature_c); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = entry.colour; ctx.lineWidth = expanded ? 2.5 : 1.8; ctx.beginPath(); ctx.arc(px, py, expanded ? 5 : 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke() });
  });
  ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  if (expanded) {
    ctx.save(); ctx.translate(x + 22, top + gh / 2); ctx.rotate(-Math.PI / 2); text('sample temperature / °C', 0, 0, 12.5, C.muted, 700, 'center'); ctx.restore();
    text('time from start of stage / s', left + gw / 2, bottom + 51, 12.5, C.muted, 700, 'center');
    rr(right - 255, top + 10, 245, 36, 7, 'rgba(248,250,249,.94)', C.line);
    ctx.strokeStyle = '#d87436'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(right - 238, top + 28); ctx.lineTo(right - 205, top + 28); ctx.stroke(); text('HEATING', right - 196, top + 28, 10.5, C.ink, 750);
    ctx.strokeStyle = '#3c82ad'; ctx.beginPath(); ctx.moveTo(right - 112, top + 28); ctx.lineTo(right - 79, top + 28); ctx.stroke(); text('COOLING', right - 70, top + 28, 10.5, C.ink, 750);
    text(`${material.meltingPointC} °C phase-change band`, left + 12, bandTop - 11, 10.5, '#a8652e', 750);
  } else {
    text('temperature / °C', x + 7, top - 18, 7.5, C.muted, 700);
    text('time / s', right, bottom + 34, 7.5, C.muted, 700, 'right');
    ctx.strokeStyle = '#d87436'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(left + 5, top + 12); ctx.lineTo(left + 25, top + 12); ctx.stroke(); text('HEAT', left + 30, top + 12, 7.2, C.ink, 750);
    ctx.strokeStyle = '#3c82ad'; ctx.beginPath(); ctx.moveTo(left + 72, top + 12); ctx.lineTo(left + 92, top + 12); ctx.stroke(); text('COOL', left + 97, top + 12, 7.2, C.ink, 750);
  }
}
function drawLatentHeatResults(x, y, w) {
  const compact = H < 700, descriptionY = graphSidebarDescriptionY(y), chartY = descriptionY + (compact ? 26 : 32), chartH = compact ? 205 : 245, material = currentLatentMaterial();
  text('HEATING + COOLING CURVES', x, y, 9.4, C.muted, 800);
  wrappedText(`${material.label} · separate time axes for heating and cooling`, x, descriptionY, w, 8.4, C.ink, 600, 10, 2);
  drawLatentCurvePlot(x, chartY, w, chartH, false);
  const summaryY = chartY + chartH + 12;
  rr(x, summaryY, w, compact ? 74 : 88, 7, state.complete ? '#faefe8' : '#eef3f2', state.complete ? '#dda17e' : C.line);
  text('CHANGE OF STATE', x + 12, summaryY + 17, 7.8, C.muted, 800);
  text(state.complete ? `${material.meltingPointC} °C plateau` : 'complete both stages', x + 12, summaryY + 37, 11.5, '#b85f39', 800);
  wrappedText(state.complete ? 'Temperature stays nearly constant while latent heat changes the arrangement of particles, not their mean kinetic energy.' : `${state.latentHeatingResults.length} heating and ${state.latentCoolingResults.length} cooling readings logged.`, x + 12, summaryY + 55, w - 24, compact ? 7.5 : 8.2, C.ink, 600, compact ? 8.8 : 10, 3);
}
function drawExpandedLatentHeatGraph(x, y, w, h) {
  const material = currentLatentMaterial(), cardY = y + 48, cardH = h - 48;
  text('HEATING AND COOLING CURVES', x, y + 6, 13, C.muted, 850);
  text(`${material.label} · ${state.latentHeatingResults.length + state.latentCoolingResults.length} readings`, x + w, y + 6, 12, '#c66a43', 750, 'right');
  text(`Plateaux centre on ${material.meltingPointC} °C while latent heat is absorbed during melting and released during freezing.`, x, y + 28, 11, C.ink, 600);
  drawLatentCurvePlot(x, cardY, w, cardH, true);
}
function drawIvCurvePlot(x, y, w, h, expanded = false) {
  const left = x + (expanded ? 92 : 47), right = x + w - (expanded ? 32 : 12), top = y + (expanded ? 56 : 43), bottom = y + h - (expanded ? 70 : 42), gw = right - left, gh = bottom - top;
  const px = voltage => left + (voltage + 6) / 12 * gw, py = current => bottom - (current + .22) / .44 * gh;
  rr(x, y, w, h, expanded ? 10 : 7, '#ffffff', C.line);
  ctx.strokeStyle = '#dce4e5'; ctx.lineWidth = 1;
  [-6, -3, 0, 3, 6].forEach(value => { const xx = px(value); ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx, bottom); ctx.stroke(); text(String(value), xx, bottom + (expanded ? 22 : 13), expanded ? 11 : 7.4, C.muted, 650, 'center') });
  [-.2, -.1, 0, .1, .2].forEach(value => { const yy = py(value); ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke(); text(value.toFixed(1), left - (expanded ? 14 : 7), yy, expanded ? 11 : 7.2, C.muted, 650, 'right') });
  ctx.strokeStyle = C.ink; ctx.lineWidth = expanded ? 2.5 : 1.8; ctx.beginPath(); ctx.moveTo(left, py(0)); ctx.lineTo(right, py(0)); ctx.moveTo(px(0), top); ctx.lineTo(px(0), bottom); ctx.stroke();
  const series = ivDeviceDefinitions.map((definition, index) => ({ definition, readings: state.ivResults.find(result => result.device === definition.id)?.readings || (state.ivDeviceIndex === index ? state.ivSweepReadings : []), saved: state.ivResults.some(result => result.device === definition.id) }));
  series.forEach(({ definition, readings, saved }) => {
    if (!readings.length) return;
    const ordered = [...readings].sort((a, b) => a.voltage_v - b.voltage_v);
    ctx.strokeStyle = definition.colour; ctx.lineWidth = expanded ? 4 : 2.7; ctx.globalAlpha = saved ? 1 : .5; ctx.setLineDash(saved ? [] : [5, 4]); ctx.beginPath();
    ordered.forEach((reading, index) => { const xValue = px(reading.voltage_v), yValue = py(reading.current_a); index ? ctx.lineTo(xValue, yValue) : ctx.moveTo(xValue, yValue) }); ctx.stroke(); ctx.setLineDash([]);
    ordered.forEach(reading => { ctx.fillStyle = '#fff'; ctx.strokeStyle = definition.colour; ctx.lineWidth = expanded ? 2.4 : 1.6; ctx.beginPath(); ctx.arc(px(reading.voltage_v), py(reading.current_a), expanded ? 4.8 : 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }); ctx.globalAlpha = 1;
  });
  const legendY = y + (expanded ? 27 : 20), slot = (right - left) / 3;
  ivDeviceDefinitions.forEach((definition, index) => { const lx = left + slot * index; ctx.strokeStyle = definition.colour; ctx.lineWidth = expanded ? 4 : 3; ctx.beginPath(); ctx.moveTo(lx, legendY); ctx.lineTo(lx + (expanded ? 34 : 18), legendY); ctx.stroke(); text(definition.short, lx + (expanded ? 42 : 23), legendY, expanded ? 10.5 : 6.8, C.ink, 750) });
  if (expanded) { ctx.save(); ctx.translate(x + 23, top + gh / 2); ctx.rotate(-Math.PI / 2); text('current / A', 0, 0, 12.5, C.muted, 700, 'center'); ctx.restore(); text('potential difference across device / V', left + gw / 2, bottom + 53, 12.5, C.muted, 700, 'center') }
  else { text('current / A', x + 6, top - 13, 7.2, C.muted, 700); text('p.d. / V', right, bottom + 29, 7.2, C.muted, 700, 'right') }
}
function drawIvDeviceResults(x, y, w) {
  const compact = H < 700, descriptionY = graphSidebarDescriptionY(y), chartY = descriptionY + 31, chartH = compact ? 224 : 270;
  text('DEVICE I–V CHARACTERISTICS', x, y, 9.4, C.muted, 800);
  wrappedText(`${state.ivResults.length} of 3 curves saved · voltage reversed through zero`, x, descriptionY, w, 8.4, C.ink, 600, 10, 2);
  drawIvCurvePlot(x, chartY, w, chartH, false);
  const summaryY = chartY + chartH + 11, current = currentIvDevice(); rr(x, summaryY, w, compact ? 78 : 94, 7, state.complete ? '#f8eaf0' : '#eef3f2', state.complete ? '#d79ab0' : C.line);
  text(state.complete ? 'THREE CURVES COMPLETE' : current.label, x + 12, summaryY + 17, 7.7, state.complete ? '#b7466a' : C.muted, 800);
  wrappedText(state.complete ? 'Resistor: straight line. Lamp: decreasing gradient as it heats. LED: one-way current after its threshold.' : current.conclusion, x + 12, summaryY + 38, w - 24, compact ? 7.5 : 8.3, C.ink, 620, compact ? 9 : 10.5, 4);
}
function drawExpandedIvDeviceGraph(x, y, w, h) {
  const cardY = y + 48, cardH = h - 48;
  text('OHMIC AND NON-OHMIC I–V CURVES', x, y + 6, 13, C.muted, 850);
  text(`${state.ivResults.length} of 3 devices recorded`, x + w, y + 6, 12, '#c94f72', 750, 'right');
  text('Ammeter in series; voltmeter in parallel. Positive and negative supply polarities are plotted.', x, y + 28, 11, C.ink, 600);
  drawIvCurvePlot(x, cardY, w, cardH, true);
}
function drawExpandedLineGraph(x, y, w, h) {
  const s = currentGraphSpec(), cardY = y + 38, cardH = h - 38, left = x + 98, right = x + w - 34, top = cardY + 36, bottom = cardY + cardH - 72, gw = right - left, gh = bottom - top;
  const fmt = (value, dp = 0) => Number(value).toFixed(dp);
  text('RESULTS GRAPH', x, y + 8, 13, C.muted, 850);
  text(`${state.points.length} reading${state.points.length === 1 ? '' : 's'} recorded`, x + w, y + 8, 12, C.teal, 750, 'right');
  rr(x, cardY, w, cardH, 10, '#ffffff', C.line);
  ctx.strokeStyle = '#d7e1e3'; ctx.lineWidth = 1.2;
  for (let i = 0; i <= 5; i++) {
    const yy = top + i * gh / 5, value = s.yMax - (s.yMax - s.yMin) * i / 5;
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
    text(fmt(value, s.yDp), left - 14, yy, 11.5, C.muted, 600, 'right');
  }
  for (let i = 0; i <= 5; i++) {
    const xx = left + i * gw / 5, value = s.xMin + (s.xMax - s.xMin) * i / 5;
    text(fmt(value, s.xDp ?? idDp(s.xMax)), xx, bottom + 22, 11.5, C.muted, 600, 'center');
  }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  if (practicals[state.selected].id === 'osmosis') {
    const zeroY = bottom - (0 - s.yMin) / (s.yMax - s.yMin) * gh;
    ctx.strokeStyle = '#7c6b91'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(left, zeroY); ctx.lineTo(right, zeroY); ctx.stroke(); ctx.setLineDash([]);
    text('0% · no net mass change', right - 8, zeroY - 13, 11, '#6b4e9b', 750, 'right');
  }
  ctx.save(); ctx.translate(x + 25, top + gh / 2); ctx.rotate(-Math.PI / 2); text(s.yLabel, 0, 0, 13, C.muted, 700, 'center'); ctx.restore();
  text(s.xLabel, left + gw / 2, bottom + 51, 13, C.muted, 700, 'center');
  if (state.points.length) {
    ctx.strokeStyle = C.teal; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    state.points.forEach((point, index) => {
      const px = left + point.x * gw, py = bottom - point.y * gh;
      index ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke(); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    state.points.forEach(point => {
      const px = left + point.x * gw, py = bottom - point.y * gh;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = C.orange; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    if (practicals[state.selected].id === 'osmosis') {
      const isotonic = osmosisIsotonicConcentration();
      if (isotonic != null) {
        const isoX = left + isotonic / .8 * gw, zeroY = bottom - (0 - s.yMin) / (s.yMax - s.yMin) * gh;
        ctx.strokeStyle = '#6b4e9b'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(isoX, zeroY); ctx.lineTo(isoX, bottom); ctx.stroke(); ctx.setLineDash([]);
        rr(isoX - 72, zeroY + 16, 144, 34, 7, '#f1ecf7', '#b8a6d3'); text(`isotonic ≈ ${isotonic.toFixed(2)} M`, isoX, zeroY + 33, 11.5, '#6b4e9b', 800, 'center');
      }
    }
  } else {
    text('No readings recorded yet', left + gw / 2, top + gh / 2, 14, '#9aabb0', 700, 'center');
  }
}
function drawExpandedTemperatureBarChart(x, y, w, h, kind) {
  const lipase = kind === 'lipase-bar-chart', temperatures = lipase ? lipaseTemperatures : ratesTemperatures;
  const title = lipase ? 'TEMPERATURE SERIES' : 'TEMPERATURE REPEATS';
  const subtitle = lipase ? 'Shorter time means faster lipase activity; the rise at 60 °C shows denaturation.' : 'Time until the cross disappears at each controlled temperature.';
  const yLabel = lipase ? 'time for pink colour to disappear / s' : 'time for cross to disappear / s';
  const maximum = lipase ? 120 : 50, divisions = lipase ? 4 : 5;
  const results = lipase ? state.lipaseResults : state.ratesResults;
  const cardY = y + 48, cardH = h - 48, left = x + 106, right = x + w - 34, top = cardY + 38, bottom = cardY + cardH - 76, gw = right - left, gh = bottom - top;
  text(title, x, y + 6, 13, C.muted, 850);
  text(`${results.length} of ${temperatures.length} trials complete`, x + w, y + 6, 12, lipase ? '#d85c91' : C.orange, 750, 'right');
  text(subtitle, x, y + 27, 12, C.ink, 600);
  rr(x, cardY, w, cardH, 10, '#ffffff', C.line);
  ctx.strokeStyle = '#d7e1e3'; ctx.lineWidth = 1.2;
  for (let i = 0; i <= divisions; i++) {
    const yy = bottom - i * gh / divisions, value = i * maximum / divisions;
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
    text(String(value), left - 14, yy, 11.5, C.muted, 600, 'right');
  }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  const slot = gw / temperatures.length, barW = Math.min(92, slot * .56);
  temperatures.forEach((temperature, index) => {
    const result = results.find(item => item.temperature === temperature);
    const value = result?.time ?? (lipase ? 0 : ratesMeasuredTime(temperature));
    const barHeight = value / maximum * gh, centreX = left + slot * (index + .5), barTop = bottom - Math.max(3, barHeight);
    ctx.fillStyle = result ? lipase ? temperature === 40 ? '#3f9d78' : '#d85c91' : C.orange : '#e8edef';
    ctx.beginPath(); ctx.roundRect(centreX - barW / 2, barTop, barW, Math.max(3, barHeight), [7, 7, 0, 0]); ctx.fill();
    if (!result) {
      ctx.strokeStyle = '#c2d0d3'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    text(result ? `${value.toFixed(lipase ? 0 : 1)} s` : 'not run', centreX, Math.max(top + 12, barTop - 16), 12, result ? C.ink : C.muted, 800, 'center');
    text(`${temperature} °C`, centreX, bottom + 24, 12, C.ink, 700, 'center');
  });
  ctx.save(); ctx.translate(x + 25, top + gh / 2); ctx.rotate(-Math.PI / 2); text(yLabel, 0, 0, 13, C.muted, 700, 'center'); ctx.restore();
  text('temperature / °C', left + gw / 2, bottom + 56, 13, C.muted, 700, 'center');
}
function drawGraphModal() {
  const p = practicals[state.selected], kind = currentGraphModalKind(p.id);
  if (!kind) return;
  ctx.fillStyle = 'rgba(8, 22, 31, .7)'; ctx.fillRect(0, 0, W, H);
  hit('close-graph-modal', 0, 0, W, H);
  const w = Math.min(1050, W - 40), h = Math.min(680, H - 40), x = (W - w) / 2, y = (H - h) / 2;
  ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, .42)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 9; rr(x, y, w, h, 16, '#f8faf9', '#bdcbcf'); ctx.restore();
  hit('graph-modal-body', x, y, w, h);
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, 72, [16, 16, 0, 0]); ctx.clip();
  const header = ctx.createLinearGradient(x, y, x + w, y); header.addColorStop(0, p.color || C.teal); header.addColorStop(1, '#102a3a'); ctx.fillStyle = header; ctx.fillRect(x, y, w, 72); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(x + 38, y + 36, 19, 0, Math.PI * 2); ctx.fill();
  text('↗', x + 38, y + 36, 18, '#ffffff', 850, 'center');
  text('EXPANDED GRAPH VIEW', x + 68, y + 24, 10, 'rgba(255,255,255,.82)', 850);
  text(p.title, x + 68, y + 47, 18, '#ffffff', 850);
  text('ESC TO CLOSE', x + w - 70, y + 24, 8.5, 'rgba(255,255,255,.72)', 750, 'right');
  rr(x + w - 52, y + 20, 34, 34, 17, 'rgba(255,255,255,.22)');
  text('✕', x + w - 35, y + 37, 15, '#ffffff', 850, 'center');
  hit('close-graph-modal', x + w - 52, y + 20, 34, 34);
  const contentX = x + 32, contentY = y + 88, contentW = w - 64, contentH = h - 112;
  if (p.id === 'latentheat') drawExpandedLatentHeatGraph(contentX, contentY, contentW, contentH);
  else if (p.id === 'ivdevices') drawExpandedIvDeviceGraph(contentX, contentY, contentW, contentH);
  else if (kind === 'line-graph') drawExpandedLineGraph(contentX, contentY, contentW, contentH);
  else drawExpandedTemperatureBarChart(contentX, contentY, contentW, contentH, kind);
}
function hookeFocusViewport() {
  const R = Math.max(260, Math.min(330, W * .23)), arenaX = 270, arenaY = 205, arenaW = Math.max(1, W - arenaX - R), arenaH = Math.max(180, H - 333);
  const progress = Math.max(0, Math.min(1, state.hookeFocusProgress || 0)), eased = progress * progress * (3 - 2 * progress);
  const maxWidth = Math.min(660, Math.max(260, arenaW - 26)), maxHeight = Math.min(410, Math.max(170, arenaH - 20)), scale = .88 + eased * .12;
  const width = Math.min(maxWidth, maxHeight * 1.78) * scale, height = width / 1.78;
  return { x: arenaX + (arenaW - width) / 2, y: arenaY + (arenaH - height) / 2, width, height };
}
function drawHookeFocusModal() {
  if (!state.hookeFocusModal) return;
  const view = hookeFocusViewport(), pointerReading = hookeRulerReadingCm(), extension = hookeExtensionCm();
  ctx.save();
  ctx.fillStyle = 'rgba(7, 25, 35, .78)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-out'; rr(view.x, view.y, view.width, view.height, 12, '#000');
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = '#b55c9d'; ctx.lineWidth = 2; rr(view.x, view.y, view.width, view.height, 12, null, '#b55c9d');
  rr(view.x + 12, view.y + 12, Math.min(214, view.width - 72), 28, 7, 'rgba(8, 31, 43, .9)', 'rgba(255,255,255,.2)');
  text('EYE-LEVEL RULER VIEW', view.x + 24, view.y + 26, 9, '#ffffff', 850);
  rr(view.x + view.width - 42, view.y + 12, 28, 28, 14, 'rgba(8, 31, 43, .9)', 'rgba(255,255,255,.24)');
  text('X', view.x + view.width - 28, view.y + 26, 11, '#ffffff', 850, 'center');
  const detailsWidth = Math.min(view.width - 28, 418), detailsY = view.y + view.height - 56;
  rr(view.x + 14, detailsY, detailsWidth, 42, 8, 'rgba(248,250,249,.96)', '#b55c9d');
  text(`POINTER ${pointerReading.toFixed(1)} cm`, view.x + 27, detailsY + 15, 9, '#9b4f87', 850);
  text(`EXTENSION ${extension.toFixed(1)} cm`, view.x + 27, detailsY + 30, 9, C.teal, 800);
  text(`minus unloaded ${hookeRulerUnloadedReadingCm.toFixed(1)} cm`, view.x + detailsWidth - 14, detailsY + 22, 8.6, C.muted, 700, 'right');
  ctx.restore();
  hit('close-hooke-focus-modal', 0, 0, W, H);
  hit('hooke-focus-modal-body', view.x, view.y, view.width, view.height);
  hit('close-hooke-focus-modal', view.x + view.width - 42, view.y + 12, 28, 28);
}
function idDp(max) { return max < 10 ? 1 : 0 }
function draw(skipWebGL = false) {
  regions = [];
  window.__buttonLabelAudit = [];
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.setLineDash([]);
  ctx.clearRect(0, 0, W, H);
  if (!portraitPromptVisible) {
    if (state.selected !== lastSelectedPractical) { state.reaction = null; lastSelectedPractical = state.selected }
    if (state.assessmentMode) {
      assessment.drawAssessmentMode(ctx, W, H, state, practicals, hit);
    } else {
      header(); sidebar(); main(); rightbar();
      if (state.focusMode && state.methodDropdown) drawMethodDropdownPanel();
      if (state.dose) drawDosePanel();
      if (state.evaluationModal) drawEvaluationModal();
      if (state.graphModal) drawGraphModal();
      if (state.reactantSafety) drawReactantSafetyModal();
      if (state.hookeFocusModal) {
        drawHookeFocusModal();
        const view = hookeFocusViewport();
        lab3d.resize(view.x, view.y, view.width, view.height, UI_SCALE);
      }
    }
  }
  visibleCtx.save();
  visibleCtx.setTransform(1, 0, 0, 1, 0, 0);
  visibleCtx.globalCompositeOperation = 'copy';
  visibleCtx.drawImage(buffer, 0, 0);
  visibleCtx.restore();
  if (!portraitPromptVisible && !state.assessmentMode && !state.dose && !state.evaluationModal && !state.graphModal && !state.reactantSafety && !skipWebGL && !state.drag) lab3d.render(performance.now(), state, practicals[state.selected])
  requestSimulationFrame();
}
function addWorkspaceItem(type, x = null, y = null) { const slot = state.workspace.length, benchY = H - 128, item = { uid: state.nextItem++, type, x: x ?? (345 + (slot % 5) * 105), y: y ?? (benchY - 64 - Math.floor(slot / 5) * 105), lit: false, mass: 0, contents: [], snappedTo: null, attachedTo: null, temperature: 20, heating: false, ph: null }; state.workspace.push(item); if (type === 'phmeter') { const target = nearestPhVessel(item)?.target; if (target) { dockPhMeter(item, target); state.toast = `pH meter auto-positioned in the ${target.type === 'tube' ? 'test tube' : 'beaker'} — its display will follow this liquid.` } else state.toast = 'pH meter added — add a beaker or test tube and it will position itself automatically.' } else if (isPhVessel(item)) { const waiting = state.workspace.find(candidate => candidate.type === 'phmeter' && !candidate.attachedTo); autoPositionPhMeters(item); state.toast = waiting ? `pH meter auto-positioned in the new ${type === 'tube' ? 'test tube' : 'beaker'}.` : `${equipment.find(e => e.id === type)?.name || type} added — drag it to reposition.` } else state.toast = `${equipment.find(e => e.id === type)?.name || type} added — drag it to reposition.`; refreshWorkspacePh() }
function positionWorkspaceItem(it, pointerX, pointerY, dx = 0, dy = 0) { const R = Math.max(260, Math.min(330, W * .23)); it.x = Math.max(310, Math.min(W - R - 42, pointerX - dx)); it.y = Math.max(285, Math.min(H - 145, pointerY - dy)) }
function containerItems() { return state.workspace.filter(it => ['flask', 'beaker', 'tube'].includes(it.type)) }
function workspaceHeatLinks() { return state.workspace.filter(it => isHeatVessel(it) && it.snappedTo && it.contents?.length).map(beaker => { const tripod = state.workspace.find(a => a.uid === beaker.snappedTo && a.type === 'tripod'); if (!tripod) return null; const burner = state.workspace.find(a => a.type === 'bunsen' && a.lit && Math.hypot(a.x - tripod.x, a.y - tripod.y) < 115); return burner ? { beaker, tripod, burner } : null }).filter(Boolean) }
function openDose(reactantId, targetUid) { const r = reactantShelf.find(a => a.id === reactantId); if (!r) return; state.dose = { reactantId, targetUid, amount: Math.min(r.max, r.unit === 'g' ? 5 : 25) }; state.toast = `Choose how much ${r.formula} to add.` }
function applyDose() { const d = state.dose, r = reactantShelf.find(a => a.id === d?.reactantId), item = state.workspace.find(a => a.uid === d?.targetUid); if (!r || !item) return; item.contents ??= []; item.contents.push({ id: r.id, name: r.name, amount: d.amount, unit: r.unit, color: r.color }); if (r.unit === 'mL') state.volume += d.amount; else item.mass = (item.mass || 0) + d.amount; state.dose = null; const rule = reactionRuleFor(item); if (rule) triggerWorkspaceReaction(item, rule); refreshWorkspacePh(); if (!rule) state.toast = `Added ${d.amount.toFixed(r.step < 1 ? 1 : 0)} ${r.unit} ${r.formula} to the ${equipment.find(e => e.id === item.type)?.name}; pH ${Number.isFinite(item.ph) ? item.ph.toFixed(2) : 'requires a liquid sample'}.` }
function resetRatesPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 20; state.ph = 7; state.transferred = 0; state.pour = null; state.ratesStage = 0; state.ratesStageTimer = 0; state.ratesTrialIndex = 0; state.ratesTargetTemp = 20; state.ratesBathTemp = 20; state.ratesConditioning = false; state.ratesResults = []; state.tab = 'bench'; state.toast = 'The sodium thiosulfate flask is conditioning in the electric water bath at 20 °C. Move it onto the paper cross when ready.' }
function activateRates(label) { if (label === 'MOVE TO CROSS' && state.ratesStage === 0 && !state.ratesConditioning) { state.ratesStage = 1; state.ratesStageTimer = 0; state.running = true; state.toast = `Moving the ${state.ratesTargetTemp} °C sodium thiosulfate flask from the water bath onto the paper cross.` } else if (label === 'ADD HCl' && state.ratesStage === 2) startAcidPour(); else if (label === 'NEXT TEMPERATURE' && state.ratesStage === 4 && state.ratesResults.length < ratesTemperatures.length) { const previous = state.ratesTargetTemp; state.ratesTrialIndex = state.ratesResults.length; state.ratesTargetTemp = ratesTemperatures[state.ratesTrialIndex]; state.ratesBathTemp = previous; state.ratesConditioning = true; state.ratesStage = 0; state.ratesStageTimer = 0; state.transferred = 0; state.progress = 0; state.time = 0; state.pour = null; state.running = true; state.complete = false; state.temp = previous; state.toast = `The next flask is in the electric water bath. Heating from ${previous} °C to ${state.ratesTargetTemp} °C.` } else if (label === 'VIEW GRAPH') { state.tab = 'graph'; state.toast = 'Temperature-repeat bar chart complete.' } else if (label === 'RESET SERIES') resetRatesPractical(); else if (label === "BIRD'S EYE") state.tab = 'birdseye' }
function resetStarchPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 7; state.starchStage = 0; state.starchTimer = 0; state.tab = 'bench'; state.toast = 'A fresh green leaf is held in forceps above boiling water. Start by boiling it to stop its chemical reactions.' }
function activateStarch(label) {
  const stage = state.starchStage || 0;
  if (label === 'BOIL LEAF' && stage === 0) { state.starchStage = 1; state.starchTimer = 0; state.running = true; state.toast = 'Lowering the leaf into boiling water. The tissue softens and its reactions stop.' }
  else if (label === 'MOVE TO ETHANOL' && stage === 2) { state.starchStage = 3; state.starchTimer = 0; state.running = true; state.toast = 'Moving the softened leaf into ethanol heated safely in the electric water bath.' }
  else if (label === 'RINSE LEAF' && stage === 4) { state.starchStage = 5; state.starchTimer = 0; state.running = true; state.toast = 'Rinsing the brittle, decolourised leaf in warm water before spreading it on the white tile.' }
  else if (label === 'ADD IODINE' && stage === 6) { state.starchStage = 7; state.starchTimer = 0; state.running = true; state.toast = 'The dropping pipette is adding iodine across the pale leaf surface.' }
  else if (label === 'RESET PRACTICAL' && stage === 8) resetStarchPractical();
  else if (label === 'RESULT') state.tab = 'graph';
}
function resetLipasePractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 20; state.ph = 10; state.lipaseStage = 0; state.lipaseTimer = 0; state.lipaseTrialIndex = 0; state.lipaseTargetTemp = 20; state.lipaseBathTemp = 20; state.lipaseConditioning = false; state.lipaseResults = []; state.tab = 'bench'; state.toast = 'The pink milk mixture and lipase are equilibrated at 20 °C in the electric water bath. Add the lipase to start the timer.' }
function activateLipase(label) {
  if (label === 'ADD LIPASE' && state.lipaseStage === 0 && !state.lipaseConditioning) { state.lipaseStage = 1; state.lipaseTimer = 0; state.running = true; state.complete = false; state.time = 0; state.progress = 0; state.ph = 10; state.toast = `Adding the same volume of lipase to the ${state.lipaseTargetTemp} °C pink milk mixture.` }
  else if (label === 'NEXT TEMPERATURE' && state.lipaseStage === 3 && state.lipaseResults.length < lipaseTemperatures.length) { const previous = state.lipaseTargetTemp; state.lipaseTrialIndex = state.lipaseResults.length; state.lipaseTargetTemp = lipaseTemperatures[state.lipaseTrialIndex]; state.lipaseBathTemp = previous; state.lipaseConditioning = true; state.lipaseStage = 0; state.lipaseTimer = 0; state.running = true; state.complete = false; state.time = 0; state.progress = 0; state.ph = 10; state.tab = 'bench'; state.toast = `Conditioning fresh milk mixture and lipase from ${previous} °C to ${state.lipaseTargetTemp} °C.` }
  else if (label === 'VIEW GRAPH' || label === 'GRAPH') { state.tab = 'graph'; state.toast = 'The temperature series shows the shortest reaction time near the lipase optimum.' }
  else if (label === 'RESET SERIES') resetLipasePractical();
}
function resetTransformationPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = [];
  state.temp = 4; state.ph = 7; state.transformationStage = 0; state.transformationTimer = 0; state.transformationResults = []; state.tab = 'bench';
  state.toast = 'A sterile pGLO-style simulation is ready. Label matched +DNA and −DNA controls before any transfer.';
}
function activateTransformation(label) {
  const stage = state.transformationStage || 0;
  if (label === 'LABEL CONTROLS' && stage === 0) {
    state.transformationStage = 1; state.transformationTimer = 0; state.running = true; state.complete = false;
    state.toast = 'Labelling two chilled microtubes +DNA and −DNA and matching the four sealed agar-plate controls.';
  } else if (label === 'ADD CELLS + DNA' && stage === 2) {
    state.transformationStage = 3; state.transformationTimer = 0; state.running = true;
    state.toast = 'A sterile tip transfers competent teaching-strain bacteria to both tubes, then plasmid DNA to +DNA only.';
  } else if (label === 'ICE + HEAT SHOCK' && stage === 4) {
    state.transformationStage = 5; state.transformationTimer = 0; state.running = true;
    state.toast = 'Both tubes remain ice-cold, enter the 42 °C block together for the simulated 50-second heat shock, then return to ice.';
  } else if (label === 'ADD LB + RECOVER' && stage === 6) {
    state.transformationStage = 7; state.transformationTimer = 0; state.running = true;
    state.toast = 'Sterile LB broth enters both tubes. The cells recover before antibiotic selection.';
  } else if (label === 'PLATE CELLS' && stage === 8) {
    state.transformationStage = 9; state.transformationTimer = 0; state.running = true;
    state.toast = 'Fresh tips inoculate the matched control plates and sterile spreaders distribute the cells over the agar.';
  } else if (label === 'INCUBATE PLATES' && stage === 10) {
    state.transformationStage = 11; state.transformationTimer = 0; state.running = true;
    state.toast = 'The sealed plates incubate inverted in the simulation, then move onto the blue-light viewer for comparison.';
  } else if (label === 'VIEW RESULTS' || label === 'PLATES') {
    state.tab = 'graph';
    state.toast = state.complete ? 'Compare selection with gene expression: ampicillin selects transformed cells; arabinose induces GFP.' : 'Complete the plating and incubation stages to reveal all four controls.';
  } else if (label === 'RESET') resetTransformationPractical();
}
function resetRespirationPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 20; state.ph = 6.2;
  state.respirationStage = 0; state.respirationTimer = 0; state.respirationResults = []; state.tab = 'bench';
  state.toast = 'Five dry, labelled flasks are seated in separate 10, 20, 30, 40 and 60 °C water baths. Add the same 5.0 g mass of glucose to each flask.';
}
function activateRespiration(label) {
  const stage = state.respirationStage || 0;
  if (label === 'ADD GLUCOSE' && stage === 0) {
    state.respirationStage = 1; state.respirationTimer = 0; state.running = true; state.complete = false; state.progress = 0;
    state.toast = 'A level 5.0 g glucose portion is being tipped into each labelled flask in turn.';
  } else if (label === 'ADD YEAST' && stage === 2) {
    state.respirationStage = 3; state.respirationTimer = 0; state.running = true;
    state.toast = 'The measuring cylinder is adding the same 25.0 cm³ volume of yeast suspension to every glucose portion.';
  } else if (label === 'FIT BALLOONS' && stage === 4) {
    state.respirationStage = 5; state.respirationTimer = 0; state.running = true;
    state.toast = 'Five identical empty balloons are lifting from the tray and stretching airtight over the flask necks.';
  } else if (label === 'START 10 MIN RUN' && stage === 6) {
    state.respirationStage = 7; state.respirationTimer = 0; state.running = true; state.time = 0; state.progress = .6;
    state.toast = 'All five flasks begin the same ten-minute incubation together. Carbon dioxide bubbles form and collect in the balloons.';
  } else if (label === 'RECORD RESULTS' && stage === 8) {
    const balloonLabels = ['barely inflated', 'small', 'medium', 'largest', 'almost flat'];
    state.respirationResults = respirationTemperatures.map((temperature, index) => ({ temperature, time_minutes: 10, volume: respirationFinalGasVolumes[index], balloon: balloonLabels[index] }));
    state.points = state.respirationResults.map(result => ({ x: (result.temperature - 10) / 50, y: result.volume / 90, xValue: result.temperature, yValue: result.volume }));
    state.respirationStage = 9; state.running = false; state.complete = true; state.progress = 1; state.tab = 'graph';
    state.toast = 'Results recorded: carbon dioxide production peaks at 40 °C, is slower in cold baths and collapses at 60 °C because yeast enzymes are denatured.';
  } else if (label === 'VIEW GRAPH' || label === 'GRAPH') {
    state.tab = 'graph'; state.toast = state.complete ? 'The curve rises to an optimum near 40 °C then drops sharply at 60 °C.' : 'Complete and record the equal-time incubation to plot all five temperatures.';
  } else if (label === 'RESET PRACTICAL') resetRespirationPractical();
}
function resetAntibioticPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 20; state.ph = 7;
  state.antibioticStage = 0; state.antibioticTimer = 0; state.antibioticResults = []; state.antibioticMeasuredIndex = -1; state.tab = 'bench';
  state.toast = 'Begin with aseptic technique: tie back hair, wash hands, keep the capped disinfectant well away from the Bunsen, then disinfect, air-dry and mark the sealed plate base into four sectors.';
}
function activateAntibiotics(label) {
  const stage = state.antibioticStage || 0;
  if (label === 'PREPARE ASEPTICALLY' && stage === 0) {
    state.antibioticStage = 1; state.antibioticTimer = 0; state.running = true; state.complete = false; state.progress = 0;
    state.toast = 'The yellow safety flame is extinguished while 70% IMS is sprayed. Lift the sealed plate so the wipe can clean beneath it, dispose of the wipe, then flip the plate before marking its outside base.';
  } else if (label === 'INOCULATE AGAR' && stage === 2) {
    state.antibioticStage = 3; state.antibioticTimer = 0; state.running = true;
    state.toast = 'A sterile swab takes the teaching-strain Bacillus subtilis culture. The lid opens only a small amount while the agar is spread in three directions, then the swab goes straight into biohazard waste.';
  } else if (label === 'PLACE DISCS' && stage === 4) {
    state.antibioticStage = 5; state.antibioticTimer = 0; state.running = true;
    state.toast = 'Sterile forceps place P, E, T and sterile-water control discs at equal spacing. Each disc is pressed once and the lid is closed immediately.';
  } else if (label === 'SEAL + INCUBATE' && stage === 6) {
    state.antibioticStage = 7; state.antibioticTimer = 0; state.running = true; state.time = 0; state.temp = 25;
    state.toast = 'Two short tape strips secure the lid without sealing the whole circumference. The labelled plate is inverted, the glass incubator door opens to accept it, and incubation runs at 25 °C for 48 hours.';
  } else if (label === 'MEASURE ZONES' && stage === 8) {
    state.antibioticStage = 9; state.antibioticTimer = 0; state.running = true; state.antibioticResults = []; state.antibioticMeasuredIndex = -1;
    state.toast = 'The incubated plate remains closed. A transparent ruler aligns through each disc centre and records the widest clear-zone diameter in millimetres.';
  } else if (label === 'VIEW RESULTS' || label === 'RESULTS') {
    state.tab = 'graph';
    state.toast = state.complete ? 'Tetracycline produced the largest zone in this controlled plate. The sterile-water control confirms that handling alone did not inhibit growth.' : 'Complete incubation and measure every zone before comparing antibiotic efficacy.';
  } else if (label === 'RESET PRACTICAL' || label === 'RESET') resetAntibioticPractical();
}
function resetOsmosisPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 22; state.ph = 7; state.osmosisStage = 0; state.osmosisTimer = 0; state.osmosisTrialIndex = 0; state.osmosisConcentration = 0; state.osmosisResults = []; state.tab = 'bench'; state.toast = 'An equal potato cylinder has an initial mass of 5.00 g. Lower it into 50 cm³ of distilled water for the first trial.' }
function activateOsmosis(label) {
  if (label === 'LOWER CHIP' && state.osmosisStage === 0) { state.osmosisStage = 1; state.osmosisTimer = 0; state.running = true; state.complete = false; state.time = 0; state.toast = `The forceps are carrying the 5.00 g potato cylinder into ${state.osmosisConcentration.toFixed(1)} mol dm⁻³ sucrose solution.` }
  else if (label === 'REMOVE & BLOT' && state.osmosisStage === 3) { state.osmosisStage = 4; state.osmosisTimer = 0; state.running = true; state.toast = 'The forceps lift the potato cylinder clear. Blotting paper removes solution from its surface without squeezing the tissue.' }
  else if (label === 'REWEIGH CHIP' && state.osmosisStage === 5) { state.osmosisStage = 6; state.osmosisTimer = 0; state.running = true; state.toast = 'The blotted potato cylinder is returning to the electronic balance for its final mass.' }
  else if (label === 'NEXT CONCENTRATION' && state.osmosisStage === 7 && state.osmosisResults.length < osmosisConcentrations.length) { state.osmosisTrialIndex = state.osmosisResults.length; state.osmosisConcentration = osmosisConcentrations[state.osmosisTrialIndex]; state.osmosisStage = 0; state.osmosisTimer = 0; state.running = false; state.complete = false; state.time = 0; state.tab = 'bench'; state.toast = `Fresh equal potato cylinder ready: initial mass 5.00 g. Next solution is ${state.osmosisConcentration.toFixed(1)} mol dm⁻³ sucrose.` }
  else if (label === 'VIEW GRAPH' || label === 'GRAPH') { state.tab = 'graph'; state.toast = 'Plot percentage mass change against sucrose concentration and read the isotonic point where the line crosses 0%.' }
  else if (label === 'RESET SERIES') resetOsmosisPractical();
}
function resetAgarDiffusionPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 22; state.ph = 2;
  state.agarDiffusionStage = 0; state.agarDiffusionTimer = 0; state.agarDiffusionResults = []; state.tab = 'bench';
  state.toast = 'Three pink alkaline agar cubes contain phenolphthalein. Measure their 1 cm, 2 cm and 3 cm sides before placing them in acid.';
}
function activateAgarDiffusion(label) {
  const stage = state.agarDiffusionStage || 0;
  if (label === 'MEASURE CUBES' && stage === 0) { state.agarDiffusionStage = 1; state.agarDiffusionTimer = 0; state.running = true; state.complete = false; state.toast = 'The metric callipers check each cube in turn: 1.0 cm, 2.0 cm and 3.0 cm.'; }
  else if (label === 'LOWER INTO ACID' && stage === 2) { state.agarDiffusionStage = 3; state.agarDiffusionTimer = 0; state.running = true; state.toast = 'Forceps transfer the three pink cubes into identical beakers of dilute hydrochloric acid.'; }
  else if (label === 'START 10 MIN SOAK' && stage === 4) { state.agarDiffusionStage = 5; state.agarDiffusionTimer = 0; state.running = true; state.time = 0; state.toast = 'All cubes are fully submerged. Acid begins diffusing inward while one timer controls the same 10-minute exposure.'; }
  else if (label === 'REMOVE & BLOT' && stage === 6) { state.agarDiffusionStage = 7; state.agarDiffusionTimer = 0; state.running = true; state.toast = 'Forceps lift each cube from the acid, let it drain, then blot its surface without squeezing the agar.'; }
  else if (label === 'CUT CUBES' && stage === 8) { state.agarDiffusionStage = 9; state.agarDiffusionTimer = 0; state.running = true; state.toast = 'The scalpel cuts each cube through its centre and the halves separate to reveal the pink alkaline core.'; }
  else if (label === 'RECORD RESULTS' && stage === 10) {
    state.agarDiffusionResults = agarCubeSidesCm.map(agarDiffusionResult);
    state.points = state.agarDiffusionResults.map(result => ({ x: (result.sideCm - 1) / 2, y: result.percentageDiffused / 100, xValue: result.sideCm, yValue: result.percentageDiffused }));
    state.agarDiffusionStage = 11; state.complete = true; state.running = false; state.progress = 1; state.tab = 'graph';
    state.toast = 'Results recorded: the 1 cm cube has the greatest percentage diffused because it has the largest surface-area-to-volume ratio.';
  } else if (label === 'VIEW GRAPH' || label === 'GRAPH') state.tab = 'graph';
  else if (label === 'RESET PRACTICAL' || label === 'RESET') resetAgarDiffusionPractical();
}
function resetPotometerPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = [];
  state.temp = 22; state.ph = 7; state.potometerStage = 0; state.potometerTimer = 0;
  state.potometerTrialIndex = 0; state.potometerWindSpeed = 0; state.potometerBubbleMm = 0; state.potometerResults = [];
  state.tab = 'bench';
  state.toast = 'The leafy shoot was cut and fitted underwater. The potometer is completely water-filled and every joint is sealed; introduce one air bubble at the capillary tip.';
}
function activatePotometer(label) {
  const stage = state.potometerStage || 0;
  if (label === 'INTRODUCE BUBBLE' && stage === 0) {
    state.potometerStage = 1; state.potometerTimer = 0; state.running = true; state.complete = false; state.time = 0;
    state.toast = 'The capillary tip briefly leaves the water, admits one small air bubble, then returns below the surface.';
  } else if (label === 'ALIGN TO ZERO' && stage === 2) {
    state.potometerStage = 3; state.potometerTimer = 0; state.running = true;
    state.toast = 'Opening the refiller stopcock and pressing the plunger gently to move the bubble exactly onto the zero graduation.';
  } else if (label === 'START 5 MIN RUN' && stage === 4) {
    state.potometerStage = 5; state.potometerTimer = 0; state.running = true; state.time = 0; state.progress = state.potometerResults.length / potometerWindSpeeds.length;
    state.toast = state.potometerWindSpeed === 0 ? 'The control run has started with the fan off. Water uptake pulls the bubble steadily toward the shoot.' : `The fan produces ${state.potometerWindSpeed.toFixed(1)} m s⁻¹ airflow. The five-minute bubble measurement has started.`;
  } else if (label === 'NEXT WIND SPEED' && stage === 6 && state.potometerResults.length < potometerWindSpeeds.length) {
    state.potometerTrialIndex = state.potometerResults.length;
    state.potometerWindSpeed = potometerWindSpeeds[state.potometerTrialIndex];
    state.potometerStage = 3; state.potometerTimer = 0; state.running = true; state.complete = false; state.time = 0; state.tab = 'bench';
    state.toast = `The refiller is resetting the same measurement bubble to zero before the ${state.potometerWindSpeed.toFixed(1)} m s⁻¹ trial.`;
  } else if (label === 'VIEW GRAPH' || label === 'GRAPH') {
    state.tab = 'graph';
    state.toast = 'The graph shows faster water uptake as moving air removes the humid boundary layer around the leaves.';
  } else if (label === 'RESET SERIES') {
    resetPotometerPractical();
  }
}
function resetQuadratPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = [];
  state.quadratStage = 0; state.quadratTimer = 0; state.quadratSampleIndex = 0; state.quadratCurrentCount = 0; state.quadratResults = []; state.meadowWindClock = 0;
  state.tab = 'bench';
  state.toast = 'The meadow turf is growing into view. Lay two tape measures at right angles before generating a random coordinate.';
}
function activateQuadrat(label) {
  const stage = state.quadratStage || 0, sample = currentQuadratSample();
  if (label === 'LAY GRID TAPES' && stage === 0) {
    state.quadratStage = 1; state.quadratTimer = 0; state.running = true; state.complete = false;
    state.toast = 'Laying out two tape measures at right angles to define a 100 m² sample space.';
  } else if (label === 'GENERATE POINT' && stage === 2) {
    state.quadratStage = 3; state.quadratTimer = 0; state.running = true; state.complete = false; state.quadratCurrentCount = 0;
    state.toast = 'The coordinate generator is selecting one unused x–y grid point with equal probability.';
  } else if (label === 'PLACE QUADRAT' && stage === 4) {
    state.quadratStage = 5; state.quadratTimer = 0; state.running = true;
    state.toast = `Throwing the 1 m² quadrat toward grid point (${sample.xM}, ${sample.yM}) without looking for daisies.`;
  } else if (label === 'COUNT DAISIES' && stage === 6) {
    state.quadratStage = 7; state.quadratTimer = 0; state.running = true; state.quadratCurrentCount = 0;
    state.toast = 'Counting only daisies whose stem is rooted inside the frame; plants touching the top and right boundary are included consistently.';
  } else if (label === 'RECORD SAMPLE' && stage === 8) {
    const result = { sample: state.quadratSampleIndex + 1, xM: sample.xM, yM: sample.yM, daisies: sample.daisies, areaM2: 1 };
    if (!state.quadratResults.some(item => item.sample === result.sample)) state.quadratResults.push(result);
    state.quadratStage = 9; state.quadratCurrentCount = sample.daisies; state.running = false; state.progress = state.quadratResults.length / quadratSamples.length;
    state.complete = state.quadratResults.length === quadratSamples.length;
    state.toast = state.complete ? `Five samples complete: mean ${quadratMean().toFixed(1)} daisies m⁻², giving an estimated population of ${quadratPopulationEstimate()} in 100 m².` : `Sample ${result.sample} recorded: ${result.daisies} daisies. Generate a fresh random point for the next repeat.`;
  } else if (label === 'NEXT SAMPLE' && stage === 9 && !state.complete) {
    state.quadratSampleIndex = state.quadratResults.length; state.quadratStage = 2; state.quadratTimer = 0; state.quadratCurrentCount = 0; state.tab = 'bench';
    state.toast = 'The previous quadrat is clear. Generate the next unused random coordinate before viewing its patch.';
  } else if (label === 'VIEW RESULTS' || label === 'RESULTS') {
    state.tab = 'graph'; state.toast = `Mean density ${quadratMean().toFixed(1)} daisies m⁻²; estimated meadow population ${quadratPopulationEstimate()}.`;
  } else if (label === 'RESET STUDY') resetQuadratPractical();
}
function resetCapturePractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = [];
  state.captureStage = 0; state.captureTimer = 0; state.meadowWindClock = 0;
  state.captureFirstCatch = 16; state.captureSecondCatch = 20; state.captureRecaptured = 6;
  state.tab = 'bench';
  state.toast = 'The meadow is ready. Set pitfall traps to begin the capture-mark-recapture study.';
}
function activateCapture(label) {
  const stage = state.captureStage || 0;
  if (label === 'SET TRAPS' && stage === 0) {
    state.captureStage = 1; state.captureTimer = 0; state.running = true; state.complete = false;
    state.toast = 'Setting pitfall traps and leaving them overnight...';
  } else if (label === 'FIRST CAPTURE' && stage === 2) {
    state.captureStage = 3; state.captureTimer = 0; state.running = true;
    state.toast = 'Counting caught bugs and marking them carefully with a non-toxic marker...';
  } else if (label === 'RELEASE & WAIT' && stage === 4) {
    state.captureStage = 5; state.captureTimer = 0; state.running = true;
    state.toast = 'Releasing marked bugs back into the habitat and waiting 24 hours...';
  } else if (label === 'SECOND CAPTURE' && stage === 6) {
    state.captureStage = 7; state.captureTimer = 0; state.running = true;
    state.toast = 'Counting total bugs caught in the second sample and checking for marked ones...';
  } else if (label === 'RECORD' && stage === 8) {
    state.captureStage = 9; state.running = false; state.progress = 1;
    state.complete = true;
    state.toast = `Study complete: First catch ${state.captureFirstCatch}, Second catch ${state.captureSecondCatch}, Recaptured ${state.captureRecaptured}.`;
  } else if (label === 'VIEW RESULTS' || label === 'RESULTS' || label === 'DATA') {
    state.tab = 'graph'; state.toast = `Lincoln Index population estimate calculated.`;
  } else if (label === 'RESET STUDY' || label === 'RESET') resetCapturePractical();
}
function resetShoreTransectPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = [];
  state.transectStage = 0; state.transectTimer = 0; state.transectStationIndex = 0; state.transectDistanceM = 0; state.transectCurrentObservation = null; state.transectResults = []; state.shoreTideClock = 0; state.shoreTideProgress = 0;
  state.tab = 'bench';
  state.toast = 'The incoming tide is visible below the lower shore. Lay the belt perpendicular to the waterline from the fixed upper-shore datum.';
}
function activateShoreTransect(label) {
  const stage = state.transectStage || 0, station = currentTransectStation();
  if (label === 'LAY TRANSECT' && stage === 0) {
    state.transectStage = 1; state.transectTimer = 0; state.running = true; state.complete = false;
    state.toast = 'The twin measuring tapes unreel smoothly downslope to define a one-metre-wide belt through all three shore strata.';
  } else if (label === 'MOVE QUADRAT' && stage === 2) {
    state.transectStage = 3; state.transectTimer = 0; state.running = true;
    state.toast = `Moving the gridded quadrat along the belt to the fixed ${station.distanceM} m station in the ${station.zone.toLowerCase()} shore.`;
  } else if (label === 'SURVEY QUADRAT' && stage === 4) {
    state.transectStage = 5; state.transectTimer = 0; state.running = true; state.transectCurrentObservation = null;
    state.toast = 'Using the identification key and grid to count limpets and estimate barnacle and seaweed percentage cover.';
  } else if (label === 'RECORD SAMPLE' && stage === 6) {
    const result = { station: state.transectStationIndex + 1, ...station };
    if (!state.transectResults.some(item => item.station === result.station)) state.transectResults.push(result);
    state.transectStage = 7; state.running = false; state.progress = state.transectResults.length / transectStations.length;
    state.complete = state.transectResults.length === transectStations.length;
    state.toast = state.complete ? 'All six stations are complete. The zonation profile shows barnacles decreasing and brown seaweed increasing toward the lower shore.' : `${station.distanceM} m recorded: ${station.limpets} limpets, ${station.barnacleCover}% barnacles and ${station.seaweedCover}% seaweed.`;
  } else if (label === 'NEXT POSITION' && stage === 7 && !state.complete) {
    state.transectStationIndex = state.transectResults.length; state.transectDistanceM = currentTransectStation().distanceM; state.transectStage = 3; state.transectTimer = 0; state.running = true; state.transectCurrentObservation = null; state.tab = 'bench';
    state.toast = `Advancing the quadrat to the next fixed station at ${currentTransectStation().distanceM} m.`;
  } else if (label === 'VIEW ZONATION' || label === 'ZONATION') {
    state.tab = 'graph'; state.toast = 'Compare the systematic abundance and percentage-cover profile from the exposed upper shore to the wetter lower shore.';
  } else if (label === 'RESET TRANSECT') resetShoreTransectPractical();
}
function resetRipplePractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = [];
  state.rippleStage = 0; state.rippleTimer = 0; state.rippleTrialIndex = 0; state.rippleFrequencyHz = rippleTrials[0].frequencyHz; state.rippleTenWavelengthCm = 0; state.rippleWavelengthCm = 0; state.rippleSpeedMs = 0; state.rippleResults = []; state.rippleWaveClock = 0;
  state.tab = 'bench';
  state.toast = 'Shallow water is visible in the transparent ripple tank. Level the tank before starting the straight dipper so the depth remains uniform.';
}
function activateRipple(label) {
  const stage = state.rippleStage || 0, trial = currentRippleTrial(), measurement = rippleTrialMeasurement(trial);
  if (label === 'LEVEL TANK' && stage === 0) {
    state.rippleStage = 1; state.rippleTimer = 0; state.running = true; state.complete = false;
    state.toast = 'The levelling feet turn gently while the spirit bubble and shallow-water surface move toward the centre marks.';
  } else if (label === 'START VIBRATOR' && stage === 2) {
    state.rippleStage = 3; state.rippleTimer = 0; state.running = true;
    state.toast = `The signal generator ramps smoothly to ${trial.frequencyHz.toFixed(1)} Hz and the straight dipper begins producing parallel wavefronts.`;
  } else if (label === 'MEASURE 10 WAVES' && stage === 4) {
    state.rippleStage = 5; state.rippleTimer = 0; state.running = true;
    state.toast = 'The LED strobe synchronises with the dipper while a transparent ruler glides above the projection and aligns crest to crest across ten wavelengths.';
  } else if (label === 'RECORD SPEED' && stage === 6) {
    const result = { trial: state.rippleTrialIndex + 1, frequencyHz: trial.frequencyHz, tenWavelengthCm: trial.tenWavelengthCm, wavelengthCm: measurement.wavelengthCm, wavelengthM: measurement.wavelengthCm / 100, speedMs: measurement.speedMs };
    if (!state.rippleResults.some(item => item.trial === result.trial)) state.rippleResults.push(result);
    state.rippleStage = 7; state.running = false; state.progress = state.rippleResults.length / rippleTrials.length;
    state.points = state.rippleResults.map(item => ({ x: (item.frequencyHz - 4) / 4, y: (item.speedMs - .19) / .02, xValue: item.frequencyHz, yValue: item.speedMs }));
    state.complete = state.rippleResults.length === rippleTrials.length;
    state.toast = state.complete ? `Five frequencies complete. Mean wave speed = ${rippleMeanSpeed().toFixed(3)} m s⁻¹ at constant water depth.` : `${trial.frequencyHz.toFixed(1)} Hz recorded: λ = ${measurement.wavelengthCm.toFixed(2)} cm and v = ${measurement.speedMs.toFixed(3)} m s⁻¹.`;
  } else if (label === 'NEXT FREQUENCY' && stage === 7 && !state.complete) {
    state.rippleTrialIndex = state.rippleResults.length; state.rippleFrequencyHz = currentRippleTrial().frequencyHz; state.rippleTenWavelengthCm = 0; state.rippleWavelengthCm = 0; state.rippleSpeedMs = 0; state.rippleStage = 2; state.rippleTimer = 0; state.running = false; state.tab = 'bench';
    state.toast = `Water depth is unchanged. The signal generator is set to ${currentRippleTrial().frequencyHz.toFixed(1)} Hz for the next repeat.`;
  } else if (label === 'VIEW RESULTS' || label === 'RESULTS') {
    state.tab = 'graph';
    state.toast = state.rippleResults.length ? `Mean measured speed = ${rippleMeanSpeed().toFixed(3)} m s⁻¹. Compare the raw ten-wavelength measurements.` : 'Complete a wave measurement before comparing results.';
  } else if (label === 'RESET SERIES') resetRipplePractical();
}
function resetMassPractical() { state.running = false; state.complete = false; state.burner = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 7; state.massStage = 0; state.massLidOn = true; state.massTransfer = null; state.massBefore = 4.01; state.massAfter = null; state.tab = 'bench'; state.toast = 'Initial weighing: crucible, lid and magnesium ribbon = 4.01 g. Move the crucible to the tripod.' }
function removeMassLid() { if (state.massStage !== 2 || !state.massLidOn) return; state.massLidOn = false; state.massStage = 3; state.toast = 'Lid removed. The coiled magnesium ribbon is visible and ready to heat.' }
function activateMass(label) { if (label === 'MOVE TO TRIPOD' && state.massStage === 0) { state.massStage = 1; state.massTransfer = { direction: 'toTripod', t: 0 }; state.toast = 'Transferring the weighed crucible carefully to the wire gauze.' } else if (label === 'REMOVE LID') removeMassLid(); else if (label === 'LIGHT BUNSEN' && state.massStage === 3) { state.massStage = 4; state.burner = true; state.running = true; state.time = 0; state.progress = 0; state.toast = 'Magnesium is burning in oxygen with an intense white glow.' } else if (label === 'COOL & REWEIGH' && state.massStage === 5) { state.massStage = 6; state.massTransfer = { direction: 'toBalance', t: 0 }; state.temp = 70; state.toast = 'The flaky white magnesium oxide is cooling and moving to the balance.' } else if (label === 'RESET PRACTICAL') resetMassPractical(); else if (label === 'RECORD BEFORE') state.toast = 'Initial mass recorded: 4.01 g.'; else if (label === 'RECORD AFTER' && state.massAfter != null) state.toast = `Final mass recorded: ${state.massAfter.toFixed(2)} g.`; else if (label === 'RESULTS') state.tab = 'graph' }
function resetHydrogenPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 7; state.volume = 0; state.transferred = 0; state.hydrogenStage = 0; state.hydrogenTimer = 0; state.hydrogenAudioPlayed = false; state.hydrogenGas = 0; state.tab = 'bench'; state.toast = 'A coil of magnesium ribbon is ready in the test tube. Add the dilute hydrochloric acid.' }
function activateHydrogen(label) { primePopAudio(); if (label === 'POUR DILUTE HCl' && state.hydrogenStage === 0) { state.hydrogenStage = 1; state.hydrogenTimer = 0; state.running = true; state.time = 0; state.toast = 'Pouring dilute hydrochloric acid onto the magnesium ribbon.' } else if (label === 'TEST WITH LIT SPLINT' && state.hydrogenStage === 3) { state.hydrogenStage = 4; state.hydrogenTimer = 0; state.running = true; state.hydrogenAudioPlayed = false; state.toast = 'Thumb removed — the lit splint is approaching the trapped hydrogen.' } else if (label === 'RESET PRACTICAL' && state.hydrogenStage === 5) resetHydrogenPractical(); else if (label === 'RECORD') { state.points.push(graphReading()); state.toast = 'Hydrogen gas volume recorded.' } }
function startAcidPour() { const id = practicals[state.selected].id; if (id !== 'rates' && id !== 'temp') return; if (state.pour) { state.toast = 'The hydrochloric acid is already being poured.'; return } if (id === 'rates') { if (state.ratesStage !== 2) { state.toast = state.ratesStage === 0 ? 'Move the conditioned sodium thiosulfate flask onto the paper cross before adding acid.' : 'Wait until the flask is settled over the paper cross.'; return } state.transferred = 0; state.progress = 0; state.time = 0; state.ratesStage = 3; state.ratesStageTimer = 0; state.pour = { t: 0 }; state.running = true; state.complete = false; state.temp = state.ratesTargetTemp; state.lastReactant = 'Hydrochloric acid'; state.toast = 'Starting the timer and lifting HCl(aq) above the flask on the paper cross.'; return } if (state.transferred >= .98) { state.transferred = 0; state.progress = 0; state.time = 0; state.temp = 25; state.points = [] } state.pour = { t: 0 }; state.running = true; state.complete = false; state.lastReactant = 'Hydrochloric acid'; state.ph = 13; state.toast = 'Lifting the HCl(aq) flask towards the NaOH(aq) flask.' }
function applyGuidedReactant(name) { const id = practicals[state.selected].id, lower = name.toLowerCase(); if (id === 'flame') { const index = flameTestSalts.findIndex(s => s.salt === name); if (index < 0) return; if (state.running) { state.toast = 'Finish the current scoop or flame test before changing salt.'; return } state.flameTestSalt = index; state.flameTestStage = 0; state.flameTestTimer = 0; state.complete = state.flameTestTested.length === flameTestSalts.length; state.tab = 'bench'; state.toast = `${name} selected. Use the clean metal spatula to scoop a small sample.`; return } if (id === 'starchleaf') { state.toast = lower.includes('ethanol') ? 'Ethanol is already in the test tube inside the electric water bath. Never heat it over a naked flame.' : lower.includes('iodine') ? 'The iodine dropping pipette is ready above the white tile.' : 'The fresh leaf is held securely in forceps above the hot-water beaker.'; return } if (id === 'lipase') { state.toast = lower.includes('lipase') ? 'The measured lipase pipette is ready. Use ADD LIPASE once both mixtures are at the target temperature.' : lower.includes('phenolphthalein') ? 'Phenolphthalein is pink in the alkaline milk mixture and becomes colourless as fatty acids lower the pH.' : 'Equal milk and sodium carbonate volumes are already prepared in the test tube.'; return } if (id === 'respiration') { state.toast = lower.includes('glucose') ? 'Five equal 5.0 g glucose portions are ready in the powder boat.' : lower.includes('yeast') ? 'The yeast suspension is freshly mixed; every flask receives the same 25.0 cm³ volume.' : 'Each thermostatic bath contains water at its labelled temperature and all five incubations last exactly ten minutes.'; return } if (id === 'osmosis') { state.toast = lower.includes('potato') ? 'Each fresh potato cylinder has the same diameter, length and 5.00 g initial mass.' : lower.includes('distilled') ? 'Distilled water is the 0.0 mol dm⁻³ solution and gives the greatest net water entry.' : `The current beaker contains 50 cm³ of ${state.osmosisConcentration.toFixed(1)} mol dm⁻³ sucrose solution.`; return } if (id === 'potometer') { state.toast = lower.includes('shoot') ? 'The fresh shoot was cut at an angle and fitted underwater so no air entered the xylem.' : lower.includes('jelly') ? 'A visible petroleum-jelly collar seals the bung and every glass joint against air leaks.' : 'The glass chamber, reservoir and capillary are completely filled with water before the measurement bubble is introduced.'; return } if (id === 'titration') { if (lower.includes('phenolphthalein')) activateTitration('ADD INDICATOR'); else if (lower.includes('naoh')) state.toast = 'The 50 cm³ burette has been rinsed and filled with 0.100 mol dm⁻³ NaOH to the 0.00 cm³ mark.'; else state.toast = '25.0 cm³ HCl has been transferred by pipette into the conical flask on the white tile.'; return } if (id === 'mass') { state.toast = name === 'Oxygen' ? 'Oxygen is supplied by the air around the open crucible.' : 'The magnesium ribbon is already weighed inside the covered crucible.'; return } if (id === 'hydrogen') { state.toast = lower.includes('acid') ? 'Use POUR DILUTE HCl to animate the measured acid addition.' : 'The magnesium ribbon is already coiled in the test tube.'; return } if (id === 'electro') { state.toast = lower.includes('litmus') ? 'Use damp litmus paper to identify chlorine at the positive anode.' : 'Copper chloride solution is already in the beaker. Switch on the connected power pack.'; return } if ((id === 'rates' || id === 'temp') && lower.includes('hydrochloric')) { startAcidPour(); return } if (id === 'temp' && lower.includes('sodium hydroxide')) { state.lastReactant = name; state.ph = 13; state.progress = Math.max(.04, state.progress); state.toast = 'Sodium hydroxide is ready in the receiving flask. Now add the hydrochloric acid.'; return } if (id === 'rates' && lower.includes('thiosulfate')) { state.lastReactant = name; state.toast = state.ratesStage === 0 ? `The ${state.ratesTargetTemp} °C sodium thiosulfate flask is in the electric water bath. Move it onto the cross.` : 'Sodium thiosulfate is ready above the paper cross.'; return } state.lastReactant = name; state.running = true; state.progress = Math.max(.14, state.progress); state.transferred = Math.min(1, state.transferred + .28); state.toast = `${name} added to the correct container — observe the reaction.`; if (lower.includes('hydrochloric')) state.ph = Math.max(1, state.ph - 2); if (lower.includes('sodium hydroxide')) state.ph = Math.min(13, state.ph + 3) }
const baseApplyGuidedReactant = applyGuidedReactant;
applyGuidedReactant = name => {
  if (practicals[state.selected].id === 'antibiotics') {
    const lower = name.toLowerCase();
    state.toast = lower.includes('bacillus') ? 'The approved teaching culture stays capped except for the brief sterile-swab transfer. Use INOCULATE AGAR to demonstrate minimal lid opening.' : lower.includes('antibiotic') ? 'The coded P, E, T and sterile-water control discs remain in their sterile card until forceps place them at equal spacing.' : 'The 70% IMS surface disinfectant is for the bench only. Keep it away from ignition sources, dispose of the used wipe and let the field air-dry.';
    return
  }
  if (practicals[state.selected].id === 'thermite') {
    state.toast = name.toLowerCase().includes('fuse')
      ? 'The magnesium fuse is already secured to the sealed charge. Use IGNITE FUSE for the remote simulation.'
      : 'The thermite charge is pre-packed and sealed inside the shielded sand containment.';
    return
  }
  if (practicals[state.selected].id === 'displacement') {
    const trial = displacementTrials.find(item => name.includes(item.metal));
    state.toast = trial ? `${trial.metal} is positioned above ${trial.solution}. Use LOWER METALS to start all four fair tests together.` : 'All four labelled reactant pairs are already prepared in the test-tube rack.';
    return
  }
  if (practicals[state.selected].id === 'alkali') {
    const metal = alkaliMetals.find(item => name.toLowerCase().includes(item.id));
    state.toast = metal ? `${metal.name} remains sealed under oil until the protected simulation begins. Use LOWER METAL to start the observation.` : 'All alkali-metal samples remain sealed for this simulation-only comparison.';
    return
  }
  baseApplyGuidedReactant(name)
};
function resetSaltsPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 1; state.saltsStage = 0; state.saltsTimer = 0; state.burner = false; state.tab = 'bench'; state.toast = 'Start with a beaker of dilute sulfuric acid.' }
function activateSalts(label) { if (label === 'POUR CuO' && state.saltsStage === 0) { state.saltsStage = 1; state.saltsTimer = 0; state.running = true; state.toast = 'Adding black copper oxide powder to the acid.' } else if (label === 'FILTER MIXTURE' && state.saltsStage === 1) { state.saltsStage = 2; state.saltsTimer = 0; state.running = true; state.toast = 'Filtering the mixture. Unreacted CuO stays in the filter paper.' } else if (label === 'HEAT SOLUTION' && state.saltsStage === 2) { state.saltsStage = 3; state.saltsTimer = 0; state.running = true; state.burner = true; state.toast = 'Heating the blue copper sulfate solution to evaporate water.' } else if (label === 'COOL & CRYSTALLISE' && state.saltsStage === 3) { state.saltsStage = 4; state.saltsTimer = 0; state.running = true; state.burner = false; state.toast = 'Cooling the solution. Blue crystals of copper sulfate are forming.' } else if (label === 'RESET PRACTICAL' && state.saltsStage === 4) resetSaltsPractical(); }
function resetElectroPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 7; state.electroRecorded = false; state.electroWeighing = false; state.electroWeighTimer = 0; state.tab = 'bench'; state.toast = 'The graphite electrodes are clipped to the 6 V DC power pack. Switch it on to begin electrolysis.' }
function activateElectro(label) { if (label === 'SWITCH ON') { state.running = true; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.electroRecorded = false; state.electroWeighing = false; state.electroWeighTimer = 0; state.toast = 'Power pack on: copper is coating the negative cathode while chlorine forms at the positive anode.' } else if (label === 'RESET') resetElectroPractical(); else if (label === 'RECORD MASSES') { if (!state.complete) { state.toast = 'Complete the electrolysis before removing and weighing the cathode.' } else if (state.electroWeighing) { state.toast = 'The cathode is already moving to the electronic balance.' } else if (state.electroRecorded) { state.toast = 'Cathode mass recorded: 13.24 g.' } else { state.electroWeighing = true; state.electroWeighTimer = 0; state.toast = 'The crocodile clip releases and the copper-coated cathode is lifted from the solution.' } } else if (label === 'RESULTS') state.tab = 'graph' }
function resetFlameTestPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 7; state.burner = true; state.flameTestStage = 0; state.flameTestTimer = 0; state.flameTestSalt = 0; state.flameTestTested = []; state.tab = 'bench'; state.toast = 'Lithium chloride selected. Scoop a small sample with the clean metal spatula.' }
function activateFlameTest(label) { const salt = flameTestSalts[state.flameTestSalt]; if (label === 'SCOOP SALT' && state.flameTestStage === 0) { state.flameTestStage = 1; state.flameTestTimer = 0; state.running = true; state.toast = `Scooping a small sample of ${salt.salt} onto the metal spatula.` } else if (label === 'ENTER BLUE FLAME' && state.flameTestStage === 2) { state.flameTestStage = 3; state.flameTestTimer = 0; state.running = true; state.toast = 'Moving the loaded spatula into the hottest part of the roaring blue Bunsen flame.' } else if (label === 'NEXT SALT' && state.flameTestStage === 4) { const next = flameTestSalts.findIndex((_, i) => !state.flameTestTested.includes(i)); state.flameTestSalt = next < 0 ? 0 : next; state.flameTestStage = 0; state.flameTestTimer = 0; state.complete = false; state.tab = 'bench'; state.toast = `${flameTestSalts[state.flameTestSalt].salt} selected. Use the clean spatula for the next sample.` } else if (label === 'RESET SERIES') resetFlameTestPractical(); else if (label === 'SPECTRA') state.tab = 'graph' }
function resetThermitePractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 7; state.thermiteTimer = 0; state.thermiteAudioPlayed = false; state.tab = 'bench'; state.toast = 'The sealed charge is embedded in sand behind the heat-resistant glass screen. Ignite only within this simulation.' }
function activateThermite(label) { primePopAudio(); if (label === 'IGNITE FUSE' && !state.running && !state.complete) { state.running = true; state.complete = false; state.time = 0; state.progress = 0; state.points = [graphReading()]; state.temp = 25; state.thermiteTimer = 0; state.thermiteAudioPlayed = false; state.toast = 'The small blow torch is approaching the magnesium fuse behind the safety screen.' } else if (label === 'RESET PRACTICAL') { resetThermitePractical() } else if (label === 'GRAPH') { state.tab = 'graph' } else if (state.running) { state.toast = 'The shielded reaction is already in progress.' } }
function resetDisplacementPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 7; state.displacementStage = 0; state.displacementTimer = 0; state.displacementRecorded = false; state.tab = 'bench'; state.toast = 'Four labelled test tubes contain equal volumes of salt solution. The cleaned metal strips are ready above them.' }
function activateDisplacement(label) { if (label === 'LOWER METALS' && state.displacementStage === 0) { state.displacementStage = 1; state.displacementTimer = 0; state.running = true; state.complete = false; state.progress = 0; state.time = 0; state.toast = 'Lowering the four cleaned metal strips into their labelled salt solutions.' } else if (label === 'RECORD RESULTS' && state.displacementStage === 2) { state.displacementStage = 3; state.displacementRecorded = true; state.tab = 'graph'; state.toast = 'Results recorded: Mg > Zn > Fe > Cu > Ag.' } else if (label === 'RESET SERIES' && state.displacementStage === 3) resetDisplacementPractical(); else if (label === 'RESULTS') state.tab = 'graph' }
function titrationPh(volume = state.titrationVolume) { const acid = .1 * .025, base = .1 * Math.max(0, volume) / 1000, total = .025 + Math.max(0, volume) / 1000, difference = base - acid; if (Math.abs(difference) < 1e-10) return 7; if (difference < 0) return Math.max(0, -Math.log10(-difference / total)); return Math.min(14, 14 + Math.log10(difference / total)) }
const titrationIndicatorDuration = 3.2;
function resetTitrationPractical() { state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 1; state.volume = 0; state.titrationStage = 0; state.titrationVolume = 0; state.titrationDropTimer = 0; state.titrationDrops = 0; state.titrationIndicator = false; state.titrationIndicatorTimer = 0; state.titrationRecorded = false; state.tab = 'bench'; state.toast = 'The burette is filled to 0.00 cm³ with sodium hydroxide and 25.0 cm³ HCl is on the white tile. Add phenolphthalein.' }
function activateTitration(label) { if (label === 'ADD INDICATOR' && state.titrationStage === 0 && state.titrationIndicatorTimer <= 0) { state.titrationIndicatorTimer = .001; state.running = true; state.toast = 'The phenolphthalein bottle is being lifted to add two indicator drops.' } else if (label === 'OPEN TAP' && state.titrationStage === 1) { state.titrationStage = 2; state.running = true; state.time = 0; state.points = [graphReading()]; state.toast = 'Burette tap open. Swirl the flask while sodium hydroxide flows in.' } else if (label === 'ADD ONE DROP' && state.titrationStage === 3 && state.titrationDropTimer <= 0) { state.titrationDropTimer = .42; state.running = true; state.titrationDrops++; state.titrationVolume = Math.min(25.05, state.titrationVolume + .05); state.volume = state.titrationVolume; state.progress = Math.min(1, state.titrationVolume / 25.05); state.ph = titrationPh(); state.points.push(graphReading()); state.toast = state.titrationVolume >= 25.05 ? 'One final drop is mixing — watch for a permanent pale pink.' : `Drop ${state.titrationDrops}: still colourless. Continue one drop at a time.` } else if (label === 'RECORD TITRE' && state.titrationStage === 4) { state.titrationRecorded = true; state.titrationStage = 5; state.tab = 'graph'; state.toast = `Titre recorded: ${state.titrationVolume.toFixed(2)} cm³ NaOH.` } else if (label === 'RESET PRACTICAL' && state.titrationStage === 5) resetTitrationPractical(); else if (label === 'RESULTS') state.tab = 'graph' }
function activateWater(label) { if (label === 'WATER ON') { state.coolingWater = true; state.running = state.burner && !state.complete; state.toast = state.burner ? 'Cooling water flowing counter-current through the condenser; distillation is underway.' : 'Cooling water is entering at the lower condenser inlet. The electric heater can now be switched on.' } else if (label === 'WATER OFF') { state.coolingWater = false; state.running = false; state.toast = state.burner ? 'Cooling stopped — switch the heater off before continuing.' : 'Cooling-water flow stopped.' } else if (label === 'HEATER ON') { if (!state.coolingWater) { state.toast = 'Start the cooling water before switching on the electric heating mantle.'; return } state.burner = true; state.running = !state.complete; state.toast = 'Electric heating mantle on — the round-bottom flask is warming and vapour will pass into the condenser.' } else if (label === 'HEATER OFF') { state.burner = false; state.running = false; state.toast = 'Electric heating mantle switched off; cooling water can continue while the glassware cools.' } else if (label === 'RECORD') { state.points.push(graphReading()); state.toast = 'Distillation temperature and collected volume recorded.' } }
function activatePondweed(label) {
  if (label === '- 10cm') {
    const nextDistance = Math.max(10, state.pondweedDistance - 10);
    state.pondweedDistance = nextDistance;
    state.toast = nextDistance === 10 ? 'Lamp set to the 10 cm minimum, measured from the beaker edge.' : `Lamp distance set to ${nextDistance} cm from the beaker edge.`;
  } else if (label === '+ 10cm') {
    const nextDistance = Math.min(50, state.pondweedDistance + 10);
    state.pondweedDistance = nextDistance;
    state.toast = `Lamp distance set to ${nextDistance} cm from the beaker edge.`;
  } else if (label === 'LAMP ON') {
    state.pondweedLampOn = true;
    state.toast = 'Filament desk lamp switched ON.';
  } else if (label === 'LAMP OFF') {
    state.pondweedLampOn = false;
    state.toast = 'Filament desk lamp switched OFF. Photosynthesis stops in darkness.';
  } else if (label === 'COUNT 1 MIN') {
    if (state.pondweedCountAnimating) {
      state.toast = 'Count already in progress — wait for the 1-minute simulation to finish.';
      return;
    }
    if (!state.pondweedLampOn) {
      state.toast = 'Lamp is OFF — turn on lamp before counting bubbles.';
      return;
    }
    state.pondweedPendingBpm = Math.round(52 / Math.pow(state.pondweedDistance / 10, 1.8) + 4);
    state.pondweedCountAnimating = true;
    state.pondweedCountTimer = 0;
    state.running = true;
    state.complete = false;
    state.toast = 'Counting oxygen bubbles over 1 minute...';
  } else if (label === 'RESET PRACTICAL') {
    state.pondweedDistance = 20;
    state.pondweedLampOn = true;
    state.pondweedTimer = 0;
    state.pondweedBubbles = 0;
    state.pondweedCountAnimating = false;
    state.pondweedCountTimer = 0;
    state.pondweedPendingBpm = null;
    state.pondweedResults = [];
    state.points = [];
    state.running = false;
    state.complete = false;
    state.toast = 'Pondweed practical reset to 20 cm.';
  } else if (label === 'METHOD') {
    state.tab = 'bench';
  } else if (label === 'RESULTS' || label === 'GRAPH') {
    state.tab = 'graph';
  }
}
function activateNewton2(label) {
  if (label === 'FORCE -0.1N') {
    state.newtonForce = +(Math.max(0.1, state.newtonForce - 0.1)).toFixed(1);
    state.toast = `Accelerating force set to ${state.newtonForce.toFixed(1)} N.`;
  } else if (label === 'FORCE +0.1N') {
    state.newtonForce = +(Math.min(0.5, state.newtonForce + 0.1)).toFixed(1);
    state.toast = `Accelerating force set to ${state.newtonForce.toFixed(1)} N.`;
  } else if (label === 'RELEASE TROLLEY' && !state.newtonRunning) {
    state.newtonMass = 1.0;
    state.newtonPos = 0;
    state.newtonVel = 0;
    state.newtonAcc = +(state.newtonForce / state.newtonMass).toFixed(2);
    state.newtonRunning = true;
    state.running = true;
    state.complete = false;
    state.newtonTimer = 0;
    state.newtonGate1Time = null;
    state.newtonGate2Time = null;
    state.newtonGate1Velocity = null;
    state.newtonGate2Velocity = null;
    state.toast = `Trolley released! Accelerating down the elevated track...`;
  } else if (label === 'RESET TROLLEY' || label === 'RESET PRACTICAL') {
    state.newtonForce = 0.2;
    state.newtonMass = 1.0;
    state.newtonPos = 0;
    state.newtonVel = 0;
    state.newtonRunning = false;
    state.running = false;
    state.complete = false;
    state.newtonTimer = 0;
    state.newtonGate1Time = null;
    state.newtonGate2Time = null;
    state.newtonGate1Velocity = null;
    state.newtonGate2Velocity = null;
    state.newtonResults = [];
    state.points = [];
    state.toast = 'Newton\'s 2nd Law practical reset.';
  } else if (label === 'METHOD') {
    state.tab = 'bench';
  } else if (label === 'RESULTS' || label === 'GRAPH') {
    state.tab = 'graph';
  }
}
function resetElectromagnetPractical() {
  state.running = false;
  state.complete = false;
  state.time = 0;
  state.progress = 0;
  state.points = [];
  state.electromagnetStage = 0;
  state.electromagnetTimer = 0;
  state.electromagnetTrialIndex = 0;
  state.electromagnetTurns = 10;
  state.electromagnetClips = 0;
  state.electromagnetResults = [];
  state.tab = 'bench';
  state.toast = 'The 10-turn coil is connected to a 3 V supply with the switch open. Close the switch to magnetise the soft-iron core.';
}
function activateElectromagnet(label) {
  const stage = state.electromagnetStage || 0;
  if (label === 'CLOSE SWITCH' && stage === 0) {
    state.electromagnetStage = 1; state.electromagnetTimer = 0; state.running = true; state.complete = false;
    state.toast = `Closing the switch. Current builds in the ${state.electromagnetTurns}-turn coil and magnetises the iron core.`;
  } else if (label === 'LOWER CORE' && stage === 2) {
    state.electromagnetStage = 3; state.electromagnetTimer = 0; state.running = true;
    state.toast = 'Lowering the energised core into the same shuffled pile of steel paper clips.';
  } else if (label === 'LIFT CORE' && stage === 4) {
    state.electromagnetStage = 5; state.electromagnetTimer = 0; state.running = true;
    state.electromagnetClips = electromagnetMeasuredClips();
    state.toast = `Lifting the electromagnet smoothly. ${state.electromagnetClips} paper clips remain attached to the core.`;
  } else if (label === 'RECORD COUNT' && stage === 6) {
    if (!state.electromagnetResults.some(r => r.turns === state.electromagnetTurns)) state.electromagnetResults.push({ turns: state.electromagnetTurns, clips: state.electromagnetClips });
    state.points = state.electromagnetResults.map(r => ({ x: r.turns / 50, y: r.clips / 15, xValue: r.turns, yValue: r.clips }));
    state.electromagnetStage = 7;
    state.running = false;
    state.complete = state.electromagnetResults.length === electromagnetTurnsSeries.length;
    if (state.complete) state.tab = 'graph';
    state.toast = state.complete ? 'Five trials complete: more wire turns produced a stronger electromagnet and lifted more paper clips.' : `${state.electromagnetTurns} turns recorded: ${state.electromagnetClips} paper clips. Open the switch and fit the next coil.`;
  } else if (label === 'NEXT COIL' && stage === 7 && !state.complete) {
    state.electromagnetTrialIndex = state.electromagnetResults.length;
    state.electromagnetTurns = electromagnetTurnsSeries[state.electromagnetTrialIndex];
    state.electromagnetClips = 0;
    state.electromagnetStage = 0;
    state.time = 0;
    state.progress = state.electromagnetResults.length / electromagnetTurnsSeries.length;
    state.tab = 'bench';
    state.toast = `The ${state.electromagnetTurns}-turn coil is fitted to the same core. The switch is open and the paper clips are reshuffled.`;
  } else if (label === 'VIEW GRAPH' || label === 'GRAPH') {
    state.tab = 'graph';
    state.toast = 'The results show paper clips lifted increasing with the number of wire turns.';
  } else if (label === 'RESET SERIES') resetElectromagnetPractical();
}
function resetConvectionPractical() {
  state.running = false;
  state.complete = false;
  state.time = 0;
  state.temp = 21;
  state.progress = 0;
  state.convectionStage = 0;
  state.convectionTimer = 0;
  state.burner = false;
  state.tab = 'bench';
  state.toast = 'The glass convection tube is filled with still water. Add the simulated orange potassium-dichromate tracer at one lower corner.';
}
function activateConvection(label) {
  const stage = state.convectionStage || 0;
  if (label === 'ADD TRACER' && stage === 0) {
    state.convectionStage = 1; state.convectionTimer = 0; state.running = true;
    state.toast = 'A tiny orange tracer crystal is being lowered into the left-hand bottom of the water-filled tube.';
  } else if (label === 'LIGHT BUNSEN' && stage === 2) {
    state.convectionStage = 3; state.convectionTimer = 0; state.running = true; state.burner = true;
    state.toast = 'Gentle heating begins below the tracer. The warmed, less-dense orange water starts to rise.';
  } else if (label === 'OBSERVATION') {
    state.tab = 'graph';
    state.toast = 'Observation view: warm coloured water rises, crosses the top, cools and sinks down the opposite side.';
  } else if (label === 'RESET DEMO') resetConvectionPractical();
}
function resetConductionPractical() {
  state.running = false;
  state.complete = false;
  state.time = 0;
  state.temp = 21;
  state.progress = 0;
  state.conductionStage = 0;
  state.conductionTimer = 0;
  state.burner = false;
  state.tab = 'bench';
  state.toast = 'Identical drawing pins are attached to equal-length copper, aluminium and steel rods with equal wax blobs.';
}
function activateConduction(label) {
  if (label === 'LIGHT BUNSEN' && state.conductionStage === 0) {
    state.conductionStage = 1; state.conductionTimer = 0; state.time = 0; state.progress = 0; state.running = true; state.complete = false; state.burner = true;
    state.toast = 'The Bunsen heats the shared end block. Watch the wax soften and drawing pins fall from each rod.';
  } else if (label === 'RESULTS') {
    state.tab = 'graph';
    state.toast = 'Copper pins fell first, then aluminium, then steel: copper conducted thermal energy fastest.';
  } else if (label === 'RESET DEMO' || label === 'RESET PRACTICAL') resetConductionPractical();
}
function resetThermalPractical() {
  state.running = false;
  state.complete = false;
  state.time = 0;
  state.temp = 21;
  state.progress = 0;
  state.thermalStage = 0;
  state.thermalTimer = 0;
  state.thermalRotation = 0;
  state.thermalCaptured = false;
  state.tab = 'bench';
  state.toast = 'The Leslie cube and thermal camera are at room temperature. Add hot water to warm every surface from inside.';
}
function activateThermal(label) {
  const stage = state.thermalStage || 0;
  if (label === 'ADD HOT WATER' && stage === 0) {
    state.thermalStage = 1; state.thermalTimer = 0; state.running = true; state.complete = false;
    state.toast = 'The insulated flask lifts and pours hot water through the Leslie cube filler neck.';
  } else if (label === 'PICK UP CAMERA' && stage === 2) {
    state.thermalStage = 3; state.thermalTimer = 0; state.running = true;
    state.toast = 'The thermal camera is moving smoothly toward the scene camera; its display is turning toward you.';
  } else if (label === 'CAPTURE IMAGE' && stage === 4) {
    state.thermalStage = 5; state.thermalCaptured = true; state.complete = true; state.running = false; state.tab = 'graph';
    state.toast = 'Thermal image captured. The matt-black face appears hottest; polished metal has the lowest apparent reading.';
  } else if (label === 'THERMAL VIEW') {
    state.tab = 'graph';
    state.toast = 'False-colour readings compare the Leslie cube surfaces from one fixed camera position.';
  } else if (label === 'RESET DEMO' || label === 'RESET PRACTICAL') resetThermalPractical();
}
function resetDensityPractical() {
  state.running = false;
  state.complete = false;
  state.densityStage = 0;
  state.densityTimer = 0;
  state.densityRecorded = false;
  state.points = [];
  state.densityResults = [];
  state.tab = 'bench';
  state.toast = 'Density practical reset. Click WEIGH OBJECT to measure sample dry mass.';
}
function activateDensity(label) {
  const sample = densitySamples[state.densitySample || 0];
  const stage = state.densityStage || 0;
  if (label === 'WEIGH OBJECT' && stage === 0) {
    state.densityStage = 1;
    state.toast = `Object placed on balance: Mass m = ${sample.mass.toFixed(1)} g. Next, fill the Eureka can with water.`;
  } else if (label === 'FILL EUREKA CAN' && stage === 1) {
    state.densityStage = 2;
    state.densityTimer = 0;
    state.running = true;
    state.complete = false;
    state.toast = 'Filling the Eureka can to the spout, then moving the object smoothly from the balance.';
  } else if (label === 'LOWER OBJECT' && stage === 3) {
    state.densityStage = 4;
    state.densityTimer = 0;
    state.running = true;
    state.complete = false;
    state.toast = 'Lowering object into water — displaced water overflows through spout into measuring cylinder!';
  } else if (label === 'RECORD DENSITY' && stage === 5) {
    state.densityStage = 6;
    state.densityRecorded = true;
    state.complete = true;
    state.tab = 'graph';
    const rho = +(sample.mass / sample.vol).toFixed(2);
    if (!state.densityResults.some(r => r.sample === sample.id)) {
      state.densityResults.push({ sample: sample.id, name: sample.name, mass: sample.mass, vol: sample.vol, density: rho });
    }
    state.points.push({ x: sample.vol / 100, y: sample.mass / 250, xValue: sample.vol, yValue: sample.mass });
    state.toast = `Density recorded: m = ${sample.mass} g, V = ${sample.vol} cm³ ⇒ ρ = ${rho} g/cm³. Plotting on graph!`;
  } else if (label === 'CHANGE SAMPLE' && stage !== 2 && stage !== 4) {
    state.densitySample = ((state.densitySample || 0) + 1) % densitySamples.length;
    const nextSample = densitySamples[state.densitySample];
    state.densityStage = 0;
    state.densityTimer = 0;
    state.running = false;
    state.toast = `Sample changed to ${nextSample.name}. Click WEIGH OBJECT to measure its dry mass.`;
  } else if (label === 'RESET PRACTICAL') {
    resetDensityPractical();
  } else if (label === 'METHOD') {
    state.tab = 'bench';
  } else if (label === 'RESULTS' || label === 'GRAPH') {
    state.tab = 'graph';
  }
}
function resetHookePractical() {
  state.running = false;
  state.complete = false;
  state.time = 0;
  state.progress = 0;
  state.points = [];
  state.hookeStage = 0;
  state.hookeTimer = 0;
  state.hookeTrialIndex = 0;
  state.hookeForceN = 0;
  state.hookeResults = [];
  state.tab = 'bench';
  state.toast = 'The spring hangs beside a vertical ruler with no added load. Record the pointer position as the zero-extension reference.';
}
function syncHookeGraphPoints() {
  state.points = state.hookeResults.map(item => ({ x: item.extension_m / .14, y: item.force_n / 7, xValue: item.extension_m, yValue: item.force_n }));
}
function activateHooke(label) {
  const stage = state.hookeStage || 0;
  if (label === 'RECORD ZERO' && stage === 0 && state.hookeResults.length === 0) {
    state.hookeResults.push({ mass_g: 0, force_n: 0, total_length_cm: 20, extension_cm: 0, extension_m: 0, settled: true });
    syncHookeGraphPoints(); state.hookeStage = 3; state.progress = 1 / hookeForcesN.length;
    state.toast = 'Zero recorded: unloaded length 20.0 cm and extension 0.000 m. Add one 100 g slotted mass gently.';
  } else if (label === 'ADD 100 g MASS' && stage === 3 && !state.complete) {
    const nextIndex = Math.min(hookeForcesN.length - 1, state.hookeResults.length);
    state.hookeTrialIndex = nextIndex; state.hookeForceN = hookeForcesN[nextIndex]; state.hookeStage = 1; state.hookeTimer = 0; state.running = true;
    state.toast = `A 100 g slotted mass is moving from the tray to the hanger. Wait for the ${state.hookeForceN.toFixed(1)} N load to settle before reading.`;
  } else if (label === 'RECORD READING' && stage === 2) {
    const extensionCm = hookeExtensionCm(), result = { mass_g: state.hookeForceN * 100, force_n: state.hookeForceN, total_length_cm: hookeTotalLengthCm(), extension_cm: extensionCm, extension_m: +(extensionCm / 100).toFixed(3), settled: true };
    if (!state.hookeResults.some(item => item.force_n === result.force_n)) state.hookeResults.push(result);
    state.hookeResults.sort((a, b) => a.force_n - b.force_n); syncHookeGraphPoints(); state.hookeStage = 3; state.running = false; state.progress = state.hookeResults.length / hookeForcesN.length;
    state.complete = state.hookeResults.length === hookeForcesN.length;
    if (state.complete) {
      state.tab = 'graph';
      state.toast = 'Seven settled readings complete. The 0–5 N region has gradient k = 50 N m⁻¹; the 6 N point bends beyond proportionality.';
    } else state.toast = `${result.force_n.toFixed(1)} N: total length ${result.total_length_cm.toFixed(1)} cm, extension ${result.extension_cm.toFixed(1)} cm. Add the next mass.`;
  } else if (label === 'VIEW GRAPH' || label === 'GRAPH') {
    state.tab = 'graph';
    state.toast = state.complete ? 'Fit the gradient only to the straight 0–5 N region: k = 50 N m⁻¹. The final point is beyond the limit of proportionality.' : 'Record settled readings before interpreting the force–extension graph.';
  } else if (label === 'RESET SERIES') resetHookePractical();
}
function resetSpecificHeatPractical() {
  state.running = false;
  state.complete = false;
  state.time = 0;
  state.progress = 0;
  state.points = [];
  state.temp = 20;
  state.shcStage = 0;
  state.shcTimer = 0;
  state.shcEnergyJ = 0;
  state.shcTemperatureC = 20;
  state.shcResults = [];
  state.tab = 'bench';
  state.toast = `The 1.00 kg ${currentShcMaterial().label.toLowerCase()} block is cool. Add thermal paste, fit the insulation and bored lid, then insert the heater and temperature probe.`;
}
function syncSpecificHeatGraphPoints() {
  const finalRise = shcFinalTemperatureC() - 20;
  state.points = state.shcResults.map(item => ({ x: item.temperature_rise_c / finalRise, y: (item.energy_j / 1000) / 18, xValue: item.temperature_rise_c, yValue: item.energy_j / 1000 }));
}
function activateSpecificHeat(label) {
  const stage = state.shcStage || 0;
  if (label === 'PREPARE BLOCK' && stage === 0) {
    state.shcStage = 1; state.shcTimer = 0; state.running = true; state.complete = false;
    state.toast = 'Thermal paste is being applied; the cartridge heater and probe lower into separate bores before the foam jacket closes.';
  } else if (label === 'START HEATING' && stage === 2) {
    state.shcStage = 3; state.shcTimer = 0; state.shcEnergyJ = 0; state.shcTemperatureC = 20; state.temp = 20; state.shcResults = [{ time_s: 0, energy_j: 0, temperature_c: 20, temperature_rise_c: 0 }]; syncSpecificHeatGraphPoints(); state.running = true;
    state.toast = 'The 12 V low-voltage supply is on. The joulemeter and digital probe now update continuously as energy enters the insulated block.';
  } else if (label === 'CALCULATE c' && stage === 4) {
    state.shcStage = 5; state.running = false; state.complete = true; state.progress = 1; state.tab = 'graph';
    state.toast = `c = 18,000 J ÷ (1.00 kg × ${shcTemperatureRiseC().toFixed(1)} °C) = ${shcCalculatedSpecificHeat()} J kg⁻¹ °C⁻¹ for ${currentShcMaterial().label.toLowerCase()}.`;
  } else if (label.startsWith('MATERIAL:') && !state.running) {
    state.shcMaterial = state.shcMaterial === 'aluminium' ? 'copper' : 'aluminium';
    resetSpecificHeatPractical();
    lab3d.signature = '';
    state.toast = `Changed to a 1.00 kg ${currentShcMaterial().label.toLowerCase()} block. Compare its temperature rise under the same 18.0 kJ input.`;
  } else if (label === 'VIEW GRAPH' || label === 'GRAPH') {
    state.tab = 'graph';
    state.toast = state.complete ? 'The energy–temperature-rise graph has gradient mc = 0.900 kJ °C⁻¹; dividing by 1.00 kg gives c = 900 J kg⁻¹ °C⁻¹.' : 'Complete the heating run before calculating specific heat capacity.';
  } else if (label === 'RESET PRACTICAL' || label === 'RESET') resetSpecificHeatPractical();
}
function resetLatentHeatPractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = [];
  state.temp = 20; state.burner = false; state.latentStage = 0; state.latentTimer = 0; state.latentTemperatureC = 20; state.latentPhaseFraction = 0;
  state.latentHeatingResults = []; state.latentCoolingResults = []; state.tab = 'bench';
  state.toast = `${currentLatentMaterial().label} is solid at room temperature. Clamp the boiling tube in the 500 cm³ beaker water bath and position the thermometer bulb centrally in the sample.`;
}
function activateLatentHeat(label) {
  const stage = state.latentStage || 0;
  if (label === 'ASSEMBLE BATH' && stage === 0) {
    state.latentStage = 1; state.latentTimer = 0; state.running = true; state.complete = false; state.progress = 0;
    state.toast = 'The boiling tube arcs into the water bath, the upper clamp closes, and the thermometer lowers until its bulb is surrounded by the solid sample.';
  } else if (label === 'START HEATING' && stage === 2) {
    state.latentStage = 3; state.latentTimer = 0; state.running = true; state.complete = false; state.burner = true; state.time = 0; state.latentTemperatureC = 20; state.latentPhaseFraction = 0;
    state.latentHeatingResults = [{ time_s: 0, temperature_c: 20, phase: 'solid' }]; state.latentCoolingResults = []; syncLatentHeatGraphPoints();
    state.toast = 'The Bunsen changes to a blue heating flame. Temperature is logged every 40 simulated seconds as the solid warms and melts.';
  } else if (label === 'START COOLING' && stage === 4) {
    state.latentStage = 5; state.latentTimer = 0; state.running = true; state.burner = false; state.time = 0; state.latentCoolingResults = [{ time_s: 0, temperature_c: +currentLatentMaterial().highTemperatureC.toFixed(1), phase: 'liquid' }]; syncLatentHeatGraphPoints();
    state.toast = 'The gas tap closes and the flame goes out. Equal-interval logging continues while the liquid cools and freezes.';
  } else if (label.startsWith('SAMPLE:') && !state.running && stage <= 2) {
    state.latentMaterial = state.latentMaterial === 'paraffin' ? 'stearic' : 'paraffin'; resetLatentHeatPractical(); lab3d.signature = '';
    state.toast = `Changed to ${currentLatentMaterial().label.toLowerCase()} (${currentLatentMaterial().sampleForm}); its phase-change plateau is near ${currentLatentMaterial().meltingPointC} °C.`;
  } else if (label === 'VIEW CURVES' || label === 'CURVES' || label === 'GRAPH') {
    state.tab = 'graph';
    state.toast = state.complete ? `Both curves flatten near ${currentLatentMaterial().meltingPointC} °C because energy changes intermolecular bonding during the phase change rather than temperature.` : 'Complete heating and cooling to reveal both change-of-state plateaux.';
  } else if (label === 'RESET' || label === 'RESET PRACTICAL') resetLatentHeatPractical();
}
function resetWireLengthPractical() {
  state.running = false;
  state.complete = false;
  state.time = 0;
  state.progress = 0;
  state.points = [];
  state.wireStage = 0;
  state.wireTimer = 0;
  state.wireTrialIndex = 0;
  state.wireLengthCm = wireLengthsCm[0];
  state.wireVoltageV = 1.5;
  state.wireResults = [];
  state.tab = 'bench';
  state.toast = 'The fixed contact is at 0 cm and the sliding crocodile clip grips 20 cm of straight nichrome wire. Turn the power pack on briefly.';
}
function activateWireLength(label) {
  const stage = state.wireStage || 0;
  if (label === 'POWER PACK ON' && stage === 0) {
    state.wireStage = 1; state.wireTimer = 0; state.running = true; state.complete = false;
    state.toast = `The power pack turns on and both digital meters settle for the ${state.wireLengthCm} cm test length.`;
  } else if (label === 'POWER PACK OFF' && stage === 2) {
    const result = { length_cm: state.wireLengthCm, voltage_v: state.wireVoltageV, current_a: wireCurrent(), resistance_ohm: wireResistance() };
    if (!state.wireResults.some(item => item.length_cm === result.length_cm)) state.wireResults.push(result);
    state.wireResults.sort((a, b) => a.length_cm - b.length_cm);
    state.points = state.wireResults.map(item => ({ x: item.length_cm / 100, y: item.resistance_ohm / 10, xValue: item.length_cm, yValue: item.resistance_ohm }));
    state.wireStage = 3; state.running = false; state.progress = state.wireResults.length / wireLengthsCm.length;
    state.complete = state.wireResults.length === wireLengthsCm.length;
    if (state.complete) state.tab = 'graph';
    state.toast = state.complete ? 'The power pack is off. Five readings complete: resistance increases in direct proportion to the length of this uniform wire.' : `Power pack off. ${result.length_cm} cm: ${result.voltage_v.toFixed(2)} V ÷ ${result.current_a.toFixed(2)} A = ${result.resistance_ohm.toFixed(1)} Ω. Move to the next length.`;
  } else if (label === 'NEXT LENGTH' && stage === 3 && !state.complete) {
    state.wireStage = 4; state.wireTimer = 0; state.running = true;
    state.toast = 'The sliding crocodile clip opens, lifts clear of the wire and glides to the next ruler mark.';
  } else if (label === 'VIEW GRAPH' || label === 'GRAPH') {
    state.tab = 'graph';
    state.toast = 'The resistance–length graph is linear because material and cross-sectional area remained constant.';
  } else if (label === 'RESET SERIES') resetWireLengthPractical();
}
function resetIvDevicePractical() {
  state.running = false; state.complete = false; state.time = 0; state.progress = 0; state.points = []; state.tab = 'bench';
  state.ivStage = 0; state.ivTimer = 0; state.ivDeviceIndex = 0; state.ivPreviousDeviceIndex = 0; state.ivDeviceTransition = 1;
  state.ivSupplyV = 0; state.ivDeviceV = 0; state.ivCurrentA = 0; state.ivLastSampleIndex = 0; state.ivSweepReadings = []; state.ivResults = []; state.ivPulseClock = 0;
  state.toast = 'The 100 Ω resistor is seated in the test socket. Trace the red series path through the ammeter and the violet voltmeter branch across the device, then run the I–V sweep.';
}
function activateIvDevices(label) {
  if (label === 'RESET') { resetIvDevicePractical(); return }
  if (label === 'CURVES' || label === 'VIEW CURVES' || label === 'GRAPH') { state.tab = 'graph'; state.toast = state.complete ? 'Compare all three curves: linear resistor, heating filament and one-way LED conduction.' : 'Saved curves are shown as solid lines; the current unsaved sweep is shown as a dashed line.'; return }
  if (label.startsWith('DEVICE · ') && state.ivStage === 0 && !state.ivResults.length) {
    state.ivPreviousDeviceIndex = state.ivDeviceIndex; state.ivDeviceIndex = (state.ivDeviceIndex + 1) % ivDeviceDefinitions.length; state.ivDeviceTransition = 0; state.ivStage = 4; state.running = false;
    state.toast = `The ${currentIvDevice().label.toLowerCase()} enters from beyond the right edge and settles into the central test socket while the supply remains at 0 V.`; return
  }
  if (label === 'RUN I–V SWEEP' && state.ivStage === 0) {
    state.ivStage = 1; state.ivTimer = 0; state.ivLastSampleIndex = 0; state.ivSupplyV = 0; state.ivSweepReadings = [ivElectricalReading(currentIvDevice().id, 0)]; state.running = false; state.complete = false; state.tab = 'bench';
    state.toast = `Starting the ${currentIvDevice().short.toLowerCase()} sweep at 0 V. The switch closes and the power-pack dial rises in one-volt intervals.`; return
  }
  if (label === 'SAVE CURVE' && state.ivStage === 2) {
    const result = { device: currentIvDevice().id, label: currentIvDevice().label, readings: [...state.ivSweepReadings].sort((a, b) => a.voltage_v - b.voltage_v), conclusion: currentIvDevice().conclusion };
    const existing = state.ivResults.findIndex(item => item.device === result.device); if (existing >= 0) state.ivResults[existing] = result; else state.ivResults.push(result);
    state.progress = state.ivResults.length / ivDeviceDefinitions.length; state.ivStage = state.ivResults.length === ivDeviceDefinitions.length ? 5 : 3; state.complete = state.ivStage === 5; state.running = false;
    if (state.complete) state.tab = 'graph';
    state.toast = state.complete ? 'All three curves are saved. The resistor is ohmic; the hot filament and LED are non-ohmic in different ways.' : `${currentIvDevice().short} curve saved with ${result.readings.length} settled readings. Change to the next device while the supply is isolated.`; return
  }
  if (label === 'NEXT DEVICE' && state.ivStage === 3) {
    const nextIndex = ivDeviceDefinitions.findIndex(definition => !state.ivResults.some(result => result.device === definition.id));
    state.ivPreviousDeviceIndex = state.ivDeviceIndex; state.ivDeviceIndex = nextIndex < 0 ? state.ivDeviceIndex : nextIndex; state.ivDeviceTransition = 0; state.ivStage = 4; state.ivTimer = 0; state.ivSupplyV = 0; state.ivDeviceV = 0; state.ivCurrentA = 0; state.ivSweepReadings = []; state.running = false;
    state.toast = `The previous device exits to the left while the ${currentIvDevice().label.toLowerCase()} enters from beyond the right edge of the de-energised workbench.`;
  }
}
function resetFieldLinePractical() {
  state.running = false;
  state.complete = false;
  state.time = 0;
  state.progress = 0;
  state.fieldStage = 0;
  state.fieldTimer = 0;
  state.fieldConfigIndex = 0;
  state.fieldResults = [];
  state.tab = 'bench';
  state.toast = 'A single red-and-blue bar magnet is centred below clean white paper. Sprinkle a thin, even layer of simulated iron filings.';
}
function resetNuclearPractical() {
  state.running = false; state.complete = false; state.progress = 0; state.time = 0; state.tab = 'bench';
  state.nuclearStage = 0; state.nuclearTimer = 0; state.nuclearSource = 0; state.nuclearPreviousSource = 0; state.nuclearSourceTransition = 1;
  state.nuclearAbsorber = 0; state.nuclearCount = 0; state.nuclearAnimAbsorber = 0; state.nuclearAnimProgress = 1; state.nuclearResults = []; state.nuclearPulseClock = 0;
  state.toast = 'The long-handled tongs are parked visibly beside the shielded store. Select a sealed source; the lid will open slightly before pickup.';
}
function activateFieldLines(label) {
  const stage = state.fieldStage || 0, configuration = fieldConfigurations[state.fieldConfigIndex];
  if (label === 'SPRINKLE FILINGS' && stage === 0) {
    state.fieldStage = 1; state.fieldTimer = 0; state.running = true; state.complete = false;
    state.toast = 'The sealed shaker tilts and moves in overlapping passes, releasing a thin, even layer of fine iron filings.';
  } else if (label === 'TAP PAPER' && stage === 2) {
    state.fieldStage = 3; state.fieldTimer = 0; state.running = true;
    state.toast = 'The tapping tool touches the support gently. Each filing can now rotate and join a chain along the local field.';
  } else if (label === 'RECORD PATTERN' && stage === 4) {
    if (!state.fieldResults.some(item => item.id === configuration.id)) state.fieldResults.push({ ...configuration });
    state.progress = state.fieldResults.length / fieldConfigurations.length;
    if (state.fieldResults.length === fieldConfigurations.length) {
      state.complete = true; state.running = false; state.tab = 'graph';
      state.toast = 'All three field patterns are recorded: single-magnet loops, unlike-pole attraction and like-pole repulsion.';
    } else {
      state.fieldStage = 5; state.fieldTimer = 0; state.running = true;
      state.toast = 'A soft brush clears the filings while the next bar-magnet arrangement slides into place below the paper.';
    }
  } else if (label === 'VIEW PATTERNS' || label === 'PATTERNS') {
    state.tab = 'graph';
    state.toast = 'Compare filing density and curvature for the single, attraction and repulsion patterns.';
  } else if (label === 'RESET STUDY') resetFieldLinePractical();
}
function activateNuclear(label) {
  if (label === 'RESET') { resetNuclearPractical(); return }
  if (label.startsWith('SOURCE · ')) {
    if (state.running) { state.running = false; state.nuclearTimer = 0; state.nuclearCount = 0 }
    state.nuclearPreviousSource = state.nuclearSource;
    state.nuclearSource = (state.nuclearSource + 1) % nuclearSources.length;
    state.nuclearSourceTransition = 0; state.nuclearStage = 1; state.complete = false;
    const source = nuclearSources[state.nuclearSource];
    state.toast = state.nuclearSource ? `The store lid is opening slightly; the visible remote tongs will then lift the sealed ${source.isotope} ${source.symbol} source and clamp it at the fixed mark.` : 'The store lid is opening slightly so the visible remote tongs can return the source safely.';
    return
  }
  if (label.startsWith('ABSORBER · ')) {
    if (state.running) { state.running = false; state.nuclearTimer = 0; state.nuclearCount = 0 }
    state.nuclearAnimAbsorber = state.nuclearAbsorber;
    state.nuclearAbsorber = (state.nuclearAbsorber + 1) % nuclearAbsorbers.length;
    state.nuclearAnimProgress = 0; state.nuclearStage = 3; state.complete = false;
    const absorber = nuclearAbsorbers[state.nuclearAbsorber];
    state.toast = state.nuclearAbsorber ? `The labelled ${absorber.label} sheet is lifting from the rack and lowering squarely into the beam holder.` : 'The absorber is lifting clear to leave an open beam path.';
    return
  }
  if (label === 'STOP COUNT') {
    state.running = false; state.nuclearStage = state.nuclearSource ? 4 : 0;
    state.toast = 'Measurement stopped. The partial count was not saved; the displayed source and absorber remain selected.';
    return
  }
  if (label === 'MEASURE 10 s') {
    if (!state.nuclearSource) { state.toast = 'Select a sealed alpha, beta or gamma source before starting the ten-second measurement.'; return }
    if (state.nuclearSourceTransition < 1 || state.nuclearAnimProgress < 1) { state.toast = 'Wait until the source and absorber are stationary in their holders before measuring.'; return }
    state.nuclearStage = 5; state.nuclearTimer = 0; state.nuclearCount = 0; state.nuclearPulseClock = 0; state.running = true; state.complete = false;
    state.toast = `Counting ${nuclearSources[state.nuclearSource].symbol} radiation for 10.0 s with ${nuclearAbsorbers[state.nuclearAbsorber].label} in the holder.`;
  }
}
function activate(label) {
  const id = practicals[state.selected].id;
  if (id === 'starchleaf' && ['BOIL LEAF', 'BOILING…', 'MOVE TO ETHANOL', 'DECOLOURISING…', 'RINSE LEAF', 'RINSING…', 'ADD IODINE', 'ADDING IODINE…', 'RESET PRACTICAL', 'RESULT'].includes(label)) { activateStarch(label); draw(); return }
  if (id === 'lipase' && ['ADD LIPASE', 'ADDING LIPASE…', 'REACTION RUNNING…', 'NEXT TEMPERATURE', 'VIEW GRAPH', 'RESET SERIES', 'GRAPH', 'HEATING BATH…'].includes(label)) { activateLipase(label); draw(); return }
  if (id === 'transformation' && ['LABEL CONTROLS', 'LABELLING…', 'ADD CELLS + DNA', 'PIPETTING…', 'ICE + HEAT SHOCK', 'HEAT SHOCK…', 'ADD LB + RECOVER', 'RECOVERING…', 'PLATE CELLS', 'SPREADING…', 'INCUBATE PLATES', 'INCUBATING…', 'VIEW RESULTS', 'PLATES', 'RESET'].includes(label)) { activateTransformation(label); draw(); return }
  if (id === 'respiration' && ['ADD GLUCOSE', 'ADDING GLUCOSE…', 'ADD YEAST', 'POURING YEAST…', 'FIT BALLOONS', 'FITTING BALLOONS…', 'START 10 MIN RUN', 'INCUBATING…', 'RECORD RESULTS', 'VIEW GRAPH', 'RESET PRACTICAL', 'GRAPH'].includes(label)) { activateRespiration(label); draw(); return }
  if (id === 'antibiotics' && ['PREPARE ASEPTICALLY', 'DISINFECTING…', 'INOCULATE AGAR', 'SPREADING CULTURE…', 'PLACE DISCS', 'PLACING DISCS…', 'SEAL + INCUBATE', 'INCUBATING 25 °C…', 'MEASURE ZONES', 'MEASURING ZONES…', 'VIEW RESULTS', 'RESULTS', 'RESET PRACTICAL', 'RESET'].includes(label)) { activateAntibiotics(label); draw(); return }
  if (id === 'osmosis' && ['LOWER CHIP', 'TRANSFERRING…', 'SOAKING…', 'REMOVE & BLOT', 'BLOTTING…', 'REWEIGH CHIP', 'REWEIGHING…', 'NEXT CONCENTRATION', 'VIEW GRAPH', 'RESET SERIES', 'GRAPH'].includes(label)) { activateOsmosis(label); draw(); return }
  if (id === 'agardiffusion' && ['MEASURE CUBES', 'MEASURING…', 'LOWER INTO ACID', 'LOWERING…', 'START 10 MIN SOAK', 'DIFFUSING…', 'REMOVE & BLOT', 'BLOTTING…', 'CUT CUBES', 'CUTTING + REVEALING…', 'RECORD RESULTS', 'VIEW GRAPH', 'RESET PRACTICAL', 'RESET', 'GRAPH'].includes(label)) { activateAgarDiffusion(label); draw(); return }
  if (id === 'potometer' && ['INTRODUCE BUBBLE', 'INTRODUCING…', 'ALIGN TO ZERO', 'ALIGNING…', 'START 5 MIN RUN', 'MEASURING…', 'NEXT WIND SPEED', 'VIEW GRAPH', 'RESET SERIES', 'GRAPH'].includes(label)) { activatePotometer(label); draw(); return }
  if (id === 'pondweed' && ['- 10cm', '+ 10cm', 'LAMP ON', 'LAMP OFF', 'COUNT 1 MIN', 'RESET PRACTICAL', 'METHOD', 'RESULTS', 'GRAPH'].includes(label)) { activatePondweed(label); draw(); return }
  if (id === 'quadrats' && ['LAY GRID TAPES', 'MEASURING…', 'GENERATE POINT', 'RANDOMISING…', 'PLACE QUADRAT', 'QUADRAT FALLING…', 'COUNT DAISIES', 'COUNTING…', 'RECORD SAMPLE', 'NEXT SAMPLE', 'VIEW RESULTS', 'RESET STUDY', 'RESULTS'].includes(label)) { activateQuadrat(label); draw(); return }
  if (id === 'capture' && ['SET TRAPS', 'SETTING + CAPTURING…', 'FIRST CAPTURE', 'COUNTING + MARKING…', 'RELEASE & WAIT', 'RELEASING + MIXING…', 'SECOND CAPTURE', 'RECAPTURE COUNT…', 'RECORD', 'VIEW RESULTS', 'RESET STUDY', 'RESET', 'RESULTS', 'DATA'].includes(label)) { activateCapture(label); draw(); return }
  if (id === 'shoretransect' && ['LAY TRANSECT', 'EXTENDING TAPE…', 'MOVE QUADRAT', 'MOVING QUADRAT…', 'SURVEY QUADRAT', 'IDENTIFYING…', 'RECORD SAMPLE', 'NEXT POSITION', 'VIEW ZONATION', 'RESET TRANSECT', 'ZONATION'].includes(label)) { activateShoreTransect(label); draw(); return }
  if (id === 'ripple' && ['LEVEL TANK', 'LEVELLING…', 'START VIBRATOR', 'WAVES FORMING…', 'MEASURE 10 WAVES', 'STROBE + RULER…', 'RECORD SPEED', 'NEXT FREQUENCY', 'VIEW RESULTS', 'RESET SERIES', 'RESULTS'].includes(label)) { activateRipple(label); draw(); return }
  if (id === 'newton2' && ['FORCE -0.1N', 'FORCE +0.1N', 'RELEASE TROLLEY', 'RESET TROLLEY', 'RESET PRACTICAL', 'METHOD', 'RESULTS', 'GRAPH'].includes(label)) { activateNewton2(label); draw(); return }
  if (id === 'electromagnet' && ['CLOSE SWITCH', 'ENERGISING…', 'LOWER CORE', 'LOWERING…', 'LIFT CORE', 'LIFTING…', 'RECORD COUNT', 'NEXT COIL', 'VIEW GRAPH', 'RESET SERIES', 'GRAPH'].includes(label)) { activateElectromagnet(label); draw(); return }
  if (id === 'convection' && ['ADD TRACER', 'ADDING TRACER…', 'LIGHT BUNSEN', 'CONVECTION ACTIVE…', 'OBSERVATION', 'RESET DEMO'].includes(label)) { activateConvection(label); draw(); return }
  if (id === 'conduction' && ['LIGHT BUNSEN', 'HEATING RODS…', 'RESULTS', 'RESET DEMO', 'RESET PRACTICAL'].includes(label)) { activateConduction(label); draw(); return }
  if (id === 'thermal' && ['ADD HOT WATER', 'POURING WATER…', 'PICK UP CAMERA', 'CAMERA MOVING…', 'CAPTURE IMAGE', 'THERMAL VIEW', 'RESET DEMO', 'RESET PRACTICAL'].includes(label)) { activateThermal(label); draw(); return }
  if (id === 'density' && ['WEIGH OBJECT', 'FILL EUREKA CAN', 'LOWER OBJECT', 'RECORD DENSITY', 'CHANGE SAMPLE', 'RESET PRACTICAL', 'METHOD', 'RESULTS', 'GRAPH'].includes(label)) { activateDensity(label); draw(); return }
  if (id === 'hooke' && ['RECORD ZERO', 'ADDING + SETTLING…', 'RECORD READING', 'ADD 100 g MASS', 'VIEW GRAPH', 'RESET SERIES', 'GRAPH'].includes(label)) { activateHooke(label); draw(); return }
  if (id === 'specificheat' && (label.startsWith('MATERIAL:') || ['PREPARE BLOCK', 'INSERTING + INSULATING…', 'START HEATING', 'HEATING…', 'CALCULATE c', 'VIEW GRAPH', 'RESET PRACTICAL', 'RESET', 'GRAPH'].includes(label))) { activateSpecificHeat(label); draw(); return }
  if (id === 'latentheat' && (label.startsWith('SAMPLE:') || ['ASSEMBLE BATH', 'ASSEMBLING…', 'START HEATING', 'HEATING + LOGGING…', 'START COOLING', 'COOLING + LOGGING…', 'VIEW CURVES', 'CURVES', 'RESET', 'RESET PRACTICAL', 'GRAPH'].includes(label))) { activateLatentHeat(label); draw(); return }
  if (id === 'wirelength' && ['POWER PACK ON', 'POWER PACK STARTING…', 'POWER PACK OFF', 'NEXT LENGTH', 'MOVING CONTACT…', 'VIEW GRAPH', 'RESET SERIES', 'GRAPH'].includes(label)) { activateWireLength(label); draw(); return }
  if (id === 'ivdevices' && (label.startsWith('DEVICE · ') || ['RUN I–V SWEEP', 'SWEEP RUNNING…', 'SAVE CURVE', 'NEXT DEVICE', 'CHANGING DEVICE…', 'VIEW CURVES', 'CURVES', 'GRAPH', 'RESET'].includes(label))) { activateIvDevices(label); draw(); return }
  if (id === 'nuclear' && (label.startsWith('SOURCE · ') || label.startsWith('ABSORBER · ') || ['MEASURE 10 s', 'STOP COUNT', 'RESET'].includes(label))) { activateNuclear(label); draw(); return }
  if (id === 'fieldlines' && ['SPRINKLE FILINGS', 'SPRINKLING…', 'TAP PAPER', 'FILINGS ALIGNING…', 'RECORD PATTERN', 'CHANGING MAGNETS…', 'VIEW PATTERNS', 'RESET STUDY', 'PATTERNS'].includes(label)) { activateFieldLines(label); draw(); return }
  if (id === 'rates' && ['MOVE TO CROSS', 'MOVING FLASK…', 'ADD HCl', 'REACTION RUNNING…', 'NEXT TEMPERATURE', 'VIEW GRAPH', 'RESET SERIES', "BIRD'S EYE", 'HEATING BATH…'].includes(label)) { activateRates(label); draw(); return }
  if (id === 'titration' && ['ADD INDICATOR', 'OPEN TAP', 'TAP OPEN…', 'ADD ONE DROP', 'RECORD TITRE', 'RESET PRACTICAL', 'RESULTS'].includes(label)) { activateTitration(label); draw(); return }
  if (id === 'water' && ['WATER ON', 'WATER OFF', 'HEATER ON', 'HEATER OFF', 'RECORD'].includes(label)) { activateWater(label); draw(); return }
  if (id === 'electro' && ['SWITCH ON', 'RESET', 'RECORD MASSES', 'RESULTS'].includes(label)) { activateElectro(label); draw(); return }
  if (id === 'flame' && ['SCOOP SALT', 'SCOOPING…', 'ENTER BLUE FLAME', 'TESTING…', 'NEXT SALT', 'RESET SERIES', 'SPECTRA'].includes(label)) { activateFlameTest(label); draw(); return }
  if (id === 'displacement' && ['LOWER METALS', 'REACTIONS RUNNING…', 'RECORD RESULTS', 'RESET SERIES', 'RESULTS'].includes(label)) { activateDisplacement(label); draw(); return }
  if (id === 'salts' && ['POUR CuO', 'FILTER MIXTURE', 'HEAT SOLUTION', 'COOL & CRYSTALLISE', 'RESET PRACTICAL'].includes(label)) { activateSalts(label); draw(); return }
  if (id === 'mass' && ['MOVE TO TRIPOD', 'TRANSFERRING…', 'REMOVE LID', 'LIGHT BUNSEN', 'HEATING…', 'COOL & REWEIGH', 'REWEIGHING…', 'RESET PRACTICAL', 'RECORD BEFORE', 'INITIAL MASS SAVED', 'LID CLOSED', 'READY TO HEAT', 'MAGNESIUM BURNING', 'MgO FORMED', 'BALANCE SETTLING', 'RECORD AFTER', 'RESULTS'].includes(label)) { activateMass(label); draw(); return }
  if (id === 'hydrogen' && ['POUR DILUTE HCl', 'POURING…', 'COLLECTING H₂…', 'TEST WITH LIT SPLINT', 'IGNITING…', 'RESET PRACTICAL', 'Mg RIBBON READY', 'ACID TRANSFER', 'THUMB SEALED', 'H₂ COLLECTED', 'SQUEAKY POP!', 'TEST COMPLETE', 'RECORD'].includes(label)) { activateHydrogen(label); draw(); return }
  if (label === 'EQUIPMENT') state.tab = 'equipment';
  else if (label === 'SHELF') state.tab = 'reactants';
  else if (label === 'CLEAR BENCH') { state.workspace = []; state.dose = null; state.ph = 7; state.toast = 'Bench cleared. Choose new equipment from the library.' }
  else if (label === 'UNDO LAST') { state.workspace.pop(); refreshWorkspacePh(); state.toast = state.workspace.length ? 'Last item removed.' : 'The workspace is blank.' }
  else if (label === 'START' && id === 'temp') startAcidPour();
  else if (label === 'RESET' && id === 'temp') { state.running = false; state.complete = false; state.pour = null; state.transferred = 0; state.time = 0; state.progress = 0; state.points = []; state.temp = 25; state.ph = 13; state.toast = 'Apparatus reset — ready to start the acid transfer again.' }
  else if (label === 'START' || label === 'RESET') { state.running = !state.running; state.time = 0; state.progress = 0; state.complete = false; state.points = []; if (id === 'chrom') state.chromSelectedDye = null; state.toast = state.running ? 'Experiment started — observe the apparatus.' : 'Apparatus reset and ready.' }
  else if (label === 'LIGHT BUNSEN' || label === 'EXTINGUISH') { state.burner = !state.burner; state.running = state.burner; state.toast = state.burner ? 'Bunsen lit: roaring blue flame, air hole open.' : 'Gas tap closed and flame extinguished.' }
  else if (label === 'APPLY HEAT') { state.burner = true; state.running = true; state.toast = 'Heating applied — observe the live measurement.' }
  else if (label === 'ADD REAGENT') { if (id === 'rates' || id === 'temp') startAcidPour(); else { state.running = true; state.toast = 'Reagent added — observe the reaction.'; state.progress = Math.max(.08, state.progress) } }
  else if (label === 'RECORD') { state.points.push(graphReading()); state.toast = id === 'chrom' ? 'Chromatography measurement recorded.' : 'Reading added to the results graph.' }
  else if (label === 'METHOD') state.tab = 'bench';
  else if (label === 'GRAPH' || label === 'RESULTS' || label === 'MEASURE' || label === 'VIEW RESULTS' || label === 'SPECTRA') state.tab = 'graph';
  else if (label === "BIRD'S EYE") state.tab = 'birdseye';
  draw()
}
const baseActivate = activate;
activate = label => {
  if (practicals[state.selected].id === 'thermite' && ['IGNITE FUSE', 'REACTION ACTIVE', 'RESET PRACTICAL', 'GRAPH'].includes(label)) {
    activateThermite(label); draw(); return
  }
  baseActivate(label)
};
const co2AwareActivate = activate;
activate = label => {
  if (practicals[state.selected].id === 'co2' && label === 'RECORD') {
    state.points.push(graphReading()); state.tab = 'birdseye'; state.toast = `Observation recorded: limewater turbidity ${Math.round(state.progress * 100)}%.`; draw(); return
  }
  co2AwareActivate(label)
};
const alkaliAwareActivate = activate;
activate = label => {
  if (practicals[state.selected].id === 'alkali' && ['LOWER METAL', 'LOWERING…', 'REACTION RUNNING…', 'RECORD OBSERVATION', 'NEXT METAL', 'VIEW RESULTS', 'RESET SERIES', 'RESULTS'].includes(label)) {
    activateAlkali(label); draw(); return
  }
  alkaliAwareActivate(label)
};
function pointerPosition(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / UI_SCALE, y: (e.clientY - rect.top) / UI_SCALE }
}
canvas.addEventListener('wheel', e => {
  const point = pointerPosition(e);
  if (point.x < 0 || point.x > 270 || point.y < 64) return;
  if (sidebarScrollBy(e.deltaY / Math.max(.001, UI_SCALE))) {
    e.preventDefault();
    draw();
  }
}, { passive: false });
function regionAtPoint(point) {
  const exact = regions.findLast(a => point.x >= a.x && point.x <= a.x + a.w && point.y >= a.y && point.y <= a.y + a.h);
  if (exact || UI_SCALE >= 1) return exact;
  const minimumLogicalTarget = 44 / UI_SCALE;
  return regions
    .map((region, index) => {
      const padX = Math.max(0, minimumLogicalTarget - region.w) / 2, padY = Math.max(0, minimumLogicalTarget - region.h) / 2;
      const inside = point.x >= region.x - padX && point.x <= region.x + region.w + padX && point.y >= region.y - padY && point.y <= region.y + region.h + padY;
      const centreX = region.x + region.w / 2, centreY = region.y + region.h / 2;
      return inside ? { region, index, distance: Math.hypot(point.x - centreX, point.y - centreY) } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance || b.index - a.index)[0]?.region
}
canvas.addEventListener('pointerdown', e => { const r = regionAtPoint(pointerPosition(e)); if (r?.id === 'practical' && practicals[r.data]?.id === 'displacement') resetDisplacementPractical() }, { capture: true });
canvas.addEventListener('pointermove', e => {
  const point = pointerPosition(e);
  if (state.drag) {
    const moved = Math.hypot(point.x - state.drag.startX, point.y - state.drag.startY) > 7;
    state.drag.moved = state.drag.moved || moved;
    state.drag.x = point.x;
    state.drag.y = point.y;
    if (state.drag.kind === 'workspace') {
      const it = state.workspace.find(a => a.uid === state.drag.uid);
      if (it) {
        if (state.drag.moved && isHeatVessel(it) && it.snappedTo) { const anchor = workspaceScreenAnchor(it); it.snappedTo = null; it.x = anchor.x; it.y = anchor.y }
        if (state.drag.moved && it.type === 'phmeter' && it.attachedTo) { const anchor = workspaceScreenAnchor(it); it.attachedTo = null; it.x = anchor.x; it.y = anchor.y }
        positionWorkspaceItem(it, point.x, point.y, state.drag.dx, state.drag.dy);
        state.drag.snapUid = isHeatVessel(it) ? nearestTripodForBeaker(it)?.tripod.uid || null : null;
        state.drag.phTargetUid = it.type === 'phmeter' ? nearestPhVessel(it, 170)?.target.uid || null : null
      }
    } else if (state.drag.kind === 'free-reactant') {
      const target = containerItems().map(it => { const anchor = workspaceScreenAnchor(it); return { it, d: Math.hypot(point.x - anchor.x, point.y - anchor.y) } }).sort((a, b) => a.d - b.d)[0];
      state.drag.targetUid = target && target.d < 92 ? target.it.uid : null
    } else if (state.drag.kind === 'dose-slider' && state.dose) {
      const r = reactantShelf.find(a => a.id === state.dose.reactantId), ratio = Math.max(0, Math.min(1, (point.x - state.drag.sliderX) / state.drag.sliderW));
      state.dose.amount = Math.max(r.step, Math.round((ratio * r.max) / r.step) * r.step)
    } else if (state.drag.kind === 'HCl(aq)' && state.layout && Math.hypot(point.x - state.layout.target.x, point.y - state.layout.target.y) < 190) state.drag.nearTarget = true;
    canvas.style.cursor = 'grabbing'; draw(); return
  }
  const r = regionAtPoint(point);
  canvas.style.cursor = r && ['palette', 'free-reactant', 'reagent', 'workspace-item', 'dose-slider'].includes(r.id) ? 'grab' : r ? 'pointer' : 'default'
});
canvas.addEventListener('pointerdown', e => {
  const point = pointerPosition(e), r = regionAtPoint(point);
  if (!r) return;
  if (state.assessmentMode && assessment.handleAssessmentPointerDown(r, point, state, practicals, draw)) return;
  if (r.id === 'toggle-assessment-mode') {
    state.assessmentMode = !state.assessmentMode;
    if (state.assessmentMode) {
      state.graphModal = false;
      state.evaluationModal = false;
      state.reactantSafety = null;
      state.hookeFocusModal = false;
      const p = practicals[state.selected] || practicals[0];
      state.assessmentSession = assessment.createAssessmentSession(p);
    }
    draw();
    return;
  } else if (r.id === 'start-practical-assessment') {
    state.assessmentMode = true;
    state.evaluationModal = false;
    state.graphModal = false;
    state.reactantSafety = null;
    state.hookeFocusModal = false;
    const p = practicals[state.selected] || practicals[0];
    state.assessmentSession = assessment.createAssessmentSession(p);
    draw();
    return;
  }
  if (r.id === 'subject-tab') {
    state.subject = r.data;
    state.methodStepSelection = null;
    state.graphModal = false;
    state.reactantSafety = null;
    state.hookeFocusModal = false;
    state.hookeFocusProgress = 0;
    const visible = practicals.map((p, i) => ({ ...p, originalIndex: i })).filter(p => (p.subject || 'chemistry') === state.subject);
    if (visible.length > 0 && !visible.some(p => p.originalIndex === state.selected)) {
      state.selected = visible[0].originalIndex;
      state.running = false;
      state.complete = false;
      state.progress = 0;
      state.points = [];
      state.tab = practicals[state.selected].id === 'free' ? 'equipment' : 'bench';
      state.toast = `${practicals[state.selected].title} loaded.`;
      if (practicals[state.selected].id === 'starchleaf') resetStarchPractical();
      else if (practicals[state.selected].id === 'lipase') resetLipasePractical();
      else if (practicals[state.selected].id === 'transformation') resetTransformationPractical();
      else if (practicals[state.selected].id === 'respiration') resetRespirationPractical();
      else if (practicals[state.selected].id === 'antibiotics') resetAntibioticPractical();
      else if (practicals[state.selected].id === 'osmosis') resetOsmosisPractical();
      else if (practicals[state.selected].id === 'agardiffusion') resetAgarDiffusionPractical();
      else if (practicals[state.selected].id === 'potometer') resetPotometerPractical();
      else if (practicals[state.selected].id === 'quadrats') resetQuadratPractical();
      else if (practicals[state.selected].id === 'capture') resetCapturePractical();
      else if (practicals[state.selected].id === 'shoretransect') resetShoreTransectPractical();
      else if (practicals[state.selected].id === 'ripple') resetRipplePractical();
    }
    draw();
  } else if (r.id === 'dose-add') { applyDose(); draw() }
  else if (r.id === 'dose-cancel') { state.dose = null; state.toast = 'Dose cancelled.'; draw() }
  else if (r.id === 'dose-slider') { const reagent = reactantShelf.find(a => a.id === state.dose?.reactantId), ratio = Math.max(0, Math.min(1, (point.x - r.data.x) / r.data.w)); if (reagent) state.dose.amount = Math.max(reagent.step, Math.round((ratio * reagent.max) / reagent.step) * reagent.step); state.drag = { kind: 'dose-slider', x: point.x, y: point.y, startX: point.x, startY: point.y, sliderX: r.data.x, sliderW: r.data.w, moved: false }; canvas.setPointerCapture?.(e.pointerId); draw() }
  else if (r.id === 'practical') {
    state.selected = r.data; state.running = false; state.complete = false; state.progress = 0; state.points = [];
    state.methodStepSelection = null;
    state.temp = practicals[r.data].id === 'free' ? 20 : 25; state.volume = 0; state.ph = 7; state.burner = false; state.coolingWater = false; state.transferred = 0;
    state.pour = null; state.drag = null; state.dose = null; state.graphModal = false; state.reactantSafety = null; state.hookeFocusModal = false; state.hookeFocusProgress = 0; state.lastReactant = null; state.particles = []; state.chromSelectedDye = null; state.electroRecorded = false;
    state.tab = practicals[r.data].id === 'free' ? 'equipment' : 'bench';
    const selectedId = practicals[r.data].id;
    if (selectedId === 'rates') resetRatesPractical(); else if (selectedId === 'mass') resetMassPractical(); else if (selectedId === 'hydrogen') resetHydrogenPractical(); else if (selectedId === 'electro') resetElectroPractical(); else if (selectedId === 'titration') resetTitrationPractical(); else if (selectedId === 'thermite') resetThermitePractical(); else if (selectedId === 'starchleaf') resetStarchPractical(); else if (selectedId === 'lipase') resetLipasePractical(); else if (selectedId === 'transformation') resetTransformationPractical(); else if (selectedId === 'respiration') resetRespirationPractical(); else if (selectedId === 'antibiotics') resetAntibioticPractical(); else if (selectedId === 'osmosis') resetOsmosisPractical(); else if (selectedId === 'agardiffusion') resetAgarDiffusionPractical(); else if (selectedId === 'potometer') resetPotometerPractical(); else if (selectedId === 'quadrats') resetQuadratPractical(); else if (selectedId === 'capture') resetCapturePractical(); else if (selectedId === 'shoretransect') resetShoreTransectPractical(); else if (selectedId === 'ripple') resetRipplePractical(); else if (selectedId === 'electromagnet') resetElectromagnetPractical(); else if (selectedId === 'convection') resetConvectionPractical(); else if (selectedId === 'conduction') resetConductionPractical(); else if (selectedId === 'thermal') resetThermalPractical(); else if (selectedId === 'density') resetDensityPractical(); else if (selectedId === 'hooke') resetHookePractical(); else if (selectedId === 'specificheat') resetSpecificHeatPractical(); else if (selectedId === 'latentheat') resetLatentHeatPractical(); else if (selectedId === 'wirelength') resetWireLengthPractical(); else if (selectedId === 'ivdevices') resetIvDevicePractical(); else if (selectedId === 'fieldlines') resetFieldLinePractical(); else if (selectedId === 'nuclear') resetNuclearPractical(); else state.toast = selectedId === 'free' ? 'Click equipment to add it, or drag it onto the bench.' : selectedId === 'water' ? 'Glassware assembled. Start the cooling water before switching on the electric heating mantle.' : `${practicals[r.data].gear.join(', ')} loaded onto the bench.`;
    draw()
  }
  else if (r.id === 'crucible-lid') { state.methodStepSelection = null; removeMassLid(); draw() }
  else if (r.id === 'chrom-dye') { state.chromSelectedDye = r.data; const pigment = chromPigments.find(d => d.id === r.data); state.toast = `${pigment?.label || 'Pigment'} selected — measure from the graphite baseline.`; draw() }
  else if (r.id === 'button') { state.methodStepSelection = null; activate(r.data); }
  else if (r.id === 'palette') { state.drag = { kind: 'palette', type: r.data, x: point.x, y: point.y, startX: point.x, startY: point.y, moved: false }; canvas.setPointerCapture?.(e.pointerId); draw() }
  else if (r.id === 'free-reactant') { state.drag = { kind: 'free-reactant', reactantId: r.data, x: point.x, y: point.y, startX: point.x, startY: point.y, moved: false, targetUid: null }; canvas.setPointerCapture?.(e.pointerId); draw() }
  else if (r.id === 'guided-reactant-safety') { state.drag = null; state.graphModal = false; state.evaluationModal = false; state.reactantSafety = guidedReactantSafety(r.data.name, r.data.practicalId); draw() }
  else if (r.id === 'open-hooke-focus-modal') { state.drag = null; state.graphModal = false; state.evaluationModal = false; state.reactantSafety = null; state.hookeFocusModal = true; state.hookeFocusProgress = 0; draw() }
  else if (r.id === 'workspace-item') { const it = state.workspace.find(a => a.uid === r.data); if (it) { const anchor = workspaceScreenAnchor(it); state.drag = { kind: 'workspace', uid: it.uid, x: point.x, y: point.y, startX: point.x, startY: point.y, dx: point.x - anchor.x, dy: point.y - anchor.y, moved: false, snapUid: null, phTargetUid: null, origin: { x: it.x, y: it.y, snappedTo: it.snappedTo || null, attachedTo: it.attachedTo || null } }; canvas.setPointerCapture?.(e.pointerId) } }
  else if (r.id === 'practical-evaluation') { state.graphModal = false; state.evaluationModal = true; draw(); }
  else if (r.id === 'close-evaluation-modal') { state.evaluationModal = false; draw(); }
  else if (r.id === 'open-graph-modal') { state.evaluationModal = false; state.graphModal = true; draw(); }
  else if (r.id === 'close-graph-modal') { state.graphModal = false; draw(); }
  else if (r.id === 'graph-modal-body') return;
  else if (r.id === 'close-reactant-safety-modal') { state.reactantSafety = null; draw(); }
  else if (r.id === 'reactant-safety-modal-body') return;
  else if (r.id === 'close-hooke-focus-modal') { state.hookeFocusModal = false; state.hookeFocusProgress = 0; draw(); }
  else if (r.id === 'hooke-focus-modal-body') return;
  else if (r.id === 'toggle-focus-mode') { state.focusMode = !state.focusMode; state.methodDropdown = false; draw(); }
  else if (r.id === 'toggle-method-dropdown') { state.methodDropdown = !state.methodDropdown; draw(); }
  else if (r.id === 'method-step') seekMethodStep(r.data?.index);
  else if (r.id === 'method-dropdown-body') return;
  else if (r.id === 'reagent' && !state.pour) { state.drag = { kind: 'HCl(aq)', x: point.x, y: point.y, startX: point.x, startY: point.y }; canvas.setPointerCapture?.(e.pointerId); state.toast = 'Move the flask close to the receiver, then release.'; draw() }
});
canvas.addEventListener('pointerdown', e => { const r = regionAtPoint(pointerPosition(e)); if (r?.id === 'practical' && practicals[r.data]?.id === 'flame') { resetFlameTestPractical(); draw() } else if (r?.id === 'flame-spectrum' && practicals[state.selected].id === 'flame' && !state.running) { state.flameTestSalt = r.data; state.flameTestStage = 0; state.flameTestTimer = 0; state.tab = 'bench'; state.toast = `${flameTestSalts[r.data].salt} selected from the spectrum. Scoop it with the clean spatula.`; draw() } });
canvas.addEventListener('pointerdown', e => { const r = regionAtPoint(pointerPosition(e)); if (r?.id === 'practical' && practicals[r.data]?.id === 'alkali') { resetAlkaliPractical(); draw() } });
canvas.addEventListener('pointerup', e => {
  if (!state.drag) return;
  const d = state.drag, point = pointerPosition(e);
  if (d.kind === 'palette') {
    const R = Math.max(260, Math.min(330, W * .23)), inside = point.x > 285 && point.x < W - R && point.y > 205 && point.y < H - 120;
    addWorkspaceItem(d.type, d.moved && inside ? point.x : null, d.moved && inside ? point.y : null)
  } else if (d.kind === 'workspace') {
    const it = state.workspace.find(a => a.uid === d.uid), releaseMoved = d.moved || Math.hypot(point.x - d.startX, point.y - d.startY) > 7;
    if (it && releaseMoved) {
      positionWorkspaceItem(it, point.x, point.y, d.dx, d.dy);
      const snap = d.snapUid && state.workspace.find(a => a.uid === d.snapUid && a.type === 'tripod'), phTarget = d.phTargetUid && state.workspace.find(a => a.uid === d.phTargetUid && isPhVessel(a)) || (it.type === 'phmeter' ? nearestPhVessel(it)?.target : null);
      if (isHeatVessel(it) && snap) snapBeakerToTripod(it, snap);
      else if (it.type === 'phmeter' && phTarget) { dockPhMeter(it, phTarget); state.toast = `pH meter positioned in the ${phTarget.type === 'tube' ? 'test tube' : 'beaker'} — live reading ${Number.isFinite(phTarget.ph) ? phTarget.ph.toFixed(2) : '– –'}.` }
      else state.toast = it.type === 'phmeter' ? 'Add a beaker or test tube and the pH meter will position itself automatically.' : 'Equipment repositioned.';
      refreshWorkspacePh()
    } else if (it && it.type === 'bunsen') {
      it.lit = !it.lit;
      state.toast = it.lit ? (workspaceHeatLinks().length ? 'Gas valve open — Bunsen lit and heating the beaker contents.' : 'Gas valve open — Bunsen lit. Place it below a loaded tripod to heat.') : 'Gas valve closed — Bunsen extinguished.'
    } else state.toast = 'Equipment selected.'
  } else if (d.kind === 'free-reactant') {
    const targetUid = d.targetUid || (!d.moved ? containerItems()[0]?.uid : null);
    if (targetUid) openDose(d.reactantId, targetUid);
    else state.toast = 'Add a flask, beaker or test tube, then drop the reactant onto it.'
  } else if (d.kind === 'HCl(aq)') {
    const near = d.nearTarget || (state.layout && Math.hypot(d.x - state.layout.target.x, d.y - state.layout.target.y) < 190);
    if (near) startAcidPour();
    else state.toast = 'Move closer to the highlighted receiving flask.'
  }
  state.drag = null;
  draw()
});
canvas.addEventListener('pointercancel', () => { if (!state.drag) return; if (state.drag.kind === 'workspace') { const it = state.workspace.find(a => a.uid === state.drag.uid); if (it && state.drag.origin) Object.assign(it, state.drag.origin) } state.toast = 'Interaction cancelled.'; state.drag = null; draw() });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (state.graphModal || state.evaluationModal || state.reactantSafety || state.hookeFocusModal) {
      state.graphModal = false;
      state.evaluationModal = false;
      state.reactantSafety = null;
      state.hookeFocusModal = false;
      state.hookeFocusProgress = 0;
      e.preventDefault();
      draw();
      return;
    }
    if (state.methodDropdown) {
      state.methodDropdown = false;
      e.preventDefault();
      draw();
      return;
    }
    if (state.focusMode) {
      state.focusMode = false;
      e.preventDefault();
      draw();
      return;
    }
  }
  if (e.key.toLowerCase() === 'f') document.fullscreenElement ? document.exitFullscreen() : document.querySelector('main')?.requestFullscreen();
  if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
});
function update(dt, skipDraw = false) {
  state.flamePhase += dt * 3.4;
  const id = practicals[state.selected].id, free = id === 'free', heatLinks = free ? workspaceHeatLinks() : [], heated = new Set(heatLinks.map(link => link.beaker.uid)), reactionAnimating = free && state.reaction && !state.reaction.complete;
  const bunsenTransitionFrame = lab3d.advanceBunsenLoad(dt);
  if (free) { let hottest = 20; for (const it of state.workspace) { if (it.type !== 'beaker') continue; it.temperature ??= 20; it.heating = heated.has(it.uid); it.temperature = it.heating ? Math.min(100, it.temperature + dt * 6.5) : Math.max(20, it.temperature - dt * 1.35); hottest = Math.max(hottest, it.temperature) } state.temp = hottest; if (reactionAnimating) updateWorkspaceReaction(dt); else refreshWorkspacePh() }
  let animating = state.running || state.burner || state.coolingWater || state.electroWeighing || bunsenTransitionFrame || lab3d.isTransitioning || state.pour || state.drag || state.massTransfer || reactionAnimating || state.workspace.some(it => it.type === 'bunsen' && it.lit) || heatLinks.length || state.workspace.some(it => it.type === 'beaker' && (it.temperature || 20) > 20.05), activePour = !!state.pour;
  if (state.pour) { state.pour.t += dt; if (id !== 'rates') state.time += dt; const receiverName = id === 'temp' ? 'NaOH(aq)' : 'sodium thiosulfate', raw = Math.max(0, Math.min(1, (state.pour.t - 1.1) / 1.25)), transferQ = raw * raw * (3 - 2 * raw); state.transferred = Math.max(state.transferred, transferQ); state.progress = Math.max(state.progress, .04 + .16 * transferQ); if (id === 'temp') { state.temp = 25 + 17 * Math.sin(state.progress * Math.PI / 2); state.ph = Math.max(1, 13 - 12 * state.progress) } else if (id === 'rates') state.temp = state.ratesTargetTemp; state.toast = state.pour.t < .9 ? 'Lifting the HCl(aq) flask towards the receiving flask.' : state.pour.t < 1.1 ? 'Tilting the HCl(aq) flask above the receiver.' : state.pour.t < 2.5 ? `Pouring HCl(aq) into the ${receiverName} flask.` : state.pour.t < 2.78 ? 'Uprighting the empty HCl(aq) flask.' : 'Returning the HCl(aq) flask to the bench.'; if (raw > 0 && raw < 1 && state.layout && Math.random() < dt * 25) state.particles.push({ x: state.layout.target.x + (Math.random() - .5) * 55, y: state.layout.target.y + 25 - Math.random() * 18, r: 2 + Math.random() * 3, life: 1, color: 'rgba(234,251,255,.9)', vy: -14 - Math.random() * 20 }); if (state.pour.t > 3.6) { state.pour = null; if (id === 'rates') { state.ratesStageTimer = 0; state.time = 0; state.progress = 0; state.toast = 'Acid mixed. The timer is running — watch the cross fade as sulfur precipitate forms.' } else state.toast = `Transfer complete — HCl(aq) has mixed with the ${receiverName}.` } }
  state.particles.forEach(pt => { pt.y += (pt.vy || -9) * dt; pt.x += Math.sin(state.flamePhase + pt.y) * dt * 4; pt.life -= dt * .62 }); state.particles = state.particles.filter(pt => pt.life > 0);
  if (activePour) { if (!skipDraw) draw(); return }
  if (id === 'rates') {
    let ratesChanged = false;
    state.temp = state.ratesBathTemp;
    if (state.ratesConditioning) { state.ratesBathTemp = Math.min(state.ratesTargetTemp, state.ratesBathTemp + dt * 7.5); state.temp = state.ratesBathTemp; state.ratesStageTimer += dt; if (state.ratesBathTemp >= state.ratesTargetTemp - .01) { state.ratesBathTemp = state.ratesTargetTemp; state.temp = state.ratesTargetTemp; state.ratesConditioning = false; state.running = false; state.ratesStageTimer = 0; state.toast = `Water bath stable at ${state.ratesTargetTemp} °C. Move the conditioned flask onto the paper cross.`; ratesChanged = true } }
    else if (state.ratesStage === 1) { state.ratesStageTimer += dt; state.temp = state.ratesTargetTemp; if (state.ratesStageTimer >= 1.8) { state.ratesStage = 2; state.ratesStageTimer = 0; state.running = false; state.toast = `Flask centred on the paper cross at ${state.ratesTargetTemp} °C. Add HCl to start the timed reaction.`; ratesChanged = true } }
    else if (state.ratesStage === 3) { state.ratesStageTimer += dt; const measured = ratesMeasuredTime(), q = Math.min(1, state.ratesStageTimer / ratesVisualDuration()); state.progress = q; state.time = q * measured; state.temp = state.ratesTargetTemp; if (q > .24 && q < .93) state.toast = 'Sulfur precipitate is forming. Use the bird’s-eye view to judge when the cross disappears.'; if (q >= 1) { if (!state.ratesResults.some(r => r.temperature === state.ratesTargetTemp)) state.ratesResults.push({ temperature: state.ratesTargetTemp, time: measured }); state.points = state.ratesResults.map(r => ({ x: (r.temperature - 20) / 40, y: r.time / 50, xValue: r.temperature, yValue: r.time, t: r.time })); state.ratesStage = 4; state.running = false; state.complete = state.ratesResults.length === ratesTemperatures.length; state.toast = state.complete ? 'All five temperature trials are complete. Open the bar chart to compare reaction times.' : `Cross disappeared after ${measured.toFixed(1)} s at ${state.ratesTargetTemp} °C. Continue with the next temperature.`; ratesChanged = true } }
    if (!skipDraw && (state.running || state.tab === 'birdseye' || ratesChanged)) draw(); return
  }
  if (id === 'titration') {
    if (state.titrationIndicatorTimer > 0) { state.time += dt; state.titrationIndicatorTimer = Math.min(titrationIndicatorDuration, state.titrationIndicatorTimer + dt); if (state.titrationIndicatorTimer >= titrationIndicatorDuration) { state.titrationIndicatorTimer = 0; state.titrationIndicator = true; state.titrationStage = 1; state.running = false; state.toast = 'Two drops of phenolphthalein added. The acidic solution remains colourless.' } }
    else if (state.titrationStage === 2 && state.running) { state.time += dt; state.titrationVolume = Math.min(24.8, state.titrationVolume + dt * 4.8); state.volume = state.titrationVolume; state.progress = Math.min(.99, state.titrationVolume / 25.05); state.ph = titrationPh(); const last = state.points.at(-1); if (!last || state.titrationVolume - last.xValue >= 3.8) state.points.push(graphReading()); if (state.titrationVolume >= 24.8) { state.titrationVolume = 24.8; state.volume = 24.8; state.ph = titrationPh(); state.running = false; state.titrationStage = 3; state.points.push(graphReading()); state.toast = 'Tap closed at 24.80 cm³. The endpoint is close: add NaOH one drop at a time while swirling.' } }
    else if (state.titrationDropTimer > 0) { state.time += dt; state.titrationDropTimer = Math.max(0, state.titrationDropTimer - dt); if (state.titrationDropTimer <= 0) { state.running = false; if (state.titrationVolume >= 25.05) { state.titrationStage = 4; state.complete = true; state.progress = 1; state.toast = 'Endpoint reached: the first permanent very pale pink remains after swirling.' } else state.toast = `Burette reading ${state.titrationVolume.toFixed(2)} cm³ — the flask is still colourless.` } }
    if (!skipDraw && (state.running || state.titrationDropTimer > 0)) draw(); return
  }
  if (id === 'salts' && state.running) { state.saltsTimer += dt; if (state.saltsStage === 1 && state.saltsTimer > 2.5) { state.running = false; state.toast = 'Copper oxide added. The solution turns blue as it reacts.' } if (state.saltsStage === 2 && state.saltsTimer > 3) { state.running = false; state.toast = 'Filtration complete. Clear blue filtrate collected.' } if (state.saltsStage === 3 && state.saltsTimer > 4) { state.running = false; state.burner = false; state.toast = 'Solution concentrated. Ready to cool and crystallise.' } if (state.saltsStage === 4 && state.saltsTimer > 5) { state.running = false; state.complete = true; state.toast = 'Crystallisation complete. Pure, dry crystals formed.' } if (!skipDraw) draw(); return }
  if (id === 'mass' && state.massTransfer) { state.massTransfer.t += dt; state.temp = Math.max(25, state.temp - dt * 22); if (state.massTransfer.t >= 1.55) { const direction = state.massTransfer.direction; state.massTransfer = null; if (direction === 'toTripod') { state.massStage = 2; state.toast = 'Crucible placed on the gauze. Click its rounded lid to reveal the magnesium ribbon.' } else { state.massStage = 7; state.massAfter = 4.18; state.complete = true; state.temp = 25; state.toast = 'Final mass settled at 4.18 g. The increase is oxygen combined with magnesium.' } } if (!skipDraw) draw(); return }
  if (id === 'mass' && state.massStage === 4 && state.running) { state.time += dt; state.progress = Math.min(1, state.progress + dt / 7); state.temp = 25 + 68 * state.progress; if (state.progress >= 1) { state.running = false; state.burner = false; state.massStage = 5; state.temp = 93; state.toast = 'Reaction complete: flaky white magnesium oxide has formed. Cool it, then reweigh.' } if (!skipDraw) draw(); return }
  if (id === 'hydrogen' && state.running && state.hydrogenStage >= 1 && state.hydrogenStage <= 4) { state.time += dt; state.hydrogenTimer += dt; if (state.hydrogenStage === 1) { const q = Math.min(1, state.hydrogenTimer / 2.25); state.transferred = q; state.progress = .04 + .11 * q; state.ph = 7 - 5.5 * q; state.temp = 25 + 1.5 * q; if (q >= 1) { state.hydrogenStage = 2; state.hydrogenTimer = 0; state.toast = 'The acid is reacting with magnesium. A thumb seals the tube while hydrogen collects.' } } else if (state.hydrogenStage === 2) { const q = Math.min(1, state.hydrogenTimer / 3.4); state.hydrogenGas = 40 * q; state.volume = state.hydrogenGas; state.progress = .15 + .65 * q; state.temp = 26.5 + 2.5 * q; const last = state.points.at(-1); if (!last || state.time - last.t > .7) state.points.push(graphReading()); if (q >= 1) { state.hydrogenStage = 3; state.hydrogenTimer = 0; state.running = false; state.hydrogenGas = 40; state.volume = 40; state.progress = .8; state.points.push(graphReading()); state.toast = 'Hydrogen collected. Keep the tube sealed, then test it with the lit splint.' } } else if (state.hydrogenStage === 4) { const q = Math.min(1, state.hydrogenTimer / 1.25); if (state.hydrogenTimer >= .38) playSqueakyPop(); const burn = Math.max(0, Math.min(1, (state.hydrogenTimer - .38) / .52)); state.hydrogenGas = 40 * (1 - burn); state.volume = state.hydrogenGas; state.progress = .8 + .2 * q; state.temp = 29 + 7 * Math.sin(q * Math.PI); if (q >= 1) { state.hydrogenStage = 5; state.running = false; state.complete = true; state.hydrogenGas = 0; state.volume = 0; state.progress = 1; state.temp = 25; state.toast = 'Squeaky pop confirmed: the hydrogen ignited and the flame travelled rapidly up the tube.' } } if (!skipDraw) draw(); return }
  if (id === 'electro' && state.electroWeighing) { state.electroWeighTimer = Math.min(electroWeighDuration, state.electroWeighTimer + dt); const phase = electroWeighPhase(); state.toast = phase === 'lifting from solution' ? 'The released cathode is lifting clear of the copper chloride solution.' : phase === 'moving to balance' ? 'The copper-coated cathode is moving across to the electronic balance.' : phase === 'lowering onto balance' ? 'The cathode is rotating flat and lowering onto the balance pan.' : 'The electronic balance reading is settling.'; if (state.electroWeighTimer >= electroWeighDuration) { state.electroWeighing = false; state.electroRecorded = true; state.tab = 'graph'; state.toast = 'Cathode settled at 13.24 g: a 0.84 g increase from deposited copper.' } if (!skipDraw) draw(); return }
  if (id === 'flame' && state.running) { const salt = flameTestSalts[state.flameTestSalt]; state.flameTestTimer += dt; state.time += dt; if (state.flameTestStage === 1) { if (state.flameTestTimer < .65) state.toast = `Moving the clean spatula above the ${salt.formula} sample jar.`; else if (state.flameTestTimer < 1.35) state.toast = `Scooping a small amount of ${salt.salt}.`; else state.toast = `${salt.formula} crystals are resting on the metal spatula.`; if (state.flameTestTimer >= 2.15) { state.flameTestStage = 2; state.flameTestTimer = 0; state.running = false; state.toast = `${salt.formula} loaded. Insert the spatula into the hottest part of the blue flame.` } } else if (state.flameTestStage === 3) { if (state.flameTestTimer < 1.05) state.toast = 'The loaded spatula is approaching the roaring blue flame.'; else state.toast = `The blue flame is changing to ${salt.flame}: ${salt.symbol} detected.`; if (state.flameTestTimer >= 3.15) { state.flameTestStage = 4; state.flameTestTimer = 0; state.running = false; if (!state.flameTestTested.includes(state.flameTestSalt)) state.flameTestTested.push(state.flameTestSalt); state.progress = state.flameTestTested.length / flameTestSalts.length; state.complete = state.flameTestTested.length === flameTestSalts.length; state.tab = 'graph'; state.toast = `${salt.salt} gives a ${salt.flame} flame. Its simplified absorption spectrum is now highlighted.` } } if (!skipDraw) draw(); return }
  if (id === 'displacement' && state.displacementStage === 1 && state.running) { state.displacementTimer = Math.min(displacementDuration, state.displacementTimer + dt); state.time = state.displacementTimer; state.progress = Math.min(1, state.displacementTimer / displacementDuration); state.temp = 25 + 1.8 * Math.sin(state.progress * Math.PI); state.toast = state.displacementTimer < 1.25 ? 'The cleaned metal strips are lowering into the four salt solutions.' : state.displacementTimer < 3.2 ? 'Copper is depositing on magnesium, zinc and iron; silver crystals are growing on copper.' : 'Compare the different coating textures and the changing solution colours in each test tube.'; if (state.displacementTimer >= displacementDuration) { state.displacementTimer = displacementDuration; state.progress = 1; state.temp = 25; state.running = false; state.complete = true; state.displacementStage = 2; state.toast = 'All four displacement reactions are complete. Record the observations and deduce the reactivity order.' } if (!skipDraw) draw(); return }
  if (id === 'alkali' && state.running) {
    const metal = alkaliMetal();
    state.alkaliTimer += dt; state.time = state.alkaliTimer;
    if (state.alkaliStage === 1) {
      const q = Math.min(1, state.alkaliTimer / 1.85);
      state.alkaliReactionProgress = 0; state.progress = (state.alkaliResults.length + .05) / alkaliMetals.length;
      state.toast = q < .45 ? `The forceps move ${metal.name.toLowerCase()} above the water behind the safety screen.` : 'The tiny metal sample touches the water surface; keep the protective screen closed.';
      if (q >= 1) { state.alkaliStage = 2; state.alkaliTimer = 0; state.progress = (state.alkaliResults.length + .14) / alkaliMetals.length; state.toast = `${metal.name} is reacting with water: hydrogen bubbles form and the indicator begins turning purple.`; }
    } else if (state.alkaliStage === 2) {
      const q = Math.min(1, state.alkaliTimer / metal.duration), motion = metal.id === 'lithium' ? 'moves slowly across the water' : metal.id === 'sodium' ? 'has melted and is darting across the water' : 'is skimming rapidly behind the screen';
      state.alkaliReactionProgress = q; state.progress = (state.alkaliResults.length + .5) / alkaliMetals.length; state.temp = 25 + metal.temperatureRise * Math.sin(q * Math.PI * .72); state.ph = 7 + 6.2 * q;
      state.toast = q < .32 ? `${metal.name} is floating and fizzing as hydrogen forms.` : q < .78 ? `${metal.name} ${motion}${metal.id === 'lithium' ? '.' : ` with a ${metal.flame}.`}` : 'The visible reaction is ending; the alkaline solution remains purple.';
      if (q >= 1) { state.alkaliStage = 3; state.alkaliTimer = 0; state.alkaliReactionProgress = 1; state.running = false; state.temp = 25 + metal.temperatureRise * .38; state.ph = 13.2; state.progress = (state.alkaliResults.length + .94) / alkaliMetals.length; state.toast = `${metal.name} observation complete. Record the bubbles, motion and ${metal.flame}.`; }
    } else if (state.alkaliStage === 5) {
      const q = Math.min(1, state.alkaliTimer / 1.35);
      state.alkaliReactionProgress = 1 - q; state.progress = state.alkaliResults.length / alkaliMetals.length;
      state.toast = q < .58 ? 'The forceps withdraw and the protected trough is cleared between simulated trials.' : 'The next sealed sample vial is moving into position.';
      if (q >= 1) { state.alkaliMetal = Math.min(alkaliMetals.length - 1, state.alkaliResults.length); state.alkaliStage = 0; state.alkaliTimer = 0; state.alkaliReactionProgress = 0; state.running = false; state.progress = state.alkaliResults.length / alkaliMetals.length; state.temp = 25; state.ph = 7; state.lastReactant = alkaliMetal().id; state.toast = `${alkaliMetal().name} is ready for the next protected comparison.`; }
    }
    if (!skipDraw) draw();
    return;
  }
  if (id === 'thermite' && state.running) {
    state.thermiteTimer = Math.min(thermiteDuration, state.thermiteTimer + dt); state.time = state.thermiteTimer; state.progress = state.thermiteTimer / thermiteDuration;
    const t = state.thermiteTimer, smooth = q => { q = Math.max(0, Math.min(1, q)); return q * q * (3 - 2 * q) };
    state.temp = t < 1.1 ? 25 : t < 2.6 ? 25 + 275 * smooth((t - 1.1) / 1.5) : t < 3.15 ? 300 + 2250 * smooth((t - 2.6) / .55) : t < 5.9 ? 2550 - 350 * ((t - 3.15) / 2.75) + 55 * Math.sin(t * 10) : 2200 - 1750 * smooth((t - 5.9) / 2.1);
    const lastPoint = state.points.at(-1); if (!lastPoint || state.time - lastPoint.t > .34) state.points.push(graphReading());
    const phase = thermitePhase(); state.toast = phase === 'blow torch approaching' ? 'The small blow torch is moving toward the magnesium fuse behind the shield.' : phase === 'magnesium fuse burning' ? 'The burning fuse is disintegrating behind the flame front, leaving white powdered magnesium oxide.' : phase === 'violent ignition flash' ? 'A blinding ignition flare erupts inside the protective glass screen.' : phase === 'white-hot spark fountain' ? 'White-hot sparks and molten droplets are contained by the sand-filled can and glass screen.' : 'The spark fountain is subsiding while the molten-iron product cools in the sand.';
    if (t >= 2.6) playThermiteBurst();
    if (t >= thermiteDuration) { state.running = false; state.complete = true; state.progress = 1; state.temp = 450; state.points.push(graphReading()); state.toast = 'Reaction complete: one smooth amorphous iron blob remains lightly glowing as it cools in the sand.' }
    if (!skipDraw) draw(); return
  }
  if (id === 'starchleaf') {
    const stage = state.starchStage || 0;
    if (state.running && starchStageDurations[stage]) {
      state.starchTimer += dt;
      state.time += dt;
      const duration = starchStageDurations[stage], q = Math.max(0, Math.min(1, state.starchTimer / duration));
      state.progress = Math.min(1, (stage - 1) / 8 + q * .25);
      state.temp = stage === 1 ? 25 + 75 * Math.min(1, q * 2) : stage === 3 ? 25 + 53 * Math.min(1, q * 1.6) : 25;
      if (stage === 1) state.toast = q < .22 ? 'The forceps lower the green leaf into boiling water.' : q < .76 ? 'Boiling stops the leaf’s chemical reactions and softens the tissue.' : 'The softened leaf is lifting clear of the hot water.';
      else if (stage === 3) state.toast = q < .26 ? 'The leaf moves into the ethanol tube inside the water bath.' : q < .82 ? 'Chlorophyll dissolves into the ethanol as the leaf becomes pale.' : 'The decolourised leaf is lifting from the ethanol.';
      else if (stage === 5) state.toast = q < .58 ? 'Warm water removes ethanol and softens the brittle leaf.' : 'The forceps spread the rinsed leaf flat on the white tile.';
      else if (stage === 7) state.toast = q < .34 ? 'The pipette moves over the leaf and releases iodine drops.' : q < .84 ? 'Orange-brown iodine spreads through the pale leaf tissue.' : 'The leaf turns blue-black: starch is present.';
      if (q >= 1) {
        state.starchStage = stage + 1;
        state.starchTimer = 0;
        state.running = false;
        state.temp = 25;
        if (stage === 1) state.toast = 'The boiled leaf is soft and ready to transfer into ethanol in the water bath.';
        else if (stage === 3) state.toast = 'The leaf is pale because chlorophyll has dissolved into the green ethanol. Rinse it in warm water.';
        else if (stage === 5) state.toast = 'The rinsed, decolourised leaf lies flat on the white tile. Add iodine solution.';
        else if (stage === 7) { state.complete = true; state.progress = 1; state.toast = 'Positive starch test: the leaf is blue-black after iodine, showing stored starch from photosynthesis.'; }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'lipase') {
    state.temp = state.lipaseBathTemp;
    if (state.lipaseConditioning) {
      const direction = Math.sign(state.lipaseTargetTemp - state.lipaseBathTemp);
      state.lipaseBathTemp += direction * Math.min(Math.abs(state.lipaseTargetTemp - state.lipaseBathTemp), dt * 6.5);
      state.temp = state.lipaseBathTemp;
      state.toast = `The electric water bath is conditioning both mixtures at ${state.lipaseBathTemp.toFixed(1)} °C (target ${state.lipaseTargetTemp} °C).`;
      if (Math.abs(state.lipaseBathTemp - state.lipaseTargetTemp) < .06) { state.lipaseBathTemp = state.lipaseTargetTemp; state.temp = state.lipaseTargetTemp; state.lipaseConditioning = false; state.running = false; state.toast = `Both mixtures are equilibrated at ${state.lipaseTargetTemp} °C. Add lipase to start the stopwatch.`; }
    } else if (state.running && state.lipaseStage === 1) {
      state.lipaseTimer += dt;
      state.toast = state.lipaseTimer < .7 ? 'The measured lipase pipette is moving above the milk test tube.' : 'Lipase drops enter the pink alkaline milk mixture; the stopwatch starts immediately.';
      if (state.lipaseTimer >= 1.8) { state.lipaseStage = 2; state.lipaseTimer = 0; state.time = 0; state.toast = 'Lipase is digesting milk fat. Fatty acids lower the pH and the pink indicator is fading.'; }
    } else if (state.running && state.lipaseStage === 2) {
      state.lipaseTimer += dt;
      const duration = lipaseVisualDuration(), q = Math.max(0, Math.min(1, state.lipaseTimer / duration)), measured = lipaseMeasuredTime();
      state.progress = q;
      state.time = measured * q;
      state.ph = 10 - 3.2 * q;
      state.toast = q < .32 ? 'The mixture is still strongly pink while the first fatty acids form.' : q < .78 ? 'The indicator is fading as lipase releases more fatty acids.' : 'The last pink colour is disappearing: the endpoint is close.';
      if (q >= 1) {
        state.lipaseStage = 3;
        state.lipaseTimer = 0;
        state.running = false;
        state.time = measured;
        state.ph = 6.8;
        if (!state.lipaseResults.some(r => r.temperature === state.lipaseTargetTemp)) state.lipaseResults.push({ temperature: state.lipaseTargetTemp, time: measured });
        state.points = state.lipaseResults.map(r => ({ x: (r.temperature - 20) / 40, y: r.time / 120, xValue: r.temperature, yValue: r.time }));
        state.complete = state.lipaseResults.length === lipaseTemperatures.length;
        if (state.complete) state.tab = 'graph';
        state.toast = state.complete ? 'Five trials complete. The shortest time is near 40 °C; activity falls at 60 °C after denaturation.' : `${state.lipaseTargetTemp} °C result: pink disappeared after ${measured} s. Prepare the next temperature.`;
      }
    }
    if (!skipDraw && (state.running || state.lipaseConditioning || state.complete)) draw();
    return;
  }
  if (id === 'transformation') {
    const stage = state.transformationStage || 0, duration = transformationStageDurations[stage];
    if (state.running && duration) {
      state.transformationTimer += dt;
      const q = Math.max(0, Math.min(1, state.transformationTimer / duration));
      state.progress = Math.min(1, (stage - 1 + q * 2) / 12);
      state.time = stage === 5 ? q * 50 : stage === 7 ? q * 600 : stage === 11 ? q * 57600 : state.transformationTimer;
      if (stage === 1) state.toast = q < .5 ? 'Colour-coded labels are wrapping around the +DNA and −DNA tubes.' : 'Four plate labels preserve the DNA treatment and medium for every comparison.';
      else if (stage === 3) state.toast = q < .31 ? 'A fresh sterile tip is fitted. The P20 reaches its first stop, then releases to draw competent cells into the visible tip column.' : q < .62 ? 'A new tip repeats the first-stop aspiration and second-stop dispense for the −DNA control.' : q < .9 ? 'Another fresh tip draws up the circular GFP plasmid and dispenses it into +DNA only.' : 'The used tip is ejected into the waste cup; both control tubes remain chilled.';
      else if (stage === 5) { state.temp = q < .3 || q > .72 ? 4 : 42; state.toast = q < .3 ? 'The labelled tubes remain nestled in ice so the cells stay competent.' : q < .72 ? 'Both controls are together in the 42 °C heat block for a simulated 50 seconds.' : 'The tubes have returned to ice; the +DNA cells now contain the plasmid.'; }
      else if (stage === 7) { state.temp = 25; state.toast = q < .48 ? 'A fresh tip aspirates sterile LB, then the two-stop plunger dispenses it into +DNA.' : 'A second fresh tip adds LB to −DNA before being ejected; both samples then recover together.'; }
      else if (stage === 9) state.toast = q < .25 ? 'Fresh-tip cycle 1: +DNA cells are aspirated, dispensed and spread over LB/amp/ara.' : q < .5 ? 'Fresh-tip cycle 2: +DNA cells are plated on LB/amp without cross-contamination.' : q < .75 ? 'Fresh-tip cycle 3: −DNA cells are plated on LB as the viability control.' : 'Fresh-tip cycle 4: −DNA cells are plated on LB/amp; each used tip is ejected to waste.';
      else if (stage === 11) { state.temp = 37; state.toast = q < .22 ? 'The four sealed plates move into the 37 °C simulation incubator in an inverted orientation.' : q < .72 ? 'Simulated overnight growth: transformed colonies survive ampicillin while the controls test cell viability and selection.' : 'The plates move onto the blue-light viewer; GFP fluorescence appears only where plasmid, ampicillin and arabinose are all present.'; }
      if (q >= 1) {
        state.transformationStage = stage + 1; state.transformationTimer = 0; state.running = false; state.progress = (stage + 1) / 12;
        if (stage === 1) state.toast = 'Controls labelled. Add identical competent-cell samples to both tubes and plasmid DNA to +DNA only.';
        else if (stage === 3) state.toast = 'Cells and DNA are assigned correctly. Keep both tubes ice-cold before the heat shock.';
        else if (stage === 5) { state.temp = 4; state.toast = 'Heat shock complete. Add sterile LB broth so both cell samples can recover before plating.'; }
        else if (stage === 7) state.toast = 'Recovery complete. Use the labelled plate map to inoculate all four agar conditions.';
        else if (stage === 9) state.toast = 'Four plates are inoculated and sealed. Incubate them to reveal growth, selection and GFP expression.';
        else if (stage === 11) { state.temp = 22; state.complete = true; state.progress = 1; state.transformationResults = transformationPlateResults.map(result => ({ ...result })); state.tab = 'graph'; state.toast = 'Transformation result: ampicillin selects plasmid-bearing cells, while arabinose activates GFP so only +DNA LB/amp/ara colonies glow green.'; }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'respiration') {
    const stage = state.respirationStage || 0, duration = respirationStageDurations[stage];
    if (state.running && duration) {
      state.respirationTimer += dt;
      const q = Math.max(0, Math.min(1, state.respirationTimer / duration));
      if (stage === 1) {
        state.progress = q * .18;
        const flaskIndex = Math.min(4, Math.floor(q * 5));
        state.toast = q < .12 ? 'The powder boat lifts from the balance tray.' : `Glucose crystals are falling into the ${respirationTemperatures[flaskIndex]} °C flask; each portion is exactly 5.0 g.`;
        if (q >= 1) { state.respirationStage = 2; state.respirationTimer = 0; state.running = false; state.progress = .18; state.toast = 'All five flasks contain the same 5.0 g glucose mass. Add equal volumes of yeast suspension.'; }
      } else if (stage === 3) {
        state.progress = .18 + q * .2;
        const flaskIndex = Math.min(4, Math.floor(q * 5));
        state.toast = q < .1 ? 'The 25.0 cm³ measuring cylinder lifts from the yeast bottle.' : `Yeast suspension pours down the wall of the ${respirationTemperatures[flaskIndex]} °C flask without spilling.`;
        if (q >= 1) { state.respirationStage = 4; state.respirationTimer = 0; state.running = false; state.progress = .38; state.toast = 'Equal yeast, glucose and total liquid volumes are ready. Seal every flask with an identical balloon.'; }
      } else if (stage === 5) {
        state.progress = .38 + q * .22;
        const balloonIndex = Math.min(4, Math.floor(q * 5));
        state.toast = `Balloon ${balloonIndex + 1} is stretching over its flask neck; the latex forms an airtight seal without trapping extra air.`;
        if (q >= 1) { state.respirationStage = 6; state.respirationTimer = 0; state.running = false; state.progress = .6; state.toast = 'All five empty balloons are sealed and every bath is stable at its labelled temperature. Start the simultaneous ten-minute run.'; }
      } else if (stage === 7) {
        state.time = 600 * q; state.progress = .6 + q * .32; state.temp = 40;
        state.toast = q < .18 ? 'The yeast is rehydrating and the first carbon dioxide bubbles enter the balloons.' : q < .68 ? 'Balloon inflation differs while the timer remains identical: the 30 °C and 40 °C flasks are producing carbon dioxide fastest.' : 'Ten minutes is nearly complete. The 60 °C balloon stays almost flat because high temperature damages respiratory enzymes.';
        if (q >= 1) { state.respirationStage = 8; state.respirationTimer = 0; state.running = false; state.time = 600; state.progress = .92; state.toast = 'The simultaneous ten-minute timer has stopped. Compare the five balloon sizes, then record the carbon dioxide volumes.'; }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'antibiotics') {
    const stage = state.antibioticStage || 0, duration = antibioticStageDurations[stage];
    if (state.running && duration) {
      state.antibioticTimer += dt;
      const q = Math.max(0, Math.min(1, state.antibioticTimer / duration));
      if (stage === 1) {
        state.progress = .16 * q;
        state.toast = q < .23 ? 'The yellow safety flame is off while 70% IMS is sprayed over the work area.' : q < .32 ? 'The sealed agar plate lifts clear of the bench so the fresh wipe can pass beneath it.' : q < .54 ? 'The wipe sweeps the whole bench footprint underneath the raised plate in overlapping lanes.' : q < .69 ? 'The used wipe leaves the sterile field and drops into the designated waste bin.' : q < .75 ? 'After air-drying, the sealed plate flips over to expose the outside of its base.' : q < .85 ? 'The marker draws the first diameter only after the plate is fully inverted.' : q < .95 ? 'A perpendicular underside line completes four sectors while the agar remains sealed.' : 'The marker withdraws and the plate turns upright again for inoculation.';
        if (q >= 1) { state.antibioticStage = 2; state.antibioticTimer = 0; state.running = false; state.progress = .16; state.toast = 'The dry bench is organised, four sectors are marked and the Bunsen has returned to a yellow safety flame. Inoculate using minimum lid opening.'; }
      } else if (stage === 3) {
        state.progress = .16 + .24 * q;
        state.toast = q < .18 ? 'The sterile swab is moistened with the Bacillus subtilis teaching culture.' : q < .78 ? 'The lid is held like a shield while the swab sweeps the agar in overlapping directions and the plate rotates between passes.' : 'The lid closes and the used swab travels directly into the biohazard waste bin.';
        if (q >= 1) { state.antibioticStage = 4; state.antibioticTimer = 0; state.running = false; state.progress = .4; state.toast = 'An even bacterial lawn has been inoculated and the swab safely discarded. Open the sterile disc card only when the forceps are ready.'; }
      } else if (stage === 5) {
        state.progress = .4 + .22 * q;
        const discIndex = Math.min(3, Math.floor(q * 4));
        state.toast = `Sterile forceps are placing disc ${antibioticDiscs[discIndex].code} (${antibioticDiscs[discIndex].name}) without sliding it across the agar.`;
        if (q >= 1) { state.antibioticStage = 6; state.antibioticTimer = 0; state.running = false; state.progress = .62; state.toast = 'P, E, T and the sterile-water control are equally spaced. Cross-tape the lid, invert the plate and incubate at 25 °C.'; }
      } else if (stage === 7) {
        state.time = 48 * 3600 * q; state.progress = .62 + .26 * q; state.temp = 25;
        state.toast = q < .14 ? 'Two short tape strips cross over the closed lid, leaving gas exchange possible.' : q < .27 ? 'The plate turns agar-side-up so condensation cannot drip across the bacterial lawn.' : q < .43 ? 'The incubator glass door swings open and the inverted plate slides onto the shelf.' : q < .76 ? `The door is closed while incubation advances to ${(48 * q).toFixed(0)} hours at the school-safe 25 °C.` : q < .92 ? 'The glass door reopens and the sealed grown plate returns to the bench.' : 'The incubator door closes; clear inhibition zones are stable while the water control shows continuous growth.';
        if (q >= 1) { state.antibioticStage = 8; state.antibioticTimer = 0; state.running = false; state.time = 48 * 3600; state.progress = .88; state.toast = 'Incubation complete and the glass door is closed again. Keep the returned plate sealed and measure every clear zone through its centre.'; }
      } else if (stage === 9) {
        state.progress = .88 + .12 * q;
        const count = Math.min(4, Math.floor(q * 4 + .001));
        while (state.antibioticResults.length < count) {
          const disc = antibioticDiscs[state.antibioticResults.length];
          state.antibioticResults.push({ id: disc.id, code: disc.code, antibiotic: disc.name, zone_diameter_mm: disc.diameterMm, control: disc.id === 'control' });
        }
        state.antibioticMeasuredIndex = Math.max(-1, count - 1);
        const index = Math.min(3, Math.floor(q * 4));
        state.toast = `The ruler aligns through disc ${antibioticDiscs[index].code}; read the widest clear diameter from edge to edge without opening the plate.`;
        if (q >= 1) {
          state.antibioticResults = antibioticDiscs.map(disc => ({ id: disc.id, code: disc.code, antibiotic: disc.name, zone_diameter_mm: disc.diameterMm, control: disc.id === 'control' }));
          state.antibioticMeasuredIndex = 3; state.antibioticStage = 10; state.antibioticTimer = 0; state.running = false; state.complete = true; state.progress = 1; state.tab = 'graph';
          state.toast = 'All sealed-plate readings are recorded: tetracycline 30 mm, erythromycin 24 mm, penicillin 18 mm and sterile-water control 0 mm.';
        }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'osmosis') {
    const stage = state.osmosisStage || 0, duration = osmosisStageDurations[stage];
    if (state.running && duration) {
      state.osmosisTimer += dt;
      const q = Math.max(0, Math.min(1, state.osmosisTimer / duration)), completedTrials = state.osmosisResults.length;
      state.progress = Math.min(1, completedTrials / osmosisConcentrations.length + ((stage === 1 ? .12 * q : stage === 2 ? .12 + .42 * q : stage === 4 ? .62 + .16 * q : stage === 6 ? .82 + .18 * q : 0) / osmosisConcentrations.length));
      if (stage === 1) {
        state.toast = q < .3 ? 'Forceps close gently around the middle of the equal potato cylinder.' : q < .72 ? 'The chip moves in a smooth arc above the labelled sucrose beaker.' : 'The potato cylinder is lowering below the solution meniscus.';
        if (q >= 1) { state.osmosisStage = 2; state.osmosisTimer = 0; state.time = 0; state.toast = `The 30-minute soak is under way. Water moves ${osmosisDirection()}.`; }
      } else if (stage === 2) {
        state.time = 1800 * q;
        const change = osmosisPercentChange();
        state.toast = Math.abs(change) < 2 ? 'Water crosses the cell membranes in both directions at almost equal rates, so mass changes only slightly.' : q < .32 ? `Water molecules begin moving ${osmosisDirection()} through partially permeable cell membranes.` : q < .76 ? change > 0 ? 'The potato cells take up water and become more turgid; the cylinder is visibly swelling.' : 'The potato cells lose water and become flaccid; the cylinder is visibly shrinking.' : 'Thirty minutes is nearly complete. The net water movement is now reflected in the chip’s size and mass.';
        if (q >= 1) { state.osmosisStage = 3; state.osmosisTimer = 0; state.running = false; state.time = 1800; state.toast = `Soak complete in ${state.osmosisConcentration.toFixed(1)} mol dm⁻³ sucrose. Remove the chip and blot its surface dry before weighing.`; }
      } else if (stage === 4) {
        state.toast = q < .28 ? 'The forceps lift the potato cylinder vertically out of the solution.' : q < .52 ? 'Excess solution drains back into the beaker before the chip is moved.' : q < .78 ? 'The chip moves to a fresh lower sheet of blotting paper.' : 'A second sheet presses lightly from above, absorbing surface liquid without squeezing water from the cells.';
        if (q >= 1) { state.osmosisStage = 5; state.osmosisTimer = 0; state.running = false; state.toast = 'Surface solution has been removed consistently. The blotted chip is ready for its final mass.'; }
      } else if (stage === 6) {
        state.toast = q < .58 ? 'The forceps carry the blotted cylinder back above the stainless-steel balance pan.' : 'The chip settles on the pan while the digital reading stabilises.';
        if (q >= 1) {
          const concentration = state.osmosisConcentration, percentChange = osmosisPercentChange(concentration), finalMass = osmosisFinalMass(concentration);
          state.osmosisStage = 7; state.osmosisTimer = 0; state.running = false; state.time = 1800;
          if (!state.osmosisResults.some(result => result.concentration === concentration)) state.osmosisResults.push({ concentration, initialMass: osmosisInitialMass, finalMass, percentChange });
          state.osmosisResults.sort((a, b) => a.concentration - b.concentration);
          state.points = state.osmosisResults.map(result => ({ x: result.concentration / .8, y: (result.percentChange + 20) / 40, xValue: result.concentration, yValue: result.percentChange }));
          state.complete = state.osmosisResults.length === osmosisConcentrations.length;
          state.progress = state.osmosisResults.length / osmosisConcentrations.length;
          if (state.complete) state.tab = 'graph';
          const sign = percentChange > 0 ? '+' : '';
          state.toast = state.complete ? `Five concentrations complete. The graph estimates the isotonic point at ${osmosisIsotonicConcentration()?.toFixed(2)} mol dm⁻³.` : `Final mass ${finalMass.toFixed(2)} g: ${sign}${percentChange.toFixed(1)}%. Prepare the next sucrose concentration.`;
        }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'agardiffusion') {
    const stage = state.agarDiffusionStage || 0, duration = agarDiffusionStageDurations[stage];
    if (state.running && duration) {
      state.agarDiffusionTimer += dt;
      const q = Math.max(0, Math.min(1, state.agarDiffusionTimer / duration));
      if (stage === 1) {
        state.progress = .08 * q;
        state.toast = q < .34 ? 'The calliper jaws close gently around the 1 cm cube.' : q < .68 ? 'The 2 cm cube is checked along a second face.' : 'The 3 cm cube measures 3.0 cm in every direction.';
        if (q >= 1) { state.agarDiffusionStage = 2; state.agarDiffusionTimer = 0; state.running = false; state.progress = .08; state.toast = 'Cube sides confirmed: 1.0 cm, 2.0 cm and 3.0 cm. Their surface-area-to-volume ratios are 6:1, 3:1 and 2:1.'; }
      } else if (stage === 3) {
        state.progress = .08 + .18 * q;
        state.toast = q < .3 ? 'Forceps grip the 1 cm cube without crushing the agar.' : q < .72 ? 'Each cube arcs above its matching acid beaker in turn.' : 'The last cube lowers fully below the hydrochloric-acid meniscus.';
        if (q >= 1) { state.agarDiffusionStage = 4; state.agarDiffusionTimer = 0; state.running = false; state.progress = .26; state.toast = 'All three cubes are fully submerged in equal acid volumes. Start the shared 10-minute timer.'; }
      } else if (stage === 5) {
        state.time = 600 * q; state.progress = .26 + .38 * q;
        state.toast = q < .28 ? 'Hydrogen ions diffuse through the outer agar and phenolphthalein becomes colourless there.' : q < .72 ? 'A pale diffusion layer advances inward by the same distance in every cube.' : 'Ten minutes is almost complete; the smallest cube has the greatest fraction penetrated.';
        if (q >= 1) { state.agarDiffusionStage = 6; state.agarDiffusionTimer = 0; state.running = false; state.time = 600; state.progress = .64; state.toast = 'Ten minutes complete. Remove every cube promptly so the diffusion time remains controlled.'; }
      } else if (stage === 7) {
        state.progress = .64 + .14 * q;
        state.toast = q < .34 ? 'Forceps lift the cubes clear and let excess acid drain into each beaker.' : q < .74 ? 'The cubes move to fresh blotting paper on the cutting tile.' : 'Blotting paper touches each surface lightly without compressing the agar.';
        if (q >= 1) { state.agarDiffusionStage = 8; state.agarDiffusionTimer = 0; state.running = false; state.progress = .78; state.toast = 'The blotted cubes are arranged by size on the cutting tile. Cut each one through its centre.'; }
      } else if (stage === 9) {
        state.progress = .78 + .17 * q;
        state.toast = q < .32 ? 'The scalpel cuts the 1 cm cube into two equal halves.' : q < .66 ? 'The 2 cm cube opens to show a 1.4 cm pink core.' : 'The 3 cm cube opens to show a 2.4 cm pink core surrounded by a 3 mm colourless layer.';
        if (q >= 1) { state.agarDiffusionStage = 10; state.agarDiffusionTimer = 0; state.running = false; state.progress = .95; state.toast = 'All cut faces are visible. The diffusion depth is 3 mm in every cube; calculate the percentage of each original volume reached.'; }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'potometer') {
    const stage = state.potometerStage || 0;
    if (state.running) {
      state.potometerTimer += dt;
      let duration = 0;
      if (stage === 1) duration = 1.25;
      else if (stage === 3) duration = 1.8;
      else if (stage === 5) duration = 3.6;
      const q = Math.min(1, state.potometerTimer / duration), previousDistance = state.potometerResults.at(-1)?.distanceMm ?? 6;
      if (stage === 1) {
        state.potometerBubbleMm = 6 * q;
        if (q >= 1) {
          state.potometerStage = 2; state.potometerTimer = 0; state.running = false; state.potometerBubbleMm = 6;
          state.toast = 'One measurement bubble is visible in the capillary. Use the refiller to align its leading edge exactly with zero.';
        }
      } else if (stage === 3) {
        state.potometerBubbleMm = previousDistance * (1 - q);
        state.toast = q < .26 ? 'The stopcock turns to connect the refiller at the T-junction.' : q < .72 ? 'The refiller plunger moves down gently and pushes water into the capillary.' : 'The bubble is slowing as its leading edge reaches the zero graduation.';
        if (q >= 1) {
          state.potometerStage = 4; state.potometerTimer = 0; state.running = false; state.potometerBubbleMm = 0;
          state.toast = `Bubble aligned at 0 mm. The anemometer confirms ${state.potometerWindSpeed.toFixed(1)} m s⁻¹; start the five-minute measurement.`;
        }
      } else if (stage === 5) {
        const distance = potometerDistance(), rate = potometerRate();
        state.potometerBubbleMm = distance * q;
        state.time = 300 * q;
        state.progress = Math.min(1, (state.potometerResults.length + q) / potometerWindSpeeds.length);
        state.toast = q < .2 ? 'Water evaporating from moist mesophyll surfaces diffuses through open stomata.' : q < .72 ? state.potometerWindSpeed === 0 ? 'The bubble moves slowly as water uptake replaces transpiration from the still-air control shoot.' : 'Moving air removes the humid boundary layer; the bubble advances smoothly toward the leafy shoot.' : 'The timer is nearing five minutes. Read the bubble against the capillary graduation without touching the apparatus.';
        if (q >= 1) {
          const result = { windSpeed: state.potometerWindSpeed, distanceMm: distance, timeMin: 5, rate };
          if (!state.potometerResults.some(item => item.windSpeed === result.windSpeed)) state.potometerResults.push(result);
          state.potometerResults.sort((a, b) => a.windSpeed - b.windSpeed);
          state.points = state.potometerResults.map(item => ({ x: item.windSpeed / 1.5, y: item.rate / 10, xValue: item.windSpeed, yValue: item.rate }));
          state.potometerStage = 6; state.potometerTimer = 0; state.running = false;
          state.complete = state.potometerResults.length === potometerWindSpeeds.length;
          state.progress = state.potometerResults.length / potometerWindSpeeds.length;
          if (state.complete) state.tab = 'graph';
          state.toast = state.complete ? 'All four wind-speed trials are complete. The graph shows that water uptake rises as airflow increases.' : `${distance.toFixed(0)} mm in 5.0 min gives ${rate.toFixed(1)} mm min⁻¹. Reset the bubble before the next wind speed.`;
        }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'quadrats') {
    state.meadowWindClock += dt;
    const stage = state.quadratStage || 0, duration = quadratStageDurations[stage], sample = currentQuadratSample();
    if (state.running && duration) {
      state.quadratTimer += dt;
      const q = Math.max(0, Math.min(1, state.quadratTimer / duration));
      if (stage === 1) {
        state.toast = q < .42 ? 'The first 10 m tape is unrolling from the datum along the meadow x-axis.' : q < .86 ? 'The second tape is unrolling from the same datum at 90°, toward the foreground y-axis.' : 'Both perpendicular tapes now define the 10 m × 10 m coordinate grid.';
        if (q >= 1) { state.quadratStage = 2; state.quadratTimer = 0; state.running = false; state.toast = 'The x and y tapes share one origin and lie at right angles. Generate an unbiased coordinate.' }
      } else if (stage === 3) {
        state.toast = q < .45 ? 'The x coordinate is being generated independently.' : q < .82 ? 'The y coordinate is being generated independently.' : `Unused random point (${sample.xM}, ${sample.yM}) selected.`;
        if (q >= 1) { state.quadratStage = 4; state.quadratTimer = 0; state.running = false; state.toast = `Random coordinate (${sample.xM}, ${sample.yM}) locked. Place the quadrat without shifting it toward any flowers.` }
      } else if (stage === 5) {
        state.toast = q < .34 ? 'The aluminium frame rises clear of the turf.' : q < .78 ? 'The quadrat follows a smooth arc toward the generated coordinate.' : 'The frame settles flat; stems are judged by their rooted position.';
        if (q >= 1) { state.quadratStage = 6; state.quadratTimer = 0; state.running = false; state.toast = 'Quadrat settled at the random point. Count daisies rooted inside using the fixed top-and-right edge rule.' }
      } else if (stage === 7) {
        state.quadratCurrentCount = Math.min(sample.daisies, Math.floor(q * sample.daisies + .001));
        state.toast = q < .72 ? `Identifying rooted daisy stems one at a time: ${state.quadratCurrentCount} counted.` : 'Checking boundary plants and confirming the tally.';
        if (q >= 1) { state.quadratStage = 8; state.quadratTimer = 0; state.running = false; state.quadratCurrentCount = sample.daisies; state.toast = `${sample.daisies} daisies are rooted inside this 1 m² quadrat. Record the sample.` }
      }
    }
    if (!skipDraw) draw();
    return;
  }
  if (id === 'capture') {
    state.meadowWindClock += dt;
    const stage = state.captureStage || 0, duration = captureStageDurations[stage];
    if (state.running && duration) {
      state.captureTimer += dt;
      const q = Math.max(0, Math.min(1, state.captureTimer / duration));
      if (stage === 1) {
        const counts = captureVisibleCounts();
        state.toast = q < .32 ? 'Lowering five recessed pitfall cups flush with the soil and setting raised rain covers.' : q < .48 ? 'Every trap is level with the turf so walking ground beetles can enter safely.' : `Overnight capture in progress: ${counts.firstCaught} of ${state.captureFirstCatch} beetles have entered the traps.`;
        if (q >= 1) { state.captureStage = 2; state.captureTimer = 0; state.running = false; state.toast = `${state.captureFirstCatch} ground beetles caught; ${40 - state.captureFirstCatch} remain uncaptured in the meadow. Lift the sample gently into the inspection tray.` }
      } else if (stage === 3) {
        const counts = captureVisibleCounts();
        state.toast = q < .36 ? `Moving the first catch into the shallow inspection tray: ${counts.firstCaught}/${state.captureFirstCatch}.` : `Applying one tiny spot of non-toxic white paint to the elytra: ${counts.firstMarked}/${state.captureFirstCatch} marked.`;
        if (q >= 1) { state.captureStage = 4; state.captureTimer = 0; state.running = false; state.toast = `All ${state.captureFirstCatch} beetles carry a small white paint dot. Release them at the capture site.` }
      } else if (stage === 5) {
        const counts = captureVisibleCounts();
        state.toast = q < .67 ? `Marked beetles are walking back into the meadow: ${counts.released}/${state.captureFirstCatch} released.` : `After 24 hours of mixing, beetles are entering the reset traps: ${counts.secondCaught}/${state.captureSecondCatch}.`;
        if (q >= 1) { state.captureStage = 6; state.captureTimer = 0; state.running = false; state.toast = 'Twenty beetles are in the second trap sample. Retrieve and check each one for a white mark.' }
      } else if (stage === 7) {
        const counts = captureVisibleCounts();
        state.toast = q < .43 ? `Arranging the second catch in the inspection tray: ${counts.secondCaught}/${state.captureSecondCatch} counted.` : `Checking dorsal paint spots with the magnifier: ${counts.secondMarked}/${state.captureRecaptured} marked recaptures identified.`;
        if (q >= 1) { state.captureStage = 8; state.captureTimer = 0; state.running = false; state.toast = `Second catch: ${state.captureSecondCatch} beetles total, including ${state.captureRecaptured} with retained white marks.` }
      }
    }
    if (!skipDraw) draw();
    return;
  }
  if (id === 'shoretransect') {
    state.shoreTideClock += dt;
    state.shoreTideProgress = Math.min(.76, state.shoreTideProgress + dt * .0045 + state.transectResults.length * dt * .0006);
    const stage = state.transectStage || 0, duration = transectStageDurations[stage], station = currentTransectStation();
    if (state.running && duration) {
      state.transectTimer += dt;
      const q = Math.max(0, Math.min(1, state.transectTimer / duration));
      if (stage === 1) {
        state.toast = q < .3 ? 'The tape reel is fixed at the dry upper-shore datum.' : q < .8 ? 'Two parallel tapes extend downslope, forming a one-metre belt across the strata.' : 'The 10 m belt reaches the lower shore without disturbing organisms.';
        if (q >= 1) { state.transectStage = 2; state.transectTimer = 0; state.running = false; state.toast = 'The belt is aligned perpendicular to the waterline. Move the first quadrat to the 0 m upper-shore station.' }
      } else if (stage === 3) {
        state.transectDistanceM = station.distanceM;
        state.toast = q < .72 ? `The gridded frame is travelling along the tape toward ${station.distanceM} m.` : `The quadrat is lowering onto the ${station.zone.toLowerCase()} shore rock.`;
        if (q >= 1) { state.transectStage = 4; state.transectTimer = 0; state.running = false; state.toast = `${station.distanceM} m station positioned. Survey every grid square before the advancing tide reaches the safe working line.` }
      } else if (stage === 5) {
        state.toast = q < .35 ? 'Matching shell shape and attachment to the species identification key.' : q < .78 ? `Counting limpets and estimating occupied grid area in the ${station.zone.toLowerCase()} stratum.` : 'Cross-checking percentage-cover estimates against all grid squares.';
        if (q >= 1) { state.transectStage = 6; state.transectTimer = 0; state.running = false; state.transectCurrentObservation = { ...station }; state.toast = `${station.limpets} limpets · ${station.barnacleCover}% barnacles · ${station.seaweedCover}% brown seaweed. Record the station.` }
      }
    }
    if (!skipDraw) draw();
    return;
  }
  if (id === 'ripple') {
    const stage = state.rippleStage || 0, duration = rippleStageDurations[stage], trial = currentRippleTrial(), measurement = rippleTrialMeasurement(trial);
    state.rippleWaveClock += dt;
    state.time = state.rippleWaveClock;
    state.rippleFrequencyHz = trial.frequencyHz;
    if (state.running && duration) {
      state.rippleTimer += dt;
      const q = Math.max(0, Math.min(1, state.rippleTimer / duration)), ease = q * q * (3 - 2 * q);
      if (stage === 1) {
        state.toast = q < .3 ? 'The four levelling feet turn in small matched increments.' : q < .78 ? 'The spirit bubble slides between its centre marks as the shallow water surface becomes horizontal.' : 'The depth gauge confirms 1.5 cm across the measurement region.';
        if (q >= 1) { state.rippleStage = 2; state.rippleTimer = 0; state.running = false; state.toast = `Tank level and water depth fixed at 1.5 cm. Set the signal generator to ${trial.frequencyHz.toFixed(1)} Hz and start the vibrator.` }
      } else if (stage === 3) {
        state.toast = q < .25 ? 'The motor and straight dipper ramp up without splashing.' : q < .72 ? 'Parallel crests travel across the transparent tank toward the foam absorber.' : 'The plane-wave pattern is steady and reflections are being absorbed at the far edge.';
        if (q >= 1) { state.rippleStage = 4; state.rippleTimer = 0; state.running = false; state.toast = `Stable ${trial.frequencyHz.toFixed(1)} Hz wavefronts are visible. Synchronise the strobe and measure crest to crest across ten wavelengths.` }
      } else if (stage === 5) {
        state.rippleTenWavelengthCm = trial.tenWavelengthCm * ease;
        state.rippleWavelengthCm = measurement.wavelengthCm * ease;
        state.rippleSpeedMs = measurement.speedMs * ease;
        state.toast = q < .3 ? 'The strobe rate approaches the dipper frequency and the travelling crests appear to slow.' : q < .74 ? 'The wave pattern appears stationary while the ruler aligns its zero with the first selected crest.' : `The far marker reaches the eleventh crest: ten wavelengths span ${trial.tenWavelengthCm.toFixed(1)} cm.`;
        if (q >= 1) { state.rippleStage = 6; state.rippleTimer = 0; state.running = false; state.rippleTenWavelengthCm = trial.tenWavelengthCm; state.rippleWavelengthCm = measurement.wavelengthCm; state.rippleSpeedMs = measurement.speedMs; state.toast = `Divide ${trial.tenWavelengthCm.toFixed(1)} cm by 10: λ = ${measurement.wavelengthCm.toFixed(2)} cm = ${(measurement.wavelengthCm / 100).toFixed(4)} m. Calculate and record v = fλ.` }
      }
    }
    if (!skipDraw) draw();
    return;
  }
  if (id === 'pondweed') {
    if (state.pondweedLampOn || state.pondweedCountAnimating) {
      state.pondweedTimer += dt;
    }
    if (state.pondweedCountAnimating) {
      state.pondweedCountTimer = Math.min(pondweedCountAnimationDuration, state.pondweedCountTimer + dt);
      if (state.pondweedCountTimer >= pondweedCountAnimationDuration) {
        const bpm = state.pondweedPendingBpm ?? Math.round(52 / Math.pow((state.pondweedDistance || 10) / 10, 1.8) + 4);
        state.pondweedBubbles = bpm;
        state.points.push({ x: (state.pondweedDistance - 10) / 40, y: bpm / 60, xValue: state.pondweedDistance, yValue: bpm });
        if (!state.pondweedResults.some(r => r.distance === state.pondweedDistance)) {
          state.pondweedResults.push({ distance: state.pondweedDistance, bubbles: bpm });
        }
        state.pondweedCountAnimating = false;
        state.pondweedCountTimer = 0;
        state.pondweedPendingBpm = null;
        state.running = false;
        state.complete = true;
        state.toast = `1 min count complete: ${bpm} oxygen bubbles at ${state.pondweedDistance} cm from the beaker edge. Automatically added to graph!`;
      }
    }
    if (!skipDraw && (state.pondweedLampOn || state.pondweedCountAnimating)) draw();
    return;
  }
  if (id === 'newton2') {
    if (state.newtonRunning) {
      const previousPos = state.newtonPos, previousVelocity = state.newtonVel, previousTime = state.newtonTimer;
      state.newtonTimer += dt;
      const acc = state.newtonForce / state.newtonMass;
      state.newtonVel += acc * dt;
      state.newtonPos += state.newtonVel * dt;
      const latchGateReading = (threshold, timeKey, velocityKey) => {
        if (state[timeKey] !== null || previousPos >= threshold || state.newtonPos < threshold) return;
        const frameFraction = Math.max(0, Math.min(1, (threshold - previousPos) / Math.max(0.000001, state.newtonPos - previousPos)));
        state[timeKey] = +(previousTime + dt * frameFraction).toFixed(3);
        state[velocityKey] = +(previousVelocity + (state.newtonVel - previousVelocity) * frameFraction).toFixed(2);
      };
      latchGateReading((-.6 + 1.8) / 3.5, 'newtonGate1Time', 'newtonGate1Velocity');
      latchGateReading((1.0 + 1.8) / 3.5, 'newtonGate2Time', 'newtonGate2Velocity');
      if (state.newtonPos >= 1.0) {
        state.newtonPos = 1.0;
        state.newtonRunning = false;
        state.running = false;
        state.complete = true;
        const calcAcc = +(state.newtonForce / (state.newtonMass || 1.0)).toFixed(2);
        const normX = state.newtonForce / 0.6;
        const normY = Math.max(0, Math.min(1, calcAcc / 1.2));
        state.points.push({ x: normX, y: normY, xValue: state.newtonForce, yValue: calcAcc });
        if (!state.newtonResults.some(r => r.force === state.newtonForce)) {
          state.newtonResults.push({ force: state.newtonForce, mass: state.newtonMass, acceleration: calcAcc });
        }
        state.toast = `Run complete! Acceleration a = ${calcAcc.toFixed(2)} m/s². Automatically added to graph!`;
      }
    }
    if (!skipDraw && (state.newtonRunning || state.running)) draw();
    return;
  }
  if (id === 'electromagnet') {
    const stage = state.electromagnetStage || 0;
    if (state.running && electromagnetStageDurations[stage]) {
      state.electromagnetTimer += dt;
      state.time += dt;
      const q = Math.max(0, Math.min(1, state.electromagnetTimer / electromagnetStageDurations[stage]));
      state.progress = Math.min(1, (state.electromagnetResults.length + (stage / 7) * .92) / electromagnetTurnsSeries.length);
      if (stage === 1) state.toast = q < .55 ? 'The switch arm is closing onto its contact.' : 'Current is steady; the soft-iron core is now magnetised.';
      else if (stage === 3) state.toast = q < .65 ? 'The electromagnet descends toward the shuffled paper-clip pile.' : 'The iron core is touching the pile and clips align with its magnetic field.';
      else if (stage === 5) state.toast = q < .68 ? 'The core lifts slowly while attracted paper clips chain together beneath it.' : `${electromagnetMeasuredClips()} paper clips remain supported clear of the tray.`;
      if (q >= 1) {
        state.electromagnetStage = stage + 1;
        state.electromagnetTimer = 0;
        state.running = false;
        if (stage === 1) state.toast = 'Electromagnet energised. Lower the core into the paper-clip pile using the same depth for every trial.';
        else if (stage === 3) { state.electromagnetClips = electromagnetMeasuredClips(); state.toast = 'Core immersed to the marked depth. Lift it vertically without shaking.'; }
        else if (stage === 5) state.toast = `${state.electromagnetTurns} turns lifted ${state.electromagnetClips} paper clips. Record the count before opening the switch.`;
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'convection') {
    if (state.running && state.convectionStage === 1) {
      state.convectionTimer += dt;
      state.time += dt;
      state.progress = Math.min(.18, state.convectionTimer / 1.9 * .18);
      if (state.convectionTimer >= 1.9) {
        state.convectionStage = 2; state.convectionTimer = 0; state.running = false;
        state.toast = 'The orange tracer rests beside the left lower bend. Light the Bunsen below that point.';
      }
    } else if (state.running && state.convectionStage === 3) {
      state.convectionTimer = Math.min(convectionDuration, state.convectionTimer + dt);
      state.time += dt;
      const q = state.convectionTimer / convectionDuration;
      state.progress = .18 + q * .82;
      state.temp = 21 + 54 * Math.min(1, q * 1.7);
      state.toast = q < .2 ? 'Orange warm water rises up the heated left side.' : q < .48 ? 'The tracer crosses the top of the tube as cooler water sinks on the right.' : q < .82 ? 'A complete clockwise convection current now carries the tracer around the loop.' : 'The orange path is continuous: bulk motion transfers thermal energy through the water.';
      if (q >= 1) {
        state.convectionStage = 4; state.running = false; state.complete = true; state.burner = false; state.temp = 68;
        state.toast = 'Convection demonstrated: heated, less-dense water rose while cooler, denser water sank to replace it.';
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'conduction') {
    if (state.running && state.conductionStage === 1) {
      state.conductionTimer = Math.min(conductionDuration, state.conductionTimer + dt);
      state.time = state.conductionTimer;
      state.progress = state.conductionTimer / conductionDuration;
      state.temp = 21 + 76 * Math.min(1, state.progress * 1.55);
      const lastCopper = conductionPinTimes.copper.filter(t => state.conductionTimer >= t).length;
      const lastAluminium = conductionPinTimes.aluminium.filter(t => state.conductionTimer >= t).length;
      const lastSteel = conductionPinTimes.steel.filter(t => state.conductionTimer >= t).length;
      state.toast = state.conductionTimer < 1.5 ? 'The shared end block is heating all three rods equally.' : `Pins fallen — copper ${lastCopper}/4, aluminium ${lastAluminium}/4, steel ${lastSteel}/4.`;
      if (state.conductionTimer >= conductionDuration) {
        state.conductionStage = 2; state.running = false; state.complete = true; state.burner = false; state.temp = 84;
        state.toast = 'All pins have fallen. Copper conducted fastest, followed by aluminium and then steel.';
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'thermal') {
    if (state.thermalStage >= 1) state.thermalRotation = ((state.thermalRotation || 0) + dt * thermalRotationRate) % (Math.PI * 2);
    if (state.running && state.thermalStage === 1) {
      state.thermalTimer += dt;
      state.time += dt;
      const q = Math.min(1, state.thermalTimer / thermalStageDurations[1]);
      state.progress = q * .38;
      state.temp = 21 + 61 * q;
      state.toast = q < .28 ? 'The flask lifts above the Leslie cube.' : q < .78 ? 'Hot water pours through the filler neck and warms all four faces from inside.' : 'The flask returns upright; the cube surfaces approach a steady temperature.';
      if (q >= 1) {
        state.thermalStage = 2; state.thermalTimer = 0; state.running = false; state.temp = 82;
        state.toast = 'The Leslie cube is hot. Pick up the thermal camera to compare its differently finished faces.';
      }
    } else if (state.running && state.thermalStage === 3) {
      state.thermalTimer += dt;
      const q = Math.min(1, state.thermalTimer / thermalStageDurations[3]);
      state.progress = .38 + q * .52;
      state.temp = 82;
      state.toast = q < .45 ? 'The camera lifts from the bench and rotates its display toward you.' : 'The camera is approaching the scene camera; the whole lab now appears in false colour on its display.';
      if (q >= 1) {
        state.thermalStage = 4; state.thermalTimer = 0; state.running = false; state.progress = .9;
        state.toast = 'Live thermal view: centre the crosshair on each Leslie-cube face, then capture the comparison.';
      }
    }
    if (!skipDraw && state.thermalStage >= 1) draw();
    return;
  }
  if (id === 'density') {
    if (state.densityStage === 2 && state.running) {
      state.densityTimer += dt;
      if (state.densityTimer >= densityTransferDuration) {
        state.densityStage = 3;
        state.densityTimer = 0;
        state.running = false;
        state.toast = 'Eureka can filled to the spout. The object is suspended centrally above the water and ready to lower.';
      }
    } else if (state.densityStage === 4 && state.running) {
      state.densityTimer += dt;
      if (state.densityTimer >= densityImmersionDuration) {
        state.densityStage = 5;
        state.densityTimer = densityImmersionDuration;
        state.running = false;
        state.complete = true;
        const sample = densitySamples[state.densitySample || 0];
        state.toast = `Overflow complete! Displaced water volume V = ${sample.vol.toFixed(1)} cm³. Calculate density ρ = m / V.`;
      }
    }
    if (!skipDraw && (state.densityStage === 2 || state.densityStage === 4 || state.running)) draw();
    return;
  }
  if (id === 'hooke') {
    let stageJustSettled = false;
    if (state.hookeFocusModal) state.hookeFocusProgress = Math.min(1, state.hookeFocusProgress + dt / .32);
    if (state.running && state.hookeStage === 1) {
      state.hookeTimer += dt; state.time += dt;
      const q = Math.max(0, Math.min(1, state.hookeTimer / hookeStageDurations[1]));
      state.progress = Math.min(1, (state.hookeResults.length + q * .8) / hookeForcesN.length);
      state.toast = q < .3 ? 'A 100 g slotted mass lifts from its tray and moves above the hanger.' : q < .58 ? 'The mass seats on the hanger and the spring extends under the new force.' : q < .9 ? 'The hanger oscillates with decreasing amplitude; wait until the pointer is still.' : 'The final oscillation is dying away and the pointer is settling exactly beside the ruler mark.';
      if (q >= 1) {
        state.hookeStage = 2; state.hookeTimer = hookeStageDurations[1]; state.running = false;
        stageJustSettled = true;
        state.toast = `${state.hookeForceN.toFixed(1)} N settled: read ${hookeTotalLengthCm().toFixed(1)} cm total length, then subtract 20.0 cm to find ${hookeExtensionCm().toFixed(1)} cm extension.`;
      }
    }
    if (!skipDraw && (state.running || state.complete || stageJustSettled || state.hookeFocusModal)) draw();
    return;
  }
  if (id === 'specificheat') {
    if (state.running && state.shcStage === 1) {
      state.shcTimer += dt; state.time += dt;
      const q = Math.max(0, Math.min(1, state.shcTimer / shcStageDurations[1]));
      state.progress = q * .18;
      state.toast = q < .29 ? 'The applicator places one small thermal-paste bead into each pre-drilled bore.' : q < .62 ? 'The close-fitting foam jacket and bored lid fly in and close snugly around the block.' : 'With the insulation fully closed, the cartridge heater and temperature probe lower through the lid into their separate bores.';
      if (q >= 1) {
        state.shcStage = 2; state.shcTimer = 0; state.running = false; state.shcTemperatureC = 20; state.temp = 20;
        state.toast = 'Preparation complete: mass 1.00 kg, initial temperature 20.0 °C and joulemeter 0 J. Start the 24.0 W heating run.';
      }
    } else if (state.running && state.shcStage === 3) {
      state.shcTimer += dt;
      const q = Math.max(0, Math.min(1, state.shcTimer / shcStageDurations[3]));
      state.time = 750 * q; state.shcEnergyJ = +(18000 * q).toFixed(0); state.shcTemperatureC = shcTemperatureForEnergy(state.shcEnergyJ); state.temp = state.shcTemperatureC; state.progress = .18 + q * .72;
      for (let i = 0; i < shcEnergyReadingsJ.length; i++) if (q + 1e-6 >= i / (shcEnergyReadingsJ.length - 1) && !state.shcResults.some(item => item.energy_j === shcEnergyReadingsJ[i])) { const temperature = shcTemperatureForEnergy(shcEnergyReadingsJ[i]); state.shcResults.push({ time_s: i * 150, energy_j: shcEnergyReadingsJ[i], temperature_c: temperature, temperature_rise_c: +(temperature - 20).toFixed(1) }); }
      state.shcResults.sort((a, b) => a.energy_j - b.energy_j); syncSpecificHeatGraphPoints();
      state.toast = q < .2 ? `The heater begins transferring energy into the ${currentShcMaterial().label.toLowerCase()}.` : q < .82 ? `Heating: ${(state.shcEnergyJ / 1000).toFixed(2)} kJ transferred; probe ${state.shcTemperatureC.toFixed(1)} °C.` : 'Approaching the final temperature; insulation reduces heat loss.';
      if (q >= 1) {
        state.shcEnergyJ = 18000; state.shcTemperatureC = shcFinalTemperatureC(); state.temp = state.shcTemperatureC; state.shcStage = 4; state.shcTimer = shcStageDurations[3]; state.running = false; state.progress = .92; syncSpecificHeatGraphPoints();
        state.toast = `Supply off. Final readings: 18,000 J and ${state.shcTemperatureC.toFixed(1)} °C, so Δθ = ${shcTemperatureRiseC().toFixed(1)} °C.`;
      }
    }
    if (!skipDraw && (state.running || state.complete || state.shcStage > 0)) draw();
    return;
  }
  if (id === 'latentheat') {
    if (state.running && state.latentStage === 1) {
      state.latentTimer += dt; state.time = state.latentTimer;
      const q = latentClamp(state.latentTimer / latentStageDurations[1]); state.progress = q * .12;
      state.toast = q < .32 ? 'The filled boiling tube lifts from its rack and arcs above the water bath.' : q < .68 ? 'The tube lowers into the warm-water beaker while the rubber-lined clamp closes around its neck.' : 'The thermometer slides down centrally; its bulb stops fully inside the solid sample without touching the glass.';
      if (q >= 1) { state.latentStage = 2; state.latentTimer = 0; state.time = 0; state.running = false; state.progress = .12; state.toast = `Apparatus ready: ${currentLatentMaterial().label.toLowerCase()} at 20.0 °C. Start gentle heating and record every 40 simulated seconds.`; }
    } else if (state.running && state.latentStage === 3) {
      state.latentTimer = Math.min(latentStageDurations[3], state.latentTimer + dt);
      const q = latentClamp(state.latentTimer / latentStageDurations[3]); state.time = q * latentSimulatedStageSeconds; state.latentTemperatureC = +latentHeatingTemperature(q).toFixed(1); state.temp = state.latentTemperatureC; state.latentPhaseFraction = latentPhaseFractionFor(3, q); state.progress = .12 + q * .46;
      latentSampleTimesS.forEach(sampleTime => { if (state.time + 1e-6 < sampleTime || state.latentHeatingResults.some(item => item.time_s === sampleTime)) return; const sampleQ = sampleTime / latentSimulatedStageSeconds, fraction = latentPhaseFractionFor(3, sampleQ); state.latentHeatingResults.push({ time_s: sampleTime, temperature_c: +latentHeatingTemperature(sampleQ).toFixed(1), phase: fraction < .08 ? 'solid' : fraction > .92 ? 'liquid' : 'melting' }) });
      state.latentHeatingResults.sort((a, b) => a.time_s - b.time_s); syncLatentHeatGraphPoints();
      state.toast = q < .28 ? `The solid sample is warming: ${state.latentTemperatureC.toFixed(1)} °C.` : q < .65 ? `Melting plateau near ${currentLatentMaterial().meltingPointC} °C: energy is breaking intermolecular attractions while temperature changes very little.` : `The sample is fully liquid and its temperature rises again: ${state.latentTemperatureC.toFixed(1)} °C.`;
      if (q >= 1) { state.latentStage = 4; state.latentTimer = latentStageDurations[3]; state.time = latentSimulatedStageSeconds; state.latentTemperatureC = currentLatentMaterial().highTemperatureC; state.temp = state.latentTemperatureC; state.latentPhaseFraction = 1; state.running = false; state.progress = .58; syncLatentHeatGraphPoints(); state.toast = `Heating curve complete at ${state.latentTemperatureC.toFixed(1)} °C. Turn off the Bunsen and start the cooling record immediately.`; }
    } else if (state.running && state.latentStage === 5) {
      state.latentTimer = Math.min(latentStageDurations[5], state.latentTimer + dt);
      const q = latentClamp(state.latentTimer / latentStageDurations[5]); state.time = q * latentSimulatedStageSeconds; state.latentTemperatureC = +latentCoolingTemperature(q).toFixed(1); state.temp = state.latentTemperatureC; state.latentPhaseFraction = latentPhaseFractionFor(5, q); state.progress = .58 + q * .42;
      latentSampleTimesS.forEach(sampleTime => { if (state.time + 1e-6 < sampleTime || state.latentCoolingResults.some(item => item.time_s === sampleTime)) return; const sampleQ = sampleTime / latentSimulatedStageSeconds, fraction = latentPhaseFractionFor(5, sampleQ); state.latentCoolingResults.push({ time_s: sampleTime, temperature_c: +latentCoolingTemperature(sampleQ).toFixed(1), phase: fraction < .08 ? 'solid' : fraction > .92 ? 'liquid' : 'freezing' }) });
      state.latentCoolingResults.sort((a, b) => a.time_s - b.time_s); syncLatentHeatGraphPoints();
      state.toast = q < .26 ? `The liquid cools rapidly at first: ${state.latentTemperatureC.toFixed(1)} °C.` : q < .66 ? `Freezing plateau near ${currentLatentMaterial().meltingPointC} °C: latent heat is released as the sample solidifies.` : `The solid sample now cools toward room temperature: ${state.latentTemperatureC.toFixed(1)} °C.`;
      if (q >= 1) { state.latentStage = 6; state.latentTimer = latentStageDurations[5]; state.time = latentSimulatedStageSeconds; state.latentTemperatureC = 24; state.temp = 24; state.latentPhaseFraction = 0; state.running = false; state.complete = true; state.progress = 1; state.tab = 'graph'; syncLatentHeatGraphPoints(); state.toast = `Both curves are complete. The heating and cooling plateaux centre near ${currentLatentMaterial().meltingPointC} °C, showing latent heat transfer during the change of state.`; }
    }
    if (!skipDraw && (state.running || state.complete || state.latentStage > 0)) draw();
    return;
  }
  if (id === 'ivdevices') {
    let visualChanged = false;
    if (state.ivStage === 1) {
      state.ivTimer = Math.min(ivSweepDurationS, state.ivTimer + dt); state.time += dt; state.ivPulseClock += dt;
      state.ivSupplyV = ivSweepSupply(state.ivTimer); const live = ivElectricalReading(currentIvDevice().id, state.ivSupplyV); state.ivDeviceV = live.voltage_v; state.ivCurrentA = live.current_a;
      const sampleIndex = Math.min(ivSweepLevelsV.length - 1, Math.floor(state.ivTimer / ivSweepIntervalS + 1e-6));
      for (let index = state.ivLastSampleIndex + 1; index <= sampleIndex; index++) {
        const reading = ivElectricalReading(currentIvDevice().id, ivSweepLevelsV[index]), existing = state.ivSweepReadings.findIndex(item => item.supply_v === reading.supply_v);
        if (existing >= 0) state.ivSweepReadings[existing] = reading; else state.ivSweepReadings.push(reading);
      }
      state.ivLastSampleIndex = sampleIndex; const midpoint = ivSweepIntervalS * 9;
      state.toast = state.ivTimer < ivSweepIntervalS * 7 ? `${currentIvDevice().short}: increasing the forward supply — ${state.ivDeviceV.toFixed(2)} V across the device, ${(state.ivCurrentA * 1000).toFixed(1)} mA.` : state.ivTimer < midpoint ? 'The switch opens at 0 V. The polarity plugs cross over smoothly before the reverse sweep begins.' : `${currentIvDevice().short}: reverse-polarity sweep — ${state.ivDeviceV.toFixed(2)} V, ${(state.ivCurrentA * 1000).toFixed(1)} mA.`;
      state.progress = Math.min(.98, (state.ivResults.length + state.ivTimer / ivSweepDurationS * .82) / ivDeviceDefinitions.length); visualChanged = true;
      if (state.ivTimer >= ivSweepDurationS) {
        state.ivSweepReadings = Array.from({ length: 13 }, (_, index) => ivElectricalReading(currentIvDevice().id, index - 6));
        const final = ivElectricalReading(currentIvDevice().id, -6); state.ivSupplyV = final.supply_v; state.ivDeviceV = final.voltage_v; state.ivCurrentA = final.current_a;
        state.ivStage = 2; state.running = false; state.toast = `${currentIvDevice().short} sweep complete with 13 settled readings from −6 V to +6 V. Save this curve before changing components.`;
      }
    } else if (state.ivStage === 4) {
      state.ivDeviceTransition = Math.min(1, state.ivDeviceTransition + dt / ivDeviceChangeDurationS); state.ivTimer += dt; state.ivSupplyV = 0; state.ivDeviceV = 0; state.ivCurrentA = 0; visualChanged = true;
      const q = state.ivDeviceTransition; state.toast = q < .28 ? 'The switch opens and the active component lifts vertically from the spring terminals.' : q < .78 ? `The ${currentIvDevice().label.toLowerCase()} glides in from outside the visible workbench.` : 'The module lowers into the two test sockets; both contacts close before the supply can be energised.';
      if (q >= 1) { state.ivStage = 0; state.ivTimer = 0; state.running = false; state.ivPreviousDeviceIndex = state.ivDeviceIndex; state.toast = `${currentIvDevice().label} seated. The power pack is at 0 V and the circuit is ready for its positive and negative sweep.` }
    }
    if (visualChanged && !skipDraw) draw();
    return;
  }
  if (id === 'wirelength') {
    const stage = state.wireStage || 0;
    if (state.running && wireStageDurations[stage]) {
      state.wireTimer += dt;
      state.time += dt;
      const q = Math.max(0, Math.min(1, state.wireTimer / wireStageDurations[stage]));
      if (stage === 1) {
        state.progress = Math.min(1, (state.wireResults.length + q * .72) / wireLengthsCm.length);
        state.toast = q < .34 ? 'The power pack turns on and its output indicator lights.' : q < .78 ? 'The ammeter and voltmeter digits settle without heating the wire.' : `Steady readings: ${state.wireVoltageV.toFixed(2)} V and ${wireCurrent().toFixed(2)} A. Turn the power pack off promptly.`;
        if (q >= 1) {
          state.wireStage = 2; state.wireTimer = 0; state.running = false;
          state.toast = `Meters steady at ${state.wireVoltageV.toFixed(2)} V and ${wireCurrent().toFixed(2)} A. Turn the power pack off to record and calculate R = V ÷ I.`;
        }
      } else if (stage === 4) {
        state.toast = q < .24 ? 'The black crocodile jaws open and lift from the nichrome wire.' : q < .76 ? 'The clip glides above the metre ruler to the next measured position.' : 'The clip lowers and its serrated jaws close firmly on the wire.';
        if (q >= 1) {
          state.wireTrialIndex = Math.min(wireLengthsCm.length - 1, state.wireResults.length);
          state.wireLengthCm = wireLengthsCm[state.wireTrialIndex];
          state.wireStage = 0; state.wireTimer = 0; state.running = false;
          state.toast = `Sliding contact set to ${state.wireLengthCm} cm. The power pack remains off so the wire can cool before the next reading.`;
        }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (id === 'nuclear') {
    let visualChanged = false;
    if (state.nuclearSourceTransition < 1) {
      state.nuclearSourceTransition = Math.min(1, state.nuclearSourceTransition + dt / nuclearSourceTransitionDuration); visualChanged = true;
      if (state.nuclearSourceTransition >= 1) {
        state.nuclearPreviousSource = state.nuclearSource;
        state.nuclearStage = state.nuclearSource ? (state.nuclearAbsorber ? 4 : 2) : 0;
        state.toast = state.nuclearSource ? `${nuclearSources[state.nuclearSource].isotope} is locked in the source holder. The aperture, absorber slot and GM tube window are aligned.` : 'The active position is empty and all sealed sources are secure in the shielded store.';
      }
    }
    if (state.nuclearAnimProgress < 1) {
      state.nuclearAnimProgress = Math.min(1, state.nuclearAnimProgress + dt / nuclearAbsorberTransitionDuration); visualChanged = true;
      if (state.nuclearAnimProgress >= 1) {
        state.nuclearAnimAbsorber = state.nuclearAbsorber; state.nuclearStage = state.nuclearSource ? 4 : 0;
        state.toast = state.nuclearAbsorber ? `${nuclearAbsorbers[state.nuclearAbsorber].short} is seated in the holder. The source–detector distance has not changed.` : 'The absorber holder is empty. The direct source–detector path is clear.';
      }
    }
    if (state.running) {
      const before = state.nuclearCount, target = nuclearTargetCount10s();
      state.nuclearTimer = Math.min(10, state.nuclearTimer + dt); state.time += dt; state.nuclearPulseClock += dt;
      const q = Math.max(0, Math.min(1, state.nuclearTimer / 10));
      state.nuclearCount = Math.min(target, Math.floor(target * q + .0001));
      if (state.nuclearCount > before) playGeigerClick();
      if (state.nuclearTimer >= 10) {
        state.running = false; state.nuclearStage = 6;
        const result = { source: nuclearSources[state.nuclearSource].id, isotope: nuclearSources[state.nuclearSource].isotope, radiation: nuclearSources[state.nuclearSource].symbol, absorber: nuclearAbsorbers[state.nuclearAbsorber].id, count_10s: state.nuclearCount, count_rate_cpm: state.nuclearCount * 6, transmission_fraction: +nuclearTransmissionFraction().toFixed(3) };
        const key = `${result.source}:${result.absorber}`, existing = state.nuclearResults.findIndex(item => `${item.source}:${item.absorber}` === key);
        if (existing >= 0) state.nuclearResults[existing] = result; else state.nuclearResults.push(result);
        const canonical = [['alpha', 'paper'], ['beta', 'aluminium'], ['gamma', 'lead']];
        const completedComparisons = canonical.filter(([source, absorber]) => state.nuclearResults.some(item => item.source === source && item.absorber === absorber)).length;
        state.progress = completedComparisons / canonical.length; state.complete = completedComparisons === canonical.length;
        state.toast = `${nuclearSources[state.nuclearSource].symbol} with ${nuclearAbsorbers[state.nuclearAbsorber].label}: ${state.nuclearCount} counts in 10 s = ${state.nuclearCount * 6} counts min⁻¹.${state.complete ? ' The three key penetration comparisons are complete.' : ''}`;
      } else {
        state.toast = `GM tube counting ${nuclearSources[state.nuclearSource].symbol} radiation through ${nuclearAbsorbers[state.nuclearAbsorber].label}… ${Math.max(0, 10 - state.nuclearTimer).toFixed(1)} s remaining.`;
      }
      visualChanged = true;
    }
    if (visualChanged && !skipDraw) draw();
    return;
  }
  if (id === 'fieldlines') {
    const stage = state.fieldStage || 0;
    if (state.running && fieldStageDurations[stage]) {
      state.fieldTimer += dt;
      state.time += dt;
      const q = Math.max(0, Math.min(1, state.fieldTimer / fieldStageDurations[stage]));
      if (stage === 1) {
        state.progress = Math.min(1, (state.fieldResults.length + q * .35) / fieldConfigurations.length);
        state.toast = q < .25 ? 'The shaker lifts and tilts over the near edge of the paper.' : q < .82 ? 'Fine filings fall in overlapping passes and settle as separate grains.' : 'The shaker returns upright; the loose filings are spread evenly across the paper.';
        if (q >= 1) {
          state.fieldStage = 2; state.fieldTimer = 0; state.running = false;
          state.toast = 'The filings are scattered but not yet ordered. Tap the paper support gently so they can rotate into the field pattern.';
        }
      } else if (stage === 3) {
        state.toast = q < .2 ? 'The tapping tool approaches the paper support.' : q < .78 ? 'Small taps make the filings hop, rotate and link into curved chains.' : 'The last loose grains settle, revealing the complete magnetic field pattern.';
        if (q >= 1) {
          state.fieldStage = 4; state.fieldTimer = 0; state.running = false;
          state.toast = `${fieldConfigurations[state.fieldConfigIndex].label}: ${fieldConfigurations[state.fieldConfigIndex].observation}`;
        }
      } else if (stage === 5) {
        state.toast = q < .42 ? 'A soft brush sweeps the used filings into the collection lip.' : q < .76 ? 'The previous magnet arrangement slides out below the clear support.' : 'The next bar-magnet arrangement slides into its marked position below fresh paper.';
        if (q >= 1) {
          state.fieldConfigIndex = Math.min(fieldConfigurations.length - 1, state.fieldResults.length);
          state.fieldStage = 0; state.fieldTimer = 0; state.running = false;
          state.toast = `${fieldConfigurations[state.fieldConfigIndex].label} is fixed below fresh paper. Sprinkle the same thin mass of filings.`;
        }
      }
    }
    if (!skipDraw && (state.running || state.complete)) draw();
    return;
  }
  if (free || !state.running || state.complete) { if (animating && !skipDraw) draw(); return }
  state.time += dt; state.progress = Math.min(1, state.progress + dt / 10);
  if (id === 'temp') state.temp = 25 + 17 * Math.sin(state.progress * Math.PI / 2); else if (id === 'rates') state.temp = 25 + 3 * state.progress; else if (id === 'water') { state.temp = 25 + 72 * state.progress; state.volume = Math.max(0, 50 * (state.progress - .18) / .82) } else if (id === 'salts') state.temp = 25 + (state.burner ? 68 : 8) * state.progress; else if (id === 'electro') state.temp = 25; else state.temp = 25 + 6 * state.progress;
  state.ph = id === 'temp' ? Math.max(1, 13 - 12 * state.progress) : id === 'salts' ? 2 + 3 * state.progress : 7;
  if (id !== 'electro' && Math.floor(state.time * 2) % 2 === 0 && state.points.length < 12) { const last = state.points.at(-1); if (!last || state.time - last.t > 1.2) state.points.push(graphReading()) }
  if (state.progress >= 1) { state.complete = true; state.running = false; state.toast = id === 'water' ? 'Distillation complete — pure liquid water has condensed in the receiver. Switch off the heater, then the cooling water.' : id === 'electro' ? 'Electrolysis complete — select RECORD MASSES to remove and weigh the copper-coated cathode.' : id === 'co2' ? 'Limewater is milky: carbon dioxide confirmed. Review the bird’s-eye observation.' : 'Complete — review your plotted results.' }
  if (!skipDraw) draw()
}

function parseExternalBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized.length) return fallback;
  if (['1', 'true', 'yes', 'on', 'focus', 'focused'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'unfocus', 'exit'].includes(normalized)) return false;
  return fallback;
}

function isPhotosynthesisInvestigation(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['pondweed', 'photosynthesis', 'light-intensity-pondweed', 'light_intensity_pondweed'].includes(normalized);
}

function openPondweedInvestigation(options = {}) {
  const requestedFocus = options.focusMode;
  const selectedIndex = practicals.findIndex(p => p.id === 'pondweed');
  if (selectedIndex < 0) return false;

  state.subject = 'biology';
  state.selected = selectedIndex;
  state.running = false;
  state.complete = false;
  state.progress = 0;
  state.points = [];
  state.temp = 25;
  state.volume = 0;
  state.ph = 7;
  state.burner = false;
  state.coolingWater = false;
  state.transferred = 0;
  state.pour = null;
  state.drag = null;
  state.dose = null;
  state.graphModal = false;
  state.evaluationModal = false;
  state.reactantSafety = null;
  state.hookeFocusModal = false;
  state.hookeFocusProgress = 0;
  state.methodDropdown = false;
  state.tab = 'bench';

  activatePondweed('RESET PRACTICAL');
  state.focusMode = typeof requestedFocus === 'boolean' ? requestedFocus : true;
  if (state.focusMode) {
    state.toast = 'Photosynthesis investigation loaded in focus mode.';
  }
  draw();
  return true;
}

function applyPhotosynthesisFocusFromUrl() {
  const params = new URLSearchParams(window.location.search || '');
  if (!params.toString()) return;

  const pondweedFocusRaw = params.get('pondweed-focus');
  if (pondweedFocusRaw != null) {
    const enabled = parseExternalBoolean(pondweedFocusRaw, true);
    openPondweedInvestigation({ focusMode: enabled });
    return;
  }

  const investigation = params.get('investigation') || params.get('practical') || params.get('experiment') || params.get('lab');
  if (!isPhotosynthesisInvestigation(investigation)) return;

  const focusRaw = params.get('focus') ?? params.get('focusMode') ?? params.get('mode');
  const enabled = parseExternalBoolean(focusRaw, true);
  openPondweedInvestigation({ focusMode: enabled });
}

function installPhotosynthesisMessageApi() {
  window.addEventListener('message', event => {
    const data = event?.data;
    if (!data || typeof data !== 'object') return;

    const type = typeof data.type === 'string' ? data.type : '';
    const action = typeof data.action === 'string' ? data.action : '';
    const cmd = typeof data.cmd === 'string' ? data.cmd : '';

    const isDirectOpen = type === 'cvl:photosynthesis-focus' || action === 'photosynthesis-focus' || cmd === 'photosynthesis-focus';
    const isInvestigationOpen = type === 'cvl:open-investigation' || action === 'open-investigation' || cmd === 'open-investigation';
    if (!isDirectOpen && !isInvestigationOpen) return;

    const requestedInvestigation = data.investigation || data.practical || data.experiment || 'pondweed';
    if (isInvestigationOpen && !isPhotosynthesisInvestigation(requestedInvestigation)) return;

    const enabled = parseExternalBoolean(data.focusMode ?? data.focus ?? data.enabled, true);
    const ok = openPondweedInvestigation({ focusMode: enabled });

    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage(
        {
          type: 'cvl:photosynthesis-focus:ack',
          ok,
          practical: ok ? 'pondweed' : null,
          focusMode: ok ? state.focusMode : null
        },
        event.origin || '*'
      );
    }
  });
}

let last = performance.now(), animationFrameId = 0, animationTimerId = 0;
function simulationFrameMode() {
  if (document.hidden || portraitPromptVisible || window.__manualSimulationTime) return 'idle';
  const id = practicals[state.selected]?.id;
  const active = state.running || state.burner || state.coolingWater || state.electroWeighing || state.pour || state.drag || state.massTransfer ||
    (state.reaction && !state.reaction.complete) || state.particles.length || lab3d.isTransitioning || lab3d.bunsenTransitionActive ||
    state.workspace.some(item => item.type === 'bunsen' && item.lit) || state.workspace.some(item => item.type === 'beaker' && (item.temperature || 20) > 20.05);
  if (active) return 'active';
  const ambient = ['quadrats', 'capture', 'shoretransect'].includes(id) ||
    id === 'ripple' && (state.rippleStage || 0) >= 3 ||
    id === 'pondweed' && state.pondweedLampOn ||
    id === 'thermal' && (state.thermalStage || 0) >= 1 ||
    state.complete && ['potometer', 'convection', 'conduction', 'fieldlines'].includes(id);
  return ambient ? 'ambient' : 'idle';
}
function requestSimulationFrame() {
  const mode = simulationFrameMode();
  if (mode === 'idle') return;
  if (mode === 'active') {
    if (animationTimerId) { clearTimeout(animationTimerId); animationTimerId = 0 }
    if (!animationFrameId) animationFrameId = requestAnimationFrame(loop);
    return;
  }
  if (!animationFrameId && !animationTimerId) {
    animationTimerId = setTimeout(() => {
      animationTimerId = 0;
      animationFrameId = requestAnimationFrame(loop);
    }, 50);
  }
}
function loop(now) {
  animationFrameId = 0;
  const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (!window.__manualSimulationTime) update(dt);
  requestSimulationFrame();
}
window.__labPerformance = {
  frameMode: () => simulationFrameMode(),
  rendererLoaded: () => lab3d.available,
  rendererLoading: () => !lab3d.available && !!lab3d.loading
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (animationTimerId) clearTimeout(animationTimerId);
    animationFrameId = 0; animationTimerId = 0;
  } else {
    last = performance.now();
    draw();
  }
});
window.advanceTime = ms => { for (let t = 0; t < ms; t += 16.67)update(1 / 60, true); draw() };
window.__lab = { state, practicals, assessment, draw, getRegions: () => regions, getScale: () => UI_SCALE };
window.render_game_to_text = () => {
  const p = practicals[state.selected], id = p.id, free = id === 'free', chrom = id === 'chrom', spec = free || ['mass', 'displacement', 'starchleaf', 'quadrats', 'shoretransect', 'ripple', 'convection', 'conduction', 'thermal', 'fieldlines'].includes(id) ? null : currentGraphSpec(), freeBurnerLit = state.workspace.some(it => it.type === 'bunsen' && it.lit), snapTargets = free ? state.workspace.filter(it => it.type === 'tripod').map(it => { const point = tripodGauzeScreenPoint(it); return { uid: it.uid, x: Math.round(point?.x || it.x), y: Math.round(point?.y || it.y) } }) : [];
  const massLidTarget = id === 'mass' && state.massStage === 2 && state.massLidOn && state.layout?.lid ? { x: Math.round(state.layout.lid.x), y: Math.round(state.layout.lid.y) } : null;
  const stageNames = ['ready', 'pouring acid', 'collecting hydrogen', 'sealed and ready to test', 'igniting hydrogen', 'test complete'], hydrogenStage = state.hydrogenStage, hydrogenT = state.hydrogenTimer, thumbPose = id === 'hydrogen' ? (hydrogenStage === 0 || hydrogenStage === 2 || hydrogenStage === 3 ? 'sealed' : hydrogenStage === 1 ? (hydrogenT < .48 ? 'withdrawing' : hydrogenT < 1.55 ? 'clear for pouring' : hydrogenT < 2.07 ? 'resealing' : 'sealed') : hydrogenStage === 4 ? (hydrogenT < .3 ? 'withdrawing for splint' : 'clear for splint') : 'clear') : null, thumbSealing = thumbPose === 'sealed', acidT = state.pour?.t || 0, acidTransfer = state.pour ? { phase: acidT < .9 ? 'lifting and approaching' : acidT < 1.1 ? 'tilting' : acidT < 2.5 ? 'pouring' : acidT < 2.78 ? 'uprighting' : 'returning', elapsed_s: +acidT.toFixed(2), fraction: +state.transferred.toFixed(2), from: 'HCl(aq) conical flask', to: id === 'temp' ? 'NaOH(aq) conical flask' : 'sodium thiosulfate conical flask', lip_alignment: 'source lip centred vertically above receiver opening', lip_horizontal_error_world: +(lab3d.pourAlignment?.horizontalError || 0).toFixed(4), lip_clearance_world: +(lab3d.pourAlignment?.verticalClearance || 0).toFixed(3) } : null;
  const saltTimer = state.saltsTimer || 0, saltMoveQ = Math.max(0, Math.min(1, saltTimer / 2.8)), saltFrontQ = Math.max(0, Math.min(1, saltMoveQ / .62)), saltDropQ = Math.max(0, Math.min(1, (saltMoveQ - .62) / .38));
  const saltPhase = state.saltsStage === 4 ? (saltTimer < 1.736 ? 'moving basin forward clear of gauze' : saltTimer < 2.8 ? 'lowering basin onto bench' : 'crystallising on bench') : state.saltsStage === 3 ? 'heating and evaporating' : state.saltsStage === 2 ? 'filtering mixture' : state.saltsStage === 1 ? 'adding copper oxide' : 'acid ready';
  return JSON.stringify({ coordinates: 'origin top-left, x right, y down', id, subject: p.subject, renderer: { ...lab3d.info, legacy_2d_apparatus: !lab3d.available }, mode: free ? 'free workspace' : 'guided practical', practical: p.title, objective: p.objective, symbol_equation: p.eq, word_equation: p.word, tab: state.tab, focus_mode: state.focusMode, method_dropdown: state.methodDropdown, graph_modal: { open: state.graphModal }, evaluation_modal: { open: state.evaluationModal }, running: state.running, complete: state.complete, practical_evaluation: free ? null : { position: 'below guidance', section_heading: 'PRACTICAL EVALUATION', button_label: 'OPEN EVALUATION', ready: state.complete, appearance: state.complete ? 'filled teal with glow' : 'outlined pale teal' }, dragging: state.drag?.kind || null, pouring: !!state.pour, acid_transfer: acidTransfer, bunsen_lit: free ? freeBurnerLit : state.burner, magnesium_glow: id === 'mass' && state.massStage === 4 && state.running, dose_dialog: state.dose && { reactant: state.dose.reactantId, amount: state.dose.amount, target: state.dose.targetUid }, tripod_gauze_snap_targets: snapTargets, workspace_items: state.workspace.map(it => ({ uid: it.uid, type: it.type, x: Math.round(it.x), y: Math.round(it.y), lit: !!it.lit, snapped_to: it.snappedTo || null, temperature_c: +(it.temperature || 20).toFixed(1), heating: !!it.heating, ...(isPhVessel(it) ? { liquid_ph: Number.isFinite(it.ph) ? +it.ph.toFixed(2) : null } : {}), ...(it.type === 'phmeter' ? { form: 'one continuous red tapered pencil-like probe', attached_to: it.attachedTo || null, auto_positioned: !!it.attachedTo, display_location: 'built into wider top section', display_surface: 'curved cylindrical arc following the upper housing', display_ph: phMeterReading(it) == null ? null : +phMeterReading(it).toFixed(2), raised_for_nib_visibility: true, metallic_sensor_nib_visible: true, nib_state: it.attachedTo ? 'visible and immersed in sample' : 'visible above worktop' } : {}), ...(it.type === 'bunsen' ? { gas_tap: 'white enamel', gas_valve: it.lit ? 'open' : 'closed', hose: 'attached', main_tube: 'hollow with chamfered wider mouth', base_profile: 'circular hyperbolic rise', base_top_sealed_to_main_tube: true, base_barrel_radial_clearance_scene_units: .001, base_intake_clearance_sector_degrees: 35, air_intake_valve: 'raised above the base-to-barrel seal', gas_connector_raised_with_valve: true } : {}), contents: it.contents })), mass_practical: id === 'mass' ? { stage: state.massStage, lid_on: state.massLidOn, lid_click_target: massLidTarget, material: state.massStage >= 5 ? 'flaky white magnesium oxide' : 'coiled magnesium ribbon', transfer: state.massTransfer?.direction || null, before_g: state.massBefore, after_g: state.massAfter } : null, salt_practical: id === 'salts' ? { stage: state.saltsStage, phase: saltPhase, timer_s: +state.saltsTimer.toFixed(2), basin_geometry: 'thick ceramic evaporating dish with rounded rolled lip', basin_transfer: state.saltsStage === 4 ? { front_progress: +saltFrontQ.toFixed(2), lowering_progress: +saltDropQ.toFixed(2), front_clear_of_gauze: saltFrontQ >= 1 } : null } : null, hydrogen_practical: id === 'hydrogen' ? { stage: state.hydrogenStage, phase: stageNames[state.hydrogenStage], timer_s: +state.hydrogenTimer.toFixed(2), test_tube_contents: state.hydrogenStage === 0 ? 'coiled magnesium ribbon' : 'magnesium ribbon + dilute hydrochloric acid', measuring_cylinder_hcl_ml: +(15 * (1 - state.transferred)).toFixed(1), thumb_pose: thumbPose, thumb_sealing: thumbSealing, bubbles_visible: state.hydrogenStage === 1 || state.hydrogenStage === 2, gas_volume_cm3: +state.hydrogenGas.toFixed(1), lit_splint_visible: state.hydrogenStage === 4, flame_travelling: state.hydrogenStage === 4 && state.hydrogenTimer >= .4 && state.hydrogenTimer < .88, squeaky_pop_played: state.hydrogenAudioPlayed } : null, thermometer_visual: id === 'temp' ? { position: 'centred in receiver flask', length_multiplier: 2, graduations: 'short curved white bands on the front section of the glass', temperature_c: +state.temp.toFixed(1), alcohol_fraction: +Math.max(0, Math.min(1, (state.temp - 20) / 28)).toFixed(2) } : null, time_s: +state.time.toFixed(1), temperature_c: +state.temp.toFixed(1), volume_ml: +state.volume.toFixed(1), ph: +state.ph.toFixed(1), progress: +state.progress.toFixed(2), chromatography_dyes: chrom ? { separation: +state.progress.toFixed(2), initial_spot: 'single black ink dot', baseline: 'graphite pencil line', solvent_front_cm: +(chromSolventDistanceCm * state.progress).toFixed(1), solvent_front_mode: state.progress >= .94 ? 'pencil line drawn' : 'water soaking upward', paper_wet_fraction: +state.progress.toFixed(2), selected_pigment: state.chromSelectedDye, pigments: chromMeasurementData() } : null, graph_axes: spec && id !== 'chrom' ? { x: spec.xLabel, y: spec.yLabel } : null, results_columns: id === 'mass' ? ['measurement', 'mass / g'] : id === 'electro' ? ['electrode', 'polarity', 'before_g', 'after_g', 'change_g'] : null, graph_readings: state.points.length, last_graph_reading: state.points.at(-1) && { x: +state.points.at(-1).xValue.toFixed(2), y: +state.points.at(-1).yValue.toFixed(2) }, guidance: state.toast, controls: free ? ['Equipment and Reactant Shelf tabs', 'click or drag equipment', 'pH meter auto-positions into beakers and test tubes', 'drag a flask or beaker onto tripod gauze to snap', 'align a lit Bunsen below the tripod to heat contents', 'dose slider then ADD DOSE', 'click Bunsen gas tap to open/close valve', 'CLEAR BENCH', 'UNDO LAST', 'F fullscreen'] : id === 'mass' ? ['MOVE TO TRIPOD', 'click crucible lid', 'LIGHT BUNSEN', 'COOL & REWEIGH', 'RESULTS', 'METHOD', 'F fullscreen'] : id === 'hydrogen' ? ['POUR DILUTE HCl', 'TEST WITH LIT SPLINT', 'RECORD', 'GRAPH', 'METHOD', 'F fullscreen'] : id === 'electro' ? ['SWITCH ON', 'RESET', 'RECORD MASSES', 'RESULTS', 'METHOD', 'F fullscreen'] : id === 'chrom' ? ['icon practical cards', 'click or drag reactants below method', 'START/RESET', 'MEASURE pigments', 'click a pigment to measure from the graphite baseline', 'RECORD', 'METHOD', 'F fullscreen'] : ['icon practical cards', 'click or drag reactants below method', 'START/RESET', 'APPLY HEAT', 'RECORD', 'METHOD', 'GRAPH', 'F fullscreen'] })
};
const baseRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => { const payload = JSON.parse(baseRenderGameToText()); if (practicals[state.selected].id === 'water') { const receiving = state.burner && state.coolingWater && !state.complete && state.progress > .22, dripCycle = (state.time * 1.12 + .08) % 1; payload.bunsen_lit = false; payload.electric_heater_on = state.burner; payload.cooling_water_on = state.coolingWater; payload.water_purification = { apparatus: 'round-bottom flask in electric heating mantle with a glass fractionating column, Liebig condenser and receiving beaker', heater_on: state.burner, cooling_water_on: state.coolingWater, cooling_direction: 'lower condenser inlet to upper outlet (counter-current)', cooling_inlet_route: 'around the right side and above the receiving beaker', cooling_inlet_clear_of_receiver: true, cooling_flow_visual: 'smooth travelling translucency changes', coolant_transition_smooth: true, flow_particle_markers: false, receiver_fill_continuous: true, condensate_drop_visible: receiving && dripCycle < .81, splash_visible: receiving && dripCycle >= .78, splash_droplets: 6, water_sample_label_offset_px: 28, distillation_thermometer_marks: 9, distillation_thermometer_mark_shape: 'partial curved bands around the glass tube', distillation_thermometer_temperature_c: +state.temp.toFixed(1), distillation_thermometer_alcohol_fraction: +Math.max(0, Math.min(1, (state.temp - 25) / 72)).toFixed(2), boiling: state.running && state.progress > .16, vapour_visible: state.running && state.progress > .2, condensate_visible: (state.running || state.complete) && state.progress > .25, distillate_collected_ml: +state.volume.toFixed(1) }; payload.controls = ['WATER ON/OFF', 'HEATER ON/OFF', 'RECORD', 'METHOD', 'GRAPH', 'F fullscreen'] } return JSON.stringify(payload) };
const priorRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => { const payload = JSON.parse(priorRenderGameToText()); if (practicals[state.selected].id === 'free' && state.reaction) { payload.free_reaction = { rule_id: state.reaction.ruleId, phase: state.reaction.complete ? 'complete' : 'reacting', progress: +state.reaction.progress.toFixed(2), target_uid: state.reaction.targetUid, symbol_equation: state.reaction.symbol, word_equation: state.reaction.word, product: state.reaction.product, gas: state.reaction.gas, precipitate: state.reaction.precipitate } } return JSON.stringify(payload) };
const electroAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => { const payload = JSON.parse(electroAwareRenderGameToText()); if (practicals[state.selected].id === 'electro') { const masses = electroMassData(); payload.bunsen_lit = false; payload.graph_axes = null; payload.results_columns = ['electrode', 'polarity', 'before_g', 'after_g', 'change_g']; payload.electrolysis = { apparatus: 'two graphite electrodes held by crocodile clips and insulated leads connected to a 6 V DC laboratory power pack', circuit_path: 'power pack terminals → insulated leads → crocodile clips → graphite electrodes', power_pack_on: state.running, cathode: { polarity: 'negative', product: 'copper', copper_deposit_fraction: +state.progress.toFixed(2), ...masses.cathode }, anode: { polarity: 'positive', product: 'chlorine gas', bubbles_visible: state.running, ...masses.anode }, solution: 'copper chloride solution', results_view: 'before and after electrode mass table', masses_recorded: state.electroRecorded }; payload.controls = ['SWITCH ON', 'RESET', 'RECORD MASSES', 'RESULTS', 'METHOD', 'F fullscreen'] } return JSON.stringify(payload) };
const electroWeighAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => { const payload = JSON.parse(electroWeighAwareRenderGameToText()); if (practicals[state.selected].id === 'electro') { payload.electrolysis.apparatus += ' with an electronic balance'; payload.electrolysis.cathode_weighing = { active: state.electroWeighing, phase: electroWeighPhase(), elapsed_s: +state.electroWeighTimer.toFixed(2), balance_reading_g: electroBalanceReading(), electrode_on_balance: state.electroRecorded }; payload.electrolysis.electronic_balance_visible = true } return JSON.stringify(payload) };
const titrationAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => { const payload = JSON.parse(titrationAwareRenderGameToText()); if (practicals[state.selected].id === 'titration') { const phases = ['ready to add indicator', 'indicator added', 'burette tap open', 'dropwise addition', 'endpoint reached', 'titre recorded'], addingIndicator = state.titrationIndicatorTimer > 0, mixingBurstActive = !state.complete && state.titrationIndicator && (state.titrationStage === 2 && state.running || (state.titrationDropTimer || 0) > 0); payload.graph_axes = null; payload.results_columns = ['reading', 'burette_cm3']; payload.titration = { apparatus: '50 cm³ burette supported vertically by a clamp stand, boss and burette clamp above a conical flask on a white tile', burette_contents: '0.100 mol dm⁻³ sodium hydroxide', flask_contents: `25.0 cm³ hydrochloric acid${state.titrationIndicator ? ' with phenolphthalein' : ''}`, stage: state.titrationStage, phase: addingIndicator ? 'adding phenolphthalein' : phases[state.titrationStage], indicator_added: state.titrationIndicator, indicator_addition: addingIndicator ? { phase: 'bottle lifting, tilting and dispensing two drops', progress: +Math.min(1, state.titrationIndicatorTimer / titrationIndicatorDuration).toFixed(2) } : null, burette_initial_reading_cm3: 0, burette_final_reading_cm3: +state.titrationVolume.toFixed(2), titre_cm3: state.complete ? +state.titrationVolume.toFixed(2) : null, dropwise_additions: state.titrationDrops, tap_open: state.titrationStage === 2 && state.running, white_tile: true, flask_colour: state.complete ? 'permanent very pale pink' : 'colourless', transient_pink_mixing_active: mixingBurstActive, transient_pink_mixing_behavior: 'localized pink bloom, surface ripple and wisps at the NaOH impact point that rapidly disperse', endpoint_reached: state.complete, titre_recorded: state.titrationRecorded }; payload.controls = ['ADD INDICATOR', 'OPEN TAP', 'ADD ONE DROP', 'RECORD TITRE', 'RESET PRACTICAL', 'RESULTS', 'METHOD', 'F fullscreen'] } return JSON.stringify(payload) };
const ratesAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => { const payload = JSON.parse(ratesAwareRenderGameToText()); if (practicals[state.selected].id === 'rates') { const phases = ['conditioned in water bath', 'moving from water bath to paper cross', 'centred over paper cross', 'acid addition and timed reaction', 'trial complete'], receiver = ratesReceiverWorld(); payload.graph_axes = { x: 'temperature / °C', y: 'time for cross to disappear / s', chart_type: 'bar chart' }; payload.graph_readings = state.ratesResults.length; payload.rates_practical = { stage: state.ratesStage, phase: state.ratesConditioning ? 'heating in electric water bath' : phases[state.ratesStage], target_temperature_c: state.ratesTargetTemp, water_bath_temperature_c: +state.ratesBathTemp.toFixed(1), electric_water_bath: true, electric_water_bath_finish: 'white enamel', electric_water_bath_walls: 'raised and flush with the base footprint', animated_bath_thermometer: true, flask_position: state.ratesStage === 0 ? 'in water bath' : state.ratesStage === 1 ? 'moving to lab bench' : "centred on paper cross", flask_world_position: { x: +receiver.x.toFixed(2), y: +receiver.y.toFixed(2), z: +receiver.z.toFixed(2) }, paper_cross: true, birds_eye_tab: true, cross_visibility_fraction: +ratesCrossVisibility().toFixed(2), sulfur_turbidity_fraction: +state.progress.toFixed(2), timed_reaction_s: +state.time.toFixed(1), trial_temperatures_c: ratesTemperatures, results: state.ratesResults.map(r => ({ temperature_c: r.temperature, time_s: r.time })), bar_chart: true }; payload.controls = ['MOVE TO CROSS', 'ADD HCl', 'NEXT TEMPERATURE', 'RESET SERIES', 'METHOD', 'GRAPH', "BIRD'S EYE", 'F fullscreen'] } return JSON.stringify(payload) };
const thermiteAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(thermiteAwareRenderGameToText());
  if (practicals[state.selected].id === 'thermite') {
    const t = state.thermiteTimer, fuseProgress = Math.max(0, Math.min(1, (t - 1.1) / 1.5));
    payload.bunsen_lit = false;
    payload.thermite = { phase: thermitePhase(), elapsed_s: +t.toFixed(2), simulated_core_temperature_c: +state.temp.toFixed(0), apparatus: 'sealed refractory reaction cup embedded in a corrugated tin can mostly packed with sand', protective_screen: 'U-shaped heat-resistant glass shield around the rear and sides', ignition: 'magnesium fuse heated remotely by a small blow torch', fuse_reaction: '2Mg(s) + O₂(g) → 2MgO(s)', blow_torch_visible: !state.complete, fuse_burning: state.running && t >= 1.1 && t < 2.6, fuse_disintegrating: state.running && t >= 1.1 && t < 2.6, fuse_remaining_fraction: +(1 - fuseProgress).toFixed(2), magnesium_oxide_powder_fraction: +fuseProgress.toFixed(2), magnesium_oxide_powder_visible: state.running && t >= 1.1 && t < 3.2, ignition_flash: state.running && t >= 2.6 && t < 3.15, spark_fountain: state.running && t >= 2.75 && t < 6.5, molten_iron_visible: (state.running && t >= 3.05) || state.complete, iron_product_form: 'one smooth amorphous metallic blob', iron_afterglow_visible: (state.complete || t >= 6.5) && lab3d.thermiteGlowFraction > .015, iron_glow_fraction: +lab3d.thermiteGlowFraction.toFixed(2), iron_afterglow_fade_s: 4.6, sand_containment: true, simulation_only: true };
    payload.controls = ['IGNITE FUSE', 'RESET PRACTICAL', 'GRAPH', 'METHOD', 'F fullscreen']
  }
  return JSON.stringify(payload)
};
const saltsAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(saltsAwareRenderGameToText());
  if (practicals[state.selected].id === 'salts') {
    payload.graph_axes = null;
    payload.results_view = 'microscope view of copper sulfate crystals';
    payload.controls = ['POUR CuO', 'FILTER MIXTURE', 'HEAT SOLUTION', 'COOL & CRYSTALLISE', 'VIEW RESULTS', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const waterBathAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(waterBathAwareRenderGameToText());
  if (practicals[state.selected].id === 'rates' && payload.rates_practical) {
    payload.rates_practical.water_bath_fill_fraction = .44;
    payload.rates_practical.water_bath_water_level = 'visible shallow blue volume';
    payload.rates_practical.water_bath_submerged_finish = 'white enamel';
  }
  return JSON.stringify(payload)
};
const co2AwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(co2AwareRenderGameToText());
  if (practicals[state.selected].id === 'co2') {
    payload.graph_axes = null;
    payload.results_view = "bird's-eye limewater visibility and turbidity observation";
    payload.carbon_dioxide_test = {
      apparatus: 'two conical flasks sealed with one-hole bungs and joined by a gas delivery tube',
      source_flask: 'calcium carbonate and hydrochloric acid',
      receiver_flask: 'limewater',
      bungs: 2,
      bung_holes: 'one central tube hole in each bung',
      delivery_tube_entry: 'passes centrally through both bungs',
      limewater_inlet_submerged: true,
      inlet_outlet_position: 'below the limewater surface near the base of the receiver flask',
      bubbles_visible: state.running,
      bubble_origin: 'submerged delivery-tube outlet',
      bubble_motion: 'rising plume through the limewater to the surface',
      turbidity_fraction: +state.progress.toFixed(2),
      target_visibility_fraction: +Math.pow(1 - state.progress, 1.35).toFixed(2),
      observation: state.progress >= .9 ? 'milky' : state.progress >= .25 ? 'clouding' : 'clear'
    };
    payload.controls = ['START/RESET', 'ADD REAGENT', 'RECORD OBSERVATION', "BIRD'S EYE", 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const displacementAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(displacementAwareRenderGameToText());
  if (practicals[state.selected].id === 'displacement') {
    const stageNames = ['solutions and cleaned strips ready', 'metal strips lowering and reactions proceeding', 'observations complete', 'results recorded'];
    payload.graph_axes = null;
    payload.results_columns = ['metal', 'salt_solution', 'displaced_metal', 'observation'];
    payload.metal_displacement = {
      apparatus: 'four labelled test tubes in a rack, each containing an equal volume of salt solution and one equal-sized cleaned metal strip',
      stage: state.displacementStage,
      phase: stageNames[state.displacementStage],
      elapsed_s: +state.displacementTimer.toFixed(2),
      reaction_progress: +state.progress.toFixed(2),
      fair_test_controls: ['equal salt-solution volumes', 'equal-sized cleaned metal strips', 'same observation time'],
      trials: displacementTrials.map((trial, index) => ({ test_tube: index + 1, metal: trial.metal, metal_symbol: trial.metalSymbol, salt_solution: trial.solution, equation: trial.equation, displaced_metal: trial.displaced, reacts: true, visible_result: state.complete ? trial.observation : state.running ? 'coating growing and solution changing' : 'not started' })),
      deduced_reactivity_order: state.complete ? ['Mg', 'Zn', 'Fe', 'Cu', 'Ag'] : null,
      results_recorded: state.displacementRecorded
    };
    payload.controls = ['LOWER METALS', 'RECORD RESULTS', 'RESET SERIES', 'RESULTS', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const flameTestAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(flameTestAwareRenderGameToText());
  if (practicals[state.selected].id === 'flame') {
    const salt = flameTestSalts[state.flameTestSalt], phases = ['salt selected', 'scooping onto spatula', 'salt loaded on spatula', 'entering blue Bunsen flame', 'flame colour revealed'];
    payload.graph_axes = null;
    payload.results_columns = null;
    payload.results_view = 'visible-light absorption spectra with characteristic black bands';
    payload.bunsen_lit = true;
    payload.flame_tests = {
      stage: state.flameTestStage,
      phase: phases[state.flameTestStage],
      timer_s: +state.flameTestTimer.toFixed(2),
      apparatus: 'five open metallic-salt sample jars, a clean metal spatula and a roaring blue Bunsen burner',
      selected_salt: salt.salt,
      formula: salt.formula,
      metal_ion: salt.symbol,
      spatula_loaded: state.flameTestStage >= 2,
      spatula_in_flame: state.flameTestStage >= 4 || state.flameTestStage === 3 && state.flameTestTimer >= 1.05,
      blue_flame_visible: true,
      apparatus_layout: {
        sample_jar_row: 'rear of bench with all five formula labels unobscured',
        bunsen_burner: 'front-left, fully inside the visible bench and outside the sample-label row',
        whole_bunsen_visible: true,
        burner_barrel_material: 'brushed steel',
        base_top_sealed_to_main_tube: true,
        base_barrel_radial_clearance_scene_units: .001,
        air_intake_valve_raised_above_seal: true,
        gas_connector_raised_with_valve: true,
        gas_tap: 'foreground between the burner and jars, below every sample label',
        all_sample_labels_visible: true
      },
      revealed_flame_colour: state.flameTestStage >= 4 || state.flameTestStage === 3 && state.flameTestTimer >= 1.05 ? salt.flame : null,
      tested_salts: state.flameTestTested.map(i => flameTestSalts[i].salt),
      absorption_spectra: flameTestSalts.map(item => ({ salt: item.salt, metal_ion: item.symbol, visible_range_nm: [380, 770], black_absorption_bands_nm: item.bands, simplified: true }))
    };
    payload.controls = ['select a metallic salt card', 'SCOOP SALT', 'ENTER BLUE FLAME', 'NEXT SALT', 'SPECTRA', 'METHOD', 'F fullscreen']
  }
  return JSON.stringify(payload)
};
const pondweedAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(pondweedAwareRenderGameToText());
  if (practicals[state.selected].id === 'pondweed') {
    const geometry = pondweedGeometry(), rightPanelWidth = Math.max(260, Math.min(330, W * .23)), controls = pondweedControlLayout(270, W - 270 - rightPanelWidth);
    payload.pondweed = {
      lamp: 'traditional adjustable desk filament lamp with a bell shade and visible glowing filament bulb',
      lamp_on: state.pondweedLampOn,
      distance_cm: state.pondweedDistance,
      permitted_distance_cm: [10, 50],
      minimum_distance_enforced: state.pondweedDistance >= 10,
      measurement_reference: 'front lip of lamp shade to nearest outside edge of beaker',
      ruler_zero_reference: 'nearest outside edge of beaker, not the beaker centre',
      ruler_appearance: 'ivory-white rounded scale matching the bubble potometer ruler, with dark blue graduations and labels',
      ruler_scale_cm: [0, 50],
      ruler_zero_world_x: +geometry.beakerEdgeX.toFixed(2),
      lamp_face_world_x: +geometry.lampFaceX.toFixed(2),
      ruler_units_per_cm: geometry.rulerUnitsPerCm,
      control_layout: {
        distance_button_width_px: +controls.distanceWidth.toFixed(1),
        count_button_width_px: controls.countWidth,
        count_to_reading_gap_px: +controls.readingGap.toFixed(1),
        overlaps_reading: controls.readingGap < 0
      },
      predicted_bubbles_per_minute: state.pondweedLampOn ? Math.round(52 / Math.pow(state.pondweedDistance / 10, 1.8) + 4) : 0,
      recorded_results: state.pondweedResults
    };
    payload.controls = ['- 10cm', '+ 10cm', 'LAMP ON/OFF', 'COUNT 1 MIN', 'GRAPH', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const newton2AwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(newton2AwareRenderGameToText());
  if (practicals[state.selected].id === 'newton2') {
    const rightPanelWidth = Math.max(260, Math.min(330, W * .23));
    const controls = newton2ControlLayout(270, W - 270 - rightPanelWidth);
    payload.newton2 = {
      accelerating_force_n: state.newtonForce,
      hanging_mass_set: {
        type: 'school laboratory slotted mass holder',
        holder_mass_g: 10,
        slotted_mass_each_g: 10,
        slotted_mass_count: Math.max(0, Math.min(4, Math.round(state.newtonForce * 10) - 1)),
        total_hanging_mass_g: Math.round(state.newtonForce * 100),
        masses_slot_onto_central_stem: true
      },
      trolley_mass_kg: state.newtonMass,
      acceleration_m_per_s2: +(state.newtonForce / state.newtonMass).toFixed(2),
      trolley_running: state.newtonRunning,
      trolley_progress: +state.newtonPos.toFixed(2),
      light_gate_system: {
        gate_count: 2,
        connected_to_same_data_logger: true,
        cable_count: 2,
        logger_display_channels: ['v₁', 'v₂'],
        logger_position: { x: -0.28, y: 0.05, z: 1.14, shifted_left: true, closer_to_camera: true },
        gate_1: { time_s: state.newtonGate1Time, velocity_m_per_s: state.newtonGate1Velocity },
        gate_2: { time_s: state.newtonGate2Time, velocity_m_per_s: state.newtonGate2Velocity }
      },
      trolley_appearance: { rounded_chassis: true, rubber_wheels: 4, rounded_bumpers: 2, interrupt_card: true, relative_size_from_previous: 0.86 },
      recorded_results: state.newtonResults,
      control_layout: {
        minus_x_px: +controls.minusX.toFixed(1),
        plus_x_px: +controls.plusX.toFixed(1),
        release_x_px: +controls.releaseX.toFixed(1),
        force_button_width_px: +controls.forceWidth.toFixed(1),
        release_button_width_px: +controls.releaseWidth.toFixed(1),
        release_to_reading_gap_px: +controls.readingGap.toFixed(1),
        overlaps_reading: controls.readingGap < 0
      }
    };
    payload.controls = ['FORCE -0.1N', 'FORCE +0.1N', 'RELEASE TROLLEY', 'GRAPH', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const heatPhysicsAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(heatPhysicsAwareRenderGameToText()), id = practicals[state.selected].id;
  if (id === 'electromagnet') {
    const phases = ['switch open', 'switch closing and coil energising', 'electromagnet energised', 'core lowering', 'core immersed in paper clips', 'core lifting', 'paper clips suspended', 'count recorded'];
    const displayFraction = state.electromagnetStage === 0 || state.electromagnetStage === 7 ? 0 : state.electromagnetStage === 1 ? (() => { const q = Math.max(0, Math.min(1, state.electromagnetTimer / 1.05)); return q * q * (3 - 2 * q) })() : 1;
    payload.electromagnet_practical = {
      stage: state.electromagnetStage,
      phase: phases[state.electromagnetStage],
      timer_s: +state.electromagnetTimer.toFixed(2),
      independent_variable: 'number of insulated-wire turns',
      current_controlled: true,
      supply_voltage_v: 3,
      turns: state.electromagnetTurns,
      soft_iron_core: true,
      switch_closed: state.electromagnetStage >= 1 && state.electromagnetStage <= 6,
      core_lowered_to_constant_depth: state.electromagnetStage >= 4 && state.electromagnetStage <= 5,
      paper_clips_attached: state.electromagnetStage >= 4 && state.electromagnetStage <= 6 ? state.electromagnetClips || electromagnetMeasuredClips() : 0,
      paper_clips_suspended: state.electromagnetStage >= 6 ? state.electromagnetClips : 0,
      measured_results: state.electromagnetResults,
      trial_turns: electromagnetTurnsSeries,
      apparatus_layout: {
        clamp_stand_position: 'right of the power pack with a clear horizontal gap',
        electromagnet_orientation: 'horizontal, long axis left-to-right, working pole facing right',
        lead_direction: 'red and black leads enter from the power pack on the left',
        paper_clip_position: 'tray and attracted clips beneath the right-facing working pole',
        moving_carriage: 'boss, right-extending clamp arm and horizontal electromagnet lower and lift together'
      },
      power_pack_display: {
        type: 'integrated two-line digital display',
        current_a: +(0.5 * displayFraction).toFixed(2),
        voltage_v: +(3 * displayFraction).toFixed(2),
        units_visible: ['A', 'V'],
        output_on: displayFraction > .02
      },
      smooth_stage_animation: true
    };
    payload.controls = ['CLOSE SWITCH', 'LOWER CORE', 'LIFT CORE', 'RECORD COUNT', 'NEXT COIL', 'RESET SERIES', 'GRAPH', 'METHOD', 'F fullscreen'];
  } else if (id === 'convection') {
    payload.graph_axes = null;
    payload.results_view = 'animated convection-current observation';
    payload.convection_practical = {
      stage: state.convectionStage,
      phase: ['still water ready', 'adding tracer crystal', 'tracer settled beside heat source', 'heating and circulating', 'complete current observed'][state.convectionStage],
      timer_s: +state.convectionTimer.toFixed(2),
      apparatus: 'closed rectangular glass convection tube filled with water and clamped above a heatproof mat',
      tracer: 'orange potassium dichromate representation',
      tracer_real_world_safety: 'hazardous; simulation / teacher demonstration only',
      bunsen_lit: state.convectionStage === 3 && state.running,
      heat_location: 'left lower bend',
      geometry: {
        centreline_bottom_y: 1.38,
        centreline_top_y: 2.78,
        total_outside_height: 1.98,
        burner_body_top_y: 1.023,
        tube_outside_bottom_y: 1.09,
        tube_clearance_above_burner: 0.067,
        tube_above_burner: true,
        shortened_to_fit_arena: true
      },
      flow_direction: state.convectionStage >= 3 ? 'clockwise: up heated left side, across top, down cooler right side' : 'no bulk flow',
      mechanism: 'warm water expands, becomes less dense and rises; cooler denser water sinks',
      complete_loop_visible: state.convectionStage >= 4,
      smooth_stage_animation: true
    };
    payload.controls = ['ADD TRACER', 'LIGHT BUNSEN', 'OBSERVATION', 'RESET DEMO', 'METHOD', 'F fullscreen'];
  } else if (id === 'conduction') {
    const fallen = Object.fromEntries(Object.entries(conductionPinTimes).map(([metalName, times]) => [metalName, times.filter(t => state.conductionTimer >= t).length]));
    payload.graph_axes = null;
    payload.results_view = 'drawing-pin fall-time comparison table';
    payload.conduction_practical = {
      stage: state.conductionStage,
      phase: state.conductionStage === 0 ? 'equal waxed pins ready' : state.running ? 'shared rod ends heating' : 'pin-fall sequence complete',
      timer_s: +state.conductionTimer.toFixed(2),
      apparatus: 'equal copper, aluminium and steel rods heated together over one Bunsen burner',
      drawing_pins_per_rod: 4,
      drawing_pin_design: {
        head_material: 'polished brass',
        head_shape: 'low-profile flat circular disc with a softly rounded rim',
        shaft_attachment: 'exact geometric centre of the brass head',
        shaft_angle_to_head_degrees: 90,
        settled_pose: 'brass head flat on the bench with the sharp point upright'
      },
      equal_wax_blobs: true,
      equal_pin_spacing: true,
      pins_fallen: fallen,
      fall_times_s: conductionPinTimes,
      conductor_order: state.complete ? ['copper', 'aluminium', 'steel'] : null,
      smooth_wax_softening_and_pin_fall: true
    };
    payload.controls = ['LIGHT BUNSEN', 'RESULTS', 'RESET DEMO', 'METHOD', 'F fullscreen'];
  } else if (id === 'thermal') {
    const thermalSurfaces = thermalSurfaceReadings(), facing = thermalFacingSurface();
    payload.graph_axes = null;
    payload.results_view = 'false-colour thermal image and apparent-temperature comparison';
    payload.thermal_radiation_practical = {
      stage: state.thermalStage,
      phase: ['ambient apparatus ready', 'hot water pouring into Leslie cube', 'hot Leslie cube ready', 'thermal camera moving toward scene camera', 'live camera display fills the lab view', 'thermal image captured'][state.thermalStage],
      timer_s: +state.thermalTimer.toFixed(2),
      leslie_cube: {
        filled_with_hot_water: state.thermalStage >= 2,
        water_temperature_c: +(state.temp || 21).toFixed(1),
        compared_surfaces: thermalSurfaces.map(surface => surface.label.toLowerCase()),
        rotating_slowly: state.thermalStage >= 1,
        rotation_degrees: +((state.thermalRotation || 0) * 180 / Math.PI % 360).toFixed(1),
        rotation_rate_degrees_per_second: +(thermalRotationRate * 180 / Math.PI).toFixed(1),
        facing_surface: facing.label.toLowerCase()
      },
      thermal_camera: {
        selected_in_sequence: state.thermalStage >= 3,
        moving_toward_scene_camera: state.thermalStage === 3,
        foreground_display_active: state.thermalStage >= 4,
        display_content: 'live false-colour bench view with the hot-water flask, Leslie cube, filler neck, rails, work surface and tiled wall',
        crosshair_temperature_c: state.thermalStage >= 4 ? +facing.temperature.toFixed(1) : null,
        palette_range_c: [20, 90],
        foreground_screen_centered: state.thermalStage >= 4,
        screen_aligned_perpendicular_to_scene_camera: state.thermalStage >= 4,
        perspective_matches_lab_bench: true,
        image_captured: state.thermalCaptured
      },
      sidebar_thermal_view: {
        dynamic_orientation: state.thermalStage >= 1,
        dynamic_temperature: true,
        facing_surface: facing.label.toLowerCase(),
        crosshair_temperature_c: +facing.temperature.toFixed(1),
        shares_camera_scene_renderer: true,
        visible_bench_objects: ['hot-water flask', 'rotating Leslie cube', 'filler neck', 'cube rails', 'bench surface', 'tiled wall']
      },
      thermal_propagation_rings: {
        count: 8,
        visual_only: true,
        casts_shadows: false,
        receives_shadows: false
      },
      apparent_surface_readings_c: Object.fromEntries(thermalSurfaces.map(surface => [surface.id, +surface.temperature.toFixed(1)])),
      emissivity_conclusion: state.complete ? 'dull black is the strongest infrared emitter; polished metal has low emissivity and reflects surroundings' : null,
      smooth_stage_animation: true
    };
    payload.controls = ['ADD HOT WATER', 'PICK UP CAMERA', 'CAPTURE IMAGE', 'THERMAL VIEW', 'RESET DEMO', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const densityAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(densityAwareRenderGameToText());
  if (practicals[state.selected].id === 'density') {
    const sample = densitySamples[state.densitySample || 0];
    const phases = ['ready to weigh', 'mass measured on balance', 'filling can and transferring object', 'suspended centrally above can', 'lowering and displacing water', 'displacement measured', 'density recorded'];
    const transfer = densityTransferProgress(), displacement = densityDisplacementProgress();
    payload.density_practical = {
      stage: state.densityStage,
      phase: phases[state.densityStage],
      elapsed_s: +state.densityTimer.toFixed(2),
      sample: sample.name,
      measured_mass_g: state.densityStage >= 1 ? sample.mass : 0,
      displaced_volume_cm3: +(sample.vol * displacement).toFixed(1),
      calculated_density_g_cm3: state.densityStage >= 6 ? sample.density : null,
      object_transfer: {
        from: 'electronic balance pan',
        to: 'centrally above Eureka can',
        progress: +transfer.toFixed(2),
        movement: 'smooth eased lift-and-arc animation'
      },
      eureka_can: {
        filled_to_spout: state.densityStage >= 3 || densityFillProgress() >= .99,
        water_fill_fraction: +densityFillProgress().toFixed(2),
        water_surface_visible: state.densityStage >= 2,
        open_top: true
      },
      measuring_cylinder: {
        under_spout: true,
        aligned_with_spout_outlet: true,
        collected_volume_cm3: +(sample.vol * displacement).toFixed(1)
      },
      immersion_effects: {
        active: state.densityStage === 4 && displacement > 0,
        surface_ripples: state.densityStage === 4 && state.densityTimer >= .9,
        entry_splash_droplets: state.densityStage === 4 && state.densityTimer >= .9 && state.densityTimer < 2.05,
        trapped_air_bubbles: state.densityStage === 4 && state.densityTimer >= 1.05,
        soft_overflow_stream: state.densityStage === 4 && displacement > .01 && displacement < .99
      },
      results: state.densityResults
    };
    payload.controls = ['WEIGH OBJECT', 'FILL EUREKA CAN', 'LOWER OBJECT', 'RECORD DENSITY', 'CHANGE SAMPLE', 'RESET PRACTICAL', 'GRAPH', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const addedPhysicsAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(addedPhysicsAwareRenderGameToText()), id = practicals[state.selected].id;
  if (id === 'wirelength') {
    const phases = ['power pack off at measured length', 'power pack starting and meters settling', 'power pack on with steady voltage and current', 'reading recorded with power pack off', 'crocodile contact moving to next ruler mark'];
    payload.wire_resistance_practical = {
      stage: state.wireStage,
      phase: state.complete ? 'five-length series complete' : phases[state.wireStage],
      elapsed_stage_s: +state.wireTimer.toFixed(2),
      independent_variable: 'wire length between crocodile contacts',
      length_cm: state.wireLengthCm,
      fixed_contact_cm: 0,
      sliding_contact_cm: state.wireLengthCm,
      wire: { material: 'nichrome', uniform_diameter: true, straight_against_metre_ruler: true },
      circuit_layout: {
        series_path: 'power pack positive → ammeter → fixed contact → nichrome test length → sliding contact → power pack negative',
        voltmeter_parallel_path: 'voltmeter connected directly across the fixed and sliding contacts',
        cable_lanes_separated: true,
        cable_geometry: 'continuous tube routes with straight runs and quadratic rounded bends',
        smooth_cable_corners: true,
        measured_segment_highlighted: true,
        ruler_rotated_180_degrees: true,
        fixed_red_clamp_retains_rotated_orientation: true,
        black_sliding_clamp_faces_camera: true,
        black_sliding_clamp_ferrule_faces_far_side: true,
        black_series_lead_route: 'along the far side of the ruler',
        component_zones: ['rear power pack and meters', 'foreground ruler and test wire'],
        separate_switch_present: false,
        power_pack_is_sole_circuit_control: true,
        compact_meter_displays: true,
        meter_display_scale: 0.76,
        meter_displays_clear_of_terminals: true,
        meter_displays_parallel_to_sloped_faces: true,
        meter_display_pitch_away_from_camera_deg: 7.64,
        meter_housing_shape: 'truncated square-pyramid frustum with trapezoidal faces',
        visible_meter_faces: ['front', 'top', 'left'],
        meter_screens_fit_inside_bezels: true,
        ruler_style: 'potometer ivory-white scale with enlarged high-contrast dark blue graduations and numbers',
        ruler_scale_readability: { centimetre_marks: 'three-level major, mid and minor hierarchy', numbers: 'enlarged bold labels every 10 cm' },
        pink_parallel_lead_route: 'around the right-hand edge of the ruler',
        ammeter_label: 'A · SERIES',
        voltmeter_label: 'V · PARALLEL'
      },
      power_pack_on: state.wireStage === 1 || state.wireStage === 2,
      supply_voltage_v: state.wireStage === 1 || state.wireStage === 2 ? state.wireVoltageV : 0,
      ammeter_current_a: state.wireStage === 1 || state.wireStage === 2 ? wireCurrent() : 0,
      calculated_resistance_ohm: wireResistance(),
      calculation: `${state.wireVoltageV.toFixed(2)} V ÷ ${wireCurrent().toFixed(2)} A = ${wireResistance().toFixed(1)} Ω`,
      contact_motion: state.wireStage === 4 ? 'jaws open, lift, glide, lower and close' : 'stationary',
      power_pack_off_between_readings_to_limit_heating: true,
      measured_results: state.wireResults,
      graph_axes: { x: 'wire length / cm', y: 'resistance / Ω' },
      smooth_stage_animation: true
    };
    payload.controls = ['POWER PACK ON', 'POWER PACK OFF', 'NEXT LENGTH', 'RESET SERIES', 'GRAPH', 'METHOD', 'F fullscreen'];

  } else if (id === 'fieldlines') {
    const configuration = fieldConfigurations[state.fieldConfigIndex];
    const phases = ['fresh paper over magnet arrangement', 'filings shaker moving and sprinkling', 'loose filings ready to tap', 'paper tapping and filings aligning', 'field pattern formed ready to record', 'filings clearing and magnet configuration changing'];
    payload.graph_axes = null;
    payload.results_view = 'three magnetic-field pattern comparison';
    payload.magnetic_field_practical = {
      stage: state.fieldStage,
      phase: state.complete ? 'all three patterns recorded' : phases[state.fieldStage],
      elapsed_stage_s: +state.fieldTimer.toFixed(2),
      configuration: configuration.id,
      configuration_label: configuration.label,
      apparatus: ['bar magnet or matched pair below paper', 'white paper on clear acrylic support', 'sealed perforated iron-filings shaker', 'soft gentle tapping tool'],
      magnets_below_paper: true,
      poles: 'red north poles and blue south poles',
      filings: {
        individually_modelled: true,
        fine_layer: true,
        visible_fraction: state.fieldStage === 0 ? 0 : state.fieldStage === 1 ? +Math.min(1, state.fieldTimer / fieldStageDurations[1]).toFixed(2) : 1,
        aligned_to_local_field: state.fieldStage >= 4,
        temporary_induced_magnets: state.fieldStage >= 3,
        safe_sealed_simulation: true
      },
      observation: state.fieldStage >= 4 || state.complete ? configuration.observation : null,
      recorded_patterns: state.fieldResults,
      direction_note: 'filings show shape and relative strength but not direction; outside a magnet direction is N to S',
      smooth_stage_animation: true
    };
    payload.controls = ['SPRINKLE FILINGS', 'TAP PAPER', 'RECORD PATTERN', 'RESET STUDY', 'PATTERNS', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const newEnergyPhysicsAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(newEnergyPhysicsAwareRenderGameToText()), id = practicals[state.selected].id;
  if (id === 'hooke') {
    const phases = ['unloaded reference ready', 'adding slotted mass and spring settling', 'pointer settled ready to record', 'reading recorded ready for next load'];
    payload.hookes_law_practical = {
      stage: state.hookeStage,
      phase: state.complete ? 'seven-reading force–extension series complete' : phases[state.hookeStage],
      elapsed_stage_s: +state.hookeTimer.toFixed(2),
      apparatus: ['heavy clamp stand with boss and spring clamp', 'continuous helical steel spring with upper and lower hooks', 'vertical ruler with eye-level fiducial pointer', 'mass hanger with individual 100 g slotted masses', 'safety catch tray'],
      zero_reference_length_cm: 20,
      load: { mass_g: state.hookeForceN * 100, force_n: state.hookeForceN, conversion: '100 g = 0.100 kg; using g ≈ 10 N kg⁻¹ gives 1.0 N' },
      total_length_cm: hookeTotalLengthCm(),
      extension_cm: hookeExtensionCm(),
      extension_m: +(hookeExtensionCm() / 100).toFixed(3),
      ruler: { origin: 'top of vertical ruler', scale_cm: [0, 36.4], unloaded_pointer_reading_cm: hookeRulerUnloadedReadingCm, pointer_reading_cm: hookeRulerReadingCm() },
      ruler_smallest_graduation_mm: 1,
      safety_catch_tray_directly_below_hanger: true,
      guidance_focus: { available: true, trigger_bounds: hookeGuidanceHitbox, open: state.hookeFocusModal, animation_progress: +state.hookeFocusProgress.toFixed(2), focus: 'bottom spring, fiducial pointer and ruler scale' },
      spring_moving: state.hookeStage === 1,
      reading_enabled_only_when_settled: true,
      measured_results: state.hookeResults,
      graph_axes: { x: 'extension / m', y: 'force / N' },
      spring_constant_n_per_m: state.hookeResults.length >= 6 ? hookeSpringConstant() : null,
      fitted_linear_region_n: [0, 5],
      proportional_limit_n: state.complete ? 5 : null,
      final_6n_point_beyond_proportionality: state.complete,
      conclusion: state.complete ? 'force is proportional to extension from 0 to 5 N; at 6 N the extension is greater than the straight-line prediction, so the point lies below the extrapolated force line' : null,
      smooth_stage_animation: true
    };
    payload.controls = ['RECORD ZERO', 'ADD 100 g MASS', 'RECORD READING', 'RESET SERIES', 'GRAPH', 'METHOD', 'F fullscreen', ...(state.hookeFocusModal ? ['CLOSE RULER VIEW'] : [])];
  } else if (id === 'specificheat') {
    const phases = ['unprepared material block', 'applying paste, closing insulation, then inserting both probes', 'prepared and zeroed', 'electrical heating and live measurement', 'supply off ready to calculate', 'specific heat capacity calculated'];
    const setupElapsedS = state.shcStage === 1 ? state.shcTimer : state.shcStage >= 2 ? shcStageDurations[1] : 0;
    const insulationClosed = state.shcStage >= 2 || state.shcStage === 1 && setupElapsedS >= 2.3;
    const heaterFullyInserted = state.shcStage >= 2 || state.shcStage === 1 && setupElapsedS >= 3.12;
    const thermometerFullyInserted = state.shcStage >= 2 || state.shcStage === 1 && setupElapsedS >= 3.56;
    payload.specific_heat_capacity_practical = {
      stage: state.shcStage,
      phase: phases[state.shcStage],
      elapsed_stage_s: +state.shcTimer.toFixed(2),
      material: state.shcMaterial,
      reference_specific_heat_j_per_kg_c: currentShcMaterial().specificHeat,
      apparatus: [`1.00 kg ${state.shcMaterial} block with two separate pre-drilled bores`, '12 V cartridge heater', 'digital temperature probe', 'thermal paste collars', 'close-fitting foam jacket with bored lid', 'low-voltage supply', 'ammeter and joulemeter'],
      preparation: { block_bores_pre_drilled_before_practical: true, drilling_is_not_a_method_step: true, drilling_sparks_shown: false, bore_inspection_animated: state.shcStage <= 1, preparation_order: ['thermal paste', 'foam insulation and bored lid', 'cartridge heater', 'temperature probe'], insulation_completed_before_probe_insertion: true, thermal_paste_applied: state.shcStage >= 2 || state.shcStage === 1 && setupElapsedS >= .86, heater_fully_inserted: heaterFullyInserted, probe_fully_inserted: thermometerFullyInserted, insulation_starts_off_camera: state.shcStage === 0, insulation_panels_fly_in_individually: state.shcStage === 1 && !insulationClosed, insulation_closed: insulationClosed, bored_insulating_lid_closed: insulationClosed },
      instrument_layout: { all_four_displays_visible: true, left_of_block: ['12 V supply', 'ammeter'], right_of_block: ['joulemeter', 'digital thermometer'], outer_meter_x_scene_units: [-3.15, 3.15], inner_meter_x_scene_units: [-2.02, 2.02], spread_farther_from_block: true },
      electrical_circuit: { complete: true, route: 'supply positive → ammeter → joulemeter → heater → supply negative', thermometer_probe_has_separate_data_lead: true, continuous_curved_leads: true, cable_geometry: 'tube paths with broad quadratic bends and no visible elbow joints' },
      mass_kg: 1,
      supply_voltage_v: state.shcStage === 3 ? 12 : 0,
      current_a: state.shcStage === 3 ? 2 : 0,
      power_w: state.shcStage === 3 ? 24 : 0,
      energy_j: state.shcEnergyJ,
      initial_temperature_c: 20,
      temperature_c: state.shcTemperatureC,
      temperature_rise_c: shcTemperatureRiseC(),
      measured_results: state.shcResults,
      calculation: state.shcStage >= 5 ? `18,000 J ÷ (1.00 kg × ${shcTemperatureRiseC().toFixed(1)} °C) = ${shcCalculatedSpecificHeat()} J kg⁻¹ °C⁻¹` : null,
      calculated_specific_heat_j_per_kg_c: state.shcStage >= 5 ? shcCalculatedSpecificHeat() : null,
      specific_heat_capacity_j_per_kg_k: state.shcStage >= 5 ? shcCalculatedSpecificHeat() : null,
      graph_axes: { x: 'temperature rise / °C', y: 'energy transferred / kJ' },
      heat_loss_evaluation: state.complete ? 'energy loss to the surroundings makes the measured temperature rise too small and the calculated c too high' : null,
      smooth_stage_animation: true
    };
    payload.controls = [`MATERIAL: ${currentShcMaterial().label}`, 'PREPARE BLOCK', 'START HEATING', 'CALCULATE c', 'RESET', 'GRAPH', 'METHOD', 'F fullscreen'];
  } else if (id === 'latentheat') {
    const material = currentLatentMaterial(), phases = ['solid sample and separate tube ready', 'moving tube into water bath and lowering thermometer', 'clamped apparatus ready to heat', 'heating and logging temperature', 'hot liquid ready to cool', 'cooling, freezing and logging temperature', 'heating and cooling curves complete'];
    payload.graph_axes = { x: 'time from start of stage / s', y: 'sample temperature / °C', chart_type: 'two-series heating and cooling curve' };
    payload.graph_readings = state.latentHeatingResults.length + state.latentCoolingResults.length;
    payload.results_view = 'overlaid heating and cooling curves with highlighted phase-change band';
    payload.latent_heat_practical = {
      stage: state.latentStage,
      phase: phases[state.latentStage],
      elapsed_stage_s: +state.latentTimer.toFixed(2),
      simulated_elapsed_s: +state.time.toFixed(1),
      material: state.latentMaterial,
      sample_label: material.label,
      sample_form: material.sampleForm,
      melting_point_c: material.meltingPointC,
      temperature_c: +state.latentTemperatureC.toFixed(1),
      liquid_fraction: +state.latentPhaseFraction.toFixed(3),
      physical_state: state.latentPhaseFraction < .08 ? 'solid' : state.latentPhaseFraction > .92 ? 'liquid' : state.latentStage === 5 ? 'solidifying' : 'melting',
      apparatus: {
        beaker: '500 cm³ borosilicate beaker filled with water and supported above the Bunsen',
        support: 'heavy clamp stand with lower beaker-support ring and upper rubber-lined boiling-tube clamp',
        inner_vessel: 'wide boiling tube immersed in the water bath',
        thermometer: 'graduated liquid-in-glass thermometer with bulb centred inside the sample',
        heat_source: 'Bunsen burner on a worn heatproof mat',
        sample_jars: ['paraffin wax pellets', 'stearic acid flakes']
      },
      initial_layout: { boiling_tube: 'lying flat on the left-side instrument tray', thermometer: 'lying flat beside the boiling tube', right_foreground_reserved_for: ['logger', 'sample jars', 'gas tap'] },
      submerged_sample_optics: { pellets_or_flakes_remain_visible: true, molten_sample_remains_visible: true, water_reduces_brightness: true, subtle_blue_water_veil: true },
      measurements: { interval_s: 40, heating: state.latentHeatingResults, cooling: state.latentCoolingResults },
      curve_features: { heating_plateau_visible: state.latentHeatingResults.some(item => item.phase === 'melting'), cooling_plateau_visible: state.latentCoolingResults.some(item => item.phase === 'freezing'), plateau_temperature_c: material.meltingPointC, plateau_explanation: 'energy changes intermolecular potential energy during the change of state rather than increasing or decreasing mean particle kinetic energy' },
      animation: { tube_arcs_and_lowers_into_bath: state.latentStage === 1, tube_and_thermometer_lift_together_from_left_tray: state.latentStage === 1, clamp_jaws_close_smoothly: state.latentStage === 1, thermometer_travels_to_bath_then_lowers_into_sample: state.latentStage === 1, thermometer_lowers_into_sample: state.latentStage === 1, thermometer_column_tracks_temperature_continuously: true, water_convection_and_bubbles_visible_while_heating: state.latentStage === 3, solid_pellets_or_flakes_morph_into_liquid: state.latentStage === 3, crystals_reform_smoothly_during_cooling: state.latentStage === 5, steam_and_heat_haze_fade_after_flame_off: state.latentStage >= 5 },
      complete: state.complete,
      conclusion: state.complete ? `Both curves flatten near ${material.meltingPointC} °C as ${material.label.toLowerCase()} changes state, demonstrating latent heat transfer without a large temperature change.` : null
    };
    payload.controls = [`SAMPLE: ${material.short}`, 'ASSEMBLE BATH', 'START HEATING', 'START COOLING', 'RESET', 'CURVES', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const biologyAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(biologyAwareRenderGameToText()), id = practicals[state.selected].id;
  if (id === 'starchleaf') {
    const phases = ['fresh leaf above hot water', 'boiling leaf', 'boiled leaf ready for ethanol', 'decolourising in warm ethanol', 'pale leaf ready to rinse', 'rinsing and spreading leaf', 'decolourised leaf on white tile', 'adding iodine', 'blue-black positive starch result'],ethanolQ=state.starchStage===3?Math.max(0,Math.min(1,state.starchTimer/4.8)):state.starchStage>3?1:0,ethanolTransferPhase=state.starchStage<2?'not ready':state.starchStage===2?'ready to lift':state.starchStage>3?'transfer complete':ethanolQ<.26?'lifting higher':ethanolQ<.44?'aligning above test-tube rim':ethanolQ<.52?'curling above the rim':ethanolQ<.72?'plunging curled leaf into ethanol':ethanolQ<.84?'decolourising in ethanol':'lifting leaf out';
    payload.graph_axes = null;
    payload.results_view = 'side-by-side fresh leaf and iodine-treated leaf observation';
    payload.starch_leaf_practical = {
      stage: state.starchStage,
      phase: phases[state.starchStage],
      elapsed_stage_s: +state.starchTimer.toFixed(2),
      apparatus: ['stainless-steel forceps', 'boiling-water beaker on electric hotplate', 'ethanol test tube inside white-enamel electric water bath', 'warm-water rinse beaker', 'white spotting tile', 'iodine dropping pipette'],
      sample: {
        type: 'fresh green leaf',
        veins_contained_within_leaf: true,
        vein_edge_margin_scene_units: 0.05,
        chlorophyll_visible: state.starchStage < 4,
        decolourised: state.starchStage >= 4,
        on_white_tile: state.starchStage >= 6,
        iodine_added: state.starchStage >= 7,
        final_colour: state.starchStage >= 8 ? 'blue-black' : state.starchStage >= 4 ? 'pale cream' : 'green',
        starch_present: state.starchStage >= 8
      },
      forceps_grip: {
        leaf_held_between_jaws: state.starchStage < 6,
        near_jaw: 'in front of the leaf',
        far_jaw: 'behind the leaf'
      },
      apparatus_bench_lift_scene_units: {
        electric_water_bath: 0.1,
        electric_hotplate_and_boiling_beaker: 0.1,
        iodine_sample_bottle: 0.1
      },
      ethanol_setup: {
        test_tube_and_holder_shift_right_scene_units: 0.18,
        transfer_phase: ethanolTransferPhase,
        transfer_fraction: +ethanolQ.toFixed(2),
        sequence: ['lift tongs higher', 'align leaf above raised test-tube rim', 'curl leaf', 'plunge into warm ethanol'],
        curl_trigger: 'bottom edge of leaf blade just above the top of the ethanol test tube'
      },
      ethanol_safety: 'heated indirectly in an electric water bath, away from naked flames',
      smooth_stage_animation: true,
      conclusion: state.starchStage >= 8 ? 'Blue-black iodine result confirms starch stored in the leaf after photosynthesis.' : null
    };
    payload.controls = ['BOIL LEAF', 'MOVE TO ETHANOL', 'RINSE LEAF', 'ADD IODINE', 'RESET PRACTICAL', 'RESULT', 'METHOD', 'F fullscreen'];
  } else if (id === 'lipase') {
    const phases = state.lipaseConditioning ? 'conditioning both mixtures in the water bath' : ['conditioned and ready', 'adding measured lipase', 'timing indicator colour loss', 'trial complete'][state.lipaseStage];
    payload.graph_axes = { x: 'temperature / °C', y: 'time for pink colour to disappear / s', chart_type: 'bar chart' };
    payload.graph_readings = state.lipaseResults.length;
    payload.lipase_temperature_practical = {
      stage: state.lipaseStage,
      phase: phases,
      target_temperature_c: state.lipaseTargetTemp,
      water_bath_temperature_c: +state.lipaseBathTemp.toFixed(1),
      electric_water_bath: {
        reused_component: true,
        finish: 'white enamel',
        lower_chassis_top_edges: 'square, not rounded',
        outer_tank_edges: 'continuous and flush with the lower chassis footprint',
        upper_water_tank_top_edges: 'continuous rounded rail',
        water_visible: true,
        open_top: true,
        water_fill_fraction: 0.64,
        water_appearance: 'clearly visible cyan volume with a bright meniscus and animated surface ripples',
        submerged_interior: 'white enamel visible beneath the water',
        animated_surface: true,
        digital_set_and_current_temperature: true
      },
      reactant_bottle: {
        label: 'LIPASE',
        label_surface: 'automatically wrapped around the cylindrical bottle curvature',
        duplicate_external_label: false
      },
      visible_bench_labels: ['MILK + INDICATOR'],
      apparatus_bench_lift_scene_units: 0.1,
      test_tube_contents: 'milk, sodium carbonate and phenolphthalein',
      lipase_added: state.lipaseStage >= 2,
      reaction_fraction: +lipaseReactionProgress().toFixed(2),
      indicator_colour: state.lipaseStage < 2 ? 'pink' : lipaseReactionProgress() >= .96 ? 'colourless/cream' : 'fading pink',
      current_measured_time_s: +state.time.toFixed(1),
      endpoint: 'pink phenolphthalein becomes colourless as fatty acids lower pH',
      trial_temperatures_c: lipaseTemperatures,
      results: state.lipaseResults.map(r => ({ temperature_c: r.temperature, time_to_colourless_s: r.time })),
      predicted_optimum_c: 40,
      denaturation_visible_in_results: state.lipaseResults.some(r => r.temperature === 60)
    };
    payload.controls = ['ADD LIPASE', 'NEXT TEMPERATURE', 'RESET SERIES', 'GRAPH', 'METHOD', 'F fullscreen'];
  } else if (id === 'transformation') {
    const phases = ['sterile setup ready', 'labelling matched controls', 'controls labelled', 'adding cells and plasmid', 'chilled tubes ready', 'ice–heat shock–ice sequence', 'heat shock complete', 'adding LB and recovering cells', 'cells recovered', 'inoculating and spreading four plates', 'sealed plates ready to incubate', 'overnight incubation and blue-light reveal', 'selection and GFP results complete'];
    const stage = state.transformationStage || 0, stageOperations = stage === 3 ? ['fit fresh tip for +DNA cells', 'press first stop and aspirate competent cells', 'dispense into +DNA through the second stop', 'eject used tip to waste', 'fit fresh tip for −DNA cells', 'press first stop and aspirate competent cells', 'dispense into −DNA through the second stop', 'eject used tip to waste', 'fit fresh tip for plasmid DNA', 'press first stop and aspirate plasmid DNA', 'dispense plasmid into +DNA through the second stop', 'eject used tip to waste', 'return micropipette to stand'] : stage === 7 ? ['fit fresh tip for +DNA recovery broth', 'press first stop and aspirate LB broth', 'dispense LB into +DNA through the second stop', 'eject used tip to waste', 'fit fresh tip for −DNA recovery broth', 'press first stop and aspirate LB broth', 'dispense LB into −DNA through the second stop', 'eject used tip to waste', 'return micropipette to stand'] : stage === 9 ? ['+DNA LB/amp/ara', '+DNA LB/amp', '−DNA LB', '−DNA LB/amp'].flatMap(condition => [`fit fresh tip for ${condition}`, `press first stop and aspirate cells for ${condition}`, `dispense onto ${condition} through the second stop`, 'eject used tip to waste', `spread inoculum on ${condition}`]).concat('return micropipette to stand') : [], operationQ = transformationStageDurations[stage] ? Math.max(0, Math.min(1, state.transformationTimer / transformationStageDurations[stage])) : 0, activePipetteOperation = stageOperations.length ? stageOperations[Math.min(stageOperations.length - 1, Math.floor(operationQ * stageOperations.length))] : 'resting horizontally in its stand';
    payload.graph_axes = null;
    payload.results_view = 'four-condition agar plate comparison';
    payload.bacterial_transformation_practical = {
      stage: state.transformationStage,
      phase: phases[state.transformationStage],
      elapsed_stage_s: +state.transformationTimer.toFixed(2),
      simulated_time_s: +state.time.toFixed(1),
      temperature_c: +state.temp.toFixed(1),
      organism: 'non-pathogenic teaching-strain E. coli simulation',
      plasmid: { circular: true, genes: ['ampR — ampicillin resistance', 'gfp — green fluorescent protein'], gfp_control: 'arabinose-inducible promoter' },
      controls: { plus_dna_receives_plasmid: true, minus_dna_receives_plasmid: false, both_receive_equal_competent_cells: true, processed_together: true },
      thermal_sequence: { initial_ice_c: 4, heat_shock_c: 42, simulated_heat_shock_s: 50, returned_to_ice: state.transformationStage >= 6 },
      recovery: { medium: 'LB broth', simulated_minutes: 10, complete: state.transformationStage >= 8 },
      plates: transformationPlateResults.map(result => ({ ...result, observed: state.complete })),
      apparatus: ['colour-coded sterile microtubes', 'adjustable P20 micropipette with volume window', 'open sterile-tip rack and used-tip waste cup', 'ice bath with modelled ice cubes', 'digital 42 °C heat block', 'four labelled sealed agar plates', '37 °C simulation incubator', 'blue-light fluorescence viewer'],
      micropipette: { model: 'adjustable P20', active_operation: activePipetteOperation, visual_details: ['contoured handle and rubber grip', 'digital volume window', 'metal nozzle and ejector sleeve', 'separate plunger and tip-ejector controls', 'detachable transparent tip with visible liquid column'], fresh_tip_for_each_transfer: true, plunger_stops: 2, used_tips_ejected_to_waste: true },
      tip_management: { sterile_tip_rack_label_fully_visible: true, sterile_tip_rack_raised: true, used_tip_label_conforms_to_cup_curvature: true, resting_micropipette_tip_direction: 'toward the tiled back wall', waste_cup_position: 'to the left of the ice bath' },
      animations: { tube_and_plate_labelling: state.transformationStage === 1, sequential_sterile_pipetting: state.transformationStage === 3 || state.transformationStage === 7 || state.transformationStage === 9, fresh_tip_pickup: activePipetteOperation.startsWith('fit fresh tip'), two_stop_plunger: activePipetteOperation.includes('first stop') || activePipetteOperation.includes('second stop'), liquid_visible_in_tip: activePipetteOperation.includes('aspirate') || activePipetteOperation.includes('dispense'), tip_ejection_to_waste: activePipetteOperation.includes('eject used tip'), tubes_move_ice_to_heat_block_and_back: state.transformationStage === 5, plasmid_enters_plus_dna_cells_only: state.transformationStage >= 3, agar_spreading: state.transformationStage === 9, sealed_plates_move_through_incubator: state.transformationStage === 11, colonies_grow_progressively: state.transformationStage === 11, gfp_glow_under_blue_light: state.complete },
      complete: state.complete,
      conclusion: state.complete ? 'Ampicillin selects bacteria carrying the plasmid; arabinose activates GFP expression, so only +DNA LB/amp/ara colonies glow green.' : null
    };
    payload.controls = ['LABEL CONTROLS', 'ADD CELLS + DNA', 'ICE + HEAT SHOCK', 'ADD LB + RECOVER', 'PLATE CELLS', 'INCUBATE PLATES', 'VIEW RESULTS', 'RESET', 'PLATES', 'METHOD', 'F fullscreen'];
  } else if (id === 'respiration') {
    const phases = ['dry labelled flasks in thermostatic baths', 'adding equal glucose masses', 'glucose added', 'adding equal yeast volumes', 'yeast and glucose mixed', 'fitting identical balloons', 'sealed flasks ready', 'simultaneous ten-minute incubation', 'incubation complete', 'results recorded'];
    const incubationQ = respirationIncubationProgress();
    payload.graph_axes = { x: 'water-bath temperature / °C', y: 'carbon dioxide volume / cm³', chart_type: 'line graph' };
    payload.graph_readings = state.respirationResults.length;
    payload.anaerobic_respiration_practical = {
      stage: state.respirationStage,
      phase: phases[state.respirationStage],
      independent_variable: 'water-bath temperature',
      dependent_variable: 'carbon dioxide volume collected in an identical balloon after 10 minutes',
      controlled_variables: ['5.0 g glucose', '25.0 cm³ yeast suspension', 'same yeast batch and concentration', 'identical conical flasks', 'identical empty balloons', 'same 10-minute incubation'],
      equation: 'C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂',
      oxygen_excluded_by: 'airtight balloon fitted directly over each flask neck',
      temperatures_c: respirationTemperatures,
      elapsed_minutes: +(10 * incubationQ).toFixed(2),
      flasks: respirationTemperatures.map((temperature, index) => ({ temperature_c: temperature, glucose_g: 5, yeast_suspension_cm3: 25, balloon_fitted: state.respirationStage >= 6, live_carbon_dioxide_cm3: respirationGasVolume(temperature, incubationQ), final_carbon_dioxide_cm3: state.respirationStage >= 8 ? respirationFinalGasVolumes[index] : null })),
      apparatus: ['five white-enamel thermostatic water baths with visible water', 'five labelled conical flasks', 'powder boat and glucose scoop', '25 cm³ measuring cylinder', 'five identical coloured latex balloons', 'shared digital ten-minute timer'],
      animation: { sequential_equal_glucose_transfer: state.respirationStage === 1, sequential_equal_yeast_pour: state.respirationStage === 3, balloons_stretch_airtight_over_necks: state.respirationStage === 5, simultaneous_timer: state.respirationStage === 7, fermentation_bubbles_and_foam: state.respirationStage >= 7, balloon_inflation_tracks_carbon_dioxide: state.respirationStage >= 7, all_baths_run_for_same_time: true },
      results: state.respirationResults.map(result => ({ temperature_c: result.temperature, time_minutes: result.time_minutes, carbon_dioxide_cm3: result.volume, balloon_observation: result.balloon })),
      conclusion: state.complete ? 'Carbon dioxide production rises to an optimum near 40 °C, is slow in cold conditions and falls sharply at 60 °C as respiratory enzymes are denatured.' : null
    };
    payload.controls = ['ADD GLUCOSE', 'ADD YEAST', 'FIT BALLOONS', 'START 10 MIN RUN', 'RECORD RESULTS', 'RESET PRACTICAL', 'GRAPH', 'METHOD', 'F fullscreen'];
  } else if (id === 'osmosis') {
    const phases = ['initial mass recorded on balance', 'moving chip into solution', '30-minute osmosis soak', 'soak complete', 'removing and blotting', 'blotted chip ready to reweigh', 'moving chip to balance', 'trial result recorded'];
    payload.graph_axes = { x: 'sucrose concentration / mol dm⁻³', y: 'percentage change in mass / %', zero_line: true };
    payload.graph_readings = state.osmosisResults.length;
    payload.potato_osmosis_practical = {
      stage: state.osmosisStage,
      phase: phases[state.osmosisStage],
      trial: state.osmosisTrialIndex + 1,
      trial_concentrations_mol_dm3: osmosisConcentrations,
      current_concentration_mol_dm3: state.osmosisConcentration,
      initial_mass_g: osmosisInitialMass,
      current_final_mass_g: state.osmosisStage >= 7 ? osmosisFinalMass() : null,
      current_percentage_change: state.osmosisStage >= 7 ? osmosisPercentChange() : null,
      soak_time_minutes: +(30 * osmosisProcessProgress()).toFixed(1),
      net_water_movement: osmosisDirection(),
      biological_sample: {
        type: 'equal peeled potato cylinder',
        equal_diameter_and_length: true,
        pale_cut_surface_with_fine_starch_flecks: true,
        visible_size_change: true,
        swelling_when_water_enters: osmosisPercentChange() > 2,
        shrinking_and_fine_wrinkling_when_water_leaves: osmosisPercentChange() < -2
      },
      apparatus: ['electronic balance with stainless-steel pan', '100 cm³ labelled beaker containing 50 cm³ solution', 'stainless-steel forceps', 'digital 30-minute timer', 'two-sheet blotting station'],
      animation: {
        smooth_forceps_transfer: true,
        potato_held_between_forceps_jaws: true,
        synchronized_forceps_and_potato_rotation: lab3d.osmosisRotationState,
        water_molecules_visible: state.osmosisStage === 2,
        water_molecule_direction: osmosisDirection(),
        surface_drain_droplets: state.osmosisStage === 4,
        two_sheet_blotting_press: state.osmosisStage === 4,
        balance_reading_settles: state.osmosisStage === 6
      },
      results: state.osmosisResults.map(result => ({ concentration_mol_dm3: result.concentration, initial_mass_g: result.initialMass, final_mass_g: result.finalMass, percentage_change: result.percentChange })),
      isotonic_point_mol_dm3: osmosisIsotonicConcentration(),
      calculation: '(final mass − initial mass) ÷ initial mass × 100'
    };
    payload.controls = ['LOWER CHIP', 'REMOVE & BLOT', 'REWEIGH CHIP', 'NEXT CONCENTRATION', 'RESET SERIES', 'GRAPH', 'METHOD', 'F fullscreen'];
  } else if (id === 'agardiffusion') {
    const phases = ['pink cubes ready to measure', 'measuring cube sides', 'sizes confirmed', 'lowering cubes into acid', 'all cubes submerged', 'equal-time diffusion soak', 'soak complete', 'removing and blotting cubes', 'cubes ready to cut', 'cutting and opening cubes', 'pink cores exposed', 'results recorded'];
    const liveResults = state.agarDiffusionResults.length ? state.agarDiffusionResults : agarCubeSidesCm.map(agarDiffusionResult);
    payload.graph_axes = { x: 'agar cube side length / cm', y: 'volume reached by diffusion / %', chart_type: 'line graph' };
    payload.graph_readings = state.agarDiffusionResults.length;
    payload.agar_cube_diffusion_practical = {
      stage: state.agarDiffusionStage,
      phase: phases[state.agarDiffusionStage],
      independent_variable: 'agar cube side length',
      dependent_variable: 'percentage of original cube volume reached by diffusion after 10 minutes',
      controlled_variables: ['0.5 mol dm⁻³ hydrochloric acid', '100 cm³ acid per beaker', '10-minute immersion', 'same alkaline phenolphthalein agar batch', 'same temperature', 'complete submersion'],
      chemistry: { starting_agar: 'alkaline agar containing phenolphthalein, coloured pink', diffusing_substance: 'hydrogen ions from dilute hydrochloric acid', visible_endpoint: 'penetrated agar becomes colourless as the pH falls below the phenolphthalein transition range', colour_change_is_diffusion_marker: true },
      elapsed_minutes: +(agarDiffusionSoakProgress() * 10).toFixed(2),
      diffusion_depth_cm: state.agarDiffusionStage >= 10 ? agarDiffusionDepthCm : +(agarDiffusionDepthCm * agarDiffusionSoakProgress()).toFixed(2),
      cubes: liveResults.map(result => ({ side_cm: result.sideCm, surface_area_cm2: result.surfaceAreaCm2, volume_cm3: result.volumeCm3, surface_area_to_volume_ratio: `${result.surfaceAreaToVolume}:1`, pink_core_side_cm: state.agarDiffusionStage >= 10 ? result.coreSideCm : null, volume_diffused_cm3: state.agarDiffusionStage >= 11 ? result.diffusedVolumeCm3 : null, percentage_diffused: state.agarDiffusionStage >= 11 ? result.percentageDiffused : null })),
      apparatus: ['three identical labelled beakers each containing 100 cm³ dilute hydrochloric acid', 'metric callipers and ruler', 'stainless-steel forceps', 'shared digital ten-minute timer', 'blotting paper', 'white cutting tile and laboratory scalpel'],
      animation: { callipers_measure_each_cube: state.agarDiffusionStage === 1, forceps_lower_cubes_sequentially: state.agarDiffusionStage === 3, acid_particles_move_inward: state.agarDiffusionStage === 5, colourless_diffusion_layer_advances_smoothly: state.agarDiffusionStage === 5, cubes_removed_and_blotting_sheet_presses_lightly: state.agarDiffusionStage === 7, scalpel_cuts_each_cube_then_halves_separate: state.agarDiffusionStage === 9, pink_core_visible_on_cut_face: state.agarDiffusionStage >= 9 },
      calculation: '(cube volume − pink core volume) ÷ cube volume × 100',
      results: state.agarDiffusionResults.map(result => ({ cube_side_cm: result.sideCm, surface_area_to_volume_ratio: result.surfaceAreaToVolume, pink_core_side_cm: result.coreSideCm, diffusion_depth_cm: result.diffusionDepthCm, percentage_diffused: result.percentageDiffused })),
      conclusion: state.complete ? 'All cubes show the same 3 mm diffusion depth, but the 1 cm cube has the greatest percentage diffused because its surface-area-to-volume ratio is largest.' : null
    };
    payload.controls = ['MEASURE CUBES', 'LOWER INTO ACID', 'START 10 MIN SOAK', 'REMOVE & BLOT', 'CUT CUBES', 'RECORD RESULTS', 'RESET', 'GRAPH', 'METHOD', 'F fullscreen'];
  } else if (id === 'potometer') {
    const phases = ['water-filled sealed apparatus ready', 'introducing one air bubble', 'bubble ready to align', 'refiller aligning bubble with zero', 'ready for timed run', 'five-minute water-uptake measurement', 'trial recorded'];
    payload.graph_axes = { x: 'wind speed / m s⁻¹', y: 'bubble speed / mm min⁻¹', chart_type: 'line graph' };
    payload.graph_readings = state.potometerResults.length;
    payload.bubble_potometer_practical = {
      stage: state.potometerStage,
      phase: phases[state.potometerStage],
      trial: state.potometerTrialIndex + 1,
      trial_wind_speeds_m_s: potometerWindSpeeds,
      current_wind_speed_m_s: state.potometerWindSpeed,
      elapsed_minutes: +(state.time / 60).toFixed(2),
      air_bubble_distance_mm: +state.potometerBubbleMm.toFixed(1),
      current_rate_mm_per_min: state.potometerStage >= 6 ? potometerRate() : null,
      biological_sample: {
        type: 'fresh leafy shoot',
        cut_underwater_at_angle: true,
        stem_remains_water_connected: true,
        total_leaf_area_controlled: true,
        leaf_blades_have_contained_veins: true,
        leaf_petiole_axis_aligned_with_branch: true,
        every_branch_meets_its_leaf_petiole_base: true,
        horizontal_branch_length_scale: 0.72,
        branches_taper_smoothly_to_petiole_diameter: true,
        branch_and_petiole_overlap_for_continuity: true,
        leaf_flutter_pivots_at_petiole_base: true,
        leaf_flutter_in_airflow: state.potometerStage === 5 && state.potometerWindSpeed > 0,
        transpiration_visualised_at_stomata: state.potometerStage === 5
      },
      apparatus: {
        glass_chamber_and_capillary_completely_water_filled: true,
        single_measurement_bubble: state.potometerStage >= 1,
        measurement_bubble_appearance: 'capillary-sized refractive air pocket with curved end menisci and specular highlights',
        graduated_capillary_mm: true,
        graduated_capillary_shifted_right: true,
        refiller_with_stopcock_and_plunger: true,
        refiller_position: 'right of the shoot chamber',
        refiller_tube_joins_between_graduated_capillary_and_shoot_chamber: true,
        plumbing_order: ['shoot water chamber', 'short ungraduated connector', 'refiller T-junction', 'graduated capillary'],
        airtight_rubber_bung: true,
        petroleum_jelly_joint_seals_visible: true,
        retort_stand_supports_apparatus: true,
        upper_retort_stand_support_clamps_refiller_container: true,
        desk_fan: true,
        anemometer_confirms_wind_speed: true
      },
      animation: {
        capillary_tip_lifts_and_redips: state.potometerStage === 1,
        refiller_plunger_resets_bubble: state.potometerStage === 3,
        bubble_moves_smoothly_toward_shoot: state.potometerStage === 5,
        fan_blades_and_airflow_ribbons: state.potometerStage === 5 && state.potometerWindSpeed > 0,
        leaf_flutter_scales_with_wind_speed: true,
        timer_accelerates_to_five_minutes: state.potometerStage === 5
      },
      results: state.potometerResults.map(result => ({ wind_speed_m_s: result.windSpeed, distance_mm: result.distanceMm, time_min: result.timeMin, rate_mm_per_min: result.rate })),
      conclusion: state.complete ? 'Increasing wind speed removes humid air beside the leaf, maintains a steep water-vapour gradient and increases transpiration and water uptake.' : null,
      limitation: 'A potometer measures water uptake, which is used as an estimate of transpiration rather than measuring water loss directly.',
      calculation: 'bubble distance moved (mm) ÷ time (min)'
    };
    payload.controls = ['INTRODUCE BUBBLE', 'ALIGN TO ZERO', 'START 5 MIN RUN', 'NEXT WIND SPEED', 'RESET SERIES', 'GRAPH', 'METHOD', 'F fullscreen'];
  } else if (id === 'quadrats') {
    const sample = currentQuadratSample(), phases = ['meadow ready; grid tapes not yet laid', 'laying x and y grid tapes from one datum', 'perpendicular 10 m × 10 m grid ready', 'generating independent x and y coordinates', 'random coordinate locked', 'quadrat following a smooth throw arc', 'quadrat settled at the coordinate', 'identifying and highlighting rooted daisies', 'count ready to record', 'sample recorded'], clamp01 = value => Math.max(0, Math.min(1, value)), smooth01 = value => { const q = clamp01(value); return q * q * (3 - 2 * q) }, tapeOverall = state.quadratStage === 1 ? smooth01(state.quadratTimer / 3.5) : state.quadratStage > 1 ? 1 : 0, tapeXProgress = smooth01(tapeOverall / .62), tapeYProgress = smooth01((tapeOverall - .28) / .72), tapeOrigin = [-2.8, .344, -1], tapeXEnd = [2.8, .344, -1], tapeYEnd = [-2.8, .344, 4.2];
    payload.graph_axes = null; payload.graph_readings = state.quadratResults.length; payload.results_view = 'coordinate-and-count table with mean density and habitat population estimate';
    payload.random_quadrat_sampling_practical = {
      stage: state.quadratStage,
      phase: phases[state.quadratStage],
      elapsed_stage_s: +state.quadratTimer.toFixed(2),
      sample: state.quadratSampleIndex + 1,
      deterministic_random_seed: 41729,
      current_random_coordinate_m: { x: sample.xM, y: sample.yM },
      random_placement_without_bias: true,
      duplicate_coordinates_allowed: false,
      habitat: { dimensions_m: [10, 10], area_m2: 100, living_turf: true, grass_blade_count: 26720, grass_blade_density_per_rendered_m2: 78.0, grass_blade_geometry: 'short tapered strip with a pointed tip', grass_blade_height_range_world: [0.194, 0.329], subtle_per_blade_tone_variation: true, rendered_meadow_bounds_world: { x: [-14, 14], z: [-3.05, 9.95] }, rendered_meadow_extends_beyond_visible_view: true, supported_maximum_scene_aspect: 2.5, moss_patch_count: 900, moss_between_grass_blades: true, daisy_model_detail: 'curved stems, leaves, individual white petals and yellow disc florets' },
      quadrat: { dimensions_m: [1, 1], area_m2: 1, internal_grid: '4 × 4', aluminium_frame: true, rooted_inside_rule: 'include top and right boundary only', initial_world_position: [-2.75, 0.43, 1.2], visible_at_supported_browser_widths: true },
      coordinate_generator: { world_position: [-3.2, 0.36, -0.25], visible_at_supported_browser_widths: true },
      grid_tapes: { physical_lengths_m: { x: 10, y: 10 }, common_origin_world: tapeOrigin, x_direction_world: [1, 0, 0], y_direction_world: [0, 0, 1], x_end_world: tapeXEnd, y_end_world: tapeYEnd, current_x_end_world: [+(tapeOrigin[0] + (tapeXEnd[0] - tapeOrigin[0]) * tapeXProgress).toFixed(3), tapeOrigin[1], tapeOrigin[2]], current_y_end_world: [tapeOrigin[0], tapeOrigin[1], +(tapeOrigin[2] + (tapeYEnd[2] - tapeOrigin[2]) * tapeYProgress).toFixed(3)], x_unroll_progress: +tapeXProgress.toFixed(3), y_unroll_progress: +tapeYProgress.toFixed(3), right_angle_degrees: 90, direction_dot_product: 0, share_exact_origin: true, lie_on_meadow_surface: true, x_increases_left_to_right: true, y_increases_toward_foreground: true, completed_endpoints_inside_supported_view: true },
      current_target_world: [sample.worldX, .39, sample.worldZ],
      current_count: state.quadratStage >= 8 ? sample.daisies : state.quadratCurrentCount,
      highlighted_daisy_ids: Array.from({ length: state.quadratStage >= 8 ? sample.daisies : state.quadratCurrentCount }, (_, i) => `sample-${state.quadratSampleIndex + 1}-daisy-${i + 1}`),
      results: state.quadratResults.map(result => ({ ...result })),
      mean_density_daisies_m2: +quadratMean().toFixed(1),
      estimated_population_in_100_m2: quadratPopulationEstimate(),
      environment: { laboratory_tiles_visible: false, laboratory_worktop_visible: false, laboratory_cupboards_visible: false, full_height_meadow_scene: true, outdoor_scene_extends_behind_footer: true, horizontal_field_overscan: true, narrow_arena_horizontal_framing_preserved: true, supported_minimum_arena_aspect: 0.43, forest_background: true, detailed_trees: true, realistic_layered_trees: true, tree_depth_rows: 3, curved_tapered_trunks: true, radial_connected_branches: true, canopy_lobes_per_tree: 11, visible_root_flares: true, low_polygon_background_branches: true, forest_shrub_count: 28, blue_sunny_sky: true, sun_visible: true, cloud_count: 3, grass_growth_fraction: +Math.min(1, state.meadowWindClock / 2.8).toFixed(2), moss_growth_fraction: +Math.min(1, Math.max(0, state.meadowWindClock - .28) / 1.9).toFixed(2), wind_clock_s: +state.meadowWindClock.toFixed(2), grass_and_daisies_sway_in_wind: true },
      animation: { turf_grows_into_full_outdoor_arena: state.meadowWindClock < 2.8, moss_emerges_between_blades: state.meadowWindClock < 2.18, upper_tree_canopies_sway_from_fixed_lower_trunks: true, subtle_leaf_mass_flutter: true, coordinate_generator_spins: state.quadratStage === 3, quadrat_smooth_throw_arc: state.quadratStage === 5, quadrat_settle_bounce: state.quadratStage === 5, counted_daisies_pulse: state.quadratStage === 7 || state.quadratStage === 8, measuring_tapes_unwind: state.quadratStage === 1 },
      complete: state.complete,
      conclusion: state.complete ? 'Five randomly located repeats give a mean of 5.0 daisies m⁻² and an estimated population of 500 daisies in the 100 m² habitat.' : null
    };
    payload.controls = ['LAY GRID TAPES', 'GENERATE POINT', 'PLACE QUADRAT', 'COUNT DAISIES', 'RECORD SAMPLE', 'NEXT SAMPLE', 'RESET STUDY', 'RESULTS', 'METHOD', 'F fullscreen'];
  } else if (id === 'capture') {
    const phases = ['meadow population moving naturally; traps ready to set', 'installing recessed covered traps while other beetles continue roaming', 'first sample held safely in the five traps while uncaptured beetles remain in the meadow', 'transferring, counting and applying one white dorsal paint spot to each beetle', 'sixteen visibly marked beetles arranged in the inspection tray while uncaptured beetles continue roaming', 'releasing marked beetles, allowing 24-hour mixing and forming the second trap sample', 'second sample held in the reset traps', 'transferring and counting twenty beetles while identifying six retained white marks', 'second sample arranged with exactly six marked recaptures', 'Lincoln Index study complete'], visible = captureVisibleCounts(), stageDuration = captureStageDurations[state.captureStage] || 0, stageProgress = captureStageProgress(), estimateExact = state.captureFirstCatch * state.captureSecondCatch / state.captureRecaptured, marksOnTray = state.captureStage === 3 ? visible.firstMarked : state.captureStage === 4 ? state.captureFirstCatch : state.captureStage >= 7 ? visible.secondMarked : 0, firstUncapturedTotal = 40 - state.captureFirstCatch, firstUncapturedVisible = state.captureStage <= 4 ? Math.min(firstUncapturedTotal, state.captureSecondCatch - state.captureRecaptured) : 0;
    payload.graph_axes = null; payload.graph_readings = state.complete ? 1 : 0; payload.results_view = 'Lincoln Index calculation';
    payload.capture_mark_recapture_practical = {
      stage: state.captureStage,
      phase: phases[state.captureStage],
      elapsed_stage_s: +state.captureTimer.toFixed(2),
      stage_duration_s: stageDuration,
      stage_progress: +stageProgress.toFixed(3),
      first_catch_marked: state.captureStage >= 4 ? state.captureFirstCatch : null,
      second_catch_total: state.captureStage >= 8 ? state.captureSecondCatch : null,
      marked_recaptured: state.captureStage >= 8 ? state.captureRecaptured : null,
      environment: { laboratory_tiles_visible: false, laboratory_worktop_visible: false, laboratory_bench_front_visible: false, laboratory_cupboards_visible: false, full_height_meadow_extends_behind_footer: true, forest_background: true, responsive_horizontal_overscan: true },
      habitat: { living_turf: true, grass_blade_count: 50000, grass_blade_density_per_rendered_m2: 146.0, grass_blade_geometry: 'short tapered strip with a pointed tip', subtle_per_blade_tone_variation: true, rendered_meadow_bounds_world: { x: [-14, 14], z: [-3.05, 9.95] }, rendered_meadow_extends_beyond_visible_view: true, moss_patch_count: 900, grass_and_tree_canopies_sway_smoothly: true },
      pitfall_traps: { count: 5, installed_fraction: state.captureStage < 1 ? 0 : state.captureStage === 1 ? +Math.min(1, stageProgress / .58).toFixed(3) : 1, recessed_open_cups: true, flush_with_soil_surface: true, cup_depth_world: .34, dark_visible_mouths: true, disturbed_soil_lips: true, raised_transparent_rain_covers: true, grass_clearance_around_each_mouth: true, caught_first_sample_visible: visible.firstCaught, caught_second_sample_visible: visible.secondCaught },
      beetle_model: { total_models: 40, type: 'ground beetle', body_parts: ['head', 'pronotum', 'paired elytra', 'central elytral seam'], leg_count_each: 6, antenna_count_each: 2, body_remains_dark_when_marked: true, paint_mark: 'small separate cream-white dorsal spot on one elytron', inspection_tray_visible: [3, 4, 5, 7, 8, 9].includes(state.captureStage), magnifier_visible: state.captureStage === 7 && stageProgress > .4 || state.captureStage >= 8 },
      first_sample: { modelled_population_total: 40, target_total: state.captureFirstCatch, visibly_caught: visible.firstCaught, uncaptured_total: firstUncapturedTotal, visibly_roaming_uncaptured: firstUncapturedVisible, entire_population_was_not_captured: true, visibly_white_marked: visible.firstMarked, visibly_released: visible.released, all_marks_complete: state.captureStage >= 4 },
      release_and_mixing: { release_is_animated: state.captureStage === 5, released_count: visible.released, dispersal_fraction: state.captureStage < 5 ? 0 : state.captureStage === 5 ? +Math.min(1, stageProgress / .68).toFixed(3) : 1, mixing_period_hours: state.captureStage >= 6 ? 24 : state.captureStage === 5 ? +(Math.max(0, stageProgress - .58) / .42 * 24).toFixed(1) : 0, marked_and_unmarked_beetles_mix_before_recapture: true },
      second_sample: { target_total: state.captureSecondCatch, visibly_counted_total: visible.secondCaught, target_marked_recaptures: state.captureRecaptured, visibly_identified_marked: visible.secondMarked, visible_white_marks_on_inspection_tray: marksOnTray },
      animation: { traps_install_with_staggered_lowering_and_settle: state.captureStage === 1, beetles_walk_and_drop_into_traps: state.captureStage === 1 || state.captureStage === 5, uncaptured_beetles_continue_roaming_during_first_sample: state.captureStage <= 4, first_sample_transfers_to_tray_in_smooth_arcs: state.captureStage === 3, paint_marker_visits_each_beetle_sequentially: state.captureStage === 3, beetles_walk_outward_during_release: state.captureStage === 5, second_sample_transfers_to_tray_progressively: state.captureStage === 7, magnifier_scans_marked_recaptures: state.captureStage === 7, full_rig_rebuild_between_stages: false },
      welfare: { non_toxic_quick_drying_paint: true, tiny_mark_does_not_impair_movement: true, traps_checked_promptly: true, rain_covers_reduce_flooding_and_predation: true, beetles_released_at_capture_site: true },
      assumptions: ['population is closed during the study', 'paint marks are retained and recognised', 'marked beetles mix fully back into the population', 'marked and unmarked beetles have equal capture probability', 'marking does not affect survival or behaviour'],
      lincoln_index_calculation: state.complete ? `(${state.captureFirstCatch} × ${state.captureSecondCatch}) ÷ ${state.captureRecaptured} = ${estimateExact.toFixed(1)} ≈ ${Math.round(estimateExact)} beetles` : null,
      lincoln_index_estimate: state.complete ? Math.round((state.captureFirstCatch * state.captureSecondCatch) / state.captureRecaptured) : null,
      complete: state.complete
    };
    payload.controls = ['SET TRAPS', 'FIRST CAPTURE', 'RELEASE & WAIT', 'SECOND CAPTURE', 'RECORD', 'RESET STUDY', 'RESULTS', 'METHOD', 'F fullscreen'];
  } else if (id === 'shoretransect') {
    const station = currentTransectStation(), phases = ['rocky shore and incoming tide ready', 'unreeling parallel belt tapes downslope', 'belt fixed through all three strata', 'moving quadrat to fixed station', 'quadrat positioned on shore rock', 'identifying organisms and estimating cover', 'station ready to record', 'station recorded'];
    payload.graph_axes = null; payload.graph_readings = state.transectResults.length; payload.results_view = 'multi-species zonation profile and six-station results table';
    payload.rocky_shore_transect_practical = {
      stage: state.transectStage,
      phase: phases[state.transectStage],
      elapsed_stage_s: +state.transectTimer.toFixed(2),
      station: state.transectStationIndex + 1,
      current_distance_down_shore_m: station.distanceM,
      current_stratum: station.zone.toLowerCase(),
      sampling_design: { method: 'systematic belt transect within upper, middle and lower shore strata', belt_length_m: 10, belt_width_m: 1, station_interval_m: 2, stations_per_stratum: 2, quadrat_area_m2: 1, tape_perpendicular_to_waterline: true, first_quadrat_clear_of_cliff_face: true },
      current_observation: state.transectStage >= 6 ? { limpets: station.limpets, barnacle_cover_percent: station.barnacleCover, brown_seaweed_cover_percent: station.seaweedCover } : null,
      results: state.transectResults.map(result => ({ station: result.station, distance_m: result.distanceM, stratum: result.zone.toLowerCase(), limpets: result.limpets, barnacle_cover_percent: result.barnacleCover, brown_seaweed_cover_percent: result.seaweedCover })),
      landscape: { laboratory_tiles_visible: false, realistic_rocky_shore: true, realistic_eroded_cliff: true, detailed_cliffs: true, cliff_face_grid: [75, 12], continuous_cliff_top: true, grass_topped_cliff: true, cliff_top_grass_blades: 680, cliff_top_grass_geometry: 'short tapered strip with a pointed tip', cliff_top_grass_subtle_tone_variation: true, broken_projecting_rock_ledges: 19, recessed_branched_fissures: true, exposed_peat_soil_edge: true, cliff_lichen_patches: 48, cliff_maximum_world_y: 3.02, cliff_within_canvas: true, cliff_bounds_world: { x: [-12.2, 12.2], maximum_y: 3.02 }, supported_max_scene_aspect: 2.17, rock_beach_floor_bounds_world: { x: [-13.5, 13.5], z: [-4.6, 7.4] }, rock_beach_floor_extends_beyond_visible_view: true, minimum_compact_lateral_overdraw_world: 1.7, foreground_depth_overdraw_world: 2.5, shore_gravel_count: 300, irregular_rock_pools: true, rock_pool_count: 3, rock_pool_seaweed_clumps: 12, wet_and_dry_rock_zones: true, organisms: ['limpets', 'barnacles', 'green seaweed', 'brown seaweed', 'lichen'], organisms_distributed_beyond_measured_belt: true, ambient_organism_bounds_world: { x: [-12.65, 12.65], z: [-1.65, 3.75] }, ambient_organism_counts: { limpets: 64, barnacles: 220, green_seaweed_clumps: 24, brown_seaweed_clumps: 24 } },
      tide: { incoming_from_bottom_foreground: true, progress: +state.shoreTideProgress.toFixed(3), clock_s: +state.shoreTideClock.toFixed(2), layered_gerstner_style_waves: true, translucent_shallow_water: true, water_world_dimensions: [22, 12], animated_foam_bands: 3, foam_world_span: 22.4, wet_rock_front: true, safe_working_line_observed: true },
      lab_drawers_hidden: true,
      animation: { tape_unreels_smoothly: state.transectStage === 1, quadrat_moves_and_settles: state.transectStage === 3, organisms_highlight_during_survey: state.transectStage === 5 || state.transectStage === 6, rock_pool_seaweed_sways: true, tide_continuously_animated: true },
      complete: state.complete,
      conclusion: state.complete ? 'Barnacle cover is greatest on the exposed upper shore, while brown seaweed cover increases toward the wetter lower shore.' : null
    };
    payload.controls = ['LAY TRANSECT', 'MOVE QUADRAT', 'SURVEY QUADRAT', 'RECORD SAMPLE', 'NEXT POSITION', 'RESET TRANSECT', 'ZONATION', 'METHOD', 'F fullscreen'];
  }
  if (id === 'hydrogen' && payload.hydrogen_practical) {
    payload.hydrogen_practical.palm_crease_layout = {
      count: 3,
      lower_crease: 'mid-lower palm curving upward toward the top of the palm',
      lambda_branches: 2,
      lambda_origin: 'midpoint of the thumb-index web'
    };
  }
  return JSON.stringify(payload)
};
const rippleAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(rippleAwareRenderGameToText());
  if (practicals[state.selected].id === 'ripple') {
    const trial = currentRippleTrial(), measurement = rippleTrialMeasurement(trial), phases = ['shallow water ready to level', 'levelling tank and checking water depth', 'level tank ready to start vibrator', 'straight dipper ramping up and wavefronts forming', 'steady plane waves ready to measure', 'strobe synchronising and ruler aligning across ten wavelengths', 'measurement ready to calculate and record', 'trial recorded'];
    payload.graph_axes = { x: 'frequency / Hz', y: 'wave speed / m s⁻¹', chart_type: 'compact line graph with raw-data table' };
    payload.graph_readings = state.rippleResults.length;
    payload.results_columns = ['frequency_hz', 'distance_across_10_wavelengths_cm', 'wavelength_cm', 'wave_speed_m_s'];
    payload.results_view = 'five-frequency raw-data table, speed-versus-frequency graph and mean-speed card';
    payload.ripple_tank_practical = {
      stage: state.rippleStage,
      phase: phases[state.rippleStage],
      elapsed_stage_s: +state.rippleTimer.toFixed(2),
      trial: state.rippleTrialIndex + 1,
      wave_clock_s: +state.rippleWaveClock.toFixed(2),
      tank: {
        shallow_water_visible: true,
        water_depth_cm: 1.5,
        level_fraction: state.rippleStage === 1 ? +rippleStageProgress().toFixed(2) : state.rippleStage >= 2 ? 1 : 0,
        transparent_base: true,
        four_adjustable_feet: true,
        spirit_level_visible: true,
        foam_absorbing_beach: true
      },
      driver: {
        type: 'motorised straight bar dipper',
        signal_generator_frequency_hz: trial.frequencyHz,
        amplitude_constant: true,
        active: state.rippleStage >= 3,
        smooth_sinusoidal_vertical_motion: true,
        plane_wavefronts: true
      },
      strobe: {
        overhead_led_visible: true,
        synchronising: state.rippleStage === 5,
        synchronised_to_frequency: state.rippleStage >= 6,
        projected_wave_pattern_appears_stationary: state.rippleStage >= 6
      },
      visual_model: {
        rocky_shore_sea_shader_adapted_for_regular_plane_waves: true,
        true_two_dimensional_water_surface: true,
        physical_animation_frequency_matches_generator_hz: true,
        projected_light_and_dark_wavefront_bands: true,
        full_screen_flashing_avoided: true
      },
      current_measurement: {
        crest_to_crest: true,
        selected_crest_count: 11,
        wavelengths_spanned: 10,
        distance_across_10_wavelengths_cm: state.rippleStage >= 5 ? +state.rippleTenWavelengthCm.toFixed(1) : null,
        wavelength_cm: state.rippleStage >= 5 ? +state.rippleWavelengthCm.toFixed(2) : null,
        wavelength_m: state.rippleStage >= 6 ? +(measurement.wavelengthCm / 100).toFixed(4) : null,
        calculated_wave_speed_m_s: state.rippleStage >= 5 ? +state.rippleSpeedMs.toFixed(4) : null,
        calculation: state.rippleStage >= 6 ? `${trial.frequencyHz.toFixed(1)} Hz × ${(measurement.wavelengthCm / 100).toFixed(4)} m = ${measurement.speedMs.toFixed(3)} m s⁻¹` : null,
        transparent_ruler_visible: state.rippleStage >= 5,
        double_arrow_markers_visible: state.rippleStage >= 5
      },
      results: state.rippleResults.map(result => ({ trial: result.trial, frequency_hz: result.frequencyHz, distance_across_10_wavelengths_cm: result.tenWavelengthCm, wavelength_cm: +result.wavelengthCm.toFixed(2), wavelength_m: +result.wavelengthM.toFixed(4), wave_speed_m_s: +result.speedMs.toFixed(4) })),
      mean_wave_speed_m_s: state.rippleResults.length ? +rippleMeanSpeed().toFixed(4) : null,
      variables: { independent: 'dipper frequency / Hz', dependent: 'wavelength and calculated wave speed', controls: ['water depth', 'dipper amplitude and shape', 'tank level', 'measurement direction', 'absorbing beach'] },
      animation: { levelling_feet_turn_smoothly: state.rippleStage === 1, spirit_bubble_centres_smoothly: state.rippleStage === 1, motor_ramps_without_step_changes: state.rippleStage === 3, wavefronts_propagate_continuously: state.rippleStage >= 3, strobe_sync_transition_smooth: state.rippleStage === 5, ruler_glides_and_markers_expand: state.rippleStage === 5 },
      complete: state.complete,
      conclusion: state.complete ? `Mean speed ${rippleMeanSpeed().toFixed(3)} m s⁻¹: frequency increased while wavelength decreased, so wave speed stayed approximately constant at fixed depth.` : null
    };
    payload.controls = ['LEVEL TANK', 'START VIBRATOR', 'MEASURE 10 WAVES', 'RECORD SPEED', 'NEXT FREQUENCY', 'RESET SERIES', 'RESULTS', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const graphModalAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(graphModalAwareRenderGameToText());
  const kind = currentGraphModalKind(practicals[state.selected].id), buttonVisible = state.tab === 'graph' && !!kind;
  payload.graph_modal = {
    available: !!kind,
    button_visible: buttonVisible,
    button_label: buttonVisible && !mobileLandscapeLayout ? 'EXPAND' : null,
    button_icon: buttonVisible && mobileLandscapeLayout ? 'four-corner expand' : null,
    button_text_visible: buttonVisible ? !mobileLandscapeLayout : false,
    button_row: buttonVisible ? mobileLandscapeLayout ? 'method and graph tabs' : 'graph heading' : null,
    open: !!state.graphModal,
    chart_kind: kind,
    sidebar_header_layout: buttonVisible ? {
      expand_button_top_y: mobileLandscapeLayout ? 82 : GRAPH_SIDEBAR_HEADER_Y - 14,
      expand_button_bottom_y: mobileLandscapeLayout ? 114 : GRAPH_SIDEBAR_HEADER_Y + 14,
      graph_heading_center_y: graphSidebarContentY(practicals[state.selected].id),
      heading_and_expand_same_row: !mobileLandscapeLayout,
      tabs_and_expand_same_row: mobileLandscapeLayout,
      description_first_line_center_y: graphSidebarDescriptionY(graphSidebarContentY(practicals[state.selected].id)),
      description_spacing_from_header_centres_px: GRAPH_SIDEBAR_DESCRIPTION_OFFSET,
      description_clearance_below_expand_px: graphSidebarDescriptionY(graphSidebarContentY(practicals[state.selected].id)) - 5 - (mobileLandscapeLayout ? 114 : GRAPH_SIDEBAR_HEADER_Y + 14),
      text_overlap: false
    } : null,
    scaled_view: state.graphModal ? {
      width_px: Math.round(Math.min(1050, W - 40)),
      height_px: Math.round(Math.min(680, H - 40)),
      axes_scaled: true,
      tick_labels_scaled: true,
      data_marks_scaled: true,
      annotations_scaled: true
    } : null
  };
  if (buttonVisible) payload.controls = [...new Set([...(payload.controls || []), 'EXPAND GRAPH', ...(state.graphModal ? ['CLOSE GRAPH MODAL'] : [])])];
  return JSON.stringify(payload)
};
const responsiveAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(responsiveAwareRenderGameToText());
  payload.responsive_layout = {
    viewport_css_px: { width: Math.round(VIEW_W), height: Math.round(VIEW_H) },
    logical_canvas_px: { width: Math.round(W), height: Math.round(H) },
    scale: +UI_SCALE.toFixed(3),
    mode: portraitPromptVisible ? 'portrait rotation prompt' : UI_SCALE < 1 ? 'compact landscape' : 'desktop',
    portrait_prompt_visible: portraitPromptVisible,
    three_column_layout_preserved: !portraitPromptVisible,
    mobile_landscape_layout: mobileLandscapeLayout,
    pointer_coordinates_scaled: UI_SCALE < 1,
    minimum_touch_target_css_px: UI_SCALE < 1 ? 44 : null
  };
  return JSON.stringify(payload)
};
const bunsenGeometryAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(bunsenGeometryAwareRenderGameToText());
  const geometry = {
    main_tube: 'hollow with chamfered wider mouth and real intake opening',
    base_top_sealed_to_main_tube: true,
    main_tube_outer_diameter_scene_units: .208,
    main_tube_inner_diameter_scene_units: .174,
    chamfered_mouth_outer_diameter_scene_units: .26,
    air_intake_valve: 'short, thin collar immediately above the base-to-barrel seal',
    air_intake_collar_bottom_gap_scene_units: .02,
    air_intake_collar_height_scene_units: .2,
    air_intake_collar_inner_diameter_scene_units: .216,
    air_intake_collar_radial_thickness_scene_units: .0155,
    air_intake_collar_wall_reduction_percent: 50,
    air_intake_collar_finish: 'brushed steel matching the main Bunsen tube',
    air_intake_collar_edge_profile: 'square unrounded top and bottom edges',
    air_intake_outer_diameter_scene_units: .247,
    air_intake_opening_count: 1,
    air_intake_collar_front_hole_diameter_scene_units: .136,
    main_tube_front_hole_diameter_scene_units: .122,
    air_intake_adjustment_tab_present: false,
    air_intake_hole_geometry: 'one larger actual front perforation through collar and main tube with recessed tunnel wall',
    air_intake_hole_alignment: 'barrel opening slightly offset behind collar opening for depth',
    gas_connector_height_scene_units: .18,
    gas_connector_finish: 'black matching the flexible gas hose',
    gas_connector_restored_to_previous_height: true,
    gas_connector_raised_with_valve: false,
    hose_radius_scene_units: .057,
    hose_minimum_centre_height_scene_units: .14,
    hose_minimum_ground_clearance_scene_units: .083,
    hose_kink_reduced: true,
    hose_overlaps_brass_valve_scene_units: .2,
    hose_valve_overlap_sleeve: true,
    hose_valve_sleeve_profile: 'rubber cuff flares from 0.059 to 0.094 scene-unit radius over the brass barbs',
    hose_valve_sleeve_flared: true,
    hose_valve_final_approach_axis: '+x coaxial with the gas-tap outlet',
    hose_valve_final_tangent: [1, 0, 0],
    gas_tap_outlet_profile: 'tapered brass spigot, narrow at the hose entry and widening toward the valve body',
    gas_tap_outlet_entry_radius_scene_units: .06,
    gas_tap_outlet_base_radius_scene_units: .078,
    flame_width_scale_from_previous_geometry: .881,
    dependent_animations_realigned: true,
    collar_turn_uses_updated_geometry: true,
    flame_rim_core_and_jets_scaled: true,
    coloured_flame_overlays_scaled: true,
    flame_test_sample_alignment: 'salt scoop centre remains on the narrowed burner axis'
  };
  const transition = lab3d.bunsenLoadState?.();
  const transitionState = transition ? {
    appearance_animation_scope: 'all lit Bunsen instances in every practical',
    active: lab3d.bunsenTransitionActive,
    elapsed_s: +transition.elapsed_s.toFixed(2),
    progress: +transition.progress.toFixed(2),
    phase: transition.phase,
    collar_rotation_degrees: +transition.collar_rotation_degrees.toFixed(1),
    collar_open_fraction: +transition.collar_open_fraction.toFixed(2),
    flame_heat_mix: +transition.heat_mix.toFixed(2),
    safety_flame_visible: transition.heat_mix < .98,
    powerful_blue_heating_flame_visible: transition.heat_mix > .78,
    complete: transition.complete
  } : null;
  payload.bunsen_geometry = geometry;
  payload.lab_bench_front = ['quadrats', 'capture', 'shoretransect'].includes(practicals[state.selected].id) ? {
    finish: ['quadrats', 'capture'].includes(practicals[state.selected].id) ? 'replaced by the full-height living meadow scene' : 'hidden behind the full-height rocky-shore and sea scene',
    embossed_door_panelling: false,
    responsive_panel_count: 0,
    blue_resin_worktop_edge_retained: false,
    drawers_hidden_for_this_practical_only: true,
    outdoor_scene_replaces_worktop_and_cupboards: true
  } : {
    finish: 'dark grey enamel',
    embossed_door_panelling: true,
    responsive_panel_count: '2 to 4',
    blue_resin_worktop_edge_retained: true
  };
  payload.right_sidebar_layout = {
    fills_available_vertical_space: state.tab === 'bench',
    adaptive_section_spacing: true,
    remaining_height_allocated_to_content_cards: true,
    excessive_blank_section_gaps_removed: true,
    larger_responsive_typography: true,
    explicit_heading_to_content_spacing: true,
    method_stage_cards: true,
    method_stage_text_wrap: 'complete multiline text without clipping or ellipsis',
    reactant_text_wrap: 'complete multiline text without clipping or ellipsis',
    apparatus_text_wrap: 'complete multiline text without clipping or ellipsis',
    guidance_text_wrap: 'complete multiline text',
    compact_landscape_supported: true,
    ...(rightSidebarLayoutSnapshot || {})
  };
  const activePractical = practicals[state.selected];
  payload.reactant_interaction = activePractical.id === 'free' ? {
    mode: 'experiment setup',
    listed_reactants: reactantShelf.map(item => item.name),
    click_enabled: true,
    drag_enabled: true,
    dose_selection_enabled: true,
    preserved_for_chemistry_free_workspace: true
  } : {
    mode: 'health and safety information',
    listed_reactants: [...activePractical.reactants],
    click_enabled: true,
    drag_enabled: false,
    experiment_setup_action_hidden: true,
    heading: ['quadrats', 'capture', 'shoretransect', 'antibiotics'].includes(activePractical.id) ? 'BIOLOGICAL SAMPLES — CLICK FOR SAFETY' : ['ripple', 'hooke', 'specificheat', 'latentheat', 'ivdevices'].includes(activePractical.id) ? 'MATERIALS — CLICK FOR SAFETY' : activePractical.id === 'nuclear' ? 'SEALED SOURCES — CLICK FOR SAFETY' : 'REACTANTS — CLICK FOR SAFETY',
    popup: state.reactantSafety ? {
      open: true,
      reactant: state.reactantSafety.name,
      rating: state.reactantSafety.rating,
      main_hazard: state.reactantSafety.summary,
      safe_handling: state.reactantSafety.handling,
      spill_or_exposure: state.reactantSafety.response,
      disposal: state.reactantSafety.disposal
    } : { open: false }
  };
  if (state.reactantSafety) payload.controls = [...new Set([...(payload.controls || []), 'CLOSE SAFETY INFO'])];
  if (payload.practical_evaluation) payload.practical_evaluation.open = !!state.evaluationModal;
  payload.canvas_compositing = {
    webgl_arena_ui_overlay_alpha: 0,
    arena_cutout: 'fully transparent clearRect',
    blend_state_reset_each_frame: true,
    wall_tiles_behind_webgl_apparatus: !['quadrats', 'capture', 'shoretransect'].includes(activePractical.id),
    opaque_3d_apparatus_preserved: true
  };
  if (transitionState) payload.bunsen_load_transition = transitionState;
  payload.workspace_items?.forEach(item => {
    if (item.type === 'bunsen') Object.assign(item, geometry)
  });
  if (payload.flame_tests?.apparatus_layout) {
    Object.assign(payload.flame_tests.apparatus_layout, geometry);
    if (transitionState) {
      payload.flame_tests.burner_load_transition = { ...transitionState };
      payload.flame_tests.blue_flame_visible = transition.heat_mix > .78;
      payload.flame_tests.safety_flame_visible = transition.heat_mix < .98
    }
  }
  return JSON.stringify(payload)
};
const alkaliAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(alkaliAwareRenderGameToText());
  const activeId = practicals[state.selected].id;
  const sidebar = sidebarMetrics(state.subject || 'chemistry');
  payload.left_practical_sidebar = {
    scroll_enabled: sidebar.maxScroll > 0,
    scrollbar_visible: false,
    input: 'mouse wheel or trackpad over the clipped practical rail',
    subject: state.subject || 'chemistry',
    scroll_offset_px: +(state.sidebarScroll?.[state.subject || 'chemistry'] || 0).toFixed(1),
    maximum_scroll_offset_px: +sidebar.maxScroll.toFixed(1),
    visible_card_count: sidebar.visible.length
  };
  if (activeId === 'alkali') {
    const metal = alkaliMetal();
    const phases = ['screened trough ready', 'forceps lowering sample', 'metal reacting with water', 'observation ready to record', 'observation recorded', 'clearing protected trough'];
    payload.graph_axes = null;
    payload.results_columns = ['metal', 'fizzing_and_motion', 'flame_colour', 'relative_reactivity'];
    payload.results_view = 'protected alkali-metal comparison table';
    payload.alkali_metals = {
      stage: state.alkaliStage,
      phase: phases[state.alkaliStage],
      timer_s: +state.alkaliTimer.toFixed(2),
      selected_metal: metal.name,
      selected_symbol: metal.symbol,
      trial_number: Math.min(3, state.alkaliResults.length + 1),
      reaction_progress: +state.alkaliReactionProgress.toFixed(2),
      apparatus: 'acrylic water trough with universal indicator, sealed sample vials, remote forceps and three-sided transparent safety screen',
      simulation_only: true,
      safety_screen_in_place: true,
      forceps_holding_sample: state.alkaliStage === 0 || state.alkaliStage === 1,
      metal_floating: state.alkaliStage === 2,
      sodium_melting_visible: metal.id === 'sodium' && state.alkaliStage === 2,
      hydrogen_bubbles_visible: state.alkaliStage === 2 && state.alkaliReactionProgress > .02,
      ripple_rings_visible: state.alkaliStage === 2 && state.alkaliReactionProgress > .02,
      alkaline_indicator_spreading: state.alkaliStage >= 2 && state.alkaliStage <= 5,
      indicator_colour: state.alkaliStage >= 3 && state.alkaliStage <= 5 ? 'purple alkaline solution' : state.alkaliStage === 2 ? 'purple spreading from the reaction point' : 'cyan neutral water',
      flame: metal.id === 'lithium' ? null : state.alkaliStage === 2 && state.alkaliReactionProgress > .18 && state.alkaliReactionProgress < .9 ? metal.flame : null,
      temperature_c: +state.temp.toFixed(1),
      ph: +state.ph.toFixed(1),
      observations: state.alkaliResults.map(result => ({ metal: result.name, symbol: result.symbol, flame: result.flame, observation: result.observation })),
      reactivity_order: state.complete ? ['Li', 'Na', 'K'] : null
    };
    payload.controls = ['LOWER METAL', 'RECORD OBSERVATION', 'NEXT METAL', 'RESET SERIES', 'RESULTS', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload);
};
installPhotosynthesisMessageApi();
applyPhotosynthesisFocusFromUrl();
resize(); requestSimulationFrame();
function drawChromatogramSoakPanel(x, y, w, h) {
  const q = Math.max(0, Math.min(1, state.progress)), splitQ = Math.max(0, Math.min(1, (q - .03) / .2)), selected = state.chromSelectedDye, measurements = chromMeasurementData(), frontFinished = q >= .94;
  text('CHROMATOGRAM', x, y, 10, C.muted, 800); wrappedText('Click a coloured pigment to measure from the graphite baseline.', x, y + 18, w, 9.1, C.ink, 600, 12, 2);
  const cardY = y + 37, cardH = Math.min(254, h - 270); rr(x, cardY, w, cardH, 8, '#fff', C.line); const paperW = Math.min(116, w - 84), paperH = cardH - 30, px = x + (w - paperW) / 2, py = cardY + 15;
  ctx.save(); ctx.fillStyle = 'rgba(20,42,50,.12)'; ctx.filter = 'blur(5px)'; ctx.fillRect(px + 3, py + 4, paperW, paperH); ctx.filter = 'none'; ctx.fillStyle = '#fffdf3'; ctx.fillRect(px, py, paperW, paperH); ctx.strokeStyle = '#d5d5ca'; ctx.lineWidth = 1; ctx.strokeRect(px + .5, py + .5, paperW - 1, paperH - 1); ctx.strokeStyle = 'rgba(211,203,181,.28)'; ctx.lineWidth = 1; for (let i = 12; i < paperH; i += 18) { ctx.beginPath(); ctx.moveTo(px + 5, py + i); ctx.lineTo(px + paperW - 5, py + i + Math.sin(i) * .8); ctx.stroke() }
  const baselineY = py + paperH - 38, solventY = baselineY - (paperH - 62) * q, centreX = px + paperW / 2;
  if (q > .005) { const soak = ctx.createLinearGradient(0, solventY, 0, py + paperH); soak.addColorStop(0, 'rgba(134,216,231,.13)'); soak.addColorStop(.2, 'rgba(111,202,224,.22)'); soak.addColorStop(1, 'rgba(62,169,202,.4)'); ctx.fillStyle = soak; ctx.fillRect(px + 2, solventY, paperW - 4, py + paperH - solventY); ctx.fillStyle = 'rgba(94,190,214,.2)'; ctx.fillRect(px + 6, solventY - 2, paperW - 12, 4) }
  ctx.strokeStyle = '#697174'; ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px + 10, baselineY); ctx.lineTo(px + paperW - 10, baselineY); ctx.stroke(); ctx.setLineDash([]); text('graphite baseline', centreX, baselineY + 13, 7.2, '#59666a', 600, 'center');
  if (frontFinished) { ctx.strokeStyle = '#737b7b'; ctx.lineWidth = 1.8; ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(px + 9, solventY); ctx.lineTo(px + paperW - 9, solventY); ctx.stroke(); ctx.setLineDash([]); text('solvent front · pencil', centreX, solventY - 10, 7.2, '#59666a', 600, 'center') } else if (q > .02) text('water soaking upward', centreX, solventY - 10, 7.2, '#328ba3', 700, 'center');
  ctx.save(); ctx.globalAlpha = 1 - splitQ; ctx.fillStyle = '#1d2225'; ctx.beginPath(); ctx.arc(centreX, baselineY, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); chromPigments.forEach((d, i) => { const rawY = baselineY - (d.end + .63) / 1.4 * (paperH - 62) * q, my = Math.max(solventY + 7, rawY), mx = centreX, visible = Math.max(0, Math.min(1, (q - .03) / .18)), radius = 3.4 + q * 1.5; ctx.save(); ctx.globalAlpha = visible * (selected === d.id ? .98 : .86); const grad = ctx.createRadialGradient(mx, my, 0, mx, my, radius * 2.2); grad.addColorStop(0, d.color); grad.addColorStop(.5, d.color); grad.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(mx, my, radius * 1.65, radius * 1.25, 0, 0, Math.PI * 2); ctx.fill(); if (selected === d.id && visible) { const rulerX = Math.min(px + paperW - 14, centreX + Math.max(24, paperW * .28)); ctx.globalAlpha = .9; ctx.strokeStyle = d.color; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(rulerX, baselineY); ctx.lineTo(rulerX, my); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(rulerX, baselineY + 1); ctx.lineTo(rulerX - 3, baselineY - 5); ctx.lineTo(rulerX + 3, baselineY - 5); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(rulerX, my - 1); ctx.lineTo(rulerX - 3, my + 5); ctx.lineTo(rulerX + 3, my + 5); ctx.closePath(); ctx.fill(); text(`${measurements[i].distance_cm.toFixed(1)} cm`, rulerX - 5, Math.max(py + 12, my - 12), 7.5, d.color, 800, 'right') } ctx.restore(); if (visible) hit('chrom-dye', mx - 12, my - 14, 24, 28, d.id) }); ctx.restore();
  const tableY = cardY + cardH + 22; text('MEASURED DISTANCES', x, tableY, 10, C.muted, 800); text('Click a pigment row to show its ruler.', x, tableY + 16, 8.8, C.muted, 550); chromPigments.forEach((d, i) => { const ry = tableY + 29 + i * 31, measurement = measurements[i], active = selected === d.id; rr(x, ry, w, 26, 6, active ? '#edf8f3' : '#fff', active ? d.color : C.line); ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(x + 13, ry + 13, 5, 0, Math.PI * 2); ctx.fill(); text(d.label, x + 26, ry + 13, 9.6, C.ink, 700); text(q > .02 ? `${measurement.distance_cm.toFixed(1)} cm` : '—', x + w - 90, ry + 13, 9.6, q > .02 ? d.color : C.muted, 800, 'right'); text(q > .02 ? `Rf ${measurement.rf.toFixed(2)}` : 'run separation', x + w - 10, ry + 13, 8.5, C.muted, 650, 'right'); hit('chrom-dye', x, ry, w, 26, d.id) }); const hintY = tableY + 29 + chromPigments.length * 31 + 11; rr(x, hintY, w, 46, 7, '#e8efed'); wrappedText(q > .02 ? 'Ruler distance is measured from the graphite baseline to the pigment centre.' : 'Start the separation, then click a pigment to measure it.', x + 12, hintY + 15, w - 24, 8.8, C.ink, 600, 11, 2);
}
drawChromatogramPanel = drawChromatogramSoakPanel;
const nuclearAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(nuclearAwareRenderGameToText());
  const buttonAudit = window.__buttonLabelAudit || [];
  payload.control_label_layout = {
    all_visible_button_labels_fit: buttonAudit.every(item => item.fits),
    visible_button_count: buttonAudit.length,
    wrapped_button_labels: buttonAudit.filter(item => item.lines.length > 1).map(item => ({ label: item.label, lines: item.lines, font_size_px: item.font_size_px })),
    minimum_font_size_px: buttonAudit.length ? Math.min(...buttonAudit.map(item => item.font_size_px)) : null,
    labels: buttonAudit.map(item => ({ ...item }))
  };
  if (practicals[state.selected].id === 'nuclear') {
    const source = nuclearSources[state.nuclearSource], absorber = nuclearAbsorbers[state.nuclearAbsorber], phases = ['shielded store ready', 'sealed source moving with remote tongs', 'source clamped at fixed mark', 'absorber moving into holder', 'source and absorber aligned', 'ten-second GM count running', 'reading held for comparison'];
    payload.graph_axes = null;
    payload.results_view = 'radiation penetration comparison readings';
    payload.nuclear_radiation = {
      stage: state.nuclearStage,
      phase: phases[state.nuclearStage] || phases[0],
      source: { id: source.id, isotope: source.isotope, radiation: source.symbol, sealed: state.nuclearSource > 0 },
      absorber: { id: absorber.id, label: absorber.label, transition_progress: +state.nuclearAnimProgress.toFixed(3) },
      source_transfer_progress: +state.nuclearSourceTransition.toFixed(3),
      timer_s: +state.nuclearTimer.toFixed(2),
      displayed_count: Math.floor(state.nuclearCount),
      target_count_10s: nuclearTargetCount10s(),
      equivalent_count_rate_cpm: state.nuclearStage === 6 ? state.nuclearCount * 6 : null,
      transmission_fraction_relative_to_open_beam: +nuclearTransmissionFraction().toFixed(3),
      counting: state.running,
      readings_saved: state.nuclearResults.map(result => ({ ...result })),
      canonical_comparisons_complete: state.complete,
      apparatus: {
        alignment: 'source, absorber and GM window remain at fixed positions without a visible rail or scale',
        source_handling: 'three sealed carriers, labelled lead-lined store and long-handled tongs visibly parked before pickup',
        store_lid_animation: 'lid opens slightly before the tongs approach, then closes after transfer',
        absorbers: ['paper 0.10 mm', 'aluminium 3 mm', 'lead 10 mm'],
        detector: 'cylindrical Geiger–Müller tube with thin mica window facing the source',
        scaler: 'compact angled digital counter positioned clear of the GM tube, with count and elapsed-time display'
      },
      educational_radiation_tracks: { visible_only_while_counting: true, types: ['clustered alpha particles', 'deflected beta electrons', 'luminous green sinusoidal gamma wave packets'], visible_in_reality: false },
      safety: { simulation_only: true, time_distance_shielding: true, sources_never_touched: true, store_sources_when_not_in_use: true }
    };
    payload.controls = [`SOURCE · ${source.short}`, `ABSORBER · ${absorber.short}`, state.running ? 'STOP COUNT' : 'MEASURE 10 s', 'RESET', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const ivDevicesAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(ivDevicesAwareRenderGameToText());
  if (practicals[state.selected].id === 'ivdevices') {
    const device = currentIvDevice(), phases = ['device seated; supply isolated', 'automatic forward and reverse voltage sweep', 'sweep complete; curve ready to save', 'curve saved; next device ready', 'component modules changing', 'all device curves complete'];
    payload.graph_axes = { x: 'potential difference across device / V', y: 'current / A', x_range: [-6, 6], y_range: [-.22, .22] };
    payload.results_view = 'three overlaid current–potential difference curves';
    payload.iv_characteristics = {
      stage: state.ivStage, phase: phases[state.ivStage] || phases[0], active_device: device.id, active_device_label: device.label,
      elapsed_stage_s: +state.ivTimer.toFixed(2), supply_voltage_v: +state.ivSupplyV.toFixed(3), device_voltage_v: +state.ivDeviceV.toFixed(3), current_a: +state.ivCurrentA.toFixed(5), current_ma: +(state.ivCurrentA * 1000).toFixed(2),
      polarity: state.ivSupplyV > .02 ? 'forward' : state.ivSupplyV < -.02 ? 'reverse' : 'zero / isolated', switch_closed: state.ivStage === 1 && Math.abs(state.ivSupplyV) > .02,
      apparatus: {
        power_pack: 'variable ±6 V DC laboratory power pack with live voltage display and rotary control', ammeter: 'digital ammeter connected in series', voltmeter: 'digital voltmeter connected in parallel across the active device',
        test_station: 'two shrouded spring terminals showing only the active component; inactive modules remain outside the visible workbench', devices: ['100 Ω axial fixed resistor with colour bands', '6 V MES laboratory filament bulb with transparent glass and visible coiled tungsten filament', 'red 5 mm LED with domed epoxy, cathode flat and 220 Ω protection resistor'],
        circuit_path: 'power pack positive → switch → ammeter → active device → power pack negative', voltmeter_branch: 'connected directly across both active-device terminals', cable_routes_separated: true
      },
      animations: { device_seating_smooth: state.ivStage === 4, completed_device_exits_left_and_next_enters_right: state.ivStage === 4, inactive_devices_outside_visible_workbench: true, switch_and_voltage_dial_smooth: state.ivStage === 1, polarity_plugs_cross_at_zero: state.ivStage === 1 && state.ivTimer >= ivSweepIntervalS * 7 && state.ivTimer <= ivSweepIntervalS * 10, moving_charge_markers: state.ivStage === 1 && Math.abs(state.ivCurrentA) > .0001, filament_temperature_and_glow_continuous: device.id === 'lamp', led_threshold_glow_continuous: device.id === 'led' },
      live_sweep_readings: state.ivSweepReadings.map(reading => ({ ...reading })), saved_curves: state.ivResults.map(result => ({ device: result.device, label: result.label, conclusion: result.conclusion, readings: result.readings.map(reading => ({ ...reading })) })), curves_complete: state.complete,
      scientific_conclusions: { resistor: ivDeviceDefinitions[0].conclusion, filament_lamp: ivDeviceDefinitions[1].conclusion, led: ivDeviceDefinitions[2].conclusion },
      safety: { low_voltage_supply: true, switch_off_before_changing_component_or_polarity: true, hot_lamp_cool_before_touching: true, led_protection_resistor_fitted: true }
    };
    payload.controls = [ivPrimaryLabel(), `DEVICE · ${device.short}`, 'RESET', 'CURVES', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const antibioticAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(antibioticAwareRenderGameToText());
  if (practicals[state.selected].id === 'antibiotics') {
    const phases = ['sterile field ready to prepare', 'disinfecting, air-drying and marking four sectors', 'four-sector aseptic field prepared', 'inoculating bacterial lawn and disposing swab', 'lawn inoculated; swab in biohazard waste', 'placing coded discs', 'discs placed', 'cross-taping, inverting and using glass-door incubator', 'grown plate returned; incubator closed', 'measuring zones through closed lid', 'measurements complete'];
    const growth = antibioticGrowthProgress(), measured = antibioticVisibleMeasurementCount(), stageQ = antibioticStageProgress(), preparation = lab3d.antibioticPreparationState || {}, swabTip = lab3d.antibioticSwabTipState || {};
    const incubatorDoorOpen = state.antibioticStage === 7 && ((stageQ >= .27 && stageQ < .51) || (stageQ >= .76 && stageQ < .96));
    const plateInIncubator = state.antibioticStage === 7 && stageQ >= .39 && stageQ < .84;
    payload.graph_axes = null;
    payload.results_columns = ['disc_code', 'treatment', 'zone_diameter_mm', 'control'];
    payload.results_view = 'sealed Petri-dish map and ranked inhibition-zone table';
    payload.antibiotic_disc_practical = {
      stage: state.antibioticStage,
      phase: phases[state.antibioticStage] || phases[0],
      stage_progress: +antibioticStageProgress().toFixed(3),
      organism: { name: 'Bacillus subtilis', role: 'approved non-pathogenic teaching strain', growth_medium: 'nutrient agar', lawn_inoculated: state.antibioticStage >= 4 },
      aseptic_technique: { disinfectant: { label: '70% IMS', expanded_name: '70% industrial methylated spirit', flammable: true }, bench_disinfected: state.antibioticStage >= 2, plate_lifted_for_underplate_wipe: (preparation.plate_lift_fraction || 0) > .8, wipe_under_plate: !!preparation.wipe_under_plate, used_wipe_disposed_after_cleaning: !!preparation.wipe_disposed, surface_air_dried_before_flame_relit: state.antibioticStage >= 2, four_marked_sectors: state.antibioticStage >= 2, marker_lines_drawn_on_outside_of_base: state.antibioticStage >= 2, marker_writing_on_exposed_underside: !!preparation.marker_active, plate_flip_fraction_before_marking: preparation.plate_flip_fraction || 0, plate_flipped_before_underside_marking: preparation.plate_flipped_before_marking !== false, sterile_swab: true, inoculating_swab_tip: swabTip, swab_tip_clear_of_table_and_agar: state.antibioticStage !== 3 || !!swabTip.above_table && !!swabTip.above_or_touching_agar, sterile_forceps: true, sterile_disc_card: true, minimal_lid_opening: true, lid_used_as_shield: true, used_swab_discarded_in_biohazard_bin: state.antibioticStage >= 4, post_incubation_plate_opened: false },
      flame: { burner_present_near_plate: true, mode: state.antibioticStage === 1 && stageQ < .57 ? 'off during flammable disinfectant use and air-drying' : 'yellow safety flame', disinfectant_kept_away_from_ignition_source: true },
      plate: { petri_dish_diameter_mm: 90, visual_scale_reduced_for_bench_clearance: true, discs_equally_spaced: state.antibioticStage >= 6, cross_taped_not_circumference_sealed: state.antibioticStage >= 7, inverted_for_incubation: state.antibioticStage >= 7, location: plateInIncubator ? 'inside incubator on shelf' : 'on bench', bacterial_lawn_growth_fraction: +growth.toFixed(3), lid_closed_during_measurement: true },
      incubation: { temperature_c: 25, duration_hours: state.antibioticStage < 7 ? 0 : +(48 * growth).toFixed(1), school_safe_temperature: true, large_incubator_against_tiled_wall: true, transparent_glass_front_door: true, door_open: incubatorDoorOpen, plate_accepted_through_open_door: state.antibioticStage > 7 || state.antibioticStage === 7 && stageQ >= .39 },
      discs: antibioticDiscs.map((disc, index) => ({ code: disc.code, treatment: disc.name, placed: state.antibioticStage > 5 || state.antibioticStage === 5 && antibioticStageProgress() * 4 > index, clear_zone_visible: growth > .12 && disc.diameterMm > 0, expected_zone_diameter_mm: disc.diameterMm, measured_zone_diameter_mm: index < measured || state.antibioticStage >= 10 ? disc.diameterMm : null, control: disc.id === 'control' })),
      measurement: { method: 'widest clear diameter edge-to-edge through the disc centre', unit: 'mm', ruler_outside_closed_lid: true, measured_count: measured, active_disc_index: state.antibioticMeasuredIndex },
      results: state.antibioticResults.map(result => ({ ...result })),
      conclusion: state.complete ? 'Tetracycline produced the largest inhibition zone under these controlled conditions; the sterile-water control produced no inhibition zone.' : null,
      interpretation_limit: 'Zone size is affected by diffusion, inoculum density and agar depth, so it is a comparative classroom result rather than a prescribing recommendation.',
      safety: { plate_never_reopened_after_incubation: true, incubated_at_25_c_not_body_temperature: true, disinfect_before_and_after: true, alcohol_disinfectant_used_only_with_flame_off: true, contaminated_swab_goes_directly_to_biohazard_waste: true, microbiological_waste_pressure_sterilised_or_disinfected: true }
    };
    payload.controls = [antibioticPrimaryLabel(), 'RESET PRACTICAL', 'RESULTS', 'METHOD', 'F fullscreen'];
  }
  return JSON.stringify(payload)
};
const methodStepAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(methodStepAwareRenderGameToText()), p = practicals[state.selected], activeIndex = p.steps.length ? liveMethodStepIndex(p) : null;
  const methodHitTargets = regions.filter(region => region.id === 'method-step').map(region => ({ index: region.data.index, source: region.data.source, x: +region.x.toFixed(1), y: +region.y.toFixed(1), width: +region.w.toFixed(1), height: +region.h.toFixed(1) }));
  payload.method_navigation = {
    interactive: p.steps.length > 0,
    input: 'pointer, touch or press on any visible method card',
    active_step_index: activeIndex,
    active_step_number: activeIndex == null ? null : activeIndex + 1,
    active_step_text: activeIndex == null ? null : p.steps[activeIndex],
    total_steps: p.steps.length,
    selected_by_user: state.methodStepSelection?.practicalId === p.id,
    available_in_sidebar_and_focus_dropdown: true,
    visible_hit_targets: methodHitTargets
  };
  return JSON.stringify(payload)
};
const assessmentAwareRenderGameToText = window.render_game_to_text;
window.render_game_to_text = () => {
  const payload = JSON.parse(assessmentAwareRenderGameToText());
  const session = state.assessmentSession;
  payload.assessment_mode = {
    active: !!state.assessmentMode,
    practical_id: session?.practicalId || practicals[state.selected]?.id,
    phase: session?.currentPhase || null,
    total_score: session?.totalScore || 0,
    max_score: session?.maxPossibleScore || 0,
    grade: session?.grade || null,
    apparatus_checked: !!session?.apparatusChecked,
    method_order_checked: !!session?.methodOrderChecked,
    method_questions_checked: !!session?.methodQuestionsChecked,
    limitations_checked: !!session?.limitationsChecked,
    lowest_accuracy_identified: !!session?.benchInspection?.lowestAccuracyIdentified,
    upgraded_apparatus: session?.benchInspection?.upgradedApparatus || null
  };
  return JSON.stringify(payload);
};
draw();

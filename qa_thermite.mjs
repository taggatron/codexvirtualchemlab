import {chromium} from 'playwright';
import fs from 'node:fs';

const out='/private/tmp/chem-thermite';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`page: ${error.message}`));
await page.goto(`http://localhost:4173/?thermite-qa=${Date.now()}`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
await page.waitForTimeout(450);
await page.evaluate(()=>{window.__manualSimulationTime=true});
const read=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
const capture=async name=>{await page.waitForTimeout(120);await page.screenshot({path:`${out}/${name}.png`,fullPage:true});return read()};

await page.mouse.click(135,800);
await page.waitForTimeout(350);
const ready=await capture('01-ready-shielded-rig');

await page.mouse.click(375,837);
const approach=await capture('02-torch-approach');

await page.evaluate(()=>window.advanceTime(1600));
const fuse=await capture('03-magnesium-fuse');

await page.evaluate(()=>window.advanceTime(650));
const nearConsumed=await capture('04-fuse-nearly-consumed-mgo-powder');

await page.evaluate(()=>window.advanceTime(500));
const ignition=await capture('05-ignition-flash');

await page.evaluate(()=>window.advanceTime(850));
const fountain=await capture('06-white-hot-spark-fountain');

await page.evaluate(()=>window.advanceTime(1800));
const molten=await capture('07-molten-iron-and-sparks');

await page.evaluate(()=>window.advanceTime(1400));
const decay=await capture('08-decay-and-smoke');

await page.evaluate(()=>window.advanceTime(1300));
const complete=await capture('09-contained-cooling-product');

await page.waitForTimeout(350);
await page.evaluate(()=>window.advanceTime(17));
const afterglow=await capture('10-amorphous-iron-afterglow');

await page.waitForTimeout(4700);
await page.evaluate(()=>window.advanceTime(17));
const cooled=await capture('11-amorphous-iron-cooled');

await page.mouse.click(682,837);
const graph=await capture('12-temperature-graph');

await page.mouse.click(375,837);
const reset=await capture('13-reset');

const result={ready:ready.thermite,approach:approach.thermite,fuse:fuse.thermite,nearConsumed:nearConsumed.thermite,ignition:ignition.thermite,fountain:fountain.thermite,molten:molten.thermite,decay:decay.thermite,complete:complete.thermite,afterglow:afterglow.thermite,cooled:cooled.thermite,graph:{tab:graph.tab,axes:graph.graph_axes,readings:graph.graph_readings},reset:reset.thermite,renderer:ready.renderer,errors};
fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));

if(ready.practical!=='Thermite demonstration'||ready.renderer?.enabled!==true)throw new Error('Thermite practical or WebGL renderer did not load');
if(!ready.thermite?.apparatus.includes('sand')||!ready.thermite?.protective_screen.includes('glass')||!ready.thermite?.simulation_only)throw new Error('Shielded sand containment is not exposed');
if(ready.thermite.phase!=='shielded setup ready'||ready.running||ready.temperature_c!==25)throw new Error('Initial thermite state is incorrect');
if(!approach.running||approach.thermite.phase!=='blow torch approaching'||!approach.thermite.blow_torch_visible)throw new Error('Blow torch approach did not begin');
if(!fuse.thermite.fuse_burning||!fuse.thermite.fuse_disintegrating||!fuse.thermite.magnesium_oxide_powder_visible||fuse.thermite.phase!=='magnesium fuse burning'||fuse.thermite.fuse_remaining_fraction<.55||fuse.thermite.fuse_remaining_fraction>.75||!fuse.thermite.fuse_reaction.includes('MgO'))throw new Error('Magnesium fuse disintegration state is incorrect');
if(!nearConsumed.thermite.magnesium_oxide_powder_visible||nearConsumed.thermite.magnesium_oxide_powder_fraction<.7||nearConsumed.thermite.fuse_remaining_fraction>.3)throw new Error('Nearly consumed fuse or white magnesium oxide powder state is incorrect');
if(!ignition.thermite.ignition_flash||ignition.thermite.phase!=='violent ignition flash'||ignition.thermite.simulated_core_temperature_c<500)throw new Error('Ignition flare is missing or too cool');
if(!fountain.thermite.spark_fountain||fountain.thermite.phase!=='white-hot spark fountain'||fountain.thermite.simulated_core_temperature_c<2000)throw new Error('White-hot spark fountain phase is incorrect');
if(!molten.thermite.molten_iron_visible||!molten.thermite.spark_fountain)throw new Error('Molten iron is not visible during the sustained reaction');
if(decay.thermite.phase!=='reaction decaying'||decay.thermite.spark_fountain)throw new Error('Decay phase did not begin cleanly');
if(!complete.complete||complete.running||complete.thermite.phase!=='cooling molten iron product'||!complete.thermite.molten_iron_visible||complete.thermite.iron_product_form!=='one smooth amorphous metallic blob'||!complete.thermite.iron_afterglow_visible||complete.thermite.iron_glow_fraction<.15||complete.temperature_c!==450)throw new Error('Contained amorphous iron afterglow state is incorrect');
if(!afterglow.thermite.iron_afterglow_visible||afterglow.thermite.iron_glow_fraction>=complete.thermite.iron_glow_fraction||afterglow.thermite.iron_glow_fraction<.02)throw new Error('Iron afterglow did not fade gradually');
if(cooled.thermite.iron_afterglow_visible||cooled.thermite.iron_glow_fraction>.02)throw new Error('Iron blob did not finish cooling after its short afterglow');
if(graph.tab!=='graph'||graph.graph_axes?.x!=='elapsed time / s'||graph.graph_readings<8)throw new Error('Thermite temperature graph is incomplete');
if(reset.complete||reset.running||reset.thermite.elapsed_s!==0||reset.thermite.phase!=='shielded setup ready')throw new Error('Thermite reset is incorrect');
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
console.log(JSON.stringify(result,null,2));

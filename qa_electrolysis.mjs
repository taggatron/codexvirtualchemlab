import {chromium} from 'playwright';
import fs from 'node:fs';

const out='/private/tmp/chem-electrolysis';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`page: ${error.message}`));
await page.goto(`http://localhost:4173/?electrolysis-weigh-qa=${Date.now()}`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
await page.waitForTimeout(400);
await page.evaluate(()=>{window.__manualSimulationTime=true});
const state=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));

await page.mouse.click(135,542);
await page.waitForTimeout(220);
await page.screenshot({path:`${out}/01-connected-apparatus-and-balance.png`,fullPage:true});
const initial=await state();

await page.mouse.click(356,837);
await page.evaluate(()=>window.advanceTime(5000));
await page.waitForTimeout(180);
await page.screenshot({path:`${out}/02-mid-copper-deposit.png`,fullPage:true});
const mid=await state();

await page.mouse.click(605,837);
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/03-live-mass-table.png`,fullPage:true});
const midTable=await state();

await page.mouse.click(1174,98);
await page.evaluate(()=>window.advanceTime(5200));
await page.waitForTimeout(180);
await page.screenshot({path:`${out}/04-complete-ready-to-weigh.png`,fullPage:true});
const complete=await state();

await page.mouse.click(486,837);
await page.evaluate(()=>window.advanceTime(420));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/05-cathode-lifting.png`,fullPage:true});
const lifting=await state();

await page.evaluate(()=>window.advanceTime(1000));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/06-cathode-moving-to-balance.png`,fullPage:true});
const moving=await state();

await page.evaluate(()=>window.advanceTime(1500));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/07-cathode-lowering.png`,fullPage:true});
const lowering=await state();

await page.evaluate(()=>window.advanceTime(1000));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/08-balance-settling.png`,fullPage:true});
const settling=await state();

await page.evaluate(()=>window.advanceTime(1000));
await page.waitForTimeout(160);
await page.screenshot({path:`${out}/09-final-mass-table.png`,fullPage:true});
const recorded=await state();

await page.mouse.click(356,837);
await page.waitForTimeout(140);
await page.screenshot({path:`${out}/10-reset-after-weighing.png`,fullPage:true});
const reset=await state();

const result={
  initial:initial.electrolysis,
  mid:mid.electrolysis,
  mid_table:{tab:midTable.tab,graph_axes:midTable.graph_axes,results_columns:midTable.results_columns},
  complete:complete.electrolysis,
  weighing:{lifting:lifting.electrolysis?.cathode_weighing,moving:moving.electrolysis?.cathode_weighing,lowering:lowering.electrolysis?.cathode_weighing,settling:settling.electrolysis?.cathode_weighing},
  recorded:{tab:recorded.tab,masses_recorded:recorded.electrolysis?.masses_recorded,weighing:recorded.electrolysis?.cathode_weighing},
  reset:{tab:reset.tab,complete:reset.complete,cathode:reset.electrolysis?.cathode,weighing:reset.electrolysis?.cathode_weighing},
  renderer:complete.renderer,
  errors
};
fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));

if(initial.practical!=='Electrolysis'||initial.renderer?.enabled!==true)throw new Error('Electrolysis practical or WebGL renderer did not load');
if(!initial.electrolysis?.apparatus.includes('crocodile clips')||!initial.electrolysis?.apparatus.includes('power pack')||!initial.electrolysis?.apparatus.includes('electronic balance')||!initial.electrolysis?.circuit_path.includes('insulated leads'))throw new Error('Connected circuit or electronic balance is not exposed');
if(!initial.electrolysis.electronic_balance_visible||initial.electrolysis.cathode_weighing.phase!=='immersed in solution'||initial.electrolysis.cathode_weighing.balance_reading_g!==0)throw new Error('Initial cathode or balance state is incorrect');
if(initial.electrolysis.power_pack_on||initial.electrolysis.cathode.before_g!==12.4||initial.electrolysis.cathode.after_g!==12.4||initial.electrolysis.anode.before_g!==12.35)throw new Error('Initial electrode masses or supply state are incorrect');
if(!mid.running||Math.abs(mid.electrolysis.cathode.copper_deposit_fraction-.5)>.02||Math.abs(mid.electrolysis.cathode.after_g-12.82)>.01||mid.electrolysis.anode.after_g!==12.35||!mid.electrolysis.anode.bubbles_visible)throw new Error('Mid-run copper plating or anode state is incorrect');
if(midTable.tab!=='graph'||midTable.graph_axes!==null||midTable.results_columns?.join(',')!=='electrode,polarity,before_g,after_g,change_g')throw new Error('Electrolysis did not replace the graph with the live mass table');
if(!complete.complete||complete.electrolysis.cathode.copper_deposit_fraction!==1||complete.electrolysis.cathode.after_g!==13.24||complete.electrolysis.cathode.change_g!==.84||complete.electrolysis.anode.change_g!==0||complete.electrolysis.cathode_weighing.phase!=='ready to remove and weigh')throw new Error('Final copper deposit or pre-weigh state is incorrect');
if(!lifting.electrolysis.cathode_weighing.active||lifting.electrolysis.cathode_weighing.phase!=='lifting from solution'||lifting.electrolysis.cathode_weighing.balance_reading_g!==0)throw new Error('Cathode lift stage is incorrect');
if(moving.electrolysis.cathode_weighing.phase!=='moving to balance'||moving.electrolysis.cathode_weighing.balance_reading_g!==0)throw new Error('Cathode transfer stage is incorrect');
if(lowering.electrolysis.cathode_weighing.phase!=='lowering onto balance'||lowering.electrolysis.cathode_weighing.balance_reading_g!==0)throw new Error('Cathode lowering stage is incorrect');
if(settling.electrolysis.cathode_weighing.phase!=='balance settling'||settling.electrolysis.cathode_weighing.balance_reading_g<12.9||settling.electrolysis.cathode_weighing.balance_reading_g>13.6)throw new Error('Balance settling stage or reading is incorrect');
if(!recorded.electrolysis.masses_recorded||recorded.tab!=='graph'||recorded.electrolysis.cathode_weighing.active||!recorded.electrolysis.cathode_weighing.electrode_on_balance||recorded.electrolysis.cathode_weighing.phase!=='weighed on balance'||recorded.electrolysis.cathode_weighing.balance_reading_g!==13.24)throw new Error('Final cathode mass was not settled and recorded');
if(reset.complete||reset.running||reset.tab!=='bench'||reset.electrolysis.masses_recorded||reset.electrolysis.cathode.copper_deposit_fraction!==0||reset.electrolysis.cathode_weighing.phase!=='immersed in solution'||reset.electrolysis.cathode_weighing.balance_reading_g!==0)throw new Error('Reset did not restore the immersed cathode and zeroed balance');
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
console.log(JSON.stringify(result,null,2));

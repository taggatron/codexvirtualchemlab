import {chromium} from 'playwright';
import fs from 'node:fs';

const out='/private/tmp/chem-water-distillation';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`page: ${error.message}`));
await page.goto(`http://localhost:4173/?water-distillation-qa=${Date.now()}`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
await page.waitForTimeout(350);
await page.evaluate(()=>{window.__manualSimulationTime=true});
const state=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));

await page.mouse.click(135,594);
await page.waitForTimeout(180);
await page.screenshot({path:`${out}/01-assembled.png`,fullPage:true});
const assembled=await state();

await page.mouse.click(478,837);
const safety=await state();

await page.mouse.click(356,837);
await page.waitForTimeout(180);
await page.screenshot({path:`${out}/02-cooling-water.png`,fullPage:true});
const cooling=await state();
await page.waitForTimeout(850);
await page.evaluate(()=>window.advanceTime(16));
await page.screenshot({path:`${out}/02b-cooling-water-opacity-phase.png`,fullPage:true});

await page.mouse.click(478,837);
await page.evaluate(()=>window.advanceTime(4200));
await page.waitForTimeout(180);
await page.screenshot({path:`${out}/03-distilling.png`,fullPage:true});
const distilling=await state();
await page.evaluate(()=>window.advanceTime(550));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/03b-falling-condensate.png`,fullPage:true});

await page.evaluate(()=>window.advanceTime(6200));
await page.waitForTimeout(180);
await page.screenshot({path:`${out}/04-complete.png`,fullPage:true});
const complete=await state();

await page.mouse.click(478,837);
await page.mouse.click(356,837);
const shutDown=await state();
const result={assembled:assembled.water_purification,safety:{heater_on:safety.electric_heater_on,guidance:safety.guidance},cooling:cooling.water_purification,distilling:distilling.water_purification,complete:complete.water_purification,shut_down:shutDown.water_purification,renderer:complete.renderer,errors};
fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));

if(assembled.bunsen_lit!==false||assembled.water_purification?.apparatus?.includes('electric heating mantle')!==true||assembled.water_purification?.cooling_inlet_clear_of_receiver!==true||assembled.water_purification?.distillation_thermometer_marks!==9||assembled.water_purification?.distillation_thermometer_mark_shape!=='partial curved bands around the glass tube'||assembled.water_purification?.flow_particle_markers!==false||assembled.water_purification?.receiver_fill_continuous!==true||assembled.water_purification?.coolant_transition_smooth!==true||assembled.water_purification?.water_sample_label_offset_px!==28||assembled.water_purification?.cooling_flow_visual!=='smooth travelling translucency changes')throw new Error('Initial water apparatus geometry state is incorrect');
if(safety.electric_heater_on!==false||!safety.guidance.includes('cooling water'))throw new Error('Heater safety interlock did not hold');
if(!cooling.cooling_water_on||cooling.electric_heater_on)throw new Error('Cooling-water-only state is incorrect');
if(!distilling.running||!distilling.water_purification?.boiling||!distilling.water_purification?.vapour_visible||!distilling.water_purification?.condensate_drop_visible||!distilling.water_purification?.splash_visible||distilling.water_purification?.splash_droplets!==6||distilling.volume_ml<=0)throw new Error('Distillation did not animate drops, splashes and collected liquid');
if(!(assembled.water_purification?.distillation_thermometer_alcohol_fraction<distilling.water_purification?.distillation_thermometer_alcohol_fraction&&distilling.water_purification?.distillation_thermometer_alcohol_fraction<complete.water_purification?.distillation_thermometer_alcohol_fraction))throw new Error('Distillation thermometer alcohol did not rise with heating time');
if(!complete.complete||complete.volume_ml<49.9||!complete.water_purification?.condensate_visible)throw new Error('Distillation did not complete with collected distillate');
if(shutDown.electric_heater_on||shutDown.cooling_water_on)throw new Error('Shutdown controls did not switch off both systems');
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
console.log(JSON.stringify(result,null,2));

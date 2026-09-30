const fs=require('node:fs');
const path=require('node:path');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/trontstack/tront/og-templates/node_modules/playwright'));}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.goto('file:///'+path.resolve(__dirname,'../index.html').replaceAll('\\','/'));
  await page.waitForFunction(()=>window.__LTC?.ready&&__LTC.frameCount>3,{},{timeout:60000});
  await page.evaluate(()=>{__LTC.toggleFreeze();__LTC.setParam('quality',1.25);__LTC.togglePhoto();});
  const n=await page.evaluate(()=>__LTC.frameCount);
  await page.waitForFunction(n=>__LTC.frameCount>n+2,n);
  await page.addStyleTag({content:'#exitPhoto{display:none!important}'});
  const source=await page.locator('#viewport>canvas').screenshot({path:path.join(__dirname,'og-source.png')});
  const design=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await design.setContent(`<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#080f15;color:#edf5f7;font-family:'Segoe UI',sans-serif}
  .scene{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,12,18,.86),transparent 38%,transparent 72%,rgba(5,12,18,.93))}
  header{position:absolute;left:44px;top:30px}.eyebrow{color:#9bd5d5;font-size:13px;letter-spacing:3px;font-weight:600}h1{font-size:46px;line-height:1.12;font-weight:600;letter-spacing:-1.5px;margin:8px 0 10px}
  .caption{font-size:17px;color:#b8ccd6}.bottom{position:absolute;bottom:26px;left:44px;right:44px;display:flex;justify-content:space-between;align-items:end;font-size:15px;color:#d5e3e9}.url{font-family:Consolas,monospace;color:#a9dfe1}.credit{font-size:11px;color:#9eafb9;margin-top:5px}
  </style><img class="scene" src="data:image/png;base64,${source.toString('base64')}"><div class="shade"></div><header><div class="eyebrow">ARC / INTERACTIVE LIGHTING LAB</div><h1>Light studies</h1><div class="caption">Real-time polygonal area lights</div></header><div class="bottom"><div>Paint surfaces. Shape light. Inspect the math.<div class="credit">Based on Linearly Transformed Cosines · Heitz et al., 2016</div></div><div class="url">tront.xyz/ltc</div></div>`);
  await design.screenshot({path:path.resolve(__dirname,'../og-image.png')});
  console.log('Captured 1200 x 630 og-image.png from the live Nocturne renderer');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

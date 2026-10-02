const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(require('fs').readFileSync('mock.js','utf8'));
await p.goto('file://'+process.cwd()+'/grooveville.html#team-site');await p.waitForTimeout(300);
await p.click('[data-act="edit-brand"][data-id="vybr8"]');await p.setInputFiles('#b-logo','logo_preview.png');await p.click('#mf button[type=submit]');await p.waitForTimeout(400);
await p.screenshot({path:'s_site.png'});
await p.evaluate(()=>location.hash='b-vybr8');await p.waitForTimeout(200);await p.screenshot({path:'s_vy.png'});
console.log(errs);await b.close()})();

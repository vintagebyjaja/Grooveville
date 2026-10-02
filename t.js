const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.addInitScript(require('fs').readFileSync('mock.js','utf8'));
await p.goto('file://'+process.cwd()+'/grooveville.html');
await p.waitForTimeout(300);
await p.screenshot({path:'s_home.png',fullPage:false});
for(const r of ['b-ent','calendar','collab','signin','team','team-time','team-cal','team-rem','team-out','team-people','team-vault','team-site']){await p.evaluate(r=>location.hash=r,r);await p.waitForTimeout(150)}
await p.evaluate(()=>location.hash='team');await p.waitForTimeout(150);
await p.click('[data-act="new-entry"]');await p.fill('#e-title','Venue walkthrough');await p.fill('#e-start','10:00');await p.fill('#e-end','11:30');await p.click('#mf button[type=submit]');await p.waitForTimeout(150);
await p.click('[data-act="new-event"]');await p.fill('#ev-title','Fall Launch Party');await p.fill('#ev-date','2026-10-17');await p.click('.seg button[data-v=public]');await p.click('#mf button[type=submit]');await p.waitForTimeout(150);
await p.click('[data-act="new-entry"]');await p.selectOption('#e-type','expense');await p.fill('#e-title','Speakers');await p.fill('#e-amt','250');await p.click('#mf button[type=submit]');await p.waitForTimeout(150);
await p.click('[data-act="new-income"][data-brand="ent"]');await p.selectOption('#e-src','Donation');await p.fill('#e-title','Fan donation');await p.fill('#e-amt','75');await p.click('#mf button[type=submit]');await p.waitForTimeout(150);
await p.screenshot({path:'s_dash.png',fullPage:true});
await p.evaluate(()=>location.hash='team-vault');await p.waitForTimeout(150);await p.click('[data-act="vault-setup"]');await p.fill('#v-pass','correct horse battery');await p.fill('#v-pass2','correct horse battery');await p.click('#mf button[type=submit]');await p.waitForTimeout(1500);
await p.click('[data-act="vault-new"]');await p.fill('#v-title','Bank');await p.fill('#v-user','jaja@x.com');await p.fill('#v-pw','s3cret');await p.click('#mf button[type=submit]');await p.waitForTimeout(500);
await p.click('[data-act="vault-lock"]');await p.click('[data-act="vault-unlock"]');await p.fill('#v-pass','correct horse battery');await p.click('#mf button[type=submit]');await p.waitForTimeout(1500);
await p.screenshot({path:'s_vault.png'});
console.log('vault rows', await p.evaluate(()=>document.querySelectorAll('.vpass').length));
await p.evaluate(()=>location.hash='team-time');await p.waitForTimeout(150);await p.screenshot({path:'s_time.png'});
await p.evaluate(()=>location.hash='team-cal');await p.waitForTimeout(150);await p.screenshot({path:'s_cal.png'});
await p.setViewportSize({width:400,height:850});await p.evaluate(()=>location.hash='home');await p.waitForTimeout(150);await p.screenshot({path:'s_mobile.png'});
const sw=await p.evaluate(()=>document.documentElement.scrollWidth);console.log('scrollWidth',sw);
console.log(errs);await b.close()})();

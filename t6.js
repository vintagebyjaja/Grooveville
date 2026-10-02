const {chromium}=require('playwright');
const fs=require('fs');
async function run(owner,uid,store,steps){
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  let m=fs.readFileSync('mock.js','utf8').replace("isOwner:async()=>true","isOwner:async()=>"+owner).replace("id:async()=>'u1'","id:async()=>'"+uid+"'").replace("const store={};","const store="+JSON.stringify(store)+";window.__store=store;");
  await p.addInitScript(m);await steps(p);console.log('errors',errs);await b.close();
}
(async()=>{
 const base={'requests/u2':{brands:['ent'],joinedAt:'2026-10-01'},'memberlog/u2':{joinedAt:'2026-10-01'},'requests/u3':{brands:['ent','music'],joinedAt:'2026-10-02'},'memberlog/u3':{joinedAt:'2026-10-02'}};
 let after;
 await run(true,'u1',base,async p=>{
   await p.goto('file://'+process.cwd()+'/grooveville.html#team-people');await p.waitForTimeout(400);
   await p.click('[data-act="approve"][data-u="u2"][data-b="ent"]');await p.waitForTimeout(200);
   await p.selectOption('#head-ent','u2');await p.click('[data-act="head-add"][data-b="ent"]');await p.waitForTimeout(300);
   await p.screenshot({path:'s_teams.png',fullPage:true});
   after=await p.evaluate(()=>JSON.parse(JSON.stringify(window.__store)));
   console.log(Object.keys(after));
 });
 // head u2
 await run(false,'u2',after,async p=>{
   await p.goto('file://'+process.cwd()+'/grooveville.html#portal-team');await p.waitForTimeout(500);
   console.log('nav',await p.evaluate(()=>document.querySelector('#links').textContent));
   console.log('pending',await p.evaluate(()=>document.querySelectorAll('[data-act="approve"]').length));
   await p.click('[data-act="approve"][data-u="u3"][data-b="ent"]');await p.waitForTimeout(300);
   await p.screenshot({path:'s_head.png',fullPage:true});
   after=await p.evaluate(()=>JSON.parse(JSON.stringify(window.__store)));
 });
 await run(false,'u3',after,async p=>{
   await p.goto('file://'+process.cwd()+'/grooveville.html#signin');await p.waitForTimeout(500);
   console.log('u3',await p.evaluate(()=>document.querySelector('#app h1').textContent),await p.evaluate(()=>document.querySelector('#app p').textContent));
   await p.screenshot({path:'s_u3.png',fullPage:true});
 });
})();

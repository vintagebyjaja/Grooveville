const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>errs.push(m.text()));
let m=fs.readFileSync('mock.js','utf8').replace("const store={};","const store={'requests/u2':{brands:['ent']}};window.__store=store;");
await p.addInitScript(m);await p.goto('file://'+process.cwd()+'/grooveville.html#team-people');await p.waitForTimeout(600);
console.log(await p.evaluate(()=>document.querySelector('#app').innerText.slice(0,600)));console.log(errs);await b.close()})();

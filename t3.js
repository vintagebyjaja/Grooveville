const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/grooveville.html#b-scu');await p.waitForTimeout(300);await p.screenshot({path:'s_scu.png'});console.log(errs);await b.close()})();

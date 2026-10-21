const characters=[["Zeke Upendo",10,"The Prophet","Future sight through dreams. Thoughtful, observant and private. Prince is always close."],["Zora Upendo",8,"Water","Zeke's younger sister; her ability connects to water."],["Kingston Upendo",16,"Sound Engineer","Older brother. No powers; grounded in music and sound."],["Krystal Upendo",38,"Florist · Earth","Their mother, a florist who can hear the earth."],["Zavian Upendo",42,"Electrical Engineer · Light","Their father; an electrical engineer whose ability begins with light."],["Prince",null,"Protector & Best Friend","Zeke's dog and constant companion."]];document.querySelector("#characterGrid").innerHTML=characters.map(c=>`<article class="character"><span class="role">${c[2]}</span><h3>${c[0]}</h3>${c[1]?`<small>AGE ${c[1]}</small>`:""}<p>${c[3]}</p></article>`).join("");document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tabs button,.panel").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelector("#"+b.dataset.panel).classList.add("active")});document.querySelectorAll(".pin").forEach(p=>p.onclick=()=>document.querySelector("#placeCard").innerHTML=`<b>${p.dataset.place.toUpperCase()}</b><small>SHADOW CROWN LOCATION</small><p>Story missions, exploration, collectibles and optional social activity can connect here.</p>`);
/* ---- Grooveville bridge: back buttons, home logo and the portal ---- */
(function(){
  let depth=0;
  window.addEventListener("hashchange",()=>{depth++});
  const back=document.getElementById("backBtn");
  back.addEventListener("click",()=>{if(depth>0){depth-=2;history.back()}else leave("/#b-scu")});
  document.getElementById("topBtn").addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
  const reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  function canvasOv(cls){const ov=document.createElement("div");ov.className="portal-ov "+(cls||"");ov.innerHTML='<canvas aria-hidden="true"></canvas>';document.body.appendChild(ov);
    const cv=ov.querySelector("canvas"),dpr=Math.min(2,window.devicePixelRatio||1);cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;
    return {ov,ctx:cv.getContext("2d"),W:cv.width,H:cv.height,cx:cv.width/2,cy:cv.height/2,R:Math.hypot(cv.width,cv.height)/2,dpr}}
  /* arriving: the portal opens outward and reveals the site */
  function arrive(){
    if(reduce){const ov=document.createElement("div");ov.className="portal-ov calm";document.body.appendChild(ov);setTimeout(()=>ov.remove(),700);return}
    const P=canvasOv();P.ov.insertAdjacentHTML("beforeend",'<div class="portal-label">♛ WELCOME TO SHADOW CROWN</div>');
    const D=1300,t0=performance.now(),{ctx,W,H,cx,cy,R,dpr}=P;
    (function f(now){const p=Math.min(1,(now-t0)/D),e=1-Math.pow(1-p,3),r=R*1.15*e;
      ctx.globalCompositeOperation="source-over";ctx.clearRect(0,0,W,H);
      ctx.fillStyle="#120420";ctx.fillRect(0,0,W,H);
      const g=ctx.createRadialGradient(cx,cy,Math.max(0,r*0.2),cx,cy,r+90*dpr);g.addColorStop(0,"rgba(255,240,255,"+(0.9*(1-p))+")");g.addColorStop(0.7,"rgba(170,70,255,"+(0.8*(1-p))+")");g.addColorStop(1,"rgba(120,20,220,0)");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r+90*dpr,0,Math.PI*2);ctx.fill();
      ctx.globalCompositeOperation="destination-out";ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
      ctx.globalCompositeOperation="source-over";ctx.lineWidth=10*dpr;ctx.strokeStyle="rgba(196,120,255,"+(1-p)+")";ctx.shadowColor="#b44dff";ctx.shadowBlur=40*dpr;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
      for(let k=0;k<3;k++){const rot=now/(260+k*70)*(k%2?-1:1);ctx.strokeStyle="hsla("+(275+k*14)+",95%,68%,"+(0.7*(1-p))+")";ctx.lineWidth=(5-k)*dpr;ctx.beginPath();ctx.arc(cx,cy,r*(0.92-k*0.06),rot,rot+Math.PI*1.2);ctx.stroke()}
      if(p<1)requestAnimationFrame(f);else P.ov.remove()})(t0);
  }
  /* leaving: collapse back through the portal, then go */
  function leave(url){
    if(reduce){const ov=document.createElement("div");ov.className="portal-ov calm leaving";document.body.appendChild(ov);setTimeout(()=>location.href=url,350);return}
    const P=canvasOv(),D=700,t0=performance.now(),{ctx,W,H,cx,cy,R,dpr}=P;
    (function f(now){const p=Math.min(1,(now-t0)/D),r=R*1.15*(1-p*p);
      ctx.clearRect(0,0,W,H);ctx.fillStyle="#120420";ctx.fillRect(0,0,W,H);
      ctx.globalCompositeOperation="destination-out";ctx.beginPath();ctx.arc(cx,cy,Math.max(0,r),0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation="source-over";
      ctx.lineWidth=8*dpr;ctx.strokeStyle="rgba(196,120,255,.9)";ctx.shadowColor="#b44dff";ctx.shadowBlur=36*dpr;ctx.beginPath();ctx.arc(cx,cy,Math.max(1,r),0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
      if(p<1)requestAnimationFrame(f);else location.href=url})(t0);
  }
  document.querySelectorAll("[data-leave]").forEach(a=>a.addEventListener("click",e=>{if(e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();leave(a.dataset.leave)}));
  let came=false;try{came=sessionStorage.getItem("scPortal")==="1";sessionStorage.removeItem("scPortal")}catch(e){}
  if(came)arrive();
})();

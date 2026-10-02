<script>
(function(){
"use strict";
const SELF_B64 = "__SELF__";
const RESET = "__RESET__";
const LOGO = "__LOGO__";
const BACKEND = "__BACKEND__";
const cu = n=>(window.claude&&window.claude.use)?window.claude.use(n):Promise.resolve(null);

/* ---------- brands (every slot) ---------- */
const BRANDS = [
  {id:"hq", name:"Grooveville LLC", short:"HQ", role:"DrawUp Headquarters",
   tagline:"The central business behind every branch of the Groove Vine.",
   about:"Grooveville LLC is the DrawUp Headquarters. It is the home office that plans, funds and connects each Grooveville company, from live entertainment and music to rentals and new ventures."},
  {id:"ent", name:"Grooveville Entertainment", short:"ENT", role:"Entertainment", social:"https://www.instagram.com/grooveville.ent/",
   tagline:"Shows, parties and live experiences.",
   about:"Grooveville Entertainment produces and hosts events across the Grooveville family. Watch the calendar for what is coming next."},
  {id:"music", name:"Grooveville Music", short:"MUSIC", role:"Music", social:"https://www.instagram.com/grooveville.music/",
   tagline:"Artists, releases and the Grooveville sound.",
   about:"Grooveville Music is home to the artists, recordings and music projects of Grooveville."},
  {id:"vybr8", name:"Vybr8", short:"VYBR8", role:"Social dining & nightlife", website:"https://vybr8.live",
   tagline:"Eat • Drink • Live • Connect",
   about:"Vybr8 is a social dining and nightlife platform. Discover highly rated restaurants and bars near you based on real people's reviews, and plan outings with friends at spots where everyone can order. Now in eight cities, including Charlotte, Atlanta and Miami."},
  {id:"pathd", name:"Pathd", short:"PATHD", role:"Careers & jobs", website:"https://mypathd.com",
   tagline:"Find your path.",
   about:"Pathd is a career platform for finding jobs in fields like nursing, tech, finance and design. Know what a job pays, see how far it is from home, and find your people along the way. Job search and core features are free."},
  {id:"rentals", name:"Grooveville Rentals", short:"RENTALS", role:"Rentals", developing:true,
   tagline:"Coming soon.",
   about:"Grooveville Rentals is coming soon. Send a collaboration request if you want to be first in line."},
  {id:"w4w", name:"W4W", short:"W4W", role:"Grooveville company", developing:true, website:"https://w4w.store", social:"https://www.instagram.com/w4w.store/",
   tagline:"A Grooveville company. Shop at w4w.store.",
   about:"W4W is part of the Grooveville family. Visit w4w.store to shop."},
  {id:"aec", name:"DrawUp AEC", short:"AEC", role:"Architecture · Engineering · Construction", website:"https://drawup.studio",
   tagline:"Plans, checkups and firm projects.",
   about:"DrawUp AEC builds DrawUp, a working product app for architecture, engineering and construction. It brings plans, checkups and firm projects together, with tools like Arch Coach, Check, Resources and Firm Profiles."},
  {id:"scu", name:"Shadow Crown Universe", short:"SCU", role:"Books & stories",
   social:"https://www.instagram.com/shadowcrown.ent/", cta:{label:"Buy Book 1 on Amazon", url:"https://www.amazon.com/dp/B0HJZFTWF4"},
   feature:{eyebrow:"Book 1 · Out now", title:"Shadow Crown: Zeke's Daydream", by:"Jabari J. Bailey", meta:"ISBN 9798171324193", url:"https://www.amazon.com/dp/B0HJZFTWF4", label:"Buy on Amazon"},
   tagline:"The story world of Shadow Crown. Book 1, Zeke's Daydream, is out now.",
   about:"Shadow Crown Universe is the home of the Shadow Crown books from the Grooveville family. Book 1, Shadow Crown: Zeke's Daydream by Jabari J. Bailey, is available now on Amazon. Follow @shadowcrown.ent on Instagram for what comes next."},
  {id:"wit", name:"What If Tomorrow", short:"WHAT IF", role:"Faceless reels", social:"https://www.instagram.com/whatiftmw/", tiktok:"https://www.tiktok.com/@whatiftmw",
   tagline:"A faceless reels venture. Watch on Instagram and TikTok.",
   about:"What If Tomorrow is a faceless reels venture from the Grooveville family, posting short-form videos on Instagram and TikTok."}
];
const BR = Object.fromEntries(BRANDS.map(b=>[b.id,b]));
const TYPES = [
  {id:"meeting", label:"Meeting"}, {id:"hours", label:"Work hours"}, {id:"expense", label:"Money spent"},
  {id:"receipt", label:"Receipt"}, {id:"income", label:"Money in"}, {id:"note", label:"Note"}
];
const TL = Object.fromEntries(TYPES.map(t=>[t.id,t.label]));
const SOURCES = ["Payment","Donation","Sponsorship","Sales","Booking","Other"];
const CATS = ["Equipment","Venue","Travel","Marketing","Talent & artists","Supplies","Food & drink","Software","Payroll","Fees","Other"];
const COLLAB_TYPES = ["Event or show","Sponsorship","Music feature","Brand partnership","Rental partnership","Community project","Other"];
const STATUSES = [["draft","Draft"],["sent","Sent"],["talking","In talks"],["confirmed","Confirmed"],["declined","Declined"]];
const REMIND = [["","No reminder"],["0","Same day"],["1","1 day before"],["3","3 days before"],["7","1 week before"],["14","2 weeks before"]];

/* ---------- helpers ---------- */
const $ = s=>document.querySelector(s);
const esc = s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n=>String(n).padStart(2,"0");
const iso = d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today = ()=>iso(new Date());
const parse = s=>{const [y,m,d]=String(s).split("-").map(Number);return new Date(y,(m||1)-1,d||1)};
const addDays = (s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const fmtDate = s=>{if(!s)return"";const d=parse(s);return DOW[d.getDay()]+", "+MON[d.getMonth()]+" "+d.getDate()+(d.getFullYear()!==new Date().getFullYear()?", "+d.getFullYear():"")};
const longDate = s=>{const d=parse(s);return MONTHS[d.getMonth()]+" "+d.getDate()+", "+d.getFullYear()};
const fmtTime = t=>{if(!t)return"";let [h,m]=t.split(":").map(Number);const ap=h>=12?"PM":"AM";h=h%12||12;return h+":"+pad(m)+" "+ap};
const money = n=>{n=Number(n)||0;return (n<0?"-":"")+"$"+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})};
const hrs = n=>(Math.round((Number(n)||0)*100)/100).toFixed(2);
const span = (a,b)=>{if(!a||!b)return 0;const [h1,m1]=a.split(":").map(Number),[h2,m2]=b.split(":").map(Number);let d=(h2*60+m2)-(h1*60+m1);if(d<0)d+=1440;return d/60};
const uid = ()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const brandName = id=>(BR[id]||BR.hq).name;
const cvar = id=>"--c:var(--c-"+(BR[id]?id:"hq")+")";
const chip = id=>'<span class="chip" style="'+cvar(id)+'">'+esc(brandInfo(id).name)+'</span>';
const sortBy = (arr,f)=>arr.slice().sort((a,b)=>{const x=f(a),y=f(b);return x<y?-1:x>y?1:0});
const stable = v=>Array.isArray(v)?"["+v.map(stable).join(",")+"]":(v&&typeof v==="object")?"{"+Object.keys(v).sort().filter(k=>v[k]!==undefined&&v[k]!=="").map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}":JSON.stringify(v);

let SNAP={};
try{SNAP=JSON.parse(document.getElementById("snap").textContent)||{}}catch(e){SNAP={}}
SNAP.events=SNAP.events||[]; SNAP.brands=SNAP.brands||{};

const S = {
  route:"home", authChecked:false, isAdmin:false, uid:null, db:null, userCap:null, signedIn:false, email:"",
  myBrands:[], myEntries:[], vault:[], vaultMeta:null, vkey:null, vraw:null, vplain:{}, docs:[], docf:{brand:"all",cat:"all",year:"all",q:""}, rep:{year:new Date().getFullYear()}, requested:false, members:{}, access:{}, org:{founder:"",heads:{}}, requests:{}, grants:{}, myReq:null, memberLogs:{}, names:{}, fbReady:false,
  ledger:[], events:[], reminders:[], outreach:[], site:{brands:{}}, loaded:{},
  ts:{brand:"all", month:today().slice(0,7), type:"all"},
  cal:{month:today().slice(0,7), brand:"all"}
};

/* public content: admins preview live data, everyone else sees the published snapshot */
function livePublic(){
  const site=S.site||{};
  return {
    contactEmail:site.contactEmail||"", signer:site.signer||"", phone:site.phone||"",
    brands:site.brands||{},
    events:sortBy(S.events.filter(e=>e.visibility==="public"),e=>e.date+(e.start||"")).map(e=>({
      id:e.id,brand:e.brand,title:e.title,date:e.date,start:e.start||"",end:e.end||"",location:e.location||"",description:e.description||"",link:e.link||""}))
  };
}
const pub = ()=>BACKEND==="firebase"?((S.loaded.site&&S.loaded.events)?livePublic():SNAP):((S.isAdmin&&S.loaded.site&&S.loaded.events)?livePublic():SNAP);
function brandInfo(id){const b=BR[id]||BR.hq;const o=(pub().brands||{})[b.id]||{};return Object.assign({},b,Object.fromEntries(Object.entries(o).filter(([k,v])=>v)))}
function isDirty(){
  if(BACKEND==="firebase")return false;
  if(!(S.isAdmin&&S.loaded.site&&S.loaded.events))return false;
  const a=Object.assign({},SNAP);delete a.publishedAt;
  return stable(livePublic())!==stable(a);
}

/* ---------- toast & modal ---------- */
let toastT;
function toast(msg){let t=$(".toast");if(!t){t=document.createElement("div");t.className="toast";t.setAttribute("role","status");document.body.appendChild(t)}t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},2600)}
function openModal(html,mount){
  const m=$("#modal");
  m.innerHTML='<div class="scrim" data-act="scrim"><div class="modal" role="dialog" aria-modal="true">'+html+'</div></div>';
  if(mount)mount(m.querySelector(".modal"));
  const f=m.querySelector("input:not([type=hidden]),select,textarea");if(f)setTimeout(()=>f.focus(),30);
}
function closeModal(){$("#modal").innerHTML=""}
function formObj(form){const o={};new FormData(form).forEach((v,k)=>{if(!(v instanceof File))o[k]=typeof v==="string"?v.trim():v});return o}
async function copyText(text,btn){
  try{await navigator.clipboard.writeText(text);toast("Copied")}
  catch(e){const ta=document.createElement("textarea");ta.value=text;ta.className="i";ta.style.minHeight="160px";btn.insertAdjacentElement("afterend",ta);ta.focus();ta.select();toast("Press Ctrl+C / Cmd+C to copy")}
}
function gcal(o){
  const d=(o.date||today()).replace(/-/g,"");let dates;
  if(o.start){const e=o.end||(()=>{let [h,m]=o.start.split(":").map(Number);h=(h+1)%24;return pad(h)+":"+pad(m)})();
    let ed=d;if(e<=o.start)ed=addDays(o.date,1).replace(/-/g,"");
    dates=d+"T"+o.start.replace(":","")+"00/"+ed+"T"+e.replace(":","")+"00";}
  else dates=d+"/"+addDays(o.date,1).replace(/-/g,"");
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(o.title||"")+"&dates="+dates+"&details="+encodeURIComponent(o.details||"")+"&location="+encodeURIComponent(o.location||"")+"&ctz=America/New_York";
}

/* ---------- db ---------- */
async function save(col,id,data){
  if(!S.db){toast("Saving isn't available in this view");return false}
  try{await S.db.collection(col).doc(id).set(data);return true}
  catch(e){toast(e&&e.code==="quota_exceeded"?"Storage is full. Delete old entries or receipt photos.":"Couldn't save. Check your connection and try again.");return false}
}
async function remove(col,id){
  if(!S.db)return false;
  try{await S.db.collection(col).doc(id).delete();return true}catch(e){toast("Couldn't delete. Try again.");return false}
}
const isMember=()=>!S.isAdmin&&S.myBrands.length>0;
const memberCol=u=>"memberlog/"+u+"/entries";
const imgCol=col=>col==="ledger"?"receiptImg":col.replace(/\/entries$/,"/receipts");
function ledgerAll(){
  if(!S.isAdmin)return S.myEntries;
  let a=S.ledger.slice();Object.values(S.memberLogs).forEach(l=>{a=a.concat(l)});return a;
}
const rows=(snap,col)=>snap.docs.map(d=>Object.assign({id:d.id,_col:col},d.data()));
const memberSubs={};
function subscribeFounder(){
  ["ledger","events","reminders","outreach"].forEach(c=>{
    S.db.collection(c).onSnapshot(snap=>{S[c]=rows(snap,c);S.loaded[c]=true;scheduleRender(true)},()=>{});
  });
  S.db.doc("settings/site").onSnapshot(d=>{S.site=d.exists?Object.assign({brands:{}},d.data()):{brands:{}};S.loaded.site=true;scheduleRender(true)},()=>{});
  S.db.collection("docs").onSnapshot(snap=>{S.docs=rows(snap,"docs");S.loaded.docs=true;scheduleRender(true)},()=>{});
  S.db.collection("vault").onSnapshot(snap=>{const all=rows(snap,"vault");S.vaultMeta=(all.find(r=>r.id==="_meta")||null);S.vault=all.filter(r=>r.id!=="_meta");S.loaded.vault=true;if(S.vkey)decryptVault();else scheduleRender(true)},()=>{});
  S.db.collection("memberlog").onSnapshot(snap=>{
    S.members=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));S.loaded.members=true;
    Object.keys(S.members).forEach(u=>{if(memberSubs[u]||u===S.uid)return;const col=memberCol(u);
      memberSubs[u]=S.db.collection(col).onSnapshot(es=>{S.memberLogs[u]=rows(es,col).map(r=>Object.assign(r,{_by:u}));scheduleRender(true)},()=>{})});
    resolveNames(Object.keys(S.members));scheduleRender(true);
  },()=>{});
  subscribeTeam();
}
function subscribeMember(){
  const u=S.uid;
  S.db.doc("memberlog/"+u).onSnapshot(d=>{S.requested=d.exists;S.loaded.req=true;scheduleRender(true)},()=>{S.loaded.req=true;scheduleRender(true)});
  S.db.collection(memberCol(u)).onSnapshot(es=>{S.myEntries=rows(es,memberCol(u));S.loaded.mine=true;scheduleRender(true)},()=>{});
  subscribeTeam();
}
/* ---------- teams: heads, join requests, approvals ----------
   org/heads            {founder, heads:{brandId:[uid]}}   founder edits
   requests/{uid}       {brands:[...], joinedAt, email?}    each person edits their own
   grants/{author}/to/{member_brand}  {member, brand, status:"approved"|"declined"}
   A grant counts only when its author is the founder or a head of that company. */
const grantSubs={};let reqSub=null;
const headsOf=b=>((S.org.heads||{})[b]||[]);
const headBrands=(u)=>BRANDS.map(b=>b.id).filter(b=>headsOf(b).includes(u||S.uid));
const isHead=()=>!S.isAdmin&&headBrands().length>0;
const manageBrands=()=>S.isAdmin?BRANDS.map(b=>b.id):headBrands();
function allGrants(){let a=[];Object.entries(S.grants).forEach(([h,l])=>{l.forEach(g=>a.push(Object.assign({author:h},g)))});
  return a.filter(g=>BR[g.brand]&&(g.author===S.org.founder||(S.isAdmin&&g.author===S.uid)||headsOf(g.brand).includes(g.author)))}
const grantFor=(m,b)=>allGrants().filter(g=>g.member===m&&g.brand===b).sort((x,y)=>String(y.at||"")<String(x.at||"")?-1:1)[0];
const teamOf=b=>[...new Set(allGrants().filter(g=>g.brand===b&&g.status==="approved").map(g=>g.member).concat(headsOf(b)))];
function computeMine(){
  if(S.isAdmin)return;
  const g=allGrants().filter(x=>x.member===S.uid&&x.status==="approved").map(x=>x.brand);
  S.myBrands=BRANDS.map(b=>b.id).filter(b=>g.includes(b)&&grantFor(S.uid,b).status==="approved"||headsOf(b).includes(S.uid));
}
function watchGrants(){
  const ids=new Set([S.org.founder,S.uid].concat(...Object.values(S.org.heads||{})).filter(Boolean));
  ids.forEach(h=>{if(grantSubs[h])return;const col="grants/"+h+"/to";
    grantSubs[h]=S.db.collection(col).onSnapshot(s=>{S.grants[h]=s.docs.map(d=>Object.assign({id:d.id},d.data()));scheduleRender(true)},()=>{})});
  if(!reqSub){
    if(S.isAdmin||headBrands().length){reqSub=S.db.collection("requests").onSnapshot(s=>{S.requests=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));S.myReq=S.requests[S.uid]||null;S.loaded.req=true;resolveNames(Object.keys(S.requests));scheduleRender(true)},()=>{})}
    else reqSub=S.db.doc("requests/"+S.uid).onSnapshot(d=>{S.myReq=d.exists?d.data():null;S.loaded.req=true;scheduleRender(true)},()=>{S.loaded.req=true;scheduleRender(true)});
  }
}
function subscribeTeam(){
  S.db.doc("org/heads").onSnapshot(d=>{
    const o=d.exists?d.data():{};S.org={founder:o.founder||"",heads:o.heads||{}};S.loaded.org=true;
    if(S.isAdmin&&S.uid&&S.org.founder!==S.uid)save("org","heads",{founder:S.uid,heads:S.org.heads});
    if(reqSub&&!S.isAdmin&&headBrands().length&&!S.loaded.reqAll){reqSub();reqSub=null;S.loaded.reqAll=true}
    watchGrants();scheduleRender(true);
  },()=>{S.loaded.org=true;watchGrants();scheduleRender(true)});
}
async function setGrant(member,brand,status){
  const ok=await save("grants/"+S.uid+"/to",member+"_"+brand,{member,brand,status,at:new Date().toISOString()});
  if(ok)toast(status==="approved"?"Added to "+brandInfo(brand).name:"Request declined");
}
async function removeFromTeam(member,brand){
  const mine=allGrants().filter(g=>g.member===member&&g.brand===brand&&(S.isAdmin||g.author===S.uid));
  if(!mine.length){toast("Only the person who approved them or the founder can remove them.");return}
  for(const g of mine)await remove("grants/"+g.author+"/to",g.id);
  toast("Removed from "+brandInfo(brand).name);
}
async function setHeads(brand,list){
  const heads=Object.assign({},S.org.heads);heads[brand]=[...new Set(list)];
  if(await save("org","heads",{founder:S.org.founder||S.uid,heads})){
    if(BACKEND==="firebase"){for(const u of list.concat(headsOf(brand))){const hb=BRANDS.map(b=>b.id).filter(b=>(heads[b]||[]).includes(u));await S.db.doc("access/"+u).set({heads:hb},{merge:true}).catch(()=>{})}}
    toast("Company heads updated");
  }
}
function subscribePublic(){
  S.db.doc("settings/site").onSnapshot(d=>{S.site=d.exists?Object.assign({brands:{}},d.data()):{brands:{}};S.loaded.site=true;scheduleRender(true)},()=>{S.loaded.site=true});
  S.db.collection("events").where("visibility","==","public").onSnapshot(snap=>{S.events=rows(snap,"events");S.loaded.events=true;scheduleRender(true)},()=>{});
}
async function resolveNames(ids){
  if(BACKEND!=="claude"||!S.userCap||!S.userCap.profiles)return;
  const need=ids.filter(i=>!(i in S.names));if(!need.length)return;
  try{const ps=await S.userCap.profiles(need);need.forEach(i=>{S.names[i]=(ps[i]&&ps[i].name)||""});scheduleRender(true)}catch(e){}
}
const memberName=u=>u===S.uid?"You":(S.requests[u]&&S.requests[u].email)||(S.members[u]&&S.members[u].email)||S.names[u]||"Team member "+String(u).slice(-4);

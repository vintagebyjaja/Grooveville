
/* ---------- modals ---------- */
const brandOpts=(sel,only)=>BRANDS.filter(b=>!only||only.includes(b.id)).map(b=>'<option value="'+b.id+'"'+(b.id===sel?" selected":"")+'>'+esc(brandInfo(b.id).name)+'</option>').join("");
const delBtn=has=>has?'<button type="button" class="btn danger left" data-act="del-arm">Delete</button>':'';

function entryModal(d){
  d=Object.assign({brand:S.ts.brand!=="all"?S.ts.brand:"hq",type:"meeting",date:today()},d||{});
  const t=d.type, timed=t==="meeting"||t==="hours", moneyT=["expense","receipt","income"].includes(t);
  openModal('<form id="mf"><h3 style="margin-bottom:14px">'+(d.id?"Edit entry":"New entry")+'</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<div class="grid2"><label class="f">Slot<select class="i" id="e-brand" name="brand">'+brandOpts(d.brand,S.isAdmin?null:S.myBrands)+'</select></label><label class="f">Type<select class="i" id="e-type" name="type">'+TYPES.map(x=>'<option value="'+x.id+'"'+(x.id===t?" selected":"")+'>'+x.label+'</option>').join("")+'</select></label><label class="f">Date<input class="i" type="date" id="e-date" name="date" value="'+esc(d.date)+'" required></label></div>'+
    '<label class="f">'+({meeting:"Meeting with / about",hours:"What you worked on",expense:"What was it for",receipt:"What was purchased",income:"What it was for",note:"Note title"}[t])+'<input class="i" id="e-title" name="title" value="'+esc(d.title)+'" required></label>'+
    (timed?'<div class="grid2"><label class="f">Start<input class="i" type="time" id="e-start" name="start" value="'+esc(d.start)+'" required></label><label class="f">End<input class="i" type="time" id="e-end" name="end" value="'+esc(d.end)+'" required></label>'+(t==="meeting"?'<label class="f">Location or link<input class="i" id="e-loc" name="location" value="'+esc(d.location)+'"></label>':'')+'</div>':'')+
    (moneyT?'<div class="grid2"><label class="f">Amount ($)<input class="i mono" type="number" step="0.01" min="0" inputmode="decimal" id="e-amt" name="amount" value="'+esc(d.amount)+'" required></label>'+(t==="income"?'<label class="f">Type of money in<select class="i" id="e-src" name="source">'+SOURCES.map(x=>'<option'+(x===(d.source||"Payment")?" selected":"")+'>'+x+'</option>').join("")+'</select></label>':'')+'<label class="f">'+(t==="income"?"From (person or org)":"Paid to (vendor)")+'<input class="i" id="e-vendor" name="vendor" value="'+esc(d.vendor)+'"></label><label class="f">Category<select class="i" id="e-cat" name="category"><option value="">—</option>'+CATS.map(c=>'<option'+(c===d.category?" selected":"")+'>'+c+'</option>').join("")+'</select></label></div>'+
      (t!=="income"?'<div class="grid2"><label class="f">Paid with<select class="i" id="e-pay" name="payment">'+["","Business card","Cash","Cash App","Zelle","Personal card","Check","Other"].map(p=>'<option'+(p===d.payment?" selected":"")+'>'+p+'</option>').join("")+'</select></label><label class="f">Receipt #<input class="i mono" id="e-rno" name="receiptNo" value="'+esc(d.receiptNo)+'"></label></div>'+
      '<label class="f">Receipt photo '+(d.hasImage?'<span class="muted" style="font-weight:400">(one saved; choose a new one to replace)</span>':'')+'<input class="i" type="file" accept="image/*" id="e-img" name="img"></label>':''):'')+
    '<label class="f">Notes<textarea class="i" id="e-notes" name="notes" style="min-height:70px">'+esc(d.notes)+'</textarea></label></div>'+
    '<div class="row">'+delBtn(d.id)+'<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save entry</button></div></form>',
  el=>{
    el.querySelector("#e-type").addEventListener("change",()=>{const o=Object.assign({},d,formObj(el.querySelector("#mf")));entryModal(o)});
    const col=d._col||(S.isAdmin?"ledger":memberCol(S.uid));
    el._del=async()=>{if(await remove(col,d.id)){if(d.hasImage)remove(imgCol(col),d.id);closeModal();toast("Entry deleted")}};
    el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();
      const f=ev.target, o=formObj(f), id=d.id||uid();
      const rec={brand:o.brand,type:o.type,date:o.date,title:o.title,notes:o.notes||"",createdAt:d.createdAt||new Date().toISOString(),by:d.by||S.uid||""};
      if(o.type==="meeting"||o.type==="hours"){rec.start=o.start;rec.end=o.end;rec.hours=Math.round(span(o.start,o.end)*100)/100;if(o.location)rec.location=o.location}
      if(["expense","receipt","income"].includes(o.type)){rec.amount=Math.round(parseFloat(o.amount||0)*100)/100;rec.vendor=o.vendor||"";rec.category=o.category||"";if(o.type!=="income"){rec.payment=o.payment||"";rec.receiptNo=o.receiptNo||""}else rec.source=o.source||"Payment"}
      const file=f.querySelector("#e-img")&&f.querySelector("#e-img").files[0];
      rec.hasImage=!!(d.hasImage&&["expense","receipt"].includes(o.type));
      f.querySelector("button[type=submit]").disabled=true;
      if(file){const data=await shrink(file);if(data&&await save(imgCol(col),id,{data}))rec.hasImage=true}
      if(await save(col,id,rec)){closeModal();toast("Entry saved")}else f.querySelector("button[type=submit]").disabled=false;
    });
  });
}
function shrink(file){return new Promise(res=>{const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{
  let q=.7,max=1100,out;for(let i=0;i<5;i++){const sc=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);c.getContext("2d").drawImage(img,0,0,c.width,c.height);out=c.toDataURL("image/jpeg",q);if(out.length<230000)break;q-=.12;max=Math.round(max*.8)}
  res(out.length<250000?out:null)};img.onerror=()=>{toast("That file isn't an image we can read");res(null)};img.src=r.result};r.readAsDataURL(file)})}

function shrinkLogo(file){return new Promise(res=>{const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{
  const sc=Math.min(1,320/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*sc));c.height=Math.max(1,Math.round(img.height*sc));
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);let out=c.toDataURL("image/webp",.88);if(!out.startsWith("data:image/webp"))out=c.toDataURL("image/png");
  if(out.length>60000)out=c.toDataURL("image/webp",.7);res(out.length<90000?out:(toast("That logo is too large. Try a smaller image."),null))};
  img.onerror=()=>{toast("That file isn't an image we can read");res(null)};img.src=r.result};r.readAsDataURL(file)})}
function eventModal(d){
  d=Object.assign({brand:"hq",date:today(),visibility:"private",remindDays:""},d||{});
  openModal('<form id="mf"><h3 style="margin-bottom:14px">'+(d.id?"Edit event":"New event")+'</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<fieldset style="border:0;padding:0;margin:0"><legend class="f" style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">Who can see it</legend><div class="seg"><button type="button" data-v="public" class="'+(d.visibility==="public"?"on":"")+'">Public</button><button type="button" data-v="private" class="'+(d.visibility!=="public"?"on":"")+'">Private</button></div>'+
    '<p class="muted" id="vis-help" style="font-size:13px;margin-top:6px"></p><input type="hidden" name="visibility" id="ev-vis" value="'+esc(d.visibility)+'"></fieldset>'+
    '<div class="grid2"><label class="f">Company<select class="i" id="ev-brand" name="brand">'+brandOpts(d.brand)+'</select></label><label class="f">Date<input class="i" type="date" id="ev-date" name="date" value="'+esc(d.date)+'" required></label></div>'+
    '<label class="f">Title<input class="i" id="ev-title" name="title" value="'+esc(d.title)+'" required></label>'+
    '<div class="grid2"><label class="f">Start<input class="i" type="time" id="ev-start" name="start" value="'+esc(d.start)+'"></label><label class="f">End<input class="i" type="time" id="ev-end" name="end" value="'+esc(d.end)+'"></label><label class="f">Remind me<select class="i" id="ev-rem" name="remindDays">'+REMIND.map(([v,l])=>'<option value="'+v+'"'+(String(d.remindDays)===v?" selected":"")+'>'+l+'</option>').join("")+'</select></label></div>'+
    '<label class="f">Location<input class="i" id="ev-loc" name="location" value="'+esc(d.location)+'"></label>'+
    '<label class="f">Tickets or info link<input class="i" type="url" id="ev-link" name="link" value="'+esc(d.link)+'" placeholder="https://"></label>'+
    '<label class="f">Description<textarea class="i" id="ev-desc" name="description" style="min-height:70px">'+esc(d.description)+'</textarea></label></div>'+
    '<div class="row">'+delBtn(d.id)+(d.id?'<a class="btn ghost" href="'+esc(gcal({title:d.title,date:d.date,start:d.start,end:d.end,location:d.location,details:d.description}))+'" target="_blank" rel="noopener">Add to Google Calendar</a>':'')+'<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save event</button></div></form>',
  el=>{
    const help=()=>{el.querySelector("#vis-help").textContent=el.querySelector("#ev-vis").value==="public"?"Shows on the public calendar and company page after you publish. Use for launches and events you are hosting.":"Back office only. Visitors never see private events."};help();
    el.querySelectorAll(".seg button").forEach(b=>b.addEventListener("click",()=>{el.querySelectorAll(".seg button").forEach(x=>x.classList.toggle("on",x===b));el.querySelector("#ev-vis").value=b.dataset.v;help()}));
    el._del=async()=>{if(await remove("events",d.id)){closeModal();toast("Event deleted")}};
    el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target);
      const rec={brand:o.brand,title:o.title,date:o.date,start:o.start||"",end:o.end||"",location:o.location||"",link:o.link||"",description:o.description||"",visibility:o.visibility==="public"?"public":"private",remindDays:o.remindDays,createdAt:d.createdAt||new Date().toISOString()};
      if(await save("events",d.id||uid(),rec)){closeModal();toast(rec.visibility==="public"?"Saved. Publish to show it on the public site.":"Event saved")}});
  });
}
function remModal(d){
  d=Object.assign({brand:"hq",date:today(),priority:"normal"},d||{});
  openModal('<form id="mf"><h3 style="margin-bottom:14px">'+(d.id?"Edit reminder":"New reminder")+'</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">Remind me to…<input class="i" id="r-title" name="title" value="'+esc(d.title)+'" required placeholder="Pay venue deposit"></label>'+
    '<div class="grid2"><label class="f">Company<select class="i" id="r-brand" name="brand">'+brandOpts(d.brand)+'</select></label><label class="f">Date<input class="i" type="date" id="r-date" name="date" value="'+esc(d.date)+'" required></label><label class="f">Time<input class="i" type="time" id="r-time" name="time" value="'+esc(d.time)+'"></label></div>'+
    '<label class="f">Priority<select class="i" id="r-pri" name="priority"><option value="normal">Normal</option><option value="high"'+(d.priority==="high"?" selected":"")+'>Important</option></select></label>'+
    '<label class="f">Notes<textarea class="i" id="r-notes" name="notes" style="min-height:70px">'+esc(d.notes)+'</textarea></label></div>'+
    '<div class="row">'+delBtn(d.id)+(d.id?'<a class="btn ghost" href="'+esc(gcal({title:"Reminder: "+d.title,date:d.date,start:d.time,details:d.notes}))+'" target="_blank" rel="noopener">Add to Google Calendar</a>':'')+'<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save reminder</button></div></form>',
  el=>{
    el._del=async()=>{if(await remove("reminders",d.id)){closeModal();toast("Reminder deleted")}};
    el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target);
      const rec={title:o.title,brand:o.brand,date:o.date,time:o.time||"",priority:o.priority,notes:o.notes||"",done:!!d.done,createdAt:d.createdAt||new Date().toISOString()};
      if(await save("reminders",d.id||uid(),rec)){closeModal();toast("Reminder saved")}});
  });
}
function outModal(d){
  d=Object.assign({brand:"hq",direction:"outgoing",status:"draft",type:COLLAB_TYPES[0]},d||{});
  openModal('<form id="mf"><h3 style="margin-bottom:14px">'+(d.id?"Edit collaboration":"New official invitation")+'</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<div class="grid2"><label class="f">Direction<select class="i" id="o-dir" name="direction"><option value="outgoing">Outgoing invitation</option><option value="incoming"'+(d.direction==="incoming"?" selected":"")+'>Incoming request</option></select></label><label class="f">Grooveville company<select class="i" id="o-brand" name="brand">'+brandOpts(d.brand)+'</select></label><label class="f">Status<select class="i" id="o-status" name="status">'+STATUSES.map(([v,l])=>'<option value="'+v+'"'+(d.status===v?" selected":"")+'>'+l+'</option>').join("")+'</select></label></div>'+
    '<div class="grid2"><label class="f">Organization *<input class="i" id="o-org" name="org" value="'+esc(d.org)+'" required></label><label class="f">Contact person<input class="i" id="o-contact" name="contact" value="'+esc(d.contact)+'"></label><label class="f">Contact email<input class="i" type="email" id="o-email" name="email" value="'+esc(d.email)+'"></label></div>'+
    '<div class="grid2"><label class="f">Type<select class="i" id="o-type" name="type">'+COLLAB_TYPES.map(t=>'<option'+(t===d.type?" selected":"")+'>'+t+'</option>').join("")+'</select></label><label class="f">Proposed date<input class="i" type="date" id="o-date" name="date" value="'+esc(d.date)+'"></label></div>'+
    '<label class="f">Proposal (goes in the letter)<textarea class="i" id="o-prop" name="proposal">'+esc(d.proposal)+'</textarea></label>'+
    '<label class="f">Private notes<textarea class="i" id="o-notes" name="notes" style="min-height:60px">'+esc(d.notes)+'</textarea></label></div>'+
    '<div class="row">'+delBtn(d.id)+'<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save & view letter</button></div></form>',
  el=>{
    el._del=async()=>{if(await remove("outreach",d.id)){closeModal();toast("Deleted")}};
    el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target);const id=d.id||uid();const created=d.created||today();
      const rec=Object.assign({},o,{created,ref:d.ref||refCode(o.brand,created,id)});delete rec.id;
      if(await save("outreach",id,rec))letterModal(Object.assign({id},rec));});
  });
}
function letterModal(o){
  openModal('<h3>Official letter</h3><p class="muted">Copy this into an email'+(o.email?' to <b class="mono">'+esc(o.email)+'</b>':'')+'. Reference <b class="mono">'+esc(o.ref)+'</b>.</p>'+letterHTML(o)+
    '<div class="row"><button class="btn ghost" data-act="close-modal">Close</button><button class="btn teal" data-act="copy-letter">Copy letter</button></div>',el=>{el._letter=letterText(o)});
}
function contactModal(){
  const s=S.site||{};
  openModal('<form id="mf"><h3 style="margin-bottom:14px">Official contact</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">Contact email (public)<input class="i" type="email" id="s-email" name="contactEmail" value="'+esc(s.contactEmail)+'" placeholder="hello@yourdomain.com"></label>'+
    '<label class="f">Letters signed by<input class="i" id="s-signer" name="signer" value="'+esc(s.signer)+'" placeholder="Name, Title"></label></div>'+
    '<div class="row"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save</button></div></form>',
  el=>el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target);
    if(await save("settings","site",Object.assign({},S.site,{contactEmail:o.contactEmail,signer:o.signer}))){closeModal();toast("Saved")}}));
}
function brandModal(id){
  const b=brandInfo(id), cur=((S.site||{}).brands||{})[id]||{};
  openModal('<form id="mf"><h3 style="margin-bottom:4px">'+esc(b.name)+' page</h3><p class="muted" style="margin-bottom:12px;font-size:14px">Leave a field blank to keep the default text.</p><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">Tagline<input class="i" id="b-tag" name="tagline" value="'+esc(cur.tagline)+'" placeholder="'+esc(BR[id].tagline)+'"></label>'+
    '<label class="f">About<textarea class="i" id="b-about" name="about" placeholder="'+esc(BR[id].about)+'">'+esc(cur.about)+'</textarea></label>'+
    '<label class="f">Website (the page links out to it)<input class="i" type="url" id="b-web" name="website" value="'+esc(cur.website)+'" placeholder="https://"></label>'+
    '<label class="f">Social link<input class="i" type="url" id="b-soc" name="social" value="'+esc(cur.social)+'" placeholder="https://instagram.com/…"></label>'+
    '<div class="f" style="font-size:13px;font-weight:600;color:var(--muted)">Logo<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:5px">'+(b.logo?'<img class="blogo big" style="margin:0" id="b-prev" src="'+esc(b.logo)+'" alt="">':'')+'<input class="i" type="file" accept="image/*" id="b-logo" style="flex:1;min-width:0">'+(cur.logo?'<label style="display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" id="b-rmlogo"> Remove logo</label>':'')+'</div><span style="font-weight:400">PNG with a transparent background looks best. It is resized to fit.</span></div></div>'+
    '<div class="row"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save</button></div></form>',
  el=>el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target);
    const brands=Object.assign({},(S.site||{}).brands);let logo=cur.logo||"";
    const lf=el.querySelector("#b-logo").files[0];if(lf){logo=await shrinkLogo(lf);if(!logo)return}
    const rm=el.querySelector("#b-rmlogo");if(rm&&rm.checked&&!lf)logo="";
    brands[id]={tagline:o.tagline,about:o.about,website:o.website,social:o.social,logo};
    if(await save("settings","site",Object.assign({},S.site,{brands}))){closeModal();toast("Saved. Publish to update the public page.")}}));
}
function dayModal(ds){
  const team=S.isAdmin&&S.route==="team-cal";
  const list=calItems(team).filter(i=>i.date===ds&&(S.cal.brand==="all"||i.brand===S.cal.brand)).sort((a,b)=>(a.start||"99")<(b.start||"99")?-1:1);
  openModal('<h3>'+fmtDate(ds)+'</h3>'+(list.length?'<div style="display:flex;flex-direction:column;gap:8px">'+list.map(i=>'<button class="rem" style="'+cvar(i.brand)+';text-align:left;cursor:pointer;width:100%;grid-template-columns:auto minmax(0,1fr)" data-act="'+(i.kind==="event"?(team?"edit-event":"ev-open"):i.kind==="reminder"?"edit-rem":"edit-entry")+'" data-id="'+esc(i.id)+'"><span class="pill '+(i.kind==="event"?(i.vis==="public"?"pub":"priv"):"high")+'">'+(i.kind==="event"?(team?(i.vis==="public"?"Public":"Private"):"Event"):i.kind==="reminder"?"Reminder":"Meeting")+'</span><span><span class="rt">'+esc(i.title)+'</span><span class="rm">'+chip(i.brand)+(i.start?'<span class="mono">'+fmtTime(i.start)+'</span>':'')+'</span></span></button>').join("")+'</div>':'<p class="muted">Nothing on this day.</p>')+
    '<div class="row">'+(team?'<button class="btn ghost" data-act="new-rem" data-date="'+ds+'">+ Reminder</button><button class="btn olive" data-act="new-event" data-date="'+ds+'">+ Event</button>':'')+'<button class="btn ghost" data-act="close-modal">Close</button></div>');
}
function eventDetail(id){
  const e=pub().events.find(x=>x.id===id);if(!e)return;
  openModal('<div style="'+cvar(e.brand)+'">'+chip(e.brand)+'<h3 style="margin-top:10px">'+esc(e.title)+'</h3><p class="mono" style="margin-top:6px">'+fmtDate(e.date)+(e.start?" · "+fmtTime(e.start)+(e.end?" – "+fmtTime(e.end):""):"")+'</p>'+(e.location?'<p class="muted">'+esc(e.location)+'</p>':'')+(e.description?'<p style="margin-top:12px;white-space:pre-wrap">'+esc(e.description)+'</p>':'')+'</div>'+
    '<div class="row">'+(e.link?'<a class="btn peach" href="'+esc(e.link)+'" target="_blank" rel="noopener">Tickets & info ↗</a>':'')+'<a class="btn ghost" href="'+esc(gcal({title:e.title,date:e.date,start:e.start,end:e.end,location:e.location,details:e.description}))+'" target="_blank" rel="noopener">Add to Google Calendar</a><button class="btn ghost" data-act="close-modal">Close</button></div>');
}
async function viewReceipt(id){
  openModal('<h3>Receipt</h3><div id="rimg" class="empty">Loading…</div><div class="row"><button class="btn ghost" data-act="close-modal">Close</button></div>');
  const en=ledgerAll().find(x=>x.id===id);const ic=imgCol((en&&en._col)||"ledger");
  try{const d=await S.db.doc(ic+"/"+id).get();const box=$("#rimg");if(!box)return;
    if(d.exists){box.className="";box.innerHTML='<img alt="Receipt photo" style="width:100%;border-radius:10px;border:1px solid var(--line)" src="'+esc(d.data().data)+'">'}else box.textContent="No photo found."}
  catch(e){const box=$("#rimg");if(box)box.textContent="Couldn't load the photo."}
}
async function exportCSV(){
  const f=S.ts;const L=sortBy(ledgerAll().filter(l=>(f.brand==="all"||l.brand===f.brand)&&String(l.date).startsWith(f.month)&&(f.type==="all"||l.type===f.type)),l=>l.date+(l.start||""));
  return saveFile("grooveville-timesheet-"+(f.brand==="all"?"all":f.brand)+"-"+f.month+".csv",toCSV([ENTRY_HEAD].concat(L.map(entryRow))));
}

/* ---------- publish public site ---------- */
function b64utf8(s){const b=new TextEncoder().encode(s);let o="";for(let i=0;i<b.length;i+=8192)o+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return btoa(o)}
function fromb64(s){const bin=atob(s);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new TextDecoder().decode(u)}
async function publishSite(btn){
  const art=await cu("artifact");
  if(!art){toast("Publishing isn't available in this view");return}
  if(btn)btn.disabled=true;
  const tpl=fromb64(SELF_B64);
  const payload=Object.assign(livePublic(),{publishedAt:new Date().toISOString()});
  const json=JSON.stringify(payload).replace(/</g,"\\u003c");
  const body=tpl.replace("__SE"+"LF__",()=>b64utf8(tpl)).replace("__SN"+"AP__",()=>json);
  const html='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+fromb64(RESET)+'</style></head><body>\n'+body+'\n</body></html>';
  try{await art.publish(html);toast("Published. Reloading…")}
  catch(e){if(btn)btn.disabled=false;
    const c=e&&e.code;
    if(c==="conflict")toast("A newer version was just published. Reloading…");
    else if(c==="not_writer"||c==="not_granted")toast("Only the owner and editors can publish.");
    else if(c==="rate_limited")toast("Publishing too often. Wait a minute and try again.");
    else toast("Couldn't publish. Try again in a moment.");}
}

/* ---------- router & render ---------- */
let rq=0;
function scheduleRender(fromData){
  if(fromData&&(S.route.startsWith("collab")||(S.route==="signin"&&$("#authForm"))))return;
  if(rq)return;rq=requestAnimationFrame(()=>{rq=0;render()});
}
function render(){
  computeMine();
  navLinks();
  const r=S.route, app=$("#app");
  let h;
  if(r==="calendar")h=viewPublicCalendar();
  else if(r.startsWith("collab"))h=viewCollab(r.split("-")[1]);
  else if(r.startsWith("b-")&&BR[r.slice(2)])h=viewBrand(r.slice(2));
  else if(r==="signin")h=viewSignin();
  else if(r==="portal")h=viewPortal();
  else if(r==="portal-team")h=isHead()?viewMyTeam():viewPortal();
  else if(r.startsWith("team")){
    if(!S.isAdmin)h=viewSignin();
    else if(!S.db)h='<div class="wrap gate"><h1>Back office unavailable</h1><p class="muted">Saved records can\'t be reached in this view. Open the page from claude.ai while signed in.</p></div>';
    else{const v={"team":viewDash,"team-time":viewTimesheet,"team-cal":()=>viewCalendar(true),"team-rem":viewReminders,"team-out":viewOutreach,"team-people":viewTeams,"team-vault":viewVault,"team-docs":viewDocs,"team-reports":viewReports,"team-site":viewSite}[r]||viewDash;h=teamShell(TEAM_TABS.some(t=>t[0]===r)?r:"team",v())}
  }
  else h=viewHome();
  app.innerHTML=h;
  const cf=$("#collabForm");if(cf)cf.addEventListener("submit",e=>{e.preventDefault();collabSubmit(cf)});
  const af=$("#authForm");if(af)af.addEventListener("submit",e=>{e.preventDefault();fbAuth(af,(e.submitter&&e.submitter.dataset.mode)||"in")});
  [["docf-cat","cat"],["docf-year","year"],["docf-q","q"]].forEach(([i,k])=>{const el=$("#"+i);if(el)el.addEventListener("change",()=>{S.docf[k]=el.value;render()})});
  const dz=$("#dropzone");if(dz){dz.addEventListener("dragover",e=>{e.preventDefault();dz.style.borderColor="var(--teal)"});dz.addEventListener("dragleave",()=>{dz.style.borderColor=""});dz.addEventListener("drop",e=>{e.preventDefault();dz.style.borderColor="";if(e.dataTransfer.files.length)docsModal(e.dataTransfer.files)})}
  const tm=$("#ts-month");if(tm)tm.addEventListener("change",()=>{if(tm.value){S.ts.month=tm.value;render()}});
  $("#footnote").innerHTML=SNAP.publishedAt?' · Updated '+esc(new Date(SNAP.publishedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})):'';
}
function route(){S.route=(location.hash||"#home").slice(1)||"home"}
window.addEventListener("hashchange",()=>{route();render();window.scrollTo(0,0)});

/* ---------- events ---------- */
const byId=(col,id)=>S[col].find(x=>x.id===id);
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-act]");if(!t)return;
  const a=t.dataset.act, id=t.dataset.id;
  if(a==="scrim"){if(e.target===t)closeModal();return}
  if(a==="close-modal")return closeModal();
  if(a==="del-arm"){t.textContent="Tap again to delete";t.dataset.act="del-go";return}
  if(a==="del-go"){const m=t.closest(".modal");if(m&&m._del)m._del();return}
  if(a==="copy-letter"){const m=t.closest(".modal");return copyText(m._letter,t)}
  if(a==="log-incoming"){const m=t.closest(".modal");const o=Object.assign({},m._rec);const rid=o.id;delete o.id;if(await save("outreach",rid,o)){t.disabled=true;t.textContent="Saved to Collabs"}return}
  if(a==="ev-open")return eventDetail(id);
  if(a==="day")return dayModal(t.dataset.date);
  if(a==="cal-prev"||a==="cal-next"){const [y,m]=S.cal.month.split("-").map(Number);const d=new Date(y,m-1+(a==="cal-next"?1:-1),1);S.cal.month=iso(d).slice(0,7);return render()}
  if(a==="cal-today"){S.cal.month=today().slice(0,7);return render()}
  if(a==="cal-brand"){S.cal.brand=t.dataset.v;return render()}
  if(a==="signout"){if(BACKEND==="firebase"&&window.firebase)firebase.auth().signOut();return}
  if(a==="reset-pass")return fbReset();
  if(a==="request-join"){const card=t.closest(".card");const brands=[...card.querySelectorAll("input[name=jb]:checked:not(:disabled)")].map(x=>x.value);
    if(!brands.length){toast("Pick at least one company");return}
    t.disabled=true;const base=Object.assign({joinedAt:(S.myReq&&S.myReq.joinedAt)||new Date().toISOString()},S.email?{email:S.email}:{});
    const ok=await save("requests",S.uid,Object.assign({},base,{brands,updatedAt:new Date().toISOString()}))&&await save("memberlog",S.uid,base);
    if(ok){toast("Request sent");return}t.disabled=false;openModal('<h3>Can\'t send the request</h3><p class="muted">Your account can view this page but can\'t save to it. Ask the founder to share it with you as a Contributor (“Can use”), then try again.</p><div class="row"><button class="btn ghost" data-act="close-modal">Close</button></div>');return}
  if(isHead()||S.isAdmin){
    const u=t.dataset.u,b=t.dataset.b;
    if(b&&!manageBrands().includes(b))return;
    if(a==="approve"){t.disabled=true;return setGrant(u,b,"approved")}
    if(a==="decline"){t.disabled=true;return setGrant(u,b,"declined")}
    if(a==="team-rm")return removeFromTeam(u,b);
    if(a==="team-add"){const v=$("#add-"+b).value;if(!v){toast("Choose a person first");return}return setGrant(v,b,"approved")}
    if(S.isAdmin&&a==="head-add"){const v=$("#head-"+b).value;if(!v){toast("Choose a person first");return}return setHeads(b,headsOf(b).concat(v))}
    if(S.isAdmin&&a==="head-rm")return setHeads(b,headsOf(b).filter(x=>x!==u));
  }
  if(isMember()){
    if(a==="ts-brand"){S.ts.brand=t.dataset.v;return render()}
    if(a==="ts-type"){S.ts.type=t.dataset.v;return render()}
    if(a==="new-entry")return entryModal({brand:t.dataset.brand||(S.ts.brand!=="all"?S.ts.brand:S.myBrands[0])});
    if(a==="new-income")return entryModal({brand:t.dataset.brand||S.myBrands[0],type:"income"});
    if(a==="edit-entry"){const x=S.myEntries.find(z=>z.id===id);return x&&entryModal(Object.assign({},x))}
    if(a==="view-receipt")return viewReceipt(id);
    if(a==="export")return exportCSV();
    return;
  }
  if(!S.isAdmin)return;
  if(a==="new-income")return entryModal({brand:t.dataset.brand||"hq",type:"income"});
  if(a==="vault-setup")return vaultPassModal(true);
  if(a==="vault-unlock")return vaultPassModal(false);
  if(a==="vault-lock"){lockVault();return render()}
  if(a==="vault-forgot")return vaultForgotModal();
  if(a==="doc-up")return docsModal();
  if(a==="doc-open")return openDoc(id);
  if(a==="doc-dl"){const d=S.docs.find(x=>x.id===id);if(d&&S.docBlob&&S.docBlob.id===id)return saveFile(d.name,S.docBlob.blob,d.type);return}
  if(a==="doc-del")return deleteDoc(id,t);
  if(a==="docf"){S.docf[t.dataset.k]=t.dataset.v;return render()}
  if(a==="rep-year"){S.rep.year=Number(t.dataset.v);return render()}
  if(a==="rep-month")return exportMonthLog(t.dataset.v);
  if(a==="rep-sum")return exportYear(false);
  if(a==="rep-log")return exportYear(true);
  if(a==="vault-recovery"){vTouch();return vaultRecoveryModal()}
  if(a==="vault-changepass"){vTouch();return vaultChangePassModal()}
  if(a==="rc-copy"){const m=t.closest(".modal");return copyText(m._rc,t)}
  if(a==="vault-new"){vTouch();return vaultItemModal()}
  if(a==="vault-edit"){vTouch();return vaultItemModal(Object.assign({id},S.vplain[id]))}
  if(a==="vault-show"){vTouch();const sp=document.querySelector('.vpass[data-id="'+id+'"]');if(sp){const on=t.textContent==="Show";sp.textContent=on?((S.vplain[id]||{}).pass||""):"••••••••";t.textContent=on?"Hide":"Show"}return}
  if(a==="vault-copy"){vTouch();return copyText((S.vplain[id]||{})[t.dataset.f]||"",t)}
  if(a==="ts-brand"){S.ts.brand=t.dataset.v;return render()}
  if(a==="ts-type"){S.ts.type=t.dataset.v;return render()}
  if(a==="slot-ts"){S.ts.brand=t.dataset.brand;S.ts.type="all";location.hash="#team-time";return}
  if(a==="new-entry")return entryModal({brand:t.dataset.brand||(S.ts.brand!=="all"?S.ts.brand:"hq")});
  if(a==="edit-entry"){const x=ledgerAll().find(z=>z.id===id);return x&&entryModal(Object.assign({},x))}
  if(a==="new-event")return eventModal({brand:t.dataset.brand||(S.cal.brand!=="all"?S.cal.brand:"hq"),date:t.dataset.date||today()});
  if(a==="edit-event"){const x=byId("events",id);return x&&eventModal(Object.assign({},x))}
  if(a==="new-rem")return remModal({date:t.dataset.date||today(),brand:S.cal.brand!=="all"?S.cal.brand:"hq"});
  if(a==="edit-rem"){const x=byId("reminders",id);return x&&remModal(Object.assign({},x))}
  if(a==="new-out")return outModal();
  if(a==="edit-out"){const x=byId("outreach",id);return x&&outModal(Object.assign({},x))}
  if(a==="letter-out"){const x=byId("outreach",id);return x&&letterModal(x)}
  if(a==="view-receipt")return viewReceipt(id);
  if(a==="export")return exportCSV();
  if(a==="publish")return publishSite(t);
  if(a==="edit-contact")return contactModal();
  if(a==="edit-brand")return brandModal(id);
});
document.addEventListener("change",async e=>{
  const t=e.target;if(!S.isAdmin)return;
  if(t.dataset.act==="toggle-rem"){const x=byId("reminders",t.dataset.id);if(x){const o=Object.assign({},x);delete o.id;o.done=t.checked;await save("reminders",x.id,o)}}
  if(t.dataset.act==="out-status"){const x=byId("outreach",t.dataset.id);if(x){const o=Object.assign({},x);delete o.id;o.status=t.value;if(await save("outreach",x.id,o))toast("Status updated")}}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#modal").innerHTML)closeModal()});

/* ---------- firebase sign in (GitHub version) ---------- */
async function fbAuth(form,mode){
  const m=$("#authMsg"),o=formObj(form);m.textContent=mode==="up"?"Creating your account…":"Signing in…";
  try{
    if(mode==="up"){const c=await firebase.auth().createUserWithEmailAndPassword(o.email,o.password);
      await S.db.doc("memberlog/"+c.user.uid).set({email:o.email,joinedAt:new Date().toISOString()});}
    else await firebase.auth().signInWithEmailAndPassword(o.email,o.password);
  }catch(e){const c=e&&e.code||"";m.textContent=/wrong-password|invalid-credential|user-not-found/.test(c)?"That email and password don't match. Try again or reset your password.":/email-already/.test(c)?"An account with that email already exists. Sign in instead.":/weak-password/.test(c)?"Use a password with at least 6 characters.":"Couldn't sign in. Check your connection and try again."}
}
async function fbReset(){
  const em=$("#a-email"),m=$("#authMsg");if(!em||!em.value){if(m)m.textContent="Type your email above first.";return}
  try{await firebase.auth().sendPasswordResetEmail(em.value);m.textContent="Check your email for a reset link."}catch(e){m.textContent="Couldn't send a reset email. Check the address."}
}

/* ---------- boot ---------- */
$("#logoNav").src=LOGO;
$("#yr").textContent=new Date().getFullYear();
route();render();
(async()=>{
  if(BACKEND==="firebase"){
    const cfg=window.FIREBASE_CONFIG;
    if(!(window.firebase&&cfg&&cfg.apiKey&&!/YOUR_/.test(cfg.apiKey))){S.authChecked=true;render();return}
    try{firebase.initializeApp(cfg);S.db=firebase.firestore();S.fbReady=true}catch(e){S.authChecked=true;render();return}
    subscribePublic();
    let started=false;
    firebase.auth().onAuthStateChanged(async u=>{
      if(started&&!u){location.hash="#home";location.reload();return}
      if(!u){S.authChecked=true;render();return}
      started=true;S.signedIn=true;S.uid=u.uid;S.email=u.email||"";
      let a={};try{const d=await S.db.doc("access/"+u.uid).get();a=d.exists?d.data():{}}catch(e){}
      S.isAdmin=a.role==="founder";S.authChecked=true;
      if(S.isAdmin)subscribeFounder();else subscribeMember();
      if(S.route==="signin")location.hash=S.isAdmin?"#team":"#portal";
      render();
    });
    return;
  }
  let user=null;
  try{user=await cu("user")}catch(e){}
  S.userCap=user;
  if(user){
    try{S.isAdmin=!!(await user.isOwner())}catch(e){}
    try{S.uid=await user.id()}catch(e){}
  }
  S.signedIn=!!S.uid;
  try{S.db=await cu("db")}catch(e){}
  if(S.db&&S.uid){if(S.isAdmin)subscribeFounder();else subscribeMember()}
  S.authChecked=true;
  render();
})();
})();
</script>

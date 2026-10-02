
/* ---------- team (back office) ---------- */
const TEAM_TABS=[["team","Dashboard"],["team-time","Timesheet"],["team-cal","Calendar"],["team-rem","Reminders"],["team-out","Collabs"],["team-people","Teams"],["team-docs","Documents"],["team-reports","Reports"],["team-vault","Private notes"],["team-site","Site settings"]];
function teamGate(){
  if(!S.authChecked)return '<div class="wrap gate"><h1>Checking access…</h1><p class="muted">One moment while we confirm who is signed in.</p></div>';
  return '<div class="wrap gate"><div class="eyebrow">Grooveville team</div><h1>Back office sign in</h1><p class="muted">The timesheet, private calendar, reminders and collab tracker are only for the Grooveville team. Open this page while signed in to Claude with the account Grooveville invited as an Editor.</p><p class="muted" style="font-size:13.5px">If you just got access, reload this page.</p><a class="btn" href="#home">Back to the public site</a></div>';
}
function teamShell(tab,body){
  const dirty=isDirty();
  const ready=["ledger","events","reminders","outreach","site"].every(k=>S.loaded[k]);
  return '<section class="teamhead"><div class="wrap"><div class="eyebrow">Grooveville LLC · Back office</div><h1>'+esc((TEAM_TABS.find(t=>t[0]===tab)||[])[1]||"Dashboard")+'</h1>'+
    (dirty?'<div class="banner warn">You have changes to public events or company pages that visitors can\'t see yet.<button class="btn peach sm" data-act="publish">Publish to public site</button></div>':'')+
    '<nav class="tabs">'+TEAM_TABS.map(([h,l])=>'<a href="#'+h+'"'+(h===tab?' class="on"':'')+'>'+l+'</a>').join("")+'</nav></div></section>'+
    '<section class="tsec"><div class="wrap">'+(ready?body:'<div class="empty">Loading your records…</div>')+'</div></section>';
}
function monthStats(brand,month){
  const L=ledgerAll().filter(l=>(!brand||l.brand===brand)&&String(l.date).startsWith(month));
  const h=L.filter(l=>l.type==="meeting"||l.type==="hours").reduce((a,l)=>a+(Number(l.hours)||0),0);
  const sp=L.filter(l=>l.type==="expense"||l.type==="receipt").reduce((a,l)=>a+(Number(l.amount)||0),0);
  const inc=L.filter(l=>l.type==="income").reduce((a,l)=>a+(Number(l.amount)||0),0);
  const ev=S.events.filter(e=>(!brand||e.brand===brand)&&String(e.date).startsWith(month)).length;
  const pay=L.filter(l=>l.type==="income"&&(l.source||"Payment")==="Payment").reduce((a,l)=>a+(Number(l.amount)||0),0);
  const don=L.filter(l=>l.type==="income"&&l.source==="Donation").reduce((a,l)=>a+(Number(l.amount)||0),0);
  return {h,sp,inc,ev,pay,don,other:inc-pay-don,n:L.length};
}
function remindersDue(days){
  const t=today(), lim=addDays(t,days);
  const r=S.reminders.filter(x=>!x.done&&x.date<=lim).map(x=>Object.assign({kind:"rem"},x));
  S.events.forEach(e=>{if(e.remindDays===""||e.remindDays==null)return;const from=addDays(e.date,-Number(e.remindDays));
    if(e.date>=t&&from<=lim)r.push({kind:"event",id:e.id,title:e.title,brand:e.brand,date:e.date,time:e.start,from})});
  return sortBy(r,x=>x.date+(x.time||""));
}
function remRow(r,showCheck){
  const t=today(), over=r.date<t&&!r.done;
  return '<div class="rem'+(r.done?" done":"")+'" style="'+cvar(r.brand)+'">'+
    (r.kind==="event"?'<span class="pill pub" style="margin-top:2px">Event</span>':'<input type="checkbox" data-act="toggle-rem" data-id="'+esc(r.id)+'" aria-label="Mark done"'+(r.done?" checked":"")+'>')+
    '<div style="min-width:0"><div class="rt">'+esc(r.title)+'</div><div class="rm">'+chip(r.brand)+'<span class="mono">'+fmtDate(r.date)+(r.time?" · "+fmtTime(r.time):"")+'</span>'+
    (over?'<span class="pill over">Overdue</span>':'')+(r.priority==="high"?'<span class="pill high">Important</span>':'')+
    (r.notes?'<span>'+esc(r.notes)+'</span>':'')+'</div></div>'+
    '<button class="rowbtn" data-act="'+(r.kind==="event"?"edit-event":"edit-rem")+'" data-id="'+esc(r.id)+'">Edit</button></div>';
}
function viewDash(){
  const mo=today().slice(0,7), tot=monthStats(null,mo), due=remindersDue(14);
  const t=today();
  const nextFor=id=>{const e=sortBy(S.events.filter(x=>x.brand===id&&x.date>=t),x=>x.date+(x.start||""))[0];const r=sortBy(S.reminders.filter(x=>x.brand===id&&!x.done&&x.date>=t),x=>x.date)[0];
    const c=[e&&{d:e.date,s:"Event: "+e.title},r&&{d:r.date,s:"Reminder: "+r.title}].filter(Boolean).sort((a,b)=>a.d<b.d?-1:1)[0];return c?esc(c.s)+' · <span class="mono">'+fmtDate(c.d)+'</span>':'Nothing scheduled'};
  const upEv=sortBy(S.events.filter(e=>e.date>=t),e=>e.date+(e.start||"")).slice(0,6);
  return '<div class="kpis"><div class="kpi"><span class="eyebrow">Hours · '+MON[new Date().getMonth()]+'</span><b>'+hrs(tot.h)+'</b></div><div class="kpi"><span class="eyebrow">Money spent</span><b class="neg">'+money(tot.sp)+'</b></div><div class="kpi"><span class="eyebrow">Money in</span><b class="pos">'+money(tot.inc)+'</b></div><div class="kpi"><span class="eyebrow">Reminders due (14 days)</span><b>'+due.length+'</b></div></div>'+
    '<div class="sechead" style="margin-bottom:12px"><h2 style="font-size:24px">Every slot · '+MONTHS[new Date().getMonth()]+'</h2><button class="btn olive sm" data-act="new-entry">+ Log entry</button></div>'+
    '<div class="slots">'+BRANDS.map(b=>{const s=monthStats(b.id,mo);return '<div class="slot" style="'+cvar(b.id)+'"><h4>'+esc(brandInfo(b.id).name)+'</h4><div class="nums"><div><small>Hours</small><span>'+hrs(s.h)+'</span></div><div><small>Spent</small><span>'+money(s.sp).replace(".00","")+'</span></div><div><small>Events</small><span>'+s.ev+'</span></div></div>'+moneyIn(s,b.id)+'<div class="next">'+nextFor(b.id)+'</div><div class="acts"><button class="btn sm" style="background:var(--c);color:var(--bg)" data-act="new-entry" data-brand="'+b.id+'">+ Log</button><button class="btn ghost sm" data-act="slot-ts" data-brand="'+b.id+'">Timesheet</button><button class="btn ghost sm" data-act="new-event" data-brand="'+b.id+'">+ Event</button></div></div>'}).join("")+'</div>'+
    '<div class="cols2" style="margin-top:28px"><div style="min-width:0"><div class="sechead" style="margin-bottom:12px"><h2 style="font-size:22px">Upcoming events</h2><a class="btn ghost sm" href="#team-cal">Calendar</a></div>'+(upEv.length?'<div class="evlist">'+upEv.map(e=>evRow(e,{team:true})).join("")+'</div>':'<div class="empty">No events yet. <button class="btn ghost sm" data-act="new-event">+ Add the first event</button></div>')+'</div>'+
    '<div style="min-width:0"><div class="sechead" style="margin-bottom:12px"><h2 style="font-size:22px">Coming up & overdue</h2><button class="btn ghost sm" data-act="new-rem">+ Reminder</button></div>'+(due.length?due.slice(0,8).map(r=>remRow(r)).join(""):'<div class="empty">Nothing due in the next two weeks.</div>')+'</div></div>';
}

function moneyIn(s,id){return '<div class="moneyin"><div><small>Money in</small><b class="pos mono">'+money(s.inc)+'</b></div><span>Payments '+money(s.pay).replace(".00","")+' · Donations '+money(s.don).replace(".00","")+(s.other>0?' · Other '+money(s.other).replace(".00",""):'')+'</span><button class="btn ghost sm" data-act="new-income" data-brand="'+id+'">+ Money in</button></div>'}
function viewTimesheet(){
  const f=S.ts, allowed=S.isAdmin?BRANDS.map(b=>b.id):S.myBrands;
  if(f.brand!=="all"&&!allowed.includes(f.brand))f.brand="all";
  const L=sortBy(ledgerAll().filter(l=>allowed.includes(l.brand)&&(f.brand==="all"||l.brand===f.brand)&&String(l.date).startsWith(f.month)&&(f.type==="all"||l.type===f.type)),l=>l.date+(l.start||"")).reverse();
  let H=0,SP=0,IN=0;
  const rows=L.map(l=>{
    const isMoney=["expense","receipt","income"].includes(l.type), amt=Number(l.amount)||0;
    if(l.type==="meeting"||l.type==="hours")H+=Number(l.hours)||0;
    if(l.type==="expense"||l.type==="receipt")SP+=amt; if(l.type==="income")IN+=amt;
    return '<tr><td class="mono" style="white-space:nowrap">'+fmtDate(l.date)+'</td><td>'+chip(l.brand)+'</td><td><span class="typ '+l.type+'">'+TL[l.type]+'</span></td>'+
      '<td style="min-width:200px"><b style="font-weight:600">'+esc(l.title||"")+'</b>'+(l.type==="income"&&l.source?' <span class="pill pub">'+esc(l.source)+'</span>':'')+(S.isAdmin&&l._by?'<div class="muted" style="font-size:12px">Logged by '+esc(memberName(l._by))+'</div>':'')+(l.vendor?'<div class="muted" style="font-size:13px">'+esc(l.vendor)+(l.category?" · "+esc(l.category):"")+'</div>':(l.category?'<div class="muted" style="font-size:13px">'+esc(l.category)+'</div>':''))+(l.notes?'<div class="muted" style="font-size:13px">'+esc(l.notes)+'</div>':'')+'</td>'+
      '<td class="num">'+(l.start?fmtTime(l.start)+(l.end?"–"+fmtTime(l.end):""):"")+'</td><td class="num">'+(l.hours?hrs(l.hours):"")+'</td>'+
      '<td class="num '+(l.type==="income"?"pos":isMoney?"neg":"")+'">'+(isMoney?(l.type==="income"?"+":"−")+money(amt):"")+'</td>'+
      '<td>'+(l.hasImage?'<button class="rowbtn" data-act="view-receipt" data-id="'+esc(l.id)+'">View photo</button>':(l.receiptNo?'<span class="mono" style="font-size:12.5px">#'+esc(l.receiptNo)+'</span>':''))+'</td>'+
      '<td><button class="rowbtn" data-act="edit-entry" data-id="'+esc(l.id)+'">Edit</button></td></tr>';
  }).join("");
  const bt='<div class="brandtabs"><button data-act="ts-brand" data-v="all" class="'+(f.brand==="all"?"on":"")+'">'+(S.isAdmin?"All slots":"All my slots")+'</button>'+BRANDS.filter(b=>allowed.includes(b.id)).map(b=>'<button data-act="ts-brand" data-v="'+b.id+'" style="'+cvar(b.id)+'" class="'+(f.brand===b.id?"on":"")+'">'+esc(brandInfo(b.id).name)+'</button>').join("")+'</div>';
  const seg='<div class="seg" role="group" aria-label="Entry type">'+[["all","All"]].concat(TYPES.map(t=>[t.id,t.label])).map(([v,l])=>'<button data-act="ts-type" data-v="'+v+'" class="'+(f.type===v?"on":"")+'">'+l+'</button>').join("")+'</div>';
  return bt+'<div class="toolbar"><label class="f" style="flex-direction:row;align-items:center;gap:8px"><span>Month</span><input class="i" type="month" id="ts-month" value="'+f.month+'" style="width:auto"></label>'+seg+'<span class="sp"></span><button class="btn ghost sm" data-act="export">Export CSV</button><button class="btn olive sm" data-act="new-entry"'+(f.brand!=="all"?' data-brand="'+f.brand+'"':'')+'>+ New entry</button></div>'+
    (L.length?'<div class="tablewrap"><table class="t"><thead><tr><th>Date</th><th>Slot</th><th>Type</th><th>What</th><th class="num">Time</th><th class="num">Hours</th><th class="num">Amount</th><th>Receipt</th><th></th></tr></thead><tbody>'+rows+'</tbody>'+
    '<tfoot><tr><td colspan="5">Totals · '+L.length+' entries</td><td class="num">'+hrs(H)+'</td><td class="num" colspan="3">Spent '+money(SP)+' · In '+money(IN)+' · Net <span class="'+(IN-SP<0?"neg":"pos")+'">'+money(IN-SP)+'</span></td></tr></tfoot></table></div>'
    :'<div class="empty">No entries for '+MONTHS[Number(f.month.slice(5))-1]+' yet. Log meetings, work hours, money spent, receipts and money in with “+ New entry”.</div>');
}

function viewReminders(){
  const t=today(), wk=addDays(t,7);
  const open=sortBy(S.reminders.filter(r=>!r.done),r=>r.date+(r.time||""));
  const g=[["Overdue",open.filter(r=>r.date<t)],["Today",open.filter(r=>r.date===t)],["Next 7 days",open.filter(r=>r.date>t&&r.date<=wk)],["Later",open.filter(r=>r.date>wk)]];
  const evr=remindersDue(3650).filter(r=>r.kind==="event"&&r.from<=t);
  const done=sortBy(S.reminders.filter(r=>r.done),r=>r.date).reverse().slice(0,10);
  return '<div class="toolbar"><p class="muted" style="max-width:64ch">Reminders for deadlines, payments, launches and anything else coming up. Events with a reminder set also appear here when their reminder window opens. Use “Add to Google Calendar” on any reminder to get a phone alert.</p><span class="sp"></span><button class="btn olive sm" data-act="new-rem">+ New reminder</button></div>'+
    (evr.length?'<div class="remgroup"><h4>From the calendar</h4>'+evr.map(r=>remRow(r)).join("")+'</div>':'')+
    g.map(([h,a])=>a.length?'<div class="remgroup"><h4>'+h+' · '+a.length+'</h4>'+a.map(r=>remRow(r)).join("")+'</div>':'').join("")+
    (!open.length&&!evr.length?'<div class="empty">No open reminders. Add important dates like filing deadlines, rent, launches and event prep.</div>':'')+
    (done.length?'<div class="remgroup" style="margin-top:28px"><h4>Done recently</h4>'+done.map(r=>remRow(r)).join("")+'</div>':'');
}

function viewOutreach(){
  const L=sortBy(S.outreach,o=>o.created||"").reverse();
  return '<div class="toolbar"><p class="muted" style="max-width:64ch">Official collaboration outreach from Grooveville and its companies. Create an invitation to get a formal, reference-numbered letter you can copy into an email, then track where each one stands.</p><span class="sp"></span><button class="btn olive sm" data-act="new-out">+ New invitation</button></div>'+
    (L.length?'<div class="tablewrap"><table class="t"><thead><tr><th>Date</th><th>Ref</th><th>Company</th><th>Organization</th><th>Type</th><th>Direction</th><th>Status</th><th></th></tr></thead><tbody>'+
    L.map(o=>'<tr><td class="mono" style="white-space:nowrap">'+fmtDate(o.created)+'</td><td class="mono" style="font-size:12.5px;white-space:nowrap">'+esc(o.ref)+'</td><td>'+chip(o.brand)+'</td><td><b style="font-weight:600">'+esc(o.org)+'</b>'+(o.contact?'<div class="muted" style="font-size:13px">'+esc(o.contact)+'</div>':'')+'</td><td>'+esc(o.type||"")+'</td><td>'+(o.direction==="incoming"?"Incoming":"Outgoing")+'</td>'+
      '<td><select class="i" style="padding:5px 8px;font-size:13.5px;width:auto" data-act="out-status" data-id="'+esc(o.id)+'" aria-label="Status">'+STATUSES.map(([v,l])=>'<option value="'+v+'"'+(o.status===v?" selected":"")+'>'+l+'</option>').join("")+'</select></td>'+
      '<td style="white-space:nowrap"><button class="rowbtn" data-act="letter-out" data-id="'+esc(o.id)+'">Letter</button><button class="rowbtn" data-act="edit-out" data-id="'+esc(o.id)+'">Edit</button></td></tr>').join("")+'</tbody></table></div>'
    :'<div class="empty">No collaborations tracked yet. Start with “+ New invitation”, or save requests that come in through the public Collaborate page.</div>');
}

function viewSite(){
  const s=S.site||{};
  return '<div class="cols2"><div style="display:flex;flex-direction:column;gap:18px;min-width:0">'+
    '<div class="card"><div class="sechead" style="margin-bottom:8px"><h3 style="font-size:20px">Official contact</h3><button class="btn ghost sm" data-act="edit-contact">Edit</button></div>'+
    '<p class="muted" style="font-size:14px">Shown on the Collaborate page and signed on official invitations.</p><dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:12px 0 0"><dt class="muted">Email</dt><dd style="margin:0">'+(s.contactEmail?esc(s.contactEmail):'<span class="muted">Not set</span>')+'</dd><dt class="muted">Signed by</dt><dd style="margin:0">'+(s.signer?esc(s.signer):'<span class="muted">The Grooveville Team</span>')+'</dd></dl></div>'+
    '<div class="card"><h3 style="font-size:20px;margin-bottom:6px">Company pages</h3><p class="muted" style="font-size:14px;margin-bottom:12px">Each company gets its own public homepage. Add a website link to send visitors to a company\'s own site.</p>'+
    BRANDS.map(b=>{const i=brandInfo(b.id);return '<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--line)">'+(i.logo?'<img class="blogo" src="'+esc(i.logo)+'" alt="">':'<div class="blogo" style="display:grid;place-items:center;font-size:11px;color:var(--muted)">No logo</div>')+'<div style="min-width:0;flex:1">'+chip(b.id)+'<div class="muted" style="font-size:13px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(i.website?esc(i.website):i.social?esc(i.social):'General page · no website linked')+'</div></div><a class="rowbtn" href="#b-'+b.id+'">View</a><button class="btn ghost sm" data-act="edit-brand" data-id="'+b.id+'">Edit</button></div>'}).join("")+'</div></div>'+
    (BACKEND==="firebase"?'<aside class="card" style="align-self:start"><h3 style="font-size:20px">Public site</h3><p class="muted" style="font-size:14px;margin-top:8px">Public events and company pages update for visitors as soon as you save. Private events, timesheets, reminders and collabs stay locked behind sign in.</p></aside></div>':'')+(BACKEND==="firebase"?'':'<aside class="card" style="align-self:start;display:flex;flex-direction:column;gap:10px"><h3 style="font-size:20px">Public site</h3><p class="muted" style="font-size:14px">Visitors see a published copy of your public events and company pages. Private events, the timesheet, reminders and collabs are never published.</p>'+
    '<p style="font-size:14px">Last published: <b>'+(SNAP.publishedAt?esc(new Date(SNAP.publishedAt).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})):"never")+'</b></p>'+
    (isDirty()?'<span class="pill high" style="align-self:flex-start">Unpublished changes</span>':'<span class="pill pub" style="align-self:flex-start">Up to date</span>')+
    '<button class="btn teal" data-act="publish"'+(isDirty()?'':' disabled')+'>Publish to public site</button><p class="muted" style="font-size:12.5px">Publishing reloads this page for everyone who has it open.</p></aside></div>');
}

function personOpts(exclude){
  const ids=[...new Set(Object.keys(S.requests).concat(Object.keys(S.members)))].filter(u=>!exclude.includes(u)&&u!==S.org.founder);
  return ids.map(u=>'<option value="'+esc(u)+'">'+esc(memberName(u))+'</option>').join("");
}
function viewTeams(){
  const mb=manageBrands(), founder=S.isAdmin;
  if(!S.loaded.org)return '<div class="empty">Loading teams…</div>';
  const pending=[];
  Object.entries(S.requests).forEach(([u,r])=>{(r.brands||[]).forEach(b=>{if(!mb.includes(b)||u===S.uid)return;const g=grantFor(u,b);if(!g&&!headsOf(b).includes(u))pending.push({u,b,at:r.joinedAt})})});
  const intro='<p class="muted" style="max-width:70ch;margin-bottom:18px">'+(founder?'People ask to join a company team from the Sign in page. You or that company\'s head can approve them. Approved people get a private timesheet for that company. Company heads can approve and manage their own team only.':'You head '+mb.map(b=>esc(brandInfo(b).name)).join(", ")+'. Approve people who ask to join, or add someone who already has an account. Team members can log time, money spent and money in for your company.')+
    (BACKEND==="claude"?' New people need this page shared with them as a Contributor (“Can use”) before they can ask to join.':' New people create an account on the Sign in page, then ask to join.')+'</p>';
  const reqHtml='<h2 style="font-size:22px;margin-bottom:10px">Join requests'+(pending.length?' <span class="pill high" style="vertical-align:middle">'+pending.length+' waiting</span>':'')+'</h2>'+
    (pending.length?'<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:28px">'+sortBy(pending,p=>p.at||"").map(p=>'<div class="rem" style="'+cvar(p.b)+';grid-template-columns:minmax(0,1fr) auto;align-items:center"><div style="min-width:0"><div class="rt">'+esc(memberName(p.u))+'</div><div class="rm">wants to join '+chip(p.b)+(p.at?'<span>'+esc(fmtDate(String(p.at).slice(0,10)))+'</span>':'')+'</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" data-act="decline" data-u="'+esc(p.u)+'" data-b="'+p.b+'">Decline</button><button class="btn olive sm" data-act="approve" data-u="'+esc(p.u)+'" data-b="'+p.b+'">Approve</button></div></div>').join("")+'</div>'
    :'<div class="empty" style="margin-bottom:28px">No one is waiting to join'+(founder?'':' your team')+' right now.</div>');
  const teams='<h2 style="font-size:22px;margin-bottom:10px">'+(founder?'Teams':'Your team')+'</h2><div class="slots">'+mb.map(b=>{
    const team=teamOf(b), heads=headsOf(b);
    return '<div class="slot" style="'+cvar(b)+'"><h4>'+esc(brandInfo(b).name)+'</h4>'+
      (founder?'<div style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="font-size:11px">Company head</span>'+(heads.length?heads.map(u=>'<div style="display:flex;gap:6px;align-items:center"><span class="pill pub">Head</span><span style="flex:1;min-width:0;overflow-wrap:anywhere">'+esc(memberName(u))+'</span><button class="rowbtn" data-act="head-rm" data-u="'+esc(u)+'" data-b="'+b+'">Remove</button></div>').join(""):'<span class="muted" style="font-size:13px">No head yet</span>')+
        '<div style="display:flex;gap:6px"><select class="i" style="padding:5px 8px;font-size:13px" id="head-'+b+'" aria-label="Choose a company head"><option value="">Choose a person…</option>'+personOpts(heads)+'</select><button class="btn ghost sm" data-act="head-add" data-b="'+b+'">Make head</button></div></div>':'')+
      '<div style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="font-size:11px">Members · '+team.length+'</span>'+(team.length?team.map(u=>'<div style="display:flex;gap:6px;align-items:center"><span style="flex:1;min-width:0;overflow-wrap:anywhere">'+esc(memberName(u))+(heads.includes(u)?' <span class="pill pub">Head</span>':'')+'</span>'+(heads.includes(u)?'':'<button class="rowbtn" data-act="team-rm" data-u="'+esc(u)+'" data-b="'+b+'">Remove</button>')+'</div>').join(""):'<span class="muted" style="font-size:13px">No members yet</span>')+'</div>'+
      '<div style="display:flex;gap:6px;margin-top:auto"><select class="i" style="padding:5px 8px;font-size:13px" id="add-'+b+'" aria-label="Add a person"><option value="">Add a person…</option>'+personOpts(team)+'</select><button class="btn sm" style="background:var(--c);color:var(--bg)" data-act="team-add" data-b="'+b+'">Add</button></div></div>'}).join("")+'</div>';
  return intro+reqHtml+teams;
}
function viewMyTeam(){
  return '<section class="teamhead"><div class="wrap"><div class="eyebrow">Company head · Private</div><h1>My team</h1>'+portalTabs("portal-team")+'</div></section><section class="tsec"><div class="wrap">'+viewTeams()+'</div></section>';
}
const portalTabs=cur=>isHead()?'<nav class="tabs"><a href="#portal"'+(cur==="portal"?' class="on"':'')+'>My timesheet</a><a href="#portal-team"'+(cur==="portal-team"?' class="on"':'')+'>My team</a></nav>':'';
function joinPicker(){
  const r=S.myReq||{}, asked=r.brands||[];
  return '<div class="card" style="width:100%;max-width:560px;text-align:left;display:flex;flex-direction:column;gap:12px"><b>Which team do you want to join?</b><div class="brandtabs" style="margin:0">'+BRANDS.map(b=>{const g=grantFor(S.uid,b.id),st=S.myBrands.includes(b.id)?"Joined":g&&g.status==="declined"?"Declined":asked.includes(b.id)?"Waiting":"";
    return '<label class="chip" style="'+cvar(b.id)+';cursor:pointer;padding:6px 10px"><input type="checkbox" name="jb" value="'+b.id+'"'+(asked.includes(b.id)||S.myBrands.includes(b.id)?' checked':'')+(S.myBrands.includes(b.id)?' disabled':'')+' style="accent-color:var(--c)"> '+esc(brandInfo(b.id).name)+(st?' · '+st:'')+'</label>'}).join("")+'</div><button class="btn olive" data-act="request-join" style="align-self:flex-start">'+(asked.length?'Update my request':'Ask to join')+'</button></div>';
}
function viewSignin(){
  let body;
  if(!S.authChecked)body='<h1>Checking sign in…</h1><p class="muted">One moment.</p>';
  else if(S.isAdmin)body='<div class="eyebrow">Signed in · Founder</div><h1>Welcome back</h1><p class="muted">You have full access to the back office: every timesheet, calendar, reminder and collab.</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn olive" href="#team">Open back office</a>'+(BACKEND==="firebase"?'<button class="btn ghost" data-act="signout">Sign out</button>':'')+'</div>';
  else if(isMember())body='<div class="eyebrow">Signed in · '+(isHead()?'Company head':'Team member')+'</div><h1>Your timesheet is ready</h1><p class="muted">You can log time, money spent and money in for '+S.myBrands.map(b=>esc(brandInfo(b).name)).join(", ")+'.'+(isHead()?' As a company head you can also approve people for your team.':'')+'</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn olive" href="#portal">Open my timesheet</a>'+(isHead()?'<a class="btn ghost" href="#portal-team">My team</a>':'')+(BACKEND==="firebase"?'<button class="btn ghost" data-act="signout">Sign out</button>':'')+'</div><p class="muted" style="font-size:13.5px">Want to join another company team?</p>'+joinPicker();
  else if(S.signedIn&&S.db){
    const asked=(S.myReq&&S.myReq.brands)||[];
    body=(asked.length?'<div class="eyebrow">Request sent</div><h1>Waiting for approval</h1><p class="muted">The company head or the founder will approve you. This page updates on its own once you\'re in.</p>':'<div class="eyebrow">Grooveville team</div><h1>Join a company team</h1><p class="muted">Pick the Grooveville company you work with. Once the company head or the founder approves you, you\'ll get a private timesheet here.</p>')+joinPicker()+(BACKEND==="firebase"?'<button class="btn ghost" data-act="signout">Sign out</button>':'');
  }
  else if(BACKEND==="firebase"){
    body=!S.fbReady?'<h1>Sign in isn\'t set up yet</h1><p class="muted">Add your Firebase settings to firebase-config.js (see README) to turn on team sign in.</p>':
      '<div class="eyebrow">Grooveville team portal</div><h1>Sign in</h1><form id="authForm" class="card" style="display:flex;flex-direction:column;gap:12px;text-align:left;width:100%;max-width:380px"><label class="f">Email<input class="i" type="email" id="a-email" name="email" autocomplete="email" required></label><label class="f">Password<input class="i" type="password" id="a-pass" name="password" autocomplete="current-password" minlength="6" required></label><button class="btn olive" type="submit" data-mode="in">Sign in</button><button class="btn ghost" type="submit" data-mode="up">Create team account</button><button class="rowbtn" type="button" data-act="reset-pass" style="align-self:center">Forgot password?</button><p id="authMsg" class="muted" style="font-size:13px;text-align:center" aria-live="polite"></p></form>';
  }
  else body='<div class="eyebrow">Grooveville team portal</div><h1>Sign in</h1><p class="muted">The back office and team timesheets use your Claude account. Open this page while signed in to Claude. If you\'re on the team, ask the founder to share the page with you as a Contributor (“Can use”), then come back here.</p><p class="muted" style="font-size:13.5px">Just got access? Reload this page.</p>';
  return '<div class="wrap gate">'+body+'<a href="#home" class="rowbtn">Back to the public site</a></div>';
}
function viewPortal(){
  if(!isMember())return viewSignin();
  const mo=today().slice(0,7);
  const slots='<div class="slots" style="margin-bottom:24px">'+S.myBrands.map(id=>{const s=monthStats(id,mo);return '<div class="slot" style="'+cvar(id)+'"><h4>'+esc(brandInfo(id).name)+'</h4><div class="nums"><div><small>Hours</small><span>'+hrs(s.h)+'</span></div><div><small>Spent</small><span>'+money(s.sp).replace(".00","")+'</span></div><div><small>Entries</small><span>'+s.n+'</span></div></div>'+moneyIn(s,id)+'<div class="acts"><button class="btn sm" style="background:var(--c);color:var(--bg)" data-act="new-entry" data-brand="'+id+'">+ Log</button></div></div>'}).join("")+'</div>';
  return '<section class="teamhead"><div class="wrap"><div class="eyebrow">Grooveville team · Private</div><h1>My timesheet</h1><p class="muted" style="margin-top:6px">Only you and the founder can see these entries.</p>'+portalTabs("portal")+'</div></section><section class="tsec"><div class="wrap">'+slots+viewTimesheet()+'</div></section>';
}

/* ---------- private notes (encrypted in the browser) ---------- */
const u8b64=u=>{let s="";u.forEach(c=>s+=String.fromCharCode(c));return btoa(s)};
const b64u8=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
async function vDerive(pass,salt){const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function vEnc(key,obj){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(obj)));return {iv:u8b64(iv),ct:u8b64(new Uint8Array(ct))}}
async function vDec(key,row){const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64u8(row.iv)},key,b64u8(row.ct));return JSON.parse(new TextDecoder().decode(pt))}
async function decryptVault(){const out={};for(const r of S.vault){try{out[r.id]=await vDec(S.vkey,r)}catch(e){out[r.id]={title:"(couldn't unlock this note)"}}}S.vplain=out;scheduleRender(true)}
let vTimer;
function viewVault(){
  if(!window.crypto||!crypto.subtle)return '<div class="empty">Private notes need a secure browser connection (https).</div>';
  if(!S.loaded.vault)return '<div class="empty">Loading…</div>';
  const lockIcon='<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--olive)" stroke-width="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  if(!S.vaultMeta)return '<div class="card gate" style="margin:0 auto">'+lockIcon+'<h2 style="font-size:26px">Set up your private notes</h2><p class="muted">A place for passwords, log ins and account details. Everything is locked with a passphrase that only you know. It is encrypted in your browser before it is saved, so not even the database can read it.</p><p class="muted" style="font-size:13.5px">During setup you\'ll add your recovery emails and phone number. You\'ll get a recovery code to send to them, so you can reset the passphrase if you forget it.</p><button class="btn olive" data-act="vault-setup">Set up private notes</button></div>';
  if(!S.vkey)return '<div class="card gate" style="margin:0 auto">'+lockIcon+'<h2 style="font-size:26px">Private notes are locked</h2><p class="muted">'+S.vault.length+' saved '+(S.vault.length===1?"note":"notes")+'. Enter your passphrase to open them. They lock again after 20 minutes or when you leave the page.</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button class="btn olive" data-act="vault-unlock">Unlock</button>'+(S.vaultMeta.v===2?'<button class="btn ghost" data-act="vault-forgot">Forgot passphrase?</button>':'')+'</div></div>';
  const items=sortBy(S.vault.map(r=>Object.assign({id:r.id},S.vplain[r.id]||{})),x=>(x.title||"").toLowerCase());
  return '<div class="toolbar"><p class="muted" style="max-width:62ch">Only you can open these. Encrypted with your passphrase before saving.</p><span class="sp"></span>'+(S.vaultMeta.v===2?'<button class="btn ghost sm" data-act="vault-recovery">Recovery settings</button>':'')+'<button class="btn ghost sm" data-act="vault-lock">Lock now</button><button class="btn olive sm" data-act="vault-new">+ New note</button></div>'+
    (items.length?'<div class="slots">'+items.map(x=>'<div class="card" style="display:flex;flex-direction:column;gap:8px;min-width:0"><div style="display:flex;gap:8px;align-items:center"><b style="font-size:16px;flex:1;min-width:0;overflow-wrap:anywhere">'+esc(x.title||"Untitled")+'</b><button class="rowbtn" data-act="vault-edit" data-id="'+esc(x.id)+'">Edit</button></div>'+
      (x.user?'<div style="display:flex;gap:8px;align-items:center;font-size:14px"><span class="muted" style="width:72px;flex:none">Log in</span><span class="mono" style="flex:1;min-width:0;overflow-wrap:anywhere">'+esc(x.user)+'</span><button class="rowbtn" data-act="vault-copy" data-id="'+esc(x.id)+'" data-f="user">Copy</button></div>':'')+
      (x.pass?'<div style="display:flex;gap:8px;align-items:center;font-size:14px"><span class="muted" style="width:72px;flex:none">Password</span><span class="mono vpass" data-id="'+esc(x.id)+'" style="flex:1;min-width:0;overflow-wrap:anywhere">••••••••</span><button class="rowbtn" data-act="vault-show" data-id="'+esc(x.id)+'">Show</button><button class="rowbtn" data-act="vault-copy" data-id="'+esc(x.id)+'" data-f="pass">Copy</button></div>':'')+
      (x.url?'<a href="'+esc(/^https?:/i.test(x.url)?x.url:"https://"+x.url)+'" target="_blank" rel="noopener" style="font-size:14px;overflow-wrap:anywhere">'+esc(x.url)+' ↗</a>':'')+
      (x.notes?'<p class="muted" style="font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(x.notes)+'</p>':'')+'</div>').join("")+'</div>'
    :'<div class="empty">No notes yet. Add log ins, passwords, account numbers or anything else you want kept private.</div>');
}
/* v2: a random data key encrypts the notes. That key is stored twice, once locked by the passphrase
   and once locked by a one-time recovery code that is sent to the founder's email and phone. */
const RC_ALPH="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newRecoveryCode(){const r=crypto.getRandomValues(new Uint8Array(24));let s="";r.forEach((b,i)=>{s+=RC_ALPH[b%32];if(i%4===3&&i<23)s+="-"});return s}
const normRC=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const importDK=raw=>crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},true,["encrypt","decrypt"]);
async function wrapRaw(secret,salt,raw){const k=await vDerive(secret,salt);const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,raw);return {iv:u8b64(iv),ct:u8b64(new Uint8Array(ct))}}
async function unwrapRaw(secret,saltB64,w){const k=await vDerive(secret,b64u8(saltB64));return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64u8(w.iv)},k,b64u8(w.ct)))}
const maskEmail=e=>{const [u,d]=String(e).split("@");return d?(u.slice(0,1)+"•••@"+d):e};
const maskPhone=p=>{const d=String(p).replace(/\D/g,"");return d.length>=4?"•••-•••-"+d.slice(-4):p};
const contactsOf=()=>((S.vaultMeta&&S.vaultMeta.contacts)||{emails:[],phone:""});
async function unlockWith(raw){S.vraw=raw;S.vkey=await importDK(raw);vTouch();await decryptVault();render()}
function lockVault(){S.vkey=null;S.vraw=null;S.vplain={}}
function vTouch(){clearTimeout(vTimer);vTimer=setTimeout(()=>{lockVault();if(S.route==="team-vault")render()},20*60*1000)}

function vaultSetupModal(){
  openModal('<form id="mf"><h3 style="margin-bottom:6px">Set up private notes</h3><p class="muted" style="font-size:14px;margin-bottom:12px">Choose a passphrase, then add where your recovery code should go. If you ever forget the passphrase, that code lets you reset it.</p><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">Passphrase<input class="i" type="password" id="v-pass" name="p" autocomplete="new-password" minlength="8" required></label>'+
    '<label class="f">Type it again<input class="i" type="password" id="v-pass2" name="p2" autocomplete="new-password" required></label>'+
    '<div class="grid2"><label class="f">Recovery email 1<input class="i" type="email" id="v-em1" name="em1" value="jaja@vybr8.live" required></label><label class="f">Recovery email 2<input class="i" type="email" id="v-em2" name="em2" value="vintagebyjaja@gmail.com"></label></div>'+
    '<label class="f">Mobile number (for a text copy)<input class="i" type="tel" id="v-phone" name="phone" inputmode="tel" placeholder="(555) 555-5555" required></label>'+
    '<p class="muted" style="font-size:13px">Use at least 8 characters for the passphrase. A short sentence works well.</p>'+
    '<p id="v-msg" style="font-size:13.5px;color:var(--bad)" aria-live="polite"></p></div><div class="row"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Create</button></div></form>',
  el=>el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target),msg=el.querySelector("#v-msg"),btn=ev.target.querySelector("button[type=submit]");
    if(o.p!==o.p2){msg.textContent="The two passphrases don't match.";return}
    if(String(o.phone).replace(/\D/g,"").length<10){msg.textContent="Enter a full mobile number, including area code.";return}
    btn.disabled=true;msg.style.color="var(--muted)";msg.textContent="Setting up…";
    try{
      const raw=crypto.getRandomValues(new Uint8Array(32)), saltP=crypto.getRandomValues(new Uint8Array(16)), saltR=crypto.getRandomValues(new Uint8Array(16)), rc=newRecoveryCode();
      const meta={v:2,saltP:u8b64(saltP),wp:await wrapRaw(o.p,saltP,raw),saltR:u8b64(saltR),wr:await wrapRaw(normRC(rc),saltR,raw),
        contacts:{emails:[o.em1,o.em2].filter(Boolean),phone:o.phone},createdAt:new Date().toISOString(),recoveryAt:new Date().toISOString()};
      if(!await save("vault","_meta",meta)){btn.disabled=false;msg.textContent="";return}
      S.vaultMeta=Object.assign({id:"_meta"},meta);await unlockWith(raw);recoveryCodeModal(rc,meta.contacts);
    }catch(e){btn.disabled=false;msg.style.color="var(--bad)";msg.textContent="Couldn't set up private notes. Try again."}
  }));
}
function recoveryCodeModal(rc,c){
  const body="Your Grooveville private notes recovery code:\n\n"+rc+"\n\nKeep this somewhere safe. Use it on the Private notes page (Forgot passphrase?) to choose a new passphrase.";
  const mail="mailto:"+encodeURIComponent((c.emails||[]).join(","))+"?subject="+encodeURIComponent("Grooveville recovery code")+"&body="+encodeURIComponent(body);
  const sms="sms:"+String(c.phone||"").replace(/[^\d+]/g,"")+"?&body="+encodeURIComponent("Grooveville recovery code: "+rc);
  openModal('<h3>Save your recovery code</h3><p class="muted" style="font-size:14px">This code is shown <b>only once</b>. Send it to your email and phone now. Anyone with this code and access to your back office could reset your passphrase, so keep it private.</p>'+
    '<div class="card" style="text-align:center;padding:18px"><div class="mono" id="rc-text" style="font-size:20px;font-weight:600;letter-spacing:.06em;user-select:all;overflow-wrap:anywhere">'+esc(rc)+'</div></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn teal sm" data-act="rc-copy">Copy code</button><a class="btn ghost sm" href="'+esc(mail)+'">Email to '+esc((c.emails||[]).map(maskEmail).join(" & "))+'</a><a class="btn ghost sm" href="'+esc(sms)+'">Text to '+esc(maskPhone(c.phone||""))+'</a></div>'+
    '<p class="muted" style="font-size:12.5px">The email and text buttons open your own email or messages app with the code filled in. Press send there. If they don\'t open, copy the code and send it yourself.</p>'+
    '<label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="rc-ok"> I sent or saved my recovery code</label>'+
    '<div class="row"><button class="btn olive" id="rc-done" disabled data-act="close-modal">Done</button></div>',
  el=>{el._rc=rc;el.querySelector("#rc-ok").addEventListener("change",e=>{el.querySelector("#rc-done").disabled=!e.target.checked})});
}
function vaultPassModal(setup){
  if(setup)return vaultSetupModal();
  const v2=S.vaultMeta&&S.vaultMeta.v===2;
  openModal('<form id="mf"><h3 style="margin-bottom:12px">Unlock private notes</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">Passphrase<input class="i" type="password" id="v-pass" name="p" autocomplete="current-password" required></label>'+
    '<p id="v-msg" style="font-size:13.5px;color:var(--bad)" aria-live="polite"></p></div><div class="row">'+(v2?'<button type="button" class="rowbtn left" data-act="vault-forgot">Forgot passphrase?</button>':'')+'<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Unlock</button></div></form>',
  el=>el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target),msg=el.querySelector("#v-msg"),btn=ev.target.querySelector("button[type=submit]");
    btn.disabled=true;msg.style.color="var(--muted)";msg.textContent="Unlocking…";
    try{
      if(v2){const raw=await unwrapRaw(o.p,S.vaultMeta.saltP,S.vaultMeta.wp);closeModal();await unlockWith(raw)}
      else{const key=await vDerive(o.p,b64u8(S.vaultMeta.salt));const c=await vDec(key,S.vaultMeta);if(c.ok!=="grooveville")throw 0;S.vkey=key;vTouch();closeModal();await decryptVault();render()}
    }catch(e){btn.disabled=false;msg.style.color="var(--bad)";msg.textContent="That passphrase didn't unlock your notes. Try again"+(v2?", or use Forgot passphrase.":".")}
  }));
}
function vaultForgotModal(){
  const c=contactsOf();
  openModal('<form id="mf"><h3 style="margin-bottom:6px">Reset your passphrase</h3><p class="muted" style="font-size:14px;margin-bottom:12px">Find the recovery code you sent to '+esc((c.emails||[]).map(maskEmail).join(" or ")||"your email")+(c.phone?' or texted to '+esc(maskPhone(c.phone)):'')+'. Enter it below with a new passphrase. Your notes stay as they are.</p><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">Recovery code<input class="i mono" id="v-rc" name="rc" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" required></label>'+
    '<label class="f">New passphrase<input class="i" type="password" id="v-np" name="p" autocomplete="new-password" minlength="8" required></label>'+
    '<label class="f">Type it again<input class="i" type="password" id="v-np2" name="p2" autocomplete="new-password" required></label>'+
    '<p id="v-msg" style="font-size:13.5px;color:var(--bad)" aria-live="polite"></p></div><div class="row"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Reset passphrase</button></div></form>',
  el=>el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target),msg=el.querySelector("#v-msg"),btn=ev.target.querySelector("button[type=submit]");
    if(o.p!==o.p2){msg.textContent="The two passphrases don't match.";return}
    btn.disabled=true;msg.style.color="var(--muted)";msg.textContent="Checking your code…";
    let raw;try{raw=await unwrapRaw(normRC(o.rc),S.vaultMeta.saltR,S.vaultMeta.wr)}catch(e){btn.disabled=false;msg.style.color="var(--bad)";msg.textContent="That recovery code didn't match. Check for typos and try again.";return}
    const saltP=crypto.getRandomValues(new Uint8Array(16));
    const meta=Object.assign({},S.vaultMeta,{saltP:u8b64(saltP),wp:await wrapRaw(o.p,saltP,raw),passAt:new Date().toISOString()});delete meta.id;delete meta._col;
    if(await save("vault","_meta",meta)){closeModal();toast("Passphrase reset");await unlockWith(raw)}else btn.disabled=false;
  }));
}
function vaultRecoveryModal(){
  const c=contactsOf();
  openModal('<form id="mf"><h3 style="margin-bottom:6px">Recovery settings</h3><p class="muted" style="font-size:14px;margin-bottom:12px">Where your recovery code goes. Making a new code turns off the old one.</p><div style="display:flex;flex-direction:column;gap:12px">'+
    '<div class="grid2"><label class="f">Recovery email 1<input class="i" type="email" id="r-em1" name="em1" value="'+esc((c.emails||[])[0]||"")+'" required></label><label class="f">Recovery email 2<input class="i" type="email" id="r-em2" name="em2" value="'+esc((c.emails||[])[1]||"")+'"></label></div>'+
    '<label class="f">Mobile number<input class="i" type="tel" id="r-phone" name="phone" value="'+esc(c.phone||"")+'" required></label>'+
    '<p class="muted" style="font-size:13px">'+(S.vaultMeta.recoveryAt?'Current code made '+esc(fmtDate(String(S.vaultMeta.recoveryAt).slice(0,10)))+'.':'')+'</p></div>'+
    '<div class="row"><button type="button" class="btn ghost left" data-act="vault-changepass">Change passphrase</button><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save & make new code</button></div></form>',
  el=>el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();if(!S.vraw){closeModal();return render()}vTouch();const o=formObj(ev.target);
    const saltR=crypto.getRandomValues(new Uint8Array(16)),rc=newRecoveryCode();
    const meta=Object.assign({},S.vaultMeta,{saltR:u8b64(saltR),wr:await wrapRaw(normRC(rc),saltR,S.vraw),contacts:{emails:[o.em1,o.em2].filter(Boolean),phone:o.phone},recoveryAt:new Date().toISOString()});delete meta.id;delete meta._col;
    if(await save("vault","_meta",meta))recoveryCodeModal(rc,meta.contacts);}));
}
function vaultChangePassModal(){
  openModal('<form id="mf"><h3 style="margin-bottom:12px">Change passphrase</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">New passphrase<input class="i" type="password" id="c-np" name="p" autocomplete="new-password" minlength="8" required></label>'+
    '<label class="f">Type it again<input class="i" type="password" id="c-np2" name="p2" autocomplete="new-password" required></label><p id="v-msg" style="font-size:13.5px;color:var(--bad)" aria-live="polite"></p></div>'+
    '<div class="row"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save</button></div></form>',
  el=>el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();if(!S.vraw){closeModal();return render()}const o=formObj(ev.target);
    if(o.p!==o.p2){el.querySelector("#v-msg").textContent="The two passphrases don't match.";return}vTouch();
    const saltP=crypto.getRandomValues(new Uint8Array(16));const meta=Object.assign({},S.vaultMeta,{saltP:u8b64(saltP),wp:await wrapRaw(o.p,saltP,S.vraw),passAt:new Date().toISOString()});delete meta.id;delete meta._col;
    if(await save("vault","_meta",meta)){closeModal();toast("Passphrase changed")}}));
}
function vaultItemModal(d){
  d=d||{};
  openModal('<form id="mf" autocomplete="off"><h3 style="margin-bottom:12px">'+(d.id?"Edit note":"New private note")+'</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">Title<input class="i" id="v-title" name="title" value="'+esc(d.title)+'" required placeholder="Bank login, Instagram, domain registrar…"></label>'+
    '<div class="grid2"><label class="f">Log in / email<input class="i mono" id="v-user" name="user" value="'+esc(d.user)+'" autocomplete="off"></label><label class="f">Password<input class="i mono" type="password" id="v-pw" name="pass" value="'+esc(d.pass)+'" autocomplete="new-password"></label></div>'+
    '<label class="f">Website<input class="i" id="v-url" name="url" value="'+esc(d.url)+'" placeholder="https://"></label>'+
    '<label class="f">Notes<textarea class="i" id="v-notes" name="notes">'+esc(d.notes)+'</textarea></label></div>'+
    '<div class="row">'+delBtn(d.id)+'<button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Save</button></div></form>',
  el=>{
    el._del=async()=>{if(await remove("vault",d.id)){closeModal();toast("Note deleted")}};
    el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();if(!S.vkey){closeModal();return render()}vTouch();
      const o=formObj(ev.target);const id=d.id||uid();const row=await vEnc(S.vkey,{title:o.title,user:o.user,pass:o.pass,url:o.url,notes:o.notes});
      row.updatedAt=new Date().toISOString();if(await save("vault",id,row)){closeModal();toast("Saved")}});
  });
}

/* ---------- files: save helper ---------- */
const csvQ=v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
const ENTRY_HEAD=["Date","Company","Type","What","Start","End","Hours","Amount","Money in type","Vendor/From","Category","Paid with","Receipt #","Notes","Logged by"];
const entryRow=l=>[l.date,brandName(l.brand),TL[l.type],l.title,l.start,l.end,l.hours,l.amount!=null&&l.amount!==""?(l.type==="income"?l.amount:-l.amount):"",l.type==="income"?(l.source||"Payment"):"",l.vendor,l.category,l.payment,l.receiptNo,l.notes,l._by?memberName(l._by):""];
const toCSV=rows=>rows.map(r=>r.map(csvQ).join(",")).join("\n");
async function saveFile(name,data,mime){
  const dl=await cu("downloads");
  if(dl){try{await dl.save({filename:name,data});toast("Saved "+name);return true}catch(e){const c=e&&e.code||"";if(!/declin|cancel/.test(c))toast("Couldn't save the file. Try again.");return false}}
  if(BACKEND==="firebase"){const blob=data instanceof Blob?data:new Blob([data],{type:mime||"text/csv"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);return true}
  if(typeof data==="string"){openModal('<h3>Copy your file</h3><p class="muted">Downloads aren\'t available in this view. Copy the text below instead.</p><textarea class="i mono" style="min-height:220px" readonly>'+esc(data)+'</textarea><div class="row"><button class="btn ghost" data-act="close-modal">Close</button></div>');return false}
  toast("Downloads aren't available in this view.");return false;
}

/* ---------- documents (receipts, PDFs) stored in pieces ---------- */
const DOC_CATS=["Receipt","Invoice","Contract","Tax form","Bank statement","Permit or license","Photo","Other"];
const DOC_MAX=10*1024*1024, CHUNK=180000;
const fmtSize=n=>n>=1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function putChunk(id,i,data){for(let t=0;t<4;t++){try{await S.db.collection("docchunks").doc(id+"_"+i).set({data});return true}catch(e){if(e&&e.code==="quota_exceeded")throw e;await sleep(600*(t+1))}}return false}
function readB64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]||"");r.onerror=rej;r.readAsDataURL(file)})}
function docsModal(files){
  openModal('<form id="mf"><h3 style="margin-bottom:12px">Upload documents</h3><div style="display:flex;flex-direction:column;gap:12px">'+
    '<label class="f">Files (PDF, photos, spreadsheets… up to 10 MB each)<input class="i" type="file" id="d-files" multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt"></label>'+
    '<div class="grid2"><label class="f">Company<select class="i" id="d-brand" name="brand">'+brandOpts(S.docf.brand!=="all"?S.docf.brand:"hq")+'</select></label><label class="f">Type<select class="i" id="d-cat" name="category">'+DOC_CATS.map(c=>'<option>'+c+'</option>').join("")+'</select></label><label class="f">Date<input class="i" type="date" id="d-date" name="date" value="'+today()+'"></label></div>'+
    '<label class="f">Notes<textarea class="i" id="d-notes" name="notes" style="min-height:60px" placeholder="What is this for?"></textarea></label>'+
    '<p id="d-msg" class="muted" style="font-size:13.5px" aria-live="polite"></p></div><div class="row"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn olive" type="submit">Upload</button></div></form>',
  el=>{
    const fi=el.querySelector("#d-files");
    if(files&&files.length){try{const dt=new DataTransfer();[...files].forEach(f=>dt.items.add(f));fi.files=dt.files}catch(e){}}
    el.querySelector("#mf").addEventListener("submit",async ev=>{ev.preventDefault();const o=formObj(ev.target),msg=el.querySelector("#d-msg"),btn=ev.target.querySelector("button[type=submit]");
      const list=[...fi.files];if(!list.length){msg.textContent="Choose at least one file.";return}
      const big=list.find(f=>f.size>DOC_MAX);if(big){msg.style.color="var(--bad)";msg.textContent=big.name+" is larger than 10 MB. Compress it or split it, then try again.";return}
      btn.disabled=true;msg.style.color="var(--muted)";let done=0;
      try{for(const f of list){
        msg.textContent="Uploading "+f.name+" ("+(done+1)+" of "+list.length+")…";
        const b64=await readB64(f),id=uid(),n=Math.max(1,Math.ceil(b64.length/CHUNK));
        for(let i=0;i<n;i++){msg.textContent="Uploading "+f.name+" · "+Math.round(i/n*100)+"%";if(!await putChunk(id,i,b64.slice(i*CHUNK,(i+1)*CHUNK)))throw {code:"chunk"}}
        if(!await save("docs",id,{name:f.name,type:f.type||"application/octet-stream",size:f.size,chunks:n,brand:o.brand,category:o.category,date:o.date||today(),notes:o.notes||"",uploadedAt:new Date().toISOString()}))throw {code:"meta"};
        done++;
      }closeModal();toast(done===1?"Document saved":done+" documents saved")}
      catch(e){btn.disabled=false;msg.style.color="var(--bad)";msg.textContent=e&&e.code==="quota_exceeded"?"Storage is full. Delete old documents to make room.":"Upload stopped. Check your connection and try again."+(done?" ("+done+" saved)":"")}
    });
  });
}
async function loadDoc(d){
  let s="";for(let i=0;i<d.chunks;i++){const c=await S.db.doc("docchunks/"+d.id+"_"+i).get();if(!c.exists)throw 0;s+=c.data().data}
  const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:d.type});
}
async function openDoc(id){
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  openModal('<h3 style="overflow-wrap:anywhere">'+esc(d.name)+'</h3><p class="muted" style="font-size:14px">'+chip(d.brand)+' · '+esc(d.category)+' · '+esc(fmtDate(d.date))+' · '+fmtSize(d.size)+'</p>'+(d.notes?'<p style="white-space:pre-wrap">'+esc(d.notes)+'</p>':'')+'<div id="docview" class="empty">Loading…</div><div class="row"><button class="btn ghost left danger" data-act="doc-del" data-id="'+esc(d.id)+'">Delete</button><button class="btn ghost" data-act="close-modal">Close</button><button class="btn teal" data-act="doc-dl" data-id="'+esc(d.id)+'" disabled>Download</button></div>');
  try{const blob=await loadDoc(d);const box=$("#docview");if(!box)return;S.docBlob={id,blob};
    const dlb=document.querySelector('[data-act="doc-dl"]');if(dlb)dlb.disabled=false;
    if(/^image\//.test(d.type)){const u=URL.createObjectURL(blob);box.className="";box.innerHTML='<img alt="'+esc(d.name)+'" src="'+u+'" style="width:100%;border-radius:10px;border:1px solid var(--line)">'}
    else{box.innerHTML='Ready to download.'+(BACKEND==="firebase"?' <a href="'+URL.createObjectURL(blob)+'" target="_blank" rel="noopener">Open in a new tab ↗</a>':'')}
  }catch(e){const box=$("#docview");if(box)box.textContent="Couldn't load this file. Parts of it may be missing."}
}
async function deleteDoc(id,btn){
  if(btn.dataset.armed!=="1"){btn.dataset.armed="1";btn.textContent="Tap again to delete";return}
  const d=S.docs.find(x=>x.id===id);if(!d)return;
  if(await remove("docs",id)){for(let i=0;i<d.chunks;i++)await remove("docchunks",id+"_"+i);closeModal();toast("Document deleted")}
}
function viewDocs(){
  const f=S.docf, q=(f.q||"").toLowerCase();
  const years=[...new Set(S.docs.map(d=>String(d.date).slice(0,4)))].sort().reverse();
  const L=sortBy(S.docs.filter(d=>(f.brand==="all"||d.brand===f.brand)&&(f.cat==="all"||d.category===f.cat)&&(f.year==="all"||String(d.date).startsWith(f.year))&&(!q||(d.name+" "+d.notes).toLowerCase().includes(q))),d=>d.date+d.uploadedAt).reverse();
  const total=S.docs.reduce((a,d)=>a+(d.size||0),0);
  return '<div class="toolbar"><p class="muted" style="max-width:62ch">Receipts, invoices, contracts, tax forms and other files. Only you can see them. '+S.docs.length+' files · '+fmtSize(total)+' stored.</p><span class="sp"></span><button class="btn olive sm" data-act="doc-up">+ Upload documents</button></div>'+
    '<div class="brandtabs"><button data-act="docf" data-k="brand" data-v="all" class="'+(f.brand==="all"?"on":"")+'">All companies</button>'+BRANDS.map(b=>'<button data-act="docf" data-k="brand" data-v="'+b.id+'" style="'+cvar(b.id)+'" class="'+(f.brand===b.id?"on":"")+'">'+esc(brandInfo(b.id).name)+'</button>').join("")+'</div>'+
    '<div class="toolbar"><select class="i" id="docf-cat" style="width:auto" aria-label="Type"><option value="all">All types</option>'+DOC_CATS.map(c=>'<option'+(f.cat===c?" selected":"")+'>'+c+'</option>').join("")+'</select><select class="i" id="docf-year" style="width:auto" aria-label="Year"><option value="all">All years</option>'+years.map(y=>'<option'+(f.year===y?" selected":"")+'>'+y+'</option>').join("")+'</select><input class="i" id="docf-q" type="search" placeholder="Search names and notes" value="'+esc(f.q||"")+'" style="max-width:280px"></div>'+
    '<div id="dropzone" class="empty" style="margin-bottom:14px">Drag files here to upload, or use “+ Upload documents”.</div>'+
    (L.length?'<div class="tablewrap"><table class="t"><thead><tr><th>Date</th><th>File</th><th>Company</th><th>Type</th><th class="num">Size</th><th></th></tr></thead><tbody>'+L.map(d=>'<tr><td class="mono" style="white-space:nowrap">'+esc(fmtDate(d.date))+'</td><td style="min-width:220px"><b style="font-weight:600;overflow-wrap:anywhere">'+esc(d.name)+'</b>'+(d.notes?'<div class="muted" style="font-size:13px">'+esc(d.notes)+'</div>':'')+'</td><td>'+chip(d.brand)+'</td><td>'+esc(d.category)+'</td><td class="num">'+fmtSize(d.size)+'</td><td><button class="rowbtn" data-act="doc-open" data-id="'+esc(d.id)+'">Open</button></td></tr>').join("")+'</tbody></table></div>'
    :'<div class="empty">'+(S.docs.length?'No documents match these filters.':'No documents yet. Upload receipts, PDFs and other files to keep them in one place.')+'</div>');
}

/* ---------- reports: monthly logs and yearly summaries ---------- */
function yearsAvailable(){const now=new Date().getFullYear();const ys=new Set();for(let y=2026;y<=Math.max(2026,now);y++)ys.add(y);ledgerAll().forEach(l=>{const y=Number(String(l.date).slice(0,4));if(y)ys.add(y)});return [...ys].sort((a,b)=>b-a)}
function sumUp(L){const s={h:0,sp:0,inc:0,pay:0,don:0,n:L.length};L.forEach(l=>{const a=Number(l.amount)||0;if(l.type==="meeting"||l.type==="hours")s.h+=Number(l.hours)||0;if(l.type==="expense"||l.type==="receipt")s.sp+=a;if(l.type==="income"){s.inc+=a;if((l.source||"Payment")==="Payment")s.pay+=a;if(l.source==="Donation")s.don+=a}});s.net=s.inc-s.sp;return s}
function viewReports(){
  const ys=yearsAvailable();if(!ys.includes(S.rep.year))S.rep.year=ys.includes(new Date().getFullYear())?new Date().getFullYear():ys[0];
  const y=String(S.rep.year), YL=ledgerAll().filter(l=>String(l.date).startsWith(y)), T=sumUp(YL);
  const months=MONTHS.map((m,i)=>{const k=y+"-"+pad(i+1);return {k,m,s:sumUp(YL.filter(l=>String(l.date).startsWith(k)))}});
  const comps=BRANDS.map(b=>({b,s:sumUp(YL.filter(l=>l.brand===b.id))}));
  const netCell=n=>'<td class="num '+(n<0?"neg":n>0?"pos":"")+'">'+money(n)+'</td>';
  return '<div class="toolbar"><div class="seg" role="group" aria-label="Year">'+ys.map(v=>'<button data-act="rep-year" data-v="'+v+'" class="'+(String(v)===y?"on":"")+'">'+v+'</button>').join("")+'</div><span class="sp"></span><button class="btn ghost sm" data-act="rep-sum">Export '+y+' summary</button><button class="btn olive sm" data-act="rep-log">Export '+y+' full log</button></div>'+
    '<div class="kpis"><div class="kpi"><span class="eyebrow">Hours · '+y+'</span><b>'+hrs(T.h)+'</b></div><div class="kpi"><span class="eyebrow">Money spent</span><b class="neg">'+money(T.sp)+'</b></div><div class="kpi"><span class="eyebrow">Money in</span><b class="pos">'+money(T.inc)+'</b></div><div class="kpi"><span class="eyebrow">Net</span><b class="'+(T.net<0?"neg":"pos")+'">'+money(T.net)+'</b></div></div>'+
    '<h2 style="font-size:22px;margin:6px 0 10px">Month by month</h2><div class="tablewrap" style="margin-bottom:28px"><table class="t"><thead><tr><th>Month</th><th class="num">Hours</th><th class="num">Spent</th><th class="num">Payments</th><th class="num">Donations</th><th class="num">Money in</th><th class="num">Net</th><th class="num">Entries</th><th></th></tr></thead><tbody>'+
    months.map(r=>'<tr><td><b style="font-weight:600">'+r.m+'</b></td><td class="num">'+hrs(r.s.h)+'</td><td class="num">'+money(r.s.sp)+'</td><td class="num">'+money(r.s.pay)+'</td><td class="num">'+money(r.s.don)+'</td><td class="num">'+money(r.s.inc)+'</td>'+netCell(r.s.net)+'<td class="num">'+r.s.n+'</td><td>'+(r.s.n?'<button class="rowbtn" data-act="rep-month" data-v="'+r.k+'">Export log</button>':'')+'</td></tr>').join("")+
    '</tbody><tfoot><tr><td>'+y+' total</td><td class="num">'+hrs(T.h)+'</td><td class="num">'+money(T.sp)+'</td><td class="num">'+money(T.pay)+'</td><td class="num">'+money(T.don)+'</td><td class="num">'+money(T.inc)+'</td>'+netCell(T.net)+'<td class="num">'+T.n+'</td><td></td></tr></tfoot></table></div>'+
    '<h2 style="font-size:22px;margin:6px 0 10px">By company · '+y+'</h2><div class="tablewrap"><table class="t"><thead><tr><th>Company</th><th class="num">Hours</th><th class="num">Spent</th><th class="num">Money in</th><th class="num">Net</th><th class="num">Entries</th></tr></thead><tbody>'+
    comps.map(c=>'<tr><td>'+chip(c.b.id)+'</td><td class="num">'+hrs(c.s.h)+'</td><td class="num">'+money(c.s.sp)+'</td><td class="num">'+money(c.s.inc)+'</td>'+netCell(c.s.net)+'<td class="num">'+c.s.n+'</td></tr>').join("")+'</tbody></table></div>';
}
function exportMonthLog(k){
  const L=sortBy(ledgerAll().filter(l=>String(l.date).startsWith(k)),l=>l.date+(l.start||"")),s=sumUp(L),m=MONTHS[Number(k.slice(5))-1]+" "+k.slice(0,4);
  const rows=[["Grooveville LLC timesheet log",m],[],ENTRY_HEAD].concat(L.map(entryRow)).concat([[],["Totals","","","","","","Hours",hrs(s.h)],["","","","","","","Money spent",s.sp.toFixed(2)],["","","","","","","Money in",s.inc.toFixed(2)],["","","","","","","Net",s.net.toFixed(2)]]);
  return saveFile("grooveville-log-"+k+".csv",toCSV(rows));
}
function exportYear(full){
  const y=String(S.rep.year),YL=sortBy(ledgerAll().filter(l=>String(l.date).startsWith(y)),l=>l.date+(l.start||"")),T=sumUp(YL);
  const head=["","Hours","Spent","Payments","Donations","Money in","Net","Entries"];
  const line=(label,s)=>[label,hrs(s.h),s.sp.toFixed(2),s.pay.toFixed(2),s.don.toFixed(2),s.inc.toFixed(2),s.net.toFixed(2),s.n];
  let rows=[["Grooveville LLC annual summary",y],[],["By month"],head].concat(MONTHS.map((mm,i)=>line(mm,sumUp(YL.filter(l=>String(l.date).startsWith(y+"-"+pad(i+1)))))) ).concat([line("Year total",T),[],["By company"],head]).concat(BRANDS.map(b=>line(brandName(b.id),sumUp(YL.filter(l=>l.brand===b.id)))));
  if(full)rows=rows.concat([[],["All entries"],ENTRY_HEAD]).concat(YL.map(entryRow));
  return saveFile("grooveville-"+y+(full?"-full-log":"-summary")+".csv",toCSV(rows));
}

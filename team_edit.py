def edit(fn, pairs):
    s=open(fn).read()
    for o,n in pairs:
        assert s.count(o)==1,(fn,o[:90],s.count(o)); s=s.replace(o,n)
    open(fn,'w').write(s)

# ---------- part2: data + subscriptions ----------
edit('part2.js',[
("requested:false, members:{}, access:{},","requested:false, members:{}, access:{}, org:{founder:\"\",heads:{}}, requests:{}, grants:{}, myReq:null,"),
("""  S.db.collection("access").onSnapshot(snap=>{S.access=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));S.loaded.access=true;scheduleRender(true)},()=>{});
""",""),
("""    resolveNames(Object.keys(S.members));scheduleRender(true);
  },()=>{});
}""","""    resolveNames(Object.keys(S.members));scheduleRender(true);
  },()=>{});
  subscribeTeam();
}"""),
("""  S.db.doc("access/"+u).onSnapshot(d=>{const a=d.exists?d.data():{};S.myBrands=(a.brands||[]).filter(b=>BR[b]);S.loaded.access=true;scheduleRender(true)},()=>{S.loaded.access=true;scheduleRender(true)});
""",""),
("""  S.db.collection(memberCol(u)).onSnapshot(es=>{S.myEntries=rows(es,memberCol(u));S.loaded.mine=true;scheduleRender(true)},()=>{});
}""","""  S.db.collection(memberCol(u)).onSnapshot(es=>{S.myEntries=rows(es,memberCol(u));S.loaded.mine=true;scheduleRender(true)},()=>{});
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
}"""),
("const memberName=u=>(S.members[u]&&S.members[u].email)||S.names[u]||\"Team member \"+String(u).slice(-4);",
 "const memberName=u=>u===S.uid?\"You\":(S.requests[u]&&S.requests[u].email)||(S.members[u]&&S.members[u].email)||S.names[u]||\"Team member \"+String(u).slice(-4);"),
("const isMember=()=>!S.isAdmin&&S.myBrands.length>0;","const isMember=()=>!S.isAdmin&&S.myBrands.length>0;"),
])

# ---------- part4: views ----------
s=open('part4.js').read()
a=s.index('function viewPeople(){');b=s.index('function viewSignin(){')
s=s[:a]+r'''function personOpts(exclude){
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
'''+s[b:]
s=s.replace("""  else if(isMember())body='<div class="eyebrow">Signed in · Team member</div><h1>Your timesheet is ready</h1><p class="muted">You can log time, money spent and money in for '+S.myBrands.map(b=>esc(brandInfo(b).name)).join(", ")+'.</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn olive" href="#portal">Open my timesheet</a>'+(BACKEND==="firebase"?'<button class="btn ghost" data-act="signout">Sign out</button>':'')+'</div>';""",
"""  else if(isMember())body='<div class="eyebrow">Signed in · '+(isHead()?'Company head':'Team member')+'</div><h1>Your timesheet is ready</h1><p class="muted">You can log time, money spent and money in for '+S.myBrands.map(b=>esc(brandInfo(b).name)).join(", ")+'.'+(isHead()?' As a company head you can also approve people for your team.':'')+'</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn olive" href="#portal">Open my timesheet</a>'+(isHead()?'<a class="btn ghost" href="#portal-team">My team</a>':'')+(BACKEND==="firebase"?'<button class="btn ghost" data-act="signout">Sign out</button>':'')+'</div><p class="muted" style="font-size:13.5px">Want to join another company team?</p>'+joinPicker();""")
s=s.replace("""    body=S.requested?'<div class="eyebrow">Request sent</div><h1>Waiting for access</h1><p class="muted">The founder will assign you to a company. This page updates on its own once you have access.</p>'+(BACKEND==="firebase"?'<button class="btn ghost" data-act="signout">Sign out</button>':''):
      '<div class="eyebrow">Grooveville team</div><h1>Request team access</h1><p class="muted">Ask the founder to add you to one of the Grooveville companies. Once approved, you\\'ll get a private timesheet here.</p><button class="btn olive" data-act="request-access">Request access</button>'+(BACKEND==="firebase"?'<button class="btn ghost" data-act="signout">Sign out</button>':'');""",
"""    const asked=(S.myReq&&S.myReq.brands)||[];
    body=(asked.length?'<div class="eyebrow">Request sent</div><h1>Waiting for approval</h1><p class="muted">The company head or the founder will approve you. This page updates on its own once you\\'re in.</p>':'<div class="eyebrow">Grooveville team</div><h1>Join a company team</h1><p class="muted">Pick the Grooveville company you work with. Once the company head or the founder approves you, you\\'ll get a private timesheet here.</p>')+joinPicker()+(BACKEND==="firebase"?'<button class="btn ghost" data-act="signout">Sign out</button>':'');""")
s=s.replace("""  return '<section class="teamhead"><div class="wrap"><div class="eyebrow">Grooveville team · Private</div><h1>My timesheet</h1><p class="muted" style="margin-top:6px">Only you and the founder can see these entries.</p></div></section>""",
"""  return '<section class="teamhead"><div class="wrap"><div class="eyebrow">Grooveville team · Private</div><h1>My timesheet</h1><p class="muted" style="margin-top:6px">Only you and the founder can see these entries.</p>'+portalTabs("portal")+'</div></section>""")
s=s.replace('["team-people","Team access"]','["team-people","Teams"]')
open('part4.js','w').write(s)
assert 'joinPicker()+(BACKEND' in s and 'portalTabs("portal")' in s and "Want to join another" in s

# ---------- part3 nav ----------
edit('part3.js',[("""isMember()?'<a href="#portal" class="team'+(r==="portal"?' on':'')+'">My timesheet</a>'""","""isMember()?'<a href="#portal" class="team'+(r.startsWith("portal")?' on':'')+'">'+(isHead()?'My team':'My timesheet')+'</a>'""")])

# ---------- part5 ----------
edit('part5.js',[
('"team-people":viewPeople,','"team-people":viewTeams,'),
("""  else if(r==="portal")h=viewPortal();""","""  else if(r==="portal")h=viewPortal();
  else if(r==="portal-team")h=isHead()?viewMyTeam():viewPortal();"""),
("""  document.querySelectorAll("form[data-member]").forEach(f=>f.addEventListener("submit",async e=>{e.preventDefault();const u=f.dataset.member;const brands=[...f.querySelectorAll("input[name=b]:checked")].map(x=>x.value);
    if(await save("access",u,Object.assign({},S.access[u]||{},{brands,role:(S.access[u]||{}).role==="founder"?"founder":"member",updatedAt:new Date().toISOString()})))toast("Access saved")}));
""",""),
("""function render(){
  navLinks();""","""function render(){
  computeMine();
  navLinks();"""),
("""  if(a==="request-access"){t.disabled=true;const ok=await save("memberlog",S.uid,Object.assign({joinedAt:new Date().toISOString()},S.email?{email:S.email}:{}));if(!ok){t.disabled=false;openModal(""",
 """  if(a==="request-join"){const card=t.closest(".card");const brands=[...card.querySelectorAll("input[name=jb]:checked:not(:disabled)")].map(x=>x.value);
    if(!brands.length){toast("Pick at least one company");return}
    t.disabled=true;const base=Object.assign({joinedAt:(S.myReq&&S.myReq.joinedAt)||new Date().toISOString()},S.email?{email:S.email}:{});
    const ok=await save("requests",S.uid,Object.assign({},base,{brands,updatedAt:new Date().toISOString()}))&&await save("memberlog",S.uid,base);
    if(ok){toast("Request sent");return}t.disabled=false;openModal("""),
("""  if(isMember()){""","""  if(isHead()||S.isAdmin){
    const u=t.dataset.u,b=t.dataset.b;
    if(b&&!manageBrands().includes(b))return;
    if(a==="approve"){t.disabled=true;return setGrant(u,b,"approved")}
    if(a==="decline"){t.disabled=true;return setGrant(u,b,"declined")}
    if(a==="team-rm")return removeFromTeam(u,b);
    if(a==="team-add"){const v=$("#add-"+b).value;if(!v){toast("Choose a person first");return}return setGrant(v,b,"approved")}
    if(S.isAdmin&&a==="head-add"){const v=$("#head-"+b).value;if(!v){toast("Choose a person first");return}return setHeads(b,headsOf(b).concat(v))}
    if(S.isAdmin&&a==="head-rm")return setHeads(b,headsOf(b).filter(x=>x!==u));
  }
  if(isMember()){"""),
("""  if(a==="revoke"){if(await remove("access",id))toast("Access removed");return}
""",""),
])
print("ok")

def edit(fn, pairs):
    s=open(fn).read()
    for o,n in pairs:
        assert s.count(o)==1,(fn,o[:80],s.count(o)); s=s.replace(o,n)
    open(fn,'w').write(s)
edit('part5.js',[
("const brandOpts=sel=>BRANDS.map(","const brandOpts=(sel,only)=>BRANDS.filter(b=>!only||only.includes(b.id)).map("),
("""'<div class="grid2"><label class="f">Slot<select class="i" id="e-brand" name="brand">'+brandOpts(d.brand)+'</select>""",
 """'<div class="grid2"><label class="f">Slot<select class="i" id="e-brand" name="brand">'+brandOpts(d.brand,S.isAdmin?null:S.myBrands)+'</select>"""),
("""<label class="f">'+(t==="income"?"From":"Paid to (vendor)")+'<input class="i" id="e-vendor" name="vendor" value="'+esc(d.vendor)+'"></label>""",
 """'+(t==="income"?'<label class="f">Type of money in<select class="i" id="e-src" name="source">'+SOURCES.map(x=>'<option'+(x===(d.source||"Payment")?" selected":"")+'>'+x+'</option>').join("")+'</select></label>':'')+'<label class="f">'+(t==="income"?"From (person or org)":"Paid to (vendor)")+'<input class="i" id="e-vendor" name="vendor" value="'+esc(d.vendor)+'"></label>"""),
("""    el._del=async()=>{if(await remove("ledger",d.id)){if(d.hasImage)remove("receiptImg",d.id);closeModal();toast("Entry deleted")}};""",
 """    const col=d._col||(S.isAdmin?"ledger":memberCol(S.uid));
    el._del=async()=>{if(await remove(col,d.id)){if(d.hasImage)remove(imgCol(col),d.id);closeModal();toast("Entry deleted")}};"""),
("""if(o.type!=="income"){rec.payment=o.payment||"";rec.receiptNo=o.receiptNo||""}}""","""if(o.type!=="income"){rec.payment=o.payment||"";rec.receiptNo=o.receiptNo||""}else rec.source=o.source||"Payment"}"""),
("""by:S.uid||""};""","""by:d.by||S.uid||""};"""),
("""      if(file){const data=await shrink(file);if(data&&await save("receiptImg",id,{data}))rec.hasImage=true}
      if(await save("ledger",id,rec))""","""      if(file){const data=await shrink(file);if(data&&await save(imgCol(col),id,{data}))rec.hasImage=true}
      if(await save(col,id,rec))"""),
("""  try{const d=await S.db.doc("receiptImg/"+id).get();""","""  const en=ledgerAll().find(x=>x.id===id);const ic=imgCol((en&&en._col)||"ledger");
  try{const d=await S.db.doc(ic+"/"+id).get();"""),
("""  const f=S.ts;const L=sortBy(S.ledger.filter(l=>(f.brand==="all"||l.brand===f.brand)""","""  const f=S.ts;const L=sortBy(ledgerAll().filter(l=>(f.brand==="all"||l.brand===f.brand)"""),
("""  const csv=[["Date","Slot","Type","What","Start","End","Hours","Amount","Vendor/From","Category","Paid with","Receipt #","Notes"].join(",")].concat(L.map(l=>[l.date,brandName(l.brand),TL[l.type],l.title,l.start,l.end,l.hours,l.amount!=null?(l.type==="income"?l.amount:-l.amount):"",l.vendor,l.category,l.payment,l.receiptNo,l.notes]""",
 """  const csv=[["Date","Slot","Type","What","Start","End","Hours","Amount","Money in type","Vendor/From","Category","Paid with","Receipt #","Notes","Logged by"].join(",")].concat(L.map(l=>[l.date,brandName(l.brand),TL[l.type],l.title,l.start,l.end,l.hours,l.amount!=null?(l.type==="income"?l.amount:-l.amount):"",l.type==="income"?(l.source||"Payment"):"",l.vendor,l.category,l.payment,l.receiptNo,l.notes,l._by?memberName(l._by):""]"""),
("  if(fromData&&S.route.startsWith(\"collab\"))return;","  if(fromData&&(S.route.startsWith(\"collab\")||(S.route===\"signin\"&&$(\"#authForm\"))))return;"),
("""  else if(r.startsWith("team")){
    if(!S.isAdmin)h=teamGate();""","""  else if(r==="signin")h=viewSignin();
  else if(r==="portal")h=viewPortal();
  else if(r.startsWith("team")){
    if(!S.isAdmin)h=viewSignin();"""),
("""{"team":viewDash,"team-time":viewTimesheet,"team-cal":()=>viewCalendar(true),"team-rem":viewReminders,"team-out":viewOutreach,"team-site":viewSite}[r]||viewDash;h=teamShell(r in {"team":1,"team-time":1,"team-cal":1,"team-rem":1,"team-out":1,"team-site":1}?r:"team",v())}""",
 """{"team":viewDash,"team-time":viewTimesheet,"team-cal":()=>viewCalendar(true),"team-rem":viewReminders,"team-out":viewOutreach,"team-people":viewPeople,"team-site":viewSite}[r]||viewDash;h=teamShell(TEAM_TABS.some(t=>t[0]===r)?r:"team",v())}"""),
("""  const tm=$("#ts-month");""","""  document.querySelectorAll("form[data-member]").forEach(f=>f.addEventListener("submit",async e=>{e.preventDefault();const u=f.dataset.member;const brands=[...f.querySelectorAll("input[name=b]:checked")].map(x=>x.value);
    if(await save("access",u,Object.assign({},S.access[u]||{},{brands,role:(S.access[u]||{}).role==="founder"?"founder":"member",updatedAt:new Date().toISOString()})))toast("Access saved")}));
  const af=$("#authForm");if(af)af.addEventListener("submit",e=>{e.preventDefault();fbAuth(af,(e.submitter&&e.submitter.dataset.mode)||"in")});
  const tm=$("#ts-month");"""),
("""  if(!S.isAdmin)return;
  if(a==="ts-brand")""","""  if(a==="signout"){if(BACKEND==="firebase"&&window.firebase)firebase.auth().signOut();return}
  if(a==="reset-pass")return fbReset();
  if(a==="request-access"){t.disabled=true;const ok=await save("memberlog",S.uid,Object.assign({joinedAt:new Date().toISOString()},S.email?{email:S.email}:{}));if(!ok){t.disabled=false;openModal('<h3>Can\\'t send the request</h3><p class="muted">Your account can view this page but can\\'t save to it. Ask the founder to share it with you as a Contributor (“Can use”), then try again.</p><div class="row"><button class="btn ghost" data-act="close-modal">Close</button></div>')}return}
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
  if(a==="revoke"){if(await remove("access",id))toast("Access removed");return}
  if(a==="ts-brand")"""),
("""  if(a==="edit-entry"){const x=byId("ledger",id);""","""  if(a==="edit-entry"){const x=ledgerAll().find(z=>z.id===id);"""),
])
s=open('part5.js').read()
a=s.index('(async()=>{\n  let user=null;')
b=s.index('})();\n})();\n</script>')
s=s[:a]+open('boot.js').read()+s[b:]
s=s.replace("/* ---------- boot ---------- */",open('fbauth.js').read()+"\n/* ---------- boot ---------- */")
open('part5.js','w').write(s)
p1=open('part1.html').read()
p1=p1.replace(".slot .next{",".moneyin{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;background:var(--olive-soft);border-radius:8px;padding:8px 10px}\n.moneyin div{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0}\n.moneyin small{font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--olive);text-transform:uppercase}\n.moneyin b{font-size:15px}\n.moneyin span{font-size:12px;color:var(--muted);flex-basis:100%;order:3}\n.moneyin .btn{padding:4px 10px;font-size:12px}\n.slot .next{",1)
open('part1.html','w').write(p1)
print("ok")

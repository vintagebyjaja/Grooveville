
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

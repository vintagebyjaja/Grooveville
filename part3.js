
/* ---------- public views ---------- */
function navLinks(){
  const r=S.route, on=(t)=>r===t||r.startsWith(t+"-")?' class="on"':'';
  const team=r.startsWith("team");
  $("#links").innerHTML=
    '<a href="#home"'+(r==="home"||r.startsWith("b-")?' class="on"':'')+'>Home</a>'+
    '<a href="#calendar"'+on("calendar")+'>Calendar</a>'+
    '<a href="#collab"'+on("collab")+'>Collaborate</a>'+
    (S.isAdmin?'<a href="#team" class="team'+(team?' on':'')+'">Back office</a>':isMember()?'<a href="#portal" class="team'+(r.startsWith("portal")?' on':'')+'">'+(isHead()?'My team':'My timesheet')+'</a>':'<a href="#signin" class="team'+(r==="signin"||team?' on':'')+'">Sign in</a>');
}

function treeSVG(){
  const W=560, cy=x=>Math.round(64+0.0011*(x-280)*(x-280)+7*Math.sin((x-30)/34));
  let cane="M24 "+cy(24);for(let x=34;x<=536;x+=10)cane+=" L"+x+" "+cy(x);
  let cane2="M40 "+(cy(40)-8);for(let x=50;x<=520;x+=10)cane2+=" L"+x+" "+(cy(x)-6+5*Math.sin(x/23)).toFixed(1);
  const leaf=(x,y,s,rot,o)=>'<g transform="translate('+x+' '+y+') rotate('+rot+') scale('+s+')" opacity="'+(o||.9)+'"><path d="M0 0 C-6 -4 -16 -2 -20 -10 C-14 -12 -12 -18 -16 -26 C-8 -24 -4 -30 0 -36 C4 -30 8 -24 16 -26 C12 -18 14 -12 20 -10 C16 -2 6 -4 0 0Z" fill="var(--olive)"/><path d="M0 0 L0 -30 M0 -12 L-12 -18 M0 -12 L12 -18" stroke="var(--bg)" stroke-width="1.2" opacity=".5" fill="none"/></g>';
  const curl=(x,y,d)=>'<path d="M'+x+' '+y+' c'+(6*d)+' -2 '+(10*d)+' 4 '+(8*d)+' 9 c'+(-2*d)+' 5 '+(-8*d)+' 4 '+(-8*d)+' -1 c0 -3 '+(3*d)+' -4 '+(4*d)+' -2" stroke="var(--olive)" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
  const rows=[3,4,3,2,1], R=7.8, dx=15.4, dy=13.4;
  let clusters="";
  const SPOT={ent:[36,0],music:[100,0],vybr8:[164,0],pathd:[228,0],aec:[350,0],scu:[432,0],wit:[514,0],rentals:[188,1],w4w:[372,1]};
  BRANDS.slice(1).forEach((b,i)=>{
    const sp=SPOT[b.id]||[516,0], x=sp[0], low=sp[1]===1, ay=low?246:cy(x), top=ay+20, info=brandInfo(b.id), c="var(--c-"+b.id+")";
    let g='<path d="M'+x+' '+(ay+2)+' q4 8 0 '+(top-ay-4)+'" stroke="var(--olive)" stroke-width="2.4" fill="none"/>';
    rows.forEach((n,r)=>{for(let k=0;k<n;k++){const gx=x+(k-(n-1)/2)*dx, gy=top+R+r*dy;
      g+='<circle cx="'+gx.toFixed(1)+'" cy="'+gy.toFixed(1)+'" r="'+R+'" fill="'+c+'"'+(low?' opacity=".5" stroke="'+c+'" stroke-width="1.2"':'')+'/><circle cx="'+(gx-2.6).toFixed(1)+'" cy="'+(gy-2.8).toFixed(1)+'" r="2.4" fill="#fff" opacity=".38"/>'}});
    const bottom=top+R*2+4*dy;
    if(info.logo)g+='<clipPath id="cl-'+b.id+'"><circle cx="'+x+'" cy="'+(top+R+dy)+'" r="17"/></clipPath><circle cx="'+x+'" cy="'+(top+R+dy)+'" r="19" fill="var(--surface)" stroke="'+c+'" stroke-width="2"/><image href="'+esc(info.logo)+'" x="'+(x-17)+'" y="'+(top+R+dy-17)+'" width="34" height="34" preserveAspectRatio="xMidYMid meet" clip-path="url(#cl-'+b.id+')"/>';
    g+='<text x="'+x+'" y="'+(bottom+18)+'" text-anchor="middle" font-size="'+(b.short.length>5?13:15)+'" fill="var(--ink)">'+b.short+'</text>';
    if(low)g+='<text x="'+x+'" y="'+(bottom+32)+'" text-anchor="middle" font-size="10" letter-spacing="1.5" fill="var(--muted)" font-family="var(--f-body)">RIPENING</text>';
    clusters+='<a class="node" href="#b-'+b.id+'" aria-label="'+esc(info.name)+'"><rect x="'+(x-36)+'" y="'+(ay-4)+'" width="72" height="'+(bottom-ay+30)+'" fill="transparent"/>'+g+'</a>';
  });
  const trunk='<path d="M268 452 C258 400 298 372 284 326 C270 282 296 250 282 206 C270 166 294 120 280 '+cy(280)+'" stroke="var(--olive)" stroke-width="15" fill="none" stroke-linecap="round"/>'+
    '<path d="M276 440 C270 400 300 370 288 330 C276 290 298 250 286 210" stroke="var(--bg)" stroke-width="1.6" opacity=".3" fill="none"/>'+
    '<path d="M285 222 C312 226 344 232 376 246" stroke="var(--olive)" stroke-width="6" fill="none" stroke-linecap="round"/>'+
    '<path d="M275 222 C248 226 216 232 184 246" stroke="var(--olive)" stroke-width="6" fill="none" stroke-linecap="round"/>'+
    '<path d="M268 448 Q236 444 214 456 M272 450 Q310 446 334 458" stroke="var(--olive)" stroke-width="5" fill="none" stroke-linecap="round"/>';
  const leaves=leaf(246,262,1,-30,.85)+leaf(316,262,1,30,.85)+leaf(226,206,.8,-60,.75)+leaf(334,206,.8,60,.75)+
    leaf(126,cy(126)-2,.85,-160,.8)+leaf(420,cy(420)-2,.85,165,.8)+leaf(200,cy(200)-4,.7,-178,.7)+leaf(356,cy(356)-4,.7,178,.7)+leaf(30,cy(30)+2,.7,-120,.7)+leaf(530,cy(530)+2,.7,120,.7);
  const curls=curl(90,cy(90)-4,1)+curl(240,cy(240)-6,-1)+curl(318,cy(318)-6,1)+curl(470,cy(470)-4,-1)+curl(150,250,-1)+curl(410,250,1);
  return '<svg class="tree" viewBox="0 0 '+W+' 470" role="img" aria-label="The Groove Vine: Grooveville LLC at the root with nine companies growing on it">'+
    trunk+'<path d="'+cane2+'" stroke="var(--olive)" stroke-width="2.5" fill="none" opacity=".55" stroke-linecap="round"/>'+
    '<path d="'+cane+'" stroke="var(--olive)" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+
    leaves+curls+clusters+
    '<defs><clipPath id="hqclip"><circle cx="280" cy="388" r="50"/></clipPath></defs><a class="node" href="#b-hq" aria-label="Grooveville LLC headquarters, the root of the vine"><circle class="ring" cx="280" cy="388" r="53" fill="var(--surface)" stroke="var(--olive)" stroke-width="4"/><image href="'+LOGO+'" x="230" y="338" width="100" height="100" clip-path="url(#hqclip)"/></a></svg>';
}

function evRow(e,opts){
  opts=opts||{};const d=parse(e.date);
  return '<div class="ev" style="'+cvar(e.brand)+'"><div class="date"><small>'+MON[d.getMonth()]+'</small><b>'+d.getDate()+'</b><small>'+DOW[d.getDay()]+'</small></div>'+
    '<div style="min-width:0"><h4>'+esc(e.title)+'</h4><div class="meta">'+chip(e.brand)+
    (e.start?'<span class="mono">'+fmtTime(e.start)+(e.end?" – "+fmtTime(e.end):"")+'</span>':'')+
    (e.location?'<span>'+esc(e.location)+'</span>':'')+
    (opts.team?(e.visibility==="public"?'<span class="pill pub">Public</span>':'<span class="pill priv">Private</span>'):'')+'</div></div>'+
    '<div class="act"><button class="btn ghost sm" data-act="'+(opts.team?"edit-event":"ev-open")+'" data-id="'+esc(e.id)+'">'+(opts.team?"Edit":"Details")+'</button></div></div>';
}
function upcomingPublic(brand,n){
  const t=today();
  return pub().events.filter(e=>e.date>=t&&(!brand||e.brand===brand)).slice(0,n||6);
}

function viewHome(){
  const ev=upcomingPublic(null,5);
  const hq=brandInfo("hq");
  return '<section class="hero"><div class="wrap"><div>'+
    '<div class="eyebrow">Grooveville LLC · DrawUp Headquarters</div>'+
    '<h1 style="margin-top:14px">One root. <em>Nine companies.</em> <span>All on the Groove Vine.</span></h1>'+
    '<p class="lede">'+esc(hq.tagline)+' Explore each company, see what we are hosting next, or send us an official collaboration request.</p>'+
    '<div class="ctas"><a class="btn teal" href="#calendar">See the calendar</a><a class="btn peach" href="#collab">Collaborate with us</a></div>'+
    '</div><div>'+treeSVG()+'</div></div></section>'+
    '<section style="padding-top:12px"><div class="wrap">'+
    '<div class="sechead"><div><div class="eyebrow">The Groove Vine</div><h2>Our companies</h2></div></div>'+
    '<div class="hqband"><div><div class="eyebrow" style="color:inherit;opacity:.75">Root of the vine · '+esc(hq.role)+'</div><h3>'+esc(hq.name)+'</h3><p>'+esc(hq.about)+'</p></div><a class="btn" href="#b-hq">Visit HQ</a></div>'+
    '<div class="branches">'+BRANDS.slice(1).map(b0=>{const b=brandInfo(b0.id);return '<a class="branch" href="#b-'+b.id+'" style="'+cvar(b.id)+'">'+(b.logo?'<img class="blogo" src="'+esc(b.logo)+'" alt="">':'<div class="mark">'+esc(b.short.slice(0,3))+'</div>')+'<h3>'+esc(b.name)+'</h3>'+(b.developing?'<span class="pill high" style="align-self:flex-start">In development</span>':'')+'<p>'+esc(b.tagline)+'</p><span class="go">'+(b.website?esc(b.website.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,""))+" →":b.social&&/instagram/i.test(b.social)?"@"+esc((/instagram\.com\/([^/?#]+)/i.exec(b.social)||[,""])[1])+" →":"Coming soon →")+'</span></a>'}).join("")+'</div>'+
    '</div></section>'+
    '<section><div class="wrap"><div class="sechead"><div><div class="eyebrow">What\'s next</div><h2>Heard it through the Groove Vine</h2></div><a class="btn ghost" href="#calendar">Full calendar</a></div>'+
    (ev.length?'<div class="evlist">'+ev.map(e=>evRow(e)).join("")+'</div>':'<div class="empty">No public events are posted yet. New launches and hosted events will show up here.</div>')+
    '</div></section>'+
    '<section style="padding-top:0"><div class="wrap"><div class="cta"><div><div class="eyebrow">Partnerships</div><h2 style="margin-top:8px">Want to build something with Grooveville?</h2><p class="muted" style="margin-top:10px;max-width:52ch">Organizations, brands and businesses can send an official collaboration request to Grooveville LLC or to any one of our companies.</p></div><div><a class="btn peach" href="#collab">Start a collaboration request</a></div></div></div></section>';
}

function viewBrand(id){
  const b=brandInfo(id), ev=upcomingPublic(id,6);
  const sib=BRANDS.filter(x=>x.id!==id);
  const links=[];
  if(b.cta)links.push('<a class="btn" style="background:var(--c);color:var(--bg)" href="'+esc(b.cta.url)+'" target="_blank" rel="noopener">'+esc(b.cta.label)+' ↗</a>');
  if(b.website)links.push('<a class="btn" style="background:var(--c);color:var(--bg)" href="'+esc(b.website)+'" target="_blank" rel="noopener">Visit '+esc(b.name)+' website ↗</a>');
  if(b.social){const ig=/instagram\.com\/([^/?#]+)/i.exec(b.social);links.push('<a class="btn '+(b.website||b.cta?'ghost':'')+'" '+(b.website||b.cta?'':'style="background:var(--c);color:var(--bg)" ')+'href="'+esc(b.social)+'" target="_blank" rel="noopener">'+(ig?'Follow @'+esc(ig[1])+' on Instagram ↗':'Social ↗')+'</a>')}
  if(b.tiktok){const tk=/tiktok\.com\/@?([^/?#]+)/i.exec(b.tiktok);links.push('<a class="btn ghost" href="'+esc(b.tiktok)+'" target="_blank" rel="noopener">'+(tk?'Follow @'+esc(tk[1])+' on TikTok ↗':'TikTok ↗')+'</a>')}
  if(!b.website&&!b.social)links.push('<span class="pill high" style="align-self:center;font-size:12.5px;padding:6px 10px">Website coming soon</span>');
  return '<div style="'+cvar(id)+'"><section class="bhero"><div class="wrap">'+
    '<div class="crumb">'+(id==="hq"?'<a href="#home">Home</a> · Headquarters':'<a href="#b-hq">Grooveville LLC</a> › '+esc(b.name))+'</div>'+
    (b.logo?'<img class="blogo big" src="'+esc(b.logo)+'" alt="'+esc(b.name)+' logo">':'')+'<div class="eyebrow">'+esc(b.role)+'</div><h1 style="margin-top:8px">'+esc(b.name)+'</h1><p class="tag">'+esc(b.tagline)+'</p>'+
    '<div class="ctas" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">'+links.join("")+'<a class="btn peach" href="#collab-'+id+'">Collaborate with '+esc(b.short==="HQ"?"Grooveville":b.name)+'</a></div>'+
    '</div></section>'+
    '<section style="padding-top:8px"><div class="wrap bcols"><div style="display:flex;flex-direction:column;gap:20px;min-width:0">'+
    (b.feature?'<div class="card" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;border-color:var(--c)"><div style="width:74px;height:104px;border-radius:6px;background:linear-gradient(160deg,var(--c),color-mix(in srgb,var(--c) 40%,#000));display:grid;place-items:center;color:var(--bg);font-family:var(--f-display);font-weight:800;font-size:13px;text-align:center;padding:6px;flex:none">BOOK 1</div><div style="min-width:0;flex:1"><div class="eyebrow">'+esc(b.feature.eyebrow)+'</div><h3 style="font-size:22px;margin-top:4px">'+esc(b.feature.title)+'</h3><p class="muted" style="margin-top:4px">by '+esc(b.feature.by)+' · <span class="mono" style="font-size:13px">'+esc(b.feature.meta)+'</span></p></div><a class="btn peach" href="'+esc(b.feature.url)+'" target="_blank" rel="noopener">'+esc(b.feature.label)+' ↗</a></div>':'')+'<div class="card"><div class="eyebrow">About</div><p style="margin-top:8px;font-size:17px;max-width:62ch">'+esc(b.about)+'</p></div>'+
    '<div><h3 style="font-size:22px;margin-bottom:12px">'+(id==="hq"?"Everything coming up":"Coming up at "+esc(b.name))+'</h3>'+
    ((id==="hq"?upcomingPublic(null,8):ev).length?'<div class="evlist">'+(id==="hq"?upcomingPublic(null,8):ev).map(e=>evRow(e)).join("")+'</div>':'<div class="empty">Nothing public on the calendar yet.</div>')+'</div></div>'+
    '<aside class="card" style="align-self:start"><div class="eyebrow">'+(id==="hq"?"Growing on the vine":"Part of the Groove Vine")+'</div><div class="links-list" style="margin-top:12px">'+
    sib.map(s=>'<a href="#b-'+s.id+'" style="text-decoration:none">'+chip(s.id)+'</a>').join("")+'</div>'+
    '<p class="muted" style="margin-top:14px;font-size:13.5px">Every company here is run from Grooveville LLC, the DrawUp Headquarters.</p></aside>'+
    '</div></section></div>';
}

/* ---------- calendar ---------- */
function calItems(team){
  const items=[];
  if(!team){pub().events.forEach(e=>items.push({kind:"event",date:e.date,title:e.title,brand:e.brand,start:e.start,id:e.id,vis:"public"}));return items}
  S.events.forEach(e=>items.push({kind:"event",date:e.date,title:e.title,brand:e.brand,start:e.start,id:e.id,vis:e.visibility}));
  S.reminders.filter(r=>!r.done).forEach(r=>items.push({kind:"reminder",date:r.date,title:r.title,brand:r.brand,start:r.time,id:r.id}));
  ledgerAll().filter(l=>l.type==="meeting").forEach(l=>items.push({kind:"meeting",date:l.date,title:l.title||"Meeting",brand:l.brand,start:l.start,id:l.id}));
  return items;
}
function viewCalendar(team){
  const [y,m]=S.cal.month.split("-").map(Number);
  const first=new Date(y,m-1,1), days=new Date(y,m,0).getDate(), off=first.getDay();
  const cells=Math.ceil((off+days)/7)*7;
  const all=calItems(team).filter(i=>S.cal.brand==="all"||i.brand===S.cal.brand);
  const byDay={};all.forEach(i=>{(byDay[i.date]=byDay[i.date]||[]).push(i)});
  Object.values(byDay).forEach(a=>a.sort((p,q)=>(p.start||"99")<(q.start||"99")?-1:1));
  const t=today();
  let g=DOW.map(d=>'<div class="dow">'+d+'</div>').join("");
  for(let c=0;c<cells;c++){
    const d=new Date(y,m-1,c-off+1), ds=iso(d), out=d.getMonth()!==m-1, list=byDay[ds]||[];
    g+='<button class="day'+(out?" out":"")+(ds===t?" today":"")+'" data-act="day" data-date="'+ds+'" aria-label="'+fmtDate(ds)+', '+list.length+' items"><span class="n">'+d.getDate()+'</span>'+
      list.slice(0,3).map(i=>'<span class="it'+(i.kind==="reminder"?" rem":"")+(i.vis==="private"?" priv":"")+'" style="'+cvar(i.brand)+'">'+(i.kind==="reminder"?"◆ ":i.kind==="meeting"?"◷ ":"")+(i.start?fmtTime(i.start).replace(":00","").replace(" ","").toLowerCase()+" ":"")+esc(i.title)+'</span>').join("")+
      (list.length>3?'<span class="more">+'+(list.length-3)+' more</span>':'')+'</button>';
  }
  const bt='<div class="brandtabs"><button data-act="cal-brand" data-v="all" class="'+(S.cal.brand==="all"?"on":"")+'">All companies</button>'+BRANDS.map(b=>'<button data-act="cal-brand" data-v="'+b.id+'" style="'+cvar(b.id)+'" class="'+(S.cal.brand===b.id?"on":"")+'">'+esc(brandInfo(b.id).name)+'</button>').join("")+'</div>';
  const bar='<div class="calbar"><h3>'+MONTHS[m-1]+' '+y+'</h3><button class="btn ghost sm" data-act="cal-prev" aria-label="Previous month">‹ Prev</button><button class="btn ghost sm" data-act="cal-today">Today</button><button class="btn ghost sm" data-act="cal-next" aria-label="Next month">Next ›</button>'+
    (team?'<span style="flex:1"></span><button class="btn ghost sm" data-act="new-rem">+ Reminder</button><button class="btn olive sm" data-act="new-event">+ Event</button>':'')+'</div>';
  const legend=team?'<div class="legend"><span class="pill pub">Public</span><span class="muted" style="font-size:13px">shows on the public calendar after you publish</span><span class="pill priv">Private</span><span class="muted" style="font-size:13px">back office only</span><span class="muted" style="font-size:13px">· ◆ reminder · ◷ meeting from timesheet</span></div>':'';
  const up=team?sortBy(S.events.filter(e=>e.date>=t),e=>e.date+(e.start||"")).filter(e=>S.cal.brand==="all"||e.brand===S.cal.brand).slice(0,8):upcomingPublic(S.cal.brand==="all"?null:S.cal.brand,8);
  return bt+bar+'<div class="calwrap"><div class="cal">'+g+'</div></div>'+legend+
    '<h3 style="font-size:22px;margin:30px 0 12px">Upcoming</h3>'+(up.length?'<div class="evlist">'+up.map(e=>evRow(e,{team})).join("")+'</div>':'<div class="empty">'+(team?'No upcoming events. Add one with “+ Event”.':'No public events posted yet. Check back soon.')+'</div>');
}
function viewPublicCalendar(){
  return '<section class="teamhead"><div class="wrap"><div class="eyebrow">Open to everyone</div><h1>Grooveville calendar</h1><p class="muted" style="margin-top:8px;max-width:60ch">Launches, shows and hosted events from every Grooveville company.</p></div></section><section style="padding-top:20px"><div class="wrap">'+viewCalendar(false)+'</div></section>';
}

/* ---------- collaborate ---------- */
function refCode(brand,date,id){return "GV-"+((BR[brand]||BR.hq).short).slice(0,3)+"-"+String(date||today()).replace(/-/g,"")+"-"+String(id||uid()).slice(-4).toUpperCase()}
function letterText(o){
  const b=brandInfo(o.brand), p=pub(), when=o.created||today();
  const contactLine=p.contactEmail?p.contactEmail:"the Grooveville team";
  const parent=o.brand!=="hq"?", a Grooveville LLC company,":"";
  if(o.direction==="incoming"){
    return "Ref: "+o.ref+"\nDate: "+longDate(when)+"\n\nTo: "+b.name+(o.brand!=="hq"?" (Grooveville LLC)":"")+"\nFrom: "+(o.contact?o.contact+", ":"")+o.org+(o.email?"\nEmail: "+o.email:"")+(o.phone?"\nPhone: "+o.phone:"")+(o.website?"\nWebsite: "+o.website:"")+
      "\n\nSubject: Collaboration request – "+(o.type||"Partnership")+"\n\nDear "+b.name+" team,\n\n"+o.org+" would like to collaborate with "+b.name+" on a "+String(o.type||"partnership").toLowerCase()+"."+(o.date?" Our proposed date is "+longDate(o.date)+".":"")+"\n\n"+(o.proposal||"")+
      "\n\nWe look forward to hearing from you.\n\nSincerely,\n"+(o.contact||o.org)+"\n"+o.org;
  }
  return "Ref: "+o.ref+"\nDate: "+longDate(when)+"\n\nTo: "+(o.contact?o.contact+"\n":"")+o.org+(o.email?"\n"+o.email:"")+
    "\n\nSubject: Invitation to collaborate – "+(o.type||"Partnership")+"\n\nDear "+(o.contact||o.org+" team")+",\n\nOn behalf of "+b.name+parent+" we would like to invite "+o.org+" to collaborate with us on a "+String(o.type||"partnership").toLowerCase()+"."+(o.date?" We are proposing "+longDate(o.date)+".":"")+"\n\n"+(o.proposal||"")+
    "\n\nGrooveville LLC is the DrawUp Headquarters for Grooveville Entertainment, Grooveville Music, Vybr8, Pathd, Grooveville Rentals, W4W, DrawUp AEC, Shadow Crown Universe and What If Tomorrow. Please reply to "+contactLine+" to confirm your interest or to set up a call.\n\nSincerely,\n"+(p.signer||"The Grooveville Team")+"\n"+b.name+(o.brand!=="hq"?"\nGrooveville LLC":"");
}
function letterHTML(o){
  const b=brandInfo(o.brand);
  return '<div class="letter" id="letter"><div class="lh"><img src="'+LOGO+'" alt="" width="44" height="44" class="logoimg">'+
    esc(o.direction==="incoming"?"Official collaboration request":b.name)+'</div>'+esc(letterText(o))+'</div>';
}
function viewCollab(pre){
  const p=pub();
  const opts=BRANDS.map(b=>'<option value="'+b.id+'"'+(b.id===(pre||"hq")?" selected":"")+'>'+esc(brandInfo(b.id).name)+'</option>').join("");
  return '<section class="teamhead"><div class="wrap"><div class="eyebrow">Official outreach</div><h1>Collaborate with Grooveville</h1><p class="muted" style="margin-top:8px;max-width:64ch">Send an official request to work with Grooveville LLC or one of our companies. Fill in the form to create a formal, reference-numbered request, then send it to us.</p></div></section>'+
  '<section style="padding-top:20px"><div class="wrap cols2">'+
  '<form class="card" id="collabForm" style="display:flex;flex-direction:column;gap:14px;min-width:0">'+
    '<div class="grid2"><label class="f">Organization or business *<input class="i" id="c-org" name="org" required></label><label class="f">Your name *<input class="i" id="c-contact" name="contact" required></label></div>'+
    '<div class="grid2"><label class="f">Email *<input class="i" id="c-email" name="email" type="email" required></label><label class="f">Phone<input class="i" id="c-phone" name="phone" type="tel"></label></div>'+
    '<label class="f">Website or social link<input class="i" id="c-web" name="website" type="url" placeholder="https://"></label>'+
    '<div class="grid2"><label class="f">Collaborate with *<select class="i" id="c-brand" name="brand">'+opts+'</select></label><label class="f">Type of collaboration *<select class="i" id="c-type" name="type">'+COLLAB_TYPES.map(t=>'<option>'+t+'</option>').join("")+'</select></label></div>'+
    '<label class="f">Proposed date<input class="i" id="c-date" name="date" type="date"></label>'+
    '<label class="f">Tell us about the collaboration *<textarea class="i" id="c-proposal" name="proposal" required placeholder="What you have in mind, who it is for, and what you would like from Grooveville."></textarea></label>'+
    '<div><button class="btn peach" type="submit">Create official request</button></div></form>'+
  '<aside style="display:flex;flex-direction:column;gap:14px"><div class="card"><div class="eyebrow">How it works</div><ol style="margin:10px 0 0;padding-left:20px;display:grid;gap:8px"><li>Fill in the form with your organization\'s details.</li><li>We format it as an official request with a reference number.</li><li>Copy it and email it to Grooveville'+(p.contactEmail?' at <b>'+esc(p.contactEmail)+'</b>':'')+'.</li><li>Our team replies to set up next steps.</li></ol></div>'+
  '<div class="card" style="background:var(--teal-soft);border-color:transparent"><div class="eyebrow" style="color:var(--teal-ink)">Grooveville companies</div><div class="links-list" style="margin-top:10px">'+BRANDS.map(b=>chip(b.id)).join("")+'</div></div>'+
  (S.isAdmin&&!p.contactEmail?'<div class="banner warn" style="margin:0">Add a contact email in Back office › Site settings so visitors know where to send requests.</div>':'')+
  '</aside></div></section>';
}
function collabSubmit(form){
  const o=formObj(form);o.direction="incoming";o.created=today();o.id=uid();o.ref=refCode(o.brand,o.created,o.id);o.status="talking";
  const p=pub();
  openModal('<h3>Your official request is ready</h3><p class="muted">Reference <b class="mono">'+esc(o.ref)+'</b>. Copy it and email it to Grooveville'+(p.contactEmail?'.':' through our official contact.')+'</p>'+
    (p.contactEmail?'<div class="card" style="padding:12px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span>Send to</span><b class="mono" style="user-select:all">'+esc(p.contactEmail)+'</b><a class="btn ghost sm" href="mailto:'+esc(p.contactEmail)+'?subject='+encodeURIComponent("Collaboration request "+o.ref)+'&body='+encodeURIComponent(letterText(o))+'">Open in email app</a></div>':'')+
    letterHTML(o)+
    '<div class="row">'+(S.isAdmin?'<button class="btn ghost left" data-act="log-incoming">Save to Collabs</button>':'')+'<button class="btn ghost" data-act="close-modal">Close</button><button class="btn teal" data-act="copy-letter">Copy request</button></div>',
    el=>{el._letter=letterText(o);el._rec=o});
}

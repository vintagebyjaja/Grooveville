/* Shadow Crown Universe + Living World (Book 1). Plain JavaScript, no build step.
   Routes live under /shadowcrown/ (see ROUTES). In the Claude preview it runs in "mem" mode with in-memory routing. */
(function(){
"use strict";
const D=window.SC_DATA, CFG=window.SC_CONFIG||{}, MODE=window.SC_MODE||"path", BASE="/shadowcrown";
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const A=n=>(window.SC_ASSETS&&window.SC_ASSETS[n])||BASE+"/assets/"+n+".webp";
const GVLOGO=(window.SC_ASSETS&&window.SC_ASSETS.gvlogo)||"/logo.webp";
const reduce=()=>window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad=n=>String(n).padStart(2,"0");

/* ---------- routing (one helper, no hardcoded paths elsewhere) ---------- */
const ROUTES=["/","/read","/watch","/store","/characters","/map","/play","/play/new","/play/continue","/play/house","/play/school","/play/basketball","/play/daydream","/play/missions","/play/collections","/play/friends"];
let memPath="/",memStack=[];
function full(){if(MODE==="mem")return memPath;let p=location.pathname;if(p.indexOf(BASE)===0)p=p.slice(BASE.length);p=p.replace(/\/index\.html$/,"").replace(/\/+$/,"");return (p||"/")+location.search}
const path=()=>full().split("?")[0]||"/";
const qs=()=>{const q=full().split("?")[1]||"";const o={};q.split("&").forEach(kv=>{if(!kv)return;const [k,v]=kv.split("=");o[decodeURIComponent(k)]=decodeURIComponent(v||"")});return o};
function href(p){const [pa,q]=p.split("?");return BASE+(pa==="/"?"/":pa+"/")+(q?"?"+q:"")}
function go(p,opt){opt=opt||{};
  if(MODE==="mem"){if(!opt.replace)memStack.push(memPath);memPath=p}
  else{const d=(history.state&&history.state.d)||0;history[opt.replace?"replaceState":"pushState"]({d:opt.replace?d:d+1},"",href(p))}
  render();if(!opt.keep)window.scrollTo(0,0)}
function back(){if(MODE==="mem"){if(memStack.length){memPath=memStack.pop();render();return}return leave("/#b-scu")}
  if(history.state&&history.state.d>0){history.back();return}leave("/#b-scu")}
if(MODE!=="mem"&&!(history.state&&"d" in history.state))history.replaceState({d:0},"",location.href);
window.addEventListener("popstate",()=>{stopGames();render()});
const L=(p,inner,cls,extra)=>'<a href="'+esc(href(p))+'" data-go="'+esc(p)+'"'+(cls?' class="'+cls+'"':'')+(extra||"")+'>'+inner+'</a>';
function nav(url){if(MODE==="mem"){try{window.parent.location.hash=url.replace(/^\//,"")||"#home";return}catch(e){}}location.href=url}
function leave(url){if(reduce()){nav(url);return}const p=document.createElement("div");p.className="portal out";p.innerHTML="<i></i>";document.body.appendChild(p);setTimeout(()=>nav(url),850)}
function arrive(){let s=null;try{s=sessionStorage.getItem("scPortal");sessionStorage.removeItem("scPortal")}catch(e){}if(!s||reduce())return;const p=document.createElement("div");p.className="portal";p.innerHTML="<i></i>";document.body.appendChild(p);setTimeout(()=>p.remove(),1100)}

/* ---------- save game ---------- */
const SKEY="scLivingWorld1";
const fresh=()=>({v:1,started:false,xp:0,stress:20,outfit:"hoodie",step:{},done:{},col:{},visits:{},seen:[],best:0,friends:[],name:"",code:"",last:"/play/house",room:"living",flags:{},updatedAt:0});
function loadSave(){try{return Object.assign(fresh(),JSON.parse(localStorage.getItem(SKEY)||"{}"))}catch(e){return fresh()}}
let G=loadSave();
function persist(){G.updatedAt=Date.now();try{localStorage.setItem(SKEY,JSON.stringify(G))}catch(e){}cloudSave()}
const lvl=()=>1+Math.floor(G.xp/250);
function addXP(n){const before=lvl();G.xp+=n;if(lvl()>before)toast("Level up! You're level "+lvl())}
function setStress(v){G.stress=Math.max(0,Math.min(100,Math.round(v)))}
const curMission=()=>D.missions.find(m=>!G.done[m.id])||null;
const nextStep=()=>{const m=curMission();return m?m.steps.find(s=>!G.step[s.k])||null:null};
const isNext=k=>{const s=nextStep();return !!s&&s.k===k};
function give(id){if(G.col[id])return;G.col[id]=Date.now();const c=D.collect[id]||(id.indexOf("loc-")===0?{n:(place(id.slice(4))||{}).name}:{n:id});toast("Collectible unlocked: "+c.n)}
function progress(k){
  const m=curMission(),s=nextStep();if(!s||s.k!==k)return false;
  G.step[k]=true;addXP(25);toast("✓ "+s.t);
  if(m.steps.every(x=>G.step[x.k])){G.done[m.id]=true;addXP(m.xp);if(m.reward)give(m.reward);
    setTimeout(()=>{const nx=curMission();modal('<div class="kick">Mission complete</div><h2 style="font-size:40px;margin-top:8px">'+esc(m.title)+'</h2><p class="muted" style="margin-top:10px">+'+m.xp+' XP'+(m.reward&&D.collect[m.reward]?' · Unlocked: '+esc(D.collect[m.reward].n):'')+'</p>'+
      (nx?'<p style="margin-top:14px">Next: <b>'+esc(nx.title)+'</b></p><div class="btnrow"><button class="btn gold" data-act="go-step">Continue</button><button class="btn ghost" data-act="close">Stay here</button></div>':
      '<p style="margin-top:14px">You finished the Living World chapter of Book 1. The rest of the story is in the book.</p><div class="btnrow"><a class="btn gold" href="'+esc(D.book.amazon)+'" target="_blank" rel="noopener">Read Zeke\'s Daydream ↗</a><button class="btn ghost" data-act="close">Keep exploring</button></div>'))},500)}
  persist();return true}

/* ---------- Grooveville account (Firebase), optional ---------- */
let FB=null,USER=null,AUTHED=false;
function fbInit(){if(MODE!=="path"||!window.firebase||!window.FIREBASE_CONFIG||/YOUR_/.test(window.FIREBASE_CONFIG.apiKey||"")){AUTHED=true;return}
  try{if(!firebase.apps.length)firebase.initializeApp(window.FIREBASE_CONFIG);FB=firebase.firestore();
    firebase.auth().onAuthStateChanged(async u=>{USER=u;AUTHED=true;if(u)await cloudLoad();render()})}catch(e){AUTHED=true}}
async function cloudLoad(){try{const d=await FB.doc("scsave/"+USER.uid).get();if(d.exists){const c=d.data().save;if(c&&(c.updatedAt||0)>(G.updatedAt||0)){G=Object.assign(fresh(),c);try{localStorage.setItem(SKEY,JSON.stringify(G))}catch(e){}}}
  if(!G.code){G.code=Math.random().toString(36).slice(2,8).toUpperCase();}if(!G.name)G.name=(USER.email||"Player").split("@")[0].slice(0,18);persist()}catch(e){}}
let csT=0;
function cloudSave(){if(!FB||!USER)return;clearTimeout(csT);csT=setTimeout(()=>{FB.doc("scsave/"+USER.uid).set({save:G,updatedAt:G.updatedAt}).catch(()=>{});
  if(G.code)FB.doc("scplayers/"+USER.uid).set({code:G.code,name:G.name||"Player",level:lvl(),loc:G.loc||"Upendo House",mission:(curMission()||{title:"Book 1 complete"}).title,updatedAt:Date.now()},{merge:true}).catch(()=>{})},1200)}

/* ---------- ui helpers ---------- */
let toastT=0;
function toast(m){let t=$(".toast");if(!t){t=document.createElement("div");t.className="toast";t.setAttribute("role","status");document.body.appendChild(t)}t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},2600)}
function modal(html,mount){closeModal();const m=document.createElement("div");m.className="modal";m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.innerHTML='<div>'+html+'</div>';document.body.appendChild(m);
  m.addEventListener("click",e=>{if(e.target===m)closeModal()});if(mount)mount(m.firstChild);const f=m.querySelector("button,input,a");if(f)setTimeout(()=>f.focus(),30);return m}
function closeModal(){document.querySelectorAll(".modal").forEach(m=>{if(m._cleanup)m._cleanup();m.remove()})}
const place=id=>D.places.find(p=>p.id===id);
const CH=D.chars;
const meter=(v,cls)=>'<span class="meter'+(cls?" "+cls:"")+'"><i style="width:'+Math.max(0,Math.min(100,v))+'%"></i></span>';

/* ---------- chrome ---------- */
const MENU=[["/","Universe"],["/read","Books"],["/watch","Watch"],["/play","Play"],["/characters","Characters"],["/map","Map"],["/store","Store"]];
const GAMEBAR=[["/map","Map"],["/play/missions","Missions"],["/play/friends","Friends"],["/play/collections","Collections"],["/play","Progress"]];
function chrome(){
  const p=path(),on=x=>x==="/"?p==="/":p===x||p.indexOf(x+"/")===0;
  const game=p.indexOf("/play")===0||p==="/map";
  return '<header class="top"><div class="wrap"><a class="gv-home" href="/" data-leave="/" title="Back to Grooveville"><img src="'+esc(GVLOGO)+'" alt="Grooveville home"></a><button class="back" data-act="back" aria-label="Go back">‹ Back</button>'+
    L("/",'<img src="'+esc(A("sc-logo"))+'" alt=""><b>SHADOW <i>CROWN</i></b>',"brand",' aria-label="Shadow Crown Universe home"')+
    '<nav class="menu" aria-label="Shadow Crown">'+MENU.map(([h,l])=>L(h,l,on(h)&&!(h==="/play"&&p==="/map")?"on":"",on(h)?' aria-current="page"':'')).join("")+'</nav>'+
    L("/play",'<img src="'+esc(A("p-zeke"))+'" alt="Zeke, your character">',"me",' title="Living World"')+'</div></header>'+
    (game?'<div class="gamebar"><div class="wrap">'+GAMEBAR.map(([h,l])=>L(h,l,p===h?"on":"")).join("")+'<div class="hud" aria-label="Your progress"><span>LV '+lvl()+'</span><span><span class="lbl">XP </span>'+meter((G.xp%250)/2.5,"gold")+'</span><span title="Mind: lower stress means clearer visions"><span class="lbl">MIND </span>'+meter(100-G.stress)+'</span></div></div></div>':'');
}
function footer(){return '<footer class="ft"><div class="wrap"><span>© '+new Date().getFullYear()+' Grooveville Entertainment · Shadow Crown Universe</span><span style="display:flex;gap:16px;flex-wrap:wrap"><a href="'+esc(D.book.instagram)+'" target="_blank" rel="noopener">@shadowcrown.ent ↗</a><a href="/#b-scu" data-leave="/#b-scu">Back to Grooveville</a><a href="#" data-act="top">Back to top ↑</a></span></div></footer>'}

/* ---------- universe pages ---------- */
function vHome(){
  const fam=id=>D.families.find(f=>f.id===id).members.map(c=>L("/characters?c="+c,'<img src="'+esc(A(CH[c].pic))+'" alt="" loading="lazy"><span><b>'+esc(CH[c].name.replace(/^(Coach|Dr\.) /,"").split(" ")[0])+'</b><small>'+esc(CH[c].title)+'</small></span>',"who")).join("");
  return '<section class="hero"><div class="bg"><img src="'+esc(A("g-hero"))+'" alt="Zeke and Prince look out over the Charlotte skyline at dusk"></div><div class="wrap"><img class="logo" src="'+esc(A("sc-logo"))+'" alt="Shadow Crown"><h1>A world within ours.</h1><div class="tags">BOOKS • SERIES • GAME • COMMUNITY</div>'+
    '<div class="rwp">'+L("/read",'<span class="ico">📖</span><span><b>READ</b><small>Experience the story.</small></span>',"r")+L("/watch",'<span class="ico">▶</span><span><b>WATCH</b><small>See it come to life.</small></span>',"w")+L("/play",'<span class="ico">🎮</span><span><b>PLAY</b><small>Step into the universe.</small></span>',"p")+'</div></div></section>'+
    '<section><div class="wrap split2"><img class="bookimg" src="'+esc(A("sc-cover"))+'" alt="Shadow Crown Book 1: Zeke\'s Daydream cover" loading="lazy"><div><div class="kick">'+esc(D.book.series)+' · Out now</div><h2 style="font-size:clamp(36px,5vw,64px);margin-top:10px">Zeke\'s Daydream</h2><p class="muted" style="margin-top:14px;font-size:18px;max-width:52ch">'+esc(D.book.blurb)+'</p><div class="btnrow"><a class="btn gold" href="'+esc(D.book.amazon)+'" target="_blank" rel="noopener">Buy Book 1 ↗</a>'+L("/read","Read more","btn ghost")+'</div></div></div></section>'+
    '<section style="padding-top:0"><div class="wrap"><div class="sechd"><div><div class="kick">Familia ya Mungu</div><h2>Meet the Upendo family</h2></div>'+L("/characters","All characters","btn ghost sm")+'</div><div class="fam">'+fam("upendo")+'</div>'+
    '<div class="sechd" style="margin-top:40px"><div><div class="kick">Friends of the family</div><h2>The Dixons</h2></div></div><div class="fam">'+fam("dixon")+'</div></div></section>'+
    '<section style="padding-top:0"><div class="wrap"><div class="sechd"><div><div class="kick">Living World · Book 1</div><h2>Real places. Real stories.</h2></div>'+L("/map","Open the Charlotte map","btn sm")+'</div>'+
    '<div class="tiles">'+[["/play/house","g-upendo","The Upendo House"],["/play/school","g-school","Evolve Prep"],["/play/basketball","g-court","The Court"],["/play/daydream","g-dream","Zeke's Daydream"]].map(([h,i,t])=>L(h,'<img src="'+esc(A(i))+'" alt="" loading="lazy"><b>'+t+'</b>',"tile")).join("")+'</div></div></section>';
}
function vRead(){
  return '<section><div class="wrap split2"><img class="bookimg" src="'+esc(A("sc-cover"))+'" alt="Shadow Crown Book 1: Zeke\'s Daydream cover"><div><div class="kick">'+esc(D.book.series)+'</div><h1 style="font-size:clamp(40px,6vw,76px);margin-top:10px">Zeke\'s Daydream</h1><p class="muted" style="margin-top:6px">by '+esc(D.book.author)+' · ISBN '+esc(D.book.isbn)+'</p><p style="margin-top:16px;font-size:18px;max-width:54ch">'+esc(D.book.blurb)+'</p>'+
    '<div class="btnrow"><a class="btn gold" href="'+esc(D.book.amazon)+'" target="_blank" rel="noopener">Buy book ↗</a>'+(CFG.sampleUrl?'<a class="btn ghost" href="'+esc(CFG.sampleUrl)+'" target="_blank" rel="noopener">Read sample ↗</a>':'<button class="btn ghost" disabled title="Coming soon">Read sample · soon</button>')+'</div>'+
    '<form class="card glowcard" id="redeem" style="margin-top:22px;display:flex;flex-direction:column;gap:10px"><b>Redeem code</b><span class="muted" style="font-size:14px">Unlock exclusive in-game content with the code inside your book.</span><div style="display:flex;gap:8px;flex-wrap:wrap"><label class="sr" for="rcode">Book code</label><input id="rcode" class="field" style="flex:1;min-width:160px;background:#0b0716;border:1.5px solid #ffffff22;border-radius:10px;padding:10px 12px;color:#fff" autocomplete="off" placeholder="Enter code"><button class="btn sm">Redeem</button></div></form></div></div></section>'+
    '<section style="padding-top:0"><div class="wrap"><div class="sechd"><div><div class="kick">Groove Reads</div><h2>Read, listen or read along</h2></div></div><div id="scBooks" aria-live="polite"><p class="muted">'+(MODE==="mem"?"Groove Reads books appear here on the live site.":"Loading books…")+'</p></div></div></section>';
}
/* Shadow Crown books published on Groove Reads (public catalog only; purchases and paid pages stay on grooveville.org, checked by the server) */
function scBooks(){const el=$("#scBooks");if(!el||MODE==="mem")return;const R="https://grooveville.org/?skin=sc#reads/";
  fetch("/api/reads/catalog?universe=shadowcrown").then(r=>r.ok?r.json():{books:[]}).then(j=>{const B=(j&&j.books)||[];if(!$("#scBooks"))return;
    el.innerHTML=B.length?'<div class="scbooks">'+B.map(b=>{return '<div class="card glowcard scbook">'+(b.cover?'<img src="'+esc(b.cover)+'" alt="'+esc(b.title)+' cover" loading="lazy">':'')+'<div><b>'+esc(b.title)+'</b>'+(b.series?'<small class="muted">'+esc(b.series)+(b.volume?" · Book "+esc(b.volume):"")+'</small>':'')+'<p class="muted">'+esc(String(b.desc||"").slice(0,180))+'</p><div class="btnrow">'+
      '<a class="btn gold sm" href="'+R+esc(b.id)+'/read">'+(b.preview?"Read "+b.preview+"-page preview":"Read")+'</a>'+(b.audio?'<a class="btn ghost sm" href="'+R+esc(b.id)+'/listen">Listen</a>':'')+(b.readalong?'<a class="btn ghost sm" href="'+R+esc(b.id)+'/along">Read Along</a>':'')+'<a class="btn ghost sm" href="'+R+esc(b.id)+'">'+(b.free?"Details":"Details &amp; buy")+'</a></div></div></div>'}).join("")+'</div>':'<p class="muted">Shadow Crown books are coming to Groove Reads soon.</p>'}).catch(()=>{el.innerHTML='<p class="muted">Books couldn\'t load right now.</p>'})}
function vWatch(){
  const tr=(CFG.trailers||[]).filter(t=>t&&t.youtube);
  return '<section><div class="wrap"><div class="kick">Watch</div><h1 style="font-size:clamp(40px,6vw,76px);margin-top:10px">See it come to life.</h1><p class="muted" style="margin-top:12px;max-width:60ch">Trailers, the series and behind-the-scenes from the Shadow Crown Universe.</p>'+
    (tr.length?'<div class="tiles" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));margin-top:24px">'+tr.map(t=>'<div><div style="aspect-ratio:16/9;border-radius:14px;overflow:hidden;border:1px solid #ffffff1a"><iframe title="'+esc(t.title||"Shadow Crown video")+'" src="https://www.youtube-nocookie.com/embed/'+esc(t.youtube)+'" style="width:100%;height:100%;border:0" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" loading="lazy"></iframe></div><b style="display:block;margin-top:8px">'+esc(t.title||"")+'</b></div>').join("")+'</div>':
    '<div class="tiles" style="margin-top:24px">'+[["g-hero","Book 1 trailer"],["g-dream","Zeke's Daydream · teaser"],["h-living","Inside the Upendo House"]].map(([i,t])=>'<div class="tile" style="cursor:default"><img src="'+esc(A(i))+'" alt="" loading="lazy"><b>'+t+'</b><span class="tag" style="position:absolute;top:10px;left:10px;z-index:1">Coming soon</span></div>').join("")+'</div><p class="muted" style="margin-top:14px">Follow <a href="'+esc(D.book.instagram)+'" target="_blank" rel="noopener">@shadowcrown.ent</a> for the first trailer.</p>')+'</div></section>';
}
function vStore(){
  return '<section><div class="wrap"><div class="kick">Store</div><h1 style="font-size:clamp(40px,6vw,76px);margin-top:10px">Books & merch</h1><div class="split2" style="margin-top:26px"><div class="card glowcard" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><img src="'+esc(A("sc-cover"))+'" alt="" style="width:140px;border-radius:10px"><div style="flex:1;min-width:180px"><b style="font-size:20px">Shadow Crown: Zeke\'s Daydream</b><p class="muted">Book 1 · '+esc(D.book.author)+'</p><a class="btn gold sm" style="margin-top:12px" href="'+esc(D.book.amazon)+'" target="_blank" rel="noopener">Buy on Amazon ↗</a></div></div>'+
    '<div class="coll">'+["Crown hoodie","Prince crown tag","Charlotte skyline poster"].map(n=>'<div class="ci"><div class="im" style="font-size:38px">♛</div><span>'+n+'<small>Coming soon</small></span></div>').join("")+'</div></div><p class="muted" style="margin-top:16px">Merch drops are announced on <a href="'+esc(D.book.instagram)+'" target="_blank" rel="noopener">@shadowcrown.ent</a>.</p></div></section>';
}
function vCharacters(){
  const id=qs().c;if(id&&CH[id])return vProfile(id);
  return '<section><div class="wrap">'+D.families.map(f=>'<div class="sechd" style="margin-top:20px"><div><div class="kick">'+esc(f.motto)+'</div><h2>'+esc(f.name)+'</h2></div></div><div class="fam">'+f.members.map(c=>L("/characters?c="+c,'<img src="'+esc(A(CH[c].pic))+'" alt="" loading="lazy"><span><b>'+esc(CH[c].name)+'</b><small>'+esc(CH[c].title)+(CH[c].age?" · "+CH[c].age:"")+'</small></span>',"who")).join("")+'</div>').join("")+'</div></section>';
}
function vProfile(id){
  const c=CH[id];
  return '<section><div class="wrap prof"><div>'+(c.sheet?'<img class="sheet" src="'+esc(A(c.sheet))+'" alt="'+esc(c.name)+' character sheet">':'<img class="sheet" src="'+esc(A(c.pic))+'" alt="'+esc(c.name)+'">')+'</div><div>'+
    L("/characters","‹ All characters","btn ghost sm")+'<h1 style="margin-top:14px">'+esc(c.name)+'</h1><div class="kick" style="color:var(--purple2);margin-top:6px">'+esc(c.title)+'</div>'+
    '<dl class="dl">'+(c.age?'<dt>Age</dt><dd>'+c.age+'</dd>':'')+'<dt>Role</dt><dd>'+esc(c.role)+'</dd>'+(c.ability?'<dt>Ability</dt><dd style="color:var(--peach)">'+esc(c.ability)+'</dd>':'')+(c.personality?'<dt>Personality</dt><dd>'+esc(c.personality)+'</dd>':'')+'</dl>'+
    '<p style="margin-top:18px;font-size:17px">'+esc(c.about)+'</p>'+Object.entries(c.stats||{}).map(([k,v])=>'<div class="stat"><span>'+esc(k)+'</span>'+meter(v)+'<span>'+v+'</span></div>').join("")+
    (c.quote?'<p class="quote">“'+esc(c.quote)+'”</p>':'')+(c.facts&&c.facts.length?'<h3 style="font-size:22px;margin-top:22px">Fun facts</h3><ul style="margin:8px 0 0;padding-left:20px">'+c.facts.map(f=>'<li>'+esc(f)+'</li>').join("")+'</ul>':'')+
    '<div class="btnrow">'+L("/play","Enter the Living World","btn")+'</div></div></div></section>';
}

/* ---------- play: hub ---------- */
function vPlay(){
  const m=curMission(),s=nextStep();
  if(!G.started)return '<section><div class="wrap"><div class="scene" style="display:grid;place-items:center;text-align:center"><img class="bgi" src="'+esc(A("g-hero"))+'" alt=""><div style="max-width:560px;padding:30px"><img src="'+esc(A("sc-logo"))+'" alt="" style="width:150px;margin:0 auto"><div class="kick" style="margin-top:16px">Shadow Crown: Living World</div><h1 style="font-size:clamp(38px,6vw,70px);margin-top:8px">Book 1 · Zeke\'s Daydream</h1><p style="margin-top:12px">Play as Zeke, with Prince at your side. Explore the Upendo House, Evolve Prep and real Charlotte, and learn to read your visions before they read you.</p><div class="btnrow" style="justify-content:center">'+L("/play/new","New game","btn gold")+'</div><p class="muted" style="font-size:13px;margin-top:12px">Progress saves on this device'+(MODE==="path"?', and to your Grooveville account when you sign in.':'.')+'</p></div></div></div></section>';
  return '<section style="padding-top:20px"><div class="wrap"><div class="hubgrid"><div class="card glowcard"><div class="kick">'+(m?"Mission "+m.id+" of "+D.missions.length:"Book 1 complete")+'</div><h2 style="font-size:clamp(30px,4vw,46px);margin-top:8px">'+esc(m?m.title:"You did it")+'</h2><p class="muted" style="margin-top:8px">'+esc(m?m.brief:"The Living World chapter is complete. Replay scenes, find every collectible, or read what happens next.")+'</p>'+
    (m?'<ul class="steps">'+m.steps.map(x=>'<li class="'+(G.step[x.k]?"d":s&&s.k===x.k?"n":"")+'">'+(G.step[x.k]?"✓":s&&s.k===x.k?"▸":"○")+' '+esc(x.t)+'</li>').join("")+'</ul><div class="btnrow"><button class="btn gold" data-act="go-step">Continue</button>'+L("/play/missions","All missions","btn ghost")+'</div>':'<div class="btnrow"><a class="btn gold" href="'+esc(D.book.amazon)+'" target="_blank" rel="noopener">Get Book 1 ↗</a></div>')+'</div>'+
    '<div class="card"><div style="display:flex;gap:14px;align-items:center"><img src="'+esc(A("p-zeke"))+'" alt="" style="width:64px;height:64px;border-radius:50%;border:2px solid var(--gold)"><div><b style="font-family:var(--f-d);font-size:28px">ZEKE</b><div class="muted" style="font-size:13px">Level '+lvl()+' · '+G.xp+' XP · '+esc((D.outfits.find(o=>o[0]===G.outfit)||D.outfits[0])[1])+'</div></div></div>'+
    '<div class="stat"><span>XP</span>'+meter((G.xp%250)/2.5,"gold")+'<span>'+(G.xp%250)+'</span></div><div class="stat"><span>Mind</span>'+meter(100-G.stress)+'<span>'+(100-G.stress)+'</span></div><div class="stat"><span>Hoops best</span>'+meter(Math.min(100,G.best/10),"gold")+'<span>'+G.best+'</span></div>'+
    '<p class="muted" style="font-size:13px;margin-top:12px">Lower stress means clearer visions. Rest at home, walk with Prince, or breathe in the daydream.</p><div class="btnrow">'+L("/play/new","New game","btn ghost sm")+'</div></div></div>'+
    '<div class="tiles" style="margin-top:18px">'+[["/play/house","g-upendo","Upendo House"],["/play/school","g-school","Evolve Prep"],["/play/basketball","g-court","Basketball"],["/play/daydream","g-dream","Daydream"],["/map","h-ext","Charlotte map"],["/play/collections","c-places","Collections"]].map(([h,i,t])=>L(h,'<img src="'+esc(A(i))+'" alt="" loading="lazy"><b>'+t+'</b>',"tile")).join("")+'</div></div></section>';
}
function stepGo(){const s=nextStep();go(s?s.go:"/play")}

/* ---------- play: scenes ---------- */
const ROOMS=[["living","g-upendo","Living room"],["den","h-living","Den"],["kitchen","h-kitchen","Kitchen"],["bedroom","h-bedroom","Zeke's room"],["outside","h-ext","Outside"]];
function scene(o){
  const s=nextStep(),m=curMission();
  return '<section style="padding-top:16px"><div class="wrap"><div class="scene" id="scene"><img class="bgi" id="sbg" src="'+esc(A(o.bg))+'" alt="'+esc(o.alt||"")+'">'+
    '<div class="stitle"><img src="'+esc(A("sc-logo"))+'" alt=""><span><b>'+esc(o.title)+'</b><small>'+esc(o.sub)+'</small></span></div>'+
    (o.rooms||(s?'<div class="objective"><b>'+esc(m.title)+'</b>'+esc(s.t)+'</div>':''))+
    '<div class="acts" role="group" aria-label="Actions">'+o.actions.map(a=>'<button data-act="'+a.act+'"'+(a.arg?' data-arg="'+esc(a.arg)+'"':'')+(a.hot?' class="hot"':'')+'><i aria-hidden="true">'+a.ico+'</i>'+esc(a.label)+'</button>').join("")+'</div>'+
    '<div id="dlg"></div></div>'+(o.rooms&&s?'<p class="muted" style="margin-top:10px">▸ <b style="color:var(--gold)">'+esc(m.title)+':</b> '+esc(s.t)+'</p>':'')+'</div></section>';
}
function vHouse(){
  G.last="/play/house";G.loc="Upendo House";
  const k=(nextStep()||{}).k||"",room=ROOMS.find(r=>r[0]===G.room)||ROOMS[0];
  return scene({bg:room[1],title:"The Upendo House",sub:"Home base · "+room[2],alt:"Inside the Upendo House",
    rooms:'<div class="rooms" role="group" aria-label="Rooms">'+ROOMS.map(r=>'<button data-act="room" data-arg="'+r[0]+'" class="'+(r[0]===room[0]?"on":"")+'">'+r[2]+'</button>').join("")+'</div>',
    actions:[{act:"talk-menu",ico:"💬",label:"Talk to Family",hot:/^talk-|^tell$/.test(k)},{act:"journal",ico:"📓",label:"Check Journal",hot:k==="journal"},{act:"outfit",ico:"👕",label:"Change Outfit"},{act:"go-step",ico:"▶",label:"Start Mission"},{act:"rest",ico:"🛏",label:"Rest / Save",hot:k==="migraine"}]});
}
function vSchool(){
  G.last="/play/school";G.loc="Evolve Preparatory";
  const k=(nextStep()||{}).k||"";
  return scene({bg:"g-school",title:"Evolve Preparatory",sub:"School location",alt:"Students walking outside Evolve Preparatory",
    actions:[{act:"class",ico:"📚",label:"Attend Class",hot:k==="class"},{act:"friends",ico:"🗨",label:"Talk to Friends",hot:k==="talk-friends"},{act:"hoops",ico:"🏀",label:"Basketball Practice",hot:k==="hoops"},{act:"explore",ico:"🧭",label:"Explore"},{act:"coach",ico:"⭐",label:"Story Mission",hot:k==="talk-coach"}]});
}
function afterScene(){const p=path();
  if(p==="/play/school"&&isNext("visit-evolve"))progress("visit-evolve");
  if(p==="/play/house"&&isNext("migraine")&&!G.flags.mig){G.flags.mig=1;setStress(Math.max(G.stress,75));persist();say([["zeke","My head… it's pounding. Something's coming."],["krystal","Lie down, baby. Lights low. Rest first, then we talk."]])}
}
/* dialogue */
function say(lines,done,choices){
  const box=$("#dlg");if(!box){if(done)done();return}let i=0;
  const show=()=>{const [who,txt]=lines[i],c=CH[who]||{name:who,pic:"p-zeke"};const last=i===lines.length-1;
    box.innerHTML='<div class="dlg" role="dialog" aria-label="Conversation"><div class="sp"><img src="'+esc(A(c.pic))+'" alt=""><b>'+esc(who==="shawn"?"Coach Dixon":c.name)+'</b></div><p>'+esc(txt)+'</p>'+
      (last&&choices?'<div class="ch">'+choices.map((ch,n)=>'<button data-ch="'+n+'">'+esc(ch[0])+'</button>').join("")+'</div>':'<button class="btn sm nx" data-nx>'+(last?"Done":"Next ›")+'</button>')+'<div style="clear:both"></div></div>';
    const nx=box.querySelector("[data-nx]");if(nx){nx.focus();nx.onclick=()=>{if(last){box.innerHTML="";if(done)done()}else{i++;show()}}}
    box.querySelectorAll("[data-ch]").forEach(b=>b.onclick=()=>{const ch=choices[Number(b.dataset.ch)];say([["zeke",ch[0]],["shawn",ch[1]]],done)});
    const fb=box.querySelector("[data-ch]");if(fb)fb.focus()};
  show();
}
function talkTo(id){
  const k=(nextStep()||{}).k||"",T=D.talk[id]||{};
  if(k==="tell"&&["krystal","zavian","zora","kingston"].includes(id))return say(D.talk.krystal.tell,()=>progress("tell"));
  if(T[k])return say(T[k],()=>{progress(k);if(k==="talk-kingston")give("m1")});
  const g=T._||[["zeke","…"]];say([g[Math.floor(Math.random()*g.length)]]);
}
/* focus mini-game (class) */
function focusGame(){
  let pos=0,dir=1,hits=0,tries=0,raf=0,last=performance.now();const speed=.55+G.stress/160;
  const m=modal('<div class="kick">Attend class</div><h2 style="font-size:34px;margin-top:6px">Stay focused</h2><p class="muted" style="margin-top:6px">Press Focus (or the space bar) when the marker is inside the gold zone. Hit it 3 times out of 5.</p><div style="position:relative;height:28px;border-radius:14px;background:#ffffff14;margin:22px 0 10px;overflow:hidden"><div style="position:absolute;left:42%;width:16%;top:0;bottom:0;background:#ffb23f66;border-left:2px solid var(--gold);border-right:2px solid var(--gold)"></div><div id="fmk" style="position:absolute;top:2px;bottom:2px;width:8px;border-radius:4px;background:#fff;box-shadow:0 0 12px #b46bff"></div></div><p id="fst" style="font-weight:700">Hits 0 / 3 · Tries 0 / 5</p><div class="btnrow"><button class="btn gold" id="fgo">Focus</button><button class="btn ghost" data-act="close">Leave class</button></div>');
  const mk=m.querySelector("#fmk"),st=m.querySelector("#fst"),bt=m.querySelector("#fgo");
  const tick=now=>{const dt=(now-last)/1000;last=now;pos+=dir*speed*dt;if(pos>1){pos=1;dir=-1}if(pos<0){pos=0;dir=1}mk.style.left="calc("+(pos*100)+"% - 4px)";raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);
  const hit=()=>{if(tries>=5||hits>=3)return;tries++;if(pos>=.42&&pos<=.58){hits++;toast("Locked in")}else{setStress(G.stress+3)}st.textContent="Hits "+hits+" / 3 · Tries "+tries+" / 5";
    if(hits>=3){cancelAnimationFrame(raf);addXP(30);persist();st.textContent="Focused. Class done!";bt.disabled=true;if(!progress("class"))toast("+30 XP");setTimeout(closeModal,900)}
    else if(tries>=5){cancelAnimationFrame(raf);st.textContent="Your mind wandered. Take a breath and try again.";bt.textContent="Try again";bt.onclick=()=>{closeModal();focusGame()}}};
  bt.onclick=hit;const kd=e=>{if(e.code==="Space"&&document.activeElement!==bt){e.preventDefault();hit()}};document.addEventListener("keydown",kd);m._cleanup=()=>{cancelAnimationFrame(raf);document.removeEventListener("keydown",kd)};
}
/* breathing: lowers stress */
function breathe(amount,onDone,title){
  let n=0,t=0,inhale=true;const cycles=3,still=reduce();
  const m=modal('<div class="kick">'+esc(title||"Reduce stress")+'</div><h2 style="font-size:32px;margin-top:6px" id="bt">Breathe in</h2><div class="breath" id="bc" aria-hidden="true"></div><p class="muted" id="bn" style="text-align:center">Cycle 1 of '+cycles+'</p><div class="btnrow" style="justify-content:center"><button class="btn gold" id="bd" disabled>Finish</button><button class="btn ghost" data-act="close">Stop</button></div>');
  const bc=m.querySelector("#bc"),btx=m.querySelector("#bt"),bn=m.querySelector("#bn"),bd=m.querySelector("#bd");
  const step=()=>{bc.style.transform=inhale?"scale(1.35)":"scale(.8)";btx.textContent=inhale?"Breathe in…":"…and out";if(!inhale){n++;}if(n>=cycles&&!inhale){}};
  bc.style.transform="scale(.8)";
  const iv=setInterval(()=>{inhale=!inhale;if(inhale&&n>=cycles){clearInterval(iv);btx.textContent="Clear mind";bd.disabled=false;bd.focus();return}step();bn.textContent="Cycle "+Math.min(n+1,cycles)+" of "+cycles},still?1500:4000);
  setTimeout(step,60);
  bd.onclick=()=>{setStress(G.stress-amount);addXP(15);persist();closeModal();toast("Mind +"+amount);if(onDone)onDone();render()};
  m._cleanup=()=>clearInterval(iv);
}

/* ---------- basketball ---------- */
let GAME=null;
function stopGames(){if(GAME&&GAME.stop)GAME.stop();GAME=null}
function vHoops(){G.last="/play/basketball";G.loc="The Court";
  return '<section style="padding-top:16px"><div class="wrap"><div class="mg" id="hoops"><canvas id="hc" aria-label="Basketball practice. Use Shoot or the space bar."></canvas><div class="stitle"><img src="'+esc(A("sc-logo"))+'" alt=""><span><b>Basketball mini-game</b><small>Practice · improve · unlock</small></span></div>'+
    '<div class="mgtop"><div><small>TIME</small><b id="ht">00:30</b></div><div><small>SCORE</small><b id="hs">0</b></div></div>'+
    '<div class="mgui"><button class="btn gold" id="hShoot">🏀 Shoot</button><button class="btn ghost" id="hDrib">Dribble</button><button class="btn ghost" id="hSpr">Sprint: 2-pt</button><button class="btn" id="hSpec" disabled>✦ Special Move</button><span class="muted" id="hmsg" style="font-weight:700;margin-left:6px"></span></div></div>'+
    '<p class="muted" style="margin-top:10px">Stop the power bar in the gold zone. Dribble widens the zone for one shot (costs a second). Sprint switches to 3-pointers. Three in a row unlocks the Crown Shot. Score 600 for Coach Dixon. Best: <b>'+G.best+'</b></p></div></section>';
}
function hoopsInit(){
  const cv=$("#hc");if(!cv)return;const ctx=cv.getContext("2d"),bg=new Image();bg.src=A("g-court");
  let W,H,dpr;const size=()=>{dpr=Math.min(devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)};size();addEventListener("resize",size);
  const S={time:30,score:0,streak:0,power:0,dir:1,state:"ready",three:false,wide:0,ball:null,pops:[],raf:0,last:performance.now()};
  const msg=t=>{const e=$("#hmsg");if(e)e.textContent=t};
  const zone=()=>{const w=(S.three?.1:.15)+S.wide;return [.66-w/2,.66+w/2]};
  function shoot(special){
    if(S.state==="ready"){S.state="play";S.last=performance.now();msg("");return}
    if(S.state!=="play"||S.ball)return;
    const [a,b]=zone(),ok=special||(S.power>=a&&S.power<=b);
    const pts=special?300:(S.three?150:100)+S.streak*25;
    S.ball={t:0,ok,pts,from:[W*.5+(S.three?0:0),H*.86],power:S.power};S.wide=0;
    if(special){S.streak=0}
  }
  function land(b){if(b.ok){S.streak++;S.score+=b.pts;S.pops.push({x:W/2,y:H*.28,t:0,s:"+"+b.pts+(S.streak>=3?" 🔥":"")})}else{S.streak=0;setStress(G.stress+1);S.pops.push({x:W/2,y:H*.3,t:0,s:"Rim out"})}
    const sp=$("#hSpec");if(sp)sp.disabled=S.streak<3;const sc=$("#hs");if(sc)sc.textContent=S.score}
  function end(){S.state="over";const best=S.score>G.best;if(best)G.best=S.score;addXP(Math.round(S.score/20));persist();
    msg(S.score>=600?"Coach Dixon noticed. ":"");const ok=S.score>=600&&progress("hoops");
    modal('<div class="kick">Practice over</div><h2 style="font-size:44px;margin-top:6px">'+S.score+' pts</h2><p class="muted" style="margin-top:6px">'+(best?"New personal best! ":"")+(S.score>=600?"That's the work Coach wants to see.":"Get to 600 to impress Coach Dixon.")+'</p><div class="btnrow"><button class="btn gold" data-act="hoops-again">Run it back</button>'+L("/play/school","Back to school","btn ghost")+'</div>');if(ok){}}
  function draw(now){
    const dt=Math.min(.05,(now-S.last)/1000);S.last=now;
    if(S.state==="play"){S.time-=dt;if(S.time<=0){S.time=0;end()}const sp=(S.three?1.25:1)*(1+G.stress/200);S.power+=S.dir*dt*sp;if(S.power>1){S.power=1;S.dir=-1}if(S.power<0){S.power=0;S.dir=1}}
    const t=$("#ht");if(t)t.textContent="00:"+pad(Math.ceil(S.time));
    if(bg.complete&&bg.naturalWidth){const r=Math.max(W/bg.naturalWidth,H/bg.naturalHeight);ctx.drawImage(bg,(W-bg.naturalWidth*r)/2,(H-bg.naturalHeight*r)/2,bg.naturalWidth*r,bg.naturalHeight*r)}else{ctx.fillStyle="#1a1030";ctx.fillRect(0,0,W,H)}
    ctx.fillStyle="#07050d99";ctx.fillRect(0,0,W,H);
    const hx=W/2,hy=H*.3,rw=Math.min(90,W*.12);
    ctx.fillStyle="#f7f3ff55";ctx.fillRect(hx-rw*1.1,hy-rw*1.05,rw*2.2,rw*1.2);ctx.strokeStyle="#8b3dff";ctx.lineWidth=4;ctx.strokeRect(hx-rw*1.1,hy-rw*1.05,rw*2.2,rw*1.2);ctx.strokeRect(hx-rw*.45,hy-rw*.6,rw*.9,rw*.62);
    ctx.fillStyle="#8b3dff";ctx.font="bold "+Math.round(rw*.32)+"px Anton, Impact, sans-serif";ctx.textAlign="center";ctx.fillText("♛",hx,hy-rw*.68);
    ctx.strokeStyle="#ff9a2e";ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(hx,hy,rw*.55,rw*.14,0,0,7);ctx.stroke();
    ctx.strokeStyle="#ffffffaa";ctx.lineWidth=1.5;for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(hx+i*rw*.16,hy+2);ctx.lineTo(hx+i*rw*.1,hy+rw*.55);ctx.stroke()}
    if(S.ball){const b=S.ball;b.t+=dt*1.6;const k=Math.min(1,b.t),sx=b.from[0],sy=b.from[1],ex=hx+(b.ok?0:(b.power>.66?rw*.5:-rw*.5)),ey=hy-4;
      const x=sx+(ex-sx)*k,y=sy+(ey-sy)*k-Math.sin(k*Math.PI)*H*.32;drawBall(x,y,rw*.28);
      if(k>=1){if(!b.landed){b.landed=1;land(b)}if(b.t>1.35)S.ball=null;else drawBall(ex+(b.ok?0:(ex<hx?-1:1)*(b.t-1)*200),ey+(b.t-1)*H*.9,rw*.28)}}
    else if(S.state!=="over")drawBall(W/2,H*.86,rw*.28);
    const bx=W-46,by=H*.2,bh=H*.55,[za,zb]=zone();ctx.fillStyle="#ffffff1a";ctx.fillRect(bx,by,18,bh);ctx.fillStyle="#ffb23f88";ctx.fillRect(bx,by+bh*(1-zb),18,bh*(zb-za));ctx.strokeStyle="#ffb23f";ctx.strokeRect(bx,by+bh*(1-zb),18,bh*(zb-za));
    ctx.fillStyle="#fff";ctx.fillRect(bx-6,by+bh*(1-S.power)-2,30,4);ctx.font="700 11px Barlow, sans-serif";ctx.fillStyle="#b9a9d6";ctx.fillText("POWER",bx+9,by+bh+16);
    S.pops=S.pops.filter(p=>p.t<1.2);S.pops.forEach(p=>{p.t+=dt;ctx.globalAlpha=1-p.t/1.2;ctx.fillStyle="#ffd27a";ctx.font="bold 30px Anton, Impact, sans-serif";ctx.fillText(p.s,p.x,p.y-p.t*50);ctx.globalAlpha=1});
    if(S.state==="ready"){ctx.fillStyle="#07050dbb";ctx.fillRect(0,H*.42,W,90);ctx.fillStyle="#fff";ctx.font="bold 34px Anton, Impact, sans-serif";ctx.fillText("PRESS SHOOT TO START",W/2,H*.42+56)}
    if(S.streak>=3){ctx.fillStyle="#ffb23f";ctx.font="bold 18px Barlow, sans-serif";ctx.fillText("ON FIRE ×"+S.streak,W/2,H*.12)}
    S.raf=requestAnimationFrame(draw);
  }
  function drawBall(x,y,r){const g=ctx.createRadialGradient(x-r*.3,y-r*.3,r*.1,x,y,r);g.addColorStop(0,"#ffb46b");g.addColorStop(1,"#c2561c");ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.strokeStyle="#3a1a08";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke()}
  S.raf=requestAnimationFrame(draw);
  $("#hShoot").onclick=()=>shoot(false);
  $("#hSpec").onclick=()=>{if(S.streak>=3&&S.state==="play")shoot(true)};
  $("#hDrib").onclick=()=>{if(S.state!=="play")return;S.wide=.08;S.time=Math.max(0,S.time-1);msg("Handles! Wider zone for one shot.")};
  $("#hSpr").onclick=e=>{S.three=!S.three;e.target.textContent="Sprint: "+(S.three?"3-pt":"2-pt")};
  cv.addEventListener("pointerdown",()=>shoot(false));
  const kd=e=>{if(e.code==="Space"&&!$(".modal")&&!/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)){e.preventDefault();shoot(false)}};document.addEventListener("keydown",kd);
  GAME={stop(){cancelAnimationFrame(S.raf);document.removeEventListener("keydown",kd);removeEventListener("resize",size)}};
}

/* ---------- daydream ---------- */
function dreamKey(){const k=(nextStep()||{}).k||"";return /^dream\d$/.test(k)?k:null}
function vDream(){G.last="/play/daydream";G.loc="Zeke's Daydream";
  const k=dreamKey(),need=k?D.visions[k].length:3;
  return '<section style="padding-top:16px"><div class="wrap"><div class="scene" id="scene" style="min-height:min(72vh,640px)"><img class="bgi" id="sbg" src="'+esc(A("g-dream"))+'" alt="A vision of a glowing purple city" style="filter:blur('+(G.stress/22).toFixed(1)+'px) brightness('+(1-G.stress/250)+')"><canvas id="dc" style="position:absolute;inset:0;width:100%;height:100%" aria-label="Find the glowing clues"></canvas>'+
    '<div class="stitle"><img src="'+esc(A("sc-logo"))+'" alt=""><span><b>Zeke\'s Daydream</b><small>Step into his mind</small></span></div>'+
    '<div class="objective"><b>'+(k?"Find "+need+" clues":"Free dream")+'</b><span id="dcount">0 / '+need+' found</span><br><span class="muted" id="dfog"></span></div>'+
    '<div class="acts" style="top:auto;bottom:16px"><button data-act="visions"><i>🔮</i>Navigate Visions</button><button data-act="clues"><i>✦</i>Find Clues</button><button data-act="memories"><i>🗝</i>Unlock Memories</button><button data-act="breathe" class="'+(G.stress>30?"hot":"")+'"><i>🫁</i>Reduce Stress</button></div><div id="dlg"></div></div></div></section>';
}
function dreamInit(){
  const cv=$("#dc");if(!cv)return;const ctx=cv.getContext("2d");const k=dreamKey(),list=k?D.visions[k]:D.visions.dream1,need=list.length;
  const visible=G.stress<=30?need:Math.max(1,Math.ceil(need*(1-(G.stress-30)/80)));
  const fog=$("#dfog");if(fog)fog.textContent=visible<need?"Stress is clouding the vision: "+visible+" of "+need+" clues visible. Reduce stress to see more.":"Clear mind. Every clue is visible.";
  let W,H;const size=()=>{const d=Math.min(devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*d;cv.height=H*d;ctx.setTransform(d,0,0,d,0,0)};size();addEventListener("resize",size);
  const rnd=(s=>()=>(s=(s*16807)%2147483647)/2147483647)(need*97+G.xp);
  const orbs=list.map((txt,i)=>({x:.32+rnd()*.6,y:.18+rnd()*.6,txt,found:false,vis:i<visible,ph:rnd()*6}));
  let raf=0,found=0;
  const draw=now=>{ctx.clearRect(0,0,W,H);orbs.forEach(o=>{if(!o.vis||o.found)return;const x=o.x*W,y=o.y*H+Math.sin(now/700+o.ph)*8,r=14+Math.sin(now/400+o.ph)*3;
    const g=ctx.createRadialGradient(x,y,0,x,y,r*3);g.addColorStop(0,"#fff");g.addColorStop(.25,"#ffd27a");g.addColorStop(.6,"#b46bff88");g.addColorStop(1,"#b46bff00");ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*3,0,7);ctx.fill()});
    if(G.stress>30){ctx.fillStyle="rgba(20,8,40,"+((G.stress-30)/180)+")";ctx.fillRect(0,0,W,H)}raf=requestAnimationFrame(draw)};raf=requestAnimationFrame(draw);
  cv.addEventListener("click",e=>{const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    const o=orbs.find(o=>o.vis&&!o.found&&Math.hypot(o.x*W-mx,o.y*H-my)<40);if(!o)return;o.found=true;found++;
    if(!G.seen.includes(o.txt))G.seen.push(o.txt);addXP(10);$("#dcount").textContent=found+" / "+need+" found";say([["zeke",o.txt]]);
    if(found>=need){if(k){progress(k)}else{persist();toast("Dream complete")}}else persist()});
  cv.setAttribute("tabindex","0");cv.addEventListener("keydown",e=>{if(e.key==="Enter"){const o=orbs.find(o=>o.vis&&!o.found);if(o){const r=cv.getBoundingClientRect();cv.dispatchEvent(new MouseEvent("click",{clientX:r.left+o.x*W,clientY:r.top+o.y*H}))}}});
  GAME={stop(){cancelAnimationFrame(raf);removeEventListener("resize",size)}};
}

/* ---------- missions, collections, friends ---------- */
function vMissions(){const cm=curMission();
  return '<section style="padding-top:20px"><div class="wrap"><div class="sechd"><div><div class="kick">Book 1</div><h2>Missions</h2></div></div><div class="mlist">'+D.missions.map(m=>{const done=G.done[m.id],cur=cm&&cm.id===m.id,lock=!done&&!cur;
    return '<div class="mrow'+(done?" done":"")+(cur?" cur":"")+(lock?" lock":"")+'"><span class="st">'+(done?"✓":lock?"🔒":m.id)+'</span><div><b>'+m.id+'. '+esc(m.title)+'</b>'+(cur?'<ul class="steps">'+m.steps.map(x=>'<li class="'+(G.step[x.k]?"d":nextStep()&&nextStep().k===x.k?"n":"")+'">'+(G.step[x.k]?"✓":"○")+' '+esc(x.t)+'</li>').join("")+'</ul>':'<div class="muted" style="font-size:13.5px">'+esc(lock?"Locked":m.brief)+'</div>')+'</div>'+(cur?'<button class="btn gold sm" data-act="go-step">Go</button>':done?'<span class="muted" style="font-size:12px">+'+m.xp+' XP</span>':'<span></span>')+'</div>'}).join("")+'</div></div></section>'}
function vCollections(){
  const groups={};Object.entries(D.collect).forEach(([id,c])=>{(groups[c.g]=groups[c.g]||[]).push([id,c])});
  groups.Locations=D.places.filter(p=>p.type!=="story").map(p=>["loc-"+p.id,{n:p.name,img:p.img||"c-places"}]);
  const n=Object.keys(G.col).length,total=Object.values(groups).reduce((a,l)=>a+l.length,0);
  return '<section style="padding-top:20px"><div class="wrap"><div class="sechd"><div><div class="kick">Story, art, music & more</div><h2>Collectibles</h2></div><span class="muted" style="margin-left:auto">'+n+' / '+total+' unlocked</span></div>'+
    Object.entries(groups).map(([g,l])=>'<h3 style="font-size:24px;margin:24px 0 12px">'+esc(g)+'</h3><div class="coll">'+l.map(([id,c])=>{const has=!!G.col[id];return '<div class="ci'+(has?"":" lock")+'"><div class="im"><img src="'+esc(A(c.img))+'" alt="" loading="lazy"></div><span>'+(has?esc(c.n):"Locked")+'<small>'+(has?"Unlocked":g==="Locations"?"Check in on the map":"Keep playing")+'</small></span></div>'}).join("")+'</div>').join("")+'</div></section>';
}
let FRIENDS=null;
function vFriends(){
  const head='<section style="padding-top:20px"><div class="wrap"><div class="sechd"><div><div class="kick">Play together. Explore together.</div><h2>Friends & co-op</h2></div></div>';
  if(MODE!=="path"||!window.firebase)return head+'<div class="empty">Friends need a Grooveville account. Open the game on grooveville.org/shadowcrown to add friends.</div></div></section>';
  if(!AUTHED)return head+'<div class="empty">Checking your account…</div></div></section>';
  if(!USER)return head+'<div class="card glowcard" style="max-width:560px"><b style="font-size:20px">Sign in with your Grooveville account</b><p class="muted" style="margin-top:6px">Your progress follows you to any device, and you can add friends by their player code. Only your player name, level and current location are shared with friends.</p><div class="btnrow"><button class="btn gold" data-act="signin">Sign in or create an account</button></div></div></div></section>';
  if(FRIENDS===null){loadFriends();}
  return head+'<div class="split2" style="align-items:start"><div class="card glowcard"><b>Your player card</b><div style="display:flex;gap:12px;align-items:center;margin-top:12px"><img src="'+esc(A("p-zeke"))+'" alt="" style="width:56px;height:56px;border-radius:50%;border:2px solid var(--gold)"><div><b style="font-size:18px">'+esc(G.name||"Player")+'</b><div class="muted" style="font-size:13px">Level '+lvl()+' · Code <b class="mono" style="color:var(--gold);letter-spacing:.1em">'+esc(G.code||"…")+'</b></div></div></div>'+
    '<form id="fname" style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:160px">Player name<input name="n" maxlength="18" value="'+esc(G.name)+'"></label><button class="btn sm" style="align-self:flex-end">Save</button></form>'+
    '<form id="fadd" style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:160px">Add a friend by code<input name="c" maxlength="6" placeholder="ABC123" autocomplete="off" style="text-transform:uppercase"></label><button class="btn gold sm" style="align-self:flex-end">Add friend</button></form>'+
    '<p class="muted" style="font-size:12.5px;margin-top:10px">Share your code with friends so they can add you.</p></div>'+
    '<div><div class="fam" id="flist">'+(FRIENDS&&FRIENDS.length?FRIENDS.map(f=>'<div class="who" style="cursor:default"><img src="'+esc(A("p-zeke"))+'" alt=""><span><b>'+esc(f.name||"Player")+'</b><small>Level '+esc(f.level||1)+' · '+esc(f.loc||"")+'</small></span></div>').join(""):'<div class="empty" style="grid-column:1/-1">'+(FRIENDS===null?"Loading friends…":"No friends yet. Add one with their code.")+'</div>')+'</div></div></div></div></section>';
}
async function loadFriends(){if(!FB||!USER)return;try{const docs=await Promise.all((G.friends||[]).map(u=>FB.doc("scplayers/"+u).get()));FRIENDS=docs.filter(d=>d.exists).map(d=>d.data())}catch(e){FRIENDS=[]}if(path()==="/play/friends")render()}

/* ---------- Charlotte map ---------- */
const PCOL={story:"#b46bff",missions:"#ffb23f",real:"#68d4d0",vybr8:"#f4a987"};
const PICO={story:"♛",missions:"★",real:"●",vybr8:"🍽"};
const FILTERS=[["all","All"],["story","Story"],["missions","Missions"],["real","Real places"],["vybr8","Vybr8 spots"],["collect","Collectibles"]];
let MAPF="all";
const visibleP=()=>D.places.filter(p=>MAPF==="all"||p.type===MAPF||(MAPF==="collect"&&p.type!=="story"&&!G.col["loc-"+p.id])||(MAPF==="missions"&&missionAt(p.id)));
function missionAt(id){const s=nextStep();return !!s&&(s.go.indexOf("p="+id)>=0||(place(id)||{}).scene===s.go)}
function vMap(){
  const sel=place(qs().p)||place("upendo");
  return '<section style="padding-top:16px"><div class="wrap"><div class="mapwrap"><div class="mapside" role="group" aria-label="Map filters"><div class="city">CHARLOTTE</div><small class="muted" style="letter-spacing:.14em;font-weight:700;font-size:11px">REAL PLACES. REAL STORIES.</small>'+
    FILTERS.map(([k,l])=>'<button data-act="mapf" data-arg="'+k+'" class="'+(MAPF===k?"on":"")+'"><i style="background:'+(PCOL[k]||"#fff")+'"></i>'+l+'</button>').join("")+'<p class="mapnote">Virtual exploration. No GPS needed. Real-place pins are approximate; story places are fictional.</p></div>'+
    '<div id="'+(useMapbox()?"mapbox":"svgmap")+'"></div><div class="place" id="placePanel">'+placePanel(sel)+'</div></div></div></section>';
}
function placePanel(p){if(!p)return "";const ms=missionAt(p.id),k=(nextStep()||{}).k;
  const acts=[];
  if(p.scene)acts.push(L(p.scene,(p.id==="upendo"?"Go home":"Go there")+" ›","btn gold sm"));
  if(p.id==="freedom")acts.push('<button class="btn gold sm" data-act="walk">Walk with Prince</button>');
  if(p.type==="real"||p.type==="vybr8")acts.push('<button class="btn sm" data-act="checkin" data-arg="'+p.id+'">'+(G.col["loc-"+p.id]?"Checked in ✓":p.type==="vybr8"?"Check in with the family":"Visit (virtual)")+'</button>');
  if(p.type!=="story"&&p.type!=="missions")acts.push('<a class="btn ghost sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.name+", Charlotte, NC")+'">Directions ↗</a>');
  if(p.type==="vybr8")acts.push('<a class="btn ghost sm" target="_blank" rel="noopener" href="https://vybr8.live">More spots on Vybr8 ↗</a>');
  return '<div class="pi">'+(p.img?'<img src="'+esc(A(p.img))+'" alt="">':'<span aria-hidden="true" style="color:'+PCOL[p.type]+';font-size:54px;text-shadow:0 0 30px currentColor">'+(p.type==="vybr8"?"🍽":"⌖")+'</span>')+'</div><div class="pb"><span class="tag" style="color:'+PCOL[p.type]+';align-self:flex-start">'+({story:"Story location",missions:"Mission spot",real:"Real place",vybr8:"Vybr8 spot"})[p.type]+'</span><h3>'+esc(p.name)+'</h3><span class="muted" style="font-size:13.5px">'+esc(p.sub)+'</span><p style="font-size:14.5px">'+esc(p.about)+'</p>'+
    (ms?'<p style="color:var(--gold);font-weight:700;font-size:14px">▸ Mission here: '+esc(nextStep().t)+'</p>':'')+'<div class="btnrow" style="margin-top:auto">'+acts.join("")+'</div></div>'}
function selectPlace(id){const p=place(id);if(!p)return;const pp=$("#placePanel");if(pp)pp.innerHTML=placePanel(p);
  if(MODE==="mem")memPath="/map?p="+id;else history.replaceState(history.state,"",href("/map?p="+id));
  document.querySelectorAll(".pin").forEach(g=>g.classList.toggle("sel",g.dataset.id===id));if(window.innerWidth<1000&&pp)pp.scrollIntoView({behavior:"smooth",block:"nearest"})}
const useMapbox=()=>!!(CFG.mapboxToken&&MODE==="path"&&!window.__mbFail);
const B={n:35.257,s:35.183,w:-80.878,e:-80.788},KX=Math.cos(35.22*Math.PI/180);
const MW=1000,MH=Math.round((B.n-B.s)/((B.e-B.w)*KX)*MW);
const pr=(lat,lng)=>[((lng-B.w)/(B.e-B.w))*MW,((B.n-lat)/(B.n-B.s))*MH];
function svgMap(){
  const el=$("#svgmap");if(!el)return;
  const line=(pts,st)=>'<polyline points="'+pts.map(p=>pr(p[0],p[1]).map(v=>v.toFixed(1)).join(",")).join(" ")+'" '+st+'/>';
  let grid="";for(let i=-30;i<40;i++){const x=i*38;grid+='<line x1="'+x+'" y1="-200" x2="'+(x+700)+'" y2="'+(MH+200)+'"/><line x1="'+(x+900)+'" y1="-200" x2="'+(x-300)+'" y2="'+(MH+200)+'"/>'}
  const [ux,uy]=pr(35.2271,-80.8431);
  const loop=[];for(let a=0;a<=360;a+=12){const r=a*Math.PI/180;loop.push([35.2271+.0085*Math.sin(r),-80.8431+.0105*Math.cos(r)])}
  const hoods=[["UPTOWN",35.2271,-80.8431],["NODA",35.2488,-80.8005],["PLAZA MIDWOOD",35.2235,-80.8075],["DILWORTH",35.2045,-80.8475],["SOUTH END",35.2125,-80.8600],["MYERS PARK",35.1925,-80.8235],["ELIZABETH",35.2140,-80.8215],["BIDDLEVILLE",35.2465,-80.8660],["OPTIMIST PARK",35.2400,-80.8230]];
  const pins=visibleP().map(p=>{const [x,y]=pr(p.lat,p.lng),c=PCOL[p.type],got=G.col["loc-"+p.id],ms=missionAt(p.id);
    return '<g class="pin" tabindex="0" role="button" data-id="'+p.id+'" aria-label="'+esc(p.name)+'" transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+')">'+(ms?'<circle r="26" fill="none" stroke="#ffb23f" stroke-width="2" opacity=".8"><animate attributeName="r" values="16;30;16" dur="2s" repeatCount="indefinite"/></circle>':'')+'<circle r="22" fill="'+c+'" opacity=".18"/><circle class="ring" r="13" fill="#0b0716" stroke="'+c+'" stroke-width="2"/><text y="5" text-anchor="middle" font-size="13" fill="'+c+'">'+(got?"✓":PICO[p.type])+'</text><text class="lb" y="30" text-anchor="middle" font-size="11" fill="#f7f3ff" font-weight="700" style="paint-order:stroke;stroke:#07050d;stroke-width:3px">'+esc(p.name.length>22?p.name.slice(0,20)+"…":p.name)+'</text></g>'}).join("");
  el.innerHTML='<svg viewBox="0 0 '+MW+' '+MH+'" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustrated map of Charlotte with story and real places"><defs><radialGradient id="mg" cx="'+(ux/MW)+'" cy="'+(uy/MH)+'" r=".6"><stop offset="0" stop-color="#2a1150"/><stop offset="1" stop-color="#0a0714"/></radialGradient></defs>'+
    '<rect x="-500" y="-500" width="'+(MW+1000)+'" height="'+(MH+1000)+'" fill="url(#mg)"/><g stroke="#8b3dff" stroke-width=".6" opacity=".16">'+grid+'</g>'+
    line([[35.232,-80.828],[35.222,-80.832],[35.212,-80.836],[35.203,-80.838],[35.196,-80.841],[35.183,-80.835]],'fill="none" stroke="#3f6bd6" stroke-width="5" opacity=".5"')+
    line([[35.257,-80.851],[35.236,-80.853],[35.222,-80.857],[35.205,-80.866],[35.183,-80.877]],'fill="none" stroke="#b46bff" stroke-width="7" opacity=".55"')+
    line(loop,'fill="none" stroke="#b46bff" stroke-width="6" opacity=".55"')+
    line([[35.218,-80.834],[35.212,-80.82],[35.205,-80.805],[35.198,-80.788]],'fill="none" stroke="#b46bff" stroke-width="5" opacity=".45"')+
    line([[35.257,-80.812],[35.243,-80.826],[35.2271,-80.8431],[35.212,-80.857],[35.195,-80.872],[35.183,-80.879]],'fill="none" stroke="#ffb23f" stroke-width="3" opacity=".55"')+
    line([[35.2271,-80.8431],[35.235,-80.853],[35.245,-80.862],[35.257,-80.868]],'fill="none" stroke="#ffb23f" stroke-width="2" opacity=".4"')+
    line([[35.2271,-80.8431],[35.236,-80.828],[35.247,-80.806],[35.257,-80.795]],'fill="none" stroke="#ffb23f" stroke-width="2" opacity=".4"')+
    '<g fill="#b9a9d6" font-size="12" font-weight="800" letter-spacing="3" text-anchor="middle" opacity=".55">'+hoods.map(h=>{const [x,y]=pr(h[1],h[2]);return '<text x="'+x.toFixed(0)+'" y="'+(y-36).toFixed(0)+'">'+h[0]+'</text>'}).join("")+'</g>'+
    '<text x="'+(pr(35.2,-80.872)[0])+'" y="'+(pr(35.2,-80.872)[1])+'" fill="#b46bff" font-size="11" font-weight="800" opacity=".7">I-77</text><text x="'+(pr(35.236,-80.833)[0])+'" y="'+(pr(35.236,-80.833)[1])+'" fill="#b46bff" font-size="11" font-weight="800" opacity=".7">I-277</text>'+
    '<g id="pins">'+pins+'</g></svg><div style="position:absolute;right:10px;bottom:10px;display:flex;flex-direction:column;gap:6px"><button class="btn sm" data-act="mz" data-arg="in" aria-label="Zoom in">+</button><button class="btn sm" data-act="mz" data-arg="out" aria-label="Zoom out">−</button></div>';
  const svg=el.querySelector("svg");let vb={x:0,y:0,w:MW,h:MH};const z0=Math.min(1,el.clientWidth/el.clientHeight*MH/MW);
  const setVB=()=>{svg.setAttribute("viewBox",vb.x+" "+vb.y+" "+vb.w+" "+vb.h);svg.classList.toggle("zin",vb.w<520)};
  const zoom=(f,cx,cy)=>{const nw=Math.max(220,Math.min(MW*1.4,vb.w*f)),nh=nw*MH/MW;cx=cx==null?vb.x+vb.w/2:cx;cy=cy==null?vb.y+vb.h/2:cy;vb={x:cx-(cx-vb.x)*nw/vb.w,y:cy-(cy-vb.y)*nh/vb.h,w:nw,h:nh};setVB()};
  const s0=place(qs().p);const [fx,fy]=s0&&s0.id!=="upendo"?pr(s0.lat,s0.lng):pr(35.221,-80.836);zoom(s0&&s0.id!=="upendo"?.55:.82,fx,fy);vb.x=fx-vb.w/2;vb.y=fy-vb.h/2;setVB();el._zoom=zoom;
  const pts=new Map();let drag=null,moved=0,downPin=null;
  const toSvg=(e)=>{const r=svg.getBoundingClientRect(),s=Math.max(vb.w/r.width,vb.h/r.height);return [vb.x+(e.clientX-r.left)*s-(r.width*s-vb.w)/2,vb.y+(e.clientY-r.top)*s-(r.height*s-vb.h)/2,s]};
  svg.addEventListener("pointerdown",e=>{downPin=e.target.closest&&e.target.closest(".pin");pts.set(e.pointerId,[e.clientX,e.clientY]);svg.setPointerCapture(e.pointerId);moved=0;drag={x:e.clientX,y:e.clientY,vb:Object.assign({},vb)};svg.classList.add("drag")});
  svg.addEventListener("pointermove",e=>{if(!pts.has(e.pointerId))return;const prev=pts.get(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);
    if(pts.size===2){const [a,b]=[...pts.values()],d1=Math.hypot(a[0]-b[0],a[1]-b[1]);const o=[...pts.entries()].find(([k])=>k!==e.pointerId)[1];const d0=Math.hypot(prev[0]-o[0],prev[1]-o[1]);if(d0>0){const [cx,cy]=toSvg({clientX:(a[0]+b[0])/2,clientY:(a[1]+b[1])/2});zoom(d0/d1,cx,cy)}moved=9;return}
    if(!drag)return;const r=svg.getBoundingClientRect(),s=Math.max(vb.w/r.width,vb.h/r.height);moved+=Math.abs(e.movementX)+Math.abs(e.movementY);vb.x=drag.vb.x-(e.clientX-drag.x)*s;vb.y=drag.vb.y-(e.clientY-drag.y)*s;setVB()});
  const up=e=>{pts.delete(e.pointerId);if(!pts.size){svg.classList.remove("drag");if(moved<6&&downPin)selectPlace(downPin.dataset.id);drag=null;downPin=null}};
  svg.addEventListener("pointerup",up);svg.addEventListener("pointercancel",up);
  svg.addEventListener("wheel",e=>{e.preventDefault();const [cx,cy]=toSvg(e);zoom(e.deltaY>0?1.15:.87,cx,cy)},{passive:false});
  svg.addEventListener("keydown",e=>{const g=e.target.closest(".pin");if(g&&(e.key==="Enter"||e.key===" ")){e.preventDefault();selectPlace(g.dataset.id)}});
  const sel=qs().p;if(sel)document.querySelectorAll(".pin").forEach(g=>g.classList.toggle("sel",g.dataset.id===sel));
}
let MB=null;
function mapboxInit(){
  const el=$("#mapbox");if(!el)return;
  const start=()=>{try{window.mapboxgl.accessToken=CFG.mapboxToken;MB=new mapboxgl.Map({container:el,style:CFG.mapboxStyle||"mapbox://styles/mapbox/dark-v11",center:[-80.8431,35.2271],zoom:12.4,attributionControl:true});
      MB.addControl(new mapboxgl.NavigationControl({showCompass:false}),"bottom-right");
      MB.on("load",()=>{try{const L2=MB.getStyle().layers;L2.forEach(l=>{if(l.type==="background")MB.setPaintProperty(l.id,"background-color","#0d0819");if(l.id.indexOf("water")>=0&&l.type==="fill")MB.setPaintProperty(l.id,"fill-color","#1b1240");if(l.id.indexOf("road")>=0&&l.type==="line")MB.setPaintProperty(l.id,"line-color","#4a2a8a")})}catch(e){}});
      MB.on("error",e=>{if(e&&e.error&&/401|403|token/i.test(String(e.error.message||e.error.status))){window.__mbFail=1;render()}});
      visibleP().forEach(p=>{const d=document.createElement("button");d.className="mk";d.style.color=PCOL[p.type];d.style.background="#0b0716";d.setAttribute("aria-label",p.name);d.textContent=G.col["loc-"+p.id]?"✓":PICO[p.type];d.onclick=()=>selectPlace(p.id);new mapboxgl.Marker({element:d}).setLngLat([p.lng,p.lat]).addTo(MB)});
    }catch(e){window.__mbFail=1;render()}};
  if(window.mapboxgl)return start();
  const v=CFG.mapboxVersion||"v3.6.0",css=document.createElement("link");css.rel="stylesheet";css.href="https://api.mapbox.com/mapbox-gl-js/"+v+"/mapbox-gl.css";document.head.appendChild(css);
  const s=document.createElement("script");s.src="https://api.mapbox.com/mapbox-gl-js/"+v+"/mapbox-gl.js";s.onload=start;s.onerror=()=>{window.__mbFail=1;render()};document.head.appendChild(s);
}

/* ---------- render ---------- */
function v404(){return '<section><div class="wrap" style="text-align:center"><h1 style="font-size:60px">Lost in the dream</h1><p class="muted" style="margin-top:10px">That page isn\'t part of the universe yet.</p><div class="btnrow" style="justify-content:center">'+L("/","Back to the Universe","btn gold")+'</div></div></section>'}
function render(){
  stopGames();if(MB){try{MB.remove()}catch(e){}MB=null}
  const p=path();
  if(p==="/play/new"){if(G.started&&!G.flags.confirmNew){return newGameConfirm()}G=fresh();G.started=true;persist();return go("/play/house",{replace:true})}
  if(p==="/play/continue"){if(!G.started){G.started=true;persist()}return go(G.last||"/play/house",{replace:true})}
  if(p.indexOf("/play/")===0&&!G.started&&!["/play/missions","/play/collections","/play/friends"].includes(p)){G.started=true;persist()}
  const V={"/":vHome,"/read":vRead,"/watch":vWatch,"/store":vStore,"/characters":vCharacters,"/map":vMap,"/play":vPlay,"/play/house":vHouse,"/play/school":vSchool,"/play/basketball":vHoops,"/play/daydream":vDream,"/play/missions":vMissions,"/play/collections":vCollections,"/play/friends":vFriends}[p]||v404;
  document.title=({"/":"Shadow Crown Universe","/play":"Living World · Shadow Crown","/map":"Charlotte map · Shadow Crown"})[p]||((MENU.find(m=>m[0]===p)||[0,""])[1]?(MENU.find(m=>m[0]===p)[1]+" · Shadow Crown"):"Shadow Crown Universe");
  $("#root").innerHTML=chrome()+'<main id="view">'+V()+'</main>'+footer();
  if(p==="/read")scBooks();
  if(p==="/play/basketball")hoopsInit();
  if(p==="/play/daydream")dreamInit();
  if(p==="/map"){if(useMapbox())mapboxInit();else svgMap()}
  if(p==="/play/house"||p==="/play/school")afterScene();
  const rf=$("#redeem");if(rf)rf.addEventListener("submit",e=>{e.preventDefault();const c=$("#rcode").value.trim().toLowerCase();const codes=(CFG.redeemCodes||[]).map(x=>String(x).toLowerCase());if(c&&codes.includes(c)){give("book");addXP(100);persist();render()}else toast(codes.length?"That code didn't work. Check the inside cover.":"Book codes aren't active yet.")});
  const fn=$("#fname");if(fn)fn.addEventListener("submit",e=>{e.preventDefault();G.name=fn.n.value.trim().slice(0,18)||"Player";persist();toast("Saved");render()});
  const fa=$("#fadd");if(fa)fa.addEventListener("submit",async e=>{e.preventDefault();const c=fa.c.value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(c)){toast("Codes are 6 letters or numbers");return}if(c===G.code){toast("That's your own code");return}
    try{const q=await FB.collection("scplayers").where("code","==",c).limit(1).get();if(q.empty){toast("No player with that code");return}const uid=q.docs[0].id;if(!G.friends.includes(uid))G.friends.push(uid);persist();FRIENDS=null;toast("Friend added");render()}catch(err){toast("Couldn't add friend right now")}});
}
function newGameConfirm(){modal('<h2 style="font-size:34px">Start over?</h2><p class="muted" style="margin-top:8px">This erases your Living World progress'+(USER?" on every device":" on this device")+'.</p><div class="btnrow"><button class="btn gold" data-act="newgo">Start a new game</button><button class="btn ghost" data-act="newno">Keep my progress</button></div>');
  if(MODE==="mem")memPath=memStack.pop()||"/play";else history.replaceState(history.state,"",href("/play"));
  $("#root").innerHTML||render();}

/* ---------- events ---------- */
document.addEventListener("click",e=>{
  const a=e.target.closest("a[data-go]");if(a&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button===0){e.preventDefault();closeModal();go(a.dataset.go);return}
  const lv=e.target.closest("[data-leave]");if(lv){e.preventDefault();leave(lv.getAttribute("data-leave"));return}
  const h=e.target.closest('a[href^="#"]');if(h&&!h.dataset.act){e.preventDefault();return}
  const t=e.target.closest("[data-act]");if(!t)return;const act=t.dataset.act,arg=t.dataset.arg;
  if(act==="back"){e.preventDefault();return back()}
  if(act==="top"){e.preventDefault();window.scrollTo({top:0,behavior:reduce()?"auto":"smooth"});return}
  if(act==="close")return closeModal();
  if(act==="go-step"){closeModal();return stepGo()}
  if(act==="newgo"){closeModal();G=fresh();G.started=true;persist();return go("/play/house")}
  if(act==="newno"){closeModal();return render()}
  if(act==="room"){G.room=arg;persist();const r=ROOMS.find(x=>x[0]===arg);const bg=$("#sbg");if(bg&&r){bg.src=A(r[1])}document.querySelectorAll(".rooms button").forEach(b=>b.classList.toggle("on",b.dataset.arg===arg));const st=$(".stitle small");if(st&&r)st.textContent="Home base · "+r[2];return}
  if(act==="talk-menu"){const box=$("#dlg");box.innerHTML='<div class="dlg"><div class="sp"><b>Who do you want to talk to?</b></div><div class="ch">'+["krystal","zavian","zora","kingston","prince"].map(c=>'<button data-act="talk" data-arg="'+c+'">'+esc(CH[c].name)+' <span class="muted">· '+esc(CH[c].title.split(" · ")[0])+'</span></button>').join("")+'</div></div>';box.querySelector("button").focus();return}
  if(act==="talk")return talkTo(arg);
  if(act==="journal"){progress("journal");const pages=G.seen.length?G.seen:[];return modal('<div class="kick">Dream journal</div><h2 style="font-size:34px;margin-top:6px">What I\'ve seen</h2>'+(pages.length?'<ul style="margin-top:12px;padding-left:20px">'+pages.map(s=>'<li style="margin:6px 0">'+esc(s)+'</li>').join("")+'</ul>':'<p class="muted" style="margin-top:10px">“It felt real. The city was purple, and something was falling.” Nothing else written yet. Enter the daydream to find more.</p>')+'<div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>')}
  if(act==="outfit")return modal('<div class="kick">Wardrobe</div><h2 style="font-size:34px;margin-top:6px">Change outfit</h2><div class="ch" style="display:flex;flex-direction:column;gap:8px;margin-top:14px">'+D.outfits.map(([k,l])=>{const lock=k==="jersey"&&!G.done[3];return '<button class="btn '+(G.outfit===k?"gold":"ghost")+'" data-act="wear" data-arg="'+k+'"'+(lock?" disabled":"")+'>'+esc(l)+(lock?" 🔒":"")+'</button>'}).join("")+'</div>');
  if(act==="wear"){G.outfit=arg;persist();closeModal();return toast("Outfit: "+(D.outfits.find(o=>o[0]===arg)||[0,""])[1])}
  if(act==="rest"){setStress(G.stress-25);addXP(5);const was=isNext("migraine");persist();if(was)progress("migraine");toast("Rested and saved. Mind +25");return render()}
  if(act==="class")return focusGame();
  if(act==="friends")return isNext("talk-friends")?say(D.talk.ajay["talk-friends"],()=>progress("talk-friends")):say([(D.talk.ajay._)[0],(D.talk.marcus._)[0]]);
  if(act==="hoops")return go("/play/basketball");
  if(act==="explore"){addXP(10);persist();if(!G.col.p3&&G.done[2])give("p3");return say([["zeke",["The hallway smells like new paint. Somebody's been building something.","A crown is carved into the bench outside the gym.","Prince would love this courtyard. Too many squirrels."][Math.floor(Math.random()*3)]]])}
  if(act==="coach")return isNext("talk-coach")?say(D.talk.shawn["talk-coach"],()=>progress("talk-coach"),D.coachChoices):say(D.talk.shawn._);
  if(act==="hoops-again"){closeModal();return render()}
  if(act==="breathe")return breathe(30,null,"Reduce stress");
  if(act==="visions")return modal('<div class="kick">Navigate visions</div><h2 style="font-size:34px;margin-top:6px">Visions so far</h2>'+(G.seen.length?'<ol style="margin-top:12px;padding-left:22px">'+G.seen.map(s=>'<li style="margin:6px 0">'+esc(s)+'</li>').join("")+'</ol>':'<p class="muted" style="margin-top:10px">No visions yet. Find the glowing clues.</p>')+'<div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>');
  if(act==="clues")return toast("Tap the glowing lights. A clearer mind shows more of them.");
  if(act==="memories")return go("/play/collections");
  if(act==="mapf"){MAPF=arg;return render()}
  if(act==="mz"){const el=$("#svgmap");if(el&&el._zoom)el._zoom(arg==="in"?.8:1.25);return}
  if(act==="walk")return breathe(35,()=>{G.col["loc-freedom"]||give("loc-freedom");progress("walk-prince");persist()},"Walk with Prince at Freedom Park");
  if(act==="checkin"){const p=place(arg);if(!G.col["loc-"+arg]){give("loc-"+arg);addXP(20)}if(p&&p.type==="vybr8")progress("checkin");if(arg==="freedom")setStress(G.stress-10);persist();const pp=$("#placePanel");if(pp)pp.innerHTML=placePanel(p);const g=document.querySelector('.pin[data-id="'+arg+'"] text');if(g)g.textContent="✓";return}
  if(act==="signin"){try{localStorage.setItem("gvReturn",BASE+"/play/friends/")}catch(_){}return leave("/#signin")}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$(".modal"))closeModal()});

/* ---------- boot ---------- */
document.body.innerHTML='<div id="root"></div>';
arrive();fbInit();render();
})();

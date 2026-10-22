/* =====================================================================
   Groove Guide by Grooveville
   A self-contained app under /guide. It shares Grooveville's sign-in (Firebase, same site)
   and its Cloudflare Worker (/api/guide/*), and nothing else.
   ===================================================================== */
(function(){
"use strict";
const CFG=Object.assign({googleMapsKey:"",mapIdDark:"DEMO_MAP_ID",mapIdLight:"DEMO_MAP_ID",mapsVersion:"beta",base:"/guide",apiBase:"/api/guide",homeUrl:"/",signInUrl:"/#groove",defaultCenter:{lat:35.2271,lng:-80.8431}},window.GG_CONFIG||{});
const BASE=CFG.base.replace(/\/$/,"");
const $=(s,r)=>(r||document).querySelector(s), $$=(s,r)=>[...(r||document).querySelectorAll(s)];
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- saved data: on this device always, and in the Grooveville account when signed in ---------- */
const DEF_DATA={v:1,updatedAt:0,saved:[],recent:[],trips:[],history:[],walks:[],
  vehicle:{type:"sedan",make:"",model:"",year:"",color:"#c9ccd3",nick:"My ride"},
  settings:{theme:"auto",layout:"70",units:"imperial",voice:true,avoidTolls:false,avoidHighways:false,avoidFerries:false,walkConsent:false,view:"aerial",historyOn:true}};
const STORE={uid:"",db:null,cloud:"off",t:0};
let D=load();
function load(){try{const o=JSON.parse(localStorage.getItem("gg:data")||"null");if(o&&o.v===1)return merge(o)}catch(e){}return JSON.parse(JSON.stringify(DEF_DATA))}
function merge(o){const d=JSON.parse(JSON.stringify(DEF_DATA));Object.assign(d,o);d.vehicle=Object.assign({},DEF_DATA.vehicle,o.vehicle||{});d.settings=Object.assign({},DEF_DATA.settings,o.settings||{});return d}
function save(){D.updatedAt=Date.now();try{localStorage.setItem("gg:data",JSON.stringify(D))}catch(e){}
  clearTimeout(STORE.t);STORE.t=setTimeout(cloudSave,900)}
async function cloudSave(){if(!STORE.db||!STORE.uid)return;try{await STORE.db.doc("guide/"+STORE.uid).set(JSON.parse(JSON.stringify(D)));STORE.cloud="on"}catch(e){STORE.cloud="blocked"}paintAccount()}
/* merge this device's data with the account's, so nothing saved while signed out is lost */
function unionBy(a,b,key){const m=new Map();(b||[]).concat(a||[]).forEach(x=>{const k=key(x);if(!m.has(k))m.set(k,x)});return [...m.values()]}
function mergeData(local,cloud){const newer=(cloud.updatedAt||0)>(local.updatedAt||0)?cloud:local,o=merge(newer);
  o.saved=unionBy(newer.saved,newer===cloud?local.saved:cloud.saved,s=>s.kind&&["home","work","school"].includes(s.kind)?"k:"+s.kind:(Math.round(s.lat*1e5)+","+Math.round(s.lng*1e5)));
  o.trips=unionBy(newer.trips,newer===cloud?local.trips:cloud.trips,x=>x.id);o.history=unionBy(newer.history,newer===cloud?local.history:cloud.history,x=>x.id).sort((a,b)=>b.endedAt-a.endedAt).slice(0,200);
  o.walks=unionBy(newer.walks,newer===cloud?local.walks:cloud.walks,x=>x.id).sort((a,b)=>b.start-a.start).slice(0,500);o.recent=unionBy(newer.recent,newer===cloud?local.recent:cloud.recent,x=>Math.round(x.lat*1e5)+","+Math.round(x.lng*1e5)).slice(0,20);
  o.updatedAt=Date.now();return o}
async function cloudLoad(){if(!STORE.db||!STORE.uid)return;
  try{const s=await STORE.db.doc("guide/"+STORE.uid).get();STORE.cloud="on";
    if(s.exists){D=mergeData(D,merge(s.data()));try{localStorage.setItem("gg:data",JSON.stringify(D))}catch(e){}applyTheme();if(MAP.map)MAP.draw();rerender()}
    cloudSave()}
  catch(e){STORE.cloud="blocked"}paintAccount()}
function initAuth(){
  try{if(!window.firebase||!window.FIREBASE_CONFIG)return;if(!firebase.apps.length)firebase.initializeApp(window.FIREBASE_CONFIG);STORE.db=firebase.firestore();
    firebase.auth().onAuthStateChanged(u=>{const was=STORE.uid;STORE.uid=u?u.uid:"";STORE.email=u?(u.email||""):"";STORE.name=u?(u.displayName||""):"";paintAccount();if(u)cloudLoad();else if(was){toast("Signed out. Your data stays on this device.")}if(G.page==="settings"||G.page==="saved"||G.page==="trips")renderPage()})}catch(e){}
}

/* ---------- units & formatting ---------- */
const MI=1609.344;
function fmtDist(m){if(m==null||!isFinite(m))return "—";if(D.settings.units==="metric")return m<950?Math.round(m/10)*10+" m":(m/1000).toFixed(m<10000?1:0)+" km";const mi=m/MI;return mi<0.19?Math.round(m*3.28084/50)*50+" ft":mi.toFixed(mi<10?1:0)+" mi"}
function fmtDur(s){if(s==null||!isFinite(s))return "—";s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.round((s%3600)/60);return h?h+" hr "+(m?m+" min":""):Math.max(1,m)+" min"}
function fmtTime(d,tz){try{return new Date(d).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:tz||undefined})}catch(e){return new Date(d).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}}
function fmtDay(d,tz){try{return new Date(d).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:tz||undefined})}catch(e){return new Date(d).toDateString()}}
function tzAbbr(d,tz){try{return new Intl.DateTimeFormat("en-US",{timeZone:tz,timeZoneName:"short"}).formatToParts(new Date(d)).find(p=>p.type==="timeZoneName").value}catch(e){return ""}}
function speedFmt(ms){if(ms==null||!isFinite(ms)||ms<0)return null;return D.settings.units==="metric"?Math.round(ms*3.6):Math.round(ms*2.23694)}
const speedUnit=()=>D.settings.units==="metric"?"km/h":"mph";

/* ---------- theme: light, dark, follow the device, or follow sunrise/sunset ---------- */
const THEME={cur:"dark"};
function sunTimes(lat,lng,date){ // NOAA approximation, returns ms timestamps
  const rad=Math.PI/180,d=date||new Date(),J=Math.floor(d/86400000-0.5+2440588)-2451545+0.0008,ls=-lng/360,Jx=J+ls,M=(357.5291+0.98560028*Jx)%360,
    C=1.9148*Math.sin(M*rad)+0.02*Math.sin(2*M*rad)+0.0003*Math.sin(3*M*rad),L=(M+C+180+102.9372)%360,Jt=2451545+Jx+0.0053*Math.sin(M*rad)-0.0069*Math.sin(2*L*rad),
    dec=Math.asin(Math.sin(L*rad)*Math.sin(23.44*rad)),cw=(Math.sin(-0.83*rad)-Math.sin(lat*rad)*Math.sin(dec))/(Math.cos(lat*rad)*Math.cos(dec));
  if(cw<-1||cw>1)return null;const w=Math.acos(cw)/rad/360,toMs=j=>(j+0.5-2440588)*86400000;return {rise:toMs(Jt-w),set:toMs(Jt+w)}}
function resolveTheme(){const t=D.settings.theme;if(t==="light"||t==="dark")return t;
  if(t==="sun"){const p=G.pos||CFG.defaultCenter,s=sunTimes(p.lat,p.lng);if(s){const n=Date.now();return n>s.rise&&n<s.set?"light":"dark"}}
  return matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}
function applyTheme(){const t=resolveTheme(),chg=t!==THEME.cur;THEME.cur=t;const r=$("#gg");if(r){r.classList.toggle("light",t==="light");r.classList.toggle("dark",t==="dark")}
  document.documentElement.style.colorScheme=t;if(chg&&MAP.map)MAP.rebuild();DRIVE.dirty=true;paintThemeBtn()}
matchMedia("(prefers-color-scheme: light)").addEventListener("change",applyTheme);setInterval(()=>{if(D.settings.theme==="sun")applyTheme()},300000);
const ROUTE_COLOR=()=>THEME.cur==="light"?"#7B3FF2":"#FF9F68";

/* ---------- app state ---------- */
const G={page:"",pos:null,acc:null,heading:null,speed:null,watch:null,dest:null,stops:[],mode:"DRIVE",routes:[],sel:0,route:null,routeAt:0,
  intel:{dest:null,origin:null},nav:null,busy:false,err:"",layout:"70",sim:null,walk:null,geoErr:""};

/* ---------- icons ---------- */
const IP={
  navigate:'<path d="M20 4 4 11l7 2 2 7z"/>',explore:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',immersive:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  saved:'<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',trips:'<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  home:'<path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',work:'<rect x="3.5" y="7" width="17" height="12.5" rx="2.5"/><path d="M9 7V5h6v2M3.5 12.5h17"/>',
  school:'<path d="m2.5 9.5 9.5-5 9.5 5-9.5 5z"/><path d="M6.5 11.6V16c3 2.3 8 2.3 11 0v-4.4M21.5 9.5V15"/>',heart:'<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',grid:'<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  user:'<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',locate:'<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7.5"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',vol:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  car:'<path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5"/><rect x="3.5" y="12" width="17" height="5" rx="1.5"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>',
  cloud:'<path d="M7 18a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18z"/>',share:'<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  pin:'<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',sliders:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',walk:'<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6.5 2.5 2.5V21M8 12l2-4.5 3.5 1 2 3.5 2.5.5M11.5 14.5 10.5 8"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',back:'<path d="M15 5 8 12l7 7"/>',play:'<path d="M8 5.5v13l11-6.5z"/>',pause:'<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  star:'<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash:'<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',drop:'<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',wind:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3"/>',
  food:'<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7H17V21M17 3v7"/>',music:'<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  gas:'<path d="M5 21V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v16M3.5 21h12M5 10h9M14 8l3 2v7.5a1.5 1.5 0 0 0 3 0V9l-3-3"/>',bolt:'<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  coffee:'<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M12 3.5v2.5"/>',park:'<path d="M12 3 6 13h3.5L7 18h10l-2.5-5H18zM12 18v3"/>',
  crown:'<path d="M4 18h16l1-10-5 4-4-6-4 6-5-4z"/><path d="M4 21h16"/>',bag:'<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'};
const ico=(k,s)=>'<svg class="ic" viewBox="0 0 24 24" width="'+(s||22)+'" height="'+(s||22)+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IP[k]||"")+'</svg>';
/* maneuver arrows (filled) */
const MAN={
  straight:'M12 3 6.5 9H10v12h4V9h3.5z',
  right:'M14 4v3.5H9a4 4 0 0 0-4 4V21h4v-9.5h5V15l6-5.5z',left:'M10 4v3.5h5a4 4 0 0 1 4 4V21h-4v-9.5h-5V15L4 9.5z',
  sright:'M13 3h7v7l-2.6-2.6-4.4 4.4V21h-4v-10.8l5.6-5.6z',sleft:'M11 3H4v7l2.6-2.6 4.4 4.4V21h4v-10.8L9.4 4.6z',
  uturn:'M7 21V10a5 5 0 0 1 10 0v4h3l-5 6-5-6h3v-4a1 1 0 0 0-2 0v11z',merge:'M10 21v-6.5L4.5 9 7 6.5l5 5 5-5L19.5 9 14 14.5V21z',
  round:'M12 3 7.5 7.5H11v2.1A5 5 0 1 0 17 14.5h-2.5A2.5 2.5 0 1 1 13 12.1V7.5h3.5z',flag:'M6 21V3h11l-2.5 4.5L17 12H8.5v9z'};
function manKey(m){m=String(m||"");if(/UTURN/.test(m))return "uturn";if(/ROUNDABOUT/.test(m))return "round";if(/MERGE/.test(m))return "merge";if(/SLIGHT_RIGHT|FORK_RIGHT|RAMP_RIGHT/.test(m))return "sright";if(/SLIGHT_LEFT|FORK_LEFT|RAMP_LEFT/.test(m))return "sleft";if(/RIGHT/.test(m))return "right";if(/LEFT/.test(m))return "left";if(/ARRIVE|DESTINATION/.test(m))return "flag";return "straight"}
const manIco=(m,s)=>'<svg class="man" viewBox="0 0 24 24" width="'+(s||40)+'" height="'+(s||40)+'" aria-hidden="true"><path d="'+MAN[manKey(m)]+'" fill="currentColor"/></svg>';

/* ---------- shell ---------- */
const SIDE=[["navigate","Navigate","navigate"],["explore","Explore","explore"],["immersive","Immersive","immersive"],["saved","Saved","saved"],["trips","Trips","trips"],["settings","Settings","settings"]];
const PAGES=["","navigate","explore","immersive","trips","saved","settings"];
function pageFromPath(){let p=location.pathname;if(BASE&&p.startsWith(BASE))p=p.slice(BASE.length);p=p.replace(/^\/+|\/+$/g,"");return PAGES.includes(p)?p:""}
function href(pg){return BASE+"/"+(pg?pg+"/":"")}
function go(pg,replace){if(pg===G.page&&!replace){route();return}const u=href(pg)+location.search;if(replace)history.replaceState({},"",u);else history.pushState({},"",u);route()}
addEventListener("popstate",route);
function shell(){
  const root=$("#gg");root.className="gg "+THEME.cur;
  root.innerHTML='<header class="ghd"><a class="gbrand" href="'+href("")+'" data-go="" aria-label="Groove Guide home"><span class="gpinlogo" aria-hidden="true"><svg viewBox="0 0 32 40" width="30" height="38"><defs><linearGradient id="gpl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc3a1"/><stop offset="1" stop-color="#e98457"/></linearGradient></defs><path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.6 16 39 16 39s15-12.4 15-23.2C31 7.6 24.3 1 16 1z" fill="url(#gpl)"/><circle cx="16" cy="15.5" r="5.6" fill="#0b0b0d"/></svg></span><span class="gbt"><b><em>groove</em> guide<i>.</i></b><small>BY GROOVEVILLE</small></span></a>'+
    '<div class="gsearch" role="search"><span class="gsi">'+ico("explore",20)+'</span><input id="gq" type="search" placeholder="Where we headed?" autocomplete="off" spellcheck="false" aria-label="Search for a place" aria-autocomplete="list" aria-controls="gsug"><button class="gmic" data-a="voice" aria-label="Search by voice" hidden>'+ico("mic",20)+'</button><div class="gsug" id="gsug" role="listbox" hidden></div></div>'+
    '<nav class="gchips" aria-label="Quick places">'+[["home","Home"],["work","Work"],["school","School"],["fav","Favorites"],["recent","Recent"]].map(([k,l])=>'<button class="gchip c-'+k+'" data-a="chip" data-k="'+k+'">'+ico({home:"home",work:"work",school:"school",fav:"heart",recent:"clock"}[k],19)+'<span>'+l+'</span></button>').join("")+'</nav>'+
    '<div class="gthm" role="group" aria-label="Appearance"><button data-a="theme" data-v="light" aria-label="Light mode">'+ico("sun",19)+'</button><button data-a="theme" data-v="dark" aria-label="Dark mode">'+ico("moon",19)+'</button></div>'+
    '<a class="gicon" href="'+esc(CFG.homeUrl)+'" title="Back to Grooveville" aria-label="Back to Grooveville">'+ico("grid",20)+'</a><div class="gacct" id="gacct"></div></header>'+
    '<nav class="gside" aria-label="Groove Guide">'+SIDE.map(([k,l,i])=>'<a href="'+href(k)+'" data-go="'+k+'">'+ico(i,24)+'<span>'+l+'</span></a>').join("")+'<a class="gback" href="'+esc(CFG.homeUrl)+'">'+ico("back",20)+'<span>Grooveville</span></a></nav>'+
    '<main class="gmain"><section id="dash" class="dash"></section><section id="gpage" class="gpage" hidden></section></main>'+
    '<nav class="gtabs" aria-label="Groove Guide">'+[["navigate","Navigate","navigate"],["explore","Explore","explore"],["saved","Saved","saved"],["trips","Trips","trips"],["more","More","more"]].map(([k,l,i])=>k==="more"?'<button data-a="more">'+ico(i,23)+'<span>'+l+'</span></button>':'<a href="'+href(k)+'" data-go="'+k+'">'+ico(i,23)+'<span>'+l+'</span></a>').join("")+'</nav>'+
    '<div id="gmodal"></div><div id="gtoast" role="status" aria-live="polite"></div>';
  if(window.SpeechRecognition||window.webkitSpeechRecognition)$(".gmic").hidden=false;
  paintAccount();paintThemeBtn();
}
function paintThemeBtn(){$$(".gthm button").forEach(b=>{b.classList.toggle("on",b.dataset.v===THEME.cur);b.setAttribute("aria-pressed",b.dataset.v===THEME.cur)})}
function paintAccount(){const a=$("#gacct");if(!a)return;
  if(STORE.uid){a.innerHTML='<button class="gav" data-a="acct" aria-label="Your account" title="'+esc(STORE.email)+'"><b>'+esc((STORE.email||"G").slice(0,1).toUpperCase())+'</b></button>'}
  else a.innerHTML='<button class="gav gin" data-a="signin" aria-label="Sign in or create a free account">'+ico("user",20)+'<span>Sign in</span></button>'}
/* public sign-in: a free Grooveville account keeps saved places, trips and walks on every device */
function authModal(mode,msg){mode=mode||"in";
  modal('<div class="gauth"><h3>'+(mode==="up"?"Create your free account":mode==="reset"?"Reset your password":"Sign in")+'</h3><p class="muted small">'+(mode==="reset"?"We’ll email you a link to set a new password.":"One Grooveville account keeps your saved places, trips, walks and car on every device.")+'</p>'+
    (mode!=="reset"&&window.firebase&&firebase.auth&&firebase.auth.GoogleAuthProvider?'<button class="gbtn ghost wide gg-google" data-a="g-google"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.5c2.1-1.9 3.3-4.8 3.3-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.7H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 13.9a6.6 6.6 0 0 1 0-4.2V6.8H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 6.8l3.6 2.9C6.6 7.4 9.1 5.4 12 5.4z"/></svg> Continue with Google</button><div class="gor"><span>or</span></div>':'')+
    '<form id="gaf" class="frm"><label class="f">Email<input type="email" name="email" autocomplete="email" required></label>'+(mode!=="reset"?'<label class="f">Password<input type="password" name="password" autocomplete="'+(mode==="up"?"new-password":"current-password")+'" minlength="'+(mode==="up"?8:1)+'" required></label>':'')+
    '<p class="gamsg warn" id="gamsg">'+esc(msg||"")+'</p><button class="gbtn wide">'+(mode==="up"?"Create account":mode==="reset"?"Send reset link":"Sign in")+'</button></form>'+
    '<div class="gauthl">'+(mode==="in"?'<button class="linkb" data-a="g-mode" data-v="up">New here? Create a free account</button><button class="linkb" data-a="g-mode" data-v="reset">Forgot password?</button>':'<button class="linkb" data-a="g-mode" data-v="in">Have an account? Sign in</button>')+'</div>'+
    '<p class="muted small">By creating an account you can save places and trips. Groove Team staff sign in on the <a href="'+esc(CFG.signInUrl)+'">Grooveville site</a>.</p></div>',
  el=>el.querySelector("#gaf").addEventListener("submit",async ev=>{ev.preventDefault();const o=Object.fromEntries(new FormData(ev.target)),m=el.querySelector("#gamsg"),btn=ev.target.querySelector("button");btn.disabled=true;m.textContent="";
    try{if(!window.firebase||!firebase.auth)throw {code:"unavailable"};const A=firebase.auth();
      if(mode==="up")await A.createUserWithEmailAndPassword(o.email,o.password);else if(mode==="reset"){await A.sendPasswordResetEmail(o.email);m.classList.remove("warn");m.textContent="Check your email for the reset link.";btn.disabled=false;return}else await A.signInWithEmailAndPassword(o.email,o.password);
      closeModal();toast(mode==="up"?"Account created. Your places will sync.":"Signed in. Syncing your places…")}
    catch(e){btn.disabled=false;m.textContent=authErr(e)}}))}
function authErr(e){const c=String(e&&e.code||"");return /wrong-password|invalid-credential|user-not-found|invalid-login/.test(c)?"That email and password don’t match.":/email-already/.test(c)?"An account with that email already exists. Sign in instead.":/weak-password/.test(c)?"Use at least 8 characters for the password.":/invalid-email/.test(c)?"Check the email address.":/too-many/.test(c)?"Too many tries. Wait a minute and try again.":/popup-closed|cancelled-popup/.test(c)?"Sign-in window closed before finishing.":/operation-not-allowed/.test(c)?"That sign-in method isn’t turned on yet.":/unavailable|network/.test(c)?"Sign-in isn’t available right now. Check your connection.":"Couldn’t sign in. Try again."}
async function googleSignIn(){try{const A=firebase.auth(),P=new firebase.auth.GoogleAuthProvider();try{await A.signInWithPopup(P)}catch(e){if(/popup-blocked|operation-not-supported/.test(String(e.code)))return A.signInWithRedirect(P);throw e}closeModal();toast("Signed in. Syncing your places…")}catch(e){const m=$("#gamsg");if(m)m.textContent=authErr(e)}}
function toast(t,ms){const e=$("#gtoast");if(!e)return;e.textContent=t;e.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("on"),ms||3200)}
function modal(html,mount){const m=$("#gmodal");m.innerHTML='<div class="gscrim" data-a="scrim"><div class="gmod" role="dialog" aria-modal="true">'+html+'</div></div>';const el=m.querySelector(".gmod");if(mount)mount(el);const f=el.querySelector("input,select,button");if(f)f.focus({preventScroll:true});return el}
function closeModal(){$("#gmodal").innerHTML=""}
function route(){
  G.page=pageFromPath();
  $$("[data-go]").forEach(a=>{const on=a.dataset.go===G.page||(a.dataset.go==="navigate"&&G.page==="");a.classList.toggle("on",on);if(on)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  const dashPage=G.page===""||G.page==="navigate";paintRoot();
  $("#dash").hidden=!dashPage;$("#gpage").hidden=dashPage;
  document.title=(G.page?{navigate:"Navigate",explore:"Explore",immersive:"Immersive",trips:"Trips",saved:"Saved",settings:"Settings"}[G.page]+" · ":"")+"Groove Guide";
  if(dashPage){if(!$("#gmap"))dashShell();MAP.ensure();paintAll();if(G.page==="navigate"&&!G.route)setTimeout(()=>{const q=$("#gq");if(q&&innerWidth>760)q.focus()},50)}
  else{IMM.stop();renderPage()}
  $(".gmain").scrollTop=0;
}
function rerender(){if(G.page===""||G.page==="navigate")paintAll();else renderPage()}

/* ---------- geometry ---------- */
const R_E=6371008.8,rad=Math.PI/180;
function hav(a,b){const dl=(b.lat-a.lat)*rad,dn=(b.lng-a.lng)*rad,x=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;return 2*R_E*Math.asin(Math.sqrt(x))}
function bearing(a,b){const y=Math.sin((b.lng-a.lng)*rad)*Math.cos(b.lat*rad),x=Math.cos(a.lat*rad)*Math.sin(b.lat*rad)-Math.sin(a.lat*rad)*Math.cos(b.lat*rad)*Math.cos((b.lng-a.lng)*rad);return (Math.atan2(y,x)/rad+360)%360}
function decodePoly(s){const pts=[];let i=0,lat=0,lng=0;while(i<s.length){let b,sh=0,r=0;do{b=s.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5}while(b>=32);lat+=r&1?~(r>>1):r>>1;sh=0;r=0;do{b=s.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5}while(b>=32);lng+=r&1?~(r>>1):r>>1;pts.push({lat:lat/1e5,lng:lng/1e5})}return pts}
/* nearest point on the route (local flat approximation) */
function snap(path,cum,p,from){let best={d:1e12,i:0,t:0,s:0};const lo=Math.max(0,(from||0)-40),hi=Math.min(path.length-1,(from||0)+400);const k=Math.cos(p.lat*rad);
  for(let i=lo;i<hi;i++){const a=path[i],b=path[i+1],ax=(a.lng-p.lng)*k*111320,ay=(a.lat-p.lat)*110540,bx=(b.lng-p.lng)*k*111320,by=(b.lat-p.lat)*110540,dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy;let t=L?-(ax*dx+ay*dy)/L:0;t=clamp(t,0,1);const x=ax+t*dx,y=ay+t*dy,d=Math.hypot(x,y);if(d<best.d)best={d,i,t,s:cum[i]+t*(cum[i+1]-cum[i])}}
  return best}
function prepRoute(r){r.path=decodePoly(r.polyline);r.cum=[0];for(let i=1;i<r.path.length;i++)r.cum.push(r.cum[i-1]+hav(r.path[i-1],r.path[i]));r.len=r.cum[r.cum.length-1]||r.distanceM;
  let from=0;r.steps.forEach(s=>{if(s.end){const sn=snap(r.path,r.cum,s.end,from);s.endD=sn.s;from=sn.i}else s.endD=r.len});
  const d=(r.durationSec||0)-(r.staticSec||r.durationSec||0),f=r.staticSec?d/r.staticSec:0;r.trafficLevel=G.mode==="WALK"?"":f<.05?"Light traffic":f<.15?"Moderate traffic":"Heavy traffic";r.delaySec=Math.max(0,d);return r}

/* ---------- Google Maps: key from Cloudflare at runtime, with clear diagnostics ---------- */
const RCFG={done:false,err:"",src:"",sameAsServer:false};
async function runtimeCfg(){
  if(RCFG.done)return;RCFG.done=true;
  if(CFG.googleMapsKey){RCFG.src="guide-config.js";return}
  try{const r=await fetch(CFG.apiBase+"/config",{credentials:"same-origin"});if(!r.ok)throw new Error("HTTP "+r.status);const j=await r.json();
    if(j.googleMapsKey){CFG.googleMapsKey=j.googleMapsKey;RCFG.src="Cloudflare variable GOOGLE_MAPS_BROWSER_KEY"}
    if(j.mapIdDark)CFG.mapIdDark=j.mapIdDark;if(j.mapIdLight)CFG.mapIdLight=j.mapIdLight;RCFG.sameAsServer=!!j.sameAsServerKey}
  catch(e){RCFG.err=String(e.message||e)}
}
const MAPERR={code:"",detail:""};
const CF_STEPS='In Cloudflare open <b>Workers &amp; Pages › grooveville › Settings › Variables and Secrets</b>, click <b>Add</b>, name it <code>GOOGLE_MAPS_BROWSER_KEY</code>, paste the “Groove Guide – Website” key, and deploy.';
const KEY_PAGE='Google Cloud › APIs &amp; Services › Credentials › “Groove Guide – Website”';
function diagText(code){return ({
  nokey:["Map setup needed","Groove Guide didn’t receive a browser map key.",CF_STEPS],
  limit:["Groove Guide is resting until tomorrow","Grooveville’s server reached today’s Cloudflare request limit, so the map can’t load right now. It resets at 8 PM Eastern (midnight UTC)."],
  cfgfail:["Couldn’t reach Groove Guide settings","The page couldn’t load its settings from the server. Check your connection and try again."],
  MissingKeyMapError:["Map setup needed","Google says no key was sent with the map request.",CF_STEPS],
  InvalidKeyMapError:["The map key isn’t valid","Google doesn’t recognize the key Groove Guide is using.","Copy the key again from "+KEY_PAGE+" into <code>GOOGLE_MAPS_BROWSER_KEY</code> in Cloudflare."],
  ExpiredKeyMapError:["The map key has expired","Google reports the key as expired or deleted.","Copy the current key from "+KEY_PAGE+" into <code>GOOGLE_MAPS_BROWSER_KEY</code> in Cloudflare."],
  RefererNotAllowedMapError:["This site isn’t allowed to use the map key","The key’s website restrictions don’t include this address ("+esc(location.origin)+").","In "+KEY_PAGE+", under Website restrictions add <code>https://grooveville.org/*</code> (and any preview address you use, for example <code>https://*.workers.dev/*</code>)."],
  ApiNotActivatedMapError:["Maps JavaScript API isn’t turned on","The Google Cloud project hasn’t enabled the Maps JavaScript API.","In Google Cloud › APIs &amp; Services › Library, enable <b>Maps JavaScript API</b> (and <b>Places API (New)</b> for search)."],
  ApiTargetBlockedMapError:["The key doesn’t allow the Maps JavaScript API","The key’s API restrictions leave out the Maps JavaScript API.","In "+KEY_PAGE+" › API restrictions, include <b>Maps JavaScript API</b> and <b>Places API (New)</b>."],
  BillingNotEnabledMapError:["Billing isn’t active for the map project","Google needs billing enabled on the project that owns the key.","Turn on billing in Google Cloud › Billing for that project."],
  OverQuotaMapError:["Map usage limit reached","The project hit its Maps quota for now.","Check Google Cloud › APIs &amp; Services › Maps JavaScript API › Quotas."],
  OverMapQuota:["Map usage limit reached","The project hit its Maps quota for now.","Check Google Cloud › APIs &amp; Services › Maps JavaScript API › Quotas."],
  DeletedApiProjectMapError:["The map project was removed","The Google Cloud project that owns the key no longer exists."],
  auth:["The map key was refused","Google rejected the key. Check its website and API restrictions.","Open "+KEY_PAGE+" and confirm Website restrictions include <code>https://grooveville.org/*</code> and API restrictions include Maps JavaScript API and Places API (New)."],
  load:["The map couldn’t download","The Google Maps script didn’t load. This is usually the network, an ad or privacy blocker, or a firewall."],
  init:["The map couldn’t start","The map loaded but failed to start."+(MAPERR.detail?" ("+esc(MAPERR.detail.slice(0,120))+")":"")]
}[code])||["The map couldn’t load","Something went wrong loading the map ("+esc(code)+")."]}
function mapDiag(){try{console.info("[Groove Guide] map diagnostics",{code:MAPERR.code||"ok",keySource:RCFG.src||"none",keyPresent:!!CFG.googleMapsKey,keyHint:CFG.googleMapsKey?CFG.googleMapsKey.slice(0,6)+"…":"",origin:location.origin,mapIdDark:CFG.mapIdDark,mapIdLight:CFG.mapIdLight,version:CFG.mapsVersion,configError:RCFG.err||""})}catch(e){}}
function mapFail(code){MAPERR.code=code;MAP.failed=code;mapDiag();paintMapFallback();if(G.page==="explore"&&EXP.cat){EXP.err=diagText(code)[0];const r=$("#exr");if(r)r.innerHTML=exploreBody()}}
window.gm_authFailure=()=>mapFail(MAPERR.code&&MAPERR.code!=="load"?MAPERR.code:"auth");
["error","warn"].forEach(k=>{const o=console[k];console[k]=function(){try{const t=[...arguments].join(" "),m=/Google Maps JavaScript API (?:error|warning): (\w+)/.exec(t);if(m&&/MapError$|^OverMapQuota$/.test(m[1])){MAPERR.code=m[1];if(MAP.failed||k==="error")mapFail(m[1])}}catch(e){}return o.apply(console,arguments)}});

const MAP={map:null,failed:"",loading:false,lines:[],marks:[],veh:null,dest:null,follow:true,view:"aerial",
  async load(){
    if(MAP.libs)return;
    const pre=window.google&&google.maps&&google.maps.importLibrary;
    if(!pre){
      await runtimeCfg();
      if(!CFG.googleMapsKey){MAPERR.code=/429/.test(RCFG.err)?"limit":RCFG.err?"cfgfail":"nokey";throw new Error(MAPERR.code)}
      if(RCFG.sameAsServer)console.warn("[Groove Guide] GOOGLE_MAPS_BROWSER_KEY is the same as the server key. Use the separate “Groove Guide – Website” browser key.");
      (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src="https://maps."+c+"apis.com/maps/api/js?"+e;d[q]=f;a.onerror=()=>h=n(Error("load"));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({key:CFG.googleMapsKey,v:CFG.mapsVersion||"weekly"});
    }
    let maps,marker,places;
    try{[maps,marker,places]=await Promise.all([google.maps.importLibrary("maps"),google.maps.importLibrary("marker"),google.maps.importLibrary("places")])}
    catch(e){MAPERR.code=MAPERR.code||"load";throw new Error(MAPERR.code)}
    MAP.libs={maps,marker,places};
  },
  async ensure(){if(MAP.map||MAP.loading)return;MAP.loading=true;MAP.view=D.settings.view==="flat"?"flat":"aerial";
    try{await MAP.load();try{MAP.create()}catch(e){MAPERR.code=MAPERR.code||"init";MAPERR.detail=String(e&&e.message||e);throw e}}
    catch(e){MAP.map=null;MAP.failed=MAPERR.code||"load";mapDiag();paintMapFallback()}MAP.loading=false},
  create(c,z){const el=$("#gmap");if(!el)return;const dark=THEME.cur==="dark",M=MAP.libs.maps;
    const o={center:c||G.pos||CFG.defaultCenter,zoom:z||(G.pos?15.5:13),mapId:dark?CFG.mapIdDark:CFG.mapIdLight,disableDefaultUI:true,gestureHandling:"greedy",clickableIcons:false,tilt:MAP.view==="aerial"?62:0,heading:0,isFractionalZoomEnabled:true,keyboardShortcuts:true};
    if(google.maps.ColorScheme)o.colorScheme=dark?google.maps.ColorScheme.DARK:google.maps.ColorScheme.LIGHT;
    if(google.maps.RenderingType)o.renderingType=google.maps.RenderingType.VECTOR;
    MAP.map=new M.Map(el,o);if(!MAPERR.code){MAP.failed="";paintMapFallback()}else{MAP.failed=MAPERR.code;paintMapFallback()}
    MAP.map.addListener("dragstart",()=>{if(G.nav){MAP.follow=false;paintRecenter()}});
    MAP.map.addListener("heading_changed",()=>MAP.rotateVeh());
    MAP.draw();
  },
  rebuild(){if(!MAP.map)return;const c=MAP.map.getCenter(),z=MAP.map.getZoom();MAP.clear(true);const old=$("#gmap"),n=document.createElement("div");n.id="gmap";old.replaceWith(n);MAP.map=null;MAP.create(c&&{lat:c.lat(),lng:c.lng()},z)},
  clear(all){MAP.lines.forEach(l=>l.setMap(null));MAP.lines=[];if(all){MAP.marks.forEach(m=>m.map=null);MAP.marks=[];if(MAP.veh)MAP.veh.map=null;MAP.veh=null;if(MAP.dest)MAP.dest.map=null;MAP.dest=null}},
  pinEl(color,icon,label,big){const d=document.createElement("div");d.className="gpin"+(big?" big":"");d.style.setProperty("--pc",color);d.innerHTML='<span class="gpb">'+ico(icon,big?20:16)+'</span>'+(label?'<span class="gpl">'+esc(label)+'</span>':'');return d},
  draw(){if(!MAP.map)return;MAP.clear(true);const Mk=MAP.libs.marker.AdvancedMarkerElement,P=MAP.libs.maps.Polyline,dark=THEME.cur==="dark";
    G.routes.forEach((r,i)=>{if(i===G.sel||!r.path)return;const l=new P({path:r.path,strokeColor:dark?"#8a8580":"#a79fc2",strokeOpacity:.75,strokeWeight:7,zIndex:1,clickable:true,map:MAP.map});l.addListener("click",()=>pickRoute(i));MAP.lines.push(l)});
    const r=G.route;
    if(r&&r.path){MAP.lines.push(new P({path:r.path,strokeColor:ROUTE_COLOR(),strokeOpacity:dark?.22:.18,strokeWeight:26,zIndex:4,clickable:false,map:MAP.map}));
      MAP.lines.push(new P({path:r.path,strokeColor:dark?"#2a1408":"#ffffff",strokeOpacity:dark?.85:1,strokeWeight:15,zIndex:5,clickable:false,map:MAP.map}));
      MAP.lines.push(new P({path:r.path,strokeColor:ROUTE_COLOR(),strokeOpacity:1,strokeWeight:9,zIndex:6,clickable:false,map:MAP.map}));
      if(G.mode==="DRIVE")r.traffic.forEach(t=>{if(t.speed==="NORMAL")return;const seg=r.path.slice(t.s,t.e+1);if(seg.length>1)MAP.lines.push(new P({path:seg,strokeColor:t.speed==="TRAFFIC_JAM"?"#d9572b":"#f2b13c",strokeWeight:5,zIndex:7,clickable:false,map:MAP.map}))})}
    D.saved.forEach(s=>{if(!s.lat)return;const m=new Mk({map:MAP.map,position:{lat:s.lat,lng:s.lng},content:MAP.pinEl(placeColor(s),kindIcon(s.kind),"",false),title:s.name,zIndex:3});m.addListener("click",()=>chooseDest(s));MAP.marks.push(m)});
    (G.stops||[]).forEach((s,i)=>MAP.marks.push(new Mk({map:MAP.map,position:s,content:MAP.pinEl("#b7a1e5","pin",String(i+1),false),title:s.name||"Stop",zIndex:8})));
    if(G.dest)MAP.dest=new Mk({map:MAP.map,position:{lat:G.dest.lat,lng:G.dest.lng},content:MAP.pinEl(G.dest.color||ROUTE_COLOR(),G.dest.icon||"flag",G.dest.name,true),title:G.dest.name,zIndex:9});
    MAP.vehicle();
  },
  vehEl(){const d=document.createElement("div");d.className="gveh "+MAP.view;d.innerHTML=MAP.view==="flat"?vehArrowSvg(D.vehicle.color):vehTopSvg(D.vehicle.color,D.vehicle.type);return d},
  vehicle(){if(!MAP.map)return;const p=G.nav?G.nav.snapPos||G.pos:G.pos;if(!p){if(MAP.veh){MAP.veh.map=null;MAP.veh=null}return}
    if(!MAP.veh||MAP.veh._v!==MAP.view+D.vehicle.color+D.vehicle.type){if(MAP.veh)MAP.veh.map=null;MAP.veh=new MAP.libs.marker.AdvancedMarkerElement({map:MAP.map,position:p,content:MAP.vehEl(),zIndex:20,title:D.vehicle.nick||"You"});MAP.veh._v=MAP.view+D.vehicle.color+D.vehicle.type}
    else MAP.veh.position=p;MAP.rotateVeh()},
  rotateVeh(){if(!MAP.veh||!MAP.map)return;const h=(curHeading()||0)-(MAP.map.getHeading()||0);const s=MAP.veh.content.querySelector("svg");if(s)s.style.transform="rotate("+h+"deg)"},
  setView(v){if(v==="toggle")v=MAP.view==="aerial"?"flat":"aerial";MAP.view=v;D.settings.view=v;save();
    if(MAP.map){if(G.nav){MAP.follow=true;paintRecenter();MAP.recenter()}
      else if(v==="aerial"){const r=G.route,p=r&&r.path&&r.path.length?r.path[0]:(G.pos||MAP.map.getCenter()),hd=r&&r.path&&r.path.length>1?bearing(r.path[0],r.path[Math.min(6,r.path.length-1)]):(MAP.map.getHeading()||0);
        MAP.map.moveCamera({center:p,zoom:Math.max(17,MAP.map.getZoom()||0),tilt:67,heading:hd})}
      else{MAP.map.moveCamera({tilt:0,heading:0});if(G.route)MAP.fit()}
      MAP.vehicle();if(v==="aerial")MAP.check3d()}
    paintMapTools()},
  check3d(){try{const rt=MAP.map.getRenderingType&&MAP.map.getRenderingType();if(rt&&String(rt).toUpperCase()==="RASTER")toast("This device is showing the flat map, so 3D tilt isn’t available here.",5000)}catch(e){}},
  zoom(d){if(MAP.map)MAP.map.moveCamera({zoom:(MAP.map.getZoom()||14)+d})},
  north(){if(MAP.map)MAP.map.moveCamera({heading:0})},
  fit(){if(!MAP.map||!G.route||!G.route.path)return;const b=new google.maps.LatLngBounds();G.route.path.forEach(p=>b.extend(p));MAP.map.moveCamera({tilt:0,heading:0});
    let pad={top:120,bottom:90,left:60,right:60};if(innerWidth<=760){const tc=$("#tripcard"),tb=$("#tbar");const bot=G.nav?(tb?tb.offsetHeight:100):(tc&&tc.offsetParent?tc.offsetHeight:220);pad={top:G.nav?130:40,bottom:bot+30,left:36,right:70}}
    MAP.map.fitBounds(b,pad);if(MAP.view==="aerial"){const t=()=>MAP.map&&MAP.map.moveCamera({tilt:45});if(google.maps.event&&google.maps.event.addListenerOnce)google.maps.event.addListenerOnce(MAP.map,"idle",t);else setTimeout(t,400)}},
  recenter(){MAP.follow=true;paintRecenter();const p=(G.nav&&G.nav.snapPos)||G.pos;if(MAP.map&&p)MAP.map.moveCamera({center:p,zoom:G.nav?17.5:15.5,tilt:MAP.view==="aerial"?(G.nav?65:55):0,heading:G.nav&&MAP.view==="aerial"?curHeading()||0:0})},
  followTick(){if(!MAP.map||!G.nav||!MAP.follow)return;const p=G.nav.snapPos||G.pos;if(p)MAP.map.moveCamera({center:p,zoom:G.mode==="WALK"?18:17.5,tilt:MAP.view==="aerial"?65:0,heading:MAP.view==="aerial"?curHeading()||0:0})}
};
function vehArrowSvg(c){return '<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="17" fill="'+c+'" opacity=".22"/><path d="M20 6 31 32l-11-6-11 6z" fill="'+c+'" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>'}
function vehTopSvg(c,type){const w=type==="truck"||type==="suv"?18:16,l=type==="truck"?38:34;
  return '<svg viewBox="0 0 44 44" width="46" height="46"><defs><linearGradient id="vg" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs><ellipse cx="22" cy="23" rx="'+(w/2+5)+'" ry="'+(l/2+3)+'" fill="#000" opacity=".28"/><rect x="'+(22-w/2)+'" y="'+(22-l/2)+'" width="'+w+'" height="'+l+'" rx="6" fill="'+c+'" stroke="#fff" stroke-width="1.6"/><rect x="'+(22-w/2)+'" y="'+(22-l/2)+'" width="'+w+'" height="'+l+'" rx="6" fill="url(#vg)"/><path d="M'+(22-w/2+2)+' '+(22-l/2+9)+' h'+(w-4)+' l-2 6 h'+(-(w-8))+'z" fill="#0b1018" opacity=".85"/><rect x="'+(22-w/2+3)+'" y="'+(22+l/2-9)+'" width="'+(w-6)+'" height="4" rx="1.5" fill="#0b1018" opacity=".7"/><circle cx="'+(22-w/2+3)+'" cy="'+(22-l/2+2.5)+'" r="1.6" fill="#fff8d6"/><circle cx="'+(22+w/2-3)+'" cy="'+(22-l/2+2.5)+'" r="1.6" fill="#fff8d6"/></svg>'}
function curHeading(){if(G.nav&&G.nav.heading!=null)return G.nav.heading;return G.heading}

/* ---------- dashboard ---------- */
function dashShell(){
  $("#dash").innerHTML='<div class="mapcol"><div class="mapbox"><div id="gmap" role="application" aria-label="Map"></div><div class="mapfb" id="mapfb" hidden></div>'+
    '<div class="tripcard gl" id="tripcard"></div>'+
    '<div class="mtools"><button class="rb vtog" id="vtog" data-a="view" data-v="toggle">3D</button><button class="rb" data-a="fit" aria-label="Show the whole route" title="Whole route">'+ico("layers",20)+'</button><button class="rb dvbtn" data-a="drivetoggle" aria-label="Driving view" title="Driving view">'+ico("car",20)+'</button></div>'+
    '<div class="mzoom gl"><button data-a="zoom" data-d="1" aria-label="Zoom in">'+ico("plus",20)+'</button><button data-a="zoom" data-d="-1" aria-label="Zoom out">'+ico("minus",20)+'</button></div>'+
    '<button class="mcomp gl" data-a="north" aria-label="Face north">'+'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3 16.5 19 12 15.5 7.5 19z" fill="currentColor"/></svg></button>'+
    '<button class="mrecenter" data-a="recenter" id="mrec" hidden>'+ico("locate",18)+' Re-center</button>'+
    '<div class="nextturn gl" id="nextturn" hidden></div><div class="mspd gl" id="mspd" hidden></div>'+
    '<div class="laysw gl" role="group" aria-label="Screen layout"><button data-a="layout" data-v="70">70/30</button><button data-a="layout" data-v="80">80/20</button><button data-a="layout" data-v="map">Map</button></div>'+
    '<div class="modesw gl" role="group" aria-label="Travel mode"><button data-a="mode" data-v="DRIVE">'+ico("car",18)+'<span>Drive</span></button><button data-a="mode" data-v="WALK">'+ico("walk",18)+'<span>Walk</span></button></div>'+
    '</div></div>'+
    '<aside class="drivecol gl" id="drivecol" aria-label="Driving view"><button class="dexp" data-a="drivetoggle" aria-label="Show or hide the driving view"></button><div class="dhead" id="dhead"></div><div class="dstage"><canvas id="dcv"></canvas><div class="dnote" id="dnote"></div><div class="dspd" id="dspd"></div></div><div class="dfoot" id="dfoot"></div></aside>'+
    '<footer class="tbar gl" id="tbar"><button class="tgrab" data-a="sheet" aria-label="Show trip details"></button><div class="tbin" id="tbin"></div></footer>';
  DRIVE.init($("#dcv"));setLayout(D.settings.layout||"70",true);
}
function setLayout(v,quiet){G.layout=v;const d=$("#dash");if(d){d.classList.remove("lay-70","lay-80","lay-map");d.classList.add("lay-"+v)}$$(".laysw button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));if(!quiet){D.settings.layout=v;save()}DRIVE.resize()}
function paintMapFallback(){const f=$("#mapfb");if(!f)return;
  if(!MAP.failed){f.hidden=true;return}f.hidden=false;const d=diagText(MAP.failed);
  f.innerHTML='<div><span class="fbk">'+ico("info",20)+'</span><b>'+esc(d[0])+'</b><p>'+d[1]+'</p>'+(d[2]?'<p class="fbfix">'+d[2]+'</p>':'')+'<div class="fbb"><button class="gbtn" data-a="retry-map">Try again</button></div><small>Error code: '+esc(MAP.failed)+'</small></div>'}
function paintMapTools(){const vt=$("#vtog"),a3=MAP.view==="aerial";if(vt){vt.textContent=a3?"3D":"2D";vt.classList.toggle("on",a3);vt.setAttribute("aria-label",a3?"3D view on. Switch to flat 2D map":"Flat 2D map. Switch to 3D view");vt.title=a3?"Switch to 2D":"Switch to 3D"}const gg=$("#gg");if(gg)gg.classList.toggle("v3d",a3);$$(".modesw button").forEach(b=>b.classList.toggle("on",b.dataset.v===G.mode))}
function paintRecenter(){const b=$("#mrec");if(b)b.hidden=!(G.nav&&!MAP.follow)}
function paintAll(){const d=$("#dash");if(d){d.classList.toggle("navving",!!G.nav);d.classList.toggle("hasroute",!!G.route);if(G.nav)d.classList.remove("sheet-open")}paintRoot();paintTrip();paintNext();paintDrive();paintTbar();paintMapTools();paintRecenter();paintChips();requestAnimationFrame(sizeBottom)}
/* phone: hide the header chips while a route is up, and the whole header + tab bar while navigating, so the map has room */
function paintRoot(){const gg=$("#gg");if(!gg)return;const dp=G.page===""||G.page==="navigate";gg.classList.toggle("rt",dp&&!!G.dest);gg.classList.toggle("nv",dp&&!!G.nav)}
function sizeBottom(){const d=$("#dash");if(!d)return;const gg=$("#gg"),tc=$("#tripcard"),tb=$("#tbar");let h=96;
  if(innerWidth<=760){if(gg&&gg.classList.contains("rt")&&!G.nav&&tc&&tc.offsetParent)h=tc.offsetHeight+10;else if(tb&&tb.offsetParent)h=Math.min(tb.offsetHeight,160)}
  d.style.setProperty("--bot",h+"px")}
function paintChips(){$$(".gchip").forEach(b=>{const k=b.dataset.k;if(k==="home"||k==="work"||k==="school"){const s=savedOf(k);b.classList.toggle("set",!!s);b.title=s?s.name+" · "+(s.addr||""):"Set your "+k}})}
function originLabel(){return G.pos?(G.posSrc==="map"?"Map center":"Your location"):"Location off"}
function paintTrip(){const c=$("#tripcard");if(!c)return;const r=G.route;
  c.classList.toggle("hero",!G.dest);
  if(!G.dest){c.innerHTML='<div class="ghero"><h1>Your City.<br>Your Route.<br><em>Your Vibe.</em></h1><p class="gcaps">Where we headed?</p>'+
    '<div class="gfeat"><button data-a="focus-search">'+ico("navigate",22)+'<b>Real-time navigation</b><small>Smarter routes. Less stress.</small></button><button data-a="feat-weather">'+ico("cloud",22)+'<b>Weather &amp; time</b><small>Know what to expect.</small></button><a href="'+href("settings")+'" data-go="settings">'+ico("car",22)+'<b>Personalized drive</b><small>Your vehicle. Your style.</small></a><a href="'+href("explore")+'" data-go="explore">'+ico("pin",22)+'<b>Discover more</b><small>Great places. Your next move.</small></a></div>'+
    '<div class="gstat">'+ico("locate",16)+'<span>'+(G.geoErr?esc(G.geoErr):G.pos?"Starting from your location":"Allow location to start from where you are")+'</span>'+(!G.pos?'<button class="gbtn sm" data-a="locate">Use my location</button>':'')+'</div></div>';return}
  c.innerHTML='<div class="tc">'+ico("pin",22)+'<div class="tct"><b>'+esc(originLabel())+'</b><b class="to">→ '+esc(G.dest.name)+'</b>'+(G.stops.length?'<small>'+G.stops.length+' stop'+(G.stops.length>1?'s':'')+' added</small>':'')+
    (G.busy?'<small>Finding the best route…</small>':G.err?'<small class="warn">'+esc(G.err)+'</small>':r?'<small>'+fmtDur(r.durationSec)+' · '+fmtDist(r.distanceM)+' · arrive '+fmtTime(arrival())+(r.trafficLevel?' · '+r.trafficLevel:'')+'</small>':'')+'</div><button class="tcx" data-a="clear" aria-label="Clear destination">'+ico("x",18)+'</button></div>'+
    (G.routes.length>1&&!G.nav?'<div class="alts">'+G.routes.map((x,i)=>'<button class="'+(i===G.sel?"on":"")+'" data-a="alt" data-i="'+i+'"><b>'+fmtDur(x.durationSec)+'</b><small>'+(i===0?"Best":x.description?"via "+esc(x.description):"Option "+(i+1))+(x.toll?" · tolls":"")+'</small></button>').join("")+'</div>':'')+
    (r&&!G.busy?'<div class="tcb">'+(G.nav?'<button class="gbtn ghost" data-a="end">'+ico("stop",16)+' End</button>':'<button class="gbtn" data-a="start">'+ico("navigate",16)+' Start</button>')+'<button class="gbtn ghost icon" data-a="savedest" aria-label="Save this place">'+ico("star",16)+'</button><button class="gbtn ghost icon tcdet" data-a="sheet" aria-label="Trip details: weather, time, stops">'+ico("info",16)+'</button></div>':'')+
    (G.sim?'<div class="simtag">Simulation · not your real position</div>':'');
}
function nextInfo(){const n=G.nav;if(!n||!G.route)return null;const st=G.route.steps;const k=n.step;const nx=st[k+1];
  return {dist:Math.max(0,(st[k]?st[k].endD:G.route.len)-n.s),man:nx?nx.maneuver:"DESTINATION",instr:nx?nx.instr:"Arrive at "+(G.dest?G.dest.name:"your destination")}}
function paintNext(){const e=$("#nextturn");if(!e)return;const r=G.route;let ni=nextInfo();
  if(!ni&&r&&r.steps.length){const s=r.steps[1]||r.steps[0];ni={dist:r.steps[0].distanceM,man:s.maneuver,instr:s.instr,preview:true}}
  if(!ni){e.hidden=true;return}e.hidden=false;
  e.innerHTML='<span class="nti">'+manIco(ni.man,46)+'</span><div><small>'+(ni.preview?"First turn":"Next turn")+'</small><b>'+fmtDist(ni.dist)+'</b><span>'+esc(shortInstr(ni.instr))+'</span></div><button class="ntv" data-a="voice-toggle" aria-label="'+(D.settings.voice?"Mute voice guidance":"Turn on voice guidance")+'">'+ico(D.settings.voice?"vol":"mute",20)+'</button>';
}
const shortInstr=t=>String(t||"").split("\n")[0].replace(/\s*Pass by.*$/,"");
function paintDrive(){const h=$("#dhead"),f=$("#dfoot"),n=$("#dnote");if(!h)return;const ni=nextInfo();
  if(ni){h.innerHTML=manIco(ni.man,44)+'<div><b>'+esc(shortInstr(ni.instr))+'</b><small>'+(ni.dist<30?"Now":"In "+fmtDist(ni.dist))+'</small></div>'}
  else if(G.route){h.innerHTML=manIco("STRAIGHT",44)+'<div><b>Ready when you are</b><small>'+esc(fmtDur(G.route.durationSec))+' to '+esc(G.dest?G.dest.name:"destination")+'</small></div>'}
  else h.innerHTML=manIco("STRAIGHT",44)+'<div><b>No active route</b><small>Pick a destination to see the road ahead</small></div>';
  const sp=speedFmt(G.speed);
  const ms=$("#mspd");if(ms){ms.hidden=!G.nav||G.mode==="WALK";ms.innerHTML='<b>'+(sp==null?"—":sp)+'</b><small>'+speedUnit()+'</small>'}
  const ds=$("#dspd");if(ds)ds.innerHTML='<span class="whl">'+'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.2"/><path d="M3.5 10.5h6.3M14.2 10.5h6.3M12 14.2V21"/></svg></span><div class="spd"><b>'+(sp==null?"—":sp)+'</b><small>'+speedUnit()+'</small></div><div class="lim" title="Speed limit data isn’t available from the route service yet"><small>SPEED<br>LIMIT</small><b>—</b></div>';
  f.innerHTML='<div class="lanes">'+laneHtml(ni)+'</div>';
  n.textContent=G.route?(G.sim?"Simulated drive along your real route":"Route ahead, drawn from your real route. Not a camera view."):"";
  DRIVE.dirty=true;
}
/* Lane guidance: only shown when a verified lane provider supplies data. None is connected yet, so we show the maneuver, not lanes. */
const LANES={provider:null,get(step){return this.provider?this.provider(step):null}};
function laneHtml(ni){const l=ni&&LANES.get(ni);if(l&&l.lanes)return l.lanes.map(x=>'<span class="ln'+(x.ok?" ok":"")+'">'+manIco(x.dir,26)+'</span>').join("");
  return '<span class="ln ok">'+manIco(ni?ni.man:"STRAIGHT",28)+'</span><small class="lnn">Lane data unavailable. Follow the arrow.</small>'}
function arrival(){const r=G.route;if(!r)return null;const left=G.nav?G.nav.leftSec:r.durationSec;return Date.now()+left*1000}
function paintTbar(){const t=$("#tbin");if(!t)return;const r=G.route,di=G.intel.dest,oi=G.intel.origin;
  if(!r){t.innerHTML='<div class="tbe">'+ico("info",20)+'<span>Arrival time, traffic, weather and local time appear here once you pick a destination.</span></div>'+tools(false);return}
  const arr=arrival(),tz=di&&di.tz&&!di.tz.error?di.tz.id:"",left=G.nav?G.nav.leftSec:r.durationSec,leftM=G.nav?Math.max(0,r.len-G.nav.s):r.distanceM;
  const wAt=di&&di.weather&&!di.weather.error?weatherAt(di.weather,arr):null;
  const diff=tz&&oi&&oi.tz&&!oi.tz.error?Math.round((di.tz.offsetSec-oi.tz.offsetSec)/3600):null;
  t.innerHTML='<div class="tbi">'+ico("flag",26)+'<div><small>Arrival</small><b>'+fmtTime(arr,tz||undefined)+'</b><span>'+(tz?esc(tzAbbr(arr,tz))+' · ':'')+esc(G.dest.city||G.dest.name)+'</span></div></div>'+
    '<div class="tbi">'+ico("clock",26)+'<div><small>Remaining</small><b>'+fmtDur(left)+'</b><span>'+fmtDist(leftM)+'</span></div></div>'+
    (G.nav?'<button class="gbtn tbend" data-a="end">'+ico("stop",16)+' End</button>':'')+'<div class="tbi eta">'+ico(G.mode==="WALK"?"walk":"car",26)+'<div><small>'+(G.mode==="WALK"?"Walking":"ETA details")+'</small><b>'+(G.mode==="WALK"?(G.walkStats||"On foot"):r.delaySec>120?"+"+fmtDur(r.delaySec)+" delay":"On time")+'</b><span>'+(G.mode==="WALK"?"Pace shown while you walk":r.trafficLevel||"Live traffic")+'</span></div></div>'+
    '<button class="tbi wx" data-a="weather">'+(wAt&&wAt.icon?'<img src="'+esc(wAt.icon+(THEME.cur==="dark"?"_dark":"")+".svg")+'" alt="" width="34" height="34">':ico("cloud",26))+'<div><small>Weather at destination</small><b>'+(wAt&&wAt.temp!=null?wAt.temp+"°":"—")+'</b><span>'+(wAt?esc(wAt.text||""):di&&di.weather&&di.weather.error?"Unavailable":di?"…":"Loading…")+'</span></div>'+ico("back",16).replace('class="ic"','class="ic chev"')+'</button>'+
    '<div class="tbi dtz">'+ico("clock",26)+'<div><small>Destination time</small><b>'+(tz?fmtTime(Date.now(),tz):"—")+'</b><span>'+(tz?esc(tzAbbr(Date.now(),tz))+(diff?" ("+(diff>0?"+":"")+diff+" hr)":diff===0?" · same time":""):di&&di.tz&&di.tz.error?"Unavailable":"…")+'</span></div></div>'+tools(true);
}
function tools(on){return '<div class="tbtools"><small>Trip tools</small><div><button class="gbtn ghost sm" data-a="addstop"'+(on?'':' disabled')+'>'+ico("pin",16)+' Add Stop</button><button class="gbtn ghost sm" data-a="share"'+(on?'':' disabled')+'>'+ico("share",16)+' Share ETA</button><button class="gbtn ghost sm" data-a="options">'+ico("sliders",16)+' Route Options</button></div></div>'}
function weatherAt(w,t){if(!w)return null;if(!t||t-Date.now()<45*60000||!w.hours||!w.hours.length)return w.now;let b=null,bd=1e15;w.hours.forEach(h=>{const d=Math.abs(Date.parse(h.t)-t);if(d<bd){bd=d;b=h}});return bd<3*3600000?b:w.now}

/* ---------- server calls ---------- */
async function api(path,o){o=o||{};const r=await fetch(CFG.apiBase+path,{method:o.method||"GET",headers:o.body?{"content-type":"application/json"}:{},body:o.body?JSON.stringify(o.body):undefined,credentials:"same-origin"});
  let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.error||"Something went wrong ("+r.status+")");return j}

/* ---------- location ---------- */
function startGeo(){
  if(!navigator.geolocation){G.geoErr="This browser can’t share your location.";paintTrip();return}
  if(G.watch!=null)return;
  G.watch=navigator.geolocation.watchPosition(onPos,e=>{G.geoErr=e.code===1?"Location is blocked for this site. Allow it in your browser settings.":"Can’t find your location right now.";if(e.code===1){navigator.geolocation.clearWatch(G.watch);G.watch=null}paintTrip()},{enableHighAccuracy:true,maximumAge:1500,timeout:25000});
}
function locateOnce(ms){return new Promise(res=>{if(G.pos&&G.posSrc==="gps")return res(G.pos);startGeo();let n=0;const t=setInterval(()=>{n+=200;if((G.pos&&G.posSrc==="gps")||n>(ms||9000)||G.geoErr){clearInterval(t);res(G.posSrc==="gps"?G.pos:null)}},200)})}
let lastFix=null;
function onPos(p){if(G.sim)return;const c=p.coords,np={lat:c.latitude,lng:c.longitude},first=!G.pos||G.posSrc!=="gps";
  G.acc=c.accuracy;G.speed=c.speed!=null&&c.speed>=0?c.speed:null;G.geoErr="";
  if(c.heading!=null&&!isNaN(c.heading)&&(G.speed||0)>1)G.heading=c.heading;else if(lastFix&&hav(lastFix,np)>6)G.heading=bearing(lastFix,np);
  if(!lastFix||hav(lastFix,np)>6)lastFix=np;
  G.pos=np;G.posSrc="gps";
  if(WALK.on)WALK.fix(np,c.accuracy,p.timestamp);
  if(G.nav)navUpdate(np);else{MAP.vehicle();if(first&&MAP.map&&!G.route)MAP.map.moveCamera({center:np,zoom:15.5});if(first){paintTrip();if(D.settings.theme==="sun")applyTheme()}}
  if(!G.nav)paintDrive();
}

/* ---------- search ---------- */
let SESS=null,sugT=0,SUG=[],sugI=-1;
function sugOpen(on){const s=$("#gsug");if(s)s.hidden=!on;$("#gq")&&$("#gq").setAttribute("aria-expanded",on?"true":"false")}
async function suggest(q){q=q.trim();const lq=q.toLowerCase();
  const local=D.saved.filter(s=>!q||(s.name+" "+(s.addr||"")).toLowerCase().includes(lq)).slice(0,q?4:6).map(s=>({t:"saved",s,main:s.name,sub:s.addr||kindLabel(s.kind),icon:kindIcon(s.kind),color:placeColor(s)}));
  const rec=D.recent.filter(s=>!q||(s.name+" "+(s.addr||"")).toLowerCase().includes(lq)).slice(0,q?3:5).map(s=>({t:"recent",s,main:s.name,sub:s.addr||"",icon:"clock"}));
  let remote=[];
  if(q.length>=2&&MAP.libs&&MAP.libs.places.AutocompleteSuggestion){try{const P=MAP.libs.places;SESS=SESS||new P.AutocompleteSessionToken();const req={input:q,sessionToken:SESS};if(G.pos){req.locationBias={center:G.pos,radius:50000};req.origin=G.pos}
    const res=await P.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);if($("#gq").value.trim()!==q)return;
    remote=(res.suggestions||[]).filter(x=>x.placePrediction).slice(0,6).map(x=>{const p=x.placePrediction;return {t:"place",p,main:(p.mainText&&p.mainText.text)||(p.text&&p.text.text)||"",sub:(p.secondaryText&&p.secondaryText.text)||"",dist:p.distanceMeters,icon:"pin"}})}catch(e){remote=[{t:"err",main:"Place search isn’t available",sub:placesErr(e),icon:"info"}]}}
  else if(q.length>=2&&!MAP.libs){const d=diagText(MAP.failed||MAPERR.code||"load");remote=[{t:"err",main:d[0],sub:MAP.loading?"The map is still loading…":"Search uses the same Google key as the map.",icon:"info"}]}
  SUG=local.concat(rec,remote);sugI=-1;const box=$("#gsug");if(!box)return;
  if(!SUG.length){box.innerHTML=q?'<div class="sgx">No matches yet</div>':'';sugOpen(!!q);return}
  box.innerHTML=(G.searchFor?'<div class="sgh">Choose '+esc({home:"Home",work:"Work",school:"School",fav:"a favorite",stop:"a stop",trip:"a trip destination",start:"a starting point"}[G.searchFor]||"a place")+'</div>':'')+
    SUG.map((x,i)=>'<button class="sgi" role="option" data-a="sug" data-i="'+i+'" id="sg'+i+'"'+(x.t==="err"?" disabled":"")+'><span class="sgic"'+(x.color?' style="color:'+x.color+'"':'')+'>'+ico(x.icon,20)+'</span><span class="sgt"><b>'+esc(x.main)+'</b><small>'+esc(x.sub)+'</small></span>'+(x.dist?'<span class="sgd">'+fmtDist(x.dist)+'</span>':'')+'</button>').join("")+
    (remote.length&&remote[0].t==="place"?'<div class="sgattr">powered by Google</div>':'');
  sugOpen(true);
}
async function pickSug(i){const x=SUG[i];if(!x)return;sugOpen(false);const q=$("#gq");
  let place=null;
  if(x.t==="saved"||x.t==="recent")place=Object.assign({},x.s);
  else if(x.t==="place"){try{const pl=x.p.toPlace();await pl.fetchFields({fields:["displayName","formattedAddress","location","primaryType","addressComponents"]});SESS=null;
    const city=((pl.addressComponents||[]).find(a=>(a.types||[]).includes("locality"))||{}).longText||"";
    place={name:pl.displayName||x.main,addr:pl.formattedAddress||x.sub,lat:pl.location.lat(),lng:pl.location.lng(),placeId:pl.id,type:pl.primaryType||"",city}}catch(e){toast("Couldn’t open that place. Try again.");return}}
  if(!place)return;q.value="";q.blur();
  const f=G.searchFor;G.searchFor=null;$(".gsearch").classList.remove("for");q.placeholder="Where we headed?";
  if(f==="home"||f==="work"||f==="school")return setKind(f,place);
  if(f==="fav")return addSaved(Object.assign(place,{kind:"favorite"}));
  if(f==="stop"){G.stops.push({lat:place.lat,lng:place.lng,name:place.name});toast("Stop added: "+place.name);return planRoute(!!G.nav)}
  if(f==="trip"){TRIPS.draftDest=place;renderPage();return}
  chooseDest(place);
}
function searchFor(kind,ph){G.searchFor=kind;const s=$(".gsearch");s.classList.add("for");const q=$("#gq");q.placeholder=ph||"Search for a place";q.value="";q.focus();suggest("")}
function voiceSearch(){const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return;const r=new R();r.lang="en-US";r.interimResults=false;r.maxAlternatives=1;
  const b=$(".gmic");b.classList.add("rec");r.onresult=e=>{const t=e.results[0][0].transcript;const q=$("#gq");q.value=t;suggest(t);q.focus()};r.onend=()=>b.classList.remove("rec");r.onerror=()=>{b.classList.remove("rec");toast("Didn’t catch that")};r.start()}

/* ---------- destinations & routes ---------- */
function chooseDest(place){G.dest=Object.assign({},place);if(G.nav)endNav(true);G.stops=[];
  D.recent=[Object.assign({},place,{at:Date.now()})].concat(D.recent.filter(r=>!(Math.abs(r.lat-place.lat)<1e-5&&Math.abs(r.lng-place.lng)<1e-5))).slice(0,20);save();
  if(G.page!==""&&G.page!=="navigate")go("navigate");planRoute()}
async function planRoute(keep){if(!G.dest)return;
  if(!G.pos||G.posSrc!=="gps"){const p=await locateOnce(8000);if(!p){if(MAP.map&&!G.pos){const c=MAP.map.getCenter();G.pos={lat:c.lat(),lng:c.lng()};G.posSrc="map"}
    else if(!G.pos){G.err="Turn on location (or open the map) to plan a route";paintTrip();return}}}
  G.busy=true;G.err="";paintTrip();
  const body={origin:G.pos,destination:G.dest.placeId?{placeId:G.dest.placeId}:{lat:G.dest.lat,lng:G.dest.lng},stops:G.stops.map(s=>({lat:s.lat,lng:s.lng})),mode:G.mode,
    avoid:{tolls:D.settings.avoidTolls,highways:D.settings.avoidHighways,ferries:D.settings.avoidFerries},alternatives:!keep};
  try{const j=await api("/route",{method:"POST",body});G.routes=j.routes.map(prepRoute);G.sel=0;G.route=G.routes[0];G.routeAt=Date.now();if(G.nav){G.nav.i=0;G.nav.s=0;G.nav.step=0;G.nav.off=0}}
  catch(e){G.err=e.message;if(!keep){G.routes=[];G.route=null}}
  G.busy=false;MAP.draw();paintAll();if(!keep)requestAnimationFrame(()=>MAP.fit());if(G.route)loadIntel();
}
function pickRoute(i){if(G.nav||!G.routes[i])return;G.sel=i;G.route=G.routes[i];MAP.draw();paintAll();loadIntel()}
async function loadIntel(){const r=G.route;if(!r)return;const end=(r.legs[r.legs.length-1]||{}).end||G.dest;const arr=arrival();
  G.intel.dest=null;paintTbar();
  try{G.intel.dest=await api("/intel?lat="+end.lat+"&lng="+end.lng+"&ts="+Math.floor(arr/1000))}catch(e){G.intel.dest={tz:{error:e.message},weather:{error:e.message}}}
  if(G.pos&&(!G.intel.origin||G.intel.originAt<Date.now()-3600000))try{G.intel.origin=await api("/tz?lat="+G.pos.lat+"&lng="+G.pos.lng);G.intel.originAt=Date.now()}catch(e){}
  paintTbar()}
function clearRoute(){if(G.nav)endNav(true);G.dest=null;G.routes=[];G.route=null;G.stops=[];G.err="";G.intel.dest=null;MAP.draw();paintAll()}

/* ---------- voice ---------- */
function speak(t){if(!D.settings.voice||!window.speechSynthesis)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.rate=1;u.lang="en-US";speechSynthesis.speak(u)}catch(e){}}
const spokenDist=m=>{if(D.settings.units==="metric")return m<950?Math.round(m/50)*50+" meters":(m/1000).toFixed(1)+" kilometers";const mi=m/MI;return mi<0.2?Math.round(m*3.28084/100)*100+" feet":mi<0.4?"a quarter mile":mi<0.7?"half a mile":mi.toFixed(1).replace(/\.0$/,"")+" miles"};

/* ---------- turn-by-turn ---------- */
let WAKE=null;
async function startNav(){if(!G.route)return;stopSim();
  if(G.posSrc!=="gps"){toast("Waiting for GPS…");const p=await locateOnce(12000);if(!p){toast("Groove Guide needs your location to navigate. Try Preview drive to see the trip.",5000);return}if(hav(p,G.route.path[0])>150)await planRoute(true)}
  beginNav(false)}
function beginNav(sim){G.nav={s:0,i:0,step:0,off:0,leftSec:G.route.durationSec,heading:G.route.path.length>1?bearing(G.route.path[0],G.route.path[1]):0,snapPos:G.route.path[0],spoken:{},startedAt:Date.now(),traveled:0,last:null,lastRe:0,sim};
  MAP.follow=true;if(G.page!=="navigate")go("navigate");MAP.recenter();
  if(!sim)try{navigator.wakeLock&&navigator.wakeLock.request("screen").then(w=>WAKE=w).catch(()=>{})}catch(e){}
  speak((G.mode==="WALK"?"Starting walk to ":"Starting route to ")+(G.dest?G.dest.name:"your destination")+". "+fmtDur(G.route.durationSec).replace("hr","hour").replace("min","minutes")+".");
  paintAll()}
function endNav(quiet){stopSim();G.nav=null;G.walkStats="";if(WAKE){try{WAKE.release()}catch(e){}WAKE=null}MAP.follow=true;if(!quiet)paintAll();if(MAP.map&&!quiet)requestAnimationFrame(()=>MAP.fit())}
function navUpdate(p){const n=G.nav,r=G.route;if(!n||!r)return;
  const sn=snap(r.path,r.cum,p,n.i);n.i=sn.i;n.s=sn.s;
  const a=r.path[sn.i],b=r.path[Math.min(sn.i+1,r.path.length-1)];n.snapPos=sn.d<40?{lat:a.lat+(b.lat-a.lat)*sn.t,lng:a.lng+(b.lng-a.lng)*sn.t}:p;
  if(a&&b&&hav(a,b)>2&&(n.sim||(G.speed||0)>2||G.heading==null))n.heading=bearing(a,b);else if(G.heading!=null)n.heading=G.heading;
  if(n.last){n.traveled+=hav(n.last,p)}n.last=p;
  /* off route → reroute (at most every 20 s) */
  if(!n.sim&&sn.d>Math.max(45,(G.acc||0)*1.5))n.off++;else n.off=0;
  if(n.off>=3&&Date.now()-n.lastRe>20000){n.lastRe=Date.now();n.off=0;toast("Rerouting…");speak("Rerouting");planRoute(true);return}
  while(n.step<r.steps.length-1&&r.steps[n.step].endD<n.s+3)n.step++;
  const frac=r.len?clamp(n.s/r.len,0,1):0;n.leftSec=r.durationSec*(1-frac);
  /* voice prompts */
  const ni=nextInfo();if(ni){const th=G.mode==="WALK"?[160,40]:[1609,400,150,35],key=n.step;n.spoken[key]=n.spoken[key]||{};
    for(const t of th){if(ni.dist<=t&&ni.dist>(t===th[th.length-1]?0:t*0.55)&&!n.spoken[key][t]){n.spoken[key][t]=1;const ins=shortInstr(ni.instr);speak(t===th[th.length-1]?ins:"In "+spokenDist(ni.dist)+", "+ins.charAt(0).toLowerCase()+ins.slice(1));break}}}
  if(G.mode==="WALK"){const el=(Date.now()-n.startedAt)/1000,mi=n.traveled/MI;G.walkStats=fmtDist(n.traveled)+" walked"+(mi>0.05?" · "+paceStr(el/mi)+"/mi":"")}
  if(r.len-n.s<25||hav(p,r.path[r.path.length-1])<20)return arrive();
  MAP.vehicle();MAP.followTick();paintNext();paintDrive();
  if(!n.tb||Date.now()-n.tb>1000){n.tb=Date.now();paintTbar()}
}
const paceStr=sPerMi=>{if(!isFinite(sPerMi)||sPerMi<=0)return "—";const m=Math.floor(sPerMi/60),s=Math.round(sPerMi%60);return m+":"+String(s).padStart(2,"0")};
function arrive(){const n=G.nav,r=G.route,d=G.dest;speak("You’ve arrived"+(d?" at "+d.name:"")+".");
  if(!n.sim&&D.settings.historyOn){D.history=[{id:uid(),to:{name:d.name,addr:d.addr,lat:d.lat,lng:d.lng},mode:G.mode,startedAt:n.startedAt,endedAt:Date.now(),distanceM:Math.round(n.traveled||r.len)}].concat(D.history).slice(0,200);save()}
  const sim=n.sim;endNav(true);paintAll();
  modal('<h3>'+(sim?"Preview finished":"You made it")+'</h3><p class="muted">'+esc(d?d.name:"")+(sim?"":" · "+fmtTime(Date.now()))+'</p><div class="row"><button class="gbtn" data-a="close">Done</button></div>')}

/* ---------- preview drive (simulation, clearly labeled) ---------- */
function startSim(){if(!G.route)return;stopSim();const r=G.route,v=G.mode==="WALK"?1.4:clamp(r.len/Math.max(1,r.durationSec),6,30),mult=G.mode==="WALK"?8:6;let s=0;
  G.sim={v,mult};beginNav(true);
  G.sim.t=setInterval(()=>{if(!G.nav){stopSim();return}s=Math.min(r.len,s+v*mult*0.5);let i=0;while(i<r.cum.length-2&&r.cum[i+1]<s)i++;const a=r.path[i],b=r.path[i+1]||a,seg=(r.cum[i+1]-r.cum[i])||1,t=clamp((s-r.cum[i])/seg,0,1);
    const p={lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};G.speed=v;G.pos=p;navUpdate(p)},500);paintTrip()}
function stopSim(){if(G.sim){clearInterval(G.sim.t);G.sim=null;G.speed=null;if(G.posSrc==="gps"&&lastFix)G.pos=lastFix}}

/* ---------- driving view: the real route ahead, drawn in perspective (not a camera feed) ---------- */
const DRIVE={cv:null,cx:null,w:0,h:0,dirty:true,raf:0,
  init(cv){this.cv=cv;this.cx=cv.getContext("2d");try{new ResizeObserver(()=>this.resize()).observe(cv.parentElement)}catch(e){}this.resize();const loop=()=>{this.raf=requestAnimationFrame(loop);if(this.dirty||G.nav)this.draw()};loop()},
  resize(){if(!this.cv)return;const r=this.cv.parentElement.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);this.w=Math.max(1,r.width);this.h=Math.max(1,r.height);this.cv.width=this.w*dpr;this.cv.height=this.h*dpr;this.cx.setTransform(dpr,0,0,dpr,0,0);this.dirty=true},
  draw(){const c=this.cx,W=this.w,H=this.h;if(!c||W<10||!this.cv.offsetParent){this.dirty=false;return}this.dirty=false;const light=THEME.cur==="light";
    const hor=H*0.36,f=W*0.95,camB=8.5,camH=3.1,cxp=W/2;
    const sky=c.createLinearGradient(0,0,0,hor);if(light){sky.addColorStop(0,"#e9e6f5");sky.addColorStop(1,"#f7f1ff")}else{sky.addColorStop(0,"#0b0b10");sky.addColorStop(.7,"#2a1a16");sky.addColorStop(1,"#5a3324")}
    c.fillStyle=sky;c.fillRect(0,0,W,hor+1);
    const gr=c.createLinearGradient(0,hor,0,H);if(light){gr.addColorStop(0,"#dcd9e6");gr.addColorStop(1,"#c9c5d6")}else{gr.addColorStop(0,"#16151a");gr.addColorStop(1,"#0a0a0c")}c.fillStyle=gr;c.fillRect(0,hor,W,H-hor);
    this.skyline(c,W,hor,light);
    const glow=c.createRadialGradient(cxp,hor,0,cxp,hor,W*.7);glow.addColorStop(0,light?"rgba(123,63,242,.18)":"rgba(255,159,104,.28)");glow.addColorStop(1,"rgba(0,0,0,0)");c.fillStyle=glow;c.fillRect(0,0,W,H);
    const proj=(x,z)=>{const cz=z+camB;if(cz<0.8)return null;return [cxp+x*f/cz,hor+camH*f/cz]};
    /* points ahead in local metres */
    let pts=[];const r=G.route;let base=null,hd=0,s0=0;
    if(r&&r.path){if(G.nav){base=G.nav.snapPos;hd=G.nav.heading||0;s0=G.nav.s}else{base=r.path[0];hd=r.path.length>1?bearing(r.path[0],r.path[Math.min(3,r.path.length-1)]):0}
      const k=Math.cos(base.lat*rad),sn=Math.sin(hd*rad),cs=Math.cos(hd*rad);pts.push([0,0]);let i=G.nav?G.nav.i+1:1;
      for(;i<r.path.length&&r.cum[i]-s0<900;i++){const q=r.path[i],dx=(q.lng-base.lng)*k*111320,dy=(q.lat-base.lat)*110540;pts.push([dx*cs-dy*sn,dx*sn+dy*cs])}}
    else pts=[[0,0],[0,900]];
    /* ground lines for a sense of motion */
    c.strokeStyle=light?"rgba(60,40,120,.07)":"rgba(255,255,255,.05)";c.lineWidth=1;const off=(G.nav?G.nav.s:0)%12;
    for(let z=12-off;z<300;z+=12){const a=proj(-60,z),b=proj(60,z);if(a&&b){c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke()}}
    /* road ribbon */
    const hw=6.5,L=[],Rr=[],C=[];for(let j=0;j<pts.length;j++){const p=pts[j],q=pts[Math.min(j+1,pts.length-1)],o=pts[Math.max(j-1,0)];let dx=q[0]-o[0],dz=q[1]-o[1];const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
      const a=proj(p[0]-dz*hw,p[1]+dx*hw),b=proj(p[0]+dz*hw,p[1]-dx*hw),m=proj(p[0],p[1]);if(a&&b&&m){L.push(a);Rr.push(b);C.push(m)}}
    if(L.length>1){c.beginPath();L.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));Rr.slice().reverse().forEach(p=>c.lineTo(p[0],p[1]));c.closePath();c.fillStyle=light?"#b9b5c7":"#26252b";c.fill();
      c.lineWidth=2;c.strokeStyle=light?"rgba(255,255,255,.9)":"rgba(255,255,255,.35)";[L,Rr].forEach(E=>{c.beginPath();E.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke()});
      if(r){const col=ROUTE_COLOR();c.save();c.shadowColor=col;c.shadowBlur=18;c.strokeStyle=col;c.lineCap="round";c.lineJoin="round";
        for(let j=1;j<C.length;j++){const cz=Math.max(1,(pts[j]||[0,0])[1]+camB);c.lineWidth=clamp(2.6*f/cz,1.5,40);c.beginPath();c.moveTo(C[j-1][0],C[j-1][1]);c.lineTo(C[j][0],C[j][1]);c.stroke()}c.restore()}}
    /* next maneuver marker */
    const ni=nextInfo();if(ni&&ni.dist<600&&r){const target=s0+ni.dist;let idx=r.cum.findIndex(x=>x>=target);if(idx>0){const base2=base,k=Math.cos(base2.lat*rad),sn=Math.sin(hd*rad),cs=Math.cos(hd*rad),q=r.path[idx],dx=(q.lng-base2.lng)*k*111320,dy=(q.lat-base2.lat)*110540,pr=proj(dx*cs-dy*sn,dx*sn+dy*cs);
      if(pr){const sz=clamp(30*f/((dx*sn+dy*cs)+camB),14,90);c.save();c.translate(pr[0],pr[1]-sz*.9);c.fillStyle=light?"#7B3FF2":"#FF9F68";c.shadowColor=c.fillStyle;c.shadowBlur=14;c.scale(sz/24,sz/24);c.translate(-12,-12);c.fill(new Path2D(MAN[manKey(ni.man)]));c.restore()}}}
    /* the vehicle, from behind */
    this.car(c,cxp,hor+camH*f/camB,W,light);
  },
  skyline(c,W,hor,light){if(!this.sky||this.sky.w!==Math.round(W)){let s=7;const rnd=()=>{s=(s*9301+49297)%233280;return s/233280};const b=[];let x=-10;while(x<W+10){const w=10+rnd()*26,h=12+rnd()*rnd()*hor*.55,tw=rnd()<.12;b.push([x,w,tw?h*1.5:h,tw]);x+=w+rnd()*4}this.sky={w:Math.round(W),b}}
    c.save();for(const [x,w,h,tw] of this.sky.b){c.fillStyle=light?"rgba(90,80,130,.28)":"rgba(14,12,18,.92)";c.fillRect(x,hor-h,w,h);if(tw){c.beginPath();c.moveTo(x,hor-h);c.lineTo(x+w/2,hor-h-14);c.lineTo(x+w,hor-h);c.fill()}
      if(!light){c.fillStyle="rgba(255,190,140,.55)";for(let yy=hor-h+5;yy<hor-4;yy+=6)for(let xx=x+3;xx<x+w-3;xx+=5)if(((xx*7+yy*13)|0)%5===0)c.fillRect(xx,yy,1.6,2)}}c.restore()},
  car(c,x,y,W,light){const col=D.vehicle.color||"#c9ccd3",wide=D.vehicle.type==="truck"||D.vehicle.type==="suv"||D.vehicle.type==="van",w=Math.min(W*0.36,170)*(wide?1.08:1),h=w*(wide?0.62:0.52);
    c.save();c.translate(x,y-h*0.15);
    c.fillStyle="rgba(0,0,0,.45)";c.beginPath();c.ellipse(0,h*0.08,w*0.62,h*0.16,0,0,7);c.fill();
    const body=new Path2D();body.moveTo(-w/2,0);body.lineTo(-w/2,-h*0.42);body.quadraticCurveTo(-w*0.46,-h*0.55,-w*0.36,-h*0.58);body.lineTo(-w*0.28,-h*0.95);body.quadraticCurveTo(0,-h*1.04,w*0.28,-h*0.95);body.lineTo(w*0.36,-h*0.58);body.quadraticCurveTo(w*0.46,-h*0.55,w/2,-h*0.42);body.lineTo(w/2,0);body.closePath();
    const g=c.createLinearGradient(-w/2,0,w/2,0);g.addColorStop(0,shade(col,-35));g.addColorStop(.5,shade(col,12));g.addColorStop(1,shade(col,-35));c.fillStyle=g;c.fill(body);
    c.fillStyle=light?"rgba(20,24,40,.82)":"rgba(10,14,22,.9)";c.beginPath();c.moveTo(-w*0.26,-h*0.9);c.quadraticCurveTo(0,-h*0.98,w*0.26,-h*0.9);c.lineTo(w*0.31,-h*0.62);c.lineTo(-w*0.31,-h*0.62);c.closePath();c.fill();
    const tl=(sx)=>{c.save();c.shadowColor="#ff7a45";c.shadowBlur=14;c.fillStyle="#ff8d5c";c.fillRect(sx,-h*0.46,w*0.2,h*0.07);c.restore()};tl(-w*0.47);tl(w*0.27);
    c.fillStyle="rgba(0,0,0,.55)";c.fillRect(-w*0.12,-h*0.3,w*0.24,h*0.1);c.fillStyle="#0c0c0e";c.fillRect(-w*0.5,-h*0.06,w*0.12,h*0.1);c.fillRect(w*0.38,-h*0.06,w*0.12,h*0.1);
    c.restore()}
};
function shade(hex,p){const n=parseInt(String(hex).replace("#","").padEnd(6,"0").slice(0,6),16);let r=n>>16,g=n>>8&255,b=n&255;const f=p/100;const m=v=>Math.round(clamp(f<0?v*(1+f):v+(255-v)*f,0,255));return "rgb("+m(r)+","+m(g)+","+m(b)+")"}

/* ---------- saved places ---------- */
const KIND_COLORS={home:"#e8c27a",work:"#68d4d0",school:"#8fb3ff",favorite:"#F4A987",restaurant:"#f2a65a",event:"#ff9f68",custom:"#b7a1e5"};
const KINDS=[["home","Home"],["work","Work"],["school","School"],["favorite","Favorite"],["restaurant","Restaurant"],["event","Event / venue"],["custom","Other"]];
const placeColor=s=>s.color||KIND_COLORS[s.kind]||"#b7a1e5";
const kindIcon=k=>({home:"home",work:"work",school:"school",favorite:"heart",restaurant:"food",event:"music"}[k]||"pin");
const kindLabel=k=>(KINDS.find(x=>x[0]===k)||[,"Saved"])[1];
const savedOf=k=>D.saved.find(s=>s.kind===k);
function setKind(k,place){D.saved=D.saved.filter(s=>s.kind!==k);D.saved.unshift(Object.assign({},place,{id:uid(),kind:k,label:kindLabel(k),color:(savedOf(k)||{}).color||KIND_COLORS[k]}));save();MAP.draw();paintChips();toast(kindLabel(k)+" saved: "+place.name);if(G.page==="saved")renderPage()}
function addSaved(place){if(D.saved.some(s=>Math.abs(s.lat-place.lat)<1e-5&&Math.abs(s.lng-place.lng)<1e-5)){toast("Already saved");return}
  D.saved.push(Object.assign({kind:"favorite"},place,{id:uid(),color:place.color||KIND_COLORS[place.kind||"favorite"]}));save();MAP.draw();toast("Saved "+place.name);if(G.page==="saved")renderPage()}
function quickList(kind){const L=kind==="fav"?D.saved.filter(s=>s.kind!=="home"&&s.kind!=="work"&&s.kind!=="school"):D.recent;
  modal('<h3>'+(kind==="fav"?"Favorites":"Recent")+'</h3>'+(L.length?'<div class="plist">'+L.slice(0,20).map((s,i)=>'<button class="pli" data-a="qpick" data-k="'+kind+'" data-i="'+i+'"><span class="pdot" style="--pc:'+(kind==="fav"?placeColor(s):"#8d877e")+'">'+ico(kind==="fav"?kindIcon(s.kind):"clock",18)+'</span><span><b>'+esc(s.name)+'</b><small>'+esc(s.addr||"")+'</small></span></button>').join("")+'</div>':'<p class="muted">'+(kind==="fav"?"No favorites yet. Save a place with the star after you search for it.":"Places you search for show up here.")+'</p>')+
    '<div class="row">'+(kind==="fav"?'<button class="gbtn ghost" data-a="addfav">'+ico("plus",16)+' Add a favorite</button>':D.recent.length?'<button class="gbtn ghost" data-a="clearrecent">Clear recent</button>':'')+'<button class="gbtn" data-a="close">Close</button></div>')}

function placesErr(e){const t=String(e&&e.message||e);if(/not been used|disabled|SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|ApiTargetBlocked|PERMISSION_DENIED/i.test(t))return "Places API (New) isn’t enabled or allowed for the browser key. In Google Cloud, enable Places API (New) and add it to the key’s API restrictions.";if(/REQUEST_DENIED|referer|referrer/i.test(t))return "The browser key’s website restrictions blocked place search for this address.";console.warn("[Groove Guide] places error",t);return "Couldn’t load places right now."}
/* ---------- pages ---------- */
function renderPage(){const p=$("#gpage");if(!p)return;const f={explore:pExplore,immersive:pImmersive,trips:pTrips,saved:pSaved,settings:pSettings}[G.page];p.innerHTML=f?f():"";if(G.page==="immersive")IMM.mount();if(G.page==="explore"&&EXP.cat&&!EXP.items&&!EXP.loading)exploreLoad(EXP.cat)}
const head=(k,t,s)=>'<div class="ph"><div class="kick">'+k+'</div><h1>'+t+'</h1>'+(s?'<p>'+s+'</p>':'')+'</div>'+(["Saved","Trips"].includes(k)&&!STORE.uid?'<div class="gsignin gl">'+ico("user",22)+'<span><b>Keep your progress</b><small>Sign in with a free Grooveville account to save places, trips and walks across all your devices.</small></span><button class="gbtn sm" data-a="signin">Sign in</button></div>':'');

/* Explore: real places near you (Places API), Grooveville events, and ecosystem shortcuts */
const EXP={cat:"",items:null,loading:false,err:""};
const CATS=[["vybr8","VYBR8 Eats","food",["restaurant"],"Restaurants near you. Restaurant details come from VYBR8 as it grows.","#F4A987"],["coffee","Coffee","coffee",["cafe","coffee_shop"],"","#e8c27a"],["night","Nightlife","music",["bar","night_club"],"","#b7a1e5"],
  ["live","Grooveville Live","music",null,"Public Grooveville events with a location.","#ff9f68"],["pathd","PATHD Work","work",null,"Your work and interview places.","#68d4d0"],["gas","Gas","gas",["gas_station"],"","#c9e27a"],["ev","EV charging","bolt",["electric_vehicle_charging_station"],"","#68d4d0"],["park","Parks","park",["park"],"","#9fd3c7"],["shop","Shopping","bag",["shopping_mall","clothing_store"],"","#f2c48f"]];
function pExplore(){
  return head("Explore","Find your next stop.","Real places around you, Grooveville events and your ecosystem shortcuts.")+
    '<div class="cats">'+CATS.map(([k,l,i,,,c])=>'<button class="cat gl'+(EXP.cat===k?" on":"")+'" data-a="cat" data-k="'+k+'" style="--pc:'+c+'">'+ico(i,24)+'<b>'+l+'</b></button>').join("")+
    '<div class="cat gl dim" style="--pc:#b7a1e5" title="Coming later">'+ico("crown",24)+'<b>Shadow Crown</b><small>Opt-in game spots, later</small></div></div>'+
    '<div id="exr" class="exr">'+exploreBody()+'</div>';
}
function exploreBody(){if(!EXP.cat)return '<div class="empty">Pick a category to see places near '+(G.pos?"you":"Charlotte")+'.</div>';const C=CATS.find(c=>c[0]===EXP.cat);
  if(EXP.loading)return '<div class="empty">Looking around…</div>';if(EXP.err)return '<div class="empty">'+esc(EXP.err)+'</div>';
  const L=EXP.items||[];return (C[4]?'<p class="muted" style="margin-bottom:12px">'+esc(C[4])+'</p>':'')+(L.length?'<div class="plist grid">'+L.map((x,i)=>'<div class="pcard gl">'+(x.photo?'<img src="'+esc(x.photo)+'" alt="" loading="lazy">':'<span class="pph" style="--pc:'+C[5]+'">'+ico(C[2],30)+'</span>')+'<div class="pcb"><b>'+esc(x.name)+'</b><small>'+esc([x.type,x.rating?"★ "+x.rating+(x.count?" ("+x.count+")":""):"",x.dist!=null?fmtDist(x.dist):""].filter(Boolean).join(" · "))+'</small><small class="muted">'+esc(x.addr||"")+'</small>'+(x.attr?'<small class="attr">Photo: '+esc(x.attr)+'</small>':'')+
    '<div class="row l"><button class="gbtn sm" data-a="exgo" data-i="'+i+'">'+ico("navigate",15)+' Go</button><button class="gbtn ghost sm" data-a="exsave" data-i="'+i+'">'+ico("star",15)+' Save</button></div></div></div>').join("")+'</div>'+(L.some(x=>x.google)?'<p class="attr">Places data © Google</p>':''):'<div class="empty">Nothing found nearby.</div>')}
async function exploreLoad(k){EXP.cat=k;EXP.items=null;EXP.err="";EXP.loading=true;const r=$("#exr");if(r)r.innerHTML=exploreBody();$$(".cat").forEach(b=>b.classList.toggle("on",b.dataset.k===k));
  const C=CATS.find(c=>c[0]===k),center=G.pos||CFG.defaultCenter;
  try{
    if(k==="live")EXP.items=await liveEvents();
    else if(k==="pathd"){EXP.items=D.saved.filter(s=>s.kind==="work").map(s=>Object.assign({},s,{type:"Work",dist:G.pos?hav(G.pos,s):null}));if(!EXP.items.length)EXP.err="Save your work address (Work button at the top) and interview spots here. PATHD job locations will appear as PATHD connects."}
    else{await MAP.load();const {Place,SearchNearbyRankPreference}=MAP.libs.places;
      const {places}=await Place.searchNearby({fields:["id","displayName","location","formattedAddress","rating","userRatingCount","primaryTypeDisplayName","photos"],locationRestriction:{center,radius:6000},includedPrimaryTypes:C[3],maxResultCount:12,rankPreference:SearchNearbyRankPreference?SearchNearbyRankPreference.POPULARITY:undefined});
      EXP.items=(places||[]).map(p=>{const ph=p.photos&&p.photos[0];return {google:true,name:p.displayName,lat:p.location.lat(),lng:p.location.lng(),placeId:p.id,addr:p.formattedAddress,rating:p.rating,count:p.userRatingCount,type:p.primaryTypeDisplayName||"",
        photo:ph&&ph.getURI?ph.getURI({maxWidth:480}):"",attr:ph&&ph.authorAttributions&&ph.authorAttributions[0]?ph.authorAttributions[0].displayName:"",dist:G.pos?hav(G.pos,{lat:p.location.lat(),lng:p.location.lng()}):null,kind:k==="vybr8"?"restaurant":"favorite"}})}
  }catch(e){EXP.err=MAP.failed||MAPERR.code?diagText(MAP.failed||MAPERR.code)[0]+". "+diagText(MAP.failed||MAPERR.code)[1]:placesErr(e)}
  EXP.loading=false;const r2=$("#exr");if(r2)r2.innerHTML=exploreBody()}
async function liveEvents(){if(!STORE.db)return [];const today=new Date().toISOString().slice(0,10);
  const snap=await STORE.db.collection("events").where("visibility","==","public").get();
  return snap.docs.map(d=>Object.assign({id:d.id},d.data())).filter(e=>e.location&&String(e.date||"")>=today).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,20)
    .map(e=>({name:e.title,addr:e.location,type:new Date(e.date+"T12:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})+(e.start?" · "+e.start:""),text:e.location,kind:"event"}))}
async function resolveText(x){if(x.lat)return x;await MAP.load();const {Place}=MAP.libs.places;const {places}=await Place.searchByText({textQuery:x.text||x.addr||x.name,fields:["id","displayName","location","formattedAddress"],maxResultCount:1,locationBias:G.pos||CFG.defaultCenter});
  const p=places&&places[0];if(!p)throw new Error("Couldn’t find that address");return Object.assign({},x,{lat:p.location.lat(),lng:p.location.lng(),placeId:p.id,addr:p.formattedAddress||x.addr})}

/* Immersive: photorealistic 3D when available, a tilted vector flyover otherwise */
const IMM={el:null,target:null,orbiting:false,kind:"",
  targets(){const t=[];if(G.dest)t.push(Object.assign({label:"Destination"},G.dest));D.saved.slice(0,8).forEach(s=>t.push(Object.assign({label:kindLabel(s.kind)},s)));t.push({label:"Grooveville home base",name:"Uptown Charlotte",lat:35.2271,lng:-80.8431});return t},
  async mount(){const box=$("#imm");if(!box)return;this.stop();box.innerHTML='<div class="empty">Loading 3D…</div>';const t=this.target||this.targets()[0];this.target=t;
    try{await MAP.load();let M3=null;try{M3=await google.maps.importLibrary("maps3d")}catch(e){}
      if(M3&&M3.Map3DElement){box.innerHTML="";const o={center:{lat:t.lat,lng:t.lng,altitude:0},range:1100,tilt:67,heading:20};if(M3.MapMode)o.mode=M3.MapMode.HYBRID;this.el=new M3.Map3DElement(o);this.el.style.width="100%";this.el.style.height="100%";box.appendChild(this.el);this.kind="3d"}
      else{box.innerHTML='<div id="immv" style="width:100%;height:100%"></div>';const dark=THEME.cur==="dark",o={center:t,zoom:17,tilt:67,heading:20,mapId:dark?CFG.mapIdDark:CFG.mapIdLight,disableDefaultUI:true,gestureHandling:"greedy"};if(google.maps.ColorScheme)o.colorScheme=dark?google.maps.ColorScheme.DARK:google.maps.ColorScheme.LIGHT;this.el=new MAP.libs.maps.Map($("#immv"),o);this.kind="vector"}
      const n=$("#immnote");if(n)n.textContent=this.kind==="3d"?"Photorealistic 3D from Google. Drag to look around.":"3D buildings view. Photorealistic 3D isn’t enabled for this key yet (Map Tiles API / maps3d).";
    }catch(e){const dg=MAPERR.code?diagText(MAPERR.code):["3D couldn’t load right now",""];box.innerHTML='<div class="empty"><b>'+esc(dg[0])+'</b><br>'+dg[1]+'</div>'}},
  fly(t){this.target=t;if(!this.el)return this.mount();if(this.kind==="3d"&&this.el.flyCameraTo)this.el.flyCameraTo({endCamera:{center:{lat:t.lat,lng:t.lng,altitude:0},range:1000,tilt:67,heading:30},durationMillis:REDUCED?0:3500});else if(this.el.moveCamera)this.el.moveCamera({center:t,zoom:17,tilt:67})},
  orbit(){if(!this.el)return;const t=this.target;this.orbiting=!this.orbiting;$("#orb")&&($("#orb").textContent=this.orbiting?"Stop orbit":"Orbit");
    if(!this.orbiting){this.stop(true);return}
    if(this.kind==="3d"&&this.el.flyCameraAround)this.el.flyCameraAround({camera:{center:{lat:t.lat,lng:t.lng,altitude:0},range:1000,tilt:67,heading:0},durationMillis:40000,repeatCount:3});
    else{let h=this.el.getHeading?this.el.getHeading()||0:0;this.t=setInterval(()=>{h=(h+0.6)%360;this.el.moveCamera({heading:h})},50)}},
  stop(keep){clearInterval(this.t);this.t=0;try{this.el&&this.el.stopCameraAnimation&&this.el.stopCameraAnimation()}catch(e){}if(!keep){this.orbiting=false;this.el=null}}};
function pImmersive(){const T=IMM.targets();
  return '<div class="immx"><div class="immstage gl" id="imm"></div><div class="immside gl">'+head("Immersive","See it before you go.","Fly around your destination and saved places in 3D. Navigation stays on the main screen.")+
    '<div class="plist">'+T.map((t,i)=>'<button class="pli" data-a="immto" data-i="'+i+'"><span class="pdot" style="--pc:'+(t.color||ROUTE_COLOR())+'">'+ico(t.kind?kindIcon(t.kind):"pin",18)+'</span><span><b>'+esc(t.name)+'</b><small>'+esc(t.label)+'</small></span></button>').join("")+'</div>'+
    '<div class="row l"><button class="gbtn" id="orb" data-a="orbit">Orbit</button><button class="gbtn ghost" data-a="immgo">'+ico("navigate",15)+' Go there</button></div><p class="muted small" id="immnote"></p></div></div>'}

/* Trips: arrive-by planning, saved trips, history, walks */
const TRIPS={tab:"plan",draftDest:null,plan:null,busy:false,err:""};
function pTrips(){const t=TRIPS.tab;
  return head("Trips","Plan it. Time it. Track it.","")+'<div class="tabs" role="tablist">'+[["plan","Plan a trip"],["saved","Saved trips"],["history","History"],["walks","Walks"]].map(([k,l])=>'<button role="tab" aria-selected="'+(t===k)+'" class="'+(t===k?"on":"")+'" data-a="ttab" data-v="'+k+'">'+l+'</button>').join("")+'</div>'+
    ({plan:tPlan,saved:tSaved,history:tHistory,walks:tWalks}[t])()}
function tPlan(){const d=TRIPS.draftDest,p=TRIPS.plan;const now=new Date(Date.now()+3*3600000);const dv=TRIPS.date||(now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0")),tv=TRIPS.time||String(now.getHours()).padStart(2,"0")+":00";
  return '<div class="gl card"><div class="frm"><label class="f">Destination<button class="gbtn ghost wide" data-a="tripdest">'+ico("pin",16)+' '+(d?esc(d.name):"Choose a place")+'</button></label>'+
    '<div class="two"><label class="f">Arrive by (date)<input type="date" id="tdate" value="'+dv+'"></label><label class="f">Time, in the destination’s local time<input type="time" id="ttime" value="'+tv+'"></label></div>'+
    '<label class="f">Travel<select id="tmode"><option value="DRIVE">Drive</option><option value="WALK"'+(TRIPS.mode==="WALK"?" selected":"")+'>Walk</option></select></label>'+
    '<div class="row l"><button class="gbtn" data-a="tplan"'+(d&&!TRIPS.busy?"":" disabled")+'>'+(TRIPS.busy?"Planning…":"Plan departure")+'</button></div>'+(TRIPS.err?'<p class="warn">'+esc(TRIPS.err)+'</p>':'')+'</div></div>'+
    (p?planCard(p,true):'')+'<p class="muted small">Departure times are estimates from Google’s traffic predictions plus a safety buffer. Recheck before you leave.</p>'}
function planCard(p,fresh){const otz=p.originTz,dtz=p.destTz;
  return '<div class="gl card plan"><div class="pk"><small>Leave by</small><b>'+fmtTime(p.leave,otz)+'</b><span>'+esc(fmtDay(p.leave,otz))+(otz?' · '+esc(tzAbbr(p.leave,otz)):'')+'</span></div>'+
    '<div class="pk"><small>Arrive</small><b>'+fmtTime(p.arrive,dtz)+'</b><span>'+esc(fmtDay(p.arrive,dtz))+(dtz?' · '+esc(tzAbbr(p.arrive,dtz)):'')+'</span></div>'+
    '<div class="pk"><small>Travel time</small><b>'+fmtDur(p.durSec)+'</b><span>+ '+fmtDur(p.bufferSec)+' buffer · '+fmtDist(p.distM)+'</span></div>'+
    '<div class="pk"><small>Time difference</small><b>'+(p.diffH===0?"Same zone":(p.diffH>0?"+":"")+p.diffH+" hr")+'</b><span>'+esc(dtz||"")+'</span></div>'+
    '<div class="pk"><small>Weather on arrival</small><b>'+(p.wx&&p.wx.temp!=null?p.wx.temp+"°":"—")+'</b><span>'+esc(p.wx?p.wx.text||"":p.wxNote||"Forecast covers the next 48 hours")+'</span></div>'+
    (p.late?'<p class="warn wide">Leaving now still arrives about '+fmtDur(p.late)+' late.</p>':'')+
    '<div class="row l wide">'+(fresh?'<button class="gbtn" data-a="tsave">'+ico("star",15)+' Save trip</button>':'')+'<button class="gbtn ghost" data-a="tgo"'+(p.id?' data-id="'+p.id+'"':'')+'>'+ico("navigate",15)+' Navigate now</button></div></div>'}
async function planArrive(dest,date,time,mode){
  const wall=Date.parse(date+"T"+time+":00Z");if(!wall)throw new Error("Pick a date and time");
  let tz=(await api("/tz?lat="+dest.lat+"&lng="+dest.lng+"&ts="+Math.floor(wall/1000))).tz;if(!tz||tz.error)throw new Error("Couldn’t get the destination’s time zone");
  let arr=wall-tz.offsetSec*1000;const tz2=(await api("/tz?lat="+dest.lat+"&lng="+dest.lng+"&ts="+Math.floor(arr/1000))).tz;if(tz2&&!tz2.error&&tz2.offsetSec!==tz.offsetSec){tz=tz2;arr=wall-tz.offsetSec*1000}
  if(arr<Date.now()+5*60000)throw new Error("Pick an arrival time in the future");
  const origin=G.pos&&G.posSrc==="gps"?G.pos:await locateOnce(9000);if(!origin)throw new Error("Turn on location to plan from where you are");
  const body={origin,destination:dest.placeId?{placeId:dest.placeId}:{lat:dest.lat,lng:dest.lng},mode,alternatives:false,avoid:{tolls:D.settings.avoidTolls,highways:D.settings.avoidHighways,ferries:D.settings.avoidFerries}};
  let r=(await api("/route",{method:"POST",body})).routes[0],dur=r.durationSec;const buf=s=>Math.max(600,Math.round(s*0.1));
  let leave=arr-(dur+buf(dur))*1000;
  if(mode==="DRIVE"&&leave>Date.now()+120000){try{const r2=(await api("/route",{method:"POST",body:Object.assign({},body,{departAt:new Date(leave).toISOString()})})).routes[0];if(r2){r=r2;dur=r2.durationSec;leave=arr-(dur+buf(dur))*1000}}catch(e){}}
  let late=0;if(leave<Date.now()){late=Math.round((Date.now()+dur*1000-arr)/1000);leave=Date.now()}
  const oz=(await api("/tz?lat="+origin.lat+"&lng="+origin.lng+"&ts="+Math.floor(leave/1000)).catch(()=>({}))).tz||{};
  let wx=null,wxNote="";if(arr-Date.now()<47*3600000){try{const i=await api("/intel?lat="+dest.lat+"&lng="+dest.lng+"&ts="+Math.floor(arr/1000));wx=i.weather&&!i.weather.error?weatherAt(i.weather,arr):null}catch(e){}}else wxNote="Forecast opens 48 hours before";
  return {dest,date,time,mode,leave,arrive:arr,durSec:dur,bufferSec:buf(dur),distM:r.distanceM,destTz:tz.id,originTz:oz.id||Intl.DateTimeFormat().resolvedOptions().timeZone,diffH:oz.offsetSec!=null?Math.round((tz.offsetSec-oz.offsetSec)/3600):0,wx,wxNote,late:late>60?late:0,at:Date.now()}}
function tSaved(){const L=D.trips;return L.length?L.map(p=>'<div class="gl card"><div class="ch"><b>'+esc(p.dest.name)+'</b><small>Arrive '+esc(p.date+" "+p.time)+' local · planned '+esc(new Date(p.at).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}))+'</small><span class="row r"><button class="gbtn ghost sm" data-a="trefresh" data-id="'+p.id+'">Update plan</button><button class="gbtn ghost sm icon" data-a="tdel" data-id="'+p.id+'" aria-label="Delete trip">'+ico("trash",16)+'</button></span></div>'+planCard(p,false)+'</div>').join(""):'<div class="empty">No saved trips yet. Plan one in “Plan a trip”.</div>'}
function tHistory(){if(!D.settings.historyOn)return '<div class="empty">Trip history is off. Turn it on in Settings › Privacy.</div>';const L=D.history;
  return L.length?'<div class="plist">'+L.map(h=>'<div class="pli static"><span class="pdot" style="--pc:'+(h.mode==="WALK"?"#9fd3c7":ROUTE_COLOR())+'">'+ico(h.mode==="WALK"?"walk":"car",18)+'</span><span><b>'+esc(h.to.name)+'</b><small>'+esc(new Date(h.endedAt).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}))+' · '+fmtDist(h.distanceM)+' · '+fmtDur((h.endedAt-h.startedAt)/1000)+'</small></span><button class="gbtn ghost sm" data-a="hgo" data-id="'+h.id+'">Go again</button></div>').join("")+'</div><div class="row l"><button class="gbtn ghost sm" data-a="hclear">Clear history</button></div>':'<div class="empty">Finished trips show up here.</div>'}

/* Walking tracker: distance, pace, time. Saved only with consent. */
const WALK={on:false,paused:false,dist:0,last:null,start:0,pausedMs:0,pauseAt:0,pts:0,
  begin(){if(!D.settings.walkConsent){modal('<h3>Track your walks?</h3><p class="muted">Groove Guide uses your location while a walk is running to measure distance and pace. Walks are saved on this device'+(STORE.uid?" and in your Grooveville account":"")+'. You can delete them any time. Nothing is tracked when no walk is running.</p><div class="row"><button class="gbtn ghost" data-a="close">Not now</button><button class="gbtn" data-a="walkok">Allow and start</button></div>');return}
    Object.assign(this,{on:true,paused:false,dist:0,last:null,start:Date.now(),pausedMs:0,pauseAt:0,pts:0});startGeo();this.tick=setInterval(()=>this.paint(),1000);renderPage()},
  fix(p,acc,ts){if(!this.on||this.paused)return;if(acc>35)return;if(this.last){const d=hav(this.last,p);if(d<3)return;if(d/Math.max(1,(ts-this.lastT)/1000)>7)return;this.dist+=d}this.last=p;this.lastT=ts;this.pts++;this.paint()},
  elapsed(){return ((this.pauseAt||Date.now())-this.start-this.pausedMs)/1000},
  pause(){if(this.paused){this.pausedMs+=Date.now()-this.pauseAt;this.pauseAt=0;this.paused=false;this.last=null}else{this.paused=true;this.pauseAt=Date.now()}renderPage()},
  stop(keep){clearInterval(this.tick);if(keep&&this.dist>10){D.walks.unshift({id:uid(),start:this.start,end:Date.now(),dist:Math.round(this.dist),elapsed:Math.round(this.elapsed())});D.walks=D.walks.slice(0,500);save();toast("Walk saved")}else if(keep)toast("Too short to save");this.on=false;renderPage()},
  paint(){const e=$("#walklive");if(!e)return;const el=this.elapsed(),mi=this.dist/MI;e.innerHTML=walkStats(this.dist,el,G.speed)}};
function walkStats(dist,el,sp){const mi=dist/MI;return '<div class="pk"><small>Distance</small><b>'+fmtDist(dist)+'</b></div><div class="pk"><small>Time</small><b>'+fmtClock(el)+'</b></div><div class="pk"><small>Avg pace</small><b>'+(mi>0.03?paceStr(el/mi)+'<span class="u">/'+(D.settings.units==="metric"?"km":"mi")+'</span>':"—")+'</b></div>'+(sp!==undefined?'<div class="pk"><small>Now</small><b>'+(speedFmt(sp)!=null?speedFmt(sp)+'<span class="u"> '+speedUnit()+'</span>':"—")+'</b></div>':'')}
const fmtClock=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+":"+String(m).padStart(2,"0"):m)+":"+String(x).padStart(2,"0")};
function tWalks(){const now=Date.now(),day=new Date();day.setHours(0,0,0,0);const wk=new Date(day);wk.setDate(day.getDate()-((day.getDay()+6)%7));const mo=new Date(day.getFullYear(),day.getMonth(),1);
  const sum=t=>D.walks.filter(w=>w.start>=t).reduce((a,w)=>a+w.dist,0);
  return '<div class="gl card"><div class="ch"><b>'+(WALK.on?(WALK.paused?"Walk paused":"Walking"):"Track a walk")+'</b><span class="row r">'+(WALK.on?'<button class="gbtn ghost sm" data-a="wpause">'+(WALK.paused?"Resume":"Pause")+'</button><button class="gbtn sm" data-a="wsave">Save</button><button class="gbtn ghost sm" data-a="wdiscard">Discard</button>':'<button class="gbtn sm" data-a="wstart">'+ico("walk",15)+' Start walk</button>')+'</span></div>'+
    (WALK.on?'<div class="stats" id="walklive">'+walkStats(WALK.dist,WALK.elapsed(),G.speed)+'</div><p class="muted small">Keep this page open; phone browsers pause location when the screen locks.</p>':'')+'</div>'+
    '<div class="stats gl card"><div class="pk"><small>Today</small><b>'+fmtDist(sum(+day))+'</b></div><div class="pk"><small>This week</small><b>'+fmtDist(sum(+wk))+'</b></div><div class="pk"><small>This month</small><b>'+fmtDist(sum(+mo))+'</b></div></div>'+
    (D.walks.length?'<div class="plist">'+D.walks.slice(0,60).map(w=>'<div class="pli static"><span class="pdot" style="--pc:#9fd3c7">'+ico("walk",18)+'</span><span><b>'+fmtDist(w.dist)+' · '+fmtClock(w.elapsed)+'</b><small>'+esc(new Date(w.start).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}))+' · '+paceStr(w.elapsed/(w.dist/MI))+'/mi</small></span><button class="gbtn ghost sm icon" data-a="wdel" data-id="'+w.id+'" aria-label="Delete walk">'+ico("trash",16)+'</button></div>').join("")+'</div>':'<div class="empty">Saved walks show up here.</div>')}

/* Saved */
function pSaved(){const groups=KINDS.map(([k,l])=>[k,l,D.saved.filter(s=>s.kind===k)]).filter(g=>g[2].length||["home","work","school"].includes(g[0]));
  return head("Saved","Your places, your colors.","Home is gold, work and school take the colors you pick. Markers stay readable in light and dark.")+
    '<div class="row l" style="margin-bottom:16px"><button class="gbtn" data-a="addfav">'+ico("plus",16)+' Save a place</button></div>'+
    groups.map(([k,l,L])=>'<h3 class="gh3">'+l+'</h3>'+(L.length?'<div class="plist">'+L.map(s=>'<div class="pli static"><span class="pdot" style="--pc:'+placeColor(s)+(s.color2?';box-shadow:0 0 0 3px '+s.color2:'')+'">'+ico(kindIcon(s.kind),18)+'</span><span><b>'+esc(s.name)+'</b><small>'+esc(s.addr||"")+'</small></span><span class="row r"><button class="gbtn sm" data-a="sgo" data-id="'+s.id+'">'+ico("navigate",15)+' Go</button><button class="gbtn ghost sm icon" data-a="sedit" data-id="'+s.id+'" aria-label="Edit">'+ico("edit",16)+'</button></span></div>').join("")+'</div>':'<button class="gbtn ghost" data-a="chip" data-k="'+k+'">Set '+l.toLowerCase()+'</button>')).join("")}
function editSaved(id){const s=D.saved.find(x=>x.id===id);if(!s)return;
  modal('<h3>Edit place</h3><div class="frm"><label class="f">Name<input id="en" value="'+esc(s.name)+'" maxlength="60"></label><label class="f">Type<select id="ek">'+KINDS.map(([k,l])=>'<option value="'+k+'"'+(s.kind===k?" selected":"")+'>'+l+'</option>').join("")+'</select></label>'+
    '<div class="two"><label class="f">Marker color<input type="color" id="ec" value="'+esc(placeColor(s))+'"></label><label class="f">Second color (e.g. school colors)<input type="color" id="ec2" value="'+esc(s.color2||"#ffffff")+'"></label></div>'+
    '<label class="ck"><input type="checkbox" id="ec2on"'+(s.color2?" checked":"")+'> Use a second color</label><p class="muted small">School colors are the ones you enter here; Groove Guide doesn’t look them up.</p></div>'+
    '<div class="row"><button class="gbtn ghost" data-a="sdel" data-id="'+id+'">Delete</button><button class="gbtn ghost" data-a="close">Cancel</button><button class="gbtn" data-a="ssave" data-id="'+id+'">Save</button></div>')}

/* Settings */
const VTYPES=[["sedan","Sedan"],["suv","SUV"],["truck","Truck"],["coupe","Coupe"],["van","Van"],["ev","EV"],["motorcycle","Motorcycle"]];
const SWATCH=["#c9ccd3","#111215","#f4f4f2","#8a8f99","#1e3a8a","#7b1f2e","#F4A987","#7B3FF2","#2f6b4f","#d4a017"];
function pSettings(){const s=D.settings,v=D.vehicle,tg=(id,on,l,d)=>'<label class="sw"><input type="checkbox" data-set="'+id+'"'+(on?" checked":"")+'><span><b>'+l+'</b>'+(d?'<small>'+d+'</small>':'')+'</span></label>';
  return head("Settings","Make it yours.","")+
  '<div class="sgrid"><div class="gl card"><h3>Appearance</h3><div class="seg big" role="group">'+[["light","Light"],["dark","Dark"],["auto","Auto"],["sun","Sunrise/Sunset"]].map(([k,l])=>'<button data-a="settheme" data-v="'+k+'" class="'+(s.theme===k?"on":"")+'">'+l+'</button>').join("")+'</div><p class="muted small">Auto follows your device. Sunrise/Sunset switches by the sun where you are.</p>'+
  '<h3>Navigation screen</h3><div class="seg big">'+[["70","70/30"],["80","80/20"],["map","Map only"]].map(([k,l])=>'<button data-a="setlayout" data-v="'+k+'" class="'+(s.layout===k?"on":"")+'">'+l+'</button>').join("")+'</div>'+
  '<div class="seg big" style="margin-top:10px">'+[["aerial","Aerial 3D"],["flat","Flat 2D"]].map(([k,l])=>'<button data-a="setview" data-v="'+k+'" class="'+(s.view===k?"on":"")+'">'+l+'</button>').join("")+'</div>'+
  '<div class="seg big" style="margin-top:10px">'+[["imperial","Miles"],["metric","Kilometers"]].map(([k,l])=>'<button data-a="setunits" data-v="'+k+'" class="'+(s.units===k?"on":"")+'">'+l+'</button>').join("")+'</div></div>'+
  '<div class="gl card"><h3>Guidance & routes</h3>'+tg("voice",s.voice,"Voice guidance","Spoken turns while navigating")+'<button class="gbtn ghost sm" data-a="testvoice">Test voice</button>'+tg("avoidTolls",s.avoidTolls,"Avoid tolls")+tg("avoidHighways",s.avoidHighways,"Avoid highways")+tg("avoidFerries",s.avoidFerries,"Avoid ferries")+'</div>'+
  '<div class="gl card"><h3>Your vehicle</h3><div class="vprev">'+vehTopSvg(v.color,v.type)+vehArrowSvg(v.color)+'</div><div class="frm"><label class="f">Nickname<input data-veh="nick" value="'+esc(v.nick)+'" maxlength="30"></label>'+
  '<label class="f">Type<select data-veh="type">'+VTYPES.map(([k,l])=>'<option value="'+k+'"'+(v.type===k?" selected":"")+'>'+l+'</option>').join("")+'</select></label>'+
  '<div class="three"><label class="f">Make<input data-veh="make" value="'+esc(v.make)+'" maxlength="30" placeholder="Toyota"></label><label class="f">Model<input data-veh="model" value="'+esc(v.model)+'" maxlength="30" placeholder="Camry"></label><label class="f">Year<input data-veh="year" value="'+esc(v.year)+'" inputmode="numeric" maxlength="4" placeholder="2024"></label></div>'+
  '<label class="f">Color</label><div class="sws">'+SWATCH.map(c=>'<button class="swc'+(v.color.toLowerCase()===c.toLowerCase()?" on":"")+'" data-a="vcolor" data-v="'+c+'" style="background:'+c+'" aria-label="Color '+c+'"></button>').join("")+'<input type="color" data-veh="color" value="'+esc(v.color)+'" aria-label="Custom color"></div>'+
  '<p class="muted small">Flat map shows an arrow in your color, aerial view shows your car. Detailed make-and-model 3D cars come later.</p></div></div>'+
  '<div class="gl card"><h3>Privacy & data</h3>'+tg("historyOn",s.historyOn,"Save trip history","Finished trips are kept so you can go again")+tg("walkConsent",s.walkConsent,"Walk tracking","Measure distance and pace while a walk is running")+
  '<p class="muted small">'+(!STORE.uid?'<button class="gbtn sm" data-a="signin" style="margin-bottom:8px">Sign in or create an account</button><br>':'')+(STORE.uid?(STORE.cloud==="blocked"?"Signed in, but account sync is blocked. Publish the latest firestore.rules. Your data is safe on this device.":"Signed in: your places, vehicle and trips sync to your Grooveville account."):"Not signed in: everything stays on this device. Sign in with your Grooveville account to sync.")+'</p>'+
  '<div class="row l"><button class="gbtn ghost sm" data-a="export">Download my data</button><button class="gbtn ghost sm" data-a="wipe">Delete my Groove Guide data</button></div></div>'+
  '<div class="gl card"><h3>About</h3><p class="muted small">Groove Guide by Grooveville. Maps, places, routes, weather and time zones by Google. Speed limits and lane-by-lane guidance need a verified lane data provider and aren’t shown until one is connected. Phone browsers can pause navigation when the screen locks.</p></div></div>'}

/* ---------- detail sheets ---------- */
function weatherModal(){const di=G.intel.dest,w=di&&di.weather;if(!w||w.error){toast("Weather isn’t available for this place right now");return}const tz=di.tz&&!di.tz.error?di.tz.id:undefined,arr=arrival(),at=weatherAt(w,arr),n=w.now||{},sun=(w.sun||[])[0]||{};
  const ic=x=>x&&x.icon?'<img src="'+esc(x.icon+(THEME.cur==="dark"?"_dark":"")+".svg")+'" alt="" width="30" height="30">':ico("cloud",22);
  modal('<h3>Weather at '+esc(G.dest.name)+'</h3><div class="stats"><div class="pk"><small>Now</small><b>'+(n.temp!=null?n.temp+"°":"—")+'</b><span>'+esc(n.text||"")+'</span></div><div class="pk"><small>When you arrive · '+fmtTime(arr,tz)+'</small><b>'+(at&&at.temp!=null?at.temp+"°":"—")+'</b><span>'+esc(at?at.text:"")+'</span></div>'+
    '<div class="pk"><small>Rain chance</small><b>'+(at&&at.rain!=null?at.rain+"%":"—")+'</b></div><div class="pk"><small>Wind</small><b>'+(at&&at.wind!=null?Math.round(at.wind)+" mph":"—")+'</b><span>'+esc(at?at.windDir.replace(/_/g," ").toLowerCase():"")+'</span></div>'+
    '<div class="pk"><small>Sunrise</small><b>'+(sun.rise?fmtTime(sun.rise,tz):"—")+'</b></div><div class="pk"><small>Sunset</small><b>'+(sun.set?fmtTime(sun.set,tz):"—")+'</b></div></div>'+
    '<div class="hours">'+(w.hours||[]).slice(0,16).map(h=>'<div><small>'+fmtTime(h.t,tz).replace(":00","")+'</small>'+ic(h)+'<b>'+(h.temp!=null?h.temp+"°":"")+'</b><small>'+(h.rain!=null?h.rain+"%":"")+'</small></div>').join("")+'</div>'+
    '<p class="attr">Weather data: Google · times shown in '+(tz?esc(tzAbbr(Date.now(),tz)):"local time")+'</p><div class="row"><button class="gbtn" data-a="close">Close</button></div>')}
function optionsModal(){const s=D.settings,t=(k,l)=>'<label class="sw"><input type="checkbox" data-opt="'+k+'"'+(s[k]?" checked":"")+'><span><b>'+l+'</b></span></label>';
  modal('<h3>Route options</h3><div class="seg big" role="group"><button data-a="optmode" data-v="DRIVE" class="'+(G.mode==="DRIVE"?"on":"")+'">'+ico("car",16)+' Drive</button><button data-a="optmode" data-v="WALK" class="'+(G.mode==="WALK"?"on":"")+'">'+ico("walk",16)+' Walk</button></div>'+
    '<div style="margin-top:12px">'+t("avoidTolls","Avoid tolls")+t("avoidHighways","Avoid highways")+t("avoidFerries","Avoid ferries")+'</div>'+
    (G.stops.length?'<h4>Stops</h4><div class="plist">'+G.stops.map((x,i)=>'<div class="pli static"><span class="pdot" style="--pc:#b7a1e5">'+(i+1)+'</span><span><b>'+esc(x.name||"Stop")+'</b></span><button class="gbtn ghost sm icon" data-a="rmstop" data-i="'+i+'" aria-label="Remove stop">'+ico("x",15)+'</button></div>').join("")+'</div>':'')+
    '<div class="row"><button class="gbtn ghost" data-a="close">Cancel</button><button class="gbtn" data-a="optapply">Apply</button></div>')}
async function shareEta(){const r=G.route;if(!r)return;const di=G.intel.dest,tz=di&&di.tz&&!di.tz.error?di.tz.id:undefined,arr=arrival();
  const text="On my way to "+G.dest.name+". ETA "+fmtTime(arr,tz)+(tz?" "+tzAbbr(arr,tz):"")+" ("+fmtDur(G.nav?G.nav.leftSec:r.durationSec)+" away). Sent from Groove Guide by Grooveville.";
  try{if(navigator.share){await navigator.share({title:"My ETA",text});return}await navigator.clipboard.writeText(text);toast("ETA copied. Paste it into a message.")}catch(e){if(e&&e.name!=="AbortError")toast("Couldn’t share right now")}}
function moreSheet(){modal('<h3>More</h3><div class="plist"><a class="pli" href="'+href("immersive")+'" data-go="immersive">'+ico("immersive",20)+'<span><b>Immersive</b><small>3D flyovers</small></span></a><a class="pli" href="'+href("settings")+'" data-go="settings">'+ico("settings",20)+'<span><b>Settings</b><small>Appearance, vehicle, privacy</small></span></a>'+
  '<button class="pli" data-a="theme" data-v="'+(THEME.cur==="dark"?"light":"dark")+'">'+ico(THEME.cur==="dark"?"sun":"moon",20)+'<span><b>'+(THEME.cur==="dark"?"Light mode":"Dark mode")+'</b></span></button><a class="pli" href="'+esc(CFG.homeUrl)+'">'+ico("back",20)+'<span><b>Back to Grooveville</b></span></a></div><div class="row"><button class="gbtn" data-a="close">Close</button></div>')}

/* ---------- actions ---------- */
document.addEventListener("click",e=>{
  const g=e.target.closest("[data-go]");if(g&&!e.metaKey&&!e.ctrlKey&&g.closest("#gg")){e.preventDefault();closeModal();sugOpen(false);go(g.dataset.go);return}
  const t=e.target.closest("[data-a]");if(!t){if(!e.target.closest(".gsearch"))sugOpen(false);return}
  const a=t.dataset.a,i=Number(t.dataset.i);
  if(a==="scrim"){if(e.target===t)closeModal();return}
  if(a==="signin")return authModal("in");
  if(a==="g-mode")return authModal(t.dataset.v);
  if(a==="g-google")return googleSignIn();
  if(a==="signout"){try{firebase.auth().signOut()}catch(x){}closeModal();return}
  if(a==="close")return closeModal();
  if(a==="theme"){D.settings.theme=t.dataset.v;save();applyTheme();closeModal();if(G.page==="settings")renderPage();return}
  if(a==="chip"){const k=t.dataset.k;if(k==="fav"||k==="recent")return quickList(k);const s=savedOf(k);if(s){if(G.page!==""&&G.page!=="navigate")go("navigate");return chooseDest(s)}if(G.page!==""&&G.page!=="navigate")go("navigate");return searchFor(k,"Search for your "+k+" address")}
  if(a==="qpick"){const L=t.dataset.k==="fav"?D.saved.filter(s=>s.kind!=="home"&&s.kind!=="work"&&s.kind!=="school"):D.recent;closeModal();return chooseDest(L[i])}
  if(a==="addfav"){closeModal();if(G.page==="saved"||G.page==="")go("navigate");return searchFor("fav","Search for a place to save")}
  if(a==="clearrecent"){D.recent=[];save();closeModal();return}
  if(a==="sug")return pickSug(i);
  if(a==="voice")return voiceSearch();
  if(a==="locate"){G.geoErr="";startGeo();toast("Finding you…");return}
  if(a==="retry-map"){location.reload();return}
  if(a==="focus-search"){const q=$("#gq");if(q){q.focus();suggest(q.value)}return}
  if(a==="feat-weather"){if(G.route)return weatherModal();toast("Pick a destination to see its weather and local time");const q=$("#gq");if(q)q.focus();return}
  if(a==="view")return MAP.setView(t.dataset.v);
  if(a==="zoom")return MAP.zoom(Number(t.dataset.d));
  if(a==="north")return MAP.north();
  if(a==="fit")return G.route?MAP.fit():MAP.recenter();
  if(a==="recenter")return MAP.recenter();
  if(a==="layout")return setLayout(t.dataset.v);
  if(a==="mode"){if(G.mode===t.dataset.v)return;G.mode=t.dataset.v;paintMapTools();if(G.dest&&!G.nav)planRoute();else paintAll();return}
  if(a==="alt")return pickRoute(i);
  if(a==="clear")return clearRoute();
  if(a==="start")return startNav();
  if(a==="end"){endNav();toast("Navigation ended");return}
  if(a==="sim")return startSim();
  if(a==="savedest"){if(G.dest)addSaved(Object.assign({},G.dest));return}
  if(a==="voice-toggle"){D.settings.voice=!D.settings.voice;save();if(!D.settings.voice&&window.speechSynthesis)speechSynthesis.cancel();paintNext();return}
  if(a==="weather")return weatherModal();
  if(a==="addstop"){if(G.stops.length>=5){toast("Up to 5 stops");return}return searchFor("stop","Search for a stop to add")}
  if(a==="share")return shareEta();
  if(a==="options")return optionsModal();
  if(a==="optmode"){G.mode=t.dataset.v;$$('[data-a="optmode"]').forEach(b=>b.classList.toggle("on",b===t));return}
  if(a==="rmstop"){G.stops.splice(i,1);optionsModal();return}
  if(a==="optapply"){$$("[data-opt]").forEach(c=>D.settings[c.dataset.opt]=c.checked);save();closeModal();paintMapTools();if(G.dest)planRoute(!!G.nav);return}
  if(a==="drivetoggle"){$("#dash").classList.toggle("drive-open");DRIVE.resize();return}
  if(a==="sheet"){$("#dash").classList.toggle("sheet-open");requestAnimationFrame(sizeBottom);return}
  if(a==="more")return moreSheet();
  if(a==="acct")return modal('<h3>Your account</h3><p class="muted">Signed in as <b>'+esc(STORE.email)+'</b>.</p><p class="muted small">'+(STORE.cloud==="blocked"?"Account sync is waiting for the latest Firestore rules. Your data is safe on this device.":"Your saved places, trips, walks and car sync to this account on every device.")+'</p><div class="row"><button class="gbtn ghost" data-a="signout">Sign out</button><button class="gbtn" data-a="close">Close</button></div>');
  /* explore */
  if(a==="cat")return exploreLoad(t.dataset.k);
  if(a==="exgo"||a==="exsave"){const x=EXP.items[i];resolveText(x).then(p=>{if(a==="exgo")chooseDest(p);else addSaved(Object.assign({},p))}).catch(err=>toast(err.message));return}
  /* immersive */
  if(a==="immto")return IMM.fly(IMM.targets()[i]);
  if(a==="orbit")return IMM.orbit();
  if(a==="immgo"){if(IMM.target&&IMM.target.lat)chooseDest(IMM.target);return}
  /* trips */
  if(a==="ttab"){TRIPS.tab=t.dataset.v;renderPage();return}
  if(a==="tripdest"){TRIPS.date=($("#tdate")||{}).value;TRIPS.time=($("#ttime")||{}).value;return searchFor("trip","Where are you going?")}
  if(a==="tplan"){const d=TRIPS.draftDest;TRIPS.date=$("#tdate").value;TRIPS.time=$("#ttime").value;TRIPS.mode=$("#tmode").value;TRIPS.busy=true;TRIPS.err="";renderPage();
    planArrive(d,TRIPS.date,TRIPS.time,TRIPS.mode).then(p=>{TRIPS.plan=p}).catch(err=>{TRIPS.err=err.message}).finally(()=>{TRIPS.busy=false;renderPage()});return}
  if(a==="tsave"){const p=Object.assign({id:uid()},TRIPS.plan);D.trips.unshift(p);save();TRIPS.plan=null;TRIPS.tab="saved";renderPage();toast("Trip saved");return}
  if(a==="tgo"){const p=t.dataset.id?D.trips.find(x=>x.id===t.dataset.id):TRIPS.plan;if(p){G.mode=p.mode||"DRIVE";chooseDest(p.dest)}return}
  if(a==="tdel"){D.trips=D.trips.filter(x=>x.id!==t.dataset.id);save();renderPage();return}
  if(a==="trefresh"){const p=D.trips.find(x=>x.id===t.dataset.id);if(!p)return;t.disabled=true;t.textContent="Updating…";planArrive(p.dest,p.date,p.time,p.mode).then(n=>{Object.assign(p,n);save();renderPage()}).catch(err=>{toast(err.message);renderPage()});return}
  if(a==="hgo"){const h=D.history.find(x=>x.id===t.dataset.id);if(h){G.mode=h.mode;chooseDest(h.to)}return}
  if(a==="hclear"){D.history=[];save();renderPage();return}
  if(a==="wstart")return WALK.begin();
  if(a==="walkok"){D.settings.walkConsent=true;save();closeModal();return WALK.begin()}
  if(a==="wpause")return WALK.pause();
  if(a==="wsave")return WALK.stop(true);
  if(a==="wdiscard")return WALK.stop(false);
  if(a==="wdel"){D.walks=D.walks.filter(x=>x.id!==t.dataset.id);save();renderPage();return}
  /* saved */
  if(a==="sgo"){const s=D.saved.find(x=>x.id===t.dataset.id);if(s)chooseDest(s);return}
  if(a==="sedit")return editSaved(t.dataset.id);
  if(a==="sdel"){D.saved=D.saved.filter(x=>x.id!==t.dataset.id);save();closeModal();MAP.draw();renderPage();paintChips();return}
  if(a==="ssave"){const s=D.saved.find(x=>x.id===t.dataset.id);if(!s)return;s.name=$("#en").value.trim()||s.name;const k=$("#ek").value;if(k!==s.kind&&["home","work","school"].includes(k))D.saved=D.saved.filter(x=>x.kind!==k||x.id===s.id);s.kind=k;s.color=$("#ec").value;s.color2=$("#ec2on").checked?$("#ec2").value:"";save();closeModal();MAP.draw();renderPage();paintChips();return}
  /* settings */
  if(a==="settheme"){D.settings.theme=t.dataset.v;save();applyTheme();renderPage();return}
  if(a==="setlayout"){D.settings.layout=t.dataset.v;save();setLayout(t.dataset.v,true);renderPage();return}
  if(a==="setview"){D.settings.view=t.dataset.v;MAP.view=t.dataset.v;save();renderPage();return}
  if(a==="setunits"){D.settings.units=t.dataset.v;save();renderPage();return}
  if(a==="testvoice"){const v=D.settings.voice;D.settings.voice=true;speak("In a quarter mile, turn right onto South Tryon Street.");D.settings.voice=v;return}
  if(a==="vcolor"){D.vehicle.color=t.dataset.v;save();renderPage();MAP.vehicle();DRIVE.dirty=true;return}
  if(a==="export"){const b=new Blob([JSON.stringify(D,null,2)],{type:"application/json"}),u=URL.createObjectURL(b),l=document.createElement("a");l.href=u;l.download="groove-guide-data.json";l.click();setTimeout(()=>URL.revokeObjectURL(u),2000);return}
  if(a==="wipe")return modal('<h3>Delete your Groove Guide data?</h3><p class="muted">Saved places, trips, history, walks and vehicle settings are removed from this device'+(STORE.uid?" and your account":"")+'.</p><div class="row"><button class="gbtn ghost" data-a="close">Cancel</button><button class="gbtn" data-a="wipego">Delete</button></div>');
  if(a==="wipego"){D=JSON.parse(JSON.stringify(DEF_DATA));try{localStorage.removeItem("gg:data")}catch(x){}if(STORE.db&&STORE.uid)STORE.db.doc("guide/"+STORE.uid).delete().catch(()=>{});closeModal();MAP.draw();applyTheme();renderPage();toast("Deleted");return}
});
document.addEventListener("change",e=>{const t=e.target;
  if(t.dataset.set){D.settings[t.dataset.set]=t.checked;save();if(t.dataset.set==="voice"&&!t.checked&&window.speechSynthesis)speechSynthesis.cancel();return}
  if(t.dataset.veh){let v=t.value.trim();if(t.dataset.veh==="year")v=v.replace(/\D/g,"").slice(0,4);D.vehicle[t.dataset.veh]=v;save();MAP.vehicle();DRIVE.dirty=true;if(t.dataset.veh==="color"||t.dataset.veh==="type")renderPage()}});
document.addEventListener("input",e=>{if(e.target.id==="gq"){clearTimeout(sugT);const v=e.target.value;sugT=setTimeout(()=>suggest(v),200)}});
document.addEventListener("focusin",e=>{if(e.target.id==="gq"&&!$("#gsug").innerHTML)suggest(e.target.value)});
document.addEventListener("keydown",e=>{
  if(e.target.id==="gq"){const n=SUG.length;if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();if(!n)return;sugI=(sugI+(e.key==="ArrowDown"?1:-1)+n)%n;$$(".sgi").forEach((b,i)=>b.classList.toggle("on",i===sugI));e.target.setAttribute("aria-activedescendant","sg"+sugI)}
    else if(e.key==="Enter"){e.preventDefault();pickSug(sugI>=0?sugI:SUG.findIndex(x=>x.t!=="err"))}else if(e.key==="Escape"){sugOpen(false);if(G.searchFor){G.searchFor=null;$(".gsearch").classList.remove("for");e.target.placeholder="Where we headed?"}}}
  else if(e.key==="Escape"&&$("#gmodal").innerHTML)closeModal()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&G.nav&&!G.nav.sim&&!WAKE)try{navigator.wakeLock&&navigator.wakeLock.request("screen").then(w=>WAKE=w).catch(()=>{})}catch(e){}});

/* ---------- deep links for the ecosystem: /guide/navigate?to=lat,lng&name=…  ·  ?q=address text ---------- */
async function deepLink(){const q=new URLSearchParams(location.search);const to=q.get("to"),name=q.get("name")||"",text=q.get("q");
  if(to){const m=/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(to);if(m){chooseDest({name:name||"Destination",lat:+m[1],lng:+m[2],addr:q.get("addr")||""});return}}
  if(text){try{const p=await resolveText({text,name:name||text});chooseDest(p)}catch(e){toast("Couldn’t find “"+text+"”")}}}

/* ---------- boot ---------- */
function boot(){THEME.cur=resolveTheme();shell();applyTheme();initAuth();route();
  try{navigator.permissions&&navigator.permissions.query({name:"geolocation"}).then(s=>{if(s.state==="granted")startGeo()}).catch(()=>{})}catch(e){}
  addEventListener("resize",()=>DRIVE.resize());deepLink();
  window.__gg={G,D:()=>D,MAP,route,planRoute,navUpdate,startSim};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();

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
const PHONEQ=window.matchMedia?matchMedia("(max-width:760px),(max-height:500px) and (pointer:coarse)"):null;
function isPhone(){return PHONEQ?PHONEQ.matches:innerWidth<=760}
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
  down:'<path d="m6 9 6 6 6-6"/>',
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
addEventListener("popstate",()=>{if(typeof UIX!=="undefined"&&UIX.onPop())return;route();if(typeof paintReturn==="function")paintReturn()});
function shell(){
  const root=$("#gg");root.className="gg "+THEME.cur;
  root.innerHTML='<header class="ghd"><a class="gbrand" href="'+href("")+'" data-go="" aria-label="Groove Guide home"><span class="gpinlogo" aria-hidden="true"><svg viewBox="0 0 32 40" width="30" height="38"><defs><linearGradient id="gpl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc3a1"/><stop offset="1" stop-color="#e98457"/></linearGradient></defs><path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.6 16 39 16 39s15-12.4 15-23.2C31 7.6 24.3 1 16 1z" fill="url(#gpl)"/><circle cx="16" cy="15.5" r="5.6" fill="#0b0b0d"/></svg></span><span class="gbt"><b><em>groove</em> guide<i>.</i></b><small>BY GROOVEVILLE</small></span></a>'+
    '<div class="gsearch" role="search"><span class="gsi">'+ico("explore",20)+'</span><input id="gq" type="search" placeholder="Where we headed?" autocomplete="off" spellcheck="false" aria-label="Search for a place" aria-autocomplete="list" aria-controls="gsug"><button class="gmic" data-a="voice" aria-label="Search by voice" hidden>'+ico("mic",20)+'</button><button class="gsx" data-a="search-cancel" aria-label="Cancel search">'+ico("x",18)+'</button><div class="gsug" id="gsug" role="listbox" hidden></div></div><button class="gdest" id="gdest" data-a="sheet" data-v="full" aria-label="Trip details" hidden></button>'+
    '<nav class="gchips" aria-label="Quick places">'+[["home","Home"],["work","Work"],["school","School"],["fav","Favorites"],["recent","Recent"]].map(([k,l])=>'<button class="gchip c-'+k+'" data-a="chip" data-k="'+k+'">'+ico({home:"home",work:"work",school:"school",fav:"heart",recent:"clock"}[k],19)+'<span>'+l+'</span></button>').join("")+'</nav>'+
    '<div class="gthm" role="group" aria-label="Appearance"><button data-a="theme" data-v="light" aria-label="Light mode">'+ico("sun",19)+'</button><button data-a="theme" data-v="dark" aria-label="Dark mode">'+ico("moon",19)+'</button></div>'+
    '<a class="gicon" href="'+esc(CFG.homeUrl)+'" title="Back to Grooveville" aria-label="Back to Grooveville">'+ico("grid",20)+'</a><div class="gacct" id="gacct"></div></header>'+
    '<nav class="gside" aria-label="Groove Guide">'+SIDE.map(([k,l,i])=>'<a href="'+href(k)+'" data-go="'+k+'">'+ico(i,24)+'<span>'+l+'</span></a>').join("")+'<a class="gback" href="'+esc(CFG.homeUrl)+'">'+ico("back",20)+'<span>Grooveville</span></a></nav>'+
    '<main class="gmain"><section id="dash" class="dash"></section><section id="gpage" class="gpage" hidden></section></main>'+
    '<nav class="gtabs" aria-label="Groove Guide">'+[["navigate","Navigate","navigate"],["explore","Explore","explore"],["saved","Saved","saved"],["trips","Trips","trips"],["more","More","more"]].map(([k,l,i])=>k==="more"?'<button data-a="more">'+ico(i,23)+'<span>'+l+'</span></button>':'<a href="'+href(k)+'" data-go="'+k+'">'+ico(i,23)+'<span>'+l+'</span></a>').join("")+'</nav>'+
    '<button class="gret gl" id="gret" data-go="navigate" hidden>'+ico("navigate",18)+'<span>Back to your trip</span></button><div id="gmodal"></div><div id="gtoast" role="status" aria-live="polite"></div>';
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
  if(dashPage){if(!$("#gmap"))dashShell();MAP.ensure();paintAll();if(G.page==="navigate"&&!G.route)setTimeout(()=>{const q=$("#gq");if(q&&!isPhone())q.focus()},50)}
  else{IMM.stop();renderPage()}
  $(".gmain").scrollTop=0;if(typeof paintReturn==="function")paintReturn();
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
    MAP.draw();if(MAP.view==="aerial")CITY.show();
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
      MAP.lines.push(new P({path:r.path,strokeColor:dark?"#ffe1cc":"#e7dcff",strokeOpacity:.85,strokeWeight:2.5,zIndex:6,clickable:false,map:MAP.map}));
      if(G.mode==="DRIVE")r.traffic.forEach(t=>{if(t.speed==="NORMAL")return;const seg=r.path.slice(t.s,t.e+1);if(seg.length>1)MAP.lines.push(new P({path:seg,strokeColor:t.speed==="TRAFFIC_JAM"?"#d9572b":"#f2b13c",strokeWeight:5,zIndex:7,clickable:false,map:MAP.map}))})}
    D.saved.forEach(s=>{if(!s.lat)return;const m=new Mk({map:MAP.map,position:{lat:s.lat,lng:s.lng},content:MAP.pinEl(placeColor(s),kindIcon(s.kind),"",false),title:s.name,zIndex:3});m.addListener("click",()=>chooseDest(s));MAP.marks.push(m)});
    (G.stops||[]).forEach((s,i)=>MAP.marks.push(new Mk({map:MAP.map,position:s,content:MAP.pinEl("#b7a1e5","pin",String(i+1),false),title:s.name||"Stop",zIndex:8})));
    if(G.dest)MAP.dest=new Mk({map:MAP.map,position:{lat:G.dest.lat,lng:G.dest.lng},content:MAP.pinEl(G.dest.color||ROUTE_COLOR(),G.dest.icon||"flag",G.dest.name,true),title:G.dest.name,zIndex:9});
    MAP.vehicle();if(CITY.on)CITY.draw();
  },
  vehEl(){const d=document.createElement("div");d.className="gveh "+MAP.view;d.innerHTML=MAP.view==="flat"?vehArrowSvg(D.vehicle.color):vehTopSvg(D.vehicle.color,D.vehicle.type);return d},
  vehicle(){if(!MAP.map)return;const p=G.nav?G.nav.snapPos||G.pos:G.pos;if(!p){if(MAP.veh){MAP.veh.map=null;MAP.veh=null}return}
    if(!MAP.veh||MAP.veh._v!==MAP.view+D.vehicle.color+D.vehicle.type){if(MAP.veh)MAP.veh.map=null;MAP.veh=new MAP.libs.marker.AdvancedMarkerElement({map:MAP.map,position:p,content:MAP.vehEl(),zIndex:20,title:D.vehicle.nick||"You"});MAP.veh._v=MAP.view+D.vehicle.color+D.vehicle.type}
    else MAP.veh.position=p;MAP.rotateVeh();if(CITY.on)CITY.vehicle()},
  rotateVeh(){if(!MAP.veh||!MAP.map)return;const h=(curHeading()||0)-(MAP.map.getHeading()||0);const s=MAP.veh.content.querySelector("svg");if(s)s.style.transform="rotate("+h+"deg)"},
  setView(v){if(v==="toggle")v=MAP.view==="aerial"?"flat":"aerial";MAP.view=v;D.settings.view=v;save();
    if(MAP.map){if(G.nav){MAP.follow=true;paintRecenter();MAP.recenter()}
      else if(v==="aerial"){const r=G.route,p=r&&r.path&&r.path.length?r.path[0]:(G.pos||MAP.map.getCenter()),hd=r&&r.path&&r.path.length>1?bearing(r.path[0],r.path[Math.min(6,r.path.length-1)]):(MAP.map.getHeading()||0);
        MAP.anim({center:p,zoom:Math.max(17,MAP.map.getZoom()||0),tilt:67,heading:hd},800)}
      else MAP.anim({tilt:0,heading:0},550).then(()=>{if(G.route&&!G.nav)MAP.fit()})
      MAP.vehicle();if(v==="aerial")CITY.show().then(ok=>{if(!ok)MAP.check3d()});else CITY.hide()}
    paintMapTools()},
  check3d(){try{const rt=MAP.map.getRenderingType&&MAP.map.getRenderingType();if(rt&&String(rt).toUpperCase()==="RASTER")toast("This device is showing the flat map, so 3D tilt isn’t available here.",5000)}catch(e){}},
  zoom(d){if(CITY.on)return CITY.zoom(d);if(MAP.map)MAP.map.moveCamera({zoom:(MAP.map.getZoom()||14)+d})},
  north(){if(CITY.on)return CITY.north();if(MAP.map)MAP.map.moveCamera({heading:0})},
  fit(){if(!MAP.map||!G.route||!G.route.path)return;if(CITY.on)CITY.overview();const b=new google.maps.LatLngBounds();G.route.path.forEach(p=>b.extend(p));MAP.map.moveCamera({tilt:0,heading:0});
    let pad={top:120,bottom:90,left:60,right:60};if(isPhone()){const tc=$("#tripcard"),tb=$("#tbar");const bot=G.nav?(tb?tb.offsetHeight:100):(tc&&tc.offsetParent?tc.offsetHeight:220);pad={top:G.nav?130:40,bottom:bot+30,left:36,right:70}}
    MAP.map.fitBounds(b,pad);if(MAP.view==="aerial"){const t=()=>MAP.map&&MAP.map.moveCamera({tilt:45});if(google.maps.event&&google.maps.event.addListenerOnce)google.maps.event.addListenerOnce(MAP.map,"idle",t);else setTimeout(t,400)}},
  /* smooth camera moves between views (instant with reduced motion) */
  anim(to,ms){return new Promise(res=>{if(!MAP.map){res();return}const id=MAP._an=(MAP._an||0)+1;if(REDUCED||!ms){MAP.map.moveCamera(to);res();return}
    const c=MAP.map.getCenter(),f={lat:c?c.lat():0,lng:c?c.lng():0,zoom:MAP.map.getZoom()||14,tilt:(MAP.map.getTilt&&MAP.map.getTilt())||0,heading:MAP.map.getHeading()||0};
    const tc=to.center?(typeof to.center.lat==="function"?{lat:to.center.lat(),lng:to.center.lng()}:to.center):null,dh=to.heading!=null?((to.heading-f.heading)%360+540)%360-180:0,t0=performance.now(),ez=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
    MAP.anOn=true;const step=now=>{if(id!==MAP._an){res();return}const k=Math.min(1,(now-t0)/ms),q=ez(k),o={};
      if(tc)o.center={lat:f.lat+(tc.lat-f.lat)*q,lng:f.lng+(tc.lng-f.lng)*q};if(to.zoom!=null)o.zoom=f.zoom+(to.zoom-f.zoom)*q;if(to.tilt!=null)o.tilt=f.tilt+(to.tilt-f.tilt)*q;if(to.heading!=null)o.heading=f.heading+dh*q;
      MAP.map.moveCamera(o);if(k<1)requestAnimationFrame(step);else{MAP.anOn=false;res()}};requestAnimationFrame(step)})},
  recenter(){MAP.follow=true;paintRecenter();if(CITY.on)CITY.cam(800);const p=(G.nav&&G.nav.snapPos)||G.pos;if(MAP.map&&p)MAP.anim({center:p,zoom:G.nav?17.5:15.5,tilt:MAP.view==="aerial"?(G.nav?65:55):0,heading:G.nav&&MAP.view==="aerial"?curHeading()||0:0},700)},
  followTick(){if(!MAP.map||!G.nav||!MAP.follow||MAP.anOn)return;if(CITY.on)CITY.cam(950);const p=G.nav.snapPos||G.pos;if(p)MAP.map.moveCamera({center:p,zoom:G.mode==="WALK"?18:17.5,tilt:MAP.view==="aerial"?65:0,heading:MAP.view==="aerial"?curHeading()||0:0})}
};
function vehArrowSvg(c){return '<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="17" fill="'+c+'" opacity=".22"/><path d="M20 6 31 32l-11-6-11 6z" fill="'+c+'" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>'}
function vehTopSvg(c,type){const w=type==="truck"||type==="suv"?18:16,l=type==="truck"?38:34;
  return '<svg viewBox="0 0 44 44" width="46" height="46"><defs><linearGradient id="vg" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs><ellipse cx="22" cy="23" rx="'+(w/2+5)+'" ry="'+(l/2+3)+'" fill="#000" opacity=".28"/><rect x="'+(22-w/2)+'" y="'+(22-l/2)+'" width="'+w+'" height="'+l+'" rx="6" fill="'+c+'" stroke="#fff" stroke-width="1.6"/><rect x="'+(22-w/2)+'" y="'+(22-l/2)+'" width="'+w+'" height="'+l+'" rx="6" fill="url(#vg)"/><path d="M'+(22-w/2+2)+' '+(22-l/2+9)+' h'+(w-4)+' l-2 6 h'+(-(w-8))+'z" fill="#0b1018" opacity=".85"/><rect x="'+(22-w/2+3)+'" y="'+(22+l/2-9)+'" width="'+(w-6)+'" height="4" rx="1.5" fill="#0b1018" opacity=".7"/><circle cx="'+(22-w/2+3)+'" cy="'+(22-l/2+2.5)+'" r="1.6" fill="#fff8d6"/><circle cx="'+(22+w/2-3)+'" cy="'+(22-l/2+2.5)+'" r="1.6" fill="#fff8d6"/></svg>'}
function curHeading(){if(G.nav&&G.nav.heading!=null)return G.nav.heading;return G.heading}

/* ---------- dashboard ---------- */
function dashShell(){
  $("#dash").innerHTML='<div class="mapcol"><div class="mapbox"><div id="gmap" role="application" aria-label="Map"></div><div class="mapamb" aria-hidden="true"></div><div class="mapfb" id="mapfb" hidden></div>'+
    '<div class="tripcard gl" id="tripcard"></div>'+
    '<div class="mtools"><button class="rb vtog" id="vtog" data-a="view" data-v="toggle">3D</button><button class="rb" data-a="fit" aria-label="Show the whole route" title="Whole route">'+ico("layers",20)+'</button><button class="rb dvbtn" data-a="drivetoggle" aria-label="Driving view" title="Driving view">'+ico("car",20)+'</button></div>'+
    '<div class="mzoom gl"><button data-a="zoom" data-d="1" aria-label="Zoom in">'+ico("plus",20)+'</button><button data-a="zoom" data-d="-1" aria-label="Zoom out">'+ico("minus",20)+'</button></div>'+
    '<button class="mcomp gl" data-a="north" aria-label="Face north">'+'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3 16.5 19 12 15.5 7.5 19z" fill="currentColor"/></svg></button>'+
    '<button class="mrecenter" data-a="recenter" id="mrec" hidden>'+ico("locate",18)+' Re-center</button>'+
    '<div class="nextturn gl" id="nextturn" hidden></div><div class="mspd gl" id="mspd" hidden></div>'+
    '<div class="laysw gl" role="group" aria-label="Screen layout"><button data-a="layout" data-v="70">70/30</button><button data-a="layout" data-v="80">80/20</button><button data-a="layout" data-v="map">Map</button></div>'+
    '<div class="modesw gl" role="group" aria-label="Travel mode"><button data-a="mode" data-v="DRIVE">'+ico("car",18)+'<span>Drive</span></button><button data-a="mode" data-v="WALK">'+ico("walk",18)+'<span>Walk</span></button></div>'+
    '</div></div>'+
    '<aside class="drivecol gl" id="drivecol" aria-label="Driving view"><button class="dexp" data-a="drivetoggle" aria-label="Show or hide the driving view"></button><div class="dhead" id="dhead"></div><div class="dstage"><canvas id="dcv"></canvas><div class="dnote" id="dnote"></div><small class="dattr">Streets &amp; buildings © OpenStreetMap contributors</small><div class="dspd" id="dspd"></div></div><div class="dfoot" id="dfoot"></div></aside>'+
    '<footer class="tbar gl" id="tbar"><button class="tgrab" data-a="sheet" aria-label="Show trip details"></button><div class="tbin" id="tbin"></div></footer>';
  DRIVE.init($("#dcv"));setLayout(D.settings.layout||"70",true);
}
function setLayout(v,quiet){G.layout=v;const d=$("#dash");if(d){d.classList.remove("lay-70","lay-80","lay-map");d.classList.add("lay-"+v)}$$(".laysw button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));if(!quiet){D.settings.layout=v;save()}DRIVE.resize()}
function paintMapFallback(){const f=$("#mapfb");if(!f)return;
  if(!MAP.failed){f.hidden=true;return}f.hidden=false;const d=diagText(MAP.failed);
  f.innerHTML='<div><span class="fbk">'+ico("info",20)+'</span><b>'+esc(d[0])+'</b><p>'+d[1]+'</p>'+(d[2]?'<p class="fbfix">'+d[2]+'</p>':'')+'<div class="fbb"><button class="gbtn" data-a="retry-map">Try again</button></div><small>Error code: '+esc(MAP.failed)+'</small></div>'}
function paintMapTools(){const vt=$("#vtog"),a3=MAP.view==="aerial";if(vt){vt.textContent=a3?"3D":"2D";vt.classList.toggle("on",a3);vt.setAttribute("aria-label",a3?"3D view on. Switch to flat 2D map":"Flat 2D map. Switch to 3D view");vt.title=a3?"Switch to 2D":"Switch to 3D"}const gg=$("#gg");if(gg)gg.classList.toggle("v3d",a3);$$(".modesw button").forEach(b=>b.classList.toggle("on",b.dataset.v===G.mode))}
function paintRecenter(){const b=$("#mrec");if(b)b.hidden=!(G.nav&&!MAP.follow);if(CITY.on)CITY.vehicle()}
function paintAll(){const d=$("#dash");if(d){d.classList.toggle("navving",!!G.nav);d.classList.toggle("hasroute",!!G.route)}if(typeof paintDestPill==="function")paintDestPill();paintRoot();paintTrip();paintNext();paintDrive();paintTbar();paintMapTools();paintRecenter();paintChips();requestAnimationFrame(sizeBottom)}
/* phone: hide the header chips while a route is up, and the whole header + tab bar while navigating, so the map has room */
function paintRoot(){const gg=$("#gg");if(!gg)return;const dp=G.page===""||G.page==="navigate";gg.classList.toggle("rt",dp&&!!G.dest);gg.classList.toggle("nv",dp&&!!G.nav)}
function sizeBottom(){const d=$("#dash");if(!d)return;const gg=$("#gg"),tc=$("#tripcard"),tb=$("#tbar");let h=96;
  if(isPhone()){if(gg&&gg.classList.contains("rt")&&!G.nav&&tc&&tc.offsetParent)h=tc.offsetHeight+10;else if(tb&&tb.offsetParent)h=Math.min(tb.offsetHeight,160)}
  d.style.setProperty("--bot",h+"px")}
function paintChips(){$$(".gchip").forEach(b=>{const k=b.dataset.k;if(k==="home"||k==="work"||k==="school"){const s=savedOf(k);b.classList.toggle("set",!!s);b.title=s?s.name+" · "+(s.addr||""):"Set your "+k}})}
function originLabel(){return G.pos?(G.posSrc==="map"?"Map center":"Your location"):"Location off"}
function paintTrip(){const c=$("#tripcard");if(!c)return;const r=G.route;
  c.classList.toggle("hero",!G.dest);
  if(!G.dest){c.innerHTML='<div class="ghero"><h1>Your City.<br>Your Route.<br><em>Your Vibe.</em></h1><p class="gcaps">Where we headed?</p>'+
    '<div class="gfeat"><button data-a="focus-search">'+ico("navigate",22)+'<b>Real-time navigation</b><small>Smarter routes. Less stress.</small></button><button data-a="feat-weather">'+ico("cloud",22)+'<b>Weather &amp; time</b><small>Know what to expect.</small></button><a href="'+href("settings")+'" data-go="settings">'+ico("car",22)+'<b>Personalized drive</b><small>Your vehicle. Your style.</small></a><a href="'+href("explore")+'" data-go="explore">'+ico("pin",22)+'<b>Discover more</b><small>Great places. Your next move.</small></a></div>'+
    '<div class="gstat">'+ico("locate",16)+'<span>'+(G.geoErr?esc(G.geoErr):G.pos?"Starting from your location":"Allow location to start from where you are")+'</span>'+(!G.pos?'<button class="gbtn sm" data-a="locate">Use my location</button>':'')+'</div></div>';return}
  c.innerHTML='<div class="tc">'+ico("pin",22)+'<div class="tct"><b>'+esc(originLabel())+'</b><b class="to">→ '+esc(G.dest.name)+'</b>'+(G.stops.length?'<small>'+G.stops.length+' stop'+(G.stops.length>1?'s':'')+' added</small>':'')+
    (G.busy?'<small>Finding the best route…</small>':G.err?'<small class="warn">'+esc(G.err)+'</small><button class="gbtn sm retry" data-a="retry-route">Try again</button>':r?'<small>'+fmtDur(r.durationSec)+' · '+fmtDist(r.distanceM)+' · arrive '+fmtTime(arrival())+(r.trafficLevel?' · '+r.trafficLevel:'')+'</small>':'')+'</div><button class="tcx" data-a="clear" aria-label="Clear destination">'+ico("x",18)+'</button></div>'+
    (G.routes.length>1&&!G.nav?'<div class="alts">'+G.routes.map((x,i)=>'<button class="'+(i===G.sel?"on":"")+'" data-a="alt" data-i="'+i+'"><b>'+fmtDur(x.durationSec)+'</b><small>'+(i===0?"Best":x.description?"via "+esc(x.description):"Option "+(i+1))+(x.toll?" · tolls":"")+'</small></button>').join("")+'</div>':'')+
    (r&&!G.busy?'<div class="tcb">'+(G.nav?'<button class="gbtn ghost'+(G.endArm?' confirm':'')+'" data-a="end">'+ico("stop",16)+(G.endArm?' Tap again to end':' End')+'</button>':'<button class="gbtn" data-a="start">'+ico("navigate",16)+' Start</button>')+'<button class="gbtn ghost icon" data-a="savedest" aria-label="Save this place">'+ico("star",16)+'</button><button class="gbtn ghost icon tcdet" data-a="sheet" aria-label="Trip details: weather, time, stops">'+ico("info",16)+'</button></div>':'')+
    (G.sim?'<div class="simtag">Simulation · not your real position</div>':'');
}
function nextInfo(){const n=G.nav;if(!n||!G.route)return null;const st=G.route.steps;const k=n.step;const nx=st[k+1];
  return {dist:Math.max(0,(st[k]?st[k].endD:G.route.len)-n.s),man:nx?nx.maneuver:"DESTINATION",instr:nx?nx.instr:"Arrive at "+(G.dest?G.dest.name:"your destination")}}
function paintNext(){const e=$("#nextturn");if(!e)return;const r=G.route;let ni=nextInfo();
  requestAnimationFrame(()=>{const d=$("#dash");if(d&&e.offsetHeight)d.style.setProperty("--ntH",e.offsetHeight+"px")});
  if(!ni&&r&&r.steps.length){const s=r.steps[1]||r.steps[0];ni={dist:r.steps[0].distanceM,man:s.maneuver,instr:s.instr,preview:true}}
  if(!ni){e.hidden=true;return}e.hidden=false;
  e.innerHTML='<span class="nti">'+manIco(ni.man,46)+'</span><div><small>'+(ni.preview?"First turn":"Next turn")+'</small><b>'+fmtDist(ni.dist)+'</b><span>'+esc(shortInstr(ni.instr))+'</span>'+(function(){const l=!ni.preview&&LANES.get(ni);return l&&l.lanes?'<span class="ntl" aria-label="Lanes">'+l.lanes.map(x=>'<i class="ln'+(x.ok?" ok":"")+'">'+manIco(x.dir,18)+'</i>').join("")+'</span>':''})()+'</div><button class="ntv" data-a="voice-toggle" aria-label="'+(D.settings.voice?"Mute voice guidance":"Turn on voice guidance")+'">'+ico(D.settings.voice?"vol":"mute",20)+'</button>';
}
const shortInstr=t=>String(t||"").split("\n")[0].replace(/\s*Pass by.*$/,"");
function paintDrive(){const h=$("#dhead"),f=$("#dfoot"),n=$("#dnote");if(!h)return;const ni=nextInfo();
  if(ni){h.innerHTML=manIco(ni.man,44)+'<div><b>'+esc(shortInstr(ni.instr))+'</b><small>'+(ni.dist<30?"Now":"In "+fmtDist(ni.dist))+'</small></div>'}
  else if(G.route){h.innerHTML=manIco("STRAIGHT",44)+'<div><b>Ready when you are</b><small>'+esc(fmtDur(G.route.durationSec))+' to '+esc(G.dest?G.dest.name:"destination")+'</small></div>'}
  else h.innerHTML=manIco("STRAIGHT",44)+'<div><b>No active route</b><small>Pick a destination to see the road ahead</small></div>';
  const sp=speedFmt(G.speed);
  const lim=typeof limitFmt==="function"?limitFmt():null,over=sp!=null&&lim!=null&&sp>lim+4;
  const ms=$("#mspd");if(ms){ms.hidden=!G.nav||G.mode==="WALK";ms.classList.toggle("over",over);ms.innerHTML='<span class="msv"><b>'+(sp==null?"—":sp)+'</b><small>'+speedUnit()+'</small></span>'+(lim!=null?'<span class="lim on" title="Posted limit from OpenStreetMap"><small>SPEED<br>LIMIT</small><b>'+lim+'</b></span>':'')}
  const ds=$("#dspd");if(ds)ds.classList.toggle("over",over);if(ds)ds.innerHTML='<span class="whl">'+'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.2"/><path d="M3.5 10.5h6.3M14.2 10.5h6.3M12 14.2V21"/></svg></span><div class="spd"><b>'+(sp==null?"—":sp)+'</b><small>'+speedUnit()+'</small></div>'+(lim!=null?'<div class="lim on" title="Posted limit from OpenStreetMap"><small>SPEED<br>LIMIT</small><b>'+lim+'</b></div>':'');
  f.innerHTML='<div class="lanes">'+laneHtml(ni)+'</div>';
  if(!D3.active)n.textContent=G.route?(G.sim?"Simulated drive along your real route":"Route ahead, drawn from your real route. Not a camera view."):"";
  DRIVE.dirty=true;
}
/* Lane guidance: only shown when a verified lane provider supplies data. None is connected yet, so we show the maneuver, not lanes. */
const LANES={provider:null,get(step){return this.provider?this.provider(step):null}};
function laneHtml(ni){const l=ni&&LANES.get(ni);const dc=$("#drivecol");if(dc)dc.classList.toggle("haslanes",!!(l&&l.lanes));if(l&&l.lanes)return l.lanes.map(x=>'<span class="ln'+(x.ok?" ok":"")+'">'+manIco(x.dir,26)+'</span>').join("");
  return '<span class="ln ok">'+manIco(ni?ni.man:"STRAIGHT",28)+'</span><small class="lnn">Lane data unavailable. Follow the arrow.</small>'}
function arrival(){const r=G.route;if(!r)return null;const left=G.nav?G.nav.leftSec:r.durationSec;return Date.now()+left*1000}
function paintTbar(){const t=$("#tbin");if(!t)return;if(isPhone()&&typeof tbarPhone==="function"){t.innerHTML=tbarPhone();SHEET.sync();return}const r=G.route,di=G.intel.dest,oi=G.intel.origin;
  if(!r){t.innerHTML='<div class="tbe">'+ico("info",20)+'<span>Arrival time, traffic, weather and local time appear here once you pick a destination.</span></div>'+tools(false);return}
  const arr=arrival(),tz=di&&di.tz&&!di.tz.error?di.tz.id:"",left=G.nav?G.nav.leftSec:r.durationSec,leftM=G.nav?Math.max(0,r.len-G.nav.s):r.distanceM;
  const wAt=di&&di.weather&&!di.weather.error?weatherAt(di.weather,arr):null;
  const diff=tz&&oi&&oi.tz&&!oi.tz.error?Math.round((di.tz.offsetSec-oi.tz.offsetSec)/3600):null;
  t.innerHTML='<div class="tbi">'+ico("flag",26)+'<div><small>Arrival</small><b>'+fmtTime(arr,tz||undefined)+'</b><span>'+(tz?esc(tzAbbr(arr,tz))+' · ':'')+esc(G.dest.city||G.dest.name)+'</span></div></div>'+
    '<div class="tbi">'+ico("clock",26)+'<div><small>Remaining</small><b>'+fmtDur(left)+'</b><span>'+fmtDist(leftM)+'</span></div></div>'+
    (G.nav?'<button class="gbtn tbend'+(G.endArm?' confirm':'')+'" data-a="end">'+ico("stop",16)+(G.endArm?' Tap again to end':' End')+'</button>':'')+'<div class="tbi eta">'+ico(G.mode==="WALK"?"walk":"car",26)+'<div><small>'+(G.mode==="WALK"?"Walking":"ETA details")+'</small><b>'+(G.mode==="WALK"?(G.walkStats||"On foot"):r.delaySec>120?"+"+fmtDur(r.delaySec)+" delay":"On time")+'</b><span>'+(G.mode==="WALK"?"Pace shown while you walk":r.trafficLevel||"Live traffic")+'</span></div></div>'+
    '<button class="tbi wx" data-a="weather">'+(wAt&&wAt.icon?'<img src="'+esc(wAt.icon+(THEME.cur==="dark"?"_dark":"")+".svg")+'" alt="" width="34" height="34">':ico("cloud",26))+'<div><small>Weather at destination</small><b>'+(wAt&&wAt.temp!=null?wAt.temp+"°":"—")+'</b><span>'+(wAt?esc(wAt.text||""):di&&di.weather&&di.weather.error?"Unavailable":di?"…":"Loading…")+'</span></div>'+ico("back",16).replace('class="ic"','class="ic chev"')+'</button>'+
    '<div class="tbi dtz">'+ico("clock",26)+'<div><small>Destination time</small><b>'+(tz?fmtTime(Date.now(),tz):"—")+'</b><span>'+(tz?esc(tzAbbr(Date.now(),tz))+(diff?" ("+(diff>0?"+":"")+diff+" hr)":diff===0?" · same time":""):di&&di.tz&&di.tz.error?"Unavailable":"…")+'</span></div></div>'+tools(true);
}
function tools(on){return '<div class="tbtools"><small>Trip tools</small><div><button class="gbtn ghost sm" data-a="addstop"'+(on?'':' disabled')+'>'+ico("pin",16)+' Add Stop</button><button class="gbtn ghost sm" data-a="share"'+(on?'':' disabled')+'>'+ico("share",16)+' Share ETA</button><button class="gbtn ghost sm" data-a="options">'+ico("sliders",16)+' Route Options</button></div></div>'}
function weatherAt(w,t){if(!w)return null;if(!t||t-Date.now()<45*60000||!w.hours||!w.hours.length)return w.now;let b=null,bd=1e15;w.hours.forEach(h=>{const d=Math.abs(Date.parse(h.t)-t);if(d<bd){bd=d;b=h}});return bd<3*3600000?b:w.now}

/* ---------- City 3D: Google's photorealistic 3D city for the 3D view, with the Groove Guide route glowing on top.
   Falls back to the tilted vector map when the key doesn't have photorealistic 3D. ---------- */
const CITY={on:false,ok:null,el:null,lib:null,items:[],veh:null,alt:{},
  /* Google's 3D camera measures height from sea level, so the camera needs the ground height (Charlotte is ~230 m up).
     Looked up from Open-Meteo's free elevation service on a ~1 km grid, straight from the browser (no Grooveville server request). */
  altAt(p){if(!p)return 0;const k=p.lat.toFixed(2)+","+p.lng.toFixed(2);if(CITY.alt[k]!=null)return CITY.alt[k];CITY.alt[k]=CITY.last||0;
    fetch("https://api.open-meteo.com/v1/elevation?latitude="+p.lat.toFixed(2)+"&longitude="+p.lng.toFixed(2)).then(r=>r.json()).then(j=>{const v=j&&j.elevation&&j.elevation[0];if(isFinite(v)){CITY.alt[k]=v;CITY.last=v;if(CITY.on)CITY.cam(600)}}).catch(()=>{});return CITY.alt[k]},
  async avail(){if(CITY.ok!==null)return CITY.ok;try{CITY.lib=await google.maps.importLibrary("maps3d");CITY.ok=!!(CITY.lib&&CITY.lib.Map3DElement&&CITY.lib.Polyline3DElement)}catch(e){CITY.ok=false}return CITY.ok},
  async show(){if(!MAP.libs||!(await CITY.avail()))return false;const box=$(".mapbox");if(!box||MAP.view!=="aerial")return false;
    if(!CITY.el||!CITY.el.isConnected){CITY.items=[];CITY.veh=null;const w=document.createElement("div");w.id="g3d";w.className="g3d";box.insertBefore(w,$("#gmap").nextSibling);
      const t=CITY.target();const o={center:t.center,range:t.range,tilt:t.tilt,heading:t.heading};if(CITY.lib.MapMode)o.mode=CITY.lib.MapMode.SATELLITE;
      try{CITY.el=new CITY.lib.Map3DElement(o)}catch(e){CITY.ok=false;w.remove();return false}
      try{CITY.el.defaultUIHidden=true}catch(e){}
      CITY.el.style.cssText="width:100%;height:100%;display:block";w.appendChild(CITY.el);
      CITY.el.addEventListener("pointerdown",()=>{if(G.nav){MAP.follow=false;paintRecenter()}});
      w.insertAdjacentHTML("beforeend",'<div class="g3dtint" aria-hidden="true"></div><div class="g3dcar" aria-hidden="true">'+vehArrowSvg(THEME.cur==="dark"?"#ff9f68":ROUTE_COLOR()).replace('width="40" height="40"','width="58" height="58"')+'</div>')}
    CITY.on=true;$("#dash").classList.add("city");CITY.draw();CITY.cam(1200);return true},
  hide(){CITY.on=false;const d=$("#dash");if(d)d.classList.remove("city")},
  ll:p=>({lat:p.lat,lng:p.lng,altitude:0}),
  cl(p){return {lat:p.lat,lng:p.lng,altitude:CITY.altAt(p)}},
  target(){const r=G.route,n=G.nav;
    if(n){const p=n.snapPos||G.pos;return {center:CITY.cl(p),heading:curHeading()||0,tilt:67,range:G.mode==="WALK"?230:420}}
    if(r&&r.path&&r.path.length>1){let k=0;while(k<r.path.length-1&&r.cum[k]<350)k++;return {center:CITY.cl(r.path[0]),heading:bearing(r.path[0],r.path[Math.max(1,k)]),tilt:62,range:950}}
    const p=G.pos||(MAP.map&&MAP.map.getCenter()?{lat:MAP.map.getCenter().lat(),lng:MAP.map.getCenter().lng()}:CFG.defaultCenter);return {center:CITY.cl(p),heading:CITY.el?CITY.el.heading||0:20,tilt:60,range:1600}},
  cam(ms){if(!CITY.on||!CITY.el)return;const t=CITY.target();
    try{if(CITY.el.flyCameraTo&&!REDUCED)CITY.el.flyCameraTo({endCamera:t,durationMillis:ms||900});else Object.assign(CITY.el,t)}catch(e){Object.assign(CITY.el,t)}},
  overview(){if(!CITY.on||!G.route)return;const pts=G.route.path;let a=90,b=-90,c=180,d=-180;pts.forEach(p=>{a=Math.min(a,p.lat);b=Math.max(b,p.lat);c=Math.min(c,p.lng);d=Math.max(d,p.lng)});
    const span=Math.max(hav({lat:a,lng:c},{lat:b,lng:d}),400);const mid={lat:(a+b)/2,lng:(c+d)/2};CITY.el.flyCameraTo({endCamera:{center:CITY.cl(mid),range:span*1.6+400,tilt:45,heading:0},durationMillis:REDUCED?0:1400})},
  zoom(dz){if(CITY.el)CITY.el.range=clamp((CITY.el.range||800)*(dz>0?.6:1.6),80,60000)},
  north(){if(CITY.el)CITY.el.heading=0},
  draw(){if(!CITY.on||!CITY.el)return;CITY.items.forEach(x=>x.remove());CITY.items=[];const L=CITY.lib,dark=THEME.cur==="dark",AM=(L.AltitudeMode&&L.AltitudeMode.CLAMP_TO_GROUND)||"CLAMP_TO_GROUND";
    const add=x=>{CITY.el.append(x);CITY.items.push(x)};
    G.routes.forEach((r,i)=>{if(i===G.sel||!r.path)return;add(new L.Polyline3DElement({coordinates:r.path.map(CITY.ll),altitudeMode:AM,strokeColor:"rgba(200,195,215,.75)",strokeWidth:7,drawsOccludedSegments:true}))});
    const r=G.route;if(r&&r.path){const co=r.path.map(CITY.ll),core=dark?"#ffb27f":ROUTE_COLOR();
      add(new L.Polyline3DElement({coordinates:co,altitudeMode:AM,strokeColor:dark?"rgba(255,150,90,.38)":"rgba(123,63,242,.3)",strokeWidth:36,drawsOccludedSegments:true}));
      add(new L.Polyline3DElement({coordinates:co,altitudeMode:AM,strokeColor:core,strokeWidth:14,outerColor:dark?"#fff1e6":"#ffffff",outerWidth:.3,drawsOccludedSegments:true}))}
    if(G.dest&&L.Marker3DElement){try{const m=new L.Marker3DElement({position:{lat:G.dest.lat,lng:G.dest.lng},altitudeMode:"RELATIVE_TO_GROUND",extruded:true,label:G.dest.name});
      try{if(MAP.libs.marker.PinElement)m.append(new MAP.libs.marker.PinElement({background:dark?"#ff9f68":ROUTE_COLOR(),borderColor:"#ffffff",glyphColor:"#ffffff"}))}catch(e){}add(m)}catch(e){}}
    CITY.vehicle()},
  vehicle(){if(!CITY.on||!CITY.el||!CITY.lib.Marker3DElement)return;const p=G.nav?G.nav.snapPos||G.pos:G.pos;
    if(!p){if(CITY.veh){CITY.veh.remove();CITY.veh=null}return}
    const follow=!!(G.nav&&MAP.follow);$("#dash").classList.toggle("cityfollow",follow);
    const pos={lat:p.lat,lng:p.lng,altitude:3};
    if(!CITY.veh){try{CITY.veh=new CITY.lib.Marker3DElement({position:pos,altitudeMode:"RELATIVE_TO_GROUND",zIndex:50,sizePreserved:true});const img=document.createElement("img");img.width=46;img.height=46;img.alt="";
      img.src="data:image/svg+xml;utf8,"+encodeURIComponent(vehArrowSvg(THEME.cur==="dark"?"#ff9f68":ROUTE_COLOR()).replace("<svg ",'<svg xmlns="http://www.w3.org/2000/svg" '));const t=document.createElement("template");t.content.append(img);CITY.veh.append(t);CITY.el.append(CITY.veh)}catch(e){CITY.veh=null}}
    else CITY.veh.position=pos;if(CITY.veh)CITY.veh.style.display=follow?"none":""}
};

/* ---------- server calls ---------- */
async function api(path,o){o=o||{};const ac=typeof AbortController!=="undefined"?new AbortController():null,tm=ac&&setTimeout(()=>ac.abort(),o.timeout||20000);let r;try{r=await fetch(CFG.apiBase+path,{signal:ac?ac.signal:undefined,method:o.method||"GET",headers:o.body?{"content-type":"application/json"}:{},body:o.body?JSON.stringify(o.body):undefined,credentials:"same-origin"})}catch(e){throw new Error(e&&e.name==="AbortError"?"That took too long. Check your connection and try again.":"You seem to be offline. Check your connection and try again.")}finally{if(tm)clearTimeout(tm)}
  let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.error||"Something went wrong ("+r.status+")");return j}

/* ---------- location ---------- */
function startGeo(){
  if(!navigator.geolocation){G.geoErr="This browser can’t share your location.";paintTrip();return}
  if(G.watch!=null)return;
  G.watch=navigator.geolocation.watchPosition(onPos,e=>{G.geoErr=e.code===1?"Location is blocked for this site. Allow it in your browser settings.":"Can’t find your location right now.";if(e.code===1){navigator.geolocation.clearWatch(G.watch);G.watch=null}paintTrip()},{enableHighAccuracy:true,maximumAge:1500,timeout:25000});
}
function locateOnce(ms){return new Promise(res=>{if(G.pos&&G.posSrc==="gps")return res(G.pos);startGeo();let n=0;const t=setInterval(()=>{n+=200;if((G.pos&&G.posSrc==="gps")||n>(ms||9000)||G.geoErr){clearInterval(t);res(G.posSrc==="gps"?G.pos:null)}},200)})}
let lastFix=null,prevFix=null;
function onPos(p){if(G.sim)return;const c=p.coords,np={lat:c.latitude,lng:c.longitude},first=!G.pos||G.posSrc!=="gps";
  G.acc=c.accuracy;G.geoErr="";
  /* speed: the phone's GPS speed when it gives one, otherwise worked out from the last two fixes */
  if(c.speed!=null&&c.speed>=0&&isFinite(c.speed))G.speed=c.speed;
  else if(prevFix&&p.timestamp-prevFix.t>800&&(c.accuracy||99)<60){const v=hav(prevFix.p,np)/((p.timestamp-prevFix.t)/1000);G.speed=v<70?(G.speed!=null?G.speed*.5+v*.5:v):G.speed}
  else if(!prevFix||p.timestamp-prevFix.t>15000)G.speed=null;
  if(!prevFix||p.timestamp-prevFix.t>800)prevFix={p:np,t:p.timestamp};
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
  G.busy=false;MAP.draw();paintAll();if(!keep)requestAnimationFrame(()=>MAP.fit());if(G.route&&D3.ok&&(!isPhone()||G.nav))D3.prefetch(G.route);if(G.route)loadIntel();
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
  /* phones open the driving view when you start; tap the car button for the map (that choice is remembered) */
  if(isPhone()&&D.settings.driveView===true&&G.mode==="DRIVE"){const d=$("#dash");if(d){d.classList.add("drive-open");DRIVE.resize()}}if(D3.ok)D3.prefetch(G.route);D3.sDisp=null;
  if(!sim)try{navigator.wakeLock&&navigator.wakeLock.request("screen").then(w=>WAKE=w).catch(()=>{})}catch(e){}
  speak((G.mode==="WALK"?"Starting walk to ":"Starting route to ")+(G.dest?G.dest.name:"your destination")+". "+fmtDur(G.route.durationSec).replace("hr","hour").replace("min","minutes")+".");
  if(typeof SHEET!=="undefined")SHEET.set("peek");paintAll()}
function endNav(quiet){stopSim();G.nav=null;if(typeof SHEET!=="undefined")SHEET.set("peek",true);const _dd=$("#dash");if(_dd&&isPhone())_dd.classList.remove("drive-open");LIM.v=null;LIM.s=-1e9;G.walkStats="";if(WAKE){try{WAKE.release()}catch(e){}WAKE=null}MAP.follow=true;if(!quiet)paintAll();if(MAP.map&&!quiet)requestAnimationFrame(()=>MAP.fit())}
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
  MAP.vehicle();MAP.followTick();paintNext();paintDrive();if(G.mode==="DRIVE")checkLimit(n.snapPos||p);
  if(!n.tb||Date.now()-n.tb>1000){n.tb=Date.now();paintTbar()}
}
/* posted speed limit for the road you're on (OpenStreetMap via our server); looked up every ~250 m or 40 s while driving */
const LIM={v:null,at:0,s:-1e9,busy:false,miss:0};
async function checkLimit(p){const n=G.nav;if(!n||!p||LIM.busy)return;const now=Date.now();if(n.s-LIM.s<250&&now-LIM.at<40000)return;if(LIM.miss>4&&now-LIM.at<120000)return;
  LIM.busy=true;LIM.s=n.s;LIM.at=now;
  try{const j=await api("/limit?lat="+p.lat.toFixed(5)+"&lng="+p.lng.toFixed(5));LIM.v=j.limit||null;LIM.road=j.road||"";LIM.miss=0}catch(e){LIM.v=null;LIM.miss++}
  LIM.busy=false;paintDrive()}
function limitFmt(){const l=LIM.v;if(!l||!G.nav)return null;const metric=D.settings.units==="metric";
  if(l.unit==="mph")return metric?Math.round(l.value*1.609344/5)*5:l.value;return metric?l.value:Math.round(l.value*0.621371/5)*5}
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
  init(cv){this.cv=cv;this.cx=cv.getContext("2d");try{new ResizeObserver(()=>this.resize()).observe(cv.parentElement)}catch(e){}this.resize();
    /* v12: the 3D driving view (g4c-drive3d.js) renders on its own WebGL canvas; this flat drawing is the fallback */
    const loop=now=>{this.raf=requestAnimationFrame(loop);
      try{if(!window.__noD3)D3.tick(now)}catch(e){console.warn("[Groove Guide] driving view off:",e);D3.failed=true;D3.active=false;const st=$(".dstage");if(st)st.classList.remove("d3on");this.dirty=true}
      if(D3.active)return;if(this.dirty||G.nav)this.draw()};requestAnimationFrame(loop)},
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

/* ---------- Driving view (v12): a 3D visual layer over the real route ----------
   Routing, ETAs and turn-by-turn still come from Google exactly as before. This only draws what you see:
   - the route (Google) as a glowing lane-width path on the road,
   - the streets, lane counts, turn lanes, sidewalks, crosswalks, street lights and building footprints around it,
     from OpenStreetMap, ONLY where those things are actually mapped. Unknown lane counts get no lane lines;
     no traffic cars are drawn because there's no live vehicle feed.
   Plain WebGL (no library), paused when hidden, 30 fps on phones, calmer motion with reduced-motion on.
   If WebGL isn't available the older flat drawing is used, and the standard map is always there. */
const D3={tried:false,failed:false,active:false,gl:null,cv:null,prog:null,sky:null,meshes:[],dyn:{},route:null,org:null,
  rp:[],rc:[],off:[],chunks:[],osm:{roads:[],ids:new Set(),nodeUse:new Map(),grid:new Map(),lamps:[]},busy:false,status:"",
  get ok(){return D3.active},prefetch(){if(D3.active&&D3.route!==G.route)D3.setRoute()},
  dispS:0,lastT:0,lastDraw:0,carB:null,camB:null,stepK:-1,need:true,
  pal(){const L=THEME.cur==="light",rc=ROUTE_COLOR();return L?
    {sky:["#cfcbe0","#f4eee9"],fog:"#f4eee9",ground:"#e3e1ea",curb:"#c4c0cf",road:"#a7a4b3",walk:"#cfccd8",mark:"#ffffff",markA:.9,center:"#ffffff",wall:"#f2f0f6",roof:"#e1dee9",edge:rc,edgeA:.2,route:rc,routeHi:"#b99bff",chev:"#ffffff",lamp:"#ffd9b0",light:true}:
    {sky:["#050507","#26160f"],fog:"#26160f",ground:"#0d0c0f",curb:"#36313b",road:"#1b1a1f",walk:"#26242b",mark:"#efe6dc",markA:.55,center:"#f2d6bb",wall:"#d08b6c",roof:"#f2b595",edge:"#ffd6bf",edgeA:.55,route:"#a58bff",routeHi:"#dcd0ff",chev:"#f1ecff",lamp:"#ffcf9e",light:false}},
  /* ---- setup ---- */
  init(){D3.tried=true;const st=$(".dstage");if(!st)return false;
    const cv=document.createElement("canvas");cv.id="dgl";cv.setAttribute("aria-hidden","true");st.insertBefore(cv,st.firstChild);
    let gl=null;try{gl=cv.getContext("webgl",{antialias:true,alpha:false,powerPreference:"high-performance",preserveDrawingBuffer:false})}catch(e){}
    if(!gl){cv.remove();D3.failed=true;return false}
    const sh=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
    const prog=(vs,fs)=>{const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error("link");return p};
    try{
      D3.prog=prog("attribute vec3 p;attribute vec3 n;attribute vec4 c;uniform mat4 uVP;uniform mat4 uM;uniform vec3 uL;uniform float uUnlit;varying vec4 vC;varying vec3 vW;"+
        "void main(){vec4 w=uM*vec4(p,1.0);vW=w.xyz;gl_Position=uVP*w;vec3 nn=normalize(mat3(uM)*n);float d=max(dot(nn,uL),0.0)*0.55+max(dot(nn,vec3(0.0,1.0,0.0)),0.0)*0.12;vC=vec4(c.rgb*mix(0.42+d,1.0,uUnlit),c.a);}",
        "precision mediump float;varying vec4 vC;varying vec3 vW;uniform vec3 uCam;uniform vec3 uFog;uniform vec2 uFR;uniform float uAdd;"+
        "void main(){float f=clamp((distance(vW,uCam)-uFR.x)/(uFR.y-uFR.x),0.0,1.0);f=f*f;gl_FragColor=uAdd>0.5?vec4(vC.rgb,vC.a*(1.0-f)):vec4(mix(vC.rgb,uFog,f),vC.a);}");
      D3.sky=prog("attribute vec2 q;varying float y;void main(){y=q.y;gl_Position=vec4(q,0.9999,1.0);}",
        "precision mediump float;varying float y;uniform vec3 uT;uniform vec3 uH;uniform float uHz;void main(){float t=clamp((y-uHz)/(1.0-uHz),0.0,1.0);gl_FragColor=vec4(mix(uH,uT,pow(t,0.6)),1.0);}");
    }catch(e){console.warn("[Groove Guide] driving view shader",e);cv.remove();D3.failed=true;return false}
    D3.gl=gl;D3.cv=cv;D3.skyBuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,D3.skyBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);
    const P=D3.prog;D3.loc={p:gl.getAttribLocation(P,"p"),n:gl.getAttribLocation(P,"n"),c:gl.getAttribLocation(P,"c")};
    ["uVP","uM","uL","uUnlit","uCam","uFog","uFR","uAdd"].forEach(k=>D3.loc[k]=gl.getUniformLocation(P,k));
    D3.sloc={q:gl.getAttribLocation(D3.sky,"q"),uT:gl.getUniformLocation(D3.sky,"uT"),uH:gl.getUniformLocation(D3.sky,"uH"),uHz:gl.getUniformLocation(D3.sky,"uHz")};
    cv.addEventListener("webglcontextlost",e=>{e.preventDefault();D3.failed=true;D3.active=false;st.classList.remove("d3on")});
    D3.active=true;st.classList.add("d3on");D3.theme=THEME.cur;return true},
  /* ---- math ---- */
  persp(f,a,n,fa){const t=1/Math.tan(f/2),nf=1/(n-fa);return new Float32Array([t/a,0,0,0,0,t,0,0,0,0,(fa+n)*nf,-1,0,0,2*fa*n*nf,0])},
  look(e,c){let zx=e[0]-c[0],zy=e[1]-c[1],zz=e[2]-c[2],l=Math.hypot(zx,zy,zz);zx/=l;zy/=l;zz/=l;let xx=zz,xy=0,xz=-zx;l=Math.hypot(xx,xz)||1;xx/=l;xz/=l;
    const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*e[0]+xy*e[1]+xz*e[2]),-(yx*e[0]+yy*e[1]+yz*e[2]),-(zx*e[0]+zy*e[1]+zz*e[2]),1])},
  mul(a,b){const o=new Float32Array(16);for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+j]*b[i*4+k];o[i*4+j]=s}return o},
  trs(x,y,z,ry){const c=Math.cos(ry),s=Math.sin(ry);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,x,y,z,1])},
  I:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
  col(h,a){h=String(h).replace("#","");const n=parseInt(h.length===3?h.split("").map(x=>x+x).join(""):h,16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255,a==null?1:a]},
  proj(lat,lng){const o=D3.org;return [(lng-o.lng)*o.kx,-(lat-o.lat)*o.ky]},
  /* ---- geometry builders (x, y, z, normal, rgba per vertex) ---- */
  gb(){const a=[];const v=(x,y,z,nx,ny,nz,c)=>a.push(x,y,z,nx,ny,nz,c[0],c[1],c[2],c[3]);
    return {a,v,tri(p,q,r,n,c){v(...p,...n,c);v(...q,...n,c);v(...r,...n,c)},quad(p,q,r,s,n,c){v(...p,...n,c);v(...q,...n,c);v(...r,...n,c);v(...p,...n,c);v(...r,...n,c);v(...s,...n,c)}}},
  clean(P){const o=[];for(const p of P){const l=o[o.length-1];if(!l||Math.hypot(p[0]-l[0],p[1]-l[1])>.25)o.push(p)}return o},
  rights(P){const n=P.length,S=[];for(let i=0;i<n-1;i++){const dx=P[i+1][0]-P[i][0],dz=P[i+1][1]-P[i][1],l=Math.hypot(dx,dz)||1;S.push([-dz/l,dx/l])}
    const R=[];for(let i=0;i<n;i++){if(i===0){R.push(S[0]);continue}if(i===n-1){R.push(S[n-2]);continue}const a=S[i-1],b=S[i];let mx=a[0]+b[0],mz=a[1]+b[1];const l=Math.hypot(mx,mz)||1;mx/=l;mz/=l;const k=1/Math.max(.55,mx*b[0]+mz*b[1]);R.push([mx*k,mz*k])}return R},
  ribbon(g,P,hw,y,c,off,offArr){P=D3.clean(P);if(P.length<2)return;const R=D3.rights(P);
    for(let i=0;i<P.length-1;i++){const o0=offArr?offArr[i]:(off||0),o1=offArr?offArr[i+1]:(off||0),a=P[i],b=P[i+1],ra=R[i],rb=R[i+1];
      g.quad([a[0]+ra[0]*(o0-hw),y,a[1]+ra[1]*(o0-hw)],[b[0]+rb[0]*(o1-hw),y,b[1]+rb[1]*(o1-hw)],[b[0]+rb[0]*(o1+hw),y,b[1]+rb[1]*(o1+hw)],[a[0]+ra[0]*(o0+hw),y,a[1]+ra[1]*(o0+hw)],[0,1,0],c)}},
  cumOf(P){const c=[0];for(let i=1;i<P.length;i++)c.push(c[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]));return c},
  at(P,C,s){let lo=0,hi=C.length-1;if(s<=0)return {p:P[0],i:0,t:0};if(s>=C[hi])return {p:P[hi],i:Math.max(0,hi-1),t:1};while(hi-lo>1){const m=(lo+hi)>>1;if(C[m]<=s)lo=m;else hi=m}
    const t=(s-C[lo])/((C[lo+1]-C[lo])||1);return {p:[P[lo][0]+(P[lo+1][0]-P[lo][0])*t,P[lo][1]+(P[lo+1][1]-P[lo][1])*t],i:lo,t}},
  dashes(g,P,off,dash,gap,w,y,c,skip){P=D3.clean(P);if(P.length<2)return;const C=D3.cumOf(P),L=C[C.length-1];
    for(let s=gap*.5;s+dash<L;s+=dash+gap){const a=D3.at(P,C,s),b=D3.at(P,C,s+dash);if(skip&&skip((a.p[0]+b.p[0])/2,(a.p[1]+b.p[1])/2))continue;
      const dx=b.p[0]-a.p[0],dz=b.p[1]-a.p[1],l=Math.hypot(dx,dz)||1,rx=-dz/l,rz=dx/l,h=w/2;
      g.quad([a.p[0]+rx*(off-h),y,a.p[1]+rz*(off-h)],[b.p[0]+rx*(off-h),y,b.p[1]+rz*(off-h)],[b.p[0]+rx*(off+h),y,b.p[1]+rz*(off+h)],[a.p[0]+rx*(off+h),y,a.p[1]+rz*(off+h)],[0,1,0],c)}},
  disc(g,x,z,rx,rz,y,c,cEdge,seg){seg=seg||24;for(let i=0;i<seg;i++){const a=i/seg*6.2832,b=(i+1)/seg*6.2832;g.v(x,y,z,0,1,0,c);g.v(x+Math.cos(a)*rx,y,z+Math.sin(a)*rz,0,1,0,cEdge||c);g.v(x+Math.cos(b)*rx,y,z+Math.sin(b)*rz,0,1,0,cEdge||c)}},
  box(g,x0,x1,y0,y1,z0,z1,c,top){const F=[[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],[[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1]],[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]],[[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0]],[[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0]]];
    F.forEach((f,i)=>g.quad(f[0],f[1],f[2],f[3],f[4],i===4&&top?top:c))},
  earcut(P){const n=P.length;if(n<3)return [];let A=0;for(let i=0;i<n;i++){const a=P[i],b=P[(i+1)%n];A+=a[0]*b[1]-b[0]*a[1]}let idx=[...Array(n).keys()];if(A<0)idx.reverse();
    const cr=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),inT=(p,a,b,c)=>cr(a,b,p)>=0&&cr(b,c,p)>=0&&cr(c,a,p)>=0;const out=[];let g=0;
    while(idx.length>3&&g++<4000){let ok=false;for(let i=0;i<idx.length;i++){const ia=idx[(i+idx.length-1)%idx.length],ib=idx[i],ic=idx[(i+1)%idx.length],a=P[ia],b=P[ib],c=P[ic];if(cr(a,b,c)<=1e-9)continue;
        let bad=false;for(const j of idx){if(j===ia||j===ib||j===ic)continue;if(inT(P[j],a,b,c)){bad=true;break}}if(bad)continue;out.push([ia,ib,ic]);idx.splice(i,1);ok=true;break}if(!ok)break}
    if(idx.length===3)out.push(idx);return out},
  /* ---- GPU meshes ---- */
  mesh(arr,o){const gl=D3.gl;if(!arr.length)return null;const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STATIC_DRAW);
    return Object.assign({b,n:arr.length/10,mode:gl.TRIANGLES,pass:"o",unlit:1,m:null,tag:""},o)},
  add(m){if(m)D3.meshes.push(m);return m},
  drop(tag){const gl=D3.gl;D3.meshes=D3.meshes.filter(m=>{if(m.tag===tag){gl.deleteBuffer(m.b);return false}return true})},
  dynSet(k,arr,o){const gl=D3.gl;let m=D3.dyn[k];if(!m){m=D3.dyn[k]=Object.assign({b:gl.createBuffer(),n:0,mode:gl.TRIANGLES,pass:"+",unlit:1,m:null},o)}gl.bindBuffer(gl.ARRAY_BUFFER,m.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.DYNAMIC_DRAW);m.n=arr.length/10;return m},
  /* ---- route ---- */
  setRoute(){const r=G.route;D3.route=r;D3.meshes.forEach(m=>D3.gl.deleteBuffer(m.b));D3.meshes=[];D3.osm={roads:[],ids:new Set(),nodeUse:new Map(),grid:new Map(),lamps:[]};D3.chunks=[];D3.stepK=-1;D3.carB=null;D3.camB=null;D3.dispS=0;D3.status="";
    const base=r&&r.path&&r.path.length>1?r.path[0]:(G.pos||CFG.defaultCenter);D3.org={lat:base.lat,lng:base.lng,kx:111320*Math.cos(base.lat*Math.PI/180),ky:110540};
    if(r&&r.path&&r.path.length>1){D3.rp=D3.clean(r.path.map(p=>D3.proj(p.lat,p.lng)));D3.rc=D3.cumOf(D3.rp);D3.scale=r.len/(D3.rc[D3.rc.length-1]||1);D3.off=D3.rp.map(()=>0);
      const L=D3.rc[D3.rc.length-1];for(let s=0;s<L;s+=1100)D3.chunks.push({s0:s,s1:Math.min(L,s+1250),st:0})}
    else{D3.rp=[];D3.rc=[];D3.off=[];D3.chunks=G.pos?[{pos:true,st:0}]:[]}
    D3.buildStatic();D3.buildRoute();D3.need=true},
  sOf(){/* distance along OUR local path that matches the nav distance along Google's path */return G.nav?G.nav.s/(D3.scale||1):0},
  /* ---- OpenStreetMap corridor (fetched straight from the browser, only around the route) ---- */
  async pump(){if(D3.busy)return;const s=D3.dispS,ch=D3.chunks.find(c=>!c.st&&(c.pos||c.s1>s-200&&c.s0<s+2600));if(!ch)return;D3.busy=true;ch.st=1;
    let ll;if(ch.pos){const p=G.pos;ll=p.lat.toFixed(6)+","+p.lng.toFixed(6);ch.r=[260,260,120]}
    else{const pts=[];for(let k=ch.s0;k<=ch.s1;k+=45){const a=D3.at(D3.rp,D3.rc,k).p;pts.push(D3.unproj(a))}const e=D3.at(D3.rp,D3.rc,ch.s1).p;pts.push(D3.unproj(e));ll=pts.map(q=>q[0].toFixed(6)+","+q[1].toFixed(6)).join(",")}
    const R=ch.pos?[260,260,120]:[70,150,60];
    const q='[out:json][timeout:25];(way(around:'+R[0]+','+ll+')["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|footway)$"];way(around:'+R[1]+','+ll+')["building"];node(around:'+R[2]+','+ll+')["highway"="street_lamp"];);out body geom qt;';
    D3.status=D3.status||"loading";let j=null;
    for(const u of ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"]){try{const r=await fetch(u,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"data="+encodeURIComponent(q)});if(r.ok){j=await r.json();break}}catch(e){}}
    D3.busy=false;if(D3.route!==G.route&&!ch.pos)return;
    if(!j){ch.st=0;ch.fail=(ch.fail||0)+1;if(ch.fail>2){ch.st=2;D3.status=D3.osm.roads.length?"ok":"fail"}D3.note();return}
    ch.st=2;D3.ingest(j,D3.chunks.indexOf(ch));D3.status="ok";D3.note();D3.need=true},
  unproj(p){const o=D3.org;return [o.lat-p[1]/o.ky,o.lng+p[0]/o.kx]},
  ROADW:{motorway:11,trunk:10,primary:9,secondary:8,tertiary:7,unclassified:6,residential:6,living_street:5,service:3.6},
  ingest(j,ci){const P=D3.pal(),pc=D3.col,tag="c"+ci,els=j.elements||[],O=D3.osm;
    const roads=[],walks=[],cross=[],blds=[];
    for(const e of els){if(e.type==="node"&&e.tags&&e.tags.highway==="street_lamp"){if(!O.ids.has("n"+e.id)){O.ids.add("n"+e.id);O.lamps.push(D3.proj(e.lat,e.lon))}continue}
      if(e.type!=="way"||!e.geometry||O.ids.has("w"+e.id))continue;const t=e.tags||{};
      if(t.highway==="footway"){if(t.footway==="sidewalk"){O.ids.add("w"+e.id);walks.push(e)}else if(t.footway==="crossing"){O.ids.add("w"+e.id);cross.push(e)}continue}
      if(t.highway){if(t.highway==="service"&&/parking_aisle|driveway|drive-through/.test(t.service||""))continue;if(t.area==="yes")continue;O.ids.add("w"+e.id);roads.push(e);(e.nodes||[]).forEach(n=>O.nodeUse.set(n,(O.nodeUse.get(n)||0)+1));continue}
      if(t.building){O.ids.add("w"+e.id);blds.push(e)}}
    const gC=D3.gb(),gR=D3.gb(),gM=D3.gb(),gW=D3.gb(),gB=D3.gb(),gE=D3.gb(),gL=D3.gb(),gLo=D3.gb();
    const cCurb=pc(P.curb),cRoad=pc(P.road),cWalk=pc(P.walk),cMark=pc(P.mark,P.markA),cCen=pc(P.center,P.markA+.1),cEdge=pc(P.mark,P.markA*.6);
    for(const e of roads){const t=e.tags,pts=e.geometry.map(g=>D3.proj(g.lat,g.lon));const W=D3.roadW(t),one=t.oneway==="yes"||t.oneway==="1"||/motorway/.test(t.highway)||t.junction==="roundabout";
      const rd={id:e.id,pts,W,one,t,nodes:e.nodes||[]};O.roads.push(rd);D3.index(rd);
      D3.ribbon(gC,pts,W/2+.35,.02,cCurb);D3.ribbon(gR,pts,W/2,.04,cRoad);
      /* intersections: no paint inside them */
      const X=[];(e.nodes||[]).forEach((n,i)=>{if((O.nodeUse.get(n)||0)>1&&e.geometry[i])X.push(pts[i])});const near=(x,z)=>X.some(q=>Math.hypot(q[0]-x,q[1]-z)<Math.max(9,W*.9));
      if(W>=5){D3.dashes(gM,pts,-(W/2-.35),12,.0001,.12,.06,cEdge,near);D3.dashes(gM,pts,W/2-.35,12,.0001,.12,.06,cEdge,near)}
      const L=parseInt(t.lanes);if(L>1&&L<12){const lw=(W-.6)/L;
        if(one){for(let k=1;k<L;k++)D3.dashes(gM,pts,-(W-.6)/2+k*lw,3,6,.13,.06,cMark,near)}
        else{const fw=parseInt(t["lanes:forward"]),bw=parseInt(t["lanes:backward"]);let split=null;if(fw>0&&bw>0&&fw+bw<=L)split=bw;else if(L%2===0)split=L/2;
          if(split!=null){const c0=-(W-.6)/2+split*lw;D3.dashes(gM,pts,c0-.12,12,.0001,.12,.06,cCen,near);D3.dashes(gM,pts,c0+.12,12,.0001,.12,.06,cCen,near);
            for(let k=1;k<L;k++)if(k!==split)D3.dashes(gM,pts,-(W-.6)/2+k*lw,3,6,.13,.06,cMark,near)}
          else D3.dashes(gM,pts,0,12,.0001,.12,.06,cCen,near)}}
      if(/^(both|left|right)$/.test(t.sidewalk||"")&&W>=5){if(t.sidewalk!=="right")D3.ribbon(gW,pts,.9,.03,cWalk,-(W/2+1.5));if(t.sidewalk!=="left")D3.ribbon(gW,pts,.9,.03,cWalk,W/2+1.5)}}
    for(const e of walks)D3.ribbon(gW,e.geometry.map(g=>D3.proj(g.lat,g.lon)),.9,.03,cWalk);
    for(const e of cross){const pts=D3.clean(e.geometry.map(g=>D3.proj(g.lat,g.lon)));if(pts.length<2)continue;const C=D3.cumOf(pts),Lc=C[C.length-1];
      for(let s=.4;s<Lc-.3;s+=.9){const a=D3.at(pts,C,s),b=D3.at(pts,C,s+.45),dx=b.p[0]-a.p[0],dz=b.p[1]-a.p[1],l=Math.hypot(dx,dz)||1,rx=-dz/l*1.5,rz=dx/l*1.5;
        gM.quad([a.p[0]-rx,.065,a.p[1]-rz],[b.p[0]-rx,.065,b.p[1]-rz],[b.p[0]+rx,.065,b.p[1]+rz],[a.p[0]+rx,.065,a.p[1]+rz],[0,1,0],pc(P.mark,P.markA*.9))}}
    const cWall=pc(P.wall),cRoof=pc(P.roof),cE=pc(P.edge,P.edgeA);
    for(const e of blds){let pts=e.geometry.map(g=>D3.proj(g.lat,g.lon));if(pts.length>3&&Math.hypot(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1])<.5)pts.pop();if(pts.length<3)continue;
      const t=e.tags;let h=parseFloat(t.height);if(!(h>2))h=parseFloat(t["building:levels"])*3.2+1;if(!(h>2))h=t.building==="house"||t.building==="garage"?6:t.building==="apartments"?14:9;h=Math.min(h,320);
      let cx=0,cz=0;pts.forEach(p=>{cx+=p[0];cz+=p[1]});cx/=pts.length;cz/=pts.length;
      for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];let nx=b[1]-a[1],nz=-(b[0]-a[0]);const l=Math.hypot(nx,nz)||1;nx/=l;nz/=l;if(nx*((a[0]+b[0])/2-cx)+nz*((a[1]+b[1])/2-cz)<0){nx=-nx;nz=-nz}
        gB.quad([a[0],0,a[1]],[b[0],0,b[1]],[b[0],h,b[1]],[a[0],h,a[1]],[nx,0,nz],cWall);gE.v(a[0],h,a[1],0,1,0,cE);gE.v(b[0],h,b[1],0,1,0,cE)}
      for(const [i,k,m] of D3.earcut(pts))gB.tri([pts[i][0],h,pts[i][1]],[pts[k][0],h,pts[k][1]],[pts[m][0],h,pts[m][1]],[0,1,0],cRoof)}
    const gl=D3.gl;
    D3.add(D3.mesh(gC.a,{tag,pass:"o"}));D3.add(D3.mesh(gW.a,{tag,pass:"o"}));D3.add(D3.mesh(gR.a,{tag,pass:"o"}));D3.add(D3.mesh(gB.a,{tag,pass:"o",unlit:0}));
    D3.add(D3.mesh(gM.a,{tag,pass:"a"}));D3.add(D3.mesh(gE.a,{tag,pass:"+",mode:gl.LINES}));
    D3.lampsBuild();D3.fitRoute();D3.buildLanes(true)},
  roadW(t){const w=parseFloat(t.width);if(w>2.5&&w<40)return w;const l=parseInt(t.lanes);if(l>0&&l<12)return l*3.3+.6;const k=String(t.highway).replace("_link","");return /_link/.test(t.highway)?5:(D3.ROADW[k]||6)},
  index(rd){for(let i=0;i<rd.pts.length-1;i++){const a=rd.pts[i],b=rd.pts[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/20));
    for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,key=Math.floor(x/30)+","+Math.floor(z/30);let L=D3.osm.grid.get(key);if(!L)D3.osm.grid.set(key,L=[]);const it=[rd,i];if(!L.some(q=>q[0]===rd&&q[1]===i))L.push(it)}}},
  /* the mapped road you're on: nearest segment that points the same way you're going */
  nearRoad(x,z,dx,dz){let best=null,bd=1e9;const gx=Math.floor(x/30),gz=Math.floor(z/30);
    for(let i=-1;i<=1;i++)for(let k=-1;k<=1;k++){const L=D3.osm.grid.get((gx+i)+","+(gz+k));if(!L)continue;
      for(const [rd,s] of L){const a=rd.pts[s],b=rd.pts[s+1],ex=b[0]-a[0],ez=b[1]-a[1],l2=ex*ex+ez*ez||1,t=clamp(((x-a[0])*ex+(z-a[1])*ez)/l2,0,1),d=Math.hypot(a[0]+ex*t-x,a[1]+ez*t-z);
        const al=(ex*dx+ez*dz)/(Math.sqrt(l2)*(Math.hypot(dx,dz)||1));const sc=d+(1-Math.abs(al))*25;if(sc<bd&&d<14){bd=sc;best={rd,dir:al>=0?1:-1,d}}}}return best},
  /* keep the route path on your side of two-way streets (center of the right half); centered on one-ways */
  fitRoute(){if(!D3.rp.length)return;const P=D3.rp,o=[];for(let i=0;i<P.length;i++){const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)],m=D3.nearRoad(P[i][0],P[i][1],b[0]-a[0],b[1]-a[1]);o.push(m&&!m.rd.one?Math.min(m.rd.W/4,2.6):0)}
    const sm=o.map((_,i)=>{let s=0,n=0;for(let k=-4;k<=4;k++){const v=o[i+k];if(v!=null){s+=v;n++}}return s/n});D3.off=sm;D3.buildRoute()},
  buildStatic(){const P=D3.pal(),g=D3.gb();const c=D3.col(P.ground);g.quad([-4000,0,-4000],[4000,0,-4000],[4000,0,4000],[-4000,0,4000],[0,1,0],c);D3.drop("ground");D3.add(D3.mesh(g.a,{tag:"ground",pass:"o",follow:true}));D3.buildCar()},
  buildRoute(){D3.drop("route");if(D3.rp.length<2)return;const P=D3.pal(),g=D3.gb(),ga=D3.gb(),gl=D3.gb(),pc=D3.col;
    ga.a.length=0;D3.ribbon(ga,D3.rp,1.55,.075,pc(P.route,P.light?.22:.26),0,D3.off);
    D3.ribbon(g,D3.rp,.11,.085,pc(P.routeHi,.95),0,D3.off.map(o=>o-1.5));D3.ribbon(g,D3.rp,.11,.085,pc(P.routeHi,.95),0,D3.off.map(o=>o+1.5));
    D3.ribbon(gl,D3.rp,2.6,.07,pc(P.route,P.light?.10:.13),0,D3.off);
    D3.add(D3.mesh(gl.a,{tag:"route",pass:"+"}));D3.add(D3.mesh(ga.a,{tag:"route",pass:"a"}));D3.add(D3.mesh(g.a,{tag:"route",pass:"+"}))},
  lampsBuild(){D3.drop("lamps");const P=D3.pal(),g=D3.gb(),gg=D3.gb(),pc=D3.col,cp=pc(P.light?"#8d899a":"#3b3742"),cg=pc(P.lamp,P.light?.18:.32),cg0=pc(P.lamp,0),cp2=pc(P.lamp,P.light?.08:.13);
    for(const [x,z] of D3.osm.lamps){D3.box(g,x-.08,x+.08,0,6.2,z-.08,z+.08,cp);D3.box(g,x-.25,x+.25,6.1,6.3,z-.25,z+.25,cp,pc(P.lamp));
      D3.disc(gg,x,z,7,7,.05,cp2,cg0,20);gg.quad([x-.9,5.4,z],[x+.9,5.4,z],[x+.9,7,z],[x-.9,7,z],[0,0,1],cg);gg.quad([x,5.4,z-.9],[x,5.4,z+.9],[x,7,z+.9],[x,7,z-.9],[1,0,0],cg)}
    D3.add(D3.mesh(g.a,{tag:"lamps",pass:"o",unlit:0}));D3.add(D3.mesh(gg.a,{tag:"lamps",pass:"+"}))},
  /* the car, seen from behind: model space has forward = -z */
  buildCar(){["car","carfx"].forEach(D3.drop);const P=D3.pal(),pc=D3.col,g=D3.gb(),fx=D3.gb(),body=pc(D.vehicle.color||"#c9ccd3"),glass=pc(P.light?"#2a2f3a":"#0c0f15"),dark=pc("#0b0b0d"),tl=pc("#ff4f2e"),
      wide=/truck|suv|van/.test(D.vehicle.type||""),w=wide?.98:.92,L=wide?2.45:2.3;
    D3.box(g,-w,w,.32,.98,-L,L,body);D3.box(g,-w-.02,w+.02,.28,.5,-L-.02,L+.02,pc(P.light?"#3a3a44":"#141418"));
    const cab=(x0,x1,y0,z0,z1,tx0,tx1,y1,tz0,tz1)=>{const A=[[x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[x0,y0,z0]],B=[[tx0,y1,tz1],[tx1,y1,tz1],[tx1,y1,tz0],[tx0,y1,tz0]];
      for(let i=0;i<4;i++){const j=(i+1)%4,e1=[B[i][0]-A[i][0],B[i][1]-A[i][1],B[i][2]-A[i][2]],e2=[A[j][0]-A[i][0],A[j][1]-A[i][1],A[j][2]-A[i][2]];let n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];const l=Math.hypot(...n)||1;n=n.map(v=>-v/l);g.quad(A[i],A[j],B[j],B[i],n,glass)}
      g.quad(B[0],B[1],B[2],B[3],[0,1,0],body)};
    cab(-w*.93,w*.93,.98,-1.05*(L/2.3),1.3*(L/2.3),-w*.72,w*.72,wide?1.72:1.48,-.45,.95*(L/2.3));
    [[-1,-1.45],[1,-1.45],[-1,1.45],[1,1.45]].forEach(([sx,sz])=>D3.box(g,sx<0?-w-.06:w-.12,sx<0?-w+.12:w+.06,0,.66,sz*(L/2.3)-.34,sz*(L/2.3)+.34,dark));
    D3.box(g,-w+.04,-w*.45,.74,.84,L,L+.03,tl);D3.box(g,w*.45,w-.04,.74,.84,L,L+.03,tl);D3.box(g,-w*.45,w*.45,.77,.8,L,L+.025,pc("#ff6a3d",.95));
    D3.disc(fx,0,0,w*1.45,L*1.22,.012,pc("#000000",P.light?.22:.5),pc("#000000",0),28);
    const gfx=D3.gb();if(!P.light)D3.disc(gfx,0,0,w*1.9,L*1.45,.02,pc(P.route,.16),pc(P.route,0),28);
    {const a0=pc("#ff5a36",0),a1=pc("#ff5a36",P.light?.16:.3),z=L+.08,X=w*1.25;[[.5,.79,a0,a1],[.79,1.08,a1,a0]].forEach(([y0,y1,c0,c1])=>{gfx.v(-X,y0,z,0,0,1,c0);gfx.v(X,y0,z,0,0,1,c0);gfx.v(X,y1,z,0,0,1,c1);gfx.v(-X,y0,z,0,0,1,c0);gfx.v(X,y1,z,0,0,1,c1);gfx.v(-X,y1,z,0,0,1,c1)})}
    D3.add(D3.mesh(g.a,{tag:"car",pass:"o",unlit:0,car:true}));D3.add(D3.mesh(fx.a,{tag:"car",pass:"a",car:true}));D3.add(D3.mesh(gfx.a,{tag:"carfx",pass:"+",car:true}))},
  /* lane guidance: which lanes to be in, from OpenStreetMap turn:lanes, for the next maneuver */
  TOK:{left:["left","sharp_left"],sleft:["slight_left","left","merge_to_left"],right:["right","sharp_right"],sright:["slight_right","right","merge_to_right"],straight:["through"],uturn:["reverse","left"],merge:["through","merge_to_left","merge_to_right"],round:["through","left","right","slight_right","slight_left"]},
  ICON:{left:"TURN_LEFT",sharp_left:"TURN_SHARP_LEFT",slight_left:"TURN_SLIGHT_LEFT",through:"STRAIGHT",right:"TURN_RIGHT",sharp_right:"TURN_SHARP_RIGHT",slight_right:"TURN_SLIGHT_RIGHT",reverse:"UTURN_LEFT",merge_to_left:"MERGE",merge_to_right:"MERGE",none:"STRAIGHT","":"STRAIGHT"},
  laneInfo(){const r=G.route,n=G.nav;if(!r||!D3.rp.length||!D3.osm.roads.length)return null;const k=n?n.step:0,st=r.steps,nx=st[k+1];if(!nx)return null;
    const sm=(st[k]?st[k].endD:r.len)/(D3.scale||1);const s=Math.max(0,sm-30),a=D3.at(D3.rp,D3.rc,s).p,b=D3.at(D3.rp,D3.rc,s+8).p,m=D3.nearRoad(a[0],a[1],b[0]-a[0],b[1]-a[1]);if(!m)return null;
    const t=m.rd.t,raw=t["turn:lanes"]||(m.dir>0?t["turn:lanes:forward"]:t["turn:lanes:backward"]);if(!raw)return null;const lanes=raw.split("|");if(lanes.length<2||lanes.length>10)return null;
    const want=D3.TOK[manKey(nx.maneuver)]||["through"],L=lanes.map(x=>{const tk=x.split(";").map(y=>y.trim());return {dir:D3.ICON[tk[0]]||"STRAIGHT",ok:tk.some(y=>want.includes(y)),tk}});
    if(!L.some(x=>x.ok))return null;return {lanes:L,road:m.rd,dir:m.dir,sm,step:k}},
  buildLanes(force){const li=D3.laneInfo(),key=li?li.step+":"+li.road.id:"";if(!force&&key===D3.laneKey)return;D3.laneKey=key;D3.drop("lanes");D3.drop("mark");
    const r=G.route,P=D3.pal(),pc=D3.col;if(!r||!D3.rp.length)return;const k=G.nav?G.nav.step:0,st=r.steps;
    if(st[k+1]){const sm=(st[k]?st[k].endD:r.len)/(D3.scale||1),p=D3.at(D3.rp,D3.rc,sm).p,g=D3.gb();D3.disc(g,p[0],p[1],4.2,4.2,.1,pc(P.route,.0),pc(P.route,.55),32);D3.disc(g,p[0],p[1],3.4,3.4,.105,pc(P.route,0),pc(P.route,0),32);
      g.quad([p[0]-.25,0,p[1]],[p[0]+.25,0,p[1]],[p[0]+.25,16,p[1]],[p[0]-.25,16,p[1]],[0,0,1],pc(P.route,.18));g.quad([p[0],0,p[1]-.25],[p[0],0,p[1]+.25],[p[0],16,p[1]+.25],[p[0],16,p[1]-.25],[1,0,0],pc(P.route,.18));D3.add(D3.mesh(g.a,{tag:"mark",pass:"+"}))}
    if(!li)return;const rd=li.road,W=rd.W,N=li.lanes.length,two=!rd.one,lw=two?Math.min(3.4,(W/2-.3)/N):(W-.6)/N,g=D3.gb();
    const s0=Math.max(D3.dispS,li.sm-260),s1=li.sm-12;if(s1-s0<10)return;const pts=[];for(let s=s0;s<=s1;s+=6)pts.push(D3.at(D3.rp,D3.rc,s).p);
    li.lanes.forEach((x,i)=>{if(!x.ok)return;const o=two?(i+.5)*lw:-(W-.6)/2+(i+.5)*lw;D3.ribbon(g,pts,lw*.42,.08,pc(P.route,P.light?.16:.2),o)});D3.add(D3.mesh(g.a,{tag:"lanes",pass:"+"}))},
  note(){const n=$("#dnote");if(!n||!D3.active)return;n.textContent=D3.status==="ok"?"":D3.status==="fail"?"Surrounding streets unavailable right now · showing your route":D3.status==="loading"?"Loading the streets around your route…":""},
  /* ---- per frame ---- */
  tick(now){if(D3.failed)return;const st=$(".dstage");const vis=st&&st.offsetParent&&st.clientWidth>40&&st.clientHeight>40&&!document.hidden;
    if(!vis){D3.lastT=now;return}if(!D3.tried&&!D3.init())return;if(!D3.active)return;
    if(D3.theme!==THEME.cur){D3.theme=THEME.cur;D3.setRoute()}if(D3.route!==G.route||(!G.route&&!D3.org)||(!G.route&&G.pos&&!D3.chunks.length))D3.setRoute();if(D3.carColor!==D.vehicle.color+D.vehicle.type){D3.carColor=D.vehicle.color+D.vehicle.type;D3.buildCar()}
    const mob=matchMedia("(pointer:coarse)").matches;if(now-D3.lastDraw<(mob?32:15))return;const dt=Math.min(.1,(now-(D3.lastT||now))/1000);D3.lastT=now;D3.lastDraw=now;
    D3.pump();D3.frame(dt,now)},
  frame(dt,now){const gl=D3.gl,cv=D3.cv,P=D3.pal(),pc=D3.col,dpr=Math.min(devicePixelRatio||1,matchMedia("(pointer:coarse)").matches?1.6:2),W=Math.round(cv.clientWidth*dpr),H=Math.round(cv.clientHeight*dpr);
    if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}
    /* where the car is: glide between GPS fixes along the route instead of jumping */
    let px,pz,hd;if(D3.rp.length>1){const tgt=D3.sOf()+(G.nav&&G.speed?Math.min(G.speed*.6,12)/(D3.scale||1):0);if(Math.abs(tgt-D3.dispS)>120)D3.dispS=tgt;else D3.dispS+=(tgt-D3.dispS)*(1-Math.exp(-dt*(REDUCED?2:3)));
      const s=D3.dispS,a=D3.at(D3.rp,D3.rc,s),o=D3.off.length?D3.off[a.i]+(D3.off[Math.min(a.i+1,D3.off.length-1)]-D3.off[a.i])*a.t:0;
      const f0=D3.at(D3.rp,D3.rc,Math.max(0,s-3)).p,f1=D3.at(D3.rp,D3.rc,s+14).p;hd=Math.atan2(f1[0]-f0[0],-(f1[1]-f0[1]));
      const fx=Math.sin(hd),fz=-Math.cos(hd);px=a.p[0]-fz*o;pz=a.p[1]+fx*o}
    else{const p=G.pos?D3.proj(G.pos.lat,G.pos.lng):[0,0];px=p[0];pz=p[1];hd=(G.heading||0)*Math.PI/180}
    const wrap=x=>{while(x>Math.PI)x-=2*Math.PI;while(x<-Math.PI)x+=2*Math.PI;return x};
    if(D3.carB==null)D3.carB=hd;D3.carB=wrap(D3.carB+wrap(hd-D3.carB)*(1-Math.exp(-dt*5)));if(D3.camB==null)D3.camB=D3.carB;D3.camB=wrap(D3.camB+wrap(D3.carB-D3.camB)*(1-Math.exp(-dt*(REDUCED?1.6:2.4))));
    const narrow=cv.clientWidth<cv.clientHeight*.9,cx=Math.sin(D3.camB),cz=-Math.cos(D3.camB),back=narrow?11:12,up=narrow?5.2:4.6,ahead=narrow?15:17,ty=narrow?0:.3;
    const eye=[px-cx*back,up,pz-cz*back],tgt=[px+cx*ahead,ty,pz+cz*ahead],V=D3.look(eye,tgt),Pm=D3.persp((narrow?62:52)*Math.PI/180,W/H,.4,900),VP=D3.mul(Pm,V);
    if(D3.stepK!==(G.nav?G.nav.step:0)){D3.stepK=G.nav?G.nav.step:0;D3.buildLanes(true);paintNext()}
    /* chevrons gliding along the route ahead */
    if(D3.rp.length>1){const g=D3.gb(),c=pc(P.chev,P.light?.75:.8),ph=REDUCED?0:(now/1000*7)%9,L=D3.rc[D3.rc.length-1];
      for(let s=D3.dispS+6+ph;s<Math.min(L,D3.dispS+150);s+=9){const a=D3.at(D3.rp,D3.rc,s),b=D3.at(D3.rp,D3.rc,s+1).p,o=D3.off[a.i]||0,dx=b[0]-a.p[0],dz=b[1]-a.p[1],l=Math.hypot(dx,dz)||1,fx=dx/l,fz=dz/l,rx=-fz,rz=fx;
        const q=[a.p[0]+rx*o,a.p[1]+rz*o],fade=1-clamp((s-D3.dispS-90)/60,0,1),cc=[c[0],c[1],c[2],c[3]*fade];
        const pt=(f,r)=>[q[0]+fx*f+rx*r,.09,q[1]+fz*f+rz*r];g.quad(pt(.9,0),pt(-.1,-1.05),pt(-.55,-1.05),pt(.45,0),[0,1,0],cc);g.quad(pt(.9,0),pt(.45,0),pt(-.55,1.05),pt(-.1,1.05),[0,1,0],cc)}
      D3.dynSet("chev",g.a,{pass:"+"})}else D3.dynSet("chev",[],{pass:"+"});
    /* draw */
    gl.viewport(0,0,W,H);const fog=pc(P.fog);gl.clearColor(fog[0],fog[1],fog[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(D3.sky);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindBuffer(gl.ARRAY_BUFFER,D3.skyBuf);gl.enableVertexAttribArray(D3.sloc.q);gl.vertexAttribPointer(D3.sloc.q,2,gl.FLOAT,false,0,0);
    const t0=pc(P.sky[0]),h0=pc(P.sky[1]);gl.uniform3f(D3.sloc.uT,t0[0],t0[1],t0[2]);gl.uniform3f(D3.sloc.uH,h0[0],h0[1],h0[2]);gl.uniform1f(D3.sloc.uHz,((up-ty)/(back+ahead))/Math.tan((narrow?62:52)*Math.PI/360)-.04);gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(D3.sloc.q);
    const Lc=D3.loc;gl.useProgram(D3.prog);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.uniformMatrix4fv(Lc.uVP,false,VP);gl.uniform3f(Lc.uCam,eye[0],eye[1],eye[2]);gl.uniform3f(Lc.uFog,fog[0],fog[1],fog[2]);gl.uniform2f(Lc.uFR,P.light?140:110,P.light?620:520);
    const ld=[-.35,.85,.4],ll=Math.hypot(...ld);gl.uniform3f(Lc.uL,ld[0]/ll,ld[1]/ll,ld[2]/ll);
    const carM=D3.trs(px,0,pz,-D3.carB),gM=D3.trs(px,0,pz,0),all=D3.meshes.concat(Object.values(D3.dyn));
    [Lc.p,Lc.n,Lc.c].forEach(x=>gl.enableVertexAttribArray(x));
    for(const pass of ["o","a","+"]){if(pass==="o"){gl.disable(gl.BLEND);gl.depthMask(true)}else{gl.enable(gl.BLEND);gl.depthMask(false);if(pass==="a")gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);else gl.blendFunc(gl.SRC_ALPHA,gl.ONE)}
      gl.uniform1f(Lc.uAdd,pass==="+"?1:0);
      for(const m of all){if(m.pass!==pass||!m.n)continue;gl.bindBuffer(gl.ARRAY_BUFFER,m.b);gl.vertexAttribPointer(Lc.p,3,gl.FLOAT,false,40,0);gl.vertexAttribPointer(Lc.n,3,gl.FLOAT,false,40,12);gl.vertexAttribPointer(Lc.c,4,gl.FLOAT,false,40,24);
        gl.uniformMatrix4fv(Lc.uM,false,m.car?carM:m.follow?gM:D3.I);gl.uniform1f(Lc.uUnlit,m.unlit);gl.drawArrays(m.mode,0,m.n)}}
    gl.depthMask(true)}
};
/* lane chips under the turn banner / in the driving panel use the same OpenStreetMap turn lanes */
LANES.provider=()=>{const li=D3.active?D3.laneInfo():null;return li?{lanes:li.lanes}:null};
window.__D3=D3; /* debug handle for tests */

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
const CATS=[["live","Grooveville Live","music",null,"Upcoming Grooveville events. Tap Go for directions.","#ff9f68"],["vybr8","VYBR8 Eats","food",["restaurant"],"Restaurants near you. Restaurant details come from VYBR8 as it grows.","#F4A987"],["coffee","Coffee","coffee",["cafe","coffee_shop"],"","#e8c27a"],["night","Nightlife","music",["bar","night_club"],"","#b7a1e5"],
  ["pathd","PATHD Work","work",null,"Your work and interview places.","#68d4d0"],["gas","Gas","gas",["gas_station"],"","#c9e27a"],["ev","EV charging","bolt",["electric_vehicle_charging_station"],"","#68d4d0"],["park","Parks","park",["park"],"","#9fd3c7"],["shop","Shopping","bag",["shopping_mall","clothing_store"],"","#f2c48f"]];
function pExplore(){
  return head("Explore","Find your next stop.","Real places around you, Grooveville events and your ecosystem shortcuts.")+
    '<div class="cats">'+CATS.map(([k,l,i,,,c])=>'<button class="cat gl'+(EXP.cat===k?" on":"")+'" data-a="cat" data-k="'+k+'" style="--pc:'+c+'">'+ico(i,24)+'<b>'+l+'</b></button>').join("")+
    '<div class="cat gl dim" style="--pc:#b7a1e5" title="Coming later">'+ico("crown",24)+'<b>Shadow Crown</b><small>Opt-in game spots, later</small></div></div>'+
    '<div id="exr" class="exr">'+exploreBody()+'</div>';
}
function exploreBody(){if(!EXP.cat)return '<div class="empty">Pick a category to see places near '+(G.pos?"you":"Charlotte")+'.</div>';const C=CATS.find(c=>c[0]===EXP.cat);
  if(EXP.loading)return '<div class="empty">Looking around…</div>';if(EXP.err)return '<div class="empty">'+esc(EXP.err)+'</div>';
  const L=EXP.items||[];if(EXP.cat==="live")return '<p class="muted" style="margin-bottom:12px">'+esc(C[4])+'</p>'+liveBody(L);return (C[4]?'<p class="muted" style="margin-bottom:12px">'+esc(C[4])+'</p>':'')+(L.length?'<div class="plist grid">'+L.map((x,i)=>'<div class="pcard gl">'+(x.photo?'<img src="'+esc(x.photo)+'" alt="" loading="lazy">':'<span class="pph" style="--pc:'+C[5]+'">'+ico(C[2],30)+'</span>')+'<div class="pcb"><b>'+esc(x.name)+'</b><small>'+esc([x.type,x.rating?"★ "+x.rating+(x.count?" ("+x.count+")":""):"",x.dist!=null?fmtDist(x.dist):""].filter(Boolean).join(" · "))+'</small><small class="muted">'+esc(x.addr||"")+'</small>'+(x.attr?'<small class="attr">Photo: '+esc(x.attr)+'</small>':'')+
    '<div class="row l"><button class="gbtn sm" data-a="exgo" data-i="'+i+'">'+ico("navigate",15)+' Go</button><button class="gbtn ghost sm" data-a="exsave" data-i="'+i+'">'+ico("star",15)+' Save</button></div></div></div>').join("")+'</div>'+(L.some(x=>x.google)?'<p class="attr">Places data © Google</p>':''):'<div class="empty">Nothing found nearby.</div>')}
async function exploreLoad(k){EXP.cat=k;EXP.items=null;EXP.err="";EXP.loading=true;const r=$("#exr");if(r)r.innerHTML=exploreBody();if(r&&isPhone())setTimeout(()=>r.scrollIntoView({behavior:REDUCED?"auto":"smooth",block:"start"}),60);$$(".cat").forEach(b=>b.classList.toggle("on",b.dataset.k===k));
  const C=CATS.find(c=>c[0]===k),center=G.pos||CFG.defaultCenter;
  try{
    if(k==="live"){EXP.items=await liveEvents();MAP.load().catch(()=>{}).then(()=>{EXP.loading=false;const rr=$("#exr");if(rr&&EXP.cat==="live"){rr.innerHTML=exploreBody();liveImages(EXP.items)}});}
    else if(k==="pathd"){EXP.items=D.saved.filter(s=>s.kind==="work").map(s=>Object.assign({},s,{type:"Work",dist:G.pos?hav(G.pos,s):null}));if(!EXP.items.length)EXP.err="Save your work address (Work button at the top) and interview spots here. PATHD job locations will appear as PATHD connects."}
    else{await MAP.load();const {Place,SearchNearbyRankPreference}=MAP.libs.places;
      const {places}=await Place.searchNearby({fields:["id","displayName","location","formattedAddress","rating","userRatingCount","primaryTypeDisplayName","photos"],locationRestriction:{center,radius:6000},includedPrimaryTypes:C[3],maxResultCount:12,rankPreference:SearchNearbyRankPreference?SearchNearbyRankPreference.POPULARITY:undefined});
      EXP.items=(places||[]).map(p=>{const ph=p.photos&&p.photos[0];return {google:true,name:p.displayName,lat:p.location.lat(),lng:p.location.lng(),placeId:p.id,addr:p.formattedAddress,rating:p.rating,count:p.userRatingCount,type:p.primaryTypeDisplayName||"",
        photo:ph&&ph.getURI?ph.getURI({maxWidth:480}):"",attr:ph&&ph.authorAttributions&&ph.authorAttributions[0]?ph.authorAttributions[0].displayName:"",dist:G.pos?hav(G.pos,{lat:p.location.lat(),lng:p.location.lng()}):null,kind:k==="vybr8"?"restaurant":"favorite"}})}
  }catch(e){EXP.err=MAP.failed||MAPERR.code?diagText(MAP.failed||MAPERR.code)[0]+". "+diagText(MAP.failed||MAPERR.code)[1]:placesErr(e)}
  EXP.loading=false;const r2=$("#exr");if(r2)r2.innerHTML=exploreBody()}
/* Grooveville Live: public events from the back office. Expired dates drop off on their own; repeating events show their next date. */
const EVD={iso:d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"),parse:s=>{const [y,m,d]=String(s).split("-").map(Number);return new Date(y,(m||1)-1,d||1)},
  add(s,n){const d=EVD.parse(s);d.setDate(d.getDate()+n);return EVD.iso(d)},media:{},photos:{}};
function evNth(ds){const d=EVD.parse(ds),dim=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(),n=Math.ceil(d.getDate()/7);return {n,last:d.getDate()+7>dim&&n>=4,wd:d.getDay()}}
function evOcc(e,from,to){const out=[],iso=EVD.iso;if(!e||!e.date)return out;
  if(!e.repeat){if(e.date>=from&&e.date<=to)out.push(e.date);return out}
  const ex=new Set(e.exdates||[]),until=e.until||"9999-12-31",cnt=Number(e.count)||0,start=EVD.parse(e.date);let n=0,guard=0;
  const done=ds=>ds>to||ds>until||(cnt&&n>=cnt)||++guard>5000,push=ds=>{n++;if(ds>=from&&!ex.has(ds))out.push(ds)};
  if(e.repeat==="daily"){for(let d=new Date(start);;d.setDate(d.getDate()+1)){const ds=iso(d);if(done(ds))break;push(ds)}}
  else if(e.repeat==="weekly"||e.repeat==="biweekly"){const step=e.repeat==="biweekly"?2:1,days=((e.days&&e.days.length)?e.days:[start.getDay()]).map(Number).sort((a,b)=>a-b);const wk0=new Date(start);wk0.setDate(wk0.getDate()-wk0.getDay());
    outer:for(let w=0;;w+=step){for(const dw of days){const d=new Date(wk0);d.setDate(d.getDate()+w*7+dw);const ds=iso(d);if(ds<e.date)continue;if(done(ds))break outer;push(ds)}}}
  else if(e.repeat==="monthly"){const day=start.getDate();for(let k=0;;k++){const y=start.getFullYear(),m=start.getMonth()+k,dim=new Date(y,m+1,0).getDate();if(dim<day){if(iso(new Date(y,m,1))>to||++guard>5000)break;continue}const ds=iso(new Date(y,m,day));if(done(ds))break;push(ds)}}
  else if(e.repeat==="monthlyNth"){const ni=evNth(e.date);for(let k=0;;k++){const y=start.getFullYear(),m=start.getMonth()+k;let d;
      if(ni.last){d=new Date(y,m+1,0);while(d.getDay()!==ni.wd)d.setDate(d.getDate()-1)}else{d=new Date(y,m,1);while(d.getDay()!==ni.wd)d.setDate(d.getDate()+1);d.setDate(d.getDate()+7*(ni.n-1));if(d.getMonth()!==new Date(y,m,1).getMonth()){if(iso(new Date(y,m,1))>to||++guard>5000)break;continue}}
      const ds=iso(d);if(done(ds))break;push(ds)}}
  else if(e.repeat==="yearly"){for(let k=0;k<200;k++){const d=new Date(start.getFullYear()+k,start.getMonth(),start.getDate());if(d.getMonth()!==start.getMonth())continue;const ds=iso(d);if(done(ds))break;push(ds)}}
  return out}
const evMin=t=>{const m=/^(\d{1,2}):(\d{2})/.exec(t||"");return m?(+m[1])*60+(+m[2]):null};
/* an occurrence is over after its end time; with no end time, 4 hours after it starts; with no times, at midnight */
function evOver(e,ds){const now=new Date(),td=EVD.iso(now);if(ds>td)return false;if(ds<td){const s=evMin(e.start),en=evMin(e.end);return !(ds===EVD.add(td,-1)&&s!=null&&en!=null&&en<=s&&now.getHours()*60+now.getMinutes()<en)}
  const nm=now.getHours()*60+now.getMinutes(),s=evMin(e.start),en=evMin(e.end);if(en!=null)return en>(s||0)?nm>=en:false;if(s!=null)return nm>=s+240;return false}
function evNext(e){const td=EVD.iso(new Date());const L=evOcc(e,EVD.add(td,-1),EVD.add(td,400));for(const ds of L)if(!evOver(e,ds))return ds;return null}
const evTime=t=>{const m=evMin(t);if(m==null)return "";const h=Math.floor(m/60),mm=m%60;return ((h%12)||12)+(mm?":"+String(mm).padStart(2,"0"):"")+" "+(h<12?"AM":"PM")};
function evRepeat(e){if(!e.repeat)return "";const d=EVD.parse(e.date),wd=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const days=(e.days&&e.days.length?e.days:[d.getDay()]).map(Number).sort().map(x=>wd[x]).join(", ");
  return ({daily:"Every day",weekly:"Every "+days,biweekly:"Every other "+days,monthly:"Monthly",monthlyNth:"Monthly",yearly:"Every year"})[e.repeat]||"Repeats"}
function evWhen(e,ds){const td=EVD.iso(new Date()),d=EVD.parse(ds),diff=Math.round((d-EVD.parse(td))/864e5);
  const badge=diff<=0?"TODAY":diff===1?"TOMORROW":diff<7?"THIS WEEK":"COMING SOON";
  const day=diff<=0?"Today":diff===1?"Tomorrow":d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
  const tm=evTime(e.start)+(e.end?" – "+evTime(e.end):"");return {badge,cls:diff<=0?"today":diff<7?"soon":"later",line:day+(tm?" · "+tm:"")}}
async function liveEvents(){if(!STORE.db)throw new Error("Events can’t load right now. Try again in a moment.");
  const snap=await STORE.db.collection("events").where("visibility","==","public").get();
  return snap.docs.map(d=>Object.assign({id:d.id},d.data())).filter(e=>e.guide!==false&&(e.place||e.location))
    .map(e=>{const ds=evNext(e);return ds?Object.assign(e,{_next:ds}):null}).filter(Boolean)
    .sort((a,b)=>(a._next+(a.start||"")).localeCompare(b._next+(b.start||""))).slice(0,30)
    .map(e=>{const p=e.place||{};return {ev:e,name:p.name||e.title,addr:p.addr||e.location,text:p.addr||e.location,lat:p.lat,lng:p.lng,placeId:p.id,kind:"event"}})}
function liveBody(L){if(!L.length)return '<div class="empty">No upcoming Grooveville events right now. Check back soon.</div>';
  return '<div class="evlist">'+L.map((x,i)=>{const e=x.ev,w=evWhen(e,e._next),rep=evRepeat(e),tl=e.ticket==="rsvp"?"RSVP":e.ticket==="tickets"?"Get tickets":e.ticket==="free"?"Register":"More info";
    return '<article class="evc gl"><div class="evimg noimg" id="evi-'+i+'">'+'<span class="pph" style="--pc:#ff9f68">'+ico("music",34)+'</span>'+'<span class="evbadge '+w.cls+'">'+w.badge+'</span></div>'+
      '<div class="evb">'+(e.group?'<small class="evgrp">'+esc(e.group)+'</small>':'')+'<b class="evt">'+esc(e.title||"")+'</b><span class="evw">'+esc(w.line)+'</span>'+(rep?'<small class="evr">'+esc(rep)+'</small>':'')+
      '<small class="muted">'+esc(x.addr||"")+'</small><small class="attr" id="eva-'+i+'"></small>'+
      '<div class="row l"><button class="gbtn sm" data-a="exgo" data-i="'+i+'">'+ico("navigate",15)+' Go</button>'+(e.link&&/^https?:\/\//i.test(e.link)?'<a class="gbtn ghost sm" href="'+esc(e.link)+'" target="_blank" rel="noopener">'+tl+' ↗</a>':'')+
      '<button class="gbtn ghost sm icon" data-a="exsave" data-i="'+i+'" aria-label="Save place">'+ico("star",15)+'</button></div></div></article>'}).join("")+'</div>'}
/* images: flyer first, then your venue photo, then Google's photo of the venue */
async function liveImages(L){for(let i=0;i<L.length;i++){const e=L[i].ev,box=$("#evi-"+i);if(!box)continue;let src="",flyer=false,attr="";
  try{if(e.hasFlyer||e.hasVenueImg){let m=EVD.media[e.id];if(m===undefined){const s=await STORE.db.collection("eventMedia").doc(e.id).get();m=EVD.media[e.id]=s.exists?s.data():null}
      if(m&&m.flyer){src=m.flyer;flyer=true}else if(m&&m.venue)src=m.venue}
    if(!src&&(e.venueSrc||"google")==="google"&&e.place&&e.place.id&&MAP.libs){let ph=EVD.photos[e.place.id];if(ph===undefined){const pl=new MAP.libs.places.Place({id:e.place.id});await pl.fetchFields({fields:["photos"]});const f=pl.photos&&pl.photos[0];ph=EVD.photos[e.place.id]=f?{u:f.getURI({maxWidth:720}),a:(f.authorAttributions&&f.authorAttributions[0]&&f.authorAttributions[0].displayName)||""}:null}
      if(ph){src=ph.u;attr="Venue photo: "+(ph.a||"Google")}}}catch(err){}
  const b2=$("#evi-"+i);if(!src||!b2)continue;const badge=b2.querySelector(".evbadge");b2.innerHTML='<img src="'+esc(src)+'" alt="'+(flyer?"Event flyer":"Venue")+'" loading="lazy"'+(flyer?' class="flyer" data-a="evflyer" data-i="'+i+'"':'')+'>';if(badge)b2.appendChild(badge);b2.classList.remove("noimg");
  const a=$("#eva-"+i);if(a)a.textContent=attr}}
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

/* ---------- phones: one interaction controller for the sheet, panels and the Back button ----------
   Root causes this replaces: the trip panel had only "closed" and a fixed 70%-height "open" state toggled by a 20px strip,
   the driving view opened itself over most of the map, the header disappeared while navigating, and the browser Back
   button left the page instead of closing what was open. */
const UIX={stack:[],
  /* opening a panel adds a history entry so Back closes it; closing it by hand just retires the entry (no history.back race) */
  push(k){if(this.stack.includes(k))return;this.stack.push(k);try{history.pushState(Object.assign({},history.state||{},{gx:k}),"")}catch(e){}},
  drop(k){const i=this.stack.lastIndexOf(k);if(i>=0)this.stack.splice(i,1)},
  onPop(){const k=this.stack.pop();if(!k)return false;if(k==="modal")_gCloseModal();else if(k==="sheet")SHEET.set("peek",true);else if(k==="drive"){const d=$("#dash");if(d){d.classList.remove("drive-open");DRIVE.resize()}}return true}};
/* every dialog gets a close button and joins the Back-button stack; only one dialog exists at a time */
const _gModal=modal,_gCloseModal=closeModal;
modal=function(html,mount){const had=!!$("#gmodal").innerHTML;sugOpen(false);const el=_gModal(html,mount);if(el&&!el.querySelector(".gmx")){const x=document.createElement("button");x.className="gmx";x.setAttribute("data-a","close");x.setAttribute("aria-label","Close");x.innerHTML=ico("x",18);el.prepend(x)}if(!had)UIX.push("modal");return el};
closeModal=function(){const had=!!$("#gmodal").innerHTML;_gCloseModal();if(had)UIX.drop("modal")};
/* ---------- the trip sheet: peek (default while navigating) · half · full ---------- */
const SHEET={state:"peek",h:0,drag:null,
  el(){return $("#tbar")},
  visible(){return isPhone()&&!!G.route&&(G.nav||this.state!=="peek")&&(G.page===""||G.page==="navigate")},
  sizes(){const d=$("#dash"),H=d?d.clientHeight:600,pk=$(".tpeek"),peek=Math.min(132,Math.max(64,(pk?pk.offsetHeight:64)+30));return {peek,half:Math.max(peek+120,Math.round(H*.5)),full:Math.max(peek+160,H-10)}},
  set(s,fromBack){const prev=this.state;this.state=s;if(s!=="peek"&&prev==="peek"&&!fromBack)UIX.push("sheet");if(s==="peek"&&prev!=="peek"&&!fromBack)UIX.drop("sheet");this.sync()},
  tap(v){if(Date.now()-(this.dragAt||0)<450)return;if(!isPhone()){$("#dash").classList.toggle("sheet-open");requestAnimationFrame(sizeBottom);return}
    if(v==="peek"||v==="half"||v==="full")return this.set(v===this.state&&v!=="peek"?"peek":v);this.set({peek:"half",half:"full",full:"peek"}[this.state])},
  sync(h){const t=this.el(),d=$("#dash");if(!t||!d)return;if(!isPhone()){t.style.height="";t.hidden=false;d.classList.remove("sheet-open");t.classList.remove("s-peek","s-half","s-full");return}
    const vis=this.visible();t.hidden=!vis;d.classList.toggle("sheet-open",vis&&this.state!=="peek");["peek","half","full"].forEach(k=>t.classList.toggle("s-"+k,this.state===k));
    if(vis){const S=this.sizes();this.h=h!=null?h:S[this.state];t.style.height=this.h+"px"}else this.h=0;
    const g=t.querySelector(".tgrab");if(g){g.setAttribute("aria-expanded",this.state!=="peek");g.setAttribute("aria-label",this.state==="peek"?"Show trip details":this.state==="half"?"Show the full trip":"Collapse trip details")}
    sizeBottom()},
  /* drag: handle and summary row always; the scrolling content only when it's already at the top and you pull down */
  start(y,src){const t=this.el();if(!t||!this.visible())return false;this.drag={y0:y,h0:this.h,t0:performance.now(),y:y,src,moved:false};t.classList.add("dragging");return true},
  move(y){const D2=this.drag;if(!D2)return;const dy=D2.y0-y;if(Math.abs(dy)>6)D2.moved=true;const S=this.sizes(),h=Math.max(S.peek-24,Math.min(S.full,D2.h0+dy));D2.v=(D2.y-y)/Math.max(1,performance.now()-(D2.tl||D2.t0));D2.y=y;D2.tl=performance.now();this.el().style.height=h+"px";this.h=h},
  end(){const D2=this.drag;this.drag=null;const t=this.el();if(t)t.classList.remove("dragging");if(!D2)return;if(D2.moved)this.dragAt=Date.now();if(!D2.moved){/* a plain tap on the handle is handled by its click; tapping the summary row opens the details */if(D2.src==="peek"&&this.state==="peek")this.set("half");return}
    const S=this.sizes(),order=["peek","half","full"],v=D2.v||0,h=this.h;let idx=order.reduce((a,k,i)=>Math.abs(S[k]-h)<Math.abs(S[order[a]]-h)?i:a,0);
    if(v>.45){const up=order.findIndex(k=>S[k]>h+4);idx=up<0?2:up}else if(v<-.45){let dn=0;order.forEach((k,i)=>{if(S[k]<h-4)dn=i});idx=dn}const target=order[idx];this.set(target)}};
(function(){let touchId=null;
  document.addEventListener("pointerdown",e=>{if(!isPhone())return;const g=e.target.closest(".tgrab,.tpeek,.tmh");if(!g||e.target.closest("button:not(.tgrab),a"))return;if(e.pointerType==="mouse"&&e.button!==0)return;
    if(SHEET.start(e.clientY,g.classList.contains("tgrab")?"grab":g.classList.contains("tpeek")?"peek":"head")){touchId=e.pointerId;try{g.setPointerCapture(e.pointerId)}catch(x){}}},{passive:true});
  document.addEventListener("pointermove",e=>{if(SHEET.drag&&e.pointerId===touchId)SHEET.move(e.clientY)},{passive:true});
  const up=e=>{if(SHEET.drag&&e.pointerId===touchId){touchId=null;SHEET.end()}};document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
  /* pull-down on the scrolled-to-top content collapses the sheet (touch events: the browser owns vertical scrolling otherwise) */
  let ts=null;document.addEventListener("touchstart",e=>{const c=e.target.closest(".tbar .tbin");if(!c||!isPhone()||SHEET.state==="peek"||e.target.closest(".tpeek"))return;ts={y:e.touches[0].clientY,c,on:false}},{passive:true});
  document.addEventListener("touchmove",e=>{if(!ts)return;const y=e.touches[0].clientY;if(!ts.on){if(ts.c.scrollTop<=0&&y-ts.y>10){ts.on=SHEET.start(ts.y,"content")}else if(Math.abs(y-ts.y)>10){ts=null;return}}if(ts&&ts.on){e.preventDefault();SHEET.move(y)}},{passive:false});
  document.addEventListener("touchend",()=>{if(ts&&ts.on)SHEET.end();ts=null},{passive:true});document.addEventListener("touchcancel",()=>{if(ts&&ts.on)SHEET.end();ts=null},{passive:true});
  addEventListener("resize",()=>SHEET.sync());addEventListener("orientationchange",()=>setTimeout(()=>{SHEET.sync();paintAll()},250));
  if(window.visualViewport)visualViewport.addEventListener("resize",()=>{const kb=innerHeight-visualViewport.height>140;document.documentElement.classList.toggle("kbd",kb)});
  /* leaving the page mid-trip asks first (the browser shows its own wording) */
  addEventListener("beforeunload",e=>{if(G.nav&&!G.nav.sim){e.preventDefault();e.returnValue=""}});
})();
/* bottom of the map stays clear of whatever is open, so map buttons never hide behind a panel */
sizeBottom=function(){const d=$("#dash");if(!d)return;let h=96;
  if(isPhone()){const tc=$("#tripcard");if(SHEET.visible())h=Math.min(SHEET.h||SHEET.sizes().peek,SHEET.sizes().half);else if(G.dest&&!G.nav&&tc&&tc.offsetParent)h=tc.offsetHeight+10;else h=16}
  d.style.setProperty("--bot",h+"px")};
/* ---------- phone sheet content ---------- */
function tbarPhone(){const r=G.route;if(!r)return "";const di=G.intel.dest,oi=G.intel.origin,arr=arrival(),tz=di&&di.tz&&!di.tz.error?di.tz.id:"",left=G.nav?G.nav.leftSec:r.durationSec,leftM=G.nav?Math.max(0,r.len-G.nav.s):r.distanceM,ni=nextInfo();
  const wAt=di&&di.weather&&!di.weather.error?weatherAt(di.weather,arr):null,diff=tz&&oi&&oi.tz&&!oi.tz.error?Math.round((di.tz.offsetSec-oi.tz.offsetSec)/3600):null,end=G.endArm?" Tap again to end":" End";
  const peek='<div class="tpeek">'+(G.nav&&ni&&!$("#nextturn:not([hidden])")?'<div class="tpk tturn"><span class="ttico">'+manIco(ni.man,24)+'</span><b>'+fmtDist(ni.dist)+'</b></div>':'')+'<div class="tpk"><small>Remaining</small><b>'+fmtDur(left)+'</b><span>'+fmtDist(leftM)+'</span></div><div class="tpk"><small>Arrive</small><b>'+fmtTime(arr,tz||undefined)+'</b><span>'+(tz?esc(tzAbbr(arr,tz)):"")+'</span></div>'+
    (G.nav?'<button class="gbtn tbend'+(G.endArm?' confirm':'')+'" data-a="end">'+ico("stop",16)+'<span>'+end+'</span></button>':'<button class="gbtn ghost sm" data-a="sheet" data-v="peek" aria-label="Close trip details">'+ico("x",16)+'</button>')+'</div>';
  const steps=r.steps||[],from=G.nav?G.nav.step+1:0,rows=steps.slice(from,from+40);
  return peek+'<div class="tmore"><div class="tmh"><b>Trip details</b><button class="gbtn ghost sm" data-a="sheet" data-v="peek">'+ico("down",16)+' Collapse</button></div>'+
    '<div class="tgrid"><div class="tbi eta"><small>'+(G.mode==="WALK"?"Walking":"Traffic")+'</small><b>'+(G.mode==="WALK"?(G.walkStats||"On foot"):r.delaySec>120?"+"+fmtDur(r.delaySec)+" delay":"On time")+'</b><span>'+(G.mode==="WALK"?"Pace shown while you walk":esc(r.trafficLevel||"Live traffic"))+'</span></div>'+
    '<button class="tbi wx" data-a="weather"><small>Weather at destination</small><b>'+(wAt&&wAt.temp!=null?wAt.temp+"°":"—")+'</b><span>'+(wAt?esc(wAt.text||""):di&&di.weather&&di.weather.error?"Unavailable":"Loading…")+'</span></button>'+
    '<div class="tbi dtz"><small>Destination time</small><b>'+(tz?fmtTime(Date.now(),tz):"—")+'</b><span>'+(tz?esc(tzAbbr(Date.now(),tz))+(diff?" ("+(diff>0?"+":"")+diff+" hr)":diff===0?" · same time":""):di&&di.tz&&di.tz.error?"Unavailable":"…")+'</span></div></div>'+
    (!G.nav&&G.routes.length>1?'<div class="alts">'+G.routes.map((x,i)=>'<button class="'+(i===G.sel?"on":"")+'" data-a="alt" data-i="'+i+'"><b>'+fmtDur(x.durationSec)+'</b><small>'+(i===0?"Best":x.description?"via "+esc(x.description):"Option "+(i+1))+'</small></button>').join("")+'</div>':'')+
    tools(true)+(rows.length?'<div class="tsteps"><b>Turn by turn</b><ol>'+rows.map(s=>'<li><span class="tsi">'+manIco(s.maneuver,22)+'</span><span>'+esc(shortInstr(s.instr))+'</span><small>'+fmtDist(s.distanceM)+'</small></li>').join("")+'</ol></div>':'')+'</div>'}
/* header: while navigating the search field turns into a compact destination control */
function paintDestPill(){const p=$("#gdest");if(!p)return;const on=!!G.nav&&!!G.dest;p.hidden=!on;if(on)p.innerHTML=ico("flag",16)+'<span>'+esc(G.dest.name)+'</span>'}
function paintReturn(){const b=$("#gret");if(!b)return;b.hidden=!(G.nav&&G.page!==""&&G.page!=="navigate")}

/* ---------- detail sheets ---------- */
function weatherModal(){const di=G.intel.dest,w=di&&di.weather;if(!w||w.error){toast("Weather isn’t available for this place right now");return}const tz=di.tz&&!di.tz.error?di.tz.id:undefined,arr=arrival(),at=weatherAt(w,arr),n=w.now||{},sun=(w.sun||[])[0]||{};
  const ic=x=>x&&x.icon?'<img src="'+esc(x.icon+(THEME.cur==="dark"?"_dark":"")+".svg")+'" alt="" width="30" height="30">':ico("cloud",22);
  modal('<h3>Weather at '+esc(G.dest.name)+'</h3><div class="stats"><div class="pk"><small>Now</small><b>'+(n.temp!=null?n.temp+"°":"—")+'</b><span>'+esc(n.text||"")+'</span></div><div class="pk"><small>When you arrive · '+fmtTime(arr,tz)+'</small><b>'+(at&&at.temp!=null?at.temp+"°":"—")+'</b><span>'+esc(at?at.text:"")+'</span></div>'+
    '<div class="pk"><small>Rain chance</small><b>'+(at&&at.rain!=null?at.rain+"%":"—")+'</b></div><div class="pk"><small>Wind</small><b>'+(at&&at.wind!=null?Math.round(at.wind)+" mph":"—")+'</b><span>'+esc(at&&at.windDir?String(at.windDir).replace(/_/g," ").toLowerCase():"")+'</span></div>'+
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
  if(a==="end"){if(G.nav&&!(G.endArm&&Date.now()-G.endArm<4000)){G.endArm=Date.now();paintAll();clearTimeout(G.endT);G.endT=setTimeout(()=>{G.endArm=0;if(G.nav)paintAll()},4000);return}G.endArm=0;endNav();toast("Navigation ended");return}
  if(a==="sim")return startSim();
  if(a==="savedest"){if(G.dest)addSaved(Object.assign({},G.dest));return}
  if(a==="voice-toggle"){D.settings.voice=!D.settings.voice;save();if(!D.settings.voice&&window.speechSynthesis)speechSynthesis.cancel();paintNext();return}
  if(a==="weather")return weatherModal();
  if(a==="addstop"){if(G.stops.length>=5){toast("Up to 5 stops");return}if(isPhone())SHEET.set("peek");return searchFor("stop","Search for a stop to add")}
  if(a==="share")return shareEta();
  if(a==="options")return optionsModal();
  if(a==="optmode"){G.mode=t.dataset.v;$$('[data-a="optmode"]').forEach(b=>b.classList.toggle("on",b===t));return}
  if(a==="rmstop"){G.stops.splice(i,1);optionsModal();return}
  if(a==="optapply"){$$("[data-opt]").forEach(c=>D.settings[c.dataset.opt]=c.checked);save();closeModal();paintMapTools();if(G.dest)planRoute(!!G.nav);return}
  if(a==="drivetoggle"){const on=$("#dash").classList.toggle("drive-open");if(G.nav){D.settings.driveView=on;save()}DRIVE.resize();if(on&&D3.ok&&G.route)D3.prefetch(G.route);return}
  if(a==="sheet"){SHEET.tap(t.dataset.v);return}
  if(a==="search-cancel"){G.searchFor=null;const gs=$(".gsearch");gs.classList.remove("for");const q=$("#gq");q.value="";q.placeholder="Where we headed?";q.blur();sugOpen(false);return}
  if(a==="retry-route"){G.err="";planRoute();return}
  if(a==="more")return moreSheet();
  if(a==="acct")return modal('<h3>Your account</h3><p class="muted">Signed in as <b>'+esc(STORE.email)+'</b>.</p><p class="muted small">'+(STORE.cloud==="blocked"?"Account sync is waiting for the latest Firestore rules. Your data is safe on this device.":"Your saved places, trips, walks and car sync to this account on every device.")+'</p><div class="row"><button class="gbtn ghost" data-a="signout">Sign out</button><button class="gbtn" data-a="close">Close</button></div>');
  /* explore */
  if(a==="cat")return exploreLoad(t.dataset.k);
  if(a==="evflyer"){const x=EXP.items&&EXP.items[i],im=t.getAttribute("src");if(!im)return;return modal('<div class="evfly"><img src="'+esc(im)+'" alt="Event flyer"></div><h3 style="margin-top:12px">'+esc(x&&x.ev?x.ev.title:"")+'</h3><div class="row"><button class="gbtn" data-a="close">Close</button></div>')}
  if(a==="exgo"||a==="exsave"){const x0=EXP.items[i],x=x0&&x0.ev?{name:x0.name,addr:x0.addr,text:x0.text,lat:x0.lat,lng:x0.lng,placeId:x0.placeId,kind:"event"}:x0;if(x&&x.lat==null)delete x.lat;resolveText(x).then(p=>{if(a==="exgo")chooseDest(p);else addSaved(Object.assign({},p))}).catch(err=>toast(err.message));return}
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
  window.__gg={G,D:()=>D,MAP,route,planRoute,navUpdate,startSim,SHEET,isPhone,paintRecenter};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();

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

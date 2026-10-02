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

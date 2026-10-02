(async()=>{
  if(BACKEND==="firebase"){
    const cfg=window.FIREBASE_CONFIG;
    if(!(window.firebase&&cfg&&cfg.apiKey&&!/YOUR_/.test(cfg.apiKey))){S.authChecked=true;render();return}
    try{firebase.initializeApp(cfg);S.db=firebase.firestore();S.fbReady=true}catch(e){S.authChecked=true;render();return}
    subscribePublic();
    let started=false;
    firebase.auth().onAuthStateChanged(async u=>{
      if(started&&!u){location.hash="#home";location.reload();return}
      if(!u){S.authChecked=true;render();return}
      started=true;S.signedIn=true;S.uid=u.uid;S.email=u.email||"";
      let a={};try{const d=await S.db.doc("access/"+u.uid).get();a=d.exists?d.data():{}}catch(e){}
      S.isAdmin=a.role==="founder";S.authChecked=true;
      if(S.isAdmin)subscribeFounder();else subscribeMember();
      if(S.route==="signin")location.hash=S.isAdmin?"#team":"#portal";
      render();
    });
    return;
  }
  let user=null;
  try{user=await cu("user")}catch(e){}
  S.userCap=user;
  if(user){
    try{S.isAdmin=!!(await user.isOwner())}catch(e){}
    try{S.uid=await user.id()}catch(e){}
  }
  S.signedIn=!!S.uid;
  try{S.db=await cu("db")}catch(e){}
  if(S.db&&S.uid){if(S.isAdmin)subscribeFounder();else subscribeMember()}
  S.authChecked=true;
  render();


 const store={};const subs=[];
 const notify=()=>subs.forEach(f=>f());
 const col=(c)=>({doc:(id)=>doc(c+'/'+(id||Math.random().toString(36).slice(2))),where:()=>col(c),onSnapshot(n){const f=()=>n({docs:Object.entries(store).filter(([k])=>k.split('/').length===c.split('/').length+1&&k.startsWith(c+'/')).map(([k,v])=>({id:k.split('/').pop(),exists:true,data:()=>v}))});subs.push(f);setTimeout(f,10);return()=>{}}});
 const doc=(path)=>({set:async d=>{store[path]=d;notify()},delete:async()=>{delete store[path];notify()},get:async()=>({exists:!!store[path],data:()=>store[path]}),onSnapshot(n){const f=()=>n({exists:!!store[path],data:()=>store[path]});subs.push(f);setTimeout(f,10);return()=>{}}});
 const db={collection:col,doc};
 window.claude={use:async n=>n==='user'?{isOwner:async()=>true,profiles:async()=>({}),id:async()=>'u1'}:n==='db'?db:null};

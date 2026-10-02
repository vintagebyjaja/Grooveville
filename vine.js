function treeSVG(){
  const W=560, cy=x=>Math.round(64+0.0011*(x-280)*(x-280)+7*Math.sin((x-30)/34));
  let cane="M24 "+cy(24);for(let x=34;x<=536;x+=10)cane+=" L"+x+" "+cy(x);
  let cane2="M40 "+(cy(40)-8);for(let x=50;x<=520;x+=10)cane2+=" L"+x+" "+(cy(x)-6+5*Math.sin(x/23)).toFixed(1);
  const leaf=(x,y,s,rot,o)=>'<g transform="translate('+x+' '+y+') rotate('+rot+') scale('+s+')" opacity="'+(o||.9)+'"><path d="M0 0 C-6 -4 -16 -2 -20 -10 C-14 -12 -12 -18 -16 -26 C-8 -24 -4 -30 0 -36 C4 -30 8 -24 16 -26 C12 -18 14 -12 20 -10 C16 -2 6 -4 0 0Z" fill="var(--olive)"/><path d="M0 0 L0 -30 M0 -12 L-12 -18 M0 -12 L12 -18" stroke="var(--bg)" stroke-width="1.2" opacity=".5" fill="none"/></g>';
  const curl=(x,y,d)=>'<path d="M'+x+' '+y+' c'+(6*d)+' -2 '+(10*d)+' 4 '+(8*d)+' 9 c'+(-2*d)+' 5 '+(-8*d)+' 4 '+(-8*d)+' -1 c0 -3 '+(3*d)+' -4 '+(4*d)+' -2" stroke="var(--olive)" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
  const rows=[3,4,3,2,1], R=8.6, dx=17.2, dy=14.6;
  let clusters="";
  BRANDS.slice(1).forEach((b,i)=>{
    const x=52+i*76, top=cy(x)+20, info=brandInfo(b.id), c="var(--c-"+b.id+")";
    let g='<path d="M'+x+' '+(cy(x)+2)+' q4 8 0 '+(top-cy(x)-4)+'" stroke="var(--olive)" stroke-width="2.4" fill="none"/>';
    rows.forEach((n,r)=>{for(let k=0;k<n;k++){const gx=x+(k-(n-1)/2)*dx, gy=top+R+r*dy;
      g+='<circle cx="'+gx.toFixed(1)+'" cy="'+gy.toFixed(1)+'" r="'+R+'" fill="'+c+'"/><circle cx="'+(gx-2.6).toFixed(1)+'" cy="'+(gy-2.8).toFixed(1)+'" r="2.4" fill="#fff" opacity=".38"/>'}});
    const bottom=top+R*2+4*dy;
    if(info.logo)g+='<clipPath id="cl-'+b.id+'"><circle cx="'+x+'" cy="'+(top+R+dy)+'" r="17"/></clipPath><circle cx="'+x+'" cy="'+(top+R+dy)+'" r="19" fill="var(--surface)" stroke="'+c+'" stroke-width="2"/><image href="'+esc(info.logo)+'" x="'+(x-17)+'" y="'+(top+R+dy-17)+'" width="34" height="34" preserveAspectRatio="xMidYMid meet" clip-path="url(#cl-'+b.id+')"/>';
    g+='<text x="'+x+'" y="'+(bottom+18)+'" text-anchor="middle" font-size="'+(b.short.length>5?13:15)+'" fill="var(--ink)">'+b.short+'</text>';
    clusters+='<a class="node" href="#b-'+b.id+'" aria-label="'+esc(info.name)+'"><rect x="'+(x-36)+'" y="'+(cy(x)-4)+'" width="72" height="'+(bottom-cy(x)+30)+'" fill="transparent"/>'+g+'</a>';
  });
  const trunk='<path d="M268 452 C258 400 298 372 284 326 C270 282 296 250 282 206 C270 166 294 120 280 '+cy(280)+'" stroke="var(--olive)" stroke-width="15" fill="none" stroke-linecap="round"/>'+
    '<path d="M276 440 C270 400 300 370 288 330 C276 290 298 250 286 210" stroke="var(--bg)" stroke-width="1.6" opacity=".3" fill="none"/>'+
    '<path d="M268 448 Q236 444 214 456 M272 450 Q310 446 334 458" stroke="var(--olive)" stroke-width="5" fill="none" stroke-linecap="round"/>';
  const leaves=leaf(250,232,1.25,-58)+leaf(310,262,1.15,62)+leaf(258,178,.95,-35,.75)+leaf(304,150,.95,40,.75)+
    leaf(126,cy(126)-2,.85,-160,.8)+leaf(420,cy(420)-2,.85,165,.8)+leaf(200,cy(200)-4,.7,-178,.7)+leaf(356,cy(356)-4,.7,178,.7)+leaf(30,cy(30)+2,.7,-120,.7)+leaf(530,cy(530)+2,.7,120,.7);
  const curls=curl(90,cy(90)-4,1)+curl(240,cy(240)-6,-1)+curl(318,cy(318)-6,1)+curl(470,cy(470)-4,-1)+curl(262,300,-1)+curl(296,214,1);
  return '<svg class="tree" viewBox="0 0 '+W+' 470" role="img" aria-label="The Groove Vine: Grooveville LLC at the root with seven companies growing on it">'+
    trunk+'<path d="'+cane2+'" stroke="var(--olive)" stroke-width="2.5" fill="none" opacity=".55" stroke-linecap="round"/>'+
    '<path d="'+cane+'" stroke="var(--olive)" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+
    leaves+curls+clusters+
    '<defs><clipPath id="hqclip"><circle cx="280" cy="388" r="50"/></clipPath></defs><a class="node" href="#b-hq" aria-label="Grooveville LLC headquarters, the root of the vine"><circle class="ring" cx="280" cy="388" r="53" fill="var(--surface)" stroke="var(--olive)" stroke-width="4"/><image href="'+LOGO+'" x="230" y="338" width="100" height="100" clip-path="url(#hqclip)"/></a></svg>';
}

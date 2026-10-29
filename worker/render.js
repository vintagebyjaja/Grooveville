/* generated from tools/render-core.js by tools/mkworker.py; edit the source, not this file */
/* ===================== GROOVEVILLE CONTENT RENDERER =====================
   Draws finished Content Studio graphics without a browser: PNG decode/encode, TrueType text, gradients,
   images, icon strokes and glow, all in plain JavaScript. The same code runs in the Cloudflare Worker, in Node
   (the Grooveville render worker) and in the browser, so a post looks the same wherever it is rendered.
   Logos are pasted from the original PNG pixels (scaled only): never redrawn or regenerated. */
const GVR=(function(){
/* ---------- colors ---------- */
function parseColor(s){s=String(s||"#000").trim();let m;if(s[0]==="#"){let h=s.slice(1);if(h.length===3)h=h.split("").map(c=>c+c).join("");const n=parseInt(h.slice(0,6).padEnd(6,"0"),16);return [(n>>16)/255,(n>>8&255)/255,(n&255)/255,h.length>=8?parseInt(h.slice(6,8),16)/255:1]}
  if((m=/rgba?\(([^)]+)\)/.exec(s))){const p=m[1].split(",").map(x=>parseFloat(x));return [p[0]/255,p[1]/255,p[2]/255,p.length>3?p[3]:1]}return [0,0,0,1]}
const hexA=(h,a)=>{const c=parseColor(h);return [c[0],c[1],c[2],a]};
/* ---------- canvas (premultiplied RGBA float) ---------- */
function Canvas(w,h){this.w=w;this.h=h;this.d=new Float32Array(w*h*4)}
Canvas.prototype.blendMask=function(mask,mx,my,mw,mh,paint){const W=this.w,H=this.h,d=this.d;const x0=Math.max(0,mx),y0=Math.max(0,my),x1=Math.min(W,mx+mw),y1=Math.min(H,my+mh);
  const solid=paint.solid;for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){const cv=mask[(y-my)*mw+(x-mx)];if(cv<=0.0005)continue;const c=solid||paint.at(x+.5,y+.5);const a=c[3]*Math.min(1,cv);if(a<=0)continue;const i=(y*W+x)*4,ia=1-a;d[i]=c[0]*a+d[i]*ia;d[i+1]=c[1]*a+d[i+1]*ia;d[i+2]=c[2]*a+d[i+2]*ia;d[i+3]=a+d[i+3]*ia}}};
Canvas.prototype.fillRect=function(x,y,w,h,paint){const x0=Math.max(0,Math.floor(x)),y0=Math.max(0,Math.floor(y)),x1=Math.min(this.w,Math.ceil(x+w)),y1=Math.min(this.h,Math.ceil(y+h));const W=this.w,d=this.d,solid=paint.solid;
  for(let yy=y0;yy<y1;yy++){const cy=Math.max(0,Math.min(1,Math.min(yy+1,y+h)-Math.max(yy,y)));for(let xx=x0;xx<x1;xx++){const cx=Math.max(0,Math.min(1,Math.min(xx+1,x+w)-Math.max(xx,x)));const c=solid||paint.at(xx+.5,yy+.5),a=c[3]*cx*cy;if(a<=0)continue;const i=(yy*W+xx)*4,ia=1-a;d[i]=c[0]*a+d[i]*ia;d[i+1]=c[1]*a+d[i+1]*ia;d[i+2]=c[2]*a+d[i+2]*ia;d[i+3]=a+d[i+3]*ia}}};
/* image: {w,h,data Uint8 RGBA straight}; bilinear, premultiplied */
Canvas.prototype.drawImage=function(im,dx,dy,dw,dh,alpha){alpha=alpha==null?1:alpha;const W=this.w,H=this.h,d=this.d,sx=im.w/dw,sy=im.h/dh,s=im.data;const x0=Math.max(0,Math.floor(dx)),y0=Math.max(0,Math.floor(dy)),x1=Math.min(W,Math.ceil(dx+dw)),y1=Math.min(H,Math.ceil(dy+dh));
  const px=(x,y,o)=>{x=x<0?0:x>=im.w?im.w-1:x;y=y<0?0:y>=im.h?im.h-1:y;return s[(y*im.w+x)*4+o]};
  for(let y=y0;y<y1;y++){const fy=(y+.5-dy)*sy-.5,iy=Math.floor(fy),ty=fy-iy;for(let x=x0;x<x1;x++){const fx=(x+.5-dx)*sx-.5,ix=Math.floor(fx),tx=fx-ix;let r=0,g=0,b=0,a=0;
    for(let k=0;k<4;k++){const xx=ix+(k&1),yy=iy+(k>>1),wgt=((k&1)?tx:1-tx)*((k>>1)?ty:1-ty);if(wgt<=0)continue;const aa=px(xx,yy,3)/255*wgt;r+=px(xx,yy,0)/255*aa;g+=px(xx,yy,1)/255*aa;b+=px(xx,yy,2)/255*aa;a+=aa}
    const cxv=Math.max(0,Math.min(1,Math.min(x+1,dx+dw)-Math.max(x,dx))),cyv=Math.max(0,Math.min(1,Math.min(y+1,dy+dh)-Math.max(y,dy))),f=alpha*cxv*cyv;if(a<=0||f<=0)continue;const i=(y*W+x)*4,ia=1-a*f;d[i]=r*f+d[i]*ia;d[i+1]=g*f+d[i+1]*ia;d[i+2]=b*f+d[i+2]*ia;d[i+3]=a*f+d[i+3]*ia}}};
Canvas.prototype.toRGBA=function(){const n=this.w*this.h,o=new Uint8Array(n*4),d=this.d;for(let i=0;i<n;i++){const a=d[i*4+3];o[i*4+3]=Math.round(Math.min(1,a)*255);if(a>0){o[i*4]=Math.round(Math.min(1,d[i*4]/a)*255);o[i*4+1]=Math.round(Math.min(1,d[i*4+1]/a)*255);o[i*4+2]=Math.round(Math.min(1,d[i*4+2]/a)*255)}}return o};
Canvas.prototype.avgLum=function(x,y,w,h){x=Math.max(0,x|0);y=Math.max(0,y|0);const x1=Math.min(this.w,(x+w)|0),y1=Math.min(this.h,(y+h)|0);let s=0,n=0;const L=c=>{c=Math.max(0,Math.min(1,c));return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};
  for(let yy=y;yy<y1;yy+=2)for(let xx=x;xx<x1;xx+=2){const i=(yy*this.w+xx)*4;s+=.2126*L(this.d[i])+.7152*L(this.d[i+1])+.0722*L(this.d[i+2]);n++}return n?s/n:0};
/* paints */
const solid=c=>({solid:Array.isArray(c)?c:parseColor(c)});
function lerpStops(st,t){t=Math.max(0,Math.min(1,t));let i=0;while(i<st.length-2&&t>st[i+1][0])i++;const [a,ca]=st[i],[b,cb]=st[i+1];const u=b>a?Math.max(0,Math.min(1,(t-a)/(b-a))):0;
  const pa=[ca[0]*ca[3],ca[1]*ca[3],ca[2]*ca[3],ca[3]],pb=[cb[0]*cb[3],cb[1]*cb[3],cb[2]*cb[3],cb[3]],A=pa[3]+(pb[3]-pa[3])*u;if(A<=0)return [0,0,0,0];return [(pa[0]+(pb[0]-pa[0])*u)/A,(pa[1]+(pb[1]-pa[1])*u)/A,(pa[2]+(pb[2]-pa[2])*u)/A,A]}
const linear=(x0,y0,x1,y1,stops)=>{const dx=x1-x0,dy=y1-y0,L2=dx*dx+dy*dy||1;const st=stops.map(([t,c])=>[t,Array.isArray(c)?c:parseColor(c)]);return {at:(x,y)=>lerpStops(st,((x-x0)*dx+(y-y0)*dy)/L2)}};
const radial=(cx,cy,r,stops)=>{const st=stops.map(([t,c])=>[t,Array.isArray(c)?c:parseColor(c)]);return {at:(x,y)=>lerpStops(st,Math.hypot(x-cx,y-cy)/r)}};
/* ---------- coverage rasterizer (signed-area accumulation; non-zero for non-self-overlapping contours) ---------- */
function rasterize(contours){let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;for(const c of contours)for(let i=0;i<c.length;i+=2){const x=c[i],y=c[i+1];if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y}
  if(minx>maxx)return null;const ox=Math.floor(minx)-1,oy=Math.floor(miny)-1,w=Math.ceil(maxx)-ox+2,h=Math.ceil(maxy)-oy+2;if(w*h>2.5e7)return null;const acc=new Float32Array(w*h+2);
  const line=(x0,y0,x1,y1)=>{if(y0===y1)return;let dir=1;if(y0>y1){dir=-1;let t=x0;x0=x1;x1=t;t=y0;y0=y1;y1=t}const dxdy=(x1-x0)/(y1-y0);let x=x0;if(y0<0)x-=y0*dxdy;const yEnd=Math.min(h,Math.ceil(y1));
    for(let y=Math.max(0,Math.floor(y0));y<yEnd;y++){const ls=y*w,dy=Math.min(y+1,y1)-Math.max(y,y0),xn=x+dxdy*dy,d=dy*dir;const xa=x<xn?x:xn,xb=x<xn?xn:x;const x0f=Math.floor(xa),x0i=x0f,x1c=Math.ceil(xb),x1i=x1c;
      if(x1i<=x0i+1){const xmf=.5*(x+xn)-x0f;acc[ls+x0i]+=d-d*xmf;acc[ls+x0i+1]+=d*xmf}
      else{const s=1/(xb-xa),xf0=xa-x0f,a0=.5*s*(1-xf0)*(1-xf0),xf1=xb-x1c+1,am=.5*s*xf1*xf1;acc[ls+x0i]+=d*a0;if(x1i===x0i+2)acc[ls+x0i+1]+=d*(1-a0-am);else{const a1=s*(1.5-xf0);acc[ls+x0i+1]+=d*(a1-a0);for(let xi=x0i+2;xi<x1i-1;xi++)acc[ls+xi]+=d*s;const a2=a1+(x1i-x0i-3)*s;acc[ls+x1i-1]+=d*(1-a2-am)}acc[ls+x1i]+=d*am}x=xn}};
  for(const c of contours){const n=c.length/2;for(let i=0;i<n;i++){const j=(i+1)%n;line(c[i*2]-ox,c[i*2+1]-oy,c[j*2]-ox,c[j*2+1]-oy)}}
  const m=new Float32Array(w*h);let s=0;for(let i=0;i<w*h;i++){s+=acc[i];const v=Math.abs(s);m[i]=v>1?1:v}return {m,x:ox,y:oy,w,h}}
Canvas.prototype.fillContours=function(contours,paint){const r=rasterize(contours);if(r)this.blendMask(r.m,r.x,r.y,r.w,r.h,paint);return r};
/* stroke: stamp discs along the flattened path (round caps and joins) */
function strokeMask(polys,lw){let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;for(const p of polys)for(let i=0;i<p.length;i+=2){minx=Math.min(minx,p[i]);maxx=Math.max(maxx,p[i]);miny=Math.min(miny,p[i+1]);maxy=Math.max(maxy,p[i+1])}if(minx>maxx)return null;
  const r=lw/2,ox=Math.floor(minx-r)-1,oy=Math.floor(miny-r)-1,w=Math.ceil(maxx+r)-ox+2,h=Math.ceil(maxy+r)-oy+2,m=new Float32Array(w*h);
  const seg=(ax,ay,bx,by)=>{const x0=Math.max(0,Math.floor(Math.min(ax,bx)-r-1-ox)),x1=Math.min(w,Math.ceil(Math.max(ax,bx)+r+1-ox)),y0=Math.max(0,Math.floor(Math.min(ay,by)-r-1-oy)),y1=Math.min(h,Math.ceil(Math.max(ay,by)+r+1-oy));const vx=bx-ax,vy=by-ay,L2=vx*vx+vy*vy;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const px=x+ox+.5,py=y+oy+.5;let t=L2?((px-ax)*vx+(py-ay)*vy)/L2:0;t=t<0?0:t>1?1:t;const dd=Math.hypot(px-ax-t*vx,py-ay-t*vy),c=Math.max(0,Math.min(1,r-dd+.5)),i=y*w+x;if(c>m[i])m[i]=c}};
  for(const p of polys){if(p.length===2)seg(p[0],p[1],p[0],p[1]);for(let i=0;i+3<p.length;i+=2)seg(p[i],p[i+1],p[i+2],p[i+3])}return {m,x:ox,y:oy,w,h}}
Canvas.prototype.stroke=function(polys,lw,paint){const r=strokeMask(polys,lw);if(r)this.blendMask(r.m,r.x,r.y,r.w,r.h,paint)};
/* soft glow: blurred copy of a mask */
function blurMask(r,rad){const pad=Math.ceil(rad*2),w=r.w+pad*2,h=r.h+pad*2;let a=new Float32Array(w*h);for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)a[(y+pad)*w+x+pad]=r.m[y*r.w+x];let b=new Float32Array(w*h);const R=Math.max(1,Math.round(rad/2));
  for(let pass=0;pass<3;pass++){for(let y=0;y<h;y++){let s=0;for(let x=-R;x<=R;x++)s+=x>=0&&x<w?a[y*w+x]:0;for(let x=0;x<w;x++){b[y*w+x]=s/(2*R+1);const xo=x-R,xi=x+R+1;if(xo>=0)s-=a[y*w+xo];if(xi<w)s+=a[y*w+xi]}}
    for(let x=0;x<w;x++){let s=0;for(let y=-R;y<=R;y++)s+=y>=0&&y<h?b[y*w+x]:0;for(let y=0;y<h;y++){a[y*w+x]=s/(2*R+1);const yo=y-R,yi=y+R+1;if(yo>=0)s-=b[yo*w+x];if(yi<h)s+=b[yi*w+x]}}}return {m:a,x:r.x-pad,y:r.y-pad,w,h}}
/* ---------- geometry ---------- */
function flattenQuad(out,x0,y0,cx,cy,x1,y1){const n=Math.max(2,Math.min(40,Math.ceil(Math.sqrt(Math.hypot(x0-2*cx+x1,y0-2*cy+y1))*2)));for(let i=1;i<=n;i++){const t=i/n,u=1-t;out.push(u*u*x0+2*u*t*cx+t*t*x1,u*u*y0+2*u*t*cy+t*t*y1)}}
function flattenCubic(out,x0,y0,c1x,c1y,c2x,c2y,x1,y1){const n=Math.max(3,Math.min(60,Math.ceil(Math.sqrt(Math.hypot(x0-2*c1x+c2x,y0-2*c1y+c2y)+Math.hypot(c1x-2*c2x+x1,c1y-2*c2y+y1))*2.5)));for(let i=1;i<=n;i++){const t=i/n,u=1-t;out.push(u*u*u*x0+3*u*u*t*c1x+3*u*t*t*c2x+t*t*t*x1,u*u*u*y0+3*u*u*t*c1y+3*u*t*t*c2y+t*t*t*y1)}}
function roundRect(x,y,w,h,r){r=Math.min(r,w/2,h/2);const p=[],arc=(cx,cy,a0)=>{for(let i=0;i<=12;i++){const a=a0+i/12*Math.PI/2;p.push(cx+Math.cos(a)*r,cy+Math.sin(a)*r)}};arc(x+w-r,y+r,-Math.PI/2);arc(x+w-r,y+h-r,0);arc(x+r,y+h-r,Math.PI/2);arc(x+r,y+r,Math.PI);return [p]}
/* SVG path data -> polylines (M L H V C S Q T A Z, absolute and relative) */
function svgPath(dstr,tf){const toks=String(dstr).match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g)||[];let i=0,cmd="",x=0,y=0,sx=0,sy=0,lcx=0,lcy=0,lq=null;const polys=[];let cur=null;const num=()=>parseFloat(toks[i++]);
  const T=(px,py)=>tf?tf(px,py):[px,py];const push=(px,py)=>{const q=T(px,py);cur.push(q[0],q[1])};const start=(px,py)=>{cur=[];polys.push(cur);push(px,py);sx=px;sy=py};
  while(i<toks.length){if(/[A-Za-z]/.test(toks[i]))cmd=toks[i++];const rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase();
    if(C==="Z"){if(cur){push(sx,sy)}x=sx;y=sy;cur=null;lq=null;continue}
    if(C==="M"){const nx=num()+(rel?x:0),ny=num()+(rel?y:0);x=nx;y=ny;start(x,y);cmd=rel?"l":"L";lq=null;continue}
    if(!cur)start(x,y);
    if(C==="L"){x=num()+(rel?x:0);y=num()+(rel?y:0);push(x,y);lq=null}
    else if(C==="H"){x=num()+(rel?x:0);push(x,y);lq=null}else if(C==="V"){y=num()+(rel?y:0);push(x,y);lq=null}
    else if(C==="C"||C==="S"){let c1x,c1y;if(C==="C"){c1x=num()+(rel?x:0);c1y=num()+(rel?y:0)}else{c1x=lq&&lq.c?2*x-lq.x:x;c1y=lq&&lq.c?2*y-lq.y:y}const c2x=num()+(rel?x:0),c2y=num()+(rel?y:0),ex=num()+(rel?x:0),ey=num()+(rel?y:0);
      const pts=[];flattenCubic(pts,x,y,c1x,c1y,c2x,c2y,ex,ey);for(let k=0;k<pts.length;k+=2)push(pts[k],pts[k+1]);lq={c:true,x:c2x,y:c2y};x=ex;y=ey}
    else if(C==="Q"||C==="T"){let cx2,cy2;if(C==="Q"){cx2=num()+(rel?x:0);cy2=num()+(rel?y:0)}else{cx2=lq&&lq.q?2*x-lq.x:x;cy2=lq&&lq.q?2*y-lq.y:y}const ex=num()+(rel?x:0),ey=num()+(rel?y:0);const pts=[];flattenQuad(pts,x,y,cx2,cy2,ex,ey);for(let k=0;k<pts.length;k+=2)push(pts[k],pts[k+1]);lq={q:true,x:cx2,y:cy2};x=ex;y=ey}
    else if(C==="A"){let rx=Math.abs(num()),ry=Math.abs(num());const rot=num()*Math.PI/180,la=num(),sw=num(),ex=num()+(rel?x:0),ey=num()+(rel?y:0);
      if(!rx||!ry){push(ex,ey)}else{const cs=Math.cos(rot),sn=Math.sin(rot),dx2=(x-ex)/2,dy2=(y-ey)/2,x1p=cs*dx2+sn*dy2,y1p=-sn*dx2+cs*dy2;let lam=x1p*x1p/(rx*rx)+y1p*y1p/(ry*ry);if(lam>1){rx*=Math.sqrt(lam);ry*=Math.sqrt(lam)}
        let num2=rx*rx*ry*ry-rx*rx*y1p*y1p-ry*ry*x1p*x1p;num2=Math.max(0,num2);let co=Math.sqrt(num2/(rx*rx*y1p*y1p+ry*ry*x1p*x1p||1));if(la===sw)co=-co;const cxp=co*rx*y1p/ry,cyp=-co*ry*x1p/rx,cx3=cs*cxp-sn*cyp+(x+ex)/2,cy3=sn*cxp+cs*cyp+(y+ey)/2;
        const ang=(ux,uy,vx,vy)=>{const a=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);return a};let t1=ang(1,0,(x1p-cxp)/rx,(y1p-cyp)/ry),dt=ang((x1p-cxp)/rx,(y1p-cyp)/ry,(-x1p-cxp)/rx,(-y1p-cyp)/ry);if(!sw&&dt>0)dt-=2*Math.PI;else if(sw&&dt<0)dt+=2*Math.PI;
        const n=Math.max(4,Math.ceil(Math.abs(dt)/(Math.PI/16)));for(let k=1;k<=n;k++){const a=t1+dt*k/n;push(cs*rx*Math.cos(a)-sn*ry*Math.sin(a)+cx3,sn*rx*Math.cos(a)+cs*ry*Math.sin(a)+cy3)}}x=ex;y=ey;lq=null}
    else i++}
  return polys}
/* ---------- PNG ---------- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=(u,s,e)=>{let c=0xFFFFFFFF;for(let i=s;i<e;i++)c=CRC[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
async function zstream(data,kind,inflate){const S=inflate?new DecompressionStream(kind):new CompressionStream(kind);const w=S.writable.getWriter();w.write(data);w.close();return new Uint8Array(await new Response(S.readable).arrayBuffer())}
async function decodePNG(u8){u8=u8 instanceof Uint8Array?u8:new Uint8Array(u8);const sig=[137,80,78,71,13,10,26,10];for(let i=0;i<8;i++)if(u8[i]!==sig[i])throw new Error("Not a PNG file");
  let p=8,W=0,H=0,bd=8,ct=6,il=0,pal=null,trns=null;const idat=[];const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  while(p<u8.length){const len=dv.getUint32(p),type=String.fromCharCode(u8[p+4],u8[p+5],u8[p+6],u8[p+7]),s=p+8;if(type==="IHDR"){W=dv.getUint32(s);H=dv.getUint32(s+4);bd=u8[s+8];ct=u8[s+9];il=u8[s+12]}else if(type==="PLTE")pal=u8.slice(s,s+len);else if(type==="tRNS")trns=u8.slice(s,s+len);else if(type==="IDAT")idat.push(u8.subarray(s,s+len));else if(type==="IEND")break;p=s+len+4}
  if(!W||!H)throw new Error("PNG has no image header");if(il)throw new Error("Interlaced PNGs aren't supported; save the logo as a standard PNG");if(W*H>40e6)throw new Error("Image too large");
  const tot=idat.reduce((s,a)=>s+a.length,0),z=new Uint8Array(tot);let o=0;for(const a of idat){z.set(a,o);o+=a.length}const raw=await zstream(z,"deflate",true);
  const ch={0:1,2:3,3:1,4:2,6:4}[ct];if(!ch)throw new Error("Unsupported PNG color type");const bpp=Math.max(1,ch*bd/8),stride=Math.ceil(W*ch*bd/8),out=new Uint8Array(W*H*4);let prev=new Uint8Array(stride),cur=new Uint8Array(stride);
  for(let y=0;y<H;y++){const f=raw[y*(stride+1)],row=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));for(let i=0;i<stride;i++){const a=i>=bpp?cur[i-bpp]:0,b=prev[i],c=i>=bpp?prev[i-bpp]:0;let v=row[i];
      if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c}cur[i]=v&255}
    for(let x=0;x<W;x++){const q=(y*W+x)*4;const samp=k=>{if(bd===8)return cur[x*ch+k];if(bd===16)return cur[(x*ch+k)*2];const bitsPer=bd,idx=(x*ch+k)*bitsPer,byte=cur[idx>>3],sh=8-bitsPer-(idx&7),v=(byte>>sh)&((1<<bitsPer)-1);return ct===3?v:Math.round(v*255/((1<<bitsPer)-1))};
      if(ct===6){out[q]=samp(0);out[q+1]=samp(1);out[q+2]=samp(2);out[q+3]=samp(3)}else if(ct===2){out[q]=samp(0);out[q+1]=samp(1);out[q+2]=samp(2);out[q+3]=255;if(trns&&trns.length>=6&&bd===8&&out[q]===trns[1]&&out[q+1]===trns[3]&&out[q+2]===trns[5])out[q+3]=0}
      else if(ct===0){const g=samp(0);out[q]=out[q+1]=out[q+2]=g;out[q+3]=255}else if(ct===4){const g=samp(0);out[q]=out[q+1]=out[q+2]=g;out[q+3]=samp(1)}else{const ix=samp(0);out[q]=pal[ix*3];out[q+1]=pal[ix*3+1];out[q+2]=pal[ix*3+2];out[q+3]=trns&&ix<trns.length?trns[ix]:255}}
    const t=prev;prev=cur;cur=t}return {w:W,h:H,data:out}}
async function encodePNG(w,h,rgba,opaque){const ch=opaque?3:4,stride=w*ch,raw=new Uint8Array((stride+1)*h);for(let y=0;y<h;y++){const o=y*(stride+1);raw[o]=y?2:1;for(let x=0;x<w;x++){for(let k=0;k<ch;k++)raw[o+1+x*ch+k]=rgba[(y*w+x)*4+k]}}
  /* filter: Sub on the first row, Up afterwards (cheap and effective for photos with gradients) */
  for(let y=h-1;y>=0;y--){const o=y*(stride+1)+1;if(y===0){for(let i=stride-1;i>=ch;i--)raw[o+i]=(raw[o+i]-raw[o+i-ch])&255}else{const po=(y-1)*(stride+1)+1;for(let i=0;i<stride;i++)raw[o+i]=(raw[o+i]-unf(y-1,i))&255}}
  function unf(yy,i){const x=Math.floor(i/ch),k=i%ch;return rgba[(yy*w+x)*4+k]}
  const z=await zstream(raw,"deflate",false),chunks=[];const chunk=(type,data)=>{const c=new Uint8Array(12+data.length),dv=new DataView(c.buffer);dv.setUint32(0,data.length);for(let i=0;i<4;i++)c[4+i]=type.charCodeAt(i);c.set(data,8);dv.setUint32(8+data.length,crc32(c,4,8+data.length));chunks.push(c)};
  const ih=new Uint8Array(13),dv=new DataView(ih.buffer);dv.setUint32(0,w);dv.setUint32(4,h);ih[8]=8;ih[9]=opaque?2:6;chunk("IHDR",ih);chunk("IDAT",z);chunk("IEND",new Uint8Array(0));
  const sig=new Uint8Array([137,80,78,71,13,10,26,10]),len=8+chunks.reduce((s,c)=>s+c.length,0),out=new Uint8Array(len);out.set(sig,0);let p=8;for(const c of chunks){out.set(c,p);p+=c.length}return out}
/* ---------- TrueType fonts (glyf outlines) ---------- */
function Font(buf){const u=buf instanceof Uint8Array?buf:new Uint8Array(buf),dv=new DataView(u.buffer,u.byteOffset,u.byteLength);const nt=dv.getUint16(4),T={};for(let i=0;i<nt;i++){const o=12+i*16;T[String.fromCharCode(u[o],u[o+1],u[o+2],u[o+3])]={off:dv.getUint32(o+8),len:dv.getUint32(o+12)}}
  if(!T.glyf||!T.loca)throw new Error("Only TrueType (glyf) fonts are supported");this.dv=dv;this.T=T;this.upm=dv.getUint16(T.head.off+18);this.locFmt=dv.getInt16(T.head.off+50);this.nHM=dv.getUint16(T.hhea.off+34);this.asc=dv.getInt16(T.hhea.off+4);this.desc=dv.getInt16(T.hhea.off+6);this.nG=dv.getUint16(T.maxp.off+4);
  this.cmap=this._cmap();this.kern=this._kern();this.cache={}}
Font.prototype._cmap=function(){const dv=this.dv,b=this.T.cmap.off,n=dv.getUint16(b+2);let best=null;for(let i=0;i<n;i++){const pid=dv.getUint16(b+4+i*8),eid=dv.getUint16(b+6+i*8),off=dv.getUint32(b+8+i*8),fmt=dv.getUint16(b+off);if((pid===3&&(eid===1||eid===10))||pid===0){if(fmt===12||(fmt===4&&(!best||best.fmt!==12)))best={off:b+off,fmt}}}
  const map=new Map();if(!best)return map;const o=best.off;if(best.fmt===4){const sc=dv.getUint16(o+6)/2,ends=o+14,starts=ends+sc*2+2,deltas=starts+sc*2,ros=deltas+sc*2;for(let s=0;s<sc;s++){const e=dv.getUint16(ends+s*2),st=dv.getUint16(starts+s*2),de=dv.getInt16(deltas+s*2),ro=dv.getUint16(ros+s*2);if(st===0xFFFF)continue;
      for(let c=st;c<=e&&c<0x30000;c++){let g;if(!ro)g=(c+de)&0xFFFF;else{const ga=ros+s*2+ro+(c-st)*2;g=dv.getUint16(ga);if(g)g=(g+de)&0xFFFF}if(g)map.set(c,g)}}}
  else{const ng=dv.getUint32(o+12);for(let i=0;i<ng;i++){const sc=dv.getUint32(o+16+i*12),ec=dv.getUint32(o+20+i*12),sg=dv.getUint32(o+24+i*12);for(let c=sc;c<=ec&&c-sc<70000;c++)map.set(c,sg+(c-sc))}}return map};
Font.prototype._kern=function(){const k=new Map();if(!this.T.kern)return k;const dv=this.dv,b=this.T.kern.off;try{if(dv.getUint16(b)!==0)return k;const n=dv.getUint16(b+2);let o=b+4;for(let t=0;t<n;t++){const len=dv.getUint16(o+2),cov=dv.getUint16(o+4);if((cov>>8)===0){const np=dv.getUint16(o+6);for(let i=0;i<np;i++){const p=o+14+i*6;k.set(dv.getUint16(p)*65536+dv.getUint16(p+2),dv.getInt16(p+4))}}o+=len}}catch(e){}return k};
Font.prototype.gid=function(cp){return this.cmap.get(cp)||0};
Font.prototype.adv=function(g){const dv=this.dv,b=this.T.hmtx.off;return dv.getUint16(b+4*Math.min(g,this.nHM-1))};
Font.prototype.glyph=function(g){if(this.cache[g])return this.cache[g];const dv=this.dv,lo=this.T.loca.off,go=this.T.glyf.off;const a=this.locFmt?dv.getUint32(lo+g*4):dv.getUint16(lo+g*2)*2,b2=this.locFmt?dv.getUint32(lo+g*4+4):dv.getUint16(lo+g*2+2)*2;const out=[];
  if(b2>a){const o=go+a,nc=dv.getInt16(o);if(nc>=0){const ends=[];for(let i=0;i<nc;i++)ends.push(dv.getUint16(o+10+i*2));const np=nc?ends[nc-1]+1:0,il=dv.getUint16(o+10+nc*2);let p=o+12+nc*2+il;const fl=[];while(fl.length<np){const f=dv.getUint8(p++);fl.push(f);if(f&8){let r=dv.getUint8(p++);while(r--)fl.push(f)}}
      const xs=[],ys=[];let v=0;for(let i=0;i<np;i++){const f=fl[i];if(f&2){const d=dv.getUint8(p++);v+=f&16?d:-d}else if(!(f&16)){v+=dv.getInt16(p);p+=2}xs.push(v)}v=0;for(let i=0;i<np;i++){const f=fl[i];if(f&4){const d=dv.getUint8(p++);v+=f&32?d:-d}else if(!(f&32)){v+=dv.getInt16(p);p+=2}ys.push(v)}
      let s=0;for(const e of ends){const pts=[];for(let i=s;i<=e;i++)pts.push([xs[i],ys[i],fl[i]&1]);s=e+1;if(pts.length)out.push(pts)}}
    else{let p=o+10,more=true;while(more){const f=dv.getUint16(p),gi=dv.getUint16(p+2);p+=4;let dx,dy;if(f&1){dx=dv.getInt16(p);dy=dv.getInt16(p+2);p+=4}else{dx=dv.getInt8(p);dy=dv.getInt8(p+1);p+=2}let m=[1,0,0,1];if(f&8){const s=dv.getInt16(p)/16384;m=[s,0,0,s];p+=2}else if(f&0x40){m=[dv.getInt16(p)/16384,0,0,dv.getInt16(p+2)/16384];p+=4}else if(f&0x80){m=[dv.getInt16(p)/16384,dv.getInt16(p+2)/16384,dv.getInt16(p+4)/16384,dv.getInt16(p+6)/16384];p+=8}
        if(!(f&2)){dx=0;dy=0}for(const c of this.glyph(gi))out.push(c.map(([x,y,on])=>[m[0]*x+m[2]*y+dx,m[1]*x+m[3]*y+dy,on]));more=!!(f&0x20)}}}
  return this.cache[g]=out};
/* outline -> polylines in pixels; transform maps font units (y up) to canvas */
Font.prototype.contours=function(g,tf){const res=[];for(const pts0 of this.glyph(g)){const n=pts0.length;if(!n)continue;let st=pts0.findIndex(p=>p[2]);let pts;if(st<0){const a=pts0[0],b=pts0[1%n];pts=[[(a[0]+b[0])/2,(a[1]+b[1])/2,1]].concat(pts0.slice(1),[pts0[0]]);st=0}else pts=pts0.slice(st).concat(pts0.slice(0,st));
    const c=[],P=(x,y)=>{const q=tf(x,y);c.push(q[0],q[1])};const m=pts.length;P(pts[0][0],pts[0][1]);let i=1;let cx=pts[0][0],cy=pts[0][1];
    while(i<=m){const p=pts[i%m];if(p[2]){P(p[0],p[1]);cx=p[0];cy=p[1];i++}else{let nx,ny;const q=pts[(i+1)%m];if(q[2]){nx=q[0];ny=q[1];i+=2}else{nx=(p[0]+q[0])/2;ny=(p[1]+q[1])/2;i+=1}
        const A=tf(cx,cy),B=tf(p[0],p[1]),E=tf(nx,ny),tmp=[];flattenQuad(tmp,A[0],A[1],B[0],B[1],E[0],E[1]);for(let k=0;k<tmp.length;k++)c.push(tmp[k]);cx=nx;cy=ny}}res.push(c)}return res};
/* text layout and drawing */
function measure(font,str,size,sp){str=String(str||"");let w=0,prev=0;const s=size/font.upm;for(const ch of str){const g=font.gid(ch.codePointAt(0));if(prev)w+=(font.kern.get(prev*65536+g)||0)*s;w+=font.adv(g)*s+(sp||0);prev=g}return Math.max(0,w-(str.length?(sp||0):0))}
Canvas.prototype.text=function(font,str,x,y,size,paint,o){o=o||{};str=String(str||"");const sp=o.sp||0,w=measure(font,str,size,sp);let cx=o.align==="right"?x-w:o.align==="center"?x-w/2:x;const s=size/font.upm,all=[];let prev=0;
  const rot=o.rotate||0,cs=Math.cos(rot),sn=Math.sin(rot),ox=o.ox!=null?o.ox:0,oy=o.oy!=null?o.oy:0;
  for(const ch of str){const g=font.gid(ch.codePointAt(0));if(prev)cx+=(font.kern.get(prev*65536+g)||0)*s;const gx=cx;for(const c of font.contours(g,(fx,fy)=>{const px=gx+fx*s,py=y-fy*s;if(!rot)return [px,py];const dx=px-ox,dy=py-oy;return [ox+dx*cs-dy*sn,oy+dx*sn+dy*cs]}))all.push(c);cx+=font.adv(g)*s+sp;prev=g}
  if(all.length)this.fillContours(all,paint);return w};
const wrap=(font,t,size,maxW)=>{const out=[];String(t||"").split("\n").forEach(par=>{let line="";par.split(/\s+/).forEach(wd=>{const tst=line?line+" "+wd:wd;if(measure(font,tst,size)>maxW&&line){out.push(line);line=wd}else line=tst});if(line)out.push(line)});return out};
/* ---------- the Content Studio flyer layout (same geometry as the browser editor) ---------- */
const FORMATS={portrait:{w:1080,h:1350},square:{w:1080,h:1080},story:{w:1080,h:1920},thumb:{w:1280,h:720},landscape:{w:1200,h:630}};
async function renderPost(P,brand,assets){const F=FORMATS[P.format]||FORMATS.portrait,W=F.w,H=F.h,cv=new Canvas(W,H),warn=[],boxes={};const b=brand||{};
  const col=Object.assign({primary:"#F4A987",secondary:"#f3eee6",accent:"#F4A987",bg:"#0d0d0f",text:"#f7f2ea"},b.colors||{}),light=(P.theme||b.theme)==="light";
  const fd=assets.fonts.display,fbB=assets.fonts.bodyBold||fd,fbM=assets.fonts.bodyMedium||assets.fonts.body,fb=assets.fonts.body;
  const wide=W>H,m=Math.round(Math.min(W,H)*.055),U=Math.min(W,H)/1080,ink=light?"#0b0d12":col.text,muted=light?[11/255,13/255,18/255,.72]:hexA(col.text,.78);
  cv.fillRect(0,0,W,H,solid(col.bg));
  if(assets.bg){const im=assets.bg,z=Math.max(1,Number(P.bgZoom)||1),s=Math.max(W/im.w,H/im.h)*z,dw=im.w*s,dh=im.h*s,fx=(Number(P.bgX)||50)/100,fy=(Number(P.bgY)||50)/100;cv.drawImage(im,(W-dw)*fx,(H-dh)*fy,dw,dh)}
  else cv.fillRect(0,0,W,H,radial(W*.8,H*.25,Math.max(W,H)*.8,[[0,hexA(col.primary,.55)],[.45,hexA(col.secondary,.18)],[1,hexA(col.bg,0)]]));
  const bgc=light?"#ffffff":col.bg;cv.fillRect(0,0,W,H,linear(0,0,W*(wide?.75:.9),0,[[0,hexA(bgc,light?.92:.9)],[.55,hexA(bgc,light?.6:.5)],[1,hexA(bgc,0)]]));
  const bandC=light?"#0b1020":col.bg,by0=H*(wide?.55:.58);cv.fillRect(0,by0,W,H-by0,linear(0,by0,0,H,[[0,hexA(bandC,0)],[.45,hexA(bandC,.88)],[1,hexA(bandC,.98)]]));
  const bandInk=light?"#f4f6fb":col.text,bandMuted=light?[244/255,246/255,251/255,.75]:hexA(col.text,.75);
  let y=m;const logoBoxW=W*(wide?.3:.5),logoBoxH=H*(wide?.13:.1);
  if(assets.logo){const im=assets.logo,s=Math.min(logoBoxW/im.w,logoBoxH/im.h),lw=Math.round(im.w*s),lh=Math.round(im.h*s);cv.drawImage(im,m,y,lw,lh);boxes.logo={x:m,y,w:lw,h:lh,scale:s};y+=lh}
  else{cv.text(fd,b.name||"Grooveville",m,y+70*U,Math.round(70*U),solid(col.primary));y+=80*U;warn.push("No logo PNG; the brand name was used instead")}
  if(P.tagline){y+=34*U;cv.text(fbM,String(P.tagline).toUpperCase(),m+2,y,Math.round(19*U),solid(muted),{sp:7*U})}
  if(P.kicker&&!wide){const L=String(P.kicker).split("\n").slice(0,3);L.forEach((l,i)=>cv.text(fbM,l.toUpperCase(),W-m,m+24*U+i*30*U,Math.round(18*U),solid(light?ink:col.accent),{sp:6*U,align:"right"}));cv.fillRect(W-m-90*U,m+24*U+L.length*30*U-8*U,90*U,4*U,solid(col.accent))}
  const lines=(P.headline||[]).filter(Boolean).slice(0,4),acc=P.accent>=0&&P.accent<lines.length?P.accent:lines.length-1,maxW=wide?W*.58:(assets.bg?W*.62:W-2*m);
  const hs0=Math.round((wide?118:P.format==="story"?138:P.format==="square"?104:118)*U);let hs=hs0;while(hs>30&&Math.max(0,...lines.map(l=>measure(fd,l,hs)))>maxW)hs-=4;if(hs<hs0*.55)warn.push("Headline is long; it was shrunk to "+Math.round(hs/hs0*100)+"%");
  y+=(wide?60:P.format==="story"?120:80)*U;const hTop=y;
  lines.forEach((l,i)=>{y+=hs*.98;const lw=measure(fd,l,hs);cv.text(fd,l,m-2*U,y,hs,i===acc?(lines.length>1?solid(col.accent):linear(m,0,m+lw,0,[[0,col.accent],[1,light?col.accent:col.secondary]])):solid(ink))});boxes.headline={x:m,y:hTop,w:maxW,h:y-hTop+hs*.25,size:hs};
  if(P.subline){y+=46*U;String(P.subline).split("\n").slice(0,4).forEach((l,i)=>cv.text(fbM,l.toUpperCase(),m,y+i*34*U,Math.round(21*U),solid(muted),{sp:8*U}))}
  const pillH=Math.round((wide?78:92)*U),pillY=H-m-pillH;
  if(P.cta){const ts=Math.round(27*U),tw=measure(fbB,String(P.cta).toUpperCase(),ts,6*U),pw=Math.max(W*(wide?.26:.38),tw+130*U),pill=roundRect(m,pillY,pw,pillH,pillH/2);
    const msk=rasterize(pill);if(msk){const gl=blurMask(msk,40*U/2);cv.blendMask(gl.m,gl.x,gl.y,gl.w,gl.h,solid(hexA(col.accent,.55)))}cv.fillContours(pill,light?solid(col.accent):linear(m,0,m+pw,0,[[0,col.accent],[1,col.secondary]]));
    const ic=light?"#0b0d12":"#140c08";cv.text(fbB,String(P.cta).toUpperCase(),m+42*U,pillY+pillH/2+10*U,ts,solid(ic),{sp:6*U});const ax=m+pw-58*U,ay=pillY+pillH/2;cv.stroke([[ax,ay,ax+28*U,ay],[ax+16*U,ay-12*U,ax+28*U,ay,ax+16*U,ay+12*U]],3.2*U,solid(ic));boxes.cta={x:m,y:pillY,w:pw,h:pillH};if(tw>pw-100*U)warn.push("Button text is tight")}
  if(P.url){const us=Math.round(21*U),uw=measure(fbM,String(P.url).toUpperCase(),us,9*U);cv.text(fbM,String(P.url).toUpperCase(),W-m,pillY+pillH/2+8*U,us,solid(bandMuted),{sp:9*U,align:"right"});cv.fillRect(W-m-uw-130*U,pillY+pillH/2,100*U,2*U,solid(bandMuted));if(boxes.cta&&W-m-uw-130*U<boxes.cta.x+boxes.cta.w)warn.push("Web address overlaps the button")}
  if(P.where){const ly=pillY-(wide?24:30)*U;if(assets.icons&&assets.icons.pin){const isz=26*U;cv.stroke(svgPath(assets.icons.pin,(px,py)=>[m+px*isz/24,ly-22*U+py*isz/24]),2*isz/24,solid(col.accent))}cv.text(fbB,String(P.where).toUpperCase().slice(0,60),m+36*U,ly,Math.round(20*U),solid(bandInk),{sp:5*U})}
  const feats=(P.features||[]).filter(f=>f&&f.title).slice(0,wide?0:5);
  if(feats.length){const n=feats.length,top=pillY-(P.format==="story"?330:P.format==="square"?210:250)*U-(P.where?44*U:0),cw=(W-2*m)/n;
    feats.forEach((f,i)=>{const cx=m+cw*i+cw/2;if(i)cv.fillRect(m+cw*i-.75*U,top,1.5*U,170*U,solid(light?[244/255,246/255,251/255,.18]:hexA(col.text,.16)));
      const isz=Math.round(64*U),ipath=(assets.icons||{})[f.icon]||(assets.icons||{}).star;if(ipath)cv.stroke(svgPath(ipath,(px,py)=>[cx-isz/2+px*isz/24,top+py*isz/24]),1.7*isz/24,solid([col.accent,col.secondary,col.primary,col.accent][i%4]||col.accent));
      const ts=Math.round((n>4?18:21)*U),tl=wrap(fbB,String(f.title).toUpperCase(),ts,cw-16*U).slice(0,2);tl.forEach((l,j)=>cv.text(fbB,l,cx,top+isz+40*U+j*26*U,ts,solid(bandInk),{align:"center"}));
      const ds=Math.round((n>4?17:19)*U),dl=wrap(fb,f.text,ds,cw-20*U);if(dl.length>2)warn.push("Feature text “"+f.title+"” was cut to two lines");dl.slice(0,2).forEach((l,j)=>cv.text(fb,l,cx,top+isz+46*U+tl.length*26*U+j*25*U,ds,solid(bandMuted),{align:"center"}))});
    if(top<y+20*U)warn.push("Feature row overlaps the headline area")}
  /* readability: contrast of headline text against what's behind it */
  if(boxes.headline){const bgL=cv.avgLum(boxes.headline.x,boxes.headline.y,boxes.headline.w,boxes.headline.h),c=parseColor(ink),L=x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4),tL=.2126*L(c[0])+.7152*L(c[1])+.0722*L(c[2]),ratio=(Math.max(bgL,tL)+.05)/(Math.min(bgL,tL)+.05);boxes.headline.contrast=Math.round(ratio*10)/10;if(ratio<3)warn.push("Low contrast behind the headline ("+ratio.toFixed(1)+":1)")}
  const rgba=cv.toRGBA();for(let i=3;i<rgba.length;i+=4)rgba[i]=255;const png=await encodePNG(W,H,rgba,true);return {png,w:W,h:H,warnings:warn,boxes,rgba}}
/* ---------- poster layout: cinematic event flyers and social posts ----------
   The photo (and, when the AI lettered it, the title) comes from the background art. Everything that must be exact
   (logo, dates, times, venue, lineup, web address) is drawn here from the real data, so it is always spelled right. */
const STYLES={
  brand:{l:"Brand look",title:"anton",script:"kaushan",info:"bebas"},
  trending:{l:"Trending",title:"anton",script:"kaushan",info:"bebas",fill:["#FFF4E6","#F4A987","#B5532A"],glow:"#F4A987",edge:"#1a0d07"},
  halloween:{l:"Halloween",title:"creepster",script:"kaushan",info:"bebas",fill:["#FFE29A","#FF7A00","#7A1500"],glow:"#FF5A00",edge:"#140400"},
  homecoming:{l:"Homecoming",title:"anton",script:"greatvibes",info:"bebas",fill:["#FFF8DC","#F2C14E","#8C5E10"],glow:"#F2C14E",edge:"#1c1204"},
  voting:{l:"Voting",title:"anton",script:"marker",info:"bebas",fill:["#FFFFFF","#F3E9DC","#B9A58C"],glow:"#E63946",edge:"#0d0d14"},
  concert:{l:"Concert / Tour",title:"bebas",script:"kaushan",info:"bebas",fill:["#FFF6E0","#FFC46B","#A8641A"],glow:"#FFB347",edge:"#140b02"},
  newmusic:{l:"New Music",title:"archivo",script:"marker",info:"bebas",fill:["#E8FAFF","#5CC8FF","#1A4FB5"],glow:"#29B6F6",edge:"#020a18"},
  party:{l:"Party / Club",title:"bebas",script:"pacifico",info:"bebas",fill:["#FFE6F6","#FF5CC0","#8E1766"],glow:"#FF2FA8",edge:"#16020f"},
  brunch:{l:"Brunch / Day Party",title:"abril",script:"pacifico",info:"bebas",fill:["#FFF3E3","#FFB48A","#D9573A"],glow:"#FF9F6E",edge:"#1a0904"},
  birthday:{l:"Birthday",title:"abril",script:"greatvibes",info:"bebas",fill:["#FFFBEA","#F5CF6B","#9E7414"],glow:"#FFD27A",edge:"#160f02"},
  motivation:{l:"Motivation",title:"anton",script:"kaushan",info:"bebas",fill:["#FFFFFF","#F7E7CE","#C9A96E"],glow:"#F4A987",edge:"#0e0b07"},
  holiday:{l:"Holidays & seasonal",title:"abril",script:"greatvibes",info:"bebas",fill:["#FFF8E7","#E8C872","#A31F24"],glow:"#E8C872",edge:"#140404"}};
function styleFor(P,b){const s=Object.assign({},STYLES[P.style]||STYLES.brand),c=Object.assign({primary:"#F4A987",secondary:"#f3eee6",accent:"#F4A987",text:"#f7f2ea"},(b&&b.colors)||{});
  if(!s.fill)s.fill=[c.text||"#fff",c.accent||c.primary,c.primary];if(!s.glow)s.glow=c.accent||c.primary;if(!s.edge)s.edge="#0b0907";s.ink=c.text||"#f7f2ea";s.accent=s.fill[1];return s}
function shape(font,str,x,y,size,o){o=o||{};str=String(str||"");const sp=o.sp||0,sx=o.sx||1,w=measure(font,str,size,sp)*sx;let cx=o.align==="right"?x-w:o.align==="center"?x-w/2:x;const s=size/font.upm,all=[];let prev=0;
  const rot=o.rotate||0,cs=Math.cos(rot),sn=Math.sin(rot),ox=o.ox!=null?o.ox:x,oy=o.oy!=null?o.oy:y,sk=o.skew||0;
  for(const ch of str){const g=font.gid(ch.codePointAt(0));if(prev)cx+=(font.kern.get(prev*65536+g)||0)*s*sx;const gx=cx;
    for(const c of font.contours(g,(fx,fy)=>{let px=gx+(fx*s+fy*s*sk)*sx,py=y-fy*s;if(!rot)return [px,py];const dx=px-ox,dy=py-oy;return [ox+dx*cs-dy*sn,oy+dx*sn+dy*cs]}))all.push(c);cx+=(font.adv(g)*s+sp)*sx;prev=g}
  return {c:all,w}}
/* layered display type: shadow, glow, 3D extrusion, outline, gradient face */
function fancy(cv,sh,size,st,o){o=o||{};if(!sh.c.length)return;const r=rasterize(sh.c);if(!r)return;const U=size/100;
  const sb=blurMask(r,10*U);cv.blendMask(sb.m,sb.x+6*U|0,sb.y+12*U|0,sb.w,sb.h,solid([0,0,0,.75]));
  if(o.glow!==false){const g=blurMask(r,26*U);cv.blendMask(g.m,g.x,g.y,g.w,g.h,solid(hexA(st.glow,.55)));const g2=blurMask(r,8*U);cv.blendMask(g2.m,g2.x,g2.y,g2.w,g2.h,solid(hexA(st.glow,.45)))}
  const depth=Math.max(2,Math.round((o.depth==null?7:o.depth)*U)),dk=parseColor(st.fill[2]);for(let i=depth;i>=1;i--){const t=i/depth;cv.blendMask(r.m,r.x+Math.round(i*.35),r.y+i,r.w,r.h,solid([dk[0]*(1-t*.6),dk[1]*(1-t*.6),dk[2]*(1-t*.6),1]))}
  const ow=blurMask(r,Math.max(2,3.2*U));for(let i=0;i<ow.m.length;i++)ow.m[i]=Math.min(1,ow.m[i]*3.2);cv.blendMask(ow.m,ow.x,ow.y,ow.w,ow.h,solid(st.edge));
  cv.blendMask(r.m,r.x,r.y,r.w,r.h,linear(0,r.y,0,r.y+r.h,[[0,st.fill[0]],[.48,st.fill[1]],[1,st.fill[2]]]));
  const hl=new Float32Array(r.m.length);for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){const i=y*r.w+x,up=y>2?r.m[i-3*r.w]:0;hl[i]=Math.max(0,r.m[i]-up)*.55}cv.blendMask(hl,r.x,r.y,r.w,r.h,solid([1,1,1,.8]))}
function plain(cv,sh,paint,shadow){if(!sh.c.length)return;const r=rasterize(sh.c);if(!r)return;if(shadow){const s=blurMask(r,shadow);cv.blendMask(s.m,s.x,s.y+2,s.w,s.h,solid([0,0,0,.8]))}cv.blendMask(r.m,r.x,r.y,r.w,r.h,paint)}
const DAYS=["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"],MONS=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function whenLines(P){const W=(Array.isArray(P.when)?P.when:[]).filter(Boolean).map(s=>String(s).toUpperCase());if(!/^\d{4}-\d{2}-\d{2}$/.test(P.eventDate||""))return W.concat(P.eventTime?[String(P.eventTime).toUpperCase()]:[]).slice(0,3);
  const d=new Date(P.eventDate+"T12:00:00Z"),out=[DAYS[d.getUTCDay()],MONS[d.getUTCMonth()]+" "+d.getUTCDate()],t=P.eventTime||W.find(x=>/\d/.test(x)&&!/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/.test(x));if(t)out.push(String(t).toUpperCase());return out}
async function renderPoster(P,brand,assets){const F=FORMATS[P.format]||FORMATS.portrait,W=F.w,H=F.h,cv=new Canvas(W,H),warn=[],boxes={},b=brand||{},st=styleFor(P,b),fo=assets.fonts||{};
  const fT=fo.title||fo.display,fS=fo.script||fo.display,fI=fo.info||fo.bodyBold||fo.display,fB=fo.bodyBold||fo.display,fM=fo.bodyMedium||fo.body||fB,condI=fo.info&&!fo.infoFallback?1:.8,condT=fo.title&&!fo.titleFallback?1:.86;
  const wide=W>H*1.2,U=Math.min(W,H)/1080,m=Math.round((wide?.05:.06)*Math.min(W,H)),al=wide?"left":"center",cx=wide?m:W/2,colW=wide?W*.56:W-2*m,aiTitle=P.titleMode==="ai";
  cv.fillRect(0,0,W,H,solid("#08080a"));
  if(assets.bg){const im=assets.bg,z=Math.max(1,Number(P.bgZoom)||1),s=Math.max(W/im.w,H/im.h)*z,dw=im.w*s,dh=im.h*s,fx=(P.bgX==null?50:Number(P.bgX))/100,fy=(P.bgY==null?50:Number(P.bgY))/100;cv.drawImage(im,(W-dw)*fx,(H-dh)*fy,dw,dh)}
  else{cv.fillRect(0,0,W,H,radial(W*.5,H*.38,Math.max(W,H)*.75,[[0,hexA(st.glow,.55)],[.5,hexA(st.fill[2],.25)],[1,[0,0,0,0]]]));warn.push("No background photo yet")}
  cv.fillRect(0,0,W,H,radial(W/2,H*.45,Math.hypot(W,H)*.62,[[.55,[0,0,0,0]],[1,[0,0,0,.55]]]));
  cv.fillRect(0,0,W,H*.22,linear(0,0,0,H*.22,[[0,[0,0,0,.62]],[1,[0,0,0,0]]]));
  const sy=H*(wide?.42:.5);cv.fillRect(0,sy,W,H-sy,linear(0,sy,0,H,[[0,[0,0,0,0]],[.45,[0,0,0,.62]],[1,[0,0,0,.92]]]));
  if(wide)cv.fillRect(0,0,W*.7,H,linear(0,0,W*.7,0,[[0,[0,0,0,.6]],[1,[0,0,0,0]]]));
  /* top: official logo (original pixels, scaled only) and the host line */
  let top=m*.8;const lbW=wide?W*.24:W*.44,lbH=H*(wide?.13:P.format==="story"?.06:.075);
  if(assets.logo){const im=assets.logo,s=Math.min(lbW/im.w,lbH/im.h),lw=Math.round(im.w*s),lh=Math.round(im.h*s),lx=Math.round(wide?m:(W-lw)/2);const sh=rasterize([[lx,top,lx+lw,top,lx+lw,top+lh,lx,top+lh]]);if(sh){const g=blurMask(sh,30*U);cv.blendMask(g.m,g.x,g.y,g.w,g.h,solid([0,0,0,.35]))}cv.drawImage(im,lx,top,lw,lh);boxes.logo={x:lx,y:top,w:lw,h:lh,scale:s};top+=lh}
  else{const ns=Math.round(40*U);plain(cv,shape(fI,String(b.name||"Grooveville").toUpperCase(),cx,top+ns,ns,{align:al,sp:4*U,sx:condI}),solid(st.accent),4*U);top+=ns+8*U;warn.push("No logo PNG for "+(b.name||"this brand")+"; the name was set in type. Add a logo in Brand Kits.")}
  if(P.kicker){top+=30*U;String(P.kicker).split("\n").slice(0,2).forEach((l,i)=>{plain(cv,shape(fM,l.toUpperCase(),cx,top+i*28*U,Math.round(20*U),{align:al,sp:7*U}),solid(hexA(st.ink,.92)),3*U)});top+=(String(P.kicker).split("\n").slice(0,2).length-1)*28*U}
  /* bottom up: web address, venue, lineup bar, date block, details */
  const when=whenLines(P),lineup=String(P.lineup||"").trim(),where=String(P.where||"").trim(),details=String(P.details||"").trim(),url=String(P.url||"").trim(),cta=String(P.cta||"").trim();
  let k=1;const minInfoTop=aiTitle?H*(wide?.5:.63):0;let plan;
  for(let tries=0;tries<8;tries++){let y=H-m*.85;const items=[];
    if(url||cta){const s=Math.round(19*U*k);items.push({t:"url",y,s});y-=s+22*U*k}
    if(where){const s=Math.round(23*U*k);items.push({t:"where",y,s});y-=s+20*U*k}
    if(lineup){const s=Math.round(30*U*k);y-=10*U*k;items.push({t:"lineup",y,s});y-=s+36*U*k}
    if(when.length){const big=Math.round((wide?78:96)*U*k),sm=Math.round(34*U*k);const L=when.slice();const h=(L.length>2?sm+8*U*k:0)+big+(L.length>1?sm+12*U*k:0);items.push({t:"when",y,big,sm,L});y-=h+18*U*k}
    if(details){const s=Math.round(24*U*k);items.push({t:"details",y,s});y-=s+18*U*k}
    plan={items,top:y};if(y>=minInfoTop||k<.62)break;k*=.92}
  if(plan.top<minInfoTop)warn.push("Event details may touch the title area; shorten them");
  /* title (set in type unless the artwork already carries the lettering) */
  const zoneT=top+(wide?40:54)*U,zoneB=plan.top-(wide?20:28)*U,lines=(P.headline||[]).map(s=>String(s||"").trim()).filter(Boolean).slice(0,4);
  if(!aiTitle&&lines.length){const scr=String(P.script||"").trim();let size=Math.round((P.format==="story"?210:wide?150:190)*U);const fit=()=>{const hw=Math.max(...lines.map(l=>measure(fT,l.toUpperCase(),size)*condT));const scH=scr?size*.62:0;return hw<=colW&&lines.length*size*.9+scH<=Math.max(120*U,zoneB-zoneT)};
    while(size>40*U&&!fit())size-=4;if(size<70*U)warn.push("The title is long; it was set small");const scH=scr?size*.62:0,blockH=lines.length*size*.9+scH,y0=zoneT+Math.max(0,(zoneB-zoneT-blockH)*(wide?.5:.62));
    let y=y0;lines.forEach((l,i)=>{y+=size*.9;fancy(cv,shape(fT,l.toUpperCase(),cx,y,size,{align:al,sx:condT}),size,st)});
    if(scr){let ss=Math.round(size*.8);while(ss>30*U&&measure(fS,scr,ss)>colW*.9)ss-=4;const sy2=y+ss*.74;fancy(cv,shape(fS,scr,wide?cx+20*U:cx+30*U,sy2,ss,{align:al,rotate:-.07,ox:cx,oy:sy2}),ss*.7,Object.assign({},st,{fill:[st.ink,st.ink,st.fill[1]]}),{depth:2});y=sy2}
    boxes.title={x:wide?m:(W-colW)/2,y:y0,w:colW,h:y-y0+size*.2,size}}
  else if(aiTitle)boxes.title={ai:true,y:zoneT,h:zoneB-zoneT};
  else warn.push("No title text");
  for(const it of plan.items){
    if(it.t==="url"){const txt=(url||"").toUpperCase();if(cta&&P.showCta){const ts=it.s,tw=measure(fB,cta.toUpperCase(),ts,4*U),pw=tw+60*U,ph=ts+30*U,px=wide?m:(W-pw)/2,py=it.y-ph+8*U;cv.fillContours(roundRect(px,py,pw,ph,ph/2),solid(st.accent));plain(cv,shape(fB,cta.toUpperCase(),px+pw/2,py+ph/2+ts*.36,ts,{align:"center",sp:4*U}),solid("#140c08"))}
      else if(txt){plain(cv,shape(fM,txt,cx,it.y,it.s,{align:al,sp:8*U}),solid(hexA(st.ink,.85)),3*U)}}
    if(it.t==="where"){const ip=assets.icons&&assets.icons.pin,tw=measure(fB,where.toUpperCase(),it.s,4*U),x0=wide?m+34*U:W/2-tw/2+17*U;if(ip){const isz=it.s*1.15;cv.stroke(svgPath(ip,(px,py)=>[x0-34*U+px*isz/24,it.y-it.s*.95+py*isz/24]),2*isz/24,solid(st.accent))}plain(cv,shape(fB,where.toUpperCase().slice(0,60),x0,it.y,it.s,{sp:4*U}),solid(st.ink),3*U)}
    if(it.t==="lineup"){const parts=lineup.split(/\s*[|•·,]\s*/).filter(Boolean).slice(0,5).map(s=>s.toUpperCase()),sep="   |   ";let s=it.s;while(s>14*U&&measure(fI,parts.join(sep),s,2*U)*condI>colW-50*U)s-=2;
      const tw=measure(fI,parts.join(sep),s,2*U)*condI,bw=Math.min(colW,tw+70*U),bx=wide?m:(W-bw)/2,by=it.y-s-12*U,bh=s+30*U;cv.fillRect(bx,by,bw,bh,solid([0,0,0,.45]));
      [[bx,by,bw,2*U],[bx,by+bh-2*U,bw,2*U],[bx,by,2*U,bh],[bx+bw-2*U,by,2*U,bh]].forEach(([a,c,d,e])=>cv.fillRect(a,c,d,e,solid(hexA(st.accent,.9))));
      plain(cv,shape(fI,parts.join(sep),bx+bw/2,it.y+2*U,s,{align:"center",sp:2*U,sx:condI}),solid(st.ink))}
    if(it.t==="when"){const L=it.L;let y=it.y;const rows=[];if(L.length>1)rows.unshift({t:L[L.length-1],s:it.sm,c:st.ink});rows.unshift({t:L.length>1?L[L.length-2]:L[0],s:it.big,c:"big"});if(L.length>2)rows.unshift({t:L[0],s:it.sm,c:st.accent});
      const hs=rows.map(r=>r.s+(r.c==="big"?6*U:10*U));let yy=y-hs.reduce((a,c)=>a+c,0);for(const r of rows){yy+=r.s+(r.c==="big"?0:4*U);if(r.c==="big")fancy(cv,shape(fI,r.t,cx,yy,r.s,{align:al,sp:3*U,sx:condI}),r.s*.55,st,{depth:3});else plain(cv,shape(fI,r.t,cx,yy,r.s,{align:al,sp:6*U,sx:condI}),solid(r.c),3*U);yy+=r.c==="big"?6*U:6*U}}
    if(it.t==="details"){plain(cv,shape(fB,details.toUpperCase().slice(0,70),cx,it.y,it.s,{align:al,sp:5*U}),solid(st.accent),3*U)}}
  const rgba=cv.toRGBA();for(let i=3;i<rgba.length;i+=4)rgba[i]=255;const png=assets.noPng?null:await encodePNG(W,H,rgba,true);return {png,w:W,h:H,warnings:warn,boxes,rgba}}
function render(P,brand,assets){return P.layout==="poster"?renderPoster(P,brand,assets):renderPost(P,brand,assets)}
return {Canvas,Font,decodePNG,encodePNG,renderPost,renderPoster,render,STYLES,styleFor,whenLines,svgPath,measure,parseColor,FORMATS,rasterize}})();

export { GVR };

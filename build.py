import base64,sys,os
reset=open('reset.css').read().strip()
def src(backend):
    S=open('part1.html').read()+open('part2.js').read()+open('part3.js').read()+open('part4.js').read()+open('part5.js').read()
    for k in ['__SELF__','__SNAP__','__RESET__','__LOGO__','__BACKEND__']: assert S.count(k)==1,(k,S.count(k))
    return S.replace('__RESET__',base64.b64encode(reset.encode()).decode()).replace('__LOGO__',open('logo.txt').read().strip()).replace('__BACKEND__',backend)
snap='{"events":[],"brands":{}}'
S=src('claude')
F=S.replace('__SELF__',base64.b64encode(S.encode()).decode()).replace('__SNAP__',snap)
open('grooveville.html','w').write(F); print('claude',len(F))
G=src('firebase').replace('__SELF__','').replace('__SNAP__',snap)
i=G.index('<header class="nav">')
head,body=G[:i],G[i:]
fb='<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>\n<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>\n<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>\n<script src="firebase-config.js"></script>\n'
body=body.replace('<script>\n(function(){',fb+'<script>\n(function(){',1)
html='<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="description" content="Grooveville LLC, the DrawUp Headquarters, and the companies on the Groove Vine.">\n<link rel="icon" href="logo.webp">\n<style>'+reset+'</style>\n'+head+'</head>\n<body>\n'+body+'\n</body>\n</html>\n'
os.makedirs('github',exist_ok=True); open('github/index.html','w').write(html); print('github',len(html))

const CACHE='andrey-fit-shell-v1';
const scope=self.registration.scope;
const shell=[
  scope,
  new URL('manifest.webmanifest',scope).href,
  new URL('icons/icon-192.png',scope).href,
  new URL('icons/icon-512.png',scope).href
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  if(req.mode==='navigate'){
    event.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(cache=>cache.put(scope,copy));
        return res;
      }).catch(()=>caches.match(scope))
    );
    return;
  }

  if(['script','style','image','font'].includes(req.destination)){
    event.respondWith(
      caches.match(req).then(cached=>cached||fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy));
        return res;
      }))
    );
  }
});
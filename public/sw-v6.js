const STATIC_CACHE='andrey-fit-static-v8'
const STATIC_PREFIX='andrey-fit-static-'

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith(STATIC_PREFIX)&&key!==STATIC_CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  )
})

self.addEventListener('fetch',event=>{
  const request=event.request
  if(request.method!=='GET')return

  const url=new URL(request.url)
  if(url.origin!==self.location.origin)return

  // Never cache API/user data. Only immutable build assets and static PWA resources.
  const immutableAsset=url.pathname.startsWith('/assets/')
  const staticPwaAsset=
    url.pathname.startsWith('/icons/')||
    url.pathname==='/manifest.json'||
    url.pathname==='/manifest.webmanifest'||
    url.pathname==='/manifest-trainer.json'

  if(immutableAsset){
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache=>{
        const cached=await cache.match(request)
        if(cached)return cached
        const response=await fetch(request)
        if(response.ok)void cache.put(request,response.clone())
        return response
      })
    )
    return
  }

  if(staticPwaAsset){
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache=>{
        const cached=await cache.match(request)
        const network=fetch(request).then(response=>{
          if(response.ok)void cache.put(request,response.clone())
          return response
        }).catch(()=>cached)
        return cached||network
      })
    )
    return
  }

  // HTML stays network-first so deployments are picked up immediately.
  // The last successful shell is only a fallback when the network is unavailable.
  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request).then(async response=>{
        if(response.ok){
          const cache=await caches.open(STATIC_CACHE)
          void cache.put('/__app_shell__',response.clone())
        }
        return response
      }).catch(async()=>{
        const cache=await caches.open(STATIC_CACHE)
        return (await cache.match('/__app_shell__'))||Response.error()
      })
    )
  }
})

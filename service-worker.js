try{importScripts('./dso-images.js')}catch(e){}
const CACHE='celestia-atlas-offline-v9';
const CORE=[
  './',
  './index.html',
  './styles.css',
  './dso-images.js',
  './catalog.js',
  './dso-catalog.js',
  './milky-way-renderer.js',
  './vendor/astronomy-engine-2.1.19.min.js',
  './solar-system-standalone.js',
  './app-v8.js',
  './manifest.webmanifest',
  './assets/milky-way.webp'
];
const IMAGES=Array.isArray(globalThis.DSO_IMAGE_FILES)?globalThis.DSO_IMAGE_FILES:[];

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(CORE);
  await Promise.allSettled(IMAGES.map(file=>cache.add(file)));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

async function networkFirst(request,fallback){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok)await cache.put(request,response.clone());
    return response;
  }catch(error){
    return (await cache.match(request))||(fallback?await cache.match(fallback):undefined)||Response.error();
  }
}

async function cacheFirst(request){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request);
  if(cached)return cached;
  try{
    const response=await fetch(request);
    if(response&&response.ok)await cache.put(request,response.clone());
    return response;
  }catch(error){return Response.error()}
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(networkFirst(event.request,'./index.html'));
    return;
  }
  if(url.pathname.includes('/images/dso/')||url.pathname.includes('/assets/')){
    event.respondWith(cacheFirst(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request));
});

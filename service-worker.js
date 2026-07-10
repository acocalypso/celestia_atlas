try{importScripts('./dso-images.js')}catch(e){}
const CACHE='celestia-atlas-offline-v4';
const CORE=['./','./index.html','./styles.css','./dso-images.js','./catalog.js','./app.js','./manifest.webmanifest'];
const IMAGES=Array.isArray(globalThis.DSO_IMAGE_FILES)?globalThis.DSO_IMAGE_FILES:[];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(CORE);await Promise.allSettled(IMAGES.map(file=>cache.add(file)));await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith((async()=>{const cached=await caches.match(event.request);if(cached)return cached;try{const response=await fetch(event.request);if(response&&response.ok){const cache=await caches.open(CACHE);cache.put(event.request,response.clone())}return response}catch(error){if(event.request.mode==='navigate')return caches.match('./index.html');throw error}})())});

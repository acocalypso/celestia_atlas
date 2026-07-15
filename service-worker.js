try{importScripts('./dso-images.js')}catch(e){}
const CACHE='celestia-atlas-offline-v30';
// Keep the survey schema independent from routine app-shell cache releases.
const SURVEY_CACHE='celestia-atlas-survey-v1';
const SURVEY_CACHE_LIMIT=96;
const ATLAS_CACHE_PREFIXES=['celestia-atlas-offline-','celestia-atlas-survey-'];
const DSS_SURVEY_ORIGIN='https://stpubdata.s3.us-east-1.amazonaws.com';
const DSS_SURVEY_PATH='/mast/skybackgrounds/DSSColor/';
const HIPS_TILE_PATH=/\/Norder\d+\/Dir\d+\/Npix\d+\.(?:jpe?g|png|webp)$/i;
const CORE=[
  './',
  './index.html',
  './styles.css',
  './standalone.css',
  './standalone-app.js',
  './dso-images.js',
  './catalog.js',
  './hyg-star-catalog.js',
  './dso-catalog.js',
  './abell-pn-catalog.js',
  './stellarium-supplement.js',
  './THIRD_PARTY_NOTICES.md',
  './docs/CATALOGUES.md',
  './licenses/Stellarium-GPL-2.0.txt',
  './licenses/HYG-CC-BY-SA-4.0.md',
  './licenses/SIMBAD-ODbL-1.0.md',
  './vendor/astronomy-engine-2.1.19.esm.js',
  './src/index.js',
  './src/public-api.js',
  './src/core/coordinates.js',
  './src/core/projection.js',
  './src/core/optics.js',
  './src/core/solar-system.js',
  './src/core/comets.js',
  './src/core/reference-lines.js',
  './src/core/landscape.js',
  './src/core/catalog-filters.js',
  './src/core/catalog-identifiers.js',
  './src/core/catalog-layers.js',
  './src/core/sky-survey.js',
  './data/comets.js',
  './manifest.webmanifest',
  './assets/milky-way.webp',
  './assets/landscapes/guereins/properties',
  './assets/landscapes/guereins/Norder0/Dir0/Npix0.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix1.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix2.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix3.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix4.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix5.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix6.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix7.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix8.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix9.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix10.webp',
  './assets/landscapes/guereins/Norder0/Dir0/Npix11.webp'
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
  const current=new Set([CACHE,SURVEY_CACHE]);
  await Promise.all(keys.filter(key=>
    !current.has(key)&&ATLAS_CACHE_PREFIXES.some(prefix=>key.startsWith(prefix))
  ).map(key=>caches.delete(key)));
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

function isDssSurveyTile(url){
  return url.origin===DSS_SURVEY_ORIGIN&&
    url.pathname.startsWith(DSS_SURVEY_PATH)&&
    HIPS_TILE_PATH.test(url.pathname);
}

function isPackagedLandscapeTile(url){
  return url.origin===self.location.origin&&
    url.pathname.includes('/assets/landscapes/')&&
    HIPS_TILE_PATH.test(url.pathname);
}

function isSurveyTile(url){
  return isDssSurveyTile(url)||(
    url.origin===self.location.origin&&
    HIPS_TILE_PATH.test(url.pathname)&&
    !isPackagedLandscapeTile(url)
  );
}

let surveyTrimQueue=Promise.resolve();
function trimSurveyCache(cache){
  surveyTrimQueue=surveyTrimQueue.catch(()=>{}).then(async()=>{
    const keys=await cache.keys();
    const excess=keys.length-SURVEY_CACHE_LIMIT;
    if(excess>0)await Promise.all(keys.slice(0,excess).map(key=>cache.delete(key)));
  });
  return surveyTrimQueue;
}

async function fetchAndCacheSurveyTile(request){
  let response;
  try{response=await fetch(request)}catch(error){return null}
  if(!response||!response.ok)return response;
  try{
    const cache=await caches.open(SURVEY_CACHE);
    // Reinsert refreshed tiles so eviction approximates least-recently-used order.
    await cache.delete(request);
    await cache.put(request,response.clone());
    await trimSurveyCache(cache);
  }catch(error){
    // Storage quota and private-mode failures must not prevent the live tile.
  }
  return response;
}

function surveyTileRequest(event){
  // Start revalidation immediately. The rejection handler keeps offline misses quiet.
  const networkUpdate=fetchAndCacheSurveyTile(event.request);
  event.waitUntil(networkUpdate.then(()=>undefined,()=>undefined));
  event.respondWith((async()=>{
    let cached;
    try{
      const cache=await caches.open(SURVEY_CACHE);
      cached=await cache.match(event.request);
    }catch(error){
      // Cache access is optional; continue with the network response.
    }
    if(cached)return cached;
    return (await networkUpdate)||Response.error();
  })());
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(isSurveyTile(url)){
    surveyTileRequest(event);
    return;
  }
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

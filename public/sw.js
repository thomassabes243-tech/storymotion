const CACHE='storymotion-static-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/icon.svg','/manifest.webmanifest']))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('storymotion-static-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin===self.location.origin&&['/icon.svg','/manifest.webmanifest'].includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});

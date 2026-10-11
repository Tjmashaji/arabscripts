const CACHE="masari-shell-v2";
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["/","/manifest.webmanifest","/favicon.svg"])))});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||!e.request.url.startsWith(self.location.origin))return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)))});
// إشعارات فورية من الخادم (حتى والتطبيق مغلق)
self.addEventListener("push",e=>{let d={};try{d=e.data?e.data.json():{}}catch{d={body:e.data&&e.data.text()}}e.waitUntil(self.registration.showNotification(d.title||"مساري",{body:d.body||"",icon:"/favicon.svg",badge:"/favicon.svg",tag:d.tag||undefined,dir:"rtl",lang:"ar",data:{url:d.url||"/"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();const url=(e.notification.data&&e.notification.data.url)||"/";e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{for(const c of list){if("focus" in c)return c.focus()}return self.clients.openWindow(url)}))});

// Firebase Messaging Service Worker
// يستقبل إشعارات الخلفية عندما تكون الصفحة مغلقة أو في الخلفية

/*
  تعليمات سريعة:
  1) استخدم نفس إعدادات Firebase هنا كما في app.js
  2) غيّر القيم أدناه إلى قيم مشروعك الفعلية من Firebase Console
*/

// تحميل مكتبات Firebase (نسخة compat لتبسيط الاستخدام داخل SW)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ضع قيم مشروعك هنا (يُفضّل مزامنتها مع app.js)
const firebaseConfig = {
  apiKey: "AIzaSyA8hb7SMywRWLJEF7RBEcBSd77vdvlG6C4",
  authDomain: "shipping-66d5b.firebaseapp.com",
  projectId: "shipping-66d5b",
  storageBucket: "shipping-66d5b.firebasestorage.app",
  messagingSenderId: "63508052085",
  appId: "1:63508052085:web:8e0d33783d8c1c0ce2e03c",
  measurementId: "G-VBF8DPCG3F"
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  // في حال تم التهيئة مسبقاً
}

// تفعيل الإصدار الجديد بسرعة
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const messaging = firebase.messaging();

// استقبال رسائل الخلفية وعرض الإشعار
messaging.onBackgroundMessage(function(payload) {
  const data = payload?.data || {};
  const title = payload?.notification?.title || data.title || 'إشعار جديد';
  const body = payload?.notification?.body || data.body || '';
  const icon = payload?.notification?.icon || data.icon || '/favicon.ico';
  const url = data.url || '/index.html';

  self.registration.showNotification(title, {
    body,
    icon,
    data: { url },
    dir: 'rtl',
    lang: 'ar',
  });
});

// فتح أو تركيز التبويب عند النقر على الإشعار
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        const url = new URL(client.url);
        if (url.pathname.endsWith(targetUrl) || client.url.includes(targetUrl)) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ===== نظام الإشعارات الدورية في الخلفية =====

// فحص المواعيد وإرسال الإشعارات
async function checkShipmentsAndNotify() {
  try {
    // محاولة جلب البيانات من IndexedDB أو localStorage
    const shipments = await getStoredShipments();
    
    if (!shipments || shipments.length === 0) {
      console.log('لا توجد شحنات للفحص');
      return;
    }
    
    const today = new Date();
    
    for (const shipment of shipments) {
      // فحص موعد الوصول
      if (shipment.arrival_date) {
        const arrivalDate = new Date(shipment.arrival_date);
        const daysLeft = Math.ceil((arrivalDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysLeft >= 0 && daysLeft <= 3) {
          await showNotification(
            'تذكير موعد الوصول',
            `الشحنة ${shipment.shipment_number} تصل خلال ${daysLeft} ${daysLeft === 0 ? 'اليوم' : daysLeft === 1 ? 'غداً' : 'أيام'}`,
            'fas fa-truck',
            '#4CAF50'
          );
        }
      }
      
      // فحص موعد الدفع
      if (shipment.payment_date) {
        const paymentDate = new Date(shipment.payment_date);
        const daysLeft = Math.ceil((paymentDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysLeft >= 0 && daysLeft <= 2) {
          await showNotification(
            'تذكير موعد الدفع',
            `موعد دفع الشحنة ${shipment.shipment_number} خلال ${daysLeft} ${daysLeft === 0 ? 'اليوم' : daysLeft === 1 ? 'غداً' : 'أيام'}`,
            'fas fa-credit-card',
            '#FF9800'
          );
        }
      }
      
      // فحص موعد طلب الإفراج
      if (shipment.release_request_date) {
        const releaseDate = new Date(shipment.release_request_date);
        const daysLeft = Math.ceil((releaseDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysLeft >= 0 && daysLeft <= 2) {
          await showNotification(
            'تذكير طلب الإفراج',
            `موعد طلب إفراج الشحنة ${shipment.shipment_number} خلال ${daysLeft} ${daysLeft === 0 ? 'اليوم' : daysLeft === 1 ? 'غداً' : 'أيام'}`,
            'fas fa-file-export',
            '#9C27B0'
          );
        }
      }
    }
    
    console.log('تم فحص الشحنات بنجاح');
  } catch (error) {
    console.error('خطأ في فحص الشحنات:', error);
  }
}

// جلب الشحنات المخزنة
async function getStoredShipments() {
  try {
    // محاولة جلب من IndexedDB أولاً
    const db = await openIndexedDB();
    if (db) {
      const shipments = await getShipmentsFromIndexedDB(db);
      if (shipments && shipments.length > 0) {
        return shipments;
      }
    }
    
    // إذا فشل IndexedDB، جرب localStorage عبر clients
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      // إرسال رسالة للعميل لجلب البيانات
      const response = await sendMessageToClient(clients[0], { type: 'GET_SHIPMENTS' });
      return response?.shipments || [];
    }
    
    return [];
  } catch (error) {
    console.error('خطأ في جلب الشحنات:', error);
    return [];
  }
}

// فتح IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShipmentsDB', 1);
    
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('shipments')) {
        db.createObjectStore('shipments', { keyPath: 'shipment_number' });
      }
    };
  });
}

// جلب الشحنات من IndexedDB
function getShipmentsFromIndexedDB(db) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(['shipments'], 'readonly');
      const store = transaction.objectStore('shipments');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    } catch (error) {
      resolve([]);
    }
  });
}

// إرسال رسالة للعميل
function sendMessageToClient(client, message) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    
    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };
    
    client.postMessage(message, [channel.port2]);
    
    // timeout بعد 5 ثواني
    setTimeout(() => resolve(null), 5000);
  });
}

// عرض الإشعار
async function showNotification(title, body, icon, color) {
  try {
    await self.registration.showNotification(title, {
      body: body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: '/index.html' },
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      tag: `shipment-${Date.now()}`,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('خطأ في عرض الإشعار:', error);
  }
}

// Periodic Background Sync - فحص دوري كل 12 ساعة
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-shipments') {
    event.waitUntil(checkShipmentsAndNotify());
  }
});

// Background Sync - فحص عند استعادة الاتصال
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-shipments') {
    event.waitUntil(checkShipmentsAndNotify());
  }
});

// استقبال رسائل من التطبيق
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_SHIPMENTS_NOW') {
    event.waitUntil(checkShipmentsAndNotify());
  }
  
  if (event.data && event.data.type === 'STORE_SHIPMENTS') {
    event.waitUntil(storeShipmentsInIndexedDB(event.data.shipments));
  }
  
  if (event.data && event.data.type === 'GET_SHIPMENTS') {
    event.waitUntil(
      getStoredShipments().then(shipments => {
        event.ports[0].postMessage({ shipments });
      })
    );
  }
});

// تخزين الشحنات في IndexedDB
async function storeShipmentsInIndexedDB(shipments) {
  try {
    const db = await openIndexedDB();
    if (!db) return;
    
    const transaction = db.transaction(['shipments'], 'readwrite');
    const store = transaction.objectStore('shipments');
    
    // مسح البيانات القديمة
    await store.clear();
    
    // إضافة البيانات الجديدة
    for (const shipment of shipments) {
      await store.add(shipment);
    }
    
    console.log('تم تخزين الشحنات في IndexedDB');
  } catch (error) {
    console.error('خطأ في تخزين الشحنات:', error);
  }
}

// ---- دعم العمل دون اتصال: الكاش الأساسي للتطبيق ----
const CACHE_VERSION = 'v1';
const APP_CACHE = `app-cache-${CACHE_VERSION}`;
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/ui-overrides.css',
  '/app.js',
  '/manifest.webmanifest',
];

// precache في أثناء التثبيت
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS)).catch(() => null)
  );
});

// تنظيف الكاشات القديمة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => k.startsWith('app-cache-') && k !== APP_CACHE)
        .map((k) => caches.delete(k))
    ))
  );
});

// استراتيجية جلب: cache-first للملفات الثابتة، وnetwork-first للتنقل
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // تجاهل طلبات خارج النطاق
  if (url.origin !== location.origin) return;

  // Navigation requests: حاول الشبكة ثم ارجع لـ index.html من الكاش
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first
  if (['style', 'script', 'image'].includes(req.destination) || PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const resClone = res.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(req, resClone));
          return res;
        }).catch(() => cached);
      })
    );
  }
});
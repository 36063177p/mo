# 🔔 إشعارات الخلفية - التطبيق المغلق

## 📋 نظرة عامة

تم تطوير نظام إشعارات متقدم يعمل حتى عندما يكون التطبيق مغلقاً باستخدام Service Worker و Background Sync!

---

## ✨ الميزات الجديدة

### 1. **إشعارات الخلفية** 🔔
- ✅ **تعمل عند إغلاق التطبيق** - Service Worker نشط دائماً
- ✅ **فحص دوري كل 12 ساعة** - Periodic Background Sync
- ✅ **فحص عند استعادة الاتصال** - Background Sync
- ✅ **تخزين البيانات في IndexedDB** - للوصول إليها دون اتصال

### 2. **Service Worker المحسّن** 🛠️
- ✅ **فحص المواعيد تلقائياً** - موعد الوصول، الدفع، الإفراج
- ✅ **إرسال إشعارات سطح المكتب** - حتى عند إغلاق المتصفح
- ✅ **تخزين ذكي في IndexedDB** - بيانات الشحنات متاحة دائماً
- ✅ **اتصال ثنائي الاتجاه** - بين التطبيق و Service Worker

### 3. **Periodic Background Sync** ⏰
- ✅ **فحص كل 12 ساعة** - تلقائياً في الخلفية
- ✅ **لا يحتاج التطبيق مفتوحاً** - يعمل حتى عند الإغلاق
- ✅ **موفر للطاقة** - يستخدم نظام التشغيل للجدولة
- ✅ **مدعوم في Chrome/Edge** - متصفحات حديثة

### 4. **Background Sync** 🔄
- ✅ **فحص عند استعادة الاتصال** - تلقائياً
- ✅ **مزامنة البيانات** - عند العودة للإنترنت
- ✅ **إرسال الإشعارات المتأخرة** - التي فاتت أثناء عدم الاتصال
- ✅ **مدعوم في معظم المتصفحات** - Chrome, Edge, Firefox

---

## 🔧 التقنيات المستخدمة

### Service Worker:
```javascript
// فحص المواعيد وإرسال الإشعارات
async function checkShipmentsAndNotify() {
    const shipments = await getStoredShipments();
    const today = new Date();
    
    for (const shipment of shipments) {
        // فحص موعد الوصول (قبل 3 أيام)
        // فحص موعد الدفع (قبل يومين)
        // فحص موعد طلب الإفراج (قبل يومين)
    }
}
```

### IndexedDB:
```javascript
// تخزين الشحنات في قاعدة بيانات محلية
async function storeShipmentsInIndexedDB(shipments) {
    const db = await openIndexedDB();
    const transaction = db.transaction(['shipments'], 'readwrite');
    const store = transaction.objectStore('shipments');
    
    await store.clear();
    for (const shipment of shipments) {
        await store.add(shipment);
    }
}
```

### Periodic Sync:
```javascript
// تسجيل فحص دوري كل 12 ساعة
await registration.periodicSync.register('check-shipments', {
    minInterval: 12 * 60 * 60 * 1000 // 12 ساعة
});
```

### Background Sync:
```javascript
// تسجيل مزامنة خلفية
await registration.sync.register('sync-shipments');
```

---

## 📊 آلية العمل

### 1. عند فتح التطبيق:
```
التطبيق مفتوح
    ↓
تحميل الشحنات من Supabase
    ↓
تخزين البيانات في IndexedDB
    ↓
تفعيل Periodic Sync
    ↓
تفعيل Background Sync
    ↓
فحص دوري كل 30 دقيقة
```

### 2. عند إغلاق التطبيق:
```
التطبيق مغلق
    ↓
Service Worker نشط
    ↓
Periodic Sync يعمل كل 12 ساعة
    ↓
جلب البيانات من IndexedDB
    ↓
فحص المواعيد
    ↓
إرسال إشعارات سطح المكتب
```

### 3. عند استعادة الاتصال:
```
عودة الاتصال
    ↓
Background Sync يُفعّل
    ↓
فحص المواعيد
    ↓
إرسال الإشعارات المتأخرة
```

---

## 🎯 أنواع الإشعارات

### موعد الوصول (قبل 3 أيام):
```javascript
{
    title: 'تذكير موعد الوصول',
    body: 'الشحنة SH001 تصل خلال 2 أيام',
    icon: '/favicon.ico',
    vibrate: [200, 100, 200],
    requireInteraction: true
}
```

### موعد الدفع (قبل يومين):
```javascript
{
    title: 'تذكير موعد الدفع',
    body: 'موعد دفع الشحنة SH002 غداً',
    icon: '/favicon.ico',
    vibrate: [200, 100, 200],
    requireInteraction: true
}
```

### موعد طلب الإفراج (قبل يومين):
```javascript
{
    title: 'تذكير طلب الإفراج',
    body: 'موعد طلب إفراج الشحنة SH003 اليوم',
    icon: '/favicon.ico',
    vibrate: [200, 100, 200],
    requireInteraction: true
}
```

---

## 🚀 كيفية الاستخدام

### تفعيل الإشعارات:
1. افتح التطبيق في المتصفح
2. اسمح بالإشعارات عند الطلب
3. سيتم تفعيل Periodic Sync تلقائياً
4. أغلق التطبيق - الإشعارات ستستمر!

### اختبار الإشعارات:
1. افتح التطبيق
2. حمّل بيانات تجريبية
3. أغلق التطبيق
4. انتظر - ستصلك إشعارات حسب المواعيد

### مراقبة النظام:
1. افتح Developer Tools (F12)
2. انتقل إلى Application → Service Workers
3. ستجد Service Worker نشط
4. تحقق من Console للرسائل

---

## 📱 خصائص الإشعارات

### الخصائص المتقدمة:
- ✅ **requireInteraction: true** - الإشعار يبقى حتى التفاعل
- ✅ **vibrate: [200, 100, 200]** - اهتزاز للهواتف
- ✅ **dir: 'rtl'** - اتجاه النص من اليمين لليسار
- ✅ **lang: 'ar'** - اللغة العربية
- ✅ **badge: '/favicon.ico'** - شارة الإشعار
- ✅ **timestamp** - وقت الإشعار

### عند النقر على الإشعار:
- ✅ **فتح التطبيق** - إذا كان مغلقاً
- ✅ **التركيز على التبويب** - إذا كان مفتوحاً
- ✅ **الانتقال للشحنة** - مباشرة

---

## 🔍 الدوال الجديدة

### في Service Worker:

#### checkShipmentsAndNotify()
```javascript
// فحص جميع الشحنات وإرسال الإشعارات المناسبة
async function checkShipmentsAndNotify()
```

#### getStoredShipments()
```javascript
// جلب الشحنات من IndexedDB أو من التطبيق
async function getStoredShipments()
```

#### storeShipmentsInIndexedDB()
```javascript
// تخزين الشحنات في IndexedDB
async function storeShipmentsInIndexedDB(shipments)
```

#### showNotification()
```javascript
// عرض إشعار سطح المكتب
async function showNotification(title, body, icon, color)
```

### في التطبيق:

#### storeShipmentsForBackgroundSync()
```javascript
// إرسال الشحنات إلى Service Worker للتخزين
async function storeShipmentsForBackgroundSync(shipments)
```

#### registerPeriodicSync()
```javascript
// تفعيل الفحص الدوري كل 12 ساعة
async function registerPeriodicSync()
```

#### registerBackgroundSync()
```javascript
// تفعيل المزامنة الخلفية
async function registerBackgroundSync()
```

#### triggerBackgroundCheck()
```javascript
// إرسال طلب فحص فوري إلى Service Worker
async function triggerBackgroundCheck()
```

#### getAllShipmentsFromDOM()
```javascript
// جلب جميع الشحنات من DOM
function getAllShipmentsFromDOM()
```

---

## 📊 الجدول الزمني

### فحص دوري:
| الوقت | الحدث | الوصف |
|-------|-------|-------|
| **كل 12 ساعة** | Periodic Sync | فحص تلقائي في الخلفية |
| **كل 30 دقيقة** | تحديث البيانات | عند فتح التطبيق |
| **عند الاتصال** | Background Sync | عند استعادة الإنترنت |

### إشعارات المواعيد:
| نوع الإشعار | التوقيت | الوصف |
|------------|---------|-------|
| **موعد الوصول** | قبل 3 أيام | تنبيه يومي |
| **موعد الدفع** | قبل يومين | تنبيه يومي |
| **موعد الإفراج** | قبل يومين | تنبيه يومي |

---

## 🌐 التوافق مع المتصفحات

### Periodic Background Sync:
- ✅ **Chrome 80+** - مدعوم بالكامل
- ✅ **Edge 80+** - مدعوم بالكامل
- ⚠️ **Firefox** - غير مدعوم حالياً
- ⚠️ **Safari** - غير مدعوم حالياً

### Background Sync:
- ✅ **Chrome 49+** - مدعوم بالكامل
- ✅ **Edge 79+** - مدعوم بالكامل
- ✅ **Firefox 44+** - مدعوم جزئياً
- ⚠️ **Safari** - غير مدعوم حالياً

### Service Worker Notifications:
- ✅ **Chrome 42+** - مدعوم بالكامل
- ✅ **Edge 17+** - مدعوم بالكامل
- ✅ **Firefox 44+** - مدعوم بالكامل
- ⚠️ **Safari 16+** - مدعوم جزئياً

---

## 📝 ملاحظات مهمة

### الأمان:
- ✅ **HTTPS مطلوب** - Service Worker يعمل فقط على HTTPS
- ✅ **إذن المستخدم** - يجب الموافقة على الإشعارات
- ✅ **بيانات محلية** - IndexedDB آمن ومحلي

### الأداء:
- ✅ **موفر للطاقة** - يستخدم نظام التشغيل للجدولة
- ✅ **لا يستهلك الذاكرة** - Service Worker خفيف
- ✅ **فحص ذكي** - فقط للشحنات ذات المواعيد القريبة

### الصيانة:
- ✅ **كود منظم** - دوال منفصلة لكل مهمة
- ✅ **تسجيل شامل** - Console.log لتتبع العمليات
- ✅ **معالجة الأخطاء** - try/catch في جميع الدوال

---

## 🎉 النتيجة النهائية

### قبل التطوير:
- ❌ الإشعارات تعمل فقط عند فتح التطبيق
- ❌ لا يوجد فحص دوري في الخلفية
- ❌ لا يوجد تخزين محلي للبيانات
- ❌ الإشعارات تتوقف عند إغلاق التطبيق

### بعد التطوير:
- ✅ **إشعارات تعمل عند إغلاق التطبيق**
- ✅ **فحص دوري كل 12 ساعة**
- ✅ **تخزين ذكي في IndexedDB**
- ✅ **مزامنة خلفية عند استعادة الاتصال**
- ✅ **إشعارات سطح المكتب متقدمة**
- ✅ **اهتزاز وصوت للإشعارات**
- ✅ **فتح التطبيق عند النقر**

---

**تم التطوير:** 8 أكتوبر 2025  
**الإصدار:** 2.1.5  
**الحالة:** ✅ مكتمل

الإشعارات الآن تعمل حتى عند إغلاق التطبيق! 🔔✨

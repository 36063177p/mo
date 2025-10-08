// ===== إشعارات الشحنات المتقدمة =====

// دالة showToast احتياطية إذا لم تكن موجودة
if (typeof window.showToast === 'undefined') {
    window.showToast = function(message, type = 'success') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // محاولة عرض إشعار بسيط
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: Arial, sans-serif;
            direction: rtl;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
}

// إرسال إشعار تغيير حالة الشحنة
function sendShipmentStatusChangeNotification(shipmentNumber, oldStatus, newStatus) {
    console.log('🔔 إرسال إشعار تغيير الحالة:', shipmentNumber, oldStatus, '→', newStatus);
    const message = `تم تغيير حالة الشحنة ${shipmentNumber} من "${oldStatus}" إلى "${newStatus}"`;
    
    createNotification({
        type: 'shipment_status_change',
        message: message,
        shipmentId: shipmentNumber,
        priority: 'high',
        icon: 'fas fa-shipping-fast',
        color: '#2196F3'
    });
    
    // إرسال إشعار سطح المكتب
    sendDesktopNotification('تغيير حالة الشحنة', message);
    
    console.log(`إشعار تغيير حالة: ${message}`);
}

// إرسال إشعار اقتراب موعد الوصول
function sendArrivalReminderNotification(shipmentNumber, arrivalDate, daysLeft) {
    console.log('🚚 إرسال إشعار اقتراب الوصول:', shipmentNumber, 'خلال', daysLeft, 'أيام');
    let message;
    if (daysLeft === 0) {
        message = `الشحنة ${shipmentNumber} تصل اليوم! تاريخ الوصول: ${arrivalDate}`;
    } else if (daysLeft === 1) {
        message = `الشحنة ${shipmentNumber} تصل غداً! تاريخ الوصول: ${arrivalDate}`;
    } else {
        message = `الشحنة ${shipmentNumber} تصل خلال ${daysLeft} أيام. تاريخ الوصول: ${arrivalDate}`;
    }
    
    createNotification({
        type: 'arrival_reminder',
        message: message,
        shipmentId: shipmentNumber,
        priority: 'high',
        icon: 'fas fa-truck',
        color: '#4CAF50'
    });
    
    // إرسال إشعار سطح المكتب
    sendDesktopNotification('تذكير موعد الوصول', message);
    
    console.log(`إشعار اقتراب الوصول: ${message}`);
}

// إرسال إشعار اقتراب موعد الدفع
function sendPaymentReminderNotification(shipmentNumber, paymentDate, daysLeft) {
    console.log('💳 إرسال إشعار اقتراب الدفع:', shipmentNumber, 'خلال', daysLeft, 'أيام');
    let message;
    if (daysLeft === 0) {
        message = `موعد دفع الشحنة ${shipmentNumber} اليوم! تاريخ الدفع: ${paymentDate}`;
    } else if (daysLeft === 1) {
        message = `موعد دفع الشحنة ${shipmentNumber} غداً! تاريخ الدفع: ${paymentDate}`;
    } else {
        message = `موعد دفع الشحنة ${shipmentNumber} خلال ${daysLeft} أيام. تاريخ الدفع: ${paymentDate}`;
    }
    
    createNotification({
        type: 'payment_reminder',
        message: message,
        shipmentId: shipmentNumber,
        priority: 'high',
        icon: 'fas fa-credit-card',
        color: '#FF9800'
    });
    
    // إرسال إشعار سطح المكتب
    sendDesktopNotification('تذكير موعد الدفع', message);
    
    console.log(`إشعار اقتراب الدفع: ${message}`);
}

// إرسال إشعار اقتراب موعد طلب الإفراج
function sendReleaseRequestReminderNotification(shipmentNumber, releaseDate, daysLeft) {
    console.log('📄 إرسال إشعار اقتراب الإفراج:', shipmentNumber, 'خلال', daysLeft, 'أيام');
    let message;
    if (daysLeft === 0) {
        message = `موعد طلب إفراج الشحنة ${shipmentNumber} اليوم! تاريخ الطلب: ${releaseDate}`;
    } else if (daysLeft === 1) {
        message = `موعد طلب إفراج الشحنة ${shipmentNumber} غداً! تاريخ الطلب: ${releaseDate}`;
    } else {
        message = `موعد طلب إفراج الشحنة ${shipmentNumber} خلال ${daysLeft} أيام. تاريخ الطلب: ${releaseDate}`;
    }
    
    createNotification({
        type: 'release_reminder',
        message: message,
        shipmentId: shipmentNumber,
        priority: 'high',
        icon: 'fas fa-file-export',
        color: '#9C27B0'
    });
    
    // إرسال إشعار سطح المكتب
    sendDesktopNotification('تذكير طلب الإفراج', message);
    
    console.log(`إشعار اقتراب الإفراج: ${message}`);
}

// فحص المواعيد وإرسال الإشعارات
function checkAndSendReminderNotifications() {
    const shipments = document.querySelectorAll('.shipment-card');
    const today = new Date();
    
    shipments.forEach(card => {
        const shipmentNumber = card.getAttribute('data-shipment-id');
        if (!shipmentNumber) return;
        
        // فحص موعد الوصول
        const arrivalDateElement = card.querySelector('[data-field="arrival_date"]');
        if (arrivalDateElement) {
            const arrivalDate = new Date(arrivalDateElement.textContent);
            const daysLeft = Math.ceil((arrivalDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysLeft >= 0 && daysLeft <= 3) {
                sendArrivalReminderNotification(shipmentNumber, arrivalDateElement.textContent, daysLeft);
            }
        }
        
        // فحص موعد الدفع
        const paymentDateElement = card.querySelector('[data-field="payment_date"]');
        if (paymentDateElement) {
            const paymentDate = new Date(paymentDateElement.textContent);
            const daysLeft = Math.ceil((paymentDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysLeft >= 0 && daysLeft <= 2) {
                sendPaymentReminderNotification(shipmentNumber, paymentDateElement.textContent, daysLeft);
            }
        }
        
        // فحص موعد طلب الإفراج
        const releaseDateElement = card.querySelector('[data-field="release_request_date"]');
        if (releaseDateElement) {
            const releaseDate = new Date(releaseDateElement.textContent);
            const daysLeft = Math.ceil((releaseDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysLeft >= 0 && daysLeft <= 2) {
                sendReleaseRequestReminderNotification(shipmentNumber, releaseDateElement.textContent, daysLeft);
            }
        }
    });
}

// تشغيل فحص المواعيد كل ساعة
function startReminderChecker() {
    // فحص فوري
    checkAndSendReminderNotifications();
    
    // فحص كل ساعة
    setInterval(checkAndSendReminderNotifications, 60 * 60 * 1000);
    
    console.log('تم تشغيل فاحص المواعيد');
}

// دالة تحديث حالة الشحنة مع إرسال إشعار
async function updateShipmentStatusWithNotification(shipmentNumber, newStatus) {
    try {
        // الحصول على الحالة القديمة
        const { data: oldShipment } = await supabase
            .from('shipments')
            .select('status')
            .eq('shipment_number', shipmentNumber)
            .single();
        
        const oldStatus = oldShipment?.status || 'غير محدد';
        
        // تحديث الحالة في قاعدة البيانات
        const { error } = await supabase
            .from('shipments')
            .update({ status: newStatus })
            .eq('shipment_number', shipmentNumber);
        
        if (error) throw error;
        
        // إرسال إشعار تغيير الحالة
        sendShipmentStatusChangeNotification(shipmentNumber, oldStatus, newStatus);
        
        // إعادة تحميل البيانات
        await loadShipments();
        
        showToast(`تم تحديث حالة الشحنة ${shipmentNumber} إلى "${newStatus}"`, 'success');
        
    } catch (error) {
        console.error('Error updating shipment status:', error);
        showToast('حدث خطأ أثناء تحديث حالة الشحنة', 'error');
    }
}

// دالة اختبار الإشعارات المتقدمة
function testAdvancedNotifications() {
    // اختبار إشعار تغيير الحالة
    sendShipmentStatusChangeNotification('SH001', 'تم التأكيد', 'تم الشحن');
    
    // اختبار إشعار اقتراب الوصول
    sendArrivalReminderNotification('SH002', '2025-10-15', 2);
    
    // اختبار إشعار اقتراب الدفع
    sendPaymentReminderNotification('SH003', '2025-10-12', 1);
    
    // اختبار إشعار اقتراب الإفراج
    sendReleaseRequestReminderNotification('SH004', '2025-10-14', 0);
    
    showToast('تم إرسال إشعارات تجريبية', 'success');
}

// تخزين الشحنات في IndexedDB للوصول إليها من Service Worker
async function storeShipmentsForBackgroundSync(shipments) {
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            // إرسال البيانات إلى Service Worker
            navigator.serviceWorker.controller.postMessage({
                type: 'STORE_SHIPMENTS',
                shipments: shipments
            });
            
            console.log('تم إرسال الشحنات إلى Service Worker للتخزين');
        }
    } catch (error) {
        console.error('خطأ في تخزين الشحنات:', error);
    }
}

// تفعيل Periodic Background Sync
async function registerPeriodicSync() {
    try {
        if ('serviceWorker' in navigator && 'periodicSync' in navigator.serviceWorker) {
            const registration = await navigator.serviceWorker.ready;
            
            // تسجيل فحص دوري كل 12 ساعة
            await registration.periodicSync.register('check-shipments', {
                minInterval: 12 * 60 * 60 * 1000 // 12 ساعة
            });
            
            console.log('✅ تم تفعيل الفحص الدوري للشحنات');
        } else {
            console.info('ℹ️ Periodic Background Sync غير مدعوم - سيتم استخدام فحص دوري بديل');
            // استخدام setInterval كبديل
            setInterval(() => {
                triggerBackgroundCheck();
            }, 12 * 60 * 60 * 1000); // 12 ساعة
        }
    } catch (error) {
        console.error('خطأ في تفعيل Periodic Sync:', error);
        // استخدام setInterval كبديل
        setInterval(() => {
            triggerBackgroundCheck();
        }, 12 * 60 * 60 * 1000);
    }
}

// تفعيل Background Sync العادي
async function registerBackgroundSync() {
    try {
        if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
            const registration = await navigator.serviceWorker.ready;
            
            // تسجيل مزامنة خلفية
            await registration.sync.register('sync-shipments');
            
            console.log('✅ تم تفعيل المزامنة الخلفية للشحنات');
        } else {
            console.info('ℹ️ Background Sync غير مدعوم - سيتم استخدام فحص عند الاتصال');
            // مراقبة حالة الاتصال كبديل
            window.addEventListener('online', () => {
                console.log('🌐 تم استعادة الاتصال - فحص الشحنات...');
                triggerBackgroundCheck();
            });
        }
    } catch (error) {
        console.error('خطأ في تفعيل Background Sync:', error);
        // مراقبة حالة الاتصال كبديل
        window.addEventListener('online', () => {
            console.log('🌐 تم استعادة الاتصال - فحص الشحنات...');
            triggerBackgroundCheck();
        });
    }
}

// إرسال رسالة إلى Service Worker لفحص الشحنات فوراً
async function triggerBackgroundCheck() {
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CHECK_SHIPMENTS_NOW'
            });
            
            console.log('تم إرسال طلب فحص فوري للشحنات');
        }
    } catch (error) {
        console.error('خطأ في إرسال طلب الفحص:', error);
    }
}

// استقبال رسائل من Service Worker
navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_SHIPMENTS') {
        // إرسال الشحنات إلى Service Worker
        const shipments = getAllShipmentsFromDOM();
        event.ports[0].postMessage({ shipments });
    }
});

// جلب جميع الشحنات من DOM
function getAllShipmentsFromDOM() {
    const shipments = [];
    const cards = document.querySelectorAll('.shipment-card');
    
    cards.forEach(card => {
        const shipmentNumber = card.getAttribute('data-shipment-id');
        if (!shipmentNumber) return;
        
        const shipment = {
            shipment_number: shipmentNumber,
            arrival_date: card.querySelector('[data-field="arrival_date"]')?.textContent || null,
            payment_date: card.querySelector('[data-field="payment_date"]')?.textContent || null,
            release_request_date: card.querySelector('[data-field="release_request_date"]')?.textContent || null,
            status: card.querySelector('.status-badge')?.textContent || null
        };
        
        shipments.push(shipment);
    });
    
    return shipments;
}

// تحديث دالة تحميل الشحنات لتخزين البيانات
const originalLoadShipments = window.loadShipments;
if (originalLoadShipments) {
    window.loadShipments = async function() {
        await originalLoadShipments.apply(this, arguments);
        
        // تخزين الشحنات بعد التحميل
        setTimeout(() => {
            const shipments = getAllShipmentsFromDOM();
            if (shipments.length > 0) {
                storeShipmentsForBackgroundSync(shipments);
            }
        }, 1000);
    };
}

// طلب إذن الإشعارات عند تحميل الصفحة
async function requestNotificationPermission() {
    try {
        if ('Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            
            if (permission === 'granted') {
                console.log('تم منح إذن الإشعارات');
                
                // تفعيل الفحص الدوري
                await registerPeriodicSync();
                await registerBackgroundSync();
            } else {
                console.warn('تم رفض إذن الإشعارات');
            }
        } else if (Notification.permission === 'granted') {
            // الإذن ممنوح بالفعل، فعّل الفحص الدوري
            await registerPeriodicSync();
            await registerBackgroundSync();
        }
    } catch (error) {
        console.error('خطأ في طلب إذن الإشعارات:', error);
    }
}

// تشغيل فاحص المواعيد عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // طلب إذن الإشعارات أولاً
    requestNotificationPermission();
    
    // تأخير تشغيل فاحص المواعيد لضمان تحميل البيانات
    setTimeout(() => {
        startReminderChecker();
        
        // تخزين الشحنات الحالية
        const shipments = getAllShipmentsFromDOM();
        if (shipments.length > 0) {
            storeShipmentsForBackgroundSync(shipments);
        }
    }, 2000);
    
    // فحص دوري كل 30 دقيقة عندما يكون التطبيق مفتوحاً
    setInterval(() => {
        const shipments = getAllShipmentsFromDOM();
        if (shipments.length > 0) {
            storeShipmentsForBackgroundSync(shipments);
        }
        triggerBackgroundCheck();
    }, 30 * 60 * 1000); // 30 دقيقة
});

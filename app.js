// تهيئة Supabase
const SUPABASE_URL = 'https://akaqfmtcebgjllicfuyx.supabase.co'; // ضع رابط مشروعك من Supabase
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYXFmbXRjZWJnamxsaWNmdXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1OTA4MzksImV4cCI6MjA3NTE2NjgzOX0.R6Dx08i_ssZODlmkbzO5gBpZjcejC7AHA1aNbnV8Z5U'; // ضع المفتاح العام من Supabase

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// تهيئة Firebase Messaging (ضع القيم الصحيحة من Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyA8hb7SMywRWLJEF7RBEcBSd77vdvlG6C4",
  authDomain: "shipping-66d5b.firebaseapp.com",
  projectId: "shipping-66d5b",
  storageBucket: "shipping-66d5b.firebasestorage.app",
  messagingSenderId: "63508052085",
  appId: "1:63508052085:web:8e0d33783d8c1c0ce2e03c",
  measurementId: "G-VBF8DPCG3F"
};
const FCM_VAPID_KEY = 'BGjFiRQIWelzCgnU_kwKbX1jdv9wf-isseOvSHV3OpuUsnbu_U3DBE_5Hi36UkwXLtZJAfN82gKjx7TL5sXJuUY';

// تسجيل Service Worker وطلب إذن الإشعارات والحصول على الـ Token
async function initFirebaseMessaging() {
  try {
    // تخطّي التهيئة عند انقطاع الإنترنت
    if (!navigator.onLine) {
      console.warn('المتصفح غير متصل بالإنترنت؛ سيتم تفعيل FCM عند استعادة الاتصال.');
      return;
    }
    // تأكد من اكتمال تحميل الصفحة قبل تسجيل Service Worker
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    }
    // تحقق من جاهزية القيم
    const hasValidConfig = firebaseConfig && firebaseConfig.projectId && firebaseConfig.projectId !== 'YOUR_PROJECT_ID';
    if (!('serviceWorker' in navigator) || !window.firebase || !hasValidConfig) {
      console.warn('Firebase Messaging لم يتم تفعيله: تحقق من القيم ووجود خدمة SW');
      return;
    }

    // تسجيل الـ Service Worker ضمن نطاق الجذر مع تحمّل حالات InvalidState
    let registration = await navigator.serviceWorker.getRegistration('/')
      .catch(() => null);
    if (!registration) {
      try {
        registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js', { scope: '/' });
      } catch (err) {
        // في بعض بيئات المعاينة قد تكون الوثيقة غير صالحة للتسجيل مباشرة
        if (err && (err.name === 'InvalidStateError' || String(err).includes('InvalidStateError'))) {
          await new Promise(r => setTimeout(r, 300));
          registration = await navigator.serviceWorker.ready;
        } else {
          throw err;
        }
      }
    }

    // تهيئة تطبيق Firebase مرة واحدة
    if (!firebase.apps?.length) {
      firebase.initializeApp(firebaseConfig);
    }
    const messaging = firebase.messaging();

    // طلب إذن الإشعارات
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('تم رفض إذن الإشعارات');
      return;
    }

    // الحصول على رمز الجهاز (Token)
    const token = await messaging.getToken({
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log('FCM Token:', token);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // حفظ مؤقت للتوكن حتى تسجيل الدخول
        try {
          localStorage.setItem('pendingFCMToken', token);
          console.warn('تم الحصول على رمز FCM قبل تسجيل الدخول؛ سيتم حفظه بعد تسجيل الدخول.');
        } catch (_) {}
      } else {
        await upsertDeviceToken(token);
      }
    }

    // استقبال رسائل المقدمة
    messaging.onMessage((payload) => {
      try {
        const data = payload?.data || {};
        const title = payload?.notification?.title || data.title || 'إشعار جديد';
        const message = payload?.notification?.body || data.body || '';

        // دمج مع نظام الإشعارات الحالي في التطبيق
        createNotification({
          type: data.type || 'shipment',
          message,
          shipmentId: data.shipment_id || null,
        });
      } catch (e) {
        console.error('onMessage error:', e);
      }
    });
  } catch (error) {
    console.error('initFirebaseMessaging error:', error);
  }
}

// حفظ/تحديث رمز الجهاز في Supabase
async function upsertDeviceToken(token) {
  try {
    const user = (await supabase.auth.getUser()).data.user;
    const userId = user?.id || null;

    if (!userId) {
      console.warn('تخطّي حفظ التوكن: المستخدم غير مسجّل الدخول حالياً');
      return;
    }

    // إنشاء الجدول إن لم يكن موجوداً (سيتم دعمه أيضاً عبر supabase-setup.sql)
    const { error } = await supabase
      .from('user_device_tokens')
      .upsert({ token, user_id: userId }, { onConflict: 'token' });

    if (error) {
      console.warn('تعذّر حفظ رمز الجهاز في Supabase:', error.message);
    } else {
      console.log('تم حفظ رمز الجهاز بنجاح في Supabase');
    }
  } catch (e) {
    console.error('upsertDeviceToken error:', e);
  }
}

// المتغيرات العامة
let loginForm, loginSection, closeBtn;

// إضافة متغيرات جديدة للبحث والتصفية
let searchInput, statusFilter, dateFilter;

// إضافة المتغيرات الجديدة
let shipmentModal, shipmentForm, addShipmentBtn;
let currentFiles = new Map();


// إضافة المتغيرات الجديدة
let customsModal, customsForm, addCustomsBtn, shipmentSelect;


// إضافة متغيرات جديدة للإشعارات
let notificationsPanel, notificationsBtn, notificationsBadge;
let notificationsList = [];
let currentFilter = 'all';

// إضافة متغيرات للإشعارات المتقدمة
let notificationSettings = {
    soundEnabled: true,
    soundType: 'default',
    desktopEnabled: false,
    whatsappEnabled: false,
    whatsappNumber: '',
    notifyShipments: true,
};

// متغيرات حفظ حالة الفلترة للجداول
const filterStates = {
    shipments: {
        search: '',
        status: '',
        supplier: '',
        dateRange: { start: null, end: null }
    }
};

// تحميل إعدادات الإشعارات
function loadNotificationSettings() {
    try {
        const saved = localStorage.getItem('notificationSettings');
        if (saved) {
            notificationSettings = JSON.parse(saved);
            updateSettingsUI();
        }
    } catch (error) {
        console.error('Error loading notification settings:', error);
    }
}

// حفظ إعدادات الإشعارات
function saveNotificationSettings() {
    try {
        localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
    } catch (error) {
        console.error('Error saving notification settings:', error);
    }
}

// تحديث واجهة الإعدادات
function updateSettingsUI() {
    document.getElementById('enableSoundNotifications').checked = notificationSettings.soundEnabled;
    document.getElementById('notificationSound').value = notificationSettings.soundType;
    document.getElementById('enableDesktopNotifications').checked = notificationSettings.desktopEnabled;
    document.getElementById('enableWhatsAppNotifications').checked = notificationSettings.whatsappEnabled;
    document.getElementById('whatsappNumber').value = notificationSettings.whatsappNumber;
    document.getElementById('notifyShipments').checked = notificationSettings.notifyShipments;
}

// تشغيل صوت الإشعارات
function playNotificationSound() {
    if (!notificationSettings.soundEnabled) return;

    const audio = new Audio();
    switch (notificationSettings.soundType) {
        case 'bell':
            audio.src = 'sounds/bell.mp3';
            break;
        case 'chime':
            audio.src = 'sounds/chime.mp3';
            break;
        case 'alert':
            audio.src = 'sounds/alert.mp3';
            break;
        default:
            audio.src = 'sounds/default.mp3';
    }
    audio.play().catch(error => console.error('Error playing notification sound:', error));
}

// إرسال إشعار سطح المكتب
async function sendDesktopNotification(title, message) {
    if (!notificationSettings.desktopEnabled) return;

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/images/logo.png',
                dir: 'rtl',
                lang: 'ar'
            });
        }
    } catch (error) {
        console.error('Error sending desktop notification:', error);
    }
}

// إرسال إشعار WhatsApp
async function sendWhatsAppNotification(message) {
    if (!notificationSettings.whatsappEnabled || !notificationSettings.whatsappNumber) return;

    try {
        const whatsappNumber = notificationSettings.whatsappNumber.replace(/[^0-9]/g, '');
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${encodeURIComponent(message)}`;
        
        // يمكن استخدام API خاص لإرسال الرسائل مباشرة
        // هنا نستخدم الرابط المباشر كبديل
        window.open(whatsappUrl, '_blank');
    } catch (error) {
        console.error('Error sending WhatsApp notification:', error);
    }
}

// تحديث دالة إنشاء الإشعارات
function createNotification(notification) {
    // التحقق من نوع الإشعار
    if (!shouldNotify(notification.type)) return;

    // إضافة الإشعار إلى القائمة
    const newNotification = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        read: false,
        ...notification
    };

    notificationsList.unshift(newNotification);
    saveNotifications();
    updateNotificationsDisplay([newNotification]);

    // تشغيل الصوت
    playNotificationSound();

    // إرسال إشعار سطح المكتب
    sendDesktopNotification(
        getNotificationTitle(notification.type),
        notification.message
    );

    // إرسال إشعار WhatsApp
    sendWhatsAppNotification(notification.message);
}

// التحقق من نوع الإشعار
function shouldNotify(type) {
    switch (type) {
        case 'order':
        case 'shipment':
            return notificationSettings.notifyShipments;
        default:
            return true;
    }
}

// تحديث دالة showNotificationSettings
function showNotificationSettings() {
    const modal = document.getElementById('notificationsSettingsModal');
    if (modal) {
        modal.style.display = 'block';
        updateSettingsUI();
    }
}

// إضافة مستمعي أحداث لإعدادات الإشعارات
function setupNotificationSettingsListeners() {
    const form = document.getElementById('notificationsSettingsForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        notificationSettings = {
            soundEnabled: document.getElementById('enableSoundNotifications').checked,
            soundType: document.getElementById('notificationSound').value,
            desktopEnabled: document.getElementById('enableDesktopNotifications').checked,
            whatsappEnabled: document.getElementById('enableWhatsAppNotifications').checked,
            whatsappNumber: document.getElementById('whatsappNumber').value,
            notifyShipments: document.getElementById('notifyShipments').checked,
        };

        saveNotificationSettings();
        showToast('تم حفظ إعدادات الإشعارات بنجاح');
        document.getElementById('notificationsSettingsModal').style.display = 'none';
    });

    // طلب إذن إشعارات سطح المكتب
    const requestPermissionBtn = document.getElementById('requestNotificationPermission');
    if (requestPermissionBtn) {
        requestPermissionBtn.addEventListener('click', async () => {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    notificationSettings.desktopEnabled = true;
                    document.getElementById('enableDesktopNotifications').checked = true;
                    showToast('تم تفعيل إشعارات سطح المكتب بنجاح');
                } else {
                    showToast('تم رفض طلب الإذن', 'error');
                }
            } catch (error) {
                console.error('Error requesting notification permission:', error);
                showToast('حدث خطأ أثناء طلب الإذن', 'error');
            }
        });
    }
}

// إرسال إشعار تجريبي محلياً
async function sendTestNotification() {
    try {
        // تأكد من الإذن لإشعارات المتصفح
        if (Notification.permission !== 'granted') {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                showToast('تم رفض إذن الإشعارات', 'error');
                return;
            }
        }

        const title = 'اختبار الإشعارات';
        const message = 'هذا إشعار تجريبي من التطبيق';

        // أضف الإشعار إلى لوحة الإشعارات داخل التطبيق
        createNotification({ type: 'shipment', message });

        // إظهار إشعار سطح المكتب عبر Service Worker (إن وجد)
        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.ready;
                await reg.showNotification(title, {
                    body: message,
                    icon: '/favicon.ico',
                    data: { url: location.pathname },
                    dir: 'rtl',
                    lang: 'ar',
                });
            } catch (e) {
                console.warn('تعذّر عرض إشعار سطح المكتب عبر SW:', e?.message || e);
                // بديل: استخدام إشعار المتصفح مباشرة
                try {
                    new Notification(title, { body: message, icon: '/favicon.ico' });
                } catch (_) {}
            }
        }
    } catch (error) {
        console.error('sendTestNotification error:', error);
    }
}

// تهيئة المتغيرات عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    loginForm = document.getElementById('loginForm');
    loginSection = document.getElementById('loginSection');
    
    // تهيئة التبويب الافتراضي
    setTimeout(() => {
        if (typeof switchTab === 'function') {
            switchTab('dashboard');
        }
    }, 200);
    // تم حذف addOrderBtn بعد حذف تبويب الطلبات
    closeBtn = document.querySelector('.close');

    // تفعيل Firebase Messaging بعد تحميل الصفحة
    initFirebaseMessaging();

    // ربط زر الإشعار التجريبي
    const sendTestBtn = document.getElementById('sendTestNotificationBtn');
    if (sendTestBtn) {
        sendTestBtn.addEventListener('click', sendTestNotification);
    }

    // منطق تثبيت التطبيق كـ PWA
    let deferredInstallPrompt = null;
    const installBtn = document.getElementById('installAppBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (installBtn) installBtn.style.display = '';
    });
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            try {
                if (!deferredInstallPrompt) return;
                const choice = await deferredInstallPrompt.prompt();
                console.log('PWA install choice:', choice.outcome);
                deferredInstallPrompt = null;
                installBtn.style.display = 'none';
            } catch (err) {
                console.warn('PWA install error:', err?.message || err);
            }
        });
    }
    window.addEventListener('appinstalled', () => {
        showToast('تم تثبيت التطبيق بنجاح كـ PWA');
        if (installBtn) installBtn.style.display = 'none';
    });

    // إضافة عناصر البحث والتصفية
    searchInput = document.getElementById('searchInput');
    statusFilter = document.getElementById('statusFilter');
    dateFilter = document.getElementById('dateFilter');
    
    // إضافة عناصر الشحنات
    shipmentModal = document.getElementById('shipmentModal');
    shipmentForm = document.getElementById('shipmentForm');
    addShipmentBtn = document.getElementById('addShipmentBtn');
    // تم حذف orderSelect بعد حذف تبويب الطلبات
    
    // إضافة عناصر التخليص الجمركي
    customsModal = document.getElementById('customsModal');
    customsForm = document.getElementById('customsForm');
    addCustomsBtn = document.getElementById('addCustomsBtn');
    shipmentSelect = document.getElementById('shipmentSelect');
    
    // تم حذف عناصر التكاليف والمخزون بعد حذف التبويبات
    
    // إضافة مستمعي الأحداث
    setupEventListeners();
    
    // التحقق من حالة تسجيل الدخول
    checkAuthState();
    
    // إضافة مستمعي أحداث التبويب
    setupTabs();
    setupShipmentListeners();
    setupCustomsListeners();
    // تم حذف setupCostListeners و setupInventoryListeners بعد حذف التبويبات
    
    // إعداد شركات التخليص
    initializeClearanceCompanies();
    
    // إعداد لوحة المعلومات
    setupDashboard();
    
    // إضافة مستمع لزر الطباعة
    document.getElementById('printReport')?.addEventListener('click', printReport);
    
    // تحديث مستمع تصدير Excel
    document.getElementById('exportReportExcel')?.addEventListener('click', exportToExcel);
    
    // إضافة مستمع لزر تصدير PDF
    document.getElementById('exportReportPDF')?.addEventListener('click', exportToPDF);
    

});

// تعريف دوال الإشعارات قبل setupEventListeners
function toggleNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    if (panel) {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            updateNotificationsBadge();
        }
    }
}

function updateNotificationsBadge() {
    const badge = document.getElementById('notificationsBadge');
    if (badge) {
        const unreadCount = notificationsList.filter(n => !n.read).length;
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
}

function markAllNotificationsAsRead() {
    notificationsList.forEach(n => n.read = true);
    saveNotifications();
    filterNotifications();
    updateNotificationsBadge();
}

function clearAllNotifications() {
    if (confirm('هل أنت متأكد من مسح جميع الإشعارات؟')) {
        notificationsList = [];
        saveNotifications();
        filterNotifications();
        updateNotificationsBadge();
    }
}

function filterNotifications() {
    const filteredNotifications = currentFilter === 'all' 
        ? notificationsList 
        : notificationsList.filter(n => n.type.startsWith(currentFilter));
    
    renderNotifications(filteredNotifications);
}

function renderNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (notifications.length === 0) {
        container.innerHTML = '<div class="no-notifications">لا توجد إشعارات</div>';
        return;
    }
    
    notifications.forEach(notification => {
        const notificationElement = createNotificationElement(notification);
        container.appendChild(notificationElement);
    });
}

function createNotificationElement(notification) {
    const div = document.createElement('div');
    div.className = `notification-item ${notification.read ? '' : 'unread'}`;
    
    const creationDate = new Date(notification.date);
    const formattedDate = creationDate.toLocaleDateString('ar-SA') + ' ' + creationDate.toLocaleTimeString('ar-SA');
    
    div.innerHTML = `
        <div class="notification-header">
            <span class="notification-title">${getNotificationTitle(notification.type)}</span>
            <span class="notification-time">${formattedDate}</span>
        </div>
        <div class="notification-message">${notification.message}</div>
        <div class="notification-actions">
            ${!notification.read ? `
                <button class="mark-read" onclick="markNotificationAsRead('${notification.id}')">
                    <i class="fas fa-check"></i> تعليم كمقروء
                </button>
            ` : ''}
            <button class="delete" onclick="deleteNotification('${notification.id}')">
                <i class="fas fa-trash"></i> حذف
            </button>
        </div>
    `;

    // إذا كان الإشعار من نوع escalation ويحمل رقم شحنة، اجعله قابل للنقر
    if (notification.type === 'escalation' && notification.shipmentNumber) {
        div.style.cursor = 'pointer';
        div.title = 'عرض تفاصيل الشحنة';
        div.onclick = () => {
            viewShipmentDetails(notification.shipmentNumber);
        };
    }
    return div;
}

function getNotificationTitle(type) {
    const titles = {
        'order': 'طلب جديد',
        'shipment': 'شحنة',
        'inventory': 'مخزون',
        'seasonal-plan': 'خطة موسمية',
        'seasonal-plan-shipping': 'موعد شحن',
        'seasonal-plan-status': 'تحديث حالة',
        'seasonal-plan-completion': 'إكمال خطة',
        'smart-alert': 'تنبيه ذكي'
    };
    
    return titles[type] || 'إشعار';
}

function markNotificationAsRead(notificationId) {
    const notification = notificationsList.find(n => n.id === notificationId);
    if (notification) {
        notification.read = true;
        saveNotifications();
        filterNotifications();
        updateNotificationsBadge();
    }
}

function deleteNotification(notificationId) {
    notificationsList = notificationsList.filter(n => n.id !== notificationId);
    saveNotifications();
    filterNotifications();
    updateNotificationsBadge();
}

function saveNotifications() {
    try {
        localStorage.setItem('notifications', JSON.stringify(notificationsList));
    } catch (error) {
        console.error('Error saving notifications:', error);
    }
}

function loadSavedNotifications() {
    try {
        const saved = localStorage.getItem('notifications');
        if (saved) {
            notificationsList = JSON.parse(saved);
            filterNotifications();
            updateNotificationsBadge();
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        notificationsList = [];
    }
}

function setupEventListeners() {
    // تسجيل الدخول
    loginForm.addEventListener('submit', handleLogin);

    
    // إضافة مستمعي أحداث الإشعارات
    const notificationsPanel = document.getElementById('notificationsPanel');
    const notificationsBtn = document.getElementById('notificationsBtn');
    
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', toggleNotificationsPanel);
    }
    
    // مستمعي أزرار التحكم في الإشعارات
    const markAllReadBtn = document.getElementById('markAllRead');
    const clearAllBtn = document.getElementById('clearAllNotifications');
    const settingsBtn = document.getElementById('notificationsSettings');
    
    if (markAllReadBtn) markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllNotifications);
    if (settingsBtn) settingsBtn.addEventListener('click', showNotificationSettings);
    
    // مستمعي أزرار التصفية
    document.querySelectorAll('.notifications-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const activeBtn = document.querySelector('.notifications-filters .filter-btn.active');
            if (activeBtn) activeBtn.classList.remove('active');
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            filterNotifications();
        });
    });
    
    // إغلاق لوحة الإشعارات عند النقر خارجها
    document.addEventListener('click', (e) => {
        if (notificationsPanel && 
            !notificationsPanel.contains(e.target) && 
            notificationsBtn && 
            !notificationsBtn.contains(e.target)) {
            notificationsPanel.classList.add('hidden');
        }
    });
    
    // تحميل الإشعارات المحفوظة عند بدء التطبيق
    loadSavedNotifications();
    
    // إضافة مستمعي أحداث إعدادات الإشعارات
    setupNotificationSettingsListeners();
    
    // تحميل إعدادات الإشعارات
    loadNotificationSettings();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        alert('خطأ في تسجيل الدخول: ' + error.message);
    } else {
        loginSection.classList.add('hidden');
    }
}




async function checkAuthState() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        // إخفاء قسم تسجيل الدخول
        loginSection.classList.add('hidden');
        
        // إظهار التبويبات
        document.querySelector('.tabs').classList.remove('hidden');
        
        // إظهار لوحة المعلومات
        document.getElementById('dashboardSection').classList.remove('hidden');
        
        // إخفاء باقي الأقسام
        document.querySelectorAll('.tab-content:not(#dashboardSection)').forEach(content => {
            content.classList.add('hidden');
        });
        
        // تحديث حالة الأزرار
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === 'dashboard') {
                btn.classList.add('active');
            }
        });
        
        // تحميل البيانات
        loadShipments();
        setupDashboard();
        updateShipmentStatusDashboard();
    } else {
        // إخفاء جميع الأقسام والتبويبات عند عدم تسجيل الدخول
        loginSection.classList.remove('hidden');
        document.querySelector('.tabs').classList.add('hidden');
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
    }
    
    // الاستماع لتغييرات حالة المصادقة
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            checkAuthState();
            // مزامنة أي توكن مخزّن مؤقتاً قبل الدخول
            try {
              const pending = localStorage.getItem('pendingFCMToken');
              if (pending) {
                upsertDeviceToken(pending).finally(() => {
                  try { localStorage.removeItem('pendingFCMToken'); } catch (_) {}
                });
              }
            } catch (_) {}
            // بعد تسجيل الدخول، أعد تهيئة المراسلة لحفظ/تحديث التوكن
            initFirebaseMessaging();
        } else if (event === 'SIGNED_OUT') {
            checkAuthState();
        }
    });
}





// دوال مساعدة لتنسيق البيانات
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-'); // تحويل التنسيق إلى YYYY-MM-DD
}

// تعديل دالة تنسيق العملة
function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-SA', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount) + ' $';
}


    
        
            
            
            


// دوال مساعدة للتواريخ
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

function isThisWeek(date) {
    const today = new Date();
    const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
    const weekEnd = new Date(today.setDate(today.getDate() + 6));
    return date >= weekStart && date <= weekEnd;
}

function isSameMonth(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth();
}

// دالة إعداد التبويب
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById(tabName + 'Section').classList.remove('hidden');

            // تحميل البيانات الخاصة بكل تبويب عند الضغط فقط
            switch(tabName) {
                case 'dashboard':
                    setupDashboard();
                    updateShipmentStatusDashboard(); // تحديث لوحة معلومات حالة الشحنات
                    break;
                    break;
                case 'shipments':
                    loadShipments();
                    // إعادة تطبيق الفلاتر المحفوظة بعد تأخير قصير
                    setTimeout(() => {
                        reapplyFilters();
                    }, 100);
                    updateShipmentStatusDashboard(); // تحديث لوحة معلومات حالة الشحنات
                    break;
                case 'clearanceCompanies':
                    loadClearanceCompanies();
                    break;
            }
        });
    });
}

// متغير لتتبع إعداد مستمعات الشحنة
let shipmentListenersAdded = false;

// متغيرات شركات التخليص
let clearanceCompanyModal, clearanceCompanyForm, clearanceCompaniesTableBody;
let clearanceCompaniesData = [];

// متغير لحفظ حالة الفلاتر
let currentFiltersState = {
    search: '',
    status: 'all',
    customs: 'all',
    payment: 'all',
    startDate: '',
    endDate: ''
};

// وظائف شركات التخليص
function initializeClearanceCompanies() {
    clearanceCompanyModal = document.getElementById('clearanceCompanyModal');
    clearanceCompanyForm = document.getElementById('clearanceCompanyForm');
    clearanceCompaniesTableBody = document.getElementById('clearanceCompaniesTableBody');
    
    // إعداد مستمعات الأحداث
    document.getElementById('addClearanceCompanyBtn').addEventListener('click', showAddClearanceCompanyModal);
    document.getElementById('removeDuplicatesBtn').addEventListener('click', removeDuplicateShipments);
    clearanceCompanyForm.addEventListener('submit', handleClearanceCompanySubmit);
    document.getElementById('clearanceCompanySearch').addEventListener('input', filterClearanceCompanies);
    
    // تحميل البيانات
    loadClearanceCompanies();
}

function showAddClearanceCompanyModal() {
    // التبديل إلى تبويب شركات التخليص أولاً
    switchTab('clearanceCompanies');
    
    setTimeout(() => {
        clearanceCompanyForm.reset();
        document.getElementById('clearanceCompanyModalTitle').textContent = 'إضافة شركة تخليص جديدة';
        delete clearanceCompanyForm.dataset.editKey;
        clearanceCompanyModal.style.display = 'block';
    }, 100);
}

function closeClearanceCompanyModal() {
    clearanceCompanyModal.style.display = 'none';
    clearanceCompanyForm.reset();
    delete clearanceCompanyForm.dataset.editKey;
}

async function handleClearanceCompanySubmit(e) {
    e.preventDefault();
    
    const companyData = {
        name: document.getElementById('companyName').value,
        phone: document.getElementById('companyPhone').value,
        email: document.getElementById('companyEmail').value || null,
        whatsapp: document.getElementById('companyWhatsApp').value || null,
        whatsapp_group: document.getElementById('companyWhatsAppGroup').value || null,
        wechat: document.getElementById('companyWeChat').value || null,
        wechat_group: document.getElementById('companyWeChatGroup').value || null,
        address: document.getElementById('companyAddress').value || null
    };
    
    const isEditing = clearanceCompanyForm.dataset.editKey;
    
    try {
        if (isEditing) {
            const { error } = await supabase
                .from('clearance_companies')
                .update(companyData)
                .eq('id', isEditing);

            if (error) throw error;
            
            showSuccessMessage('تم تحديث شركة التخليص بنجاح');
        } else {
            const { error } = await supabase
                .from('clearance_companies')
                .insert([companyData]);

            if (error) throw error;
            
            showSuccessMessage('تم إضافة شركة التخليص بنجاح');
        }
        
        closeClearanceCompanyModal();
        await loadClearanceCompanies();
        loadShippingCompanies();
        
    } catch (error) {
        console.error('Error saving clearance company:', error);
        showErrorMessage('حدث خطأ: ' + error.message);
    }
}

async function loadClearanceCompanies() {
    try {
        const { data: companies, error } = await supabase
            .from('clearance_companies')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        clearanceCompaniesData = companies || [];
        
        if (clearanceCompaniesTableBody) {
            clearanceCompaniesTableBody.innerHTML = '';
            clearanceCompaniesData.forEach(company => {
                addClearanceCompanyRow(company);
            });
        }
        
        // تحديث قائمة شركات الشحن بعد تحميل البيانات
        loadShippingCompanies();
        
    } catch (error) {
        console.error('Error loading clearance companies:', error);
    }
}

function addClearanceCompanyRow(company) {
    const row = document.createElement('tr');
    
    // تنسيق عرض WhatsApp
    let whatsappDisplay = '-';
    if (company.whatsapp && company.whatsappGroup) {
        whatsappDisplay = `فردي: ${company.whatsapp}<br>مجموعة: نعم`;
    } else if (company.whatsapp) {
        whatsappDisplay = `فردي: ${company.whatsapp}`;
    } else if (company.whatsappGroup) {
        whatsappDisplay = 'مجموعة: نعم';
    }
    
    // تنسيق عرض WeChat
    let wechatDisplay = '-';
    if (company.wechat && company.wechatGroup) {
        wechatDisplay = `فردي: ${company.wechat}<br>مجموعة: نعم`;
    } else if (company.wechat) {
        wechatDisplay = `فردي: ${company.wechat}`;
    } else if (company.wechatGroup) {
        wechatDisplay = 'مجموعة: نعم';
    }
    
    row.innerHTML = `
        <td>${company.name}</td>
        <td>${company.phone}</td>
        <td>${company.email || '-'}</td>
        <td>${whatsappDisplay}</td>
        <td>${wechatDisplay}</td>
        <td>${company.address || '-'}</td>
        <td>
            <button onclick="editClearanceCompany('${company.id}')" class="edit-btn">تعديل</button>
            <button onclick="deleteClearanceCompany('${company.id}')" class="delete-btn">حذف</button>
        </td>
    `;
    if (clearanceCompaniesTableBody) {
    clearanceCompaniesTableBody.appendChild(row);
    }
}

async function editClearanceCompany(companyId) {
    // التبديل إلى تبويب شركات التخليص أولاً
    switchTab('clearanceCompanies');
    
    setTimeout(async () => {
        try {
            const { data: company, error } = await supabase
                .from('clearance_companies')
                .select('*')
                .eq('id', companyId)
                .single();

            if (error) throw error;

            if (company) {
                clearanceCompanyForm.reset();
                clearanceCompanyForm.dataset.editKey = companyId;
                
                document.getElementById('clearanceCompanyModalTitle').textContent = 'تعديل شركة التخليص';
                document.getElementById('companyName').value = company.name;
                document.getElementById('companyPhone').value = company.phone;
                document.getElementById('companyEmail').value = company.email || '';
                document.getElementById('companyWhatsApp').value = company.whatsapp || '';
                document.getElementById('companyWhatsAppGroup').value = company.whatsapp_group || '';
                document.getElementById('companyWeChat').value = company.wechat || '';
                document.getElementById('companyWeChatGroup').value = company.wechat_group || '';
                document.getElementById('companyAddress').value = company.address || '';
                
                clearanceCompanyModal.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading company:', error);
            showErrorMessage('حدث خطأ أثناء تحميل بيانات الشركة');
        }
    }, 100);
}

async function deleteClearanceCompany(companyId) {
    if (confirm('هل أنت متأكد من حذف هذه الشركة؟')) {
        try {
            const { error } = await supabase
                .from('clearance_companies')
                .delete()
                .eq('id', companyId);

            if (error) throw error;

            showSuccessMessage('تم حذف شركة التخليص بنجاح');
            await loadClearanceCompanies();
        } catch (error) {
            console.error('Error deleting clearance company:', error);
            showErrorMessage('حدث خطأ أثناء حذف شركة التخليص');
        }
    }
}

function filterClearanceCompanies() {
    const searchTerm = document.getElementById('clearanceCompanySearch').value.toLowerCase();
    const rows = clearanceCompaniesTableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// دالة تحميل شركات الشحن في القائمة المنسدلة
function loadShippingCompanies() {
    const shippingCompanyEl = document.getElementById('shippingCompany');
    // إذا كان الحقل نصي (INPUT) أو غير موجود، نتجاهل التحميل
    if (!shippingCompanyEl || shippingCompanyEl.tagName !== 'SELECT') return;

    // الاحتفاظ بالقيمة الحالية
    const currentValue = shippingCompanyEl.value;

    // مسح الخيارات الحالية
    shippingCompanyEl.innerHTML = '<option value="">اختر شركة الشحن</option>';

    // إضافة شركات التخليص كخيارات
    clearanceCompaniesData.forEach(company => {
        const option = document.createElement('option');
        option.value = company.id;
        option.textContent = company.name;
        shippingCompanyEl.appendChild(option);
    });

    // إعادة تعيين القيمة إذا كانت موجودة
    if (currentValue) {
        shippingCompanyEl.value = currentValue;
    }
}

// دالة العثور على شركة التخليص بالمعرف
function findClearanceCompanyById(companyId) {
    return clearanceCompaniesData.find(company => company.id === companyId);
}

// دالة إرسال رسالة WhatsApp
function sendWhatsAppMessage(shipment) {
    const clearanceCompany = findClearanceCompanyById(shipment.shippingCompany);
    
    if (!clearanceCompany) {
        showErrorMessage('لم يتم العثور على شركة التخليص');
        return;
    }
    
    // التحقق من وجود WhatsApp (فردي أو مجموعة)
    if (!clearanceCompany.whatsapp && !clearanceCompany.whatsappGroup) {
        showErrorMessage('لم يتم العثور على معلومات WhatsApp لشركة التخليص');
        return;
    }
    
    const message = `
السلام عليكم،
        
نحيطكم علماً بوصول الشحنة التالية:

رقم الشحنة: ${shipment.shipment_number || shipment.shipmentNumber}
رقم الحاوية: ${shipment.container_number || shipment.containerNumber}
رقم BL: ${shipment.bl_number || shipment.blNumber}
نوع البضاعة: ${shipment.goods_type || shipment.goodsType}
الكمية: ${shipment.quantity} ${shipment.unit}
${shipment.container_weight || shipment.containerWeight ? `وزن الحاوية: ${shipment.container_weight || shipment.containerWeight} كيلوغرام` : ''}
تاريخ الوصول المتوقع: ${shipment.arrival_date || shipment.arrivalDate}
شركة الشحن: ${clearanceCompany.name}

يرجى التنسيق لإجراءات الإفراج الجمركي.

شكراً لكم`;

    let whatsappUrl;
    
    if (clearanceCompany.whatsappGroup) {
        // إرسال لمجموعة WhatsApp
        whatsappUrl = clearanceCompany.whatsappGroup;
        // نسخ الرسالة للحافظة
        navigator.clipboard.writeText(message).then(() => {
            showSuccessMessage('تم نسخ الرسالة. سيتم فتح المجموعة الآن.');
            window.open(whatsappUrl, '_blank');
        }).catch(() => {
            window.open(whatsappUrl, '_blank');
            alert(`يرجى نسخ هذه الرسالة ولصقها في المجموعة:\n\n${message}`);
        });
    } else if (clearanceCompany.whatsapp) {
        // إرسال فردي
        whatsappUrl = `https://wa.me/${clearanceCompany.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    }
}

// دالة إرسال رسالة WeChat
function sendWeChatMessage(shipment) {
    const clearanceCompany = findClearanceCompanyById(shipment.shippingCompany);
    
    if (!clearanceCompany) {
        showErrorMessage('لم يتم العثور على شركة التخليص');
        return;
    }
    
    // التحقق من وجود WeChat (فردي أو مجموعة)
    if (!clearanceCompany.wechat && !clearanceCompany.wechatGroup) {
        showErrorMessage('لم يتم العثور على معلومات WeChat لشركة التخليص');
        return;
    }
    
    const message = `
الشحنة: ${shipment.shipment_number || shipment.shipmentNumber}
الحاوية: ${shipment.container_number || shipment.containerNumber}
BL: ${shipment.bl_number || shipment.blNumber}
البضاعة: ${shipment.goods_type || shipment.goodsType}
الكمية: ${shipment.quantity} ${shipment.unit}
${shipment.container_weight || shipment.containerWeight ? `الوزن: ${shipment.container_weight || shipment.containerWeight} كيلوغرام` : ''}
الوصول: ${shipment.arrival_date || shipment.arrivalDate}
الشركة: ${clearanceCompany.name}`;

    // نسخ الرسالة إلى الحافظة
    navigator.clipboard.writeText(message).then(() => {
        if (clearanceCompany.wechatGroup) {
            showSuccessMessage(`تم نسخ الرسالة. يرجى إرسالها إلى مجموعة WeChat: ${clearanceCompany.name}`);
            // فتح رابط المجموعة إذا كان متاحاً
            if (clearanceCompany.wechatGroup.startsWith('http')) {
                window.open(clearanceCompany.wechatGroup, '_blank');
            }
        } else {
            showSuccessMessage(`تم نسخ الرسالة. يرجى إرسالها إلى WeChat: ${clearanceCompany.wechat}`);
        }
    }).catch(() => {
        const target = clearanceCompany.wechatGroup ? `مجموعة ${clearanceCompany.name}` : clearanceCompany.wechat;
        alert(`يرجى نسخ هذه الرسالة وإرسالها إلى WeChat: ${target}\n\n${message}`);
    });
}

// دوال إرسال الرسائل من بطاقات الشحنة
async function sendShipmentWhatsApp(shipmentId) {
    try {
        const { data: shipment, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('id', shipmentId)
            .single();

        if (error) throw error;

        if (shipment) {
            sendWhatsAppMessage(shipment);
        } else {
            showErrorMessage('لم يتم العثور على بيانات الشحنة');
        }
    } catch (error) {
        console.error('Error fetching shipment:', error);
        showErrorMessage('حدث خطأ أثناء جلب بيانات الشحنة');
    }
}

async function sendShipmentWeChat(shipmentId) {
    try {
        const { data: shipment, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('id', shipmentId)
            .single();

        if (error) throw error;

        if (shipment) {
            sendWeChatMessage(shipment);
        } else {
            showErrorMessage('لم يتم العثور على بيانات الشحنة');
        }
    } catch (error) {
        console.error('Error fetching shipment:', error);
        showErrorMessage('حدث خطأ أثناء جلب بيانات الشحنة');
    }
}

// دالة حذف البيانات المتكررة
async function removeDuplicateShipments() {
    try {
        const { data: shipments, error } = await supabase
            .from('shipments')
            .select('*');

        if (error) throw error;
        if (!shipments) return;
        
        const seen = new Map();
        const duplicates = [];
        
        // البحث عن المكررات
        shipments.forEach(shipment => {
            const shipmentNumber = shipment.shipment_number;
            if (seen.has(shipmentNumber)) {
                duplicates.push(shipment.id);
            } else {
                seen.set(shipmentNumber, shipment.id);
            }
        });
        
        if (duplicates.length > 0) {
            if (confirm(`تم العثور على ${duplicates.length} شحنة مكررة. هل تريد حذفها؟`)) {
                const { error: deleteError } = await supabase
                    .from('shipments')
                    .delete()
                    .in('id', duplicates);

                if (deleteError) throw deleteError;

                showSuccessMessage(`تم حذف ${duplicates.length} شحنة مكررة بنجاح`);
                await loadShipments();
                setTimeout(() => reapplyFilters(), 100);
                updateQuickReviewCounts();
            }
        } else {
            showSuccessMessage('لا توجد بيانات مكررة');
        }
    } catch (error) {
        console.error('Error removing duplicates:', error);
        showErrorMessage('حدث خطأ أثناء حذف البيانات المكررة');
    }
}

// تحديث دالة setupShipmentListeners
function setupShipmentListeners() {
    // تجنب إضافة مستمعات متعددة
    if (shipmentListenersAdded) return;
    
    // التأكد من وجود زر إضافة الشحنة
    if (addShipmentBtn) {
        addShipmentBtn.addEventListener('click', showAddShipmentModal);
        console.log('تم ربط زر إضافة الشحنة');
    } else {
        console.error('زر إضافة الشحنة غير موجود!');
    }
    
    // التأكد من وجود نموذج الشحنة
    if (shipmentForm) {
        shipmentForm.addEventListener('submit', handleShipmentSubmit);
        console.log('تم ربط نموذج الشحنة');
    } else {
        console.error('نموذج الشحنة غير موجود!');
    }
    
    // إضافة مستمع لزر الإغلاق
    if (shipmentModal) {
        const shipmentCloseBtn = shipmentModal.querySelector('.close');
        if (shipmentCloseBtn) {
            shipmentCloseBtn.addEventListener('click', closeShipmentModal);
            console.log('تم ربط زر إغلاق النموذج');
        }
    } else {
        console.error('نافذة نموذج الشحنة غير موجودة!');
    }
    
    // إغلاق النموذج عند النقر خارج المحتوى
    window.addEventListener('click', (e) => {
        if (e.target === shipmentModal) {
            closeShipmentModal();
        }
    });
    
    // تم حذف مستمع تغيير الطلب بعد حذف تبويب الطلبات
    
    // تهيئة معالجة تحميل المستندات
    
    // إعداد التصفية الجديدة
    setupShipmentFilters();
    setupDocumentUpload();
    
    // تفعيل حقل البحث والتصفية في تبويب الشحنات
    document.getElementById('shipmentSearch').addEventListener('input', filterShipments);
    document.getElementById('filterStatus').addEventListener('change', filterShipments);
    document.getElementById('filterCustoms').addEventListener('change', filterShipments);
    document.getElementById('filterPayment').addEventListener('change', filterShipments);
    document.getElementById('startDate').addEventListener('change', filterShipments);
    document.getElementById('endDate').addEventListener('change', filterShipments);
    document.getElementById('resetFilters').addEventListener('click', resetAllFilters);
    
    // تهيئة مؤشر الفلاتر
    updateFiltersIndicator();

    // إضافة مستمعي أحداث لحقول الحالة
    setupStatusFieldsListeners();

    // حساب تلقائي لمواعيد الدفع وطلب الإفراج بناءً على موعد الوصول
    try {
        const arrivalDateField = document.getElementById('arrivalDate');
        const paymentDateField = document.getElementById('paymentDate');
        const customsRequestDateField = document.getElementById('customsRequestDate');

        // تنسيق YYYY-MM-DD بدون تأثير المنطقة الزمنية
        const formatDateLocal = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const computeRelativeDate = (arrivalStr, daysBefore) => {
            if (!arrivalStr) return '';
            const parts = arrivalStr.split('-');
            const arrival = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            arrival.setDate(arrival.getDate() - daysBefore);
            return formatDateLocal(arrival);
        };

        const updateDatesFromArrival = () => {
            const arrivalVal = arrivalDateField?.value;
            if (!arrivalVal) return;
            if (paymentDateField) paymentDateField.value = computeRelativeDate(arrivalVal, 3);
            if (customsRequestDateField) customsRequestDateField.value = computeRelativeDate(arrivalVal, 2);
        };

        if (arrivalDateField) {
            arrivalDateField.addEventListener('change', updateDatesFromArrival);
        }
    } catch (e) {
        console.warn('تعذر إعداد الحساب التلقائي لمواعيد الدفع والإفراج:', e);
    }
    
    // تعيين المتغير للإشارة إلى إضافة المستمعات
    shipmentListenersAdded = true;
}

// إضافة دالة إغلاق نموذج الشحنة
function closeShipmentModal() {
    shipmentModal.style.display = 'none';
    shipmentForm.reset();
    currentFiles.clear();
    
    // مسح حالة التعديل
    delete shipmentForm.dataset.editKey;
    
    // إعادة تعيين حالة المستندات
    document.querySelectorAll('.document-box').forEach(box => {
        box.classList.remove('uploaded', 'error');
        box.querySelector('.upload-status').textContent = '';
    });
}

// تحديث دالة showAddShipmentModal
function showAddShipmentModal() {
    console.log('تم استدعاء showAddShipmentModal');
    
    // التأكد من وجود النموذج
    if (!shipmentModal) {
        console.error('نموذج الشحنة غير موجود');
        return;
    }
    
    console.log('نموذج الشحنة موجود، سيتم عرضه...');

    // إعداد النموذج أولاً
    shipmentForm.reset();
    document.getElementById('shipmentModalTitle').textContent = 'إضافة شحنة جديدة';
    document.getElementById('shipmentNumber').value = generateShipmentNumber();
    
    // تحميل القوائم المنسدلة
    loadShippingCompanies(); // تحميل شركات الشحن
    loadClearanceCompanies(); // تحميل شركات التخليص
    
    currentFiles.clear(); // مسح الملفات السابقة
    
    // إعادة تعيين حالة المستندات
    document.querySelectorAll('.document-box').forEach(box => {
        box.classList.remove('uploaded', 'error');
        box.querySelector('.upload-status').textContent = '';
    });
    
    // تعيين القيم الافتراضية للحقول الجديدة
    document.getElementById('customsStatus').value = 'في الانتظار';
    document.getElementById('paymentStatus').value = 'غير مدفوع';
    // استخدام المعرّف الصحيح لحقل الحالة في النموذج
    document.getElementById('status').value = 'في الطريق';
    
    // عرض النموذج أولاً
    shipmentModal.style.display = 'block';
    
    // التبديل إلى تبويب الشحنات بعد عرض النموذج
    switchTab('shipments');
    
    console.log('✅ تم عرض نموذج الشحنة بنجاح!');
    console.log('حالة النموذج:', shipmentModal.style.display);
}

// دالة تحميل الطلبات القابلة للشحن
function loadShippableOrders() {
    // تم حذف هذه الدالة بعد حذف تبويب الطلبات
    return "No orders available";
}


// تحديث دالة handleShipmentSubmit
async function handleShipmentSubmit(e) {
    e.preventDefault();

    const shipmentData = {
        shipment_number: document.getElementById('shipmentNumber').value,
        supplier_name: document.getElementById('supplierName').value,
        goods_type: document.getElementById('goodsType').value,
        quantity: parseFloat(document.getElementById('quantity').value),
        unit: document.getElementById('unit').value,
        shipping_company: document.getElementById('shippingCompany').value,
        arrival_port: document.getElementById('arrivalPort').value || null,
        origin_country: document.getElementById('originCountry').value || null,
        arrival_date: document.getElementById('arrivalDate').value,
        clearance_company: document.getElementById('clearanceCompany').value || null,
        customs_status: document.getElementById('customsStatus').value,
        container_value: parseFloat(document.getElementById('containerValue').value) || null,
        container_number: document.getElementById('containerNumber').value || null,
        bl_number: document.getElementById('blNumber').value || null,
        payment_status: document.getElementById('paymentStatus').value,
        payment_date: document.getElementById('paymentDate').value || null,
        customs_request_date: document.getElementById('customsRequestDate').value || null,
        container_weight: parseFloat(document.getElementById('containerWeight').value) || null,
        status: document.getElementById('status').value,
        notes: document.getElementById('notes').value || '',
        documents: {},
        notification_sent: false,
        updated_at: new Date().toISOString()
    };

    // إضافة المستندات المتوفرة فقط
    if (currentFiles.has('invoice')) {
        shipmentData.documents.invoice = currentFiles.get('invoice');
    }
    if (currentFiles.has('certificate')) {
        shipmentData.documents.certificate = currentFiles.get('certificate');
    }
    if (currentFiles.has('policy')) {
        shipmentData.documents.policy = currentFiles.get('policy');
    }
    if (currentFiles.has('packingList')) {
        shipmentData.documents.packingList = currentFiles.get('packingList');
    }

    // تحويل documents إلى JSON
    shipmentData.documents = JSON.stringify(shipmentData.documents);

    // التحقق من وضع التعديل
    const isEditing = shipmentForm.dataset.editKey;
    const shipmentTitle = document.getElementById('shipmentModalTitle').textContent;
    
    try {
        if (isEditing || shipmentTitle.includes('تعديل')) {
            // وضع التعديل
            const { data, error } = await supabase
                .from('shipments')
                .update(shipmentData)
                .eq('id', isEditing);

            if (error) throw error;
            
            showSuccessMessage('تم تحديث الشحنة بنجاح');
        } else {
            // وضع الإضافة
            shipmentData.created_at = new Date().toISOString();
            
            const { data, error } = await supabase
                .from('shipments')
                .insert([shipmentData]);

            if (error) throw error;
            
            showSuccessMessage('تم حفظ الشحنة بنجاح');
        }
        
        closeShipmentModal();
        await loadShipments();
        setTimeout(() => reapplyFilters(), 100);
        updateQuickReviewCounts();
        updateShipmentStatusDashboard();
        
    } catch (error) {
        console.error('Error saving shipment:', error);
        showErrorMessage('حدث خطأ أثناء حفظ الشحنة: ' + error.message);
    }
}

// تحديث دالة setupDocumentUpload
function setupDocumentUpload() {
    const documentInputs = document.querySelectorAll('.file-input');
    documentInputs.forEach(input => {
        input.addEventListener('change', async function(e) {
            const documentBox = this.parentElement;
            const statusDiv = documentBox.querySelector('.upload-status');
            const file = e.target.files[0];
            
            if (file) {
                // التحقق من حجم الملف (الحد الأقصى 5 ميجابايت)
                if (file.size > 5 * 1024 * 1024) {
                    statusDiv.textContent = 'حجم الملف كبير جداً';
                    documentBox.classList.add('error');
                    return;
                }

                // إظهار حالة التحميل
                statusDiv.textContent = 'جاري التحميل...';
                documentBox.classList.remove('uploaded', 'error');
                
                try {
                    // إنشاء اسم ملف فريد
                    const fileName = `${Date.now()}_${file.name}`;
                    const filePath = `documents/${fileName}`;
                    
                    // رفع الملف إلى Supabase Storage
                    const { data, error } = await supabase.storage
                        .from('documents')
                        .upload(filePath, file);

                    if (error) throw error;

                    // الحصول على الرابط العام للملف
                    const { data: { publicUrl } } = supabase.storage
                        .from('documents')
                        .getPublicUrl(filePath);
                    
                    // تخزين معلومات الملف
                    const docType = documentBox.getAttribute('data-type');
                    currentFiles.set(docType, {
                        id: data.path,
                        url: publicUrl,
                        name: file.name,
                        type: file.type
                    });
                    
                    statusDiv.textContent = 'تم التحميل';
                    documentBox.classList.add('uploaded');
                    
                } catch (error) {
                    statusDiv.textContent = 'فشل التحميل';
                    documentBox.classList.add('error');
                    console.error('خطأ في رفع الملف:', error);
                }
            }
        });
    });
}

// تحديث دالة عرض المستندات (غير مستخدمة حالياً)
async function viewDocuments(shipmentNumber) {
    try {
        const { data: shipment, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('shipment_number', shipmentNumber)
            .single();

        if (error) throw error;

        const documents = typeof shipment.documents === 'string' ? 
            JSON.parse(shipment.documents) : shipment.documents;
        
        if (documents && Object.keys(documents).length > 0) {
            const documentsWindow = window.open('', '_blank');
            documentsWindow.document.write(`
                <html dir="rtl">
                <head>
                    <title>مستندات الشحنة ${shipmentNumber}</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            padding: 20px;
                            background: #f5f5f5;
                        }
                        .documents-grid {
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                            gap: 20px;
                            padding: 20px;
                        }
                        .document-card {
                            background: white;
                            padding: 15px;
                            border-radius: 8px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        }
                        .document-card h3 {
                            margin: 0 0 10px 0;
                            color: #333;
                        }
                        .document-card a {
                            color: #2196F3;
                            text-decoration: none;
                            display: block;
                            margin-top: 10px;
                        }
                        .document-card a:hover {
                            text-decoration: underline;
                        }
                    </style>
                </head>
                <body>
                    <h2>مستندات الشحنة ${shipmentNumber}</h2>
                    <div class="documents-grid">
                        ${documents.invoice ? `
                            <div class="document-card">
                                <h3>الفاتورة</h3>
                                <a href="${documents.invoice.url}" target="_blank">عرض المستند</a>
                            </div>
                        ` : ''}
                        ${documents.certificate ? `
                            <div class="document-card">
                                <h3>شهادة المنشأ</h3>
                                <a href="${documents.certificate.url}" target="_blank">عرض المستند</a>
                            </div>
                        ` : ''}
                        ${documents.policy ? `
                            <div class="document-card">
                                <h3>البوليصة</h3>
                                <a href="${documents.policy.url}" target="_blank">عرض المستند</a>
                            </div>
                        ` : ''}
                        ${documents.packingList ? `
                            <div class="document-card">
                                <h3>قائمة التعبئة</h3>
                                <a href="${documents.packingList.url}" target="_blank">عرض المستند</a>
                            </div>
                        ` : ''}
                    </div>
                </body>
                </html>
            `);
        } else {
            alert('لا توجد مستندات لهذه الشحنة');
        }
    } catch (error) {
        console.error('Error loading documents:', error);
        alert('حدث خطأ أثناء تحميل المستندات');
    }
}

// تحديث دالة حذف ملف
function removeFile(fileId) {
    currentFiles.delete(fileId);
    const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
    if (fileItem) {
        fileItem.remove();
    }
}

// دالة توليد رقم شحنة
function generateShipmentNumber() {
    // إنشاء رقم شحنة فريد باستخدام التاريخ والوقت
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // آخر رقمين من السنة
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // الشهر
    const day = now.getDate().toString().padStart(2, '0'); // اليوم
    const hour = now.getHours().toString().padStart(2, '0'); // الساعة
    const minute = now.getMinutes().toString().padStart(2, '0'); // الدقيقة
    const second = now.getSeconds().toString().padStart(2, '0'); // الثانية
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0'); // رقم عشوائي
    
    return `SHP-${year}${month}${day}-${hour}${minute}${second}-${random}`;
}

// دالة إظهار حالة التحميل
function showLoading(container) {
    const loader = document.createElement('div');
    loader.className = 'loader-container';
    loader.innerHTML = `
        <div class="loader"></div>
        <p>جاري التحميل...</p>
    `;
    container.appendChild(loader);
}

// دالة إخفاء حالة التحميل
function hideLoading(container) {
    const loader = container.querySelector('.loader-container');
    if (loader) {
        loader.remove();
    }
}

// دالة اختبار تحميل البيانات
function testLoadShipments() {
    const cardsContainer = document.getElementById('shipmentsCardsContainer');
    
    // بيانات تجريبية للاختبار
    const sampleShipments = [
        {
            shipment_number: 'SH001',
            supplier: 'شركة النقل السريع',
            status: 'تم الشحن',
            arrival_date: '2025-10-15',
            created_at: new Date().toISOString()
        },
        {
            shipment_number: 'SH002',
            supplier: 'شركة الشحن العالمية',
            status: 'في انتظار التخليص',
            arrival_date: '2025-10-20',
            created_at: new Date().toISOString()
        },
        {
            shipment_number: 'SH003',
            supplier: 'شركة النقل البحري',
            status: 'تم التأكيد',
            arrival_date: '2025-10-25',
            created_at: new Date().toISOString()
        },
        {
            shipment_number: 'SH004',
            supplier: 'شركة الشحن الجوي',
            status: 'متأخر',
            arrival_date: '2025-10-10',
            created_at: new Date().toISOString()
        },
        {
            shipment_number: 'SH005',
            supplier: 'شركة النقل البري',
            status: 'في انتظار التخليص الجمركي',
            arrival_date: '2025-10-30',
            created_at: new Date().toISOString()
        }
    ];
    
    // مسح المحتوى
    cardsContainer.innerHTML = '';
    
    // إنشاء الكروت من البيانات التجريبية
    sampleShipments.forEach(shipment => {
        createShipmentCard(shipment, cardsContainer);
    });
    
    console.log('تم تحميل البيانات التجريبية بنجاح');
}

// إضافة event listener للتبويبات
document.addEventListener('DOMContentLoaded', function() {
    // إضافة event listeners للتبويبات
    document.querySelectorAll('[data-tab]').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // إخفاء جميع المحتويات
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            
            // إظهار المحتوى المحدد
            const targetContent = document.getElementById(tabName + 'Section');
            if (targetContent) {
                targetContent.classList.remove('hidden');
                
                // تحميل البيانات عند فتح تبويب الشحنات
                if (tabName === 'shipments') {
                    setTimeout(() => {
                        loadShipments();
                    }, 100);
                }
            }
            
            // تحديث حالة التبويبات النشطة
            document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // تحميل البيانات الأولية
    setTimeout(() => {
        loadShipments();
    }, 500);
});

// تحديث دالة تحميل الشحنات
async function loadShipments() {
    const cardsContainer = document.getElementById('shipmentsCardsContainer');
    const tableBody = document.getElementById('shipmentsTableBody');
    
    // إظهار حالة التحميل
    cardsContainer.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>جاري تحميل الشحنات...</p>
        </div>
    `;

    try {
        // جلب جميع الشحنات من Supabase
        const { data: shipments, error } = await supabase
            .from('shipments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error:', error);
            // إضافة بيانات تجريبية في حالة وجود خطأ
            const sampleShipments = [
                {
                    shipment_number: 'SH001',
                    supplier: 'شركة النقل السريع',
                    status: 'تم الشحن',
                    arrival_date: '2025-10-15',
                    created_at: new Date().toISOString()
                },
                {
                    shipment_number: 'SH002',
                    supplier: 'شركة الشحن العالمية',
                    status: 'في انتظار التخليص',
                    arrival_date: '2025-10-20',
                    created_at: new Date().toISOString()
                },
                {
                    shipment_number: 'SH003',
                    supplier: 'شركة النقل البحري',
                    status: 'تم التأكيد',
                    arrival_date: '2025-10-25',
                    created_at: new Date().toISOString()
                }
            ];
            
            // مسح المحتوى
            cardsContainer.innerHTML = '';
            tableBody.innerHTML = '';
            
            // إنشاء الكروت من البيانات التجريبية
            sampleShipments.forEach(shipment => {
                createShipmentCard(shipment, cardsContainer);
                addShipmentRow(shipment, tableBody);
            });
            
            console.log('تم تحميل البيانات التجريبية');
            return;
        }

        // مسح المحتوى
        cardsContainer.innerHTML = '';
        tableBody.innerHTML = '';
        
        // إنشاء الكروت
        if (!shipments || shipments.length === 0) {
            cardsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <h3>لا توجد شحنات</h3>
                    <p>ابدأ بإضافة شحنة جديدة</p>
                </div>
            `;
        } else {
            shipments.forEach(shipment => {
                createShipmentCard(shipment, cardsContainer);
                addShipmentRow(shipment, tableBody);
            });
        }
        
        // الاستماع للتغييرات في الوقت الفعلي
        setupRealtimeSubscription();
    } catch (error) {
        console.error('Error loading shipments:', error);
        cardsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>حدث خطأ</h3>
                <p>فشل تحميل الشحنات</p>
                <button class="primary-btn" onclick="loadShipments()">إعادة المحاولة</button>
            </div>
        `;
    }
}

// إضافة دالة للاستماع للتغييرات في الوقت الفعلي
function setupRealtimeSubscription() {
    supabase
        .channel('shipments-channel')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'shipments' 
        }, (payload) => {
            loadShipments();
        })
        .subscribe();
}

// دالة إنشاء كارت الشحنة
function createShipmentCard(shipment, container) {
    const card = document.createElement('div');
    card.className = 'shipment-card shipment-list-card';
    card.setAttribute('data-shipment-id', shipment.shipment_number);
    card.setAttribute('onclick', `viewShipmentDetails('${shipment.shipment_number}')`);
    
    // تحديد حالة الدفع
    const paymentStatus = shipment.payment_status || 'غير مدفوع';
    const isPaid = paymentStatus === 'مدفوع' || paymentStatus === 'تم الدفع';
    
    // تحديد الحالة العامة وفق الحالات الجديدة
    const generalStatus = shipment.status || 'تم تأكيد الطلب';
    let statusClass = 'in-transit';
    let statusText = generalStatus;

    // خرائط صريحة للحالات
    if (generalStatus === 'تم تأكيد الطلب') {
        statusClass = 'in-transit';
        statusText = 'تم تأكيد الطلب';
    } else if (generalStatus === 'تم الشحن') {
        statusClass = 'in-transit';
        statusText = 'تم الشحن';
    } else if (generalStatus === 'في انتظار تخليص الجمركي') {
        statusClass = 'customs-hold';
        statusText = 'في انتظار تخليص الجمركي';
    } else if (generalStatus === 'تم الاستلام') {
        statusClass = 'arrived';
        statusText = 'تم الاستلام';
    } else if (generalStatus.includes('متأخر') || generalStatus.includes('تأخر')) {
        statusClass = 'delayed';
        statusText = 'متأخر';
    } else if (generalStatus.includes('جمرك') || generalStatus.includes('إفراج')) {
        statusClass = 'customs-hold';
        statusText = 'في الجمرك';
    } else if (generalStatus.includes('مينا') || generalStatus.includes('ميناء')) {
        statusClass = 'at-port';
        statusText = 'في الميناء';
    }
    
    // قالب مبسّط على شكل بطاقة قائمة مع أيقونة وقChevron
    const supplier = shipment.supplier_name || '—';
    const goods = shipment.goods_type || '—';
    const eta = shipment.arrival_date ? formatDate(shipment.arrival_date) : '—';
    const containerNo = shipment.container_number || '—';

    card.innerHTML = `
        <div class="list-card-body">
            <div class="list-left">
                <div class="list-icon"><i class="fas fa-ship"></i></div>
            </div>
            <div class="list-content">
                <div class="list-row primary">
                    <span class="list-field supplier">${supplier}</span>
                    <span class="list-sep">•</span>
                    <span class="list-field goods">${goods}</span>
                </div>
                <div class="list-row secondary">
                    <span class="list-label">ETA</span>
                    <span class="list-value">${eta}</span>
                    <span class="list-sep">•</span>
                    <span class="list-label">رقم الحاوية</span>
                    <span class="list-value">${containerNo}</span>
                </div>
            </div>
            <div class="list-right">
                <i class="fas fa-chevron-left chevron"></i>
            </div>
        </div>
    `;
    
    container.appendChild(card);
}

// إعداد مستمعي أحداث التصفية الجديدة
function setupShipmentFilters() {
    // إعداد التبويبات
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // إزالة الفئة النشطة من جميع التبويبات
            filterTabs.forEach(t => t.classList.remove('active'));
            // إضافة الفئة النشطة للتبويب المحدد
            this.classList.add('active');
            
            // تطبيق التصفية
            const filter = this.getAttribute('data-filter');
            filterShipmentsByTab(filter);
        });
    });
    
    // إعداد البحث
    const searchInput = document.getElementById('shipmentSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterShipmentsBySearch(this.value);
        });
    }
}

// دالة تصفية الشحنات حسب التبويب
function filterShipmentsByTab(filter) {
    const cards = document.querySelectorAll('.shipment-card');
    
    cards.forEach(card => {
        const shipmentId = card.getAttribute('data-shipment-id');
        const shipment = getShipmentById(shipmentId);
        
        if (!shipment) return;
        
        let shouldShow = true;
        
        switch(filter) {
            case 'upcoming':
                // الشحنات القادمة خلال 7 أيام
                if (shipment.arrivalDate) {
                    const arrivalDate = new Date(shipment.arrivalDate);
                    const today = new Date();
                    const diffTime = arrivalDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    shouldShow = diffDays > 0 && diffDays <= 7;
                } else {
                    shouldShow = false;
                }
                break;
                
            case 'delayed':
                // الشحنات المتأخرة
                if (shipment.arrivalDate) {
                    const arrivalDate = new Date(shipment.arrivalDate);
                    const today = new Date();
                    shouldShow = arrivalDate < today;
                } else {
                    shouldShow = shipment.status && shipment.status.includes('متأخر');
                }
                break;
                
            case 'action-required':
                // الشحنات التي تحتاج إجراء
                shouldShow = shipment.paymentStatus === 'غير مدفوع' || 
                           shipment.customsStatus === 'في الانتظار' ||
                           shipment.customsStatus === 'مرفوض';
                break;
                
            case 'all':
            default:
                shouldShow = true;
                break;
        }
        
        card.style.display = shouldShow ? 'block' : 'none';
    });
}

// دالة تصفية الشحنات حسب البحث
function filterShipmentsBySearch(searchTerm) {
    const cards = document.querySelectorAll('.shipment-card');
    const term = searchTerm.toLowerCase();
    
    cards.forEach(card => {
        const titleElement = card.querySelector('.shipment-title');
        if (!titleElement) return; // تخطي البطاقة إذا لم تجد العنوان
        
        const title = titleElement.textContent.toLowerCase();
        const id = card.querySelector('.shipment-id').textContent.toLowerCase();
        const supplier = card.querySelector('.detail-value').textContent.toLowerCase();
        
        const shouldShow = title.includes(term) || id.includes(term) || supplier.includes(term);
        card.style.display = shouldShow ? 'block' : 'none';
    });
}

// دالة مساعدة للحصول على بيانات الشحنة
function getShipmentById(shipmentId) {
    const tableBody = document.getElementById('shipmentsTableBody');
    const row = tableBody.querySelector(`tr[data-shipment-id="${shipmentId}"]`);
    if (row) {
        // استخراج البيانات من الجدول المخفي
        const cells = row.querySelectorAll('td');
        return {
            shipmentNumber: shipmentId,
            supplierName: cells[1]?.textContent || '',
            goodsType: cells[2]?.textContent || '',
            containerNumber: cells[12]?.textContent || '',
            arrivalDate: cells[8]?.textContent || '',
            paymentStatus: cells[14]?.textContent || '',
            customsStatus: cells[10]?.textContent || '',
            status: cells[18]?.textContent || ''
        };
    }
    return null;
}

// تحديث دالة إضافة صف شحنة
function addShipmentRow(shipment, tableBody) {
    const row = document.createElement('tr');
    row.setAttribute('data-shipment-id', shipment.shipment_number);
    
    // إنشاء شارات الحالة الجديدة
    const customsIcon = shipment.customs_status === 'تم الإفراج' ? 
        `<i class="fas fa-check-circle customs-completed" title="تم الإفراج الجمركي"></i>` :
        shipment.customs_status === 'مرفوض' ?
        `<i class="fas fa-times-circle customs-rejected" title="مرفوض"></i>` :
        `<i class="fas fa-exclamation-triangle customs-pending" title="في انتظار الإفراج الجمركي"></i>`;
        
    const paymentIcon = shipment.payment_status === 'تم الدفع' || shipment.payment_status === 'مدفوع' ? 
        `<i class="fas fa-dollar-sign payment-completed" title="تم الدفع"></i>` :
        `<i class="fas fa-credit-card payment-pending" title="غير مدفوع"></i>`;

    const customsBadge = shipment.customs_status === 'تم الإفراج' ? 
        `<span class="status-badge customs-released">${customsIcon} تم الإفراج</span>` :
        shipment.customs_status === 'مرفوض' ?
        `<span class="status-badge customs-rejected">${customsIcon} مرفوض</span>` :
        `<span class="status-badge customs-pending">${customsIcon} ${shipment.customs_status || 'في الانتظار'}</span>`;
    
    const paymentBadge = shipment.payment_status === 'تم الدفع' || shipment.payment_status === 'مدفوع' ? 
        `<span class="status-badge payment-completed">${paymentIcon} تم الدفع</span>` :
        `<span class="status-badge payment-pending">${paymentIcon} غير مدفوع</span>`;

    // العثور على اسم شركة الشحن
    const shippingCompanyName = (() => {
        if (!shipment.shipping_company) return 'غير محدد';
        
        // إذا كان المحفوظ هو معرف الشركة، البحث عن الاسم
        const company = findClearanceCompanyById(shipment.shipping_company);
        if (company) return company.name;
        
        // إذا كان نص مباشر
        return shipment.shipping_company;
    })();

    const docs = typeof shipment.documents === 'string' ? 
        JSON.parse(shipment.documents || '{}') : (shipment.documents || {});

    row.innerHTML = `
            <td>${shipment.shipment_number}</td>
            <td>${shipment.supplier_name || '-'}</td>
            <td>${shipment.goods_type}</td>
            <td>${shipment.quantity}</td>
            <td>${shipment.unit}</td>
            <td>${shippingCompanyName}</td>
            <td>${shipment.arrival_port || '-'}</td>
            <td>${shipment.origin_country || '-'}</td>
            <td>${formatDate(shipment.arrival_date)}</td>
            <td>${shipment.clearance_company || '-'}</td>
            <td>${customsBadge}</td>
            <td>${formatCurrency(shipment.container_value || 0)}</td>
            <td>${shipment.container_number || '-'}</td>
            <td>${shipment.bl_number || '-'}</td>
            <td>${paymentBadge}</td>
            <td>${formatDate(shipment.payment_date)}</td>
            <td>${formatDate(shipment.customs_request_date)}</td>
            <td>${shipment.container_weight || '-'} كغ</td>
            <td>${shipment.status}</td>
            <td>${Object.keys(docs).length}</td>
            <td>
                <button class="edit-btn" onclick="editShipment('${shipment.shipment_number}')">تعديل</button>
                <button class="delete-btn" onclick="deleteShipment('${shipment.shipment_number}')">حذف</button>
            </td>
    `;
    tableBody.appendChild(row);
}

// تحديث دالة editShipment لتحميل المستندات الموجودة
async function editShipment(shipmentNumber) {
    // أغلق نافذة تفاصيل الشحنة إن كانت مفتوحة لتجنب تداخل النوافذ
    try { closeDetailsModal(); } catch (e) { /* ignore if not open */ }
    // التبديل إلى تبويب الشحنات أولاً

    try {
            const { data: shipments, error } = await supabase
                .from('shipments')
                .select('*')
                .eq('shipment_number', shipmentNumber)
                .single();

            if (error) throw error;

            if (shipments) {
                // إعادة تعيين النموذج أولاً
                shipmentForm.reset();
                
                // تعيين حالة التعديل
                shipmentForm.dataset.editKey = shipments.id;
                
                // تحديث العنوان ليشير إلى التعديل
                document.getElementById('shipmentModalTitle').textContent = 'تعديل الشحنة';
                
                // تعيين رقم الشحنة
                document.getElementById('shipmentNumber').value = shipments.shipment_number;
                
                // تعيين جميع الحقول
                document.getElementById('supplierName').value = shipments.supplier_name || '';
                document.getElementById('goodsType').value = shipments.goods_type || '';
                document.getElementById('quantity').value = shipments.quantity || '';
                document.getElementById('unit').value = shipments.unit || '';
                document.getElementById('arrivalPort').value = shipments.arrival_port || '';
                document.getElementById('originCountry').value = shipments.origin_country || '';
                document.getElementById('arrivalDate').value = shipments.arrival_date || '';
                document.getElementById('customsStatus').value = shipments.customs_status || 'في الانتظار';
                document.getElementById('containerValue').value = shipments.container_value || '';
                document.getElementById('containerNumber').value = shipments.container_number || '';
                document.getElementById('blNumber').value = shipments.bl_number || '';
                document.getElementById('paymentStatus').value = shipments.payment_status || 'غير مدفوع';
                const paymentDateInput = document.getElementById('paymentDate');
                const customsReqInput = document.getElementById('customsRequestDate');
                paymentDateInput.value = shipments.payment_date || '';
                customsReqInput.value = shipments.customs_request_date || '';
                document.getElementById('containerWeight').value = shipments.container_weight || '';
                document.getElementById('status').value = shipments.status || 'في الطريق';
                document.getElementById('notes').value = shipments.notes || '';

                // إذا كانت المواعيد فارغة، احسبها تلقائيًا من موعد الوصول
                const arrivalVal = document.getElementById('arrivalDate').value;
                if (arrivalVal) {
                    const parts = arrivalVal.split('-');
                    const arrival = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    if (!paymentDateInput.value) {
                        const pay = new Date(arrival);
                        pay.setDate(pay.getDate() - 3);
                        paymentDateInput.value = fmt(pay);
                    }
                    if (!customsReqInput.value) {
                        const cr = new Date(arrival);
                        cr.setDate(cr.getDate() - 2);
                        customsReqInput.value = fmt(cr);
                    }
                }
                
                // تحميل شركات الشحن والتخليص وتعيين القيم
                loadShippingCompanies();
                loadClearanceCompanies();
                
                setTimeout(() => {
                    document.getElementById('shippingCompany').value = shipments.shipping_company || '';
                    document.getElementById('clearanceCompany').value = shipments.clearance_company || '';

                    // تحميل المستندات الموجودة
                    currentFiles.clear();
                    if (shipments.documents) {
                        const docs = typeof shipments.documents === 'string' ? 
                            JSON.parse(shipments.documents) : shipments.documents;
                        Object.entries(docs).forEach(([key, doc]) => {
                            currentFiles.set(key, doc);
                            const inputElement = document.querySelector(`input[name="${key}"]`);
                            if (inputElement) {
                                const documentBox = inputElement.closest('.document-box');
                                const statusDiv = documentBox.querySelector('.upload-status');
                                statusDiv.textContent = 'تم التحميل';
                                documentBox.classList.add('uploaded');
                            }
                        });
                    }
                }, 100);
                
                shipmentModal.style.display = 'block';
            } else {
                showErrorMessage('لم يتم العثور على الشحنة');
            }
        } catch (error) {
            console.error('Error loading shipment for editing:', error);
            showErrorMessage('حدث خطأ أثناء تحميل بيانات الشحنة');
        }
    }


// إضافة دالة حذف الشحنة
async function deleteShipment(shipmentNumber) {
    try {
        const { data: shipment, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('shipment_number', shipmentNumber)
            .single();
        
        
        if (!shipment) {
            showErrorMessage('لم يتم العثور على الشحنة');
            return;
        }

        // بناء رسالة التأكيد
        let confirmMessage = 'هل أنت متأكد من حذف هذه الشحنة؟\n\n';
        confirmMessage += `رقم الشحنة: ${shipmentNumber}\n`;
        confirmMessage += `نوع البضاعة: ${shipment.goods_type}\n`;
        confirmMessage += `الحالة الحالية: ${shipment.status}\n\n`;
        confirmMessage += '\nسيتم حذف جميع البيانات المرتبطة بالشحنة نهائياً.';

        if (confirm(confirmMessage)) {
            // حذف الشحنة
            const { error: deleteError } = await supabase
                .from('shipments')
                .delete()
                .eq('shipment_number', shipmentNumber);

            if (deleteError) throw deleteError;

            showSuccessMessage('تم حذف الشحنة بنجاح');
            await loadShipments();
            setTimeout(() => reapplyFilters(), 100);
            updateQuickReviewCounts();
            updateShipmentStatusDashboard();
        }
    } catch (error) {
        console.error('Error deleting shipment:', error);
        showErrorMessage('حدث خطأ أثناء حذف الشحنة: ' + error.message);
    }
}

// تحديث دالة تصفية الشحنات بإضافة تصفية متقدمة
function filterShipments() {
    const searchTerm = document.getElementById('shipmentSearch').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value;
    const customsFilter = document.getElementById('filterCustoms').value;
    const paymentFilter = document.getElementById('filterPayment').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const rows = document.querySelectorAll('#shipmentsTableBody tr');
    
    let matchCount = 0;

    rows.forEach(row => {
        const cells = row.getElementsByTagName('td');
        let textMatch = false;
        
        // البحث في النص
        for (let cell of cells) {
            if (cell.textContent.toLowerCase().includes(searchTerm)) {
                textMatch = true;
                break;
            }
        }
        
        // التحقق من الحالة (العمود 10 بعد إضافة عمود الوزن)
        const statusCell = row.querySelector('td:nth-child(10)');
        const shipmentStatus = statusCell ? statusCell.textContent.trim() : '';
        const statusMatch = statusFilter === 'all' || shipmentStatus === statusFilter;

        // التحقق من الإفراج الجمركي (العمود 11)
        const customsCell = row.querySelector('td:nth-child(11)');
        const customsStatus = customsCell ? customsCell.textContent.toLowerCase() : '';
        let customsMatch = true;
        if (customsFilter === 'released') {
            customsMatch = customsStatus.includes('تم الإفراج') || customsStatus.includes('completed');
        } else if (customsFilter === 'pending') {
            customsMatch = customsStatus.includes('في الانتظار') || customsStatus.includes('pending');
        }

        // التحقق من حالة الدفع (العمود 12)
        const paymentCell = row.querySelector('td:nth-child(12)');
        const paymentStatus = paymentCell ? paymentCell.textContent.toLowerCase() : '';
        let paymentMatch = true;
        if (paymentFilter === 'completed') {
            paymentMatch = paymentStatus.includes('تم الدفع') || paymentStatus.includes('completed');
        } else if (paymentFilter === 'pending') {
            paymentMatch = paymentStatus.includes('في الانتظار') || paymentStatus.includes('pending');
        }

        // التحقق من التاريخ
        const dateCell = row.querySelector('td:nth-child(8)'); // عمود موعد الوصول
        const orderDate = new Date(dateCell?.textContent);
        const today = new Date();
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        const dateMatch = start && end ? orderDate >= start && orderDate <= end :
            start ? orderDate >= start :
            end ? orderDate <= end : true;

        // عرض/إخفاء الصف
        const shouldShow = textMatch && statusMatch && customsMatch && paymentMatch && dateMatch;
        row.style.display = shouldShow ? '' : 'none';
        if (shouldShow) matchCount++;
    });

    updateResultsCount(matchCount);
    
    // حفظ حالة الفلاتر الحالية
    saveCurrentFiltersState();
}

// دالة حفظ حالة الفلاتر الحالية
function saveCurrentFiltersState() {
    currentFiltersState = {
        search: document.getElementById('shipmentSearch').value,
        status: document.getElementById('filterStatus').value,
        customs: document.getElementById('filterCustoms').value,
        payment: document.getElementById('filterPayment').value,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value
    };
    
    // تحديث مؤشر الفلاتر النشطة
    updateFiltersIndicator();
}

// دالة تحديث مؤشر الفلاتر النشطة
function updateFiltersIndicator() {
    // التحقق من وجود الحالة المحفوظة
    if (!currentFiltersState) return;
    
    const hasActiveFilters = 
        currentFiltersState.search !== '' ||
        currentFiltersState.status !== 'all' ||
        currentFiltersState.customs !== 'all' ||
        currentFiltersState.payment !== 'all' ||
        currentFiltersState.startDate !== '' ||
        currentFiltersState.endDate !== '';
    
    const resetBtn = document.getElementById('resetFilters');
    if (resetBtn) {
        if (hasActiveFilters) {
            resetBtn.classList.add('filters-active');
            resetBtn.title = 'توجد فلاتر نشطة - اضغط لإعادة التعيين';
        } else {
            resetBtn.classList.remove('filters-active');
            resetBtn.title = 'إعادة تعيين جميع الفلاتر';
        }
    }
}

// دالة إعادة تطبيق الفلاتر المحفوظة
function reapplyFilters() {
    // إعادة تعيين قيم الفلاتر
    document.getElementById('shipmentSearch').value = currentFiltersState.search;
    document.getElementById('filterStatus').value = currentFiltersState.status;
    document.getElementById('filterCustoms').value = currentFiltersState.customs;
    document.getElementById('filterPayment').value = currentFiltersState.payment;
    document.getElementById('startDate').value = currentFiltersState.startDate;
    document.getElementById('endDate').value = currentFiltersState.endDate;
    
    // تطبيق التصفية
    filterShipments();
    
    // تحديث مؤشر الفلاتر
    updateFiltersIndicator();
}

// دالة إعادة تعيين جميع الفلاتر
function resetAllFilters() {
    document.getElementById('shipmentSearch').value = '';
    document.getElementById('filterStatus').value = 'all';
    document.getElementById('filterCustoms').value = 'all';
    document.getElementById('filterPayment').value = 'all';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    
    // تحديث حالة الفلاتر المحفوظة
    currentFiltersState = {
        search: '',
        status: 'all',
        customs: 'all',
        payment: 'all',
        startDate: '',
        endDate: ''
    };
    
    // تطبيق التصفية لإظهار جميع النتائج
    filterShipments();
    
    // تحديث مؤشر الفلاتر
    updateFiltersIndicator();
}

// دالة التحقق من نطاق التاريخ
function checkDateRange(dateStr, startDate, endDate) {
    if (!startDate && !endDate) return true;
    if (!dateStr) return false;

    const date = new Date(dateStr);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    if (start && end) {
        return date >= start && date <= end;
    } else if (start) {
        return date >= start;
    } else if (end) {
        return date <= end;
    }
    return true;
}

// إضافة مستمعي الأحداث للتواريخ
document.getElementById('startDate').addEventListener('change', filterShipments);
document.getElementById('endDate').addEventListener('change', filterShipments);

// دالة تمييز النص المطابق
function highlightMatchedText(cell, searchTerms) {
    const originalText = cell.textContent;
    let highlightedText = originalText;
    
    searchTerms.forEach(term => {
        if (term) {
            const regex = new RegExp(`(${term})`, 'gi');
            highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
        }
    });
    
    cell.innerHTML = highlightedText;
}

// دالة تحديث عداد النتائج
function updateResultsCount(count) {
    const searchContainer = document.querySelector('.search-container');
    if (!searchContainer) return; // تخطي إذا لم تجد الحاوية
    
    let resultsCounter = searchContainer.querySelector('.results-counter');
    
    if (!resultsCounter) {
        resultsCounter = document.createElement('div');
        resultsCounter.className = 'results-counter';
        searchContainer.appendChild(resultsCounter);
    }
    
    resultsCounter.textContent = `تم العثور على ${count} نتيجة`;
}

// تحديث دالة عرض تفاصيل الشحنة بمظهر حديث مع أزرار تعديل/حذف
async function viewShipmentDetails(shipmentNumber) {
    setTimeout(async () => {
        const detailsModal = document.getElementById('shipmentDetailsModal');
        const detailsContent = document.getElementById('shipmentDetailsContent');

        try {
            let shipment = null;
            try {
                const { data, error } = await supabase
                    .from('shipments')
                    .select('*')
                    .eq('shipment_number', shipmentNumber)
                    .single();
                if (error) throw error;
                shipment = data;
            } catch (netErr) {
                // فشل الشبكة: استخدم التخزين المؤقت إن وجد
                if (window.shipmentsCache && Array.isArray(window.shipmentsCache)) {
                    shipment = window.shipmentsCache.find(s => s.shipment_number === shipmentNumber);
                }
                if (!shipment) throw netErr;
            }

            if (shipment) {
                const docs = typeof shipment.documents === 'string'
                    ? JSON.parse(shipment.documents)
                    : shipment.documents;

                const statusText = shipment.status || 'غير محدد';
                const createdAt = shipment.created_at ? formatDate(shipment.created_at) : '-';
                const pickedUpAt = shipment.pickup_date ? formatDate(shipment.pickup_date) : (shipment.updated_at ? formatDate(shipment.updated_at) : '-');
                // بناء مخطط زمني للحالة العامة للحاوية
                function normalizeGeneralStatus(s) {
                    const v = (s || '').toLowerCase();
                    if (v.includes('استلام') || v.includes('received')) return 'received';
                    if (v.includes('جمرك') || v.includes('customs')) return 'awaiting_customs_clearance';
                    if (v.includes('شحن') || v.includes('shipped')) return 'shipped';
                    if (v.includes('تأكيد') || v.includes('confirmed')) return 'order_confirmed';
                    return null;
                }

                const statusNormalized = normalizeGeneralStatus(shipment.status);
                const statusOrder = ['order_confirmed', 'shipped', 'awaiting_customs_clearance', 'received'];
                const currentIndex = statusNormalized ? statusOrder.indexOf(statusNormalized) : -1;
                const stageDates = [
                    shipment.created_at ? formatDate(shipment.created_at) : '-',
                    shipment.pickup_date ? formatDate(shipment.pickup_date) : (shipment.updated_at ? formatDate(shipment.updated_at) : '-'),
                    shipment.customs_request_date ? formatDate(shipment.customs_request_date) : (shipment.arrival_date ? formatDate(shipment.arrival_date) : '-'),
                    shipment.received_date ? formatDate(shipment.received_date) : (shipment.updated_at ? formatDate(shipment.updated_at) : '-')
                ];

                function stageClass(i) {
                    if (currentIndex < 0) return 'upcoming';
                    if (i < currentIndex) return 'completed';
                    if (i === currentIndex) return 'current';
                    return 'upcoming';
                }

                const timelineHTML = '';

                detailsContent.innerHTML = `
                    <div class="details-modal-header">
                        <div class="title-row">
                            <h2>تفاصيل الشحنة</h2>
                            <span class="status-dot ${statusText.includes('وصول') ? 'status-arrived' : 'status-in-transit'}"></span>
                            <span class="status-text">${statusText}</span>
                        </div>
                        <div class="subtitle">رقم الشحنة #${shipment.shipment_number}</div>
                    </div>

                <div class="details-actions">
                    <button class="action-btn edit" title="تعديل" aria-label="تعديل" onclick="editShipment('${shipment.shipment_number}')"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete" title="حذف" aria-label="حذف" onclick="deleteShipment('${shipment.shipment_number}')"><i class="fas fa-trash"></i></button>
                    <button class="action-btn close" title="إغلاق" aria-label="إغلاق" onclick="closeDetailsModal()"><i class="fas fa-times"></i></button>
                </div>

                    <div class="details-card">
                        <div class="details-section-title">معلومات أساسية</div>
                        <div class="details-grid-2col">
                            <div class="pair"><div class="label">اسم المورد</div><div class="value">${shipment.supplier_name || '-'}</div></div>
                            <div class="pair"><div class="label">نوع البضاعة</div><div class="value">${shipment.goods_type || '-'}</div></div>
                            <div class="pair"><div class="label">الكمية</div><div class="value">${shipment.quantity || '-'} ${shipment.unit || ''}</div></div>
                            <div class="pair"><div class="label">وزن الحاوية</div><div class="value">${shipment.container_weight || '-'} كغ</div></div>
                            <div class="pair"><div class="label">الحالة العامة</div><div class="value">${shipment.status || '-'}</div></div>
                        </div>
                    </div>

                    ${timelineHTML}

                    <div class="details-card">
                        <div class="details-section-title">الشحن البحري</div>
                        <div class="details-grid-2col">
                            <div class="pair"><div class="label">شركة الشحن</div><div class="value">${shipment.shipping_company || '-'}</div></div>
                            <div class="pair"><div class="label">رقم الحاوية</div><div class="value">${shipment.container_number || '-'}</div></div>
                            <div class="pair"><div class="label">رقم BL</div><div class="value">${shipment.bl_number || '-'}</div></div>
                            <div class="pair"><div class="label">بلد المنشأ</div><div class="value">${shipment.origin_country || '-'}</div></div>
                            <div class="pair"><div class="label">ميناء الوصول</div><div class="value">${shipment.arrival_port || '-'}</div></div>
                            <div class="pair"><div class="label">ETA</div><div class="value">${formatDate(shipment.arrival_date) || '-'}</div></div>
                        </div>
                    </div>

                    <div class="details-card">
                        <div class="details-section-title">التخليص الجمركي</div>
                        <div class="details-grid-2col">
                            <div class="pair"><div class="label">شركة التخليص</div><div class="value">${shipment.clearance_company || '-'}</div></div>
                            <div class="pair"><div class="label">حالة الإفراج</div><div class="value">${shipment.customs_status || '-'}</div></div>
                            <div class="pair"><div class="label">تاريخ طلب الإفراج</div><div class="value">${formatDate(shipment.customs_request_date) || '-'}</div></div>
                        </div>
                    </div>

                    <div class="details-card">
                        <div class="details-section-title">ملخص مالي</div>
                        <div class="details-grid-2col">
                            <div class="pair"><div class="label">قيمة الحاوية</div><div class="value">${shipment.container_value ? Number(shipment.container_value).toLocaleString() + ' $' : '-'}</div></div>
                            <div class="pair"><div class="label">حالة الدفع</div><div class="value">${shipment.payment_status || '-'}</div></div>
                            <div class="pair"><div class="label">موعد الدفع</div><div class="value">${formatDate(shipment.payment_date) || '-'}</div></div>
                        </div>
                    </div>

                    

                    ${shipment.notes ? `
                    <div class="details-card">
                        <div class="details-section-title">ملاحظات</div>
                        <div class="details-grid-2col">
                            <div class="pair"><div class="label">—</div><div class="value">${shipment.notes}</div></div>
                        </div>
                    </div>
                    ` : ''}

                    

                    <div class="details-card">
                        <div class="details-section-title">المستندات</div>
                        <div class="documents-grid">
                            ${docs?.invoice ? `
                                <a href="${docs.invoice.url}" target="_blank" class="document-link"><i class="fas fa-file-invoice"></i><span>الفاتورة</span></a>
                            ` : ''}
                            ${docs?.certificate ? `
                                <a href="${docs.certificate.url}" target="_blank" class="document-link"><i class="fas fa-certificate"></i><span>شهادة المنشأ</span></a>
                            ` : ''}
                            ${docs?.policy ? `
                                <a href="${docs.policy.url}" target="_blank" class="document-link"><i class="fas fa-file-contract"></i><span>البوليصة</span></a>
                            ` : ''}
                            ${docs?.packingList ? `
                                <a href="${docs.packingList.url}" target="_blank" class="document-link"><i class="fas fa-list-alt"></i><span>قائمة التعبئة</span></a>
                            ` : ''}
                        </div>
                    </div>
                `;

                detailsModal.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading shipment details:', error);
            const modalEl = document.getElementById('shipmentDetailsModal');
            const contentEl = document.getElementById('shipmentDetailsContent');
            if (contentEl) {
                contentEl.innerHTML = `
                    <div class="details-modal-header">
                        <div class="title-row">
                            <h2>تفاصيل الشحنة</h2>
                        </div>
                        <div class="subtitle">تعذر تحميل التفاصيل بسبب انقطاع الاتصال</div>
                    </div>
                    <div class="details-card">
                        <div class="details-section-title">معلومات متاحة</div>
                        <div class="details-grid-2col">
                            <div class="pair"><div class="label">رقم الشحنة</div><div class="value">${shipmentNumber}</div></div>
                            <div class="pair"><div class="label">ملاحظة</div><div class="value">يرجى التحقق من الاتصال بالإنترنت ثم المحاولة مرة أخرى</div></div>
                        </div>
                    </div>
                `;
                if (modalEl) modalEl.style.display = 'block';
            } else {
                showErrorMessage('حدث خطأ أثناء تحميل تفاصيل الشحنة');
            }
        }
    }, 100);
}

// إضافة دالة إغلاق نافذة التفاصيل
function closeDetailsModal() {
    const detailsModal = document.getElementById('shipmentDetailsModal');
    detailsModal.style.display = 'none';
}

// إضافة مستمع لإغلاق النافذة عند النقر خارجها
window.addEventListener('click', (e) => {
    const detailsModal = document.getElementById('shipmentDetailsModal');
    if (e.target === detailsModal) {
        closeDetailsModal();
    }
});

// دالة إعداد مستمعي أحداث التخليص الجمركي
function setupCustomsListeners() {
    const addCustomsBtn = document.getElementById('addCustomsBtn');
    const customsForm = document.getElementById('customsForm');
    const customsModal = document.getElementById('customsModal');
    const shipmentSelect = document.getElementById('shipmentSelect');
    const customsCostInput = document.getElementById('customsCost');

    if (addCustomsBtn) {
        addCustomsBtn.addEventListener('click', showAddCustomsModal);
    } else {
        console.warn('لم يتم العثور على addCustomsBtn');
    }

    if (customsForm) {
        customsForm.addEventListener('submit', handleCustomsSubmit);
    } else {
        console.warn('لم يتم العثور على customsForm');
    }

    if (customsModal) {
        const customsCloseBtn = customsModal.querySelector('.close');
        if (customsCloseBtn) {
            customsCloseBtn.addEventListener('click', closeCustomsModal);
        }

        window.addEventListener('click', (e) => {
            if (e.target === customsModal) {
                closeCustomsModal();
            }
        });
    } else {
        console.warn('لم يتم العثور على customsModal');
    }

    if (shipmentSelect) {
        shipmentSelect.addEventListener('change', function() {
            if (this.value) {
                loadShipmentDetails(this.value);
            }
        });
    } else {
        console.warn('لم يتم العثور على shipmentSelect');
    }

    if (customsCostInput) {
        customsCostInput.addEventListener('input', function() {
            if (typeof calculateCustomsCostPerMeter === 'function') {
                calculateCustomsCostPerMeter();
            }
        });
    }

    if (typeof setupCustomsFilters === 'function') {
        setupCustomsFilters();
    }
    if (typeof loadCustoms === 'function') {
        loadCustoms();
    }
}

// تحديث دالة showAddCustomsModal
function showAddCustomsModal() {
    switchTab('customs');
    setTimeout(() => {
        const customsForm = document.getElementById('customsForm');
        const customsModal = document.getElementById('customsModal');
        if (customsForm) customsForm.reset();
        const numInput = document.getElementById('customsNumber');
        if (numInput) numInput.value = generateCustomsNumber();
        loadAvailableShipments();
        if (customsModal) customsModal.style.display = 'block';
    }, 100);
}

// دالة توليد رقم تخليص
function generateCustomsNumber() {
    return 'CUS-' + Date.now();
}

// دالة تحميل الشحنات المتاحة
async function loadAvailableShipments() {
    const shipmentSelect = document.getElementById('shipmentSelect');
    if (!shipmentSelect) return;
    shipmentSelect.innerHTML = '<option value="">اختر رقم الشحنة</option>';

    const { data: shipments, error } = await supabase
        .from('shipments')
        .select('shipment_number, goods_type')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('خطأ في جلب الشحنات:', error);
        return;
    }

    (shipments || []).forEach(shipment => {
        const option = document.createElement('option');
        option.value = shipment.shipment_number;
        option.textContent = `${shipment.shipment_number} - ${shipment.goods_type || ''}`;
        shipmentSelect.appendChild(option);
    });
}

// دالة تحميل تفاصيل الشحنة
async function loadShipmentDetails(shipmentNumber) {
    const { data, error } = await supabase
        .from('shipments')
        .select('goods_type, quantity')
        .eq('shipment_number', shipmentNumber)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('خطأ في تحميل تفاصيل الشحنة:', error);
        return;
    }

    if (data) {
        const goodsTypeEl = document.getElementById('goodsTypeCustoms');
        const quantityEl = document.getElementById('quantityCustoms');
        if (goodsTypeEl) goodsTypeEl.value = data.goods_type || '';
        if (quantityEl) quantityEl.value = data.quantity || '';
        if (typeof calculateCustomsCostPerMeter === 'function') {
            calculateCustomsCostPerMeter();
        }
    }
}

        
        // تحديث لوحة معلومات حالة الشحنات
        updateShipmentStatusDashboard();
        updateQuickReviewCounts(); // تحديث أعداد المراجعة السريعة


// دالة تحميل الشحنات القادمة
async function loadUpcomingShipments() {
    try {
        let upcomingShipmentsGrid = document.getElementById('upcomingShipmentsGrid');
        if (!upcomingShipmentsGrid) {
            console.error('لم يتم العثور على عنصر upcomingShipmentsGrid');
            return;
        }

        upcomingShipmentsGrid.innerHTML = '<div class="loading-indicator">جاري تحميل الشحنات القادمة...</div>';
        
        const currentDate = new Date();
        const currentDateStr = currentDate.toISOString().split('T')[0];

        // جلب جميع الشحنات القادمة (التي لم يتم استلامها بعد)
        const { data: shipments, error } = await supabase
            .from('shipments')
            .select('*')
            .neq('status', 'تم الاستلام')
            .gte('arrival_date', currentDateStr)
            .order('arrival_date', { ascending: true });

        if (error) throw error;

        if (!upcomingShipmentsGrid) return;
        
        if (!shipments || shipments.length === 0) {
            upcomingShipmentsGrid.innerHTML = '<p class="no-data-message">لا توجد شحنات قادمة</p>';
            updateContainerValues(0, 0, 0);
            // تحديث التخزين المؤقت إلى مصفوفة فارغة عند عدم وجود بيانات
            window.shipmentsCache = [];
            return;
        }

        let weekTotalValue = 0;
        let twoWeeksTotalValue = 0;
        let monthTotalValue = 0;
        let shipmentCount = 0;
        let upcomingShipmentsHTML = '';

        // إضافة حساب الأيام المتبقية وترتيب الشحنات
        const shipmentsWithDays = shipments.map(shipment => ({
            ...shipment,
            daysRemaining: calculateDaysRemaining(shipment.arrival_date)
        })).sort((a, b) => a.daysRemaining - b.daysRemaining);

        // تخزين نسخة مؤقتة عالمية للاستخدام دون اتصال
        window.shipmentsCache = shipmentsWithDays;

        for (const shipment of shipmentsWithDays) {
            let totalValue = parseFloat(shipment.container_value) || 0;
            if (!totalValue) totalValue = 0;

            const daysRemaining = shipment.daysRemaining;

            // تحديث القيم الإجمالية
            if (daysRemaining <= 7) {
                weekTotalValue += totalValue;
            } else if (daysRemaining <= 14) {
                twoWeeksTotalValue += totalValue;
            } else if (daysRemaining <= 30) {
                monthTotalValue += totalValue;
            }

            shipmentCount++;
            let urgencyClass = '';
            if (daysRemaining <= 0) {
                urgencyClass = 'today';
            } else if (daysRemaining <= 3) {
                urgencyClass = 'urgent';
            } else if (daysRemaining <= 7) {
                urgencyClass = 'soon';
            } else if (daysRemaining <= 14) {
                urgencyClass = 'upcoming';
            } else {
                urgencyClass = 'normal';
            }

            // حالة الدفع من الحقل النصي
            const paymentText = (shipment.payment_status || '').trim();
            const isPaid = paymentText === 'مدفوع' || paymentText.toLowerCase() === 'paid';
            const paymentClass = isPaid ? 'payment-status-paid' : 'payment-status-pending';
            const paymentLabel = isPaid ? 'مدفوع' : (paymentText || 'غير محدد');

            // المورّد و ETA كما في الصورة
            const supplier = shipment.supplier_name || 'المورد غير محدد';
            const eta = formatDate(shipment.arrival_date || '');

            // وسم عاجلة عند <=3 أيام
            const urgencyBadge = daysRemaining <= 3 
                ? '<span class="chip chip-danger"><i class="fas fa-exclamation-triangle"></i> عاجلة</span>'
                : '';

            // إعداد الحقول المطلوبة للعرض مع قيم افتراضية عند عدم التوفر
            const goodsType = shipment.goods_type || 'غير محدد';
            const containerNumber = shipment.container_number || '—';
            const blNumber = shipment.bl_number || '—';
            const generalStatus = shipment.status || '—';
            const customsStatus = shipment.customs_status || 'غير محدد';

            upcomingShipmentsHTML += `
                <div class="shipment-card-new ${urgencyClass}" data-id="${shipment.id}" data-days="${daysRemaining}">
                    <div class="shipment-header-new">
                        <div class="company-info">
                            <h4 class="company-name">المورد: ${supplier}</h4>
                            <p class="shipment-id">ETA: ${eta}</p>
                        </div>
                        ${urgencyBadge}
                    </div>
                    <div class="shipment-info-new">
                        <div class="info-item">
                            <span class="info-label">نوع البضاعة:</span>
                            <span class="info-value">${goodsType}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">رقم الحاوية:</span>
                            <span class="info-value">${containerNumber}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">رقم بوليصة الشحن:</span>
                            <span class="info-value">${blNumber}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">الحالة العامة للحاوية:</span>
                            <span class="info-value">${generalStatus}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">حالة الدفع:</span>
                            <span class="info-value ${paymentClass}">${paymentLabel}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">حالة الإفراج:</span>
                            <span class="info-value">${customsStatus}</span>
                        </div>
                    </div>
                    <div class="shipment-actions-new">
                        <button class="view-details-btn-new" onclick="viewShipmentDetails('${shipment.shipment_number}')">عرض التفاصيل</button>
                    </div>
                </div>
            `;
        }

        if (shipmentCount > 0) {
            upcomingShipmentsGrid.innerHTML = upcomingShipmentsHTML;
            updateContainerValues(weekTotalValue, twoWeeksTotalValue, monthTotalValue);
            filterUpcomingShipments('all');
            // توليد توصيات ذكية بناءً على الحالة وموعد الوصول
            generateSmartRecommendations(shipmentsWithDays);
        } else {
            upcomingShipmentsGrid.innerHTML = '<p class="no-data-message">لا توجد شحنات قادمة</p>';
            updateContainerValues(0, 0, 0);
            // إفراغ التوصيات عند عدم وجود شحنات
            const recommendationsGrid = document.getElementById('recommendationsGrid');
            if (recommendationsGrid) {
                recommendationsGrid.innerHTML = '<p class="no-data-message">لا توجد توصيات حالياً</p>';
            }
        }
        
    } catch (error) {
        console.error('خطأ في تحميل الشحنات القادمة:', error);
        if (upcomingShipmentsGrid) {
            upcomingShipmentsGrid.innerHTML = '<p class="error-message">حدث خطأ في تحميل الشحنات القادمة</p>';
        }
        updateContainerValues(0, 0, 0);
    }
}

// دالة لحساب عدد الأيام المتبقية حتى وصول الشحنة
function calculateDaysRemaining(arrivalDateStr) {
    try {
        if (!arrivalDateStr) return 0;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const arrivalDate = new Date(arrivalDateStr);
        arrivalDate.setHours(0, 0, 0, 0);
        
        const timeDiff = arrivalDate.getTime() - today.getTime();
        return Math.ceil(timeDiff / (1000 * 3600 * 24));
    } catch (error) {
        console.error('خطأ في حساب الأيام المتبقية:', error);
        return 0;
    }
}

// دالة لإعداد أزرار تصفية الشحنات القادمة
function setupFilterButtons() {
    try {
        const filterButtons = document.querySelectorAll('.filter-btn');
        if (!filterButtons || filterButtons.length === 0) return;
        
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                // إزالة الفئة النشطة من جميع الأزرار
                filterButtons.forEach(btn => btn.classList.remove('active'));
                
                // إضافة الفئة النشطة للزر المحدد
                this.classList.add('active');
                
                // تطبيق التصفية
                const range = this.getAttribute('data-range');
                filterUpcomingShipments(range);
            });
        });
    } catch (error) {
        console.error('خطأ في إعداد أزرار التصفية:', error);
    }
}

// دالة لتصفية الشحنات القادمة حسب المدى
function filterUpcomingShipments(range) {
    try {
        const shipmentCards = document.querySelectorAll('.shipment-card-new');
        if (!shipmentCards || shipmentCards.length === 0) return;
        
        let visibleCount = 0;
        
        shipmentCards.forEach(card => {
            const daysRemaining = parseInt(card.getAttribute('data-days') || '0');
            if (range === 'all') {
                card.style.display = 'block';
                visibleCount++;
                return;
            }
            const days = parseInt(range || '0');
            if (!isNaN(days) && daysRemaining <= days) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });
        
        // تحديث الإحصائيات في العنوان
        const filterTitle = document.querySelector('.upcoming-shipments-section .upcoming-title');
        if (filterTitle) {
            filterTitle.textContent = `الشحنات القادمة (${visibleCount})`;
        }
    } catch (error) {
        console.error('خطأ في تصفية الشحنات القادمة:', error);
    }
}

// ===== توصيات ذكية =====
function generateSmartRecommendations(shipments) {
    try {
        const grid = document.getElementById('recommendationsGrid');
        if (!grid) return;

        if (!shipments || shipments.length === 0) {
            grid.innerHTML = '<p class="no-data-message">لا توجد توصيات حالياً</p>';
            return;
        }

        // أنماط التوصيات حسب الحالة والأيام المتبقية
        const cards = [];

        shipments.forEach(s => {
            const days = typeof s.daysRemaining === 'number' ? s.daysRemaining : calculateDaysRemaining(s.arrival_date);
            const etaText = formatDate(s.arrival_date || '');
            const isPaid = (s.payment_status || '').trim() === 'مدفوع';
            const supplier = s.supplier_name || '—';
            const containerNo = s.container_number || '—';

            // 1) تصل خلال 3 أيام ولم تبدأ إجراءات التخليص
            if (days <= 3 && (s.status === 'تم الشحن' || s.status === 'في انتظار تخليص الجمركي')) {
                cards.push(makeRecommendationCard(
                    'تسريع إجراءات التخليص',
                    `الحاوية ${containerNo} من المورد ${supplier} تصل خلال ${Math.max(days,0)} يوم. ننصح ببدء إجراءات الإفراج والتواصل مع شركة التخليص قبل الوصول. ETA: ${etaText}`,
                    s.shipment_number
                ));
            }

            // 2) الدفع غير مكتمل وتصل خلال أسبوع
            if (!isPaid && days > 0 && days <= 7) {
                cards.push(makeRecommendationCard(
                    'إتمام الدفع قبل الوصول',
                    `الحاوية ${containerNo} من المورد ${supplier} غير مدفوعة وتصل خلال ${days} يوم. ننصح بإتمام الدفع لتسهيل الاستلام فور الوصول. ETA: ${etaText}`,
                    s.shipment_number
                ));
            }

            // 3) تاريخ الوصول اليوم أو مضى ولم تُحدّث الحالة
            if (days <= 0 && s.status !== 'تم الاستلام') {
                cards.push(makeRecommendationCard(
                    'تأكيد الاستلام وتحديث الحالة',
                    `تاريخ وصول الحاوية ${containerNo} من المورد ${supplier} هو ${etaText}. يرجى تأكيد الاستلام أو تحديث الحالة لتجنب الالتباس.`,
                    s.shipment_number
                ));
            }

            // 4) الإفراج الجمركي "في الانتظار" وتصل خلال أسبوعين
            if ((s.customs_status || 'في الانتظار') === 'في الانتظار' && days > 0 && days <= 14) {
                cards.push(makeRecommendationCard(
                    'بدء طلب الإفراج الجمركي',
                    `الحاوية ${containerNo} من المورد ${supplier} تحتاج بدء إجراءات الإفراج قبل الوصول خلال ${days} يوم لضمان سلاسة التخليص. ETA: ${etaText}`,
                    s.shipment_number
                ));
            }
        });

        // حد أقصى لعرض 3 توصيات متنوعة
        const uniqueCards = cards.slice(0, 3).join('');
        grid.innerHTML = uniqueCards || '<p class="no-data-message">لا توجد توصيات حالياً</p>';
    } catch (error) {
        console.error('خطأ في توليد التوصيات الذكية:', error);
    }
}

function makeRecommendationCard(title, description, shipmentNumber) {
    return `
        <div class="recommendation-card">
            <div class="recommendation-content">
                <h4>${title}</h4>
                <p>${description}</p>
            </div>
            <div class="recommendation-actions">
                <button class="recommendation-btn" onclick="viewShipmentDetails('${shipmentNumber}')">عرض التفاصيل</button>
            </div>
        </div>
    `;
}

// وظائف الشريط الجانبي والتنقل المحمول
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// دالة تبديل التبويبات
function switchTab(tabName) {
    // إخفاء جميع التبويبات
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // إزالة الفئة النشطة من جميع أزرار التبويبات
    const allTabBtns = document.querySelectorAll('.tab-btn, .sidebar-btn, .nav-item');
    allTabBtns.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // إظهار التبويب المحدد
    const targetTab = document.getElementById(tabName + 'Section');
    if (targetTab) {
        targetTab.classList.remove('hidden');
    }
    
    // إضافة الفئة النشطة للتبويب المحدد
    const activeBtn = document.querySelector(`[data-tab="${tabName}"].tab-btn, [data-tab="${tabName}"].sidebar-btn, [data-tab="${tabName}"].nav-item`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // تحديث عنوان الصفحة
    const pageTitle = document.querySelector('.page-title');
    if (pageTitle) {
        const tabTitles = {
            'dashboard': 'لوحة التحكم',
            'shipments': 'الشحنات',
            'clearanceCompanies': 'شركات التخليص'
        };
        pageTitle.textContent = tabTitles[tabName] || 'لوحة التحكم';
    }
    
    // تحديث شريط التنقل السفلي
    const bottomNavItems = document.querySelectorAll('.bottom-navigation .nav-item');
    bottomNavItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tabName) {
            item.classList.add('active');
        }
    });
    
    // تحديث شريط التنقل الجانبي
    const sidebarBtns = document.querySelectorAll('.sidebar-btn');
    sidebarBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
    
    // تحديث التبويبات العلوية للأجهزة الكبيرة
    const topTabBtns = document.querySelectorAll('.tabs .tab-btn');
    topTabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
}

// وظائف التنقل السفلي
function initBottomNavigation() {
    const navItems = document.querySelectorAll('.bottom-navigation .nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // الحصول على التبويب المطلوب
            const tabName = item.getAttribute('data-tab');
            
            // تبديل التبويب
            switchTab(tabName);
        });
    });
}

// وظائف الشريط الجانبي
function initSidebar() {
    const sidebarBtns = document.querySelectorAll('.sidebar-btn');
    
    sidebarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // الحصول على التبويب المطلوب
            const tabName = btn.getAttribute('data-tab');
            
            // تبديل التبويب
            switchTab(tabName);
            
            // إغلاق الشريط الجانبي
            closeSidebar();
        });
    });
}

// وظائف التبويبات العلوية للأجهزة الكبيرة
function initTopTabs() {
    const tabBtns = document.querySelectorAll('.tabs .tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // الحصول على التبويب المطلوب
            const tabName = btn.getAttribute('data-tab');
            
            // تبديل التبويب
            switchTab(tabName);
        });
    });
}

// دالة لتنسيق القيمة المالية
function formatCurrency(value) {
    // التحقق من صحة القيمة
    if (isNaN(value) || value === null || value === undefined) {
        return '0.00 $';
    }
    
    // تنسيق الرقم بإضافة فواصل الآلاف ورقمين عشريين
    return parseFloat(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' $';
}

// دالة محسنة لتحديث قيم الحاويات مع البيانات المتطورة
function updateContainerValues(weekValue, twoWeeksValue, monthValue, weekCount = 0, twoWeeksCount = 0, monthCount = 0) {
    const totalValue = monthValue + twoWeeksValue + weekValue;
    const totalCount = weekCount + twoWeeksCount + monthCount;
    
    // تحديث القيمة الرئيسية مع تأثير حركي
    const upcomingContainersValueElement = document.getElementById('upcomingContainersValue');
    if (upcomingContainersValueElement) {
        animateValue(upcomingContainersValueElement, totalValue);
    }
    
    // تحديث القيم المفصلة للفترات مع عدد الحاويات ومتوسط القيمة
    updatePeriodValue('week', weekValue, weekCount);
    updatePeriodValue('twoWeeks', twoWeeksValue, twoWeeksCount);
    updatePeriodValue('month', monthValue, monthCount);
    
    // حساب وتحديث النسب المئوية للتقدم
    updateProgressPercentages(weekValue, twoWeeksValue, monthValue, totalValue);
    
    // تحديث الإحصائيات الإضافية
    updateAdditionalFinancialStats(totalValue, totalCount, weekValue, twoWeeksValue, monthValue);
    
    // تحديث اتجاه النمو
    updateValueTrend(totalValue);
}

// دالة تحديث قيمة فترة معينة
function updatePeriodValue(period, value, count) {
    const avgValue = count > 0 ? value / count : 0;
    
    // تحديث القيمة الأساسية
    const valueElement = document.getElementById(`${period}ContainerValue`);
    if (valueElement) {
        valueElement.textContent = formatCurrency(value);
    }
    
    // تحديث عدد الحاويات
    const countElement = document.getElementById(`${period}ContainersCount`);
    if (countElement) {
        countElement.textContent = `${count} حاوية`;
    }
    
    // تحديث متوسط القيمة
    const avgElement = document.getElementById(`${period}AvgValue`);
    if (avgElement) {
        avgElement.textContent = `متوسط: ${formatCurrency(avgValue)}`;
    }
}

// دالة تحديث النسب المئوية لمؤشرات التقدم
function updateProgressPercentages(weekValue, twoWeeksValue, monthValue, totalValue) {
    if (totalValue === 0) return;
    
    // حساب النسب المئوية
    const weekPercentage = Math.round((weekValue / totalValue) * 100);
    const twoWeeksPercentage = Math.round((twoWeeksValue / totalValue) * 100);
    const monthPercentage = Math.round((monthValue / totalValue) * 100);
    
    // تحديث النسب في الواجهة
    updateProgressCircleValue('week-progress', weekPercentage);
    updateProgressCircleValue('two-weeks-progress', twoWeeksPercentage);
    updateProgressCircleValue('month-progress', monthPercentage);
}

// دالة تحديث دائرة التقدم
function updateProgressCircleValue(className, percentage) {
    const progressElement = document.querySelector(`.${className}`);
    const textElement = progressElement?.querySelector('.progress-value');
    
    if (progressElement && textElement) {
        // حساب زاوية التقدم
        const angle = (percentage / 100) * 360;
        
        // تحديث الخلفية المخروطية
        progressElement.style.background = `conic-gradient(var(--classic-gold) 0deg, var(--classic-gold) ${angle}deg, rgba(255, 255, 255, 0.2) ${angle}deg, rgba(255, 255, 255, 0.2) 360deg)`;
        
        // تحديث النص
        textElement.textContent = `${percentage}%`;
        
        // إضافة تأثير حركي
        progressElement.style.transition = 'all 1s ease-in-out';
    }
}

// دالة تحديث الإحصائيات الإضافية
function updateAdditionalFinancialStats(totalValue, totalCount, weekValue, twoWeeksValue, monthValue) {
    // متوسط قيمة الحاوية
    const avgContainerValue = totalCount > 0 ? totalValue / totalCount : 0;
    const avgElement = document.getElementById('avgContainerValue');
    if (avgElement) {
        avgElement.textContent = formatCurrency(avgContainerValue);
    }
    
    // حساب النمو الشهري
    const lastMonthValue = parseFloat(localStorage.getItem('lastMonthValue') || '0');
    const monthlyGrowth = lastMonthValue > 0 ? ((totalValue - lastMonthValue) / lastMonthValue) * 100 : 0;
    const growthElement = document.getElementById('monthlyGrowth');
    if (growthElement) {
        const sign = monthlyGrowth > 0 ? '+' : '';
        growthElement.textContent = `${sign}${monthlyGrowth.toFixed(1)}%`;
        
        // تحديث لون النمو
        if (monthlyGrowth > 0) {
            growthElement.style.color = 'var(--classic-emerald)';
        } else if (monthlyGrowth < 0) {
            growthElement.style.color = 'var(--classic-burgundy)';
        } else {
            growthElement.style.color = '#FFFFFF';
        }
    }
    
    // حفظ قيمة الشهر الحالي
    localStorage.setItem('lastMonthValue', totalValue.toString());
    
    // حساب كفاءة التسليم
    let efficiency = 0;
    if (totalValue > 0) {
        const distribution = [weekValue, twoWeeksValue, monthValue].filter(v => v > 0).length;
        efficiency = Math.min(85 + (distribution * 5), 100);
    }
    
    const efficiencyElement = document.getElementById('deliveryEfficiency');
    if (efficiencyElement) {
        efficiencyElement.textContent = `${efficiency}%`;
    }
}

// دالة تحديث اتجاه النمو
function updateValueTrend(currentValue) {
    const lastValue = parseFloat(localStorage.getItem('lastTotalValue') || '0');
    const trendElement = document.getElementById('valueTrend');
    
    if (trendElement && lastValue > 0) {
        const changePercentage = ((currentValue - lastValue) / lastValue) * 100;
        const sign = changePercentage > 0 ? '+' : '';
        trendElement.textContent = `${sign}${changePercentage.toFixed(1)}%`;
        
        // تحديث الأيقونة والألوان
        const trendIcon = document.querySelector('.trend-icon');
        if (trendIcon) {
            if (changePercentage > 0) {
                trendIcon.classList.add('positive');
                trendIcon.innerHTML = '<i class="fas fa-chart-line"></i>';
            } else if (changePercentage < 0) {
                trendIcon.classList.remove('positive');
                trendIcon.innerHTML = '<i class="fas fa-chart-line-down"></i>';
            }
        }
    }
    
    // حفظ القيمة الحالية
    localStorage.setItem('lastTotalValue', currentValue.toString());
}

// دالة الرسوم المتحركة للقيم
function animateValue(element, targetValue) {
    const currentValue = parseFloat(element.textContent.replace(/[^0-9.-]+/g, '')) || 0;
    const difference = targetValue - currentValue;
    const duration = 2000; // 2 ثانية
    const steps = 60;
    const stepValue = difference / steps;
    const stepTime = duration / steps;
    
    let currentStep = 0;
    
    const timer = setInterval(() => {
        currentStep++;
        const newValue = currentValue + (stepValue * currentStep);
        element.textContent = formatCurrency(newValue);
        
        if (currentStep >= steps) {
            clearInterval(timer);
            element.textContent = formatCurrency(targetValue);
        }
    }, stepTime);
}

// دالة عرض التفاصيل المالية
function showFinancialDetails() {
    const modal = document.createElement('div');
    modal.className = 'modal financial-details-modal';
    modal.style.display = 'block';
    
    modal.innerHTML = `
        <div class="modal-content financial-modal-content">
            <div class="modal-header financial-header">
                <h3><i class="fas fa-chart-bar"></i> التفاصيل المالية المتقدمة</h3>
                <span class="close financial-close">&times;</span>
            </div>
            <div class="financial-content">
                <div class="financial-grid">
                    <div class="financial-card">
                        <h4>توزيع القيم</h4>
                        <div class="value-distribution">
                            <div class="distribution-item">
                                <span class="period">أسبوع:</span>
                                <span class="value" id="modalWeekValue">$0</span>
                                <div class="percentage" id="modalWeekPercentage">0%</div>
                            </div>
                            <div class="distribution-item">
                                <span class="period">أسبوعين:</span>
                                <span class="value" id="modalTwoWeeksValue">$0</span>
                                <div class="percentage" id="modalTwoWeeksPercentage">0%</div>
                            </div>
                            <div class="distribution-item">
                                <span class="period">شهر:</span>
                                <span class="value" id="modalMonthValue">$0</span>
                                <div class="percentage" id="modalMonthPercentage">0%</div>
                            </div>
                        </div>
                    </div>
                    <div class="financial-card">
                        <h4>الإحصائيات الرئيسية</h4>
                        <div class="stats-list">
                            <div class="stat-row">
                                <span class="stat-label">إجمالي القيمة:</span>
                                <span class="stat-value" id="modalTotalValue">$0</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">متوسط قيمة الحاوية:</span>
                                <span class="stat-value" id="modalAvgValue">$0</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">النمو الشهري:</span>
                                <span class="stat-value" id="modalGrowth">+0%</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">كفاءة التسليم:</span>
                                <span class="stat-value" id="modalEfficiency">0%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // إغلاق المودال
    const closeBtn = modal.querySelector('.financial-close');
    closeBtn.onclick = () => {
        document.body.removeChild(modal);
    };
    
    // تحديث البيانات
    updateFinancialModalData();
}

// دالة تصدير التقرير المالي
function exportFinancialReport() {
    const currentDate = new Date().toISOString().split('T')[0];
    const reportData = {
        'تاريخ التقرير': currentDate,
        'إجمالي القيمة': document.getElementById('upcomingContainersValue')?.textContent || '$0',
        'قيمة الأسبوع': document.getElementById('weekContainerValue')?.textContent || '$0',
        'قيمة الأسبوعين': document.getElementById('twoWeeksContainerValue')?.textContent || '$0',
        'قيمة الشهر': document.getElementById('monthContainerValue')?.textContent || '$0',
        'متوسط قيمة الحاوية': document.getElementById('avgContainerValue')?.textContent || '$0',
        'النمو الشهري': document.getElementById('monthlyGrowth')?.textContent || '+0%',
        'كفاءة التسليم': document.getElementById('deliveryEfficiency')?.textContent || '0%'
    };
    
    // تحويل إلى CSV
    const csvContent = convertToCSV(reportData);
    
    // تحميل الملف
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `تقرير-مالي-${currentDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('تم تصدير التقرير المالي بنجاح', 'success');
}

// دالة عرض التوقعات
function showValueProjections() {
    const modal = document.createElement('div');
    modal.className = 'modal projections-modal';
    modal.style.display = 'block';
    
    const currentValue = parseFloat(document.getElementById('upcomingContainersValue')?.textContent.replace(/[^0-9.-]+/g, '')) || 0;
    const monthlyGrowth = parseFloat(document.getElementById('monthlyGrowth')?.textContent.replace(/[^0-9.-]+/g, '')) / 100 || 0.02; // افتراض نمو 2% إذا لم توجد بيانات
    
    // حساب التوقعات
    const nextMonthProjection = currentValue * (1 + monthlyGrowth);
    const threeMonthProjection = currentValue * Math.pow(1 + monthlyGrowth, 3);
    const sixMonthProjection = currentValue * Math.pow(1 + monthlyGrowth, 6);
    
    modal.innerHTML = `
        <div class="modal-content projections-modal-content">
            <div class="modal-header projections-header">
                <h3><i class="fas fa-crystal-ball"></i> توقعات القيم المستقبلية</h3>
                <span class="close projections-close">&times;</span>
            </div>
            <div class="projections-content">
                <div class="projection-cards">
                    <div class="projection-card next-month">
                        <div class="projection-icon">
                            <i class="fas fa-calendar-plus"></i>
                        </div>
                        <h4>الشهر القادم</h4>
                        <div class="projection-value">${formatCurrency(nextMonthProjection)}</div>
                        <div class="projection-confidence">دقة: 85%</div>
                    </div>
                    <div class="projection-card three-months">
                        <div class="projection-icon">
                            <i class="fas fa-calendar-check"></i>
                        </div>
                        <h4>خلال 3 أشهر</h4>
                        <div class="projection-value">${formatCurrency(threeMonthProjection)}</div>
                        <div class="projection-confidence">دقة: 70%</div>
                    </div>
                    <div class="projection-card six-months">
                        <div class="projection-icon">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <h4>خلال 6 أشهر</h4>
                        <div class="projection-value">${formatCurrency(sixMonthProjection)}</div>
                        <div class="projection-confidence">دقة: 55%</div>
                    </div>
                </div>
                <div class="projection-factors">
                    <h4>العوامل المؤثرة:</h4>
                    <ul>
                        <li>معدل النمو الحالي: ${(monthlyGrowth * 100).toFixed(1)}%</li>
                        <li>الموسمية والطلب</li>
                        <li>تقلبات السوق</li>
                        <li>السياسات التجارية</li>
                        <li>العوامل الاقتصادية العالمية</li>
                    </ul>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // إغلاق المودال
    const closeBtn = modal.querySelector('.projections-close');
    closeBtn.onclick = () => {
        document.body.removeChild(modal);
    };
}

// دالة مساعدة لتحويل البيانات إلى CSV
function convertToCSV(data) {
    const headers = Object.keys(data);
    const values = Object.values(data);
    
    const csvContent = '\uFEFF'; // BOM لدعم UTF-8
    return csvContent + headers.join(',') + '\n' + values.join(',');
}

// تحديث دالة البيانات في المودال المالي
function updateFinancialModalData() {
    const totalValue = parseFloat(document.getElementById('upcomingContainersValue')?.textContent.replace(/[^0-9.-]+/g, '')) || 0;
    const weekValue = parseFloat(document.getElementById('weekContainerValue')?.textContent.replace(/[^0-9.-]+/g, '')) || 0;
    const twoWeeksValue = parseFloat(document.getElementById('twoWeeksContainerValue')?.textContent.replace(/[^0-9.-]+/g, '')) || 0;
    const monthValue = parseFloat(document.getElementById('monthContainerValue')?.textContent.replace(/[^0-9.-]+/g, '')) || 0;
    
    // حساب النسب المئوية
    const weekPercent = totalValue > 0 ? ((weekValue / totalValue) * 100).toFixed(1) : 0;
    const twoWeeksPercent = totalValue > 0 ? ((twoWeeksValue / totalValue) * 100).toFixed(1) : 0;
    const monthPercent = totalValue > 0 ? ((monthValue / totalValue) * 100).toFixed(1) : 0;
    
    // تحديث القيم في المودال
    updateElementById('modalTotalValue', formatCurrency(totalValue));
    updateElementById('modalWeekValue', formatCurrency(weekValue));
    updateElementById('modalTwoWeeksValue', formatCurrency(twoWeeksValue));
    updateElementById('modalMonthValue', formatCurrency(monthValue));
    updateElementById('modalWeekPercentage', weekPercent + '%');
    updateElementById('modalTwoWeeksPercentage', twoWeeksPercent + '%');
    updateElementById('modalMonthPercentage', monthPercent + '%');
    updateElementById('modalAvgValue', document.getElementById('avgContainerValue')?.textContent || '$0');
    updateElementById('modalGrowth', document.getElementById('monthlyGrowth')?.textContent || '+0%');
    updateElementById('modalEfficiency', document.getElementById('deliveryEfficiency')?.textContent || '0%');
}

// دالة مساعدة لتحديث عنصر بالID
function updateElementById(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// دالة إعداد لوحة المعلومات
function setupDashboard() {
    try {
        loadUpcomingShipments();
        setupFilterButtons();
        checkUpcomingShipments();
        updateStatistics();
        updateShipmentStatusDashboard(); // إضافة تحديث حالة الشحنات
        setupStatusFilters(); // إعداد فلاتر الحالة
        updateQuickReviewCounts(); // تحديث أعداد المراجعة السريعة
    } catch (error) {
        console.error('خطأ في إعداد لوحة المعلومات:', error);
    }
}

// دالة فحص الشحنات القادمة وإرسال التنبيهات
async function checkUpcomingShipments() {
    try {
        const { data: shipments, error } = await supabase
            .from('shipments')
            .select('*')
            .neq('status', 'تم الاستلام');

        if (error) throw error;
        
        const today = new Date();
        let upcomingShipments = [];
        
        shipments.forEach(shipment => {
            const arrivalDate = new Date(shipment.arrival_date);
            const daysUntilArrival = Math.ceil((arrivalDate - today) / (1000 * 60 * 60 * 24));

            // جمع الشحنات التي ستصل خلال 3 أيام
            if (daysUntilArrival <= 3 && daysUntilArrival > 0) {
                upcomingShipments.push({
                    shipmentNumber: shipment.shipment_number,
                    goodsType: shipment.goods_type,
                    arrivalDate: shipment.arrival_date,
                    daysUntilArrival
                });
            }
        });

        // إذا كانت هناك شحنات قادمة، أرسل تنبيه
        if (upcomingShipments.length > 0) {
            const message = `لديك ${upcomingShipments.length} شحنة قادمة خلال 3 أيام`;
            showToast(message, 'info');
        }
    } catch (error) {
        console.error('خطأ غير متوقع في فحص الشحنات القادمة:', error);
    }
}

// تحديث دالة updateStatistics
async function updateStatistics() {
    try {
        // تحديث لوحة معلومات حالة الشحنات
        updateShipmentStatusDashboard();
        updateQuickReviewCounts();
        
        // إحصائيات الشحنات
        const { data: shipments, error } = await supabase
            .from('shipments')
            .select('*');

        if (error) throw error;

        let total = 0;
        let inTransit = 0; // تم الشحن
        let customsPending = 0; // في انتظار تخليص الجمركي
        let upcomingWeek = 0;
        let nextThreeDays = 0;
        
        const currentDate = new Date();
        const oneWeekLater = new Date(currentDate);
        oneWeekLater.setDate(currentDate.getDate() + 7);
        const threeDaysLater = new Date(currentDate);
        threeDaysLater.setDate(currentDate.getDate() + 3);
        
        const currentDateStr = currentDate.toISOString().split('T')[0];
        const oneWeekLaterStr = oneWeekLater.toISOString().split('T')[0];
        const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];
        
        shipments.forEach(shipment => {
            total++;
            if (shipment.status === 'تم الشحن') inTransit++;
            if (shipment.status === 'في انتظار تخليص الجمركي') customsPending++;
            
            // حساب الشحنات القادمة
            if (shipment.arrival_date && shipment.arrival_date >= currentDateStr && shipment.arrival_date <= oneWeekLaterStr) {
                upcomingWeek++;
                
                if (shipment.arrival_date <= threeDaysLaterStr) {
                    nextThreeDays++;
                }
            }
        });
            
            // تحديث العناصر في واجهة المستخدم
            // تحديث العناصر للتصميم الجديد المبسط
            const totalShipmentsElement = document.getElementById('totalShipments');
            const inTransitShipmentsElement = document.getElementById('inTransitShipments');
            const upcomingWeekShipmentsElement = document.getElementById('upcomingWeekShipments');
            
        if (totalShipmentsElement) totalShipmentsElement.textContent = total;
        if (inTransitShipmentsElement) inTransitShipmentsElement.textContent = `${inTransit} تم الشحن`;
        if (upcomingWeekShipmentsElement) upcomingWeekShipmentsElement.textContent = upcomingWeek;
        
        // تحديث لوحة معلومات حالة الشحنات
        updateShipmentStatusDashboard();
        updateQuickReviewCounts(); // تحديث أعداد المراجعة السريعة
        
        // تحديث لوحة معلومات حالة الشحنات
        updateShipmentStatusDashboard();
        updateQuickReviewCounts(); // تحديث أعداد المراجعة السريعة
        
        // تحديث لوحة معلومات حالة الشحنات مرة أخرى للتأكد من التحديث
        setTimeout(() => {
            updateShipmentStatusDashboard();
        }, 1000);
        
        // تحديث لوحة معلومات حالة الشحنات مرة ثالثة للتأكد من التحديث
        setTimeout(() => {
            updateShipmentStatusDashboard();
        }, 2000);
        
        // تحديث لوحة معلومات حالة الشحنات مرة رابعة للتأكد من التحديث
        setTimeout(() => {
            updateShipmentStatusDashboard();
        }, 3000);
        
        // تحديث لوحة معلومات حالة الشحنات مرة خامسة للتأكد من التحديث
        setTimeout(() => {
            updateShipmentStatusDashboard();
        }, 4000);
    } catch (error) {
        console.error('خطأ غير متوقع في تحديث الإحصائيات:', error);
    }
}

// دالة إظهار الإشعارات
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // اختيار الأيقونة المناسبة حسب نوع الإشعار
    const icon = type === 'success' ? 'fa-check-circle' :
                type === 'error' ? 'fa-exclamation-circle' :
                type === 'info' ? 'fa-info-circle' : 'fa-bell';
    
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas ${icon}"></i>
            <span>${message}</span>
        </div>
        <div class="toast-progress"></div>
    `;
    
    document.body.appendChild(toast);
    
    // إظهار الإشعار
    setTimeout(() => toast.classList.add('show'), 100);
    
    // إخفاء الإشعار بعد 3 ثواني
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function filterInventory() {
    const searchValue = document.getElementById('inventorySearchInput')?.value?.toLowerCase() || '';
    const branchValue = document.getElementById('branchFilter')?.value || 'الكل';
    const statusValue = document.getElementById('inventoryStatusFilter')?.value || 'الكل';
    
    const tableBody = document.getElementById('inventoryTableBody');
    tableBody.innerHTML = '';
    
    database.ref('inventory').once('value', (snapshot) => {
        let matchCount = 0;
        snapshot.forEach((child) => {
            const inventory = child.val();
            
            // تصفية حسب كلمة البحث
            const matchesSearch = 
                inventory.inventoryNumber.toLowerCase().includes(searchValue) ||
                inventory.shipmentNumber.toLowerCase().includes(searchValue) ||
                inventory.goodsType.toLowerCase().includes(searchValue) ||
                inventory.branch.toLowerCase().includes(searchValue);
            
            // تصفية حسب الفرع
            const matchesBranch = branchValue === 'الكل' || inventory.branch === branchValue;
            
            // تصفية حسب الحالة
            const matchesStatus = statusValue === 'الكل' || inventory.status === statusValue;
            
            if (matchesSearch && matchesBranch && matchesStatus) {
                addInventoryRow(inventory, tableBody);
                matchCount++;
            }
        });
        
        // تحديث عدد النتائج
        updateResultsCount(matchCount, 'inventory-results-count');
    });
}

// دالة حساب التكلفة النهائية للوحدة
async function calculateFinalUnitCost() {
    const shipmentNumber = document.getElementById('shipmentSelectInventory').value;
    if (!shipmentNumber) return;

    try {
        // جلب بيانات الشحنة
        const shipmentSnapshot = await database.ref('shipments/' + shipmentNumber).once('value');
        const shipment = shipmentSnapshot.val();
        
        // الحصول على قيمة الكمية المستوردة والتكلفة الإجمالية (قيم افتراضية)
        const orderQuantity = 0;
        const totalContainerCost = parseFloat(document.getElementById('totalContainerCost').value) || 0;
        
        // حساب التكلفة النهائية للوحدة
        const finalUnitCost = orderQuantity > 0 ? totalContainerCost / orderQuantity : 0;
        
        // تحديث حقل التكلفة النهائية للوحدة
        document.getElementById('finalUnitCost').value = finalUnitCost.toFixed(3);
        
        // حساب باقي الأسعار
        calculatePrices();
        
        return finalUnitCost;
    } catch (error) {
        console.error('خطأ في حساب التكلفة النهائية للوحدة:', error);
        return 0;
    }
}

// دالة حساب الأسعار
function calculatePrices() {
    const finalUnitCost = parseFloat(document.getElementById('finalUnitCost').value) || 0;
    const purchasePrice = parseFloat(document.getElementById('purchasePrice').value) || 0;
    
    // حساب سعر التكلفة (تكلفة الوحدة النهائية + سعر الشراء)
    const costPrice = finalUnitCost + purchasePrice;
    document.getElementById('costPrice').value = costPrice.toFixed(3);
    
    // حساب سعر البيع (سعر التكلفة + هامش ربح 10%)
    const sellingPrice = costPrice * 1.1;  // إضافة هامش ربح 10%
    document.getElementById('sellingPrice').value = sellingPrice.toFixed(3);
}

// دالة تحديث حالة المخزون
function updateInventoryStatus() {
    const importedQuantity = parseFloat(document.getElementById('importedQuantity').value) || 0;
    const receivedQuantity = parseFloat(document.getElementById('receivedQuantity').value) || 0;
    
    // تحديث حالة المخزون بناءً على الكميات
    let status = 'غير متوفر';
    if (receivedQuantity > 0) {
        if (receivedQuantity === importedQuantity) {
            status = 'مكتمل';
        } else if (receivedQuantity < importedQuantity) {
            status = 'جزئي';
        }
    }
    
    document.getElementById('inventoryStatus').value = status;
    
    // إعادة حساب التكلفة النهائية للوحدة
    calculateFinalUnitCost();
}

// دالة معالجة تغيير الفرع
function handleBranchChange() {
    const branchSelect = document.getElementById('branch');
    const otherBranchContainer = document.getElementById('otherBranchContainer');
    
    if (branchSelect.value === 'أخرى') {
        otherBranchContainer.style.display = 'block';
    } else {
        otherBranchContainer.style.display = 'none';
    }
}

// دالة إعداد الإشعارات
function setupNotifications() {
    // التحقق من وجود حاوية الإشعارات
    let notificationsContainer = document.getElementById('notifications');
    
    // إنشاء عنصر الإشعارات إذا لم يكن موجودًا
    if (!notificationsContainer) {
        // التحقق من وجود لوحة المعلومات
        const dashboardContainer = document.getElementById('dashboard');
        if (dashboardContainer) {
            // إنشاء قسم الإشعارات
            const notificationsSection = document.createElement('div');
            notificationsSection.className = 'dashboard-section';
            notificationsSection.innerHTML = `
                <h3>الإشعارات</h3>
                <div id="notifications" class="notifications-container"></div>
                <div id="notificationBadge" class="notification-badge" style="display: none;">0</div>
            `;
            dashboardContainer.appendChild(notificationsSection);
            notificationsContainer = document.getElementById('notifications');
        } else {
            console.log('لوحة المعلومات غير موجودة، لا يمكن إضافة الإشعارات');
            return;
        }
    }
    
    // مراقبة الشحنات التي تقترب من موعد وصولها
    database.ref('shipments').on('value', (snapshot) => {
        const currentDate = new Date();
        let notifications = [];
        
        // تجميع الإشعارات من الشحنات القادمة
        snapshot.forEach((child) => {
            const shipment = child.val();
            const arrivalDate = new Date(shipment.arrivalDate);
            const daysUntilArrival = Math.ceil((arrivalDate - currentDate) / (1000 * 60 * 60 * 24));

            // إضافة إشعار للشحنات التي ستصل خلال 3 أيام
            if (daysUntilArrival <= 3 && daysUntilArrival > 0 && shipment.status !== 'تم الوصول') {
                notifications.push({
                    type: 'arrival',
                    message: `شحنة ${shipment.shipmentNumber} (${shipment.goodsType}) ستصل خلال ${daysUntilArrival} يوم`,
                    shipmentNumber: shipment.shipmentNumber,
                    date: new Date().toISOString()
                });
            }
        });
        
        // تحديث عرض الإشعارات
        updateNotificationsDisplay(notifications);
    });
    
    // مراقبة المخزون منخفض الكمية
    database.ref('inventory').on('value', (snapshot) => {
        let notifications = [];
        
        snapshot.forEach((child) => {
            const inventory = child.val();
            const receivedQuantity = parseFloat(inventory.receivedQuantity) || 0;
            
            // إضافة إشعار للمخزون منخفض الكمية (أقل من 10% من الكمية المستوردة)
            if (receivedQuantity > 0) {
                const importedQuantity = parseFloat(inventory.importedQuantity) || 0;
                const percentage = (receivedQuantity / importedQuantity) * 100;
                
                if (percentage < 10) {
                    notifications.push({
                        type: 'low-stock',
                        message: `المخزون ${inventory.inventoryNumber} (${inventory.goodsType}) منخفض، متبقي ${receivedQuantity} فقط`,
                        inventoryNumber: inventory.inventoryNumber,
                        date: new Date().toISOString()
                    });
                }
            }
        });
        
        // تحديث عرض الإشعارات
        updateNotificationsDisplay(notifications);
    });
    
}

// دالة تحديث عرض الإشعارات
function updateNotificationsDisplay(newNotifications) {
    const notificationsContainer = document.getElementById('notifications');
    const notificationBadge = document.getElementById('notificationBadge');
    
    if (!notificationsContainer || !notificationBadge) return;
    
    // إضافة الإشعارات الجديدة إلى الحاوية
    if (newNotifications.length > 0) {
        // عرض شارة الإشعارات وتحديث العدد
        notificationBadge.style.display = 'block';
        notificationBadge.textContent = newNotifications.length;
        
        // تفريغ الحاوية وإضافة الإشعارات الجديدة
        notificationsContainer.innerHTML = '';
        
        newNotifications.forEach(notification => {
            const notificationElement = document.createElement('div');
            notificationElement.className = `notification ${notification.type}`;
            
            // إنشاء محتوى الإشعار
            const creationDate = new Date(notification.date);
            const formattedDate = creationDate.toLocaleDateString('ar-SA') + ' ' + creationDate.toLocaleTimeString('ar-SA');
            
            notificationElement.innerHTML = `
                <div class="notification-content">
                    <div class="notification-message">${notification.message}</div>
                    <div class="notification-date">${formattedDate}</div>
                </div>
                <button class="dismiss-btn" data-id="${notification.type === 'arrival' ? notification.shipmentNumber : notification.inventoryNumber}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // إضافة مستمع لزر إغلاق الإشعار
            const dismissBtn = notificationElement.querySelector('.dismiss-btn');
            dismissBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notificationElement.remove();
                
                // تحديث عدد الإشعارات
                const remainingNotifications = notificationsContainer.querySelectorAll('.notification').length;
                if (remainingNotifications === 0) {
                    notificationBadge.style.display = 'none';
                } else {
                    notificationBadge.textContent = remainingNotifications;
                }
            });
            
            // إضافة الإشعار إلى الحاوية
            notificationsContainer.appendChild(notificationElement);
        });
    } else {
        // إخفاء شارة الإشعارات إذا لم تكن هناك إشعارات
        notificationBadge.style.display = 'none';
    }
}

function setupseasonal_plansListeners() {
    addSeasonalPlanBtn.addEventListener('click', () => {
        seasonalPlanForm.reset();
        seasonalPlanModal.style.display = 'block';
    });
    closeSeasonalPlanModal.addEventListener('click', () => {
        seasonalPlanModal.style.display = 'none';
    });
    seasonalPlanForm.addEventListener('submit', handleseasonal_plansubmit);
    closeSeasonalProductModal.addEventListener('click', () => {
        seasonalProductModal.style.display = 'none';
    });
    seasonalProductForm.addEventListener('submit', handleSeasonalProductSubmit);
}

async function handleseasonal_plansubmit(e) {
    e.preventDefault();
    
    try {
        // التحقق من البيانات المطلوبة
        const season = document.getElementById('season')?.value?.trim();
        const year = document.getElementById('planYear')?.value?.trim();
        const supplier = document.getElementById('planSupplier')?.value?.trim();
        
        if (!season || !year || !supplier) {
            showToast('يرجى تعبئة جميع الحقول المطلوبة', 'error');
            return;
        }

        const planId = seasonalPlanForm.dataset.editId || Date.now().toString();
        const planData = {
            season,
            year,
            supplier,
            notes: document.getElementById('planNotes')?.value?.trim() || '',
            status: document.getElementById('planStatus')?.value || 'قيد التنفيذ',
            lastModified: new Date().toISOString(),
            modifiedBy: auth.currentUser?.uid || 'system'
        };

        // التحقق من وجود الخطة إذا كان تعديلاً
        if (seasonalPlanForm.dataset.editId) {
            const planRef = database.ref('seasonal_plans/' + planId);
            const snapshot = await planRef.once('value');
            const currentPlan = snapshot.val();
            
            if (!currentPlan) {
                throw new Error('الخطة غير موجودة في قاعدة البيانات');
            }

            // التحقق من تغيير الحالة وإرسال إشعار
            const oldStatus = currentPlan.status;
            if (oldStatus !== planData.status) {
                const statusNotifyCheckbox = document.getElementById('seasonal_planstatusNotifications');
                if (statusNotifyCheckbox?.checked) {
                    const notification = {
                        type: 'seasonal-plan-status',
                        message: `تم تغيير حالة خطة ${currentPlan.season} ${currentPlan.year} من ${oldStatus} إلى ${planData.status}`,
                        planId,
                        date: new Date().toISOString()
                    };
                    updateNotificationsDisplay([notification]);
                }
            }

            // تحديث الخطة مع الحفاظ على المنتجات
            const updatedPlan = {
                ...currentPlan,
                ...planData,
                products: currentPlan.products || []
            };

            await planRef.set(updatedPlan);
            showToast('تم تحديث الخطة بنجاح');
        } else {
            // إضافة خطة جديدة
            const newPlan = {
                ...planData,
                products: [],
                createdAt: new Date().toISOString(),
                createdBy: auth.currentUser?.uid || 'system'
            };

            // إرسال إشعار عند إضافة خطة جديدة
            const planNotifyCheckbox = document.getElementById('seasonalPlanNotifications');
            if (planNotifyCheckbox?.checked) {
                const notification = {
                    type: 'seasonal-plan-new',
                    message: `تم إضافة خطة شراء موسمية جديدة: ${newPlan.season} ${newPlan.year} للمورد ${newPlan.supplier}`,
                    planId,
                    date: new Date().toISOString()
                };
                updateNotificationsDisplay([notification]);
            }

            await database.ref('seasonal_plans/' + planId).set(newPlan);
            showToast('تم إضافة الخطة بنجاح');
        }

        // إغلاق النافذة وتحديث العرض
        seasonalPlanModal.style.display = 'none';
        await loadseasonal_plans();
        reapplyFilters('seasonal_plans');

    } catch (error) {
        console.error('خطأ في حفظ الخطة:', error);
        showToast(error.message || 'حدث خطأ أثناء حفظ الخطة', 'error');
    } finally {
        delete seasonalPlanForm.dataset.editId;
    }
}

function createPlanCard(plan) {
    const card = document.createElement('div');
    card.className = 'plan-card';
    
    const statusClass = {
        'قيد التنفيذ': 'active',
        'مكتملة': 'completed',
        'ملغاة': 'cancelled'
    }[plan.status] || 'active';

    // حساب عدد المنتجات بشكل آمن
    const productsCount = Array.isArray(plan.products) ? plan.products.length : 
                         (plan.products ? Object.keys(plan.products).length : 0);

    card.innerHTML = `
        <div class="plan-header">
            <div class="plan-title">${plan.supplier || 'غير محدد'}</div>
            <span class="plan-status ${statusClass}">${plan.status || 'قيد التنفيذ'}</span>
        </div>
        <div class="plan-details">
            <div class="plan-detail-item">
                <span class="plan-detail-label">الموسم:</span>
                <span>${plan.season || '-'}</span>
            </div>
            <div class="plan-detail-item">
                <span class="plan-detail-label">السنة:</span>
                <span>${plan.year || '-'}</span>
            </div>
            <div class="plan-detail-item">
                <span class="plan-detail-label">عدد المنتجات:</span>
                <span>${productsCount}</span>
            </div>
        </div>
        <div class="plan-actions">
            <button onclick="showEditSeasonalPlanModal('${plan.id}')" class="edit">
                <i class="fas fa-edit"></i>
                تعديل
            </button>
            <button onclick="showAddProductModal('${plan.id}')" class="add">
                <i class="fas fa-plus"></i>
                إضافة منتج
            </button>
            <button onclick="showProductsTimeline('${plan.id}', '${plan.supplier || ''}')" class="products">
                <i class="fas fa-list"></i>
                المنتجات
            </button>
            <button onclick="deleteSeasonalPlan('${plan.id}')" class="delete">
                <i class="fas fa-trash"></i>
                حذف
            </button>
        </div>
    `;
    
    return card;
}

async function loadseasonal_plans() {
    try {
        const plansGrid = document.getElementById('seasonalPlansGrid');
        if (!plansGrid) {
            console.warn('عنصر عرض الخطط غير موجود في الصفحة!');
            return;
        }
        // المسار الموحد
        const plansRef = database.ref('seasonal_plans');
        const snapshot = await plansRef.once('value');
        const plans = snapshot.val() || {};
        // تحديث الإحصائيات
        updateSeasonalStats(plans);
        
        // تحديث لوحة معلومات حالة الشحنات
        updateShipmentStatusDashboard();
        updateQuickReviewCounts(); // تحديث أعداد المراجعة السريعة
        
        // تفريغ الشبكة قبل إضافة البطاقات الجديدة
        plansGrid.innerHTML = '';
        // تحويل البيانات إلى مصفوفة وترتيبها
        const plansArray = Object.entries(plans).map(([id, plan]) => ({ id, ...plan })).sort((a, b) => b.year - a.year || b.season.localeCompare(a.season));
        if (plansArray.length === 0) {
            plansGrid.innerHTML = `
                <div class="no-data-message">
                    <i class="fas fa-calendar-times"></i>
                    <p>لا توجد خطط شراء موسمية حالياً</p>
                    <button onclick="showAddSeasonalPlanModal()" class="primary-btn">
                        <i class="fas fa-plus"></i>
                        إضافة خطة جديدة
                    </button>
                </div>
            `;
            return;
        }
        // إضافة كل خطة كبطاقة
        plansArray.forEach(plan => {
            const card = createPlanCard(plan);
            plansGrid.appendChild(card);
        });
    } catch (error) {
        console.error('خطأ في تحميل الخطط الموسمية:', error);
        const plansGrid = document.getElementById('seasonalPlansGrid');
        if (plansGrid) {
            plansGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>حدث خطأ أثناء تحميل الخطط الموسمية</p>
                    <button onclick="loadseasonal_plans()" class="secondary-btn">
                        <i class="fas fa-redo"></i>
                        إعادة المحاولة
                    </button>
                </div>
            `;
        }
    }
}

function updateSeasonalStats(plans) {
    try {
        const activePlansCount = document.getElementById('activePlansCount');
        const totalProductsCount = document.getElementById('totalProductsCount');
        const upcomingShipmentsCount = document.getElementById('upcomingShipmentsCount');

        if (!activePlansCount || !totalProductsCount || !upcomingShipmentsCount) {
            console.warn('عناصر الإحصائيات غير موجودة');
            return;
        }

        const plansArray = Object.values(plans);
        
        // حساب الخطط النشطة
        const activePlans = plansArray.filter(plan => plan.status === 'قيد التنفيذ').length;
        activePlansCount.textContent = activePlans;

        // حساب إجمالي المنتجات
        const totalProducts = plansArray.reduce((sum, plan) => 
            sum + (plan.products ? Object.keys(plan.products).length : 0), 0);
        totalProductsCount.textContent = totalProducts;

        // حساب الشحنات القادمة
        const upcomingShipments = plansArray.reduce((sum, plan) => {
            if (!plan.products) return sum;
            return sum + Object.values(plan.products).filter(product => 
                product.shipmentDate && new Date(product.shipmentDate) > new Date()
            ).length;
        }, 0);
        upcomingShipmentsCount.textContent = upcomingShipments;

    } catch (error) {
        console.error('خطأ في تحديث إحصائيات الخطط الموسمية:', error);
    }
}

function showAddProductModal(planId) {
    // التبديل إلى تبويب الخطط الموسمية أولاً
    switchTab('seasonal_plans');
    
    setTimeout(() => {
        seasonalProductForm.reset();
        seasonalProductForm.dataset.planId = planId;
        seasonalProductModal.style.display = 'block';
    }, 100);
}

// إضافة منطق ديناميكي لحقول تواريخ الحاويات في نموذج المنتج
function setupContainerDatesDynamicInput() {
    const containersInput = document.getElementById('productContainers');
    const wrapper = document.getElementById('containerDatesWrapper');
    function renderDatesInputs() {
        wrapper.innerHTML = '';
        const count = parseInt(containersInput.value) || 1;
        // إضافة رأس الأعمدة
        const header = document.createElement('div');
        header.className = 'container-grid-header';
        header.innerHTML = '<span>تاريخ الحاوية</span><span>كمية</span><span>رقم مرجعي</span><span>الحالة</span><span>رقم</span>';
        wrapper.appendChild(header);
        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'container-grid-row';
            // تاريخ
            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.className = 'container-date-input';
            dateInput.required = true;
            dateInput.name = `containerDate${i}`;
            // كمية
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.className = 'container-qty-input';
            qtyInput.required = true;
            qtyInput.min = 1;
            // رقم مرجعي
            const refInput = document.createElement('input');
            refInput.type = 'text';
            refInput.className = 'container-ref-input';
            refInput.required = true;
            // حالة الحاوية
            const statusSelect = document.createElement('select');
            statusSelect.className = 'container-status-input';
            ['قيد الطلب','تم الشحن','تم الاستلام','ملغى'].forEach(val => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val;
                statusSelect.appendChild(opt);
            });
            // رقم الحاوية (عرض فقط)
            const numSpan = document.createElement('span');
            numSpan.textContent = (i+1).toString();
            numSpan.style.textAlign = 'center';
            row.appendChild(dateInput);
            row.appendChild(qtyInput);
            row.appendChild(refInput);
            row.appendChild(statusSelect);
            row.appendChild(numSpan);
            wrapper.appendChild(row);
        }
    }
    containersInput.addEventListener('input', renderDatesInputs);
    renderDatesInputs();
}

// handleSeasonalProductSubmit: تخزين كل حاوية مع خصائصها
function handleSeasonalProductSubmit(e) {
    e.preventDefault();
    const planId = seasonalProductForm.dataset.planId;
    
    if (!planId) {
        console.error('معرف الخطة غير موجود');
        showToast('حدث خطأ: معرف الخطة غير موجود', 'error');
        return;
    }

    // التحقق من البيانات المطلوبة
    const productName = document.getElementById('productName')?.value?.trim();
    if (!productName) {
        showToast('يرجى إدخال اسم المنتج', 'error');
        return;
    }

    const product = {
        name: productName,
        specs: document.getElementById('productSpecs')?.value?.trim() || '',
        price: parseFloat(document.getElementById('productPrice')?.value) || 0,
        containers: parseInt(document.getElementById('productContainers')?.value) || 1,
        containerDetails: [],
        notes: document.getElementById('productNotes')?.value?.trim() || '',
        lastModified: new Date().toISOString(),
        modifiedBy: auth.currentUser?.uid || 'system'
    };

    // جمع بيانات الحاويات
    const dateInputs = document.querySelectorAll('#containerDatesWrapper .container-date-input');
    const qtyInputs = document.querySelectorAll('#containerDatesWrapper .container-qty-input');
    const refInputs = document.querySelectorAll('#containerDatesWrapper .container-ref-input');
    const statusInputs = document.querySelectorAll('#containerDatesWrapper .container-status-input');

    if (dateInputs.length !== qtyInputs.length || 
        dateInputs.length !== refInputs.length || 
        dateInputs.length !== statusInputs.length) {
        showToast('عدد حقول الحاويات غير متطابق', 'error');
        return;
    }

    // التحقق من تعبئة جميع حقول الحاويات
    for (let i = 0; i < dateInputs.length; i++) {
        const date = dateInputs[i].value;
        const quantity = qtyInputs[i].value;
        const ref = refInputs[i].value;

        if (!date || !quantity || !ref) {
            showToast(`يرجى تعبئة جميع بيانات الحاوية رقم ${i + 1}`, 'error');
            return;
        }

        // التحقق من صحة التاريخ
        const containerDate = new Date(date);
        if (isNaN(containerDate.getTime())) {
            showToast(`تاريخ الحاوية رقم ${i + 1} غير صالح`, 'error');
            return;
        }

        // التحقق من صحة الكمية
        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) {
            showToast(`كمية الحاوية رقم ${i + 1} غير صالحة`, 'error');
            return;
        }

        product.containerDetails.push({
            date,
            quantity: qty,
            ref,
            status: statusInputs[i].value || 'قيد الانتظار',
            lastModified: new Date().toISOString()
        });
    }

    // استخدام transaction للتأكد من عدم وجود تعارض
    database.ref('seasonal_plans/' + planId).transaction(currentPlan => {
        if (currentPlan === null) {
            throw new Error('الخطة غير موجودة في قاعدة البيانات');
        }

        // التأكد من وجود مصفوفة المنتجات
        if (!Array.isArray(currentPlan.products)) {
            currentPlan.products = [];
        }

        const editIndex = seasonalProductForm.dataset.editIndex;
        if (editIndex !== undefined && editIndex !== null) {
            // تعديل منتج موجود
            if (editIndex >= 0 && editIndex < currentPlan.products.length) {
                // التحقق من عدم وجود منتج آخر بنفس الاسم
                const hasDuplicate = currentPlan.products.some((p, idx) => 
                    idx !== editIndex && p.name.toLowerCase() === product.name.toLowerCase()
                );
                if (hasDuplicate) {
                    throw new Error('يوجد منتج آخر بنفس الاسم في هذه الخطة');
                }
                currentPlan.products[editIndex] = product;
            } else {
                throw new Error('فهرس المنتج غير صالح');
            }
        } else {
            // إضافة منتج جديد
            // التحقق من عدم وجود منتج بنفس الاسم
            const hasDuplicate = currentPlan.products.some(p => 
                p.name.toLowerCase() === product.name.toLowerCase()
            );
            if (hasDuplicate) {
                throw new Error('يوجد منتج آخر بنفس الاسم في هذه الخطة');
            }
            product.createdAt = new Date().toISOString();
            product.createdBy = auth.currentUser?.uid || 'system';
            currentPlan.products.push(product);
        }

        return currentPlan;
    })
    .then(({ committed, snapshot }) => {
        if (committed) {
            seasonalProductModal.style.display = 'none';
            loadseasonal_plans();
            showToast(seasonalProductForm.dataset.editIndex !== undefined ? 
                'تم تحديث المنتج بنجاح' : 'تم إضافة المنتج بنجاح');
        }
    })
    .catch(error => {
        console.error('خطأ في حفظ المنتج:', error);
        showToast(error.message || 'حدث خطأ أثناء حفظ المنتج', 'error');
    })
    .finally(() => {
        delete seasonalProductForm.dataset.editIndex;
    });
}

// منطق تعديل منتج
function editSeasonalProduct(planId, productIdx) {
    database.ref('seasonal_plans/' + planId).once('value').then(snapshot => {
        const plan = snapshot.val();
        if (!plan || !plan.products || !plan.products[productIdx]) {
            console.error('المنتج غير موجود');
            showToast('لم يتم العثور على المنتج', 'error');
            return;
        }

        const product = plan.products[productIdx];
        
        // تحديث عنوان النافذة
        document.getElementById('seasonalProductModalTitle').innerHTML = 
            '<i class="fas fa-edit" style="color:#2196F3;"></i> تعديل منتج في الخطة';
        
        // تعبئة بيانات المنتج
        document.getElementById('productName').value = product.name || '';
        document.getElementById('productSpecs').value = product.specs || '';
        document.getElementById('productPrice').value = product.price || '';
        document.getElementById('productNotes').value = product.notes || '';
        
        // تعبئة عدد الحاويات وتوليد حقول الحاويات
        const containersInput = document.getElementById('productContainers');
        containersInput.value = product.containers || 1;
        
        // تخزين معرفات الخطة والمنتج
        seasonalProductForm.dataset.planId = planId;
        seasonalProductForm.dataset.editIndex = productIdx;
        
        // توليد حقول الحاويات
        setupContainerDatesDynamicInput();
        
        // تعبئة بيانات الحاويات بعد توليد الحقول
        setTimeout(() => {
            if (product.containerDetails && product.containerDetails.length > 0) {
            const dateInputs = document.querySelectorAll('#containerDatesWrapper .container-date-input');
            const qtyInputs = document.querySelectorAll('#containerDatesWrapper .container-qty-input');
            const refInputs = document.querySelectorAll('#containerDatesWrapper .container-ref-input');
            const statusInputs = document.querySelectorAll('#containerDatesWrapper .container-status-input');
                
                product.containerDetails.forEach((container, index) => {
                    if (dateInputs[index]) dateInputs[index].value = container.date || '';
                    if (qtyInputs[index]) qtyInputs[index].value = container.quantity || '';
                    if (refInputs[index]) refInputs[index].value = container.ref || '';
                    if (statusInputs[index]) statusInputs[index].value = container.status || 'قيد الانتظار';
                });
            }
        }, 200); // زيادة التأخير لضمان توليد الحقول
        
        // إظهار النافذة
        seasonalProductModal.style.display = 'block';
    }).catch(error => {
        console.error('خطأ في تحميل بيانات المنتج:', error);
        showToast('حدث خطأ أثناء تحميل بيانات المنتج', 'error');
    });
}

// منطق حذف منتج
function deleteSeasonalProduct(planId, productIdx) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    database.ref('seasonal_plans/' + planId).once('value').then(snapshot => {
        const plan = snapshot.val();
        plan.products.splice(productIdx, 1);
        database.ref('seasonal_plans/' + planId).set(plan).then(loadseasonal_plans);
    });
}

// منطق تعديل/حذف خطة
function editSeasonalPlan(planId) {
    database.ref('seasonal_plans/' + planId).once('value').then(snapshot => {
        const plan = snapshot.val();
        document.getElementById('season').value = plan.season;
        document.getElementById('planYear').value = plan.year;
        document.getElementById('planSupplier').value = plan.supplier;
        document.getElementById('planNotes').value = plan.notes;
        document.getElementById('planStatus').value = plan.status;
        seasonalPlanForm.dataset.editId = planId;
        seasonalPlanModal.style.display = 'block';
    });
}
function deleteSeasonalPlan(planId) {
    if (!confirm('هل أنت متأكد من حذف هذه الخطة؟')) return;
    database.ref('seasonal_plans/' + planId).remove().then(loadseasonal_plans);
}

// handleseasonal_plansubmit: دعم التعديل
function handleseasonal_plansubmit(e) {
    e.preventDefault();
    const planId = seasonalPlanForm.dataset.editId || Date.now().toString();
    const newStatus = document.getElementById('planStatus').value;
    
    // إذا كان تعديلاً، تحقق من تغيير الحالة
    if (seasonalPlanForm.dataset.editId) {
        database.ref('seasonal_plans/' + planId).once('value').then(snapshot => {
            const oldPlan = snapshot.val();
            const oldStatus = oldPlan.status;
            
            // تحقق من وجود العنصر قبل استخدام .checked
            const statusNotifyCheckbox = document.getElementById('seasonal_planstatusNotifications');
            if (oldStatus !== newStatus && statusNotifyCheckbox && statusNotifyCheckbox.checked) {
                const notification = {
                    type: 'seasonal-plan-status',
                    message: `تم تغيير حالة خطة ${oldPlan.season} ${oldPlan.year} من ${oldStatus} إلى ${newStatus}`,
                    planId: planId,
                    date: new Date().toISOString()
                };
                updateNotificationsDisplay([notification]);
            }
            
            // تحديث الخطة
            const planData = {
                id: planId,
                season: document.getElementById('season').value,
                year: document.getElementById('planYear').value,
                supplier: document.getElementById('planSupplier').value,
                notes: document.getElementById('planNotes').value,
                status: newStatus,
                products: oldPlan.products || []
            };
            
            database.ref('seasonal_plans/' + planId).set(planData)
                .then(() => {
                    seasonalPlanModal.style.display = 'none';
                    loadseasonal_plans();
                });
        });
    } else {
        // إضافة خطة جديدة
        const planData = {
            id: planId,
            season: document.getElementById('season').value,
            year: document.getElementById('planYear').value,
            supplier: document.getElementById('planSupplier').value,
            notes: document.getElementById('planNotes').value,
            status: newStatus,
            products: []
        };
        
        // تحقق من وجود العنصر قبل استخدام .checked
        const planNotifyCheckbox = document.getElementById('seasonalPlanNotifications');
        if (planNotifyCheckbox && planNotifyCheckbox.checked) {
            const notification = {
                type: 'seasonal-plan-new',
                message: `تم إضافة خطة شراء موسمية جديدة: ${planData.season} ${planData.year} للمورد ${planData.supplier}`,
                planId: planId,
                date: new Date().toISOString()
            };
            updateNotificationsDisplay([notification]);
        }
        
        database.ref('seasonal_plans/' + planId).set(planData)
            .then(() => {
                seasonalPlanModal.style.display = 'none';
                loadseasonal_plans();
            });
    }
    
    delete seasonalPlanForm.dataset.editId;
}

// تحديث عرض الجدول الزمني ليشمل خط زمني وألوان الحالة وأزرار التعديل والحذف
function showProductsTimeline(planId, supplier) {
    productsTimelineContainer.classList.remove('hidden');
    timelineSupplierName.textContent = supplier;
    const timelineList = document.getElementById('productsTimelineList');
    timelineList.innerHTML = '<div class="loading-message">جاري تحميل المنتجات...</div>';

    database.ref('seasonal_plans/' + planId).once('value').then(snapshot => {
        const plan = snapshot.val();
        if (!plan || !plan.products || plan.products.length === 0) {
            timelineList.innerHTML = '<div class="no-data-message">لا توجد منتجات لهذه الخطة</div>';
            return;
        }

        // ترتيب المنتجات حسب أول تاريخ وصول
        const sortedProducts = plan.products.slice().sort((a, b) => {
            const aDate = a.containerDetails && a.containerDetails.length > 0 ? a.containerDetails[0].date : '';
            const bDate = b.containerDetails && b.containerDetails.length > 0 ? b.containerDetails[0].date : '';
            return aDate.localeCompare(bDate);
        });

        timelineList.innerHTML = '';
        sortedProducts.forEach((product, idx) => {
            let containersHtml = '';
            if (product.containerDetails && product.containerDetails.length > 0) {
                containersHtml = '<div class="timeline-containers">';
                product.containerDetails.forEach((container, containerIdx) => {
                    const statusClass = {
                        'قيد الطلب': 'pending',
                        'تم الشحن': 'shipped',
                        'تم الاستلام': 'received',
                        'ملغي': 'cancelled'
                    }[container.status] || 'pending';
                    containersHtml += `
                        <div class="timeline-container ${statusClass}">
                            <div class="container-header">
                                <span class="container-date">${container.date || '-'}</span>
                                <span class="container-status">${container.status || 'قيد الطلب'}</span>
                            </div>
                            <div class="container-details">
                                <span class="container-quantity">الكمية: ${container.quantity || '-'}</span>
                                <span class="container-ref">المرجع: ${container.ref || '-'}</span>
                            </div>
                        </div>
                    `;
                });
                containersHtml += '</div>';
            }

            // بناء بطاقة المنتج
            const productElement = document.createElement('div');
            productElement.className = 'timeline-product';
            productElement.innerHTML = `
                <div class="timeline-product-header">
                    <div class="timeline-product-title">
                        ${product.name}
                        <span class="product-specs">${product.specs || ''}</span>
                        <span class="product-price">${product.price ? ('$' + Number(product.price).toFixed(2)) : ''}</span>
                    </div>
                    <div class="timeline-product-actions">
                        <button onclick="editSeasonalProduct('${planId}', ${plan.products.indexOf(product)})" class="edit-btn">
                            <i class="fas fa-edit"></i>
                            تعديل
                        </button>
                        <button onclick="deleteSeasonalProduct('${planId}', ${plan.products.indexOf(product)})" class="delete-btn">
                            <i class="fas fa-trash"></i>
                            حذف
                        </button>
                    </div>
                </div>
                ${containersHtml}
                ${product.notes ? `<div class="timeline-product-notes">${product.notes}</div>` : ''}
            `;
            timelineList.appendChild(productElement);
        });
    }).catch(error => {
        console.error('خطأ في تحميل المنتجات:', error);
        timelineList.innerHTML = '<div class="error-message">حدث خطأ أثناء تحميل المنتجات</div>';
    });
}

// دالة مراقبة إشعارات الخطط الموسمية
function setupseasonal_plansNotifications() {
    // مراقبة تغييرات الخطط الموسمية
    database.ref('seasonal_plans').on('value', (snapshot) => {
        const currentDate = new Date();
        let notifications = [];
        
        snapshot.forEach((child) => {
            const plan = child.val();
            
            // التحقق من حالة الخطة
            if (plan.status === 'مكتملة' && document.getElementById('seasonalPlanCompletionNotifications').checked) {
                notifications.push({
                    type: 'seasonal-plan-completion',
                    message: `تم إكمال خطة الشراء الموسمية ${plan.season} ${plan.year} للمورد ${plan.supplier}`,
                    planId: plan.id,
                    date: new Date().toISOString()
                });
            }
            
            // التحقق من مواعيد الشحن القادمة
            if (plan.products && document.getElementById('seasonal_planshippingNotifications').checked) {
                const daysBeforeShipping = parseInt(document.getElementById('daysBeforeShipping').value) || 7;
                
                plan.products.forEach(product => {
                    if (product.containerDetails) {
                        product.containerDetails.forEach(container => {
                            if (container.date && container.status !== 'تم الشحن' && container.status !== 'تم الاستلام') {
                                const shippingDate = new Date(container.date);
                                const daysUntilShipping = Math.ceil((shippingDate - currentDate) / (1000 * 60 * 60 * 24));
                                
                                if (daysUntilShipping <= daysBeforeShipping && daysUntilShipping > 0) {
                                    notifications.push({
                                        type: 'seasonal-plan-shipping',
                                        message: `موعد شحن ${product.name} في خطة ${plan.season} ${plan.year} خلال ${daysUntilShipping} يوم`,
                                        planId: plan.id,
                                        productName: product.name,
                                        date: new Date().toISOString()
                                    });
                                }
                            }
                        });
                    }
                });
            }
        });
        
        // تحديث عرض الإشعارات
        updateNotificationsDisplay(notifications);
    });
}

async function showProductsTimeline(planId, supplier) {
    try {
        // التحقق من وجود العناصر المطلوبة
        const timelineContainer = document.getElementById('productsTimelineContainer');
        const timelineList = document.getElementById('productsTimelineList');
        const supplierNameSpan = document.getElementById('timelineSupplierName');

        if (!timelineContainer || !timelineList || !supplierNameSpan) {
            console.warn('عناصر الجدول الزمني غير موجودة في الصفحة');
            return;
        }

        // تحديث اسم المورد وإظهار الحاوية
        supplierNameSpan.textContent = supplier || 'غير محدد';
        timelineContainer.classList.remove('hidden');
        timelineList.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> جاري تحميل المنتجات...</div>';

        // جلب بيانات الخطة
        const planRef = database.ref(`seasonal_plans/${planId}`);
        const snapshot = await planRef.once('value');
        const plan = snapshot.val();

        if (!plan) {
            throw new Error('الخطة غير موجودة في قاعدة البيانات');
        }

        if (!plan.products || !Array.isArray(plan.products) || plan.products.length === 0) {
            timelineList.innerHTML = `
                <div class="no-data-message">
                    <i class="fas fa-box-open"></i>
                    <p>لا توجد منتجات في هذه الخطة</p>
                    <button onclick="showAddProductModal('${planId}')" class="primary-btn">
                        <i class="fas fa-plus"></i>
                        إضافة منتج جديد
                    </button>
                </div>
            `;
            return;
        }

        // ترتيب المنتجات حسب تاريخ الشحن
        const sortedProducts = plan.products
            .map((product, index) => ({ id: index, ...product }))
            .sort((a, b) => {
                const dateA = a.containerDetails?.[0]?.date || '';
                const dateB = b.containerDetails?.[0]?.date || '';
                return dateA.localeCompare(dateB);
            });

        // تفريغ القائمة وعرض المنتجات
        timelineList.innerHTML = '';
        sortedProducts.forEach(product => {
            const productElement = document.createElement('div');
            productElement.className = 'timeline-product';
            
            // بناء تفاصيل الحاويات
            let containersHtml = '';
            if (product.containerDetails && product.containerDetails.length > 0) {
                containersHtml = '<div class="timeline-containers">';
                product.containerDetails.forEach((container, idx) => {
                    const statusClass = {
                        'قيد الطلب': 'pending',
                        'تم الشحن': 'shipped',
                        'تم الاستلام': 'received',
                        'ملغي': 'cancelled'
                    }[container.status] || 'pending';

                    containersHtml += `
                        <div class="timeline-container ${statusClass}">
                            <div class="container-header">
                                <span class="container-date">${container.date || '-'}</span>
                                <span class="container-status">${container.status || 'قيد الطلب'}</span>
                            </div>
                            <div class="container-details">
                                <span class="container-quantity">الكمية: ${container.quantity || '-'}</span>
                                <span class="container-ref">المرجع: ${container.ref || '-'}</span>
                            </div>
                        </div>
                    `;
                });
                containersHtml += '</div>';
            }

            // بناء بطاقة المنتج
            productElement.innerHTML = `
                <div class="timeline-product-header">
                    <div class="timeline-product-title">
                        ${product.name}
                        <span class="product-specs">${product.specs || ''}</span>
                        ${product.price ? `<span class="product-price">$${Number(product.price).toFixed(2)}</span>` : ''}
                    </div>
                    <div class="timeline-product-actions">
                        <button onclick="editSeasonalProduct('${planId}', ${product.id})" class="edit-btn">
                            <i class="fas fa-edit"></i>
                            تعديل
                        </button>
                        <button onclick="deleteSeasonalProduct('${planId}', ${product.id})" class="delete-btn">
                            <i class="fas fa-trash"></i>
                            حذف
                        </button>
                    </div>
                </div>
                ${containersHtml}
                ${product.notes ? `<div class="timeline-product-notes">${product.notes}</div>` : ''}
            `;

            timelineList.appendChild(productElement);
        });

    } catch (error) {
        console.error('خطأ في عرض الجدول الزمني:', error);
        const timelineList = document.getElementById('productsTimelineList');
        if (timelineList) {
            timelineList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>${error.message || 'حدث خطأ أثناء تحميل الجدول الزمني'}</p>
                    <button onclick="showProductsTimeline('${planId}', '${supplier}')" class="secondary-btn">
                        <i class="fas fa-redo"></i>
                        إعادة المحاولة
                    </button>
                </div>
            `;
        }
    }
}

function showAddSeasonalPlanModal() {
    // التبديل إلى تبويب الخطط الموسمية أولاً
    switchTab('seasonal_plans');
    
    setTimeout(() => {
        const modal = document.getElementById('seasonalPlanModal');
        const form = document.getElementById('seasonalPlanForm');
        const title = document.getElementById('seasonalPlanModalTitle');
        
        if (!modal || !form || !title) {
            console.warn('عناصر نافذة إضافة الخطة غير موجودة');
            return;
        }

        // إعادة تعيين النموذج
        form.reset();
        title.textContent = 'إضافة خطة شراء موسمية';
        
        // إزالة معرف الخطة إذا كان موجوداً
        form.removeAttribute('data-plan-id');
        
        // إظهار النافذة
        modal.style.display = 'block';
    }, 100);
}

async function showEditSeasonalPlanModal(planId) {
    // التبديل إلى تبويب الخطط الموسمية أولاً
    switchTab('seasonal_plans');
    
    setTimeout(async () => {
        try {
            const modal = document.getElementById('seasonalPlanModal');
            const form = document.getElementById('seasonalPlanForm');
        const title = document.getElementById('seasonalPlanModalTitle');
        
        if (!modal || !form || !title) {
            console.warn('عناصر نافذة تعديل الخطة غير موجودة');
            return;
        }

        // جلب بيانات الخطة
        const planRef = database.ref(`seasonal_plans/${planId}`);
        const snapshot = await planRef.once('value');
        const plan = snapshot.val();
        
        if (!plan) {
            console.warn('الخطة غير موجودة');
            return;
        }

        // تعبئة النموذج ببيانات الخطة
        form.querySelector('#season').value = plan.season || '';
        form.querySelector('#planYear').value = plan.year || '';
        form.querySelector('#planSupplier').value = plan.supplier || '';
        form.querySelector('#planNotes').value = plan.notes || '';
        form.querySelector('#planStatus').value = plan.status || 'قيد التنفيذ';
        
        // تخزين معرف الخطة
        form.setAttribute('data-plan-id', planId);
        
        // تحديث العنوان
        title.textContent = 'تعديل خطة الشراء الموسمية';
        
            // إظهار النافذة
            modal.style.display = 'block';
            
        } catch (error) {
            console.error('خطأ في تحميل بيانات الخطة:', error);
            showToast('حدث خطأ أثناء تحميل بيانات الخطة', 'error');
        }
    }, 100);
}

function createProductTimelineElement(product) {
    // بناء تفاصيل الحاويات
    let containersHtml = '';
    if (product.containerDetails && product.containerDetails.length > 0) {
        containersHtml = `<div class='timeline-containers-list'>` +
            product.containerDetails.map((c, idx) => {
                let statusClass = 'container-status-qid';
                if (c.status === 'تم الشحن') statusClass = 'container-status-shipped';
                else if (c.status === 'تم الاستلام') statusClass = 'container-status-received';
                else if (c.status === 'ملغى') statusClass = 'container-status-cancelled';
                return `<div class='timeline-container-item'>
                    <i class='fas fa-box'></i> حاوية ${idx + 1}
                    <span style='color:#2196F3'>${c.date}</span>
                    <span>كمية: ${c.quantity}</span>
                    <span>مرجع: ${c.ref}</span>
                    <span class='${statusClass}'>${c.status}</span>
                </div>`;
            }).join('') +
            `</div>`;
    }
    // بناء العنصر الرئيسي
    const div = document.createElement('div');
    div.className = 'timeline-product';
    div.innerHTML = `
        <div class='timeline-product-title'>${product.name}</div>
        <div class='timeline-product-meta'>المواصفات: ${product.specs || '-'} | عدد الحاويات: ${product.containers || 0}</div>
        ${containersHtml}
        <div class='timeline-product-meta'>ملاحظات: ${product.notes || '-'}</div>
    `;
    return div;
}

// نظام التصعيد التلقائي للطلبات والشحنات المتأخرة
function checkForEscalations() {
    const today = new Date();
    // فحص الشحنات المتأخرة
    database.ref('shipments').once('value').then(snapshot => {
        snapshot.forEach(child => {
            const shipment = child.val();
            if (shipment.arrivalDate && shipment.status !== 'تم الاستلام') {
                const arrival = new Date(shipment.arrivalDate);
                if (arrival < today) {
                    escalateItem('shipment', shipment, child.key);
                }
            }
        });
    });
}

// تنفيذ التصعيد: إشعار + تمييز + سجل نشاطات
function escalateItem(type, item, key) {
    // إشعار لجميع المستخدمين
    showToast(`⚠️ ${type === 'shipment' ? 'شحنة متأخرة' : 'طلب متأخر'}: ${item.supplier || item.supplierName || ''}`, 'error');
    // سجل النشاطات
    createNotification({
        type: 'escalation',
        message: `تم تصعيد ${type === 'shipment' ? 'شحنة متأخرة' : 'طلب متأخر'}: ${item.supplier || item.supplierName || ''}`,
        date: new Date().toISOString()
    });
    // تمييز العنصر في الجدول أو البطاقة (بإضافة كلاس)
    setTimeout(() => {
        if (type === 'shipment') {
            const row = document.querySelector(`[data-shipment-id='${key}']`);
            if (row) row.classList.add('escalated');
        } else if (type === 'order') {
            const row = document.querySelector(`[data-order-id='${key}']`);
            if (row) row.classList.add('escalated');
        }
    }, 500);
}

// إضافة كلاس CSS لعناصر التصعيد


// --- مهام الشحنات ---
function showShipmentTasksModal(shipmentNumber) {
    // التبديل إلى تبويب الشحنات أولاً
    switchTab('shipments');
    
    setTimeout(() => {
        const modal = document.getElementById('shipmentTasksModal');
        const closeBtn = document.getElementById('closeShipmentTasksModal');
        const tasksList = document.getElementById('shipmentTasksList');
        const addForm = document.getElementById('addShipmentTaskForm');
        const newTaskInput = document.getElementById('newShipmentTaskTitle');
        closeBtn.onclick = () => { modal.style.display = 'none'; };
        window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        database.ref('shipments/' + shipmentNumber).once('value').then(snapshot => {
            const shipment = snapshot.val();
            renderShipmentTasks(shipment?.tasks || [], shipmentNumber);
        });
        addForm.onsubmit = (e) => {
            e.preventDefault();
            const title = newTaskInput.value.trim();
            if (!title) return;
            database.ref('shipments/' + shipmentNumber).once('value').then(snapshot => {
                const shipment = snapshot.val();
                let tasks = shipment?.tasks || [];
                tasks.push({ title, status: 'غير منجزة' });
                database.ref('shipments/' + shipmentNumber + '/tasks').set(tasks).then(() => {
                    renderShipmentTasks(tasks, shipmentNumber);
                    newTaskInput.value = '';
                });
            });
        };
        modal.style.display = 'block';
    }, 100);
}
function renderShipmentTasks(tasks, shipmentNumber) {
    const tasksList = document.getElementById('shipmentTasksList');
    if (!tasks.length) {
        tasksList.innerHTML = '<div class=\"no-data-message\">لا توجد مهام لهذه الشحنة</div>';
        return;
    }
    tasksList.innerHTML = tasks.map((task, idx) => `
        <div class=\"task-item\" style=\"display:flex;align-items:center;gap:8px;margin-bottom:8px;\">
            <input type=\"checkbox\" ${task.status === 'منجزة' ? 'checked' : ''} onchange=\"updateShipmentTaskStatus('${shipmentNumber}', ${idx}, this.checked)\">
            <span style=\"flex:1;${task.status === 'منجزة' ? 'text-decoration:line-through;color:#888;' : ''}\">${task.title}</span>
            <button class=\"delete-btn\" onclick=\"deleteShipmentTask('${shipmentNumber}', ${idx})\">حذف</button>
        </div>
    `).join('');
}
function updateShipmentTaskStatus(shipmentNumber, idx, done) {
    database.ref('shipments/' + shipmentNumber).once('value').then(snapshot => {
        const shipment = snapshot.val();
        let tasks = shipment?.tasks || [];
        if (tasks[idx]) {
            tasks[idx].status = done ? 'منجزة' : 'غير منجزة';
            database.ref('shipments/' + shipmentNumber + '/tasks').set(tasks).then(() => {
                renderShipmentTasks(tasks, shipmentNumber);
            });
        }
    });
}
function deleteShipmentTask(shipmentNumber, idx) {
    database.ref('shipments/' + shipmentNumber).once('value').then(snapshot => {
        const shipment = snapshot.val();
        let tasks = shipment?.tasks || [];
        tasks.splice(idx, 1);
        database.ref('shipments/' + shipmentNumber + '/tasks').set(tasks).then(() => {
            renderShipmentTasks(tasks, shipmentNumber);
        });
    });
}

// --- ربط الدوال مع window ---
window.showShipmentTasksModal = showShipmentTasksModal;

// مقارنة الأسعار تلقائيًا عند إضافة طلب جديد
function compareProductPrice() {
    const productName = document.getElementById('goodsType').value.trim();
    const currentPrice = parseFloat(document.getElementById('containerValue').value) || 0;
    const infoDiv = document.getElementById('priceComparisonInfo');
    if (!infoDiv) return;
    if (!productName || !currentPrice) {
        infoDiv.textContent = '';
        return;
    }
            infoDiv.textContent = 'لا يوجد بيانات تاريخية لهذا المنتج.';
            infoDiv.style.color = '#666';
}

// إضافة مستمعات الأحداث عند تحميل الصفحة
if (document.getElementById('goodsType')) {
    document.getElementById('goodsType').addEventListener('input', compareProductPrice);
}
if (document.getElementById('containerValue')) {
    document.getElementById('containerValue').addEventListener('input', compareProductPrice);
}

// تحليل تأخير الموردين وإرسال إشعارات ذكية
function analyzeSupplierDelays() {
    const currentDate = new Date();
    const twoMonthsAgo = new Date(currentDate.getTime() - (60 * 24 * 60 * 60 * 1000)); // قبل شهرين

    // تحليل الشحنات
    database.ref('shipments').once('value').then(snapshot => {
        const supplierDelays = {};
        
        snapshot.forEach(child => {
            const shipment = child.val();
            const arrivalDate = new Date(shipment.arrivalDate);
            const actualArrivalDate = shipment.actualArrivalDate ? new Date(shipment.actualArrivalDate) : null;
            
            // تحليل الشحنات في آخر شهرين فقط
            if (arrivalDate >= twoMonthsAgo) {
                const supplier = shipment.supplier;
                if (!supplierDelays[supplier]) {
                    supplierDelays[supplier] = {
                        totalShipments: 0,
                        delayedShipments: 0,
                        delays: []
                    };
                }
                
                supplierDelays[supplier].totalShipments++;
                
                // حساب التأخير إذا كان هناك تاريخ وصول فعلي
                if (actualArrivalDate && actualArrivalDate > arrivalDate) {
                    const delayDays = Math.ceil((actualArrivalDate - arrivalDate) / (1000 * 60 * 60 * 24));
                    supplierDelays[supplier].delayedShipments++;
                    supplierDelays[supplier].delays.push({
                        shipmentNumber: shipment.shipmentNumber,
                        delayDays: delayDays,
                        goodsType: shipment.goodsType
                    });
                }
            }
        });

        // تحليل النتائج وإرسال إشعارات للموردين المتأخرين
        Object.entries(supplierDelays).forEach(([supplier, data]) => {
            if (data.totalShipments >= 3 && data.delayedShipments >= 2) {
                const delayRate = (data.delayedShipments / data.totalShipments) * 100;
                const averageDelay = data.delays.reduce((sum, d) => sum + d.delayDays, 0) / data.delays.length;
                
                // إرسال إشعار ذكي
                createNotification({
                    type: 'smart-alert',
                    message: `تنبيه: المورد ${supplier} لديه ${delayRate.toFixed(0)}% تأخير في الشحنات. 
                             متوسط التأخير ${averageDelay.toFixed(1)} يوم. 
                             عدد الشحنات المتأخرة: ${data.delayedShipments} من أصل ${data.totalShipments}`,
                    priority: 'high',
                    supplier: supplier,
                    delayRate: delayRate,
                    averageDelay: averageDelay
                });
            }
        });
    });
}

// تحديث دالة setupNotifications لتشمل التحليل الذكي
function setupNotifications() {
    // ... existing code ...

    // تشغيل تحليل تأخير الموردين عند تحميل الصفحة
    analyzeSupplierDelays();
    
    // تشغيل التحليل كل 6 ساعات
    setInterval(analyzeSupplierDelays, 6 * 60 * 60 * 1000);
}

// تحديث دالة getNotificationTitle لتشمل الإشعارات الذكية
function getNotificationTitle(type) {
    const titles = {
        // ... existing code ...
        'smart-alert': 'تنبيه ذكي',
        // ... existing code ...
    };
    return titles[type] || 'إشعار';
}

// تحديث دالة فلترة الطلبات

// تحديث دالة فلترة الشحنات
function filterShipmentsTable() {
    const getElementValue = (elementId) => {
        const element = document.getElementById(elementId);
        return element ? element.value : '';
    };

    const searchValue = getElementValue('shipmentSearchInput');
    const statusFilter = getElementValue('shipmentStatusFilter');
    const supplierFilter = getElementValue('shipmentSupplierFilter');
    const startDate = getElementValue('shipmentStartDate');
    const endDate = getElementValue('shipmentEndDate');

    // حفظ حالة الفلترة
    filterStates.shipments = {
        search: searchValue,
        status: statusFilter,
        supplier: supplierFilter,
        dateRange: { start: startDate, end: endDate }
    };

    const table = document.getElementById('shipmentsTable');
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    if (!rows.length) return;

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;

        const shipmentNumber = (cells[0]?.textContent || '').toLowerCase();
        const supplier = (cells[1]?.textContent || '').toLowerCase();
        const status = (cells[2]?.textContent || '').toLowerCase();
        const date = new Date(cells[3]?.textContent || '');

        const matchesSearch = shipmentNumber.includes(searchValue.toLowerCase()) ||
                            supplier.includes(searchValue.toLowerCase());
        const matchesStatus = !statusFilter || status === statusFilter.toLowerCase();
        const matchesSupplier = !supplierFilter || supplier === supplierFilter.toLowerCase();
        const matchesDate = (!startDate || date >= new Date(startDate)) &&
                          (!endDate || date <= new Date(endDate));

        row.style.display = matchesSearch && matchesStatus && matchesSupplier && matchesDate ? '' : 'none';
    });
}

// تحديث دالة فلترة الخطط الموسمية
function filterseasonal_plansTable() {
    const getElementValue = (elementId) => {
        const element = document.getElementById(elementId);
        return element ? element.value : '';
    };

    const searchValue = getElementValue('seasonal_plansearchInput');
    const supplierFilter = getElementValue('seasonal_plansupplierFilter');
    const statusFilter = getElementValue('seasonal_planstatusFilter');
    const seasonFilter = getElementValue('seasonal_planseasonFilter');

    // حفظ حالة الفلترة
    filterStates.seasonal_plans = {
        search: searchValue,
        supplier: supplierFilter,
        status: statusFilter,
        season: seasonFilter
    };

    const table = document.getElementById('seasonal_plansTable');
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    if (!rows.length) return;

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;

        const planName = (cells[0]?.textContent || '').toLowerCase();
        const supplier = (cells[1]?.textContent || '').toLowerCase();
        const status = (cells[2]?.textContent || '').toLowerCase();
        const season = (cells[3]?.textContent || '').toLowerCase();

        const matchesSearch = !searchValue || 
            planName.includes(searchValue.toLowerCase()) ||
            supplier.includes(searchValue.toLowerCase());
        const matchesSupplier = !supplierFilter || supplier === supplierFilter.toLowerCase();
        const matchesStatus = !statusFilter || status === statusFilter.toLowerCase();
        const matchesSeason = !seasonFilter || season === seasonFilter.toLowerCase();

        row.style.display = matchesSearch && matchesSupplier && matchesStatus && matchesSeason ? '' : 'none';
    });
}

// دالة إعادة تطبيق الفلترة بعد تحديث الجدول
function reapplyFilters(tableType) {
    const setElementValue = (elementId, value) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = value || '';
        }
    };

    const getFilterValue = (filterState, key, defaultValue = '') => {
        return filterState && filterState[key] ? filterState[key] : defaultValue;
    };

    switch(tableType) {
        // تم حذف case 'orders' بعد حذف تبويب الطلبات
        case 'shipments':
            if (filterStates.shipments) {
                setElementValue('shipmentSearchInput', getFilterValue(filterStates.shipments, 'search'));
                setElementValue('shipmentStatusFilter', getFilterValue(filterStates.shipments, 'status'));
                setElementValue('shipmentSupplierFilter', getFilterValue(filterStates.shipments, 'supplier'));
                setElementValue('shipmentStartDate', getFilterValue(filterStates.shipments.dateRange, 'start'));
                setElementValue('shipmentEndDate', getFilterValue(filterStates.shipments.dateRange, 'end'));
                if (typeof filterShipmentsTable === 'function') {
                    filterShipmentsTable();
                }
            }
            break;
        case 'seasonal_plans':
            if (filterStates.seasonal_plans) {
                setElementValue('seasonal_plansearchInput', getFilterValue(filterStates.seasonal_plans, 'search'));
                setElementValue('seasonal_plansupplierFilter', getFilterValue(filterStates.seasonal_plans, 'supplier'));
                setElementValue('seasonal_planstatusFilter', getFilterValue(filterStates.seasonal_plans, 'status'));
                setElementValue('seasonal_planseasonFilter', getFilterValue(filterStates.seasonal_plans, 'season'));
                if (typeof filterseasonal_plansTable === 'function') {
                    filterseasonal_plansTable();
                }
            }
            break;
    }
}





function handleseasonal_plansubmit(e) {
    e.preventDefault();
    const planData = {
        id: seasonalPlanForm.dataset.editId || Date.now().toString(),
        season: document.getElementById('season').value,
        year: document.getElementById('planYear').value,
        supplier: document.getElementById('planSupplier').value,
        notes: document.getElementById('planNotes').value,
        status: document.getElementById('planStatus').value
    };

    // إذا كان تعديلاً، تحقق من تغيير الحالة
    if (seasonalPlanForm.dataset.editId) {
        database.ref('seasonal_plans/' + planData.id).once('value').then(snapshot => {
            const oldPlan = snapshot.val();
            const oldStatus = oldPlan.status;
            
            // تحقق من وجود العنصر قبل استخدام .checked
            const statusNotifyCheckbox = document.getElementById('seasonal_planstatusNotifications');
            if (oldStatus !== planData.status && statusNotifyCheckbox && statusNotifyCheckbox.checked) {
                const notification = {
                    type: 'seasonal-plan-status',
                    message: `تم تغيير حالة خطة ${oldPlan.season} ${oldPlan.year} من ${oldStatus} إلى ${planData.status}`,
                    planId: planData.id,
                    date: new Date().toISOString()
                };
                updateNotificationsDisplay([notification]);
            }
            
            // تحديث الخطة مع الحفاظ على المنتجات
            const updatedPlan = {
                id: planData.id,
                season: planData.season,
                year: planData.year,
                supplier: planData.supplier,
                notes: planData.notes,
                status: planData.status,
                products: oldPlan.products || []
            };
            
            database.ref('seasonal_plans/' + planData.id).set(updatedPlan)
                .then(() => {
                    showSuccessMessage('تم حفظ الخطة الموسمية بنجاح');
                    closeModal('addSeasonalPlanModal');
                    loadseasonal_plans();
                    reapplyFilters('seasonal_plans'); // إعادة تطبيق الفلترة
                });
        });
    } else {
        // إضافة خطة جديدة
        const newPlan = {
            id: planData.id,
            season: planData.season,
            year: planData.year,
            supplier: planData.supplier,
            notes: planData.notes,
            status: planData.status,
            products: []
        };
        
        // تحقق من وجود العنصر قبل استخدام .checked
        const planNotifyCheckbox = document.getElementById('seasonalPlanNotifications');
        if (planNotifyCheckbox && planNotifyCheckbox.checked) {
            const notification = {
                type: 'seasonal-plan-new',
                message: `تم إضافة خطة شراء موسمية جديدة: ${newPlan.season} ${newPlan.year} للمورد ${newPlan.supplier}`,
                planId: newPlan.id,
                date: new Date().toISOString()
            };
            updateNotificationsDisplay([notification]);
        }
        
        database.ref('seasonal_plans').push(newPlan)
            .then(() => {
                showSuccessMessage('تم حفظ الخطة الموسمية بنجاح');
                closeModal('addSeasonalPlanModal');
                loadseasonal_plans();
                reapplyFilters('seasonal_plans'); // إعادة تطبيق الفلترة
            });
    }
    
    delete seasonalPlanForm.dataset.editId;
}

// تحديث دوال التعديل والحذف أيضاً


// نفس التحديثات لدوال الشحنات والخطط الموسمية
// ... existing code ...

// إضافة دوال الرسائل
function showSuccessMessage(message) {
    showToast(message, 'success');
}

function showErrorMessage(message) {
    showToast(message, 'error');
}

// تحديث دالة تشغيل الصوت
let notificationSound = null;
let soundEnabled = false;

async function initializeNotificationSound() {
    try {
        // التحقق من وجود الملف أولاً
        const soundPath = 'sounds/notification.mp3';
        
        // إنشاء عنصر صوت جديد
        notificationSound = new Audio(soundPath);
        
        // إضافة مستمعات للأخطاء
        notificationSound.addEventListener('error', (e) => {
            console.warn('Audio file error:', e);
            soundEnabled = false;
        });
        
        notificationSound.addEventListener('canplaythrough', () => {
            console.log('Notification sound loaded successfully');
        });
        
        // تحميل الصوت مسبقاً
        await new Promise((resolve, reject) => {
            notificationSound.addEventListener('canplaythrough', resolve, { once: true });
            notificationSound.addEventListener('error', reject, { once: true });
            notificationSound.load();
        });
        
        // تعطيل التشغيل التلقائي
        notificationSound.autoplay = false;
        notificationSound.volume = 0.5;
        
        // محاولة تشغيل صوت صامت لتفعيل الصوت
        const tempVolume = notificationSound.volume;
        notificationSound.volume = 0;
        try {
            await notificationSound.play();
            notificationSound.pause();
            notificationSound.currentTime = 0;
            notificationSound.volume = tempVolume;
        soundEnabled = true;
        } catch (playError) {
            notificationSound.volume = tempVolume;
            soundEnabled = false;
            if (playError.name !== 'NotAllowedError') {
                console.warn('Audio play error:', playError);
            }
        }
    } catch (error) {
        console.warn('Could not initialize notification sound:', error);
        soundEnabled = false;
    }
}

async function playNotificationSound() {
    if (!soundEnabled || !notificationSound) {
        try {
            await initializeNotificationSound();
        } catch (error) {
            console.warn('Failed to initialize notification sound:', error);
            return;
        }
    }

    try {
        // إعادة تعيين الصوت إلى البداية
        notificationSound.currentTime = 0;
        // محاولة تشغيل الصوت
        const playPromise = notificationSound.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                if (error.name === 'NotAllowedError') {
                    // إذا كان الخطأ بسبب عدم تفاعل المستخدم، لا نعتبرها خطأ خطير
                    soundEnabled = false;
                    console.info('Sound playback not allowed - user interaction required');
                } else {
                    console.warn('Error playing notification sound:', error);
                }
            });
        }
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
}

// متغير لتتبع إعداد مستمعات الصوت
let soundListenersAdded = false;

// تحديث دالة إعداد الإشعارات
function setupNotifications() {
    // تهيئة الصوت عند تحميل الصفحة
    initializeNotificationSound();
    
    // إضافة مستمعات لتفعيل الصوت عند أول تفاعل (مرة واحدة فقط)
    if (!soundListenersAdded) {
        const enableSoundOnInteraction = async () => {
        if (!soundEnabled) {
            try {
                await initializeNotificationSound();
                    if (soundEnabled) {
                        console.log('Notification sound enabled after user interaction');
                        // إزالة المستمعات بعد تفعيل الصوت
                        document.removeEventListener('click', enableSoundOnInteraction);
                        document.removeEventListener('keydown', enableSoundOnInteraction);
                        document.removeEventListener('touchstart', enableSoundOnInteraction);
                        soundListenersAdded = false; // للسماح بإعادة الإضافة لاحقاً إذا لزم الأمر
                    }
            } catch (error) {
                    console.warn('Failed to initialize notification sound on interaction:', error);
                }
            }
        };
        
        // إضافة مستمعات لأحداث مختلفة
        document.addEventListener('click', enableSoundOnInteraction);
        document.addEventListener('keydown', enableSoundOnInteraction);
        document.addEventListener('touchstart', enableSoundOnInteraction);
        soundListenersAdded = true;
    }

    // ... باقي كود إعداد الإشعارات ...
}

async function showAddProductModal(planId) {
    // التبديل إلى تبويب الخطط الموسمية أولاً
    switchTab('seasonal_plans');
    
    setTimeout(async () => {
        try {
            // التحقق من وجود الخطة قبل عرض النموذج
            const snapshot = await database.ref('seasonal_plans/' + planId).once('value');
            const plan = snapshot.val();
            
            if (!plan) {
                showToast('الخطة غير موجودة في قاعدة البيانات', 'error');
                return;
            }

            // إعادة تعيين النموذج وتعيين معرف الخطة
            seasonalProductForm.reset();
            seasonalProductForm.dataset.planId = planId;
            
            // تحديث عنوان النافذة
            document.getElementById('seasonalProductModalTitle').innerHTML = 
                `<i class="fas fa-plus" style="color:#4CAF50;"></i> إضافة منتج جديد - ${plan.supplier || 'مورد'} - ${plan.season || 'موسم'} ${plan.year || ''}`;
            
            // عرض النافذة
            seasonalProductModal.style.display = 'block';
            
            // إعادة تهيئة حقول الحاويات
            setupContainerDatesDynamicInput();
        } catch (error) {
            console.error('خطأ في فتح نافذة إضافة المنتج:', error);
            showToast('حدث خطأ أثناء فتح نافذة إضافة المنتج', 'error');
        }
    }, 100);
}

// دالة تحديث لوحة معلومات حالة الشحنات
async function updateShipmentStatusDashboard() {
    try {
        const { data: shipments, error } = await supabase
            .from('shipments')
            .select('customs_status, payment_status, arrival_date, status');

        if (error) throw error;

        let customsReleased = 0;
        let customsPending = 0;
        let paymentCompleted = 0;
        let paymentPending = 0;
        let totalShipments = shipments ? shipments.length : 0;

        (shipments || []).forEach(shipment => {
            const customsStatus = (shipment.customs_status || '').toLowerCase();
            const paymentStatus = (shipment.payment_status || '').toLowerCase();

            const isCustomsReleased = customsStatus.includes('تم الإفراج') || customsStatus.includes('released') || customsStatus.includes('completed');
            const isPaymentCompleted = paymentStatus.includes('مدفوع') || paymentStatus.includes('paid') || paymentStatus.includes('completed');

            if (isCustomsReleased) {
                customsReleased++;
            } else {
                customsPending++;
            }

            if (isPaymentCompleted) {
                paymentCompleted++;
            } else {
                paymentPending++;
            }
        });

        const customsReleasedElement = document.getElementById('customsReleasedCount');
        const customsTotalElement = document.getElementById('customsTotalCount');
        const paymentCompletedElement = document.getElementById('paymentCompletedCount');
        const paymentTotalElement = document.getElementById('paymentTotalCount');

        if (customsReleasedElement) customsReleasedElement.textContent = customsReleased;
        if (customsTotalElement) customsTotalElement.textContent = totalShipments;
        if (paymentCompletedElement) paymentCompletedElement.textContent = paymentCompleted;
        if (paymentTotalElement) paymentTotalElement.textContent = totalShipments;

        const customsProgress = totalShipments > 0 ? (customsReleased / totalShipments) * 100 : 0;
        const paymentProgress = totalShipments > 0 ? (paymentCompleted / totalShipments) * 100 : 0;

        updateProgressCircle('customsCircle', customsProgress);
        updateProgressCircle('paymentCircle', paymentProgress);

        const customsProgressText = document.getElementById('customsProgressText');
        const paymentProgressText = document.getElementById('paymentProgressText');
        if (customsProgressText) customsProgressText.textContent = Math.round(customsProgress) + '%';
        if (paymentProgressText) paymentProgressText.textContent = Math.round(paymentProgress) + '%';
    } catch (error) {
        console.error('خطأ في تحديث لوحة معلومات حالة الشحنات:', error);
    }
}

// دالة تحديث الدوائر التقدمية
function updateProgressCircle(circleId, percentage) {
    const circle = document.getElementById(circleId);
    if (!circle) return;
    
    const angle = (percentage / 100) * 360;
    const color = percentage >= 75 ? '#43e97b' : percentage >= 50 ? '#4facfe' : '#fa709a';
    
    circle.style.background = `conic-gradient(${color} 0deg, ${color} ${angle}deg, #e2e8f0 ${angle}deg, #e2e8f0 360deg)`;
}

// دالة تحديث أعداد المراجعة السريعة المحسنة
async function updateQuickReviewCounts() {
    try {
        // التحقق من الاتصال بالإنترنت
        if (!navigator.onLine) {
            console.info('ℹ️ لا يوجد اتصال بالإنترنت - تخطي تحديث الأعداد');
            return;
        }
        
        const { data: shipments, error } = await supabase
            .from('shipments')
            .select('customs_status, payment_status, arrival_date, status, updated_at');

        if (error) {
            console.warn('⚠️ خطأ في جلب البيانات:', error.message);
            return;
        }

        let pendingCustoms = 0;
        let pendingPayment = 0;
        let overdueShipments = 0;
        let arrivedLate = 0;
        let totalShipments = shipments ? shipments.length : 0;
        let completedShipments = 0;
        let totalProcessingTime = 0; // غير مستخدم حالياً لعدم توفر تاريخ الإفراج
        let processedCount = 0;

        let yesterdayCustoms = localStorage.getItem('yesterdayCustoms') || '0';
        let yesterdayPayment = localStorage.getItem('yesterdayPayment') || '0';
        let yesterdayOverdue = localStorage.getItem('yesterdayOverdue') || '0';
        let yesterdayLate = localStorage.getItem('yesterdayLate') || '0';

        const today = new Date();

        (shipments || []).forEach(shipment => {
            const customsStatus = (shipment.customs_status || '').toLowerCase();
            const paymentStatus = (shipment.payment_status || '').toLowerCase();
            const statusText = (shipment.status || '').toLowerCase();
            const arrivalDate = shipment.arrival_date ? new Date(shipment.arrival_date) : null;

            const isCustomsReleased = customsStatus.includes('تم الإفراج') || customsStatus.includes('released') || customsStatus.includes('completed');
            const isPaymentCompleted = paymentStatus.includes('مدفوع') || paymentStatus.includes('paid') || paymentStatus.includes('completed');

            if (!isCustomsReleased) pendingCustoms++;
            if (!isPaymentCompleted) pendingPayment++;

            if (isCustomsReleased && isPaymentCompleted) {
                completedShipments++;
            }

            if (arrivalDate) {
                const daysDiff = (today - arrivalDate) / (1000 * 60 * 60 * 24);
                if (daysDiff > 7 && (!isCustomsReleased || !isPaymentCompleted)) {
                    overdueShipments++;
                }
                if ((statusText.includes('تم الشحن') || statusText.includes('في انتظار تخليص الجمركي')) && arrivalDate < today) {
                    arrivedLate++;
                }
            }
        });
        
        // حساب مؤشرات الأداء
        const totalIssues = pendingCustoms + pendingPayment + overdueShipments + arrivedLate;
        const efficiencyScore = totalShipments > 0 ? Math.round((completedShipments / totalShipments) * 100) : 0;
        const completionRate = totalShipments > 0 ? Math.round(((totalShipments - totalIssues) / totalShipments) * 100) : 0;
        const avgResponseTime = processedCount > 0 ? Math.round(totalProcessingTime / processedCount) : 0;
        
        // حساب الاتجاهات
        const customsTrend = pendingCustoms - parseInt(yesterdayCustoms);
        const paymentTrend = pendingPayment - parseInt(yesterdayPayment);
        const overdueTrend = overdueShipments - parseInt(yesterdayOverdue);
        const lateTrend = arrivedLate - parseInt(yesterdayLate);
        
        // تحديث العدادات الأساسية
        updateElementText('pendingCustomsCount', pendingCustoms);
        updateElementText('pendingPaymentCount', pendingPayment);
        updateElementText('overdueShipmentsCount', overdueShipments);
        updateElementText('arrivedLateCount', arrivedLate);
        updateElementText('totalIssuesCount', totalIssues);
        
        // تحديث مؤشرات الأداء
        updateElementText('efficiencyScore', efficiencyScore + '%');
        updateElementText('completionRate', completionRate + '%');
        updateElementText('avgResponseTime', avgResponseTime + 'د');
        
        // تحديث الاتجاهات
        updateTrendIndicator('customsTrend', customsTrend);
        updateTrendIndicator('paymentTrend', paymentTrend);
        updateTrendIndicator('overdueTrend', overdueTrend, true); // عكسي لأن التقليل أفضل
        updateTrendIndicator('lateTrend', lateTrend, true); // عكسي لأن التقليل أفضل
        
        // تحديث مؤشرات التقدم الدائرية
        updateProgressRing('customs', totalShipments > 0 ? (pendingCustoms / totalShipments) * 100 : 0);
        updateProgressRing('payment', totalShipments > 0 ? (pendingPayment / totalShipments) * 100 : 0);
        updateProgressRing('overdue', totalShipments > 0 ? (overdueShipments / totalShipments) * 100 : 0);
        updateProgressRing('late', totalShipments > 0 ? (arrivedLate / totalShipments) * 100 : 0);
        
        // حفظ بيانات اليوم للمقارنة لاحقاً
        localStorage.setItem('yesterdayCustoms', String(pendingCustoms));
        localStorage.setItem('yesterdayPayment', String(pendingPayment));
        localStorage.setItem('yesterdayOverdue', String(overdueShipments));
        localStorage.setItem('yesterdayLate', String(arrivedLate));
        
        // إضافة تأثيرات بصرية للبطاقات حسب الحالة
        updateCardStates(pendingCustoms, pendingPayment, overdueShipments, arrivedLate);
        
        // فحص القيم الحرجة وإرسال التنبيهات
        checkCriticalValues(pendingCustoms, pendingPayment, overdueShipments, arrivedLate);
        
    } catch (error) {
        // عدم إظهار الخطأ إذا كان بسبب عدم الاتصال
        if (error.message && error.message.includes('Failed to fetch')) {
            console.info('ℹ️ لا يوجد اتصال بالإنترنت');
        } else {
            console.error('خطأ في تحديث أعداد المراجعة السريعة:', error);
        }
    }
}

// دالة مساعدة لتحديث النصوص
function updateElementText(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        // إضافة تأثير حركي للتحديث
        element.style.transform = 'scale(1.1)';
        element.style.transition = 'transform 0.3s ease';
        
        setTimeout(() => {
            element.textContent = value;
            element.style.transform = 'scale(1)';
        }, 150);
    }
}

// دالة تحديث مؤشرات الاتجاه
function updateTrendIndicator(trendId, value, reverse = false) {
    const element = document.getElementById(trendId);
    if (element) {
        const sign = value > 0 ? '+' : '';
        element.textContent = sign + value;
        
        // تحديد اللون حسب الاتجاه
        const iconElement = element.previousElementSibling;
        if (iconElement && iconElement.classList.contains('trend-icon')) {
            const isPositive = reverse ? value <= 0 : value >= 0;
            
            if (isPositive) {
                iconElement.classList.add('positive');
                iconElement.classList.remove('negative');
                iconElement.className = iconElement.className.replace('fa-arrow-up', '').replace('fa-arrow-down', '');
                iconElement.classList.add(reverse ? 'fa-arrow-down' : 'fa-arrow-up');
            } else {
                iconElement.classList.remove('positive');
                iconElement.classList.add('negative');
                iconElement.className = iconElement.className.replace('fa-arrow-up', '').replace('fa-arrow-down', '');
                iconElement.classList.add(reverse ? 'fa-arrow-up' : 'fa-arrow-down');
            }
        }
    }
}

// دالة تحديث مؤشرات التقدم الدائرية
function updateProgressRing(type, percentage) {
    const progressElement = document.querySelector(`.${type}-progress`);
    const textElement = document.querySelector(`[data-type="${type}"] .progress-text`);
    
    if (progressElement && textElement) {
        const circumference = 2 * Math.PI * 18; // راديوس 18
        const offset = circumference - (percentage / 100) * circumference;
        
        // تحديث مؤشر التقدم مع تأثير حركي
        progressElement.style.strokeDashoffset = offset;
        textElement.textContent = Math.round(percentage) + '%';
        
        // إضافة تأثير لوني حسب النسبة
        if (percentage > 75) {
            progressElement.style.filter = 'drop-shadow(0 0 5px currentColor)';
        } else {
            progressElement.style.filter = 'none';
        }
    }
}

// دالة تحديث حالات البطاقات
function updateCardStates(customs, payment, overdue, late) {
    const cards = [
        { element: document.querySelector('[data-type="customs"]'), count: customs },
        { element: document.querySelector('[data-type="payment"]'), count: payment },
        { element: document.querySelector('[data-type="overdue"]'), count: overdue },
        { element: document.querySelector('[data-type="late"]'), count: late }
    ];
    
    cards.forEach(card => {
        if (card.element) {
            // إضافة تأثير نبضة للبطاقات ذات القيم العالية
            if (card.count > 10) {
                card.element.classList.add('high-priority');
            } else if (card.count > 5) {
                card.element.classList.add('medium-priority');
            } else {
                card.element.classList.remove('high-priority', 'medium-priority');
            }
            
            // تحديث شدة النبضة حسب العدد
            const pulse = card.element.querySelector('.icon-pulse');
            if (pulse) {
                pulse.style.animationDuration = card.count > 10 ? '1s' : card.count > 5 ? '1.5s' : '2s';
            }
        }
    });
}

// إضافة تأثيرات CSS للحالات الجديدة
const dynamicStyles = `
    .review-card-premium.high-priority {
        animation: urgent-pulse 2s infinite;
        border-color: var(--classic-burgundy) !important;
        border-width: 3px !important;
    }
    
    .review-card-premium.medium-priority {
        animation: warning-pulse 3s infinite;
        border-color: var(--warning-color) !important;
    }
    
    @keyframes urgent-pulse {
        0%, 100% { box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08); }
        50% { box-shadow: 0 8px 25px rgba(128, 0, 32, 0.3), 0 0 20px rgba(128, 0, 32, 0.2); }
    }
    
    @keyframes warning-pulse {
        0%, 100% { box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08); }
        50% { box-shadow: 0 8px 25px rgba(244, 162, 97, 0.3), 0 0 15px rgba(244, 162, 97, 0.2); }
    }
`;

// إضافة الأنماط الديناميكية للصفحة
function addDynamicStyles() {
    if (!document.getElementById('dynamic-review-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'dynamic-review-styles';
        styleSheet.textContent = dynamicStyles;
        document.head.appendChild(styleSheet);
    }
}

// تشغيل الأنماط الديناميكية عند تحميل الصفحة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDynamicStyles);
} else {
    addDynamicStyles();
}

// التحديث التلقائي للمراجعة السريعة كل 30 ثانية
let quickReviewUpdateInterval;

function startQuickReviewAutoUpdate() {
    // تحديث فوري
    updateQuickReviewCounts();
    
    // إعداد التحديث التلقائي
    quickReviewUpdateInterval = setInterval(() => {
        updateQuickReviewCounts();
        
        // تحديث مؤشر الوقت الحقيقي
        const indicator = document.querySelector('.real-time-indicator');
        if (indicator) {
            indicator.style.animation = 'none';
            indicator.offsetHeight; // trigger reflow
            indicator.style.animation = 'pulse 0.5s ease-in-out';
        }
    }, 30000); // كل 30 ثانية
}

function stopQuickReviewAutoUpdate() {
    if (quickReviewUpdateInterval) {
        clearInterval(quickReviewUpdateInterval);
        quickReviewUpdateInterval = null;
    }
}

// بدء التحديث التلقائي عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    startQuickReviewAutoUpdate();
    
    // إيقاف التحديث عندما تصبح الصفحة غير مرئية
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopQuickReviewAutoUpdate();
        } else {
            startQuickReviewAutoUpdate();
        }
    });
});

// إضافة تحديث فوري عند التبديل بين التبويبات
function enhanceTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // إذا تم الانتقال لتبويب لوحة المعلومات
            if (button.dataset.tab === 'dashboard') {
                setTimeout(() => {
                    updateQuickReviewCounts();
                }, 100);
            }
        });
    });
}

// تحسين تجربة التفاعل مع البطاقات
function enhanceCardInteractions() {
    const cards = document.querySelectorAll('.review-card-premium');
    
    cards.forEach(card => {
        // إضافة تأثيرات الصوت (اختيارية)
        card.addEventListener('mouseenter', () => {
            // تشغيل الرسوم المتحركة الخاصة بالتمرير
            const iconPulse = card.querySelector('.icon-pulse');
            if (iconPulse) {
                iconPulse.style.animationDuration = '0.5s';
            }
        });
        
        card.addEventListener('mouseleave', () => {
            // استعادة الرسوم المتحركة العادية
            const iconPulse = card.querySelector('.icon-pulse');
            if (iconPulse) {
                iconPulse.style.animationDuration = '2s';
            }
        });
        
        // إضافة تأثير النقر
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.action-button')) {
                // تحديد نوع البطاقة وتشغيل الإجراء المناسب
                const cardType = card.dataset.type;
                switch(cardType) {
                    case 'customs':
                        showPendingCustomsContainers();
                        break;
                    case 'payment':
                        showPendingPaymentContainers();
                        break;
                    case 'overdue':
                        showOverdueShipments();
                        break;
                    case 'late':
                        showArrivedLateShipments();
                        break;
                }
            }
        });
    });
}

// تحسين مؤشرات الأداء مع رسوم بيانية صغيرة
function enhancePerformanceMetrics() {
    const metrics = document.querySelectorAll('.performance-metric');
    
    metrics.forEach(metric => {
        const value = metric.querySelector('.metric-value');
        if (value && value.textContent.includes('%')) {
            // إضافة شريط تقدم صغير
            const progressBar = document.createElement('div');
            progressBar.className = 'micro-progress-bar';
            progressBar.style.cssText = `
                height: 3px;
                background: rgba(0, 0, 0, 0.1);
                border-radius: 2px;
                overflow: hidden;
                margin-top: 4px;
            `;
            
            const progressFill = document.createElement('div');
            progressFill.className = 'micro-progress-fill';
            const percentage = parseInt(value.textContent);
            progressFill.style.cssText = `
                height: 100%;
                width: ${percentage}%;
                background: var(--classic-gold);
                border-radius: 2px;
                transition: width 1s ease-out;
            `;
            
            progressBar.appendChild(progressFill);
            metric.querySelector('.metric-content').appendChild(progressBar);
        }
    });
}

// إعداد جميع التحسينات
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        enhanceTabSwitching();
        enhanceCardInteractions();
        enhancePerformanceMetrics();
        
        // تهيئة التنقل المحمول
        initBottomNavigation();
        initSidebar();
        initTopTabs();
    }, 500);
});

// إضافة إشعارات للقيم العالية
function checkCriticalValues(customs, payment, overdue, late) {
    const criticalThreshold = 15;
    const warningThreshold = 10;
    
    const notifications = [];
    
    if (customs > criticalThreshold) {
        notifications.push({
            type: 'critical',
            message: `تحذير: ${customs} حاوية تحتاج إفراج جمركي عاجل!`,
            action: 'showPendingCustomsContainers'
        });
    } else if (customs > warningThreshold) {
        notifications.push({
            type: 'warning',
            message: `تنبيه: ${customs} حاوية تنتظر الإفراج الجمركي`,
            action: 'showPendingCustomsContainers'
        });
    }
    
    if (payment > criticalThreshold) {
        notifications.push({
            type: 'critical',
            message: `تحذير: ${payment} حاوية تحتاج دفع عاجل!`,
            action: 'showPendingPaymentContainers'
        });
    }
    
    if (overdue > 5) {
        notifications.push({
            type: 'critical',
            message: `تحذير: ${overdue} شحنة متأخرة تحتاج متابعة فورية!`,
            action: 'showOverdueShipments'
        });
    }
    
    // عرض الإشعارات (يمكن تخصيصها حسب الحاجة)
    notifications.forEach(notif => {
        if (notif.type === 'critical') {
            console.warn(notif.message);
            // يمكن إضافة نظام إشعارات مرئي هنا
        }
    });
}

// دالة عرض الحاويات التي تحتاج إفراج جمركي
function showPendingCustomsContainers() {
    showPendingContainersModal('customs', 'الحاويات التي تحتاج إفراج جمركي');
}

// دالة عرض الحاويات التي تحتاج دفع
function showPendingPaymentContainers() {
    showPendingContainersModal('payment', 'الحاويات التي تحتاج دفع قيمة');
}

// دالة عرض الشحنات المتأخرة
function showOverdueShipments() {
    showPendingContainersModal('overdue', 'الشحنات المتأخرة');
}

// دالة عرض الشحنات التي وصلت متأخرة
function showArrivedLateShipments() {
    showPendingContainersModal('arrived-late', 'الشحنات التي وصلت متأخرة');
}

// دالة عرض نافذة الحاويات المعلقة
function showPendingContainersModal(type, title) {
    // التبديل إلى تبويب لوحة المعلومات أولاً
    switchTab('dashboard');
    
    setTimeout(() => {
        const modal = document.getElementById('pendingContainersModal');
        const titleElement = document.getElementById('pendingContainersTitle');
        const totalElement = document.getElementById('pendingContainersTotal');
        const listElement = document.getElementById('pendingContainersList');
        
        titleElement.textContent = title;
        
        database.ref('shipments').once('value').then(snapshot => {
            const containers = [];
            const today = new Date();
        
        const containerPromises = [];
        
        snapshot.forEach(child => {
            const shipment = child.val();
            let shouldInclude = false;
            let statusClass = '';
            let statusText = '';
            
            if (type === 'customs' && !shipment.customsReleased) {
                shouldInclude = true;
                statusClass = 'customs-pending';
                statusText = 'تحتاج إفراج جمركي';
            } else if (type === 'payment' && !shipment.paymentCompleted) {
                shouldInclude = true;
                statusClass = 'payment-pending';
                statusText = 'تحتاج دفع';
            } else if (type === 'overdue' && shipment.arrivalDate) {
                const arrivalDate = new Date(shipment.arrivalDate);
                const daysDiff = (today - arrivalDate) / (1000 * 60 * 60 * 24);
                
                if (daysDiff > 7 && (!shipment.customsReleased || !shipment.paymentCompleted)) {
                    shouldInclude = true;
                    statusClass = 'overdue';
                    statusText = 'متأخرة';
                }
            } else if (type === 'arrived-late' && shipment.arrivalDate) {
                const arrivalDate = new Date(shipment.arrivalDate);
                
                // التحقق من أن الشحنة وصلت أو في الطريق وتاريخ الوصول أقل من اليوم
                if ((shipment.status === 'تم الوصول' || shipment.status === 'في الطريق') && arrivalDate < today) {
                    shouldInclude = true;
                    statusClass = 'arrived-late';
                    statusText = 'وصلت متأخرة';
                }
            }
            
            if (shouldInclude) {
                // جلب معلومات الطلب للحصول على الشركة الموردة
                const promise = Promise.resolve({
                            ...shipment,
                            statusClass,
                            statusText,
                    supplierName: shipment.supplierName || null
                });
                    
                containerPromises.push(promise);
            }
        });
        
        Promise.all(containerPromises).then(containers => {
        
        totalElement.textContent = `${containers.length} حاوية`;
        
        listElement.innerHTML = containers.map(container => {
            // تحديد أيقونات الحالة
            const customsIcon = container.customsReleased 
                ? '<i class="fas fa-check-circle customs-completed" title="تم الإفراج الجمركي"></i>'
                : '<i class="fas fa-exclamation-triangle customs-pending" title="في انتظار الإفراج الجمركي"></i>';
                
            const paymentIcon = container.paymentCompleted 
                ? '<i class="fas fa-dollar-sign payment-completed" title="تم الدفع"></i>'
                : '<i class="fas fa-credit-card payment-pending" title="في انتظار الدفع"></i>';

            return `
            <div class="container-item ${container.statusClass}" onclick="viewShipmentDetails('${container.shipmentNumber}')">
                <div class="container-header">
                    <div class="container-info">
                        <div class="container-number">${container.containerNumber || container.shipmentNumber}</div>
                        <div class="container-status-icons">
                            ${customsIcon}
                            ${paymentIcon}
                        </div>
                    </div>
                    <div class="container-status ${type}">${container.statusText}</div>
                </div>
                <div class="container-details">
                    <div class="container-detail">
                        <span>نوع البضاعة:</span>
                        <strong>${container.goodsType}</strong>
                    </div>
                    <div class="container-detail">
                        <span>الشركة الموردة:</span>
                        <strong>${container.supplier || container.supplierName || 'غير محدد'}</strong>
                    </div>
                    <div class="container-detail">
                        <span>شركة الشحن:</span>
                        <strong>${(() => {
                            if (!container.shippingCompany) return 'غير محدد';
                            const company = findClearanceCompanyById(container.shippingCompany);
                            return company ? company.name : container.shippingCompany;
                        })()}</strong>
                    </div>
                    <div class="container-detail">
                        <span>تاريخ الوصول:</span>
                        <strong>${formatDate(container.arrivalDate)}</strong>
                    </div>
                    <div class="container-detail">
                        <span>الحالة:</span>
                        <strong>${container.status}</strong>
                    </div>
                </div>
            </div>
            `;
        }).join('');
        
        if (containers.length === 0) {
            listElement.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 16px; color: #43e97b;"></i>
                    <p style="font-size: 1.1rem;">لا توجد حاويات ${type === 'customs' ? 'تحتاج إفراج جمركي' : type === 'payment' ? 'تحتاج دفع' : type === 'overdue' ? 'متأخرة' : 'وصلت متأخرة'}</p>
                </div>
            `;
        }
        
            modal.style.display = 'block';
            
            }).catch(error => {
                console.error('خطأ في تحميل معلومات الطلبات:', error);
            });
            
        }).catch(error => {
            console.error('خطأ في تحميل الحاويات المعلقة:', error);
        });
    }, 100);
}

// دالة إغلاق نافذة الحاويات المعلقة
function closePendingContainersModal() {
    document.getElementById('pendingContainersModal').style.display = 'none';
}

// دالة تحديث قائمة الشحنات
function updateShipmentList(listId, shipments) {
    const listElement = document.getElementById(listId);
    if (!listElement) return;
    
    listElement.innerHTML = '';
    
    if (shipments.length === 0) {
        listElement.innerHTML = '<div class="no-shipments">لا توجد شحنات</div>';
        return;
    }
    
    shipments.forEach(shipment => {
        const shipmentElement = createShipmentStatusElement(shipment);
        listElement.appendChild(shipmentElement);
    });
}

// دالة إنشاء عنصر الشحنة في القائمة
function createShipmentStatusElement(shipment) {
    const div = document.createElement('div');
    div.className = 'shipment-status-item';
    div.onclick = () => viewShipmentDetails(shipment.shipmentNumber);
    
    const arrivalDate = formatDate(shipment.arrivalDate);
    const customsDate = shipment.customsReleaseDate ? formatDate(shipment.customsReleaseDate) : 'غير محدد';
    const paymentDate = shipment.paymentDate ? formatDate(shipment.paymentDate) : 'غير محدد';
    
    div.innerHTML = `
        <div class="shipment-status-header">
            <span class="shipment-number">${shipment.shipmentNumber}</span>
            <span class="shipment-date">${arrivalDate}</span>
        </div>
        <div class="shipment-details">
            <strong>نوع البضاعة:</strong> ${shipment.goodsType}<br>
            <strong>الكمية:</strong> ${shipment.quantity} ${shipment.unit}<br>
            <strong>شركة الشحن:</strong> ${shipment.shippingCompany}<br>
            <strong>تاريخ الإفراج:</strong> ${customsDate}<br>
            <strong>تاريخ الدفع:</strong> ${paymentDate}
        </div>
    `;
    
    return div;
}

// دالة إعداد فلاتر الحالة
function setupStatusFilters() {
    const filterButtons = document.querySelectorAll('.status-filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // إزالة الفئة النشطة من جميع الأزرار
            filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // إضافة الفئة النشطة للزر المحدد
            button.classList.add('active');
            
            // تطبيق الفلتر
            const filter = button.dataset.filter;
            applyStatusFilter(filter);
        });
    });
}

// دالة تطبيق فلتر الحالة
function applyStatusFilter(filter) {
    const groups = document.querySelectorAll('.status-group');
    
    groups.forEach(group => {
        if (filter === 'all') {
            group.style.display = 'block';
        } else if (filter === 'customs') {
            const isCustomsGroup = group.id.includes('customs');
            group.style.display = isCustomsGroup ? 'block' : 'none';
        } else if (filter === 'payment') {
            const isPaymentGroup = group.id.includes('payment');
            group.style.display = isPaymentGroup ? 'block' : 'none';
        }
    });
}

// دالة إضافة مستمعي أحداث لحقول الحالة
function setupStatusFieldsListeners() {
    const customsReleasedCheckbox = document.getElementById('customsReleased');
    const customsReleaseDateField = document.getElementById('customsReleaseDate');
    const paymentCompletedCheckbox = document.getElementById('paymentCompleted');
    const paymentDateField = document.getElementById('paymentDate');
    
    if (customsReleasedCheckbox) {
        customsReleasedCheckbox.addEventListener('change', function() {
            customsReleaseDateField.disabled = !this.checked;
            if (this.checked && !customsReleaseDateField.value) {
                customsReleaseDateField.value = new Date().toISOString().split('T')[0];
            }
        });
    }
    
    if (paymentCompletedCheckbox) {
        paymentCompletedCheckbox.addEventListener('change', function() {
            paymentDateField.disabled = !this.checked;
            if (this.checked && !paymentDateField.value) {
                paymentDateField.value = new Date().toISOString().split('T')[0];
            }
        });
    }
}

// إضافة مستمعي أحداث الحقول عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    setupStatusFieldsListeners();
});

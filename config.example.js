// ========================================
// ملف التكوين لـ Supabase
// ========================================
// 
// تعليمات:
// 1. انسخ هذا الملف وغيّر اسمه إلى config.js
// 2. ضع القيم الصحيحة من لوحة تحكم Supabase
// 3. لا تشارك هذا الملف مع أحد!
//
// ========================================

// تهيئة Supabase
const SUPABASE_URL = 'https://your-project-id.supabase.co'; 
// 👆 احصل عليه من: Settings → API → Project URL

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdC1pZCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjg0MDAwMDAwLCJleHAiOjE5OTk1ODU2MDB9.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
// 👆 احصل عليه من: Settings → API → Project API keys → anon public

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// خطوات الحصول على البيانات:
// ========================================
//
// 1. سجل الدخول إلى https://supabase.com
// 2. اختر مشروعك
// 3. اذهب إلى Settings (أيقونة الترس)
// 4. اختر API من القائمة اليسرى
// 5. انسخ:
//    - Project URL
//    - anon public key
//
// ========================================


// ===== تحسينات UX/UI التفاعلية =====

// ===== إضافة تأثير Ripple للأزرار =====
function addRippleEffect() {
    const buttons = document.querySelectorAll('.primary-btn, .secondary-btn, button[type="submit"], .btn, .filter-tab, .nav-item');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // إزالة التأثيرات القديمة
            const oldRipples = this.querySelectorAll('.ripple');
            oldRipples.forEach(ripple => ripple.remove());
            
            // إنشاء تأثير جديد
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            
            // حساب الموقع
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            
            this.appendChild(ripple);
            
            // إزالة التأثير بعد انتهائه
            setTimeout(() => ripple.remove(), 600);
        });
    });
}

// ===== إضافة حالة تحميل للأزرار =====
function setButtonLoading(button, loading = true) {
    if (loading) {
        button.classList.add('btn-loading');
        button.setAttribute('disabled', 'disabled');
        button.dataset.originalText = button.textContent;
    } else {
        button.classList.remove('btn-loading');
        button.removeAttribute('disabled');
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
        }
    }
}

// ===== إضافة تأثير Skeleton Loading =====
function showSkeletonLoading(container, count = 3) {
    container.innerHTML = '';
    
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'shipment-card skeleton-card';
        skeleton.innerHTML = `
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text" style="width: 60%;"></div>
        `;
        container.appendChild(skeleton);
    }
}

// ===== إضافة تأثير Smooth Scroll =====
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            e.preventDefault();
            const target = document.querySelector(href);
            
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ===== إضافة تأثير Lazy Loading للصور =====
function initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.add('loaded');
                observer.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// ===== إضافة تأثير Parallax للعناصر =====
function initParallax() {
    const parallaxElements = document.querySelectorAll('[data-parallax]');
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        
        parallaxElements.forEach(element => {
            const speed = element.dataset.parallax || 0.5;
            const yPos = -(scrolled * speed);
            element.style.transform = `translateY(${yPos}px)`;
        });
    });
}

// ===== إضافة تأثير Fade In عند الظهور =====
function initFadeInOnScroll() {
    const fadeElements = document.querySelectorAll('.fade-in-on-scroll');
    
    const fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });
    
    fadeElements.forEach(element => fadeObserver.observe(element));
}

// ===== إضافة Tooltips تلقائية =====
function initTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    
    tooltipElements.forEach(element => {
        element.classList.add('tooltip');
    });
}

// ===== إضافة تأثير Shake للأخطاء =====
function shakeElement(element) {
    element.style.animation = 'shake 0.5s';
    setTimeout(() => {
        element.style.animation = '';
    }, 500);
}

// إضافة keyframe للـ shake
const shakeKeyframes = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
    20%, 40%, 60%, 80% { transform: translateX(10px); }
}
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = shakeKeyframes;
document.head.appendChild(styleSheet);

// ===== إضافة تأثير Confetti للنجاح =====
function showConfetti() {
    const colors = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336'];
    const confettiCount = 50;
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
            position: fixed;
            width: 10px;
            height: 10px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            top: -10px;
            left: ${Math.random() * 100}%;
            opacity: ${Math.random()};
            transform: rotate(${Math.random() * 360}deg);
            animation: confettiFall ${2 + Math.random() * 3}s linear forwards;
            pointer-events: none;
            z-index: 10000;
        `;
        document.body.appendChild(confetti);
        
        setTimeout(() => confetti.remove(), 5000);
    }
}

// إضافة keyframe للـ confetti
const confettiKeyframes = `
@keyframes confettiFall {
    to {
        transform: translateY(100vh) rotate(${Math.random() * 720}deg);
        opacity: 0;
    }
}
`;

const confettiStyleSheet = document.createElement('style');
confettiStyleSheet.textContent = confettiKeyframes;
document.head.appendChild(confettiStyleSheet);

// ===== إضافة Progress Bar للتحميل =====
function showProgressBar() {
    let progressBar = document.getElementById('global-progress-bar');
    
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'global-progress-bar';
        progressBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0;
            height: 3px;
            background: linear-gradient(90deg, #2196F3, #4CAF50);
            transition: width 0.3s ease;
            z-index: 10001;
        `;
        document.body.appendChild(progressBar);
    }
    
    progressBar.style.width = '0%';
    progressBar.style.display = 'block';
    
    return {
        set: (percent) => {
            progressBar.style.width = Math.min(percent, 100) + '%';
        },
        complete: () => {
            progressBar.style.width = '100%';
            setTimeout(() => {
                progressBar.style.display = 'none';
            }, 300);
        }
    };
}

// ===== إضافة تأثير Typing للنصوص =====
function typeText(element, text, speed = 50) {
    element.textContent = '';
    let i = 0;
    
    const typeInterval = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(typeInterval);
        }
    }, speed);
}

// ===== إضافة تأثير Count Up للأرقام =====
function countUp(element, target, duration = 1000) {
    const start = parseInt(element.textContent) || 0;
    const increment = (target - start) / (duration / 16);
    let current = start;
    
    const counter = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
            element.textContent = target;
            clearInterval(counter);
        } else {
            element.textContent = Math.round(current);
        }
    }, 16);
}

// ===== إضافة تأثير Pulse للعناصر المهمة =====
function pulseElement(element, duration = 1000) {
    element.style.animation = `pulse ${duration}ms ease-in-out`;
    setTimeout(() => {
        element.style.animation = '';
    }, duration);
}

// ===== إضافة تأثير Glow للعناصر النشطة =====
function glowElement(element, color = '#2196F3') {
    element.style.boxShadow = `0 0 20px ${color}`;
    element.style.transition = 'box-shadow 0.3s ease';
    
    setTimeout(() => {
        element.style.boxShadow = '';
    }, 2000);
}

// ===== إضافة Drag and Drop للعناصر =====
function initDragAndDrop(container) {
    const draggables = container.querySelectorAll('[draggable="true"]');
    
    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', (e) => {
            draggable.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        
        draggable.addEventListener('dragend', () => {
            draggable.classList.add('dragging');
        });
    });
    
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const dragging = document.querySelector('.dragging');
        
        if (afterElement == null) {
            container.appendChild(dragging);
        } else {
            container.insertBefore(dragging, afterElement);
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('[draggable="true"]:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ===== تهيئة جميع التحسينات عند تحميل الصفحة =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎨 تهيئة تحسينات UX/UI...');
    
    // تطبيق التأثيرات
    addRippleEffect();
    initSmoothScroll();
    initLazyLoading();
    initFadeInOnScroll();
    initTooltips();
    
    console.log('✅ تم تطبيق تحسينات UX/UI بنجاح');
});

// ===== تصدير الدوال للاستخدام العام =====
window.UXImprovements = {
    setButtonLoading,
    showSkeletonLoading,
    shakeElement,
    showConfetti,
    showProgressBar,
    typeText,
    countUp,
    pulseElement,
    glowElement,
    initDragAndDrop
};

console.log('✅ تم تحميل ملف تحسينات UX/UI');

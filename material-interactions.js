/* ============================================
   Material Design Interactions & Effects
   تفاعلات وتأثيرات Material Design
   ============================================ */

// ===== Ripple Effect =====
function createRipple(event) {
  const button = event.currentTarget;
  
  // إزالة أي ripples قديمة
  const existingRipple = button.querySelector('.ripple');
  if (existingRipple) {
    existingRipple.remove();
  }
  
  const circle = document.createElement('span');
  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;
  
  const rect = button.getBoundingClientRect();
  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${event.clientX - rect.left - radius}px`;
  circle.style.top = `${event.clientY - rect.top - radius}px`;
  circle.classList.add('ripple');
  
  button.appendChild(circle);
  
  // إزالة الـ ripple بعد انتهاء الأنيميشن
  setTimeout(() => circle.remove(), 600);
}

// إضافة Ripple Effect لجميع الأزرار
function initRippleEffect() {
  const buttons = document.querySelectorAll(`
    button:not(.no-ripple),
    .primary-btn,
    .secondary-btn,
    .text-btn,
    .action-btn,
    .filter-btn,
    .filter-tab,
    .nav-item,
    .sidebar-btn,
    .hamburger-menu,
    .notifications-btn,
    .shipment-card,
    .shipment-list-card
  `);
  
  buttons.forEach(button => {
    // إزالة المستمع القديم إن وُجد
    button.removeEventListener('click', createRipple);
    // إضافة المستمع الجديد
    button.addEventListener('click', createRipple);
  });
}

// ===== App Bar Scroll Effect =====
function initAppBarScrollEffect() {
  const appBar = document.querySelector('.mobile-header');
  if (!appBar) return;
  
  let lastScroll = 0;
  
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 10) {
      appBar.classList.add('scrolled');
    } else {
      appBar.classList.remove('scrolled');
    }
    
    // إخفاء/إظهار App Bar عند التمرير
    if (currentScroll > lastScroll && currentScroll > 100) {
      appBar.style.transform = 'translateY(-100%)';
    } else {
      appBar.style.transform = 'translateY(0)';
    }
    
    lastScroll = currentScroll;
  }, { passive: true });
}

// ===== Sidebar Toggle =====
function initSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const hamburger = document.querySelector('.hamburger-menu');
  const closeSidebar = document.querySelector('.close-sidebar');
  
  if (!sidebar || !overlay) return;
  
  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  
  function closeSidebarFunc() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }
  
  if (hamburger) {
    hamburger.addEventListener('click', openSidebar);
  }
  
  if (closeSidebar) {
    closeSidebar.addEventListener('click', closeSidebarFunc);
  }
  
  if (overlay) {
    overlay.addEventListener('click', closeSidebarFunc);
  }
  
  // إضافة دعم ESC للإغلاق
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebarFunc();
    }
  });
}

// ===== Bottom Navigation Active State =====
function initBottomNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // تحديث عنوان الصفحة
      const pageTitle = document.querySelector('.page-title');
      const itemText = item.querySelector('span')?.textContent;
      if (pageTitle && itemText) {
        pageTitle.textContent = itemText;
      }
    });
  });
}

// ===== Snackbar Notification =====
function showSnackbar(message, action = null, duration = 3000) {
  // إزالة أي snackbar موجود
  const existingSnackbar = document.querySelector('.snackbar');
  if (existingSnackbar) {
    existingSnackbar.remove();
  }
  
  const snackbar = document.createElement('div');
  snackbar.className = 'snackbar';
  
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  snackbar.appendChild(messageSpan);
  
  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'snackbar-action';
    actionBtn.textContent = action.text;
    actionBtn.onclick = action.onClick;
    snackbar.appendChild(actionBtn);
  }
  
  document.body.appendChild(snackbar);
  
  // إظهار الـ snackbar
  requestAnimationFrame(() => {
    snackbar.classList.add('show');
  });
  
  // إخفاء وإزالة الـ snackbar
  if (duration > 0) {
    setTimeout(() => {
      snackbar.classList.remove('show');
      setTimeout(() => snackbar.remove(), 300);
    }, duration);
  }
  
  return snackbar;
}

// ===== Touch Feedback Enhancement =====
function initTouchFeedback() {
  const touchableElements = document.querySelectorAll(`
    .shipment-card,
    .shipment-list-card,
    .stat-card-mobile,
    .filter-tab,
    .timeline-card
  `);
  
  touchableElements.forEach(element => {
    element.addEventListener('touchstart', () => {
      element.style.opacity = '0.7';
    }, { passive: true });
    
    element.addEventListener('touchend', () => {
      element.style.opacity = '';
    }, { passive: true });
    
    element.addEventListener('touchcancel', () => {
      element.style.opacity = '';
    }, { passive: true });
  });
}

// ===== Pull to Refresh =====
function initPullToRefresh() {
  let startY = 0;
  let currentY = 0;
  let pulling = false;
  const threshold = 80;
  
  const refreshIndicator = document.createElement('div');
  refreshIndicator.style.cssText = `
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%) translateY(-100%);
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--md-surface);
    border-radius: 50%;
    box-shadow: var(--elevation-2);
    transition: transform 0.3s;
    z-index: 999;
  `;
  refreshIndicator.innerHTML = '<i class="fas fa-sync-alt"></i>';
  document.body.appendChild(refreshIndicator);
  
  document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });
  
  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    
    if (diff > 0 && diff < threshold * 2) {
      refreshIndicator.style.transform = `translateX(-50%) translateY(${diff - 40}px)`;
      
      if (diff > threshold) {
        refreshIndicator.style.transform = `translateX(-50%) translateY(${diff - 40}px) rotate(180deg)`;
      }
    }
  }, { passive: true });
  
  document.addEventListener('touchend', () => {
    if (!pulling) return;
    
    const diff = currentY - startY;
    
    if (diff > threshold) {
      // تنفيذ التحديث
      refreshIndicator.style.transform = `translateX(-50%) translateY(60px)`;
      refreshIndicator.querySelector('i').style.animation = 'spin 1s linear infinite';
      
      setTimeout(() => {
        refreshIndicator.style.transform = `translateX(-50%) translateY(-100%)`;
        refreshIndicator.querySelector('i').style.animation = '';
        showSnackbar('تم التحديث بنجاح! ✓');
        
        // يمكنك استدعاء دالة التحديث الفعلية هنا
        if (typeof refreshData === 'function') {
          refreshData();
        }
      }, 1500);
    } else {
      refreshIndicator.style.transform = `translateX(-50%) translateY(-100%)`;
    }
    
    pulling = false;
    startY = 0;
    currentY = 0;
  });
}

// ===== Skeleton Loading =====
function showSkeletonLoading(container) {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-container';
  skeleton.innerHTML = `
    <div class="skeleton" style="height: 80px; margin-bottom: 12px; border-radius: 12px;"></div>
    <div class="skeleton" style="height: 80px; margin-bottom: 12px; border-radius: 12px;"></div>
    <div class="skeleton" style="height: 80px; margin-bottom: 12px; border-radius: 12px;"></div>
  `;
  
  container.appendChild(skeleton);
  return skeleton;
}

// ===== Smooth Scroll to Top =====
function initScrollToTop() {
  const fab = document.createElement('button');
  fab.className = 'scroll-to-top-fab';
  fab.innerHTML = '<i class="fas fa-arrow-up"></i>';
  fab.style.cssText = `
    position: fixed;
    bottom: calc(var(--bottom-nav-height) + 80px);
    left: 24px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--md-primary);
    color: var(--md-on-primary);
    border: none;
    box-shadow: var(--elevation-3);
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    z-index: 99;
    transition: all 0.3s;
  `;
  
  document.body.appendChild(fab);
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      fab.style.display = 'flex';
    } else {
      fab.style.display = 'none';
    }
  }, { passive: true });
  
  fab.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

// ===== Input Animation (Floating Label) =====
function initInputAnimations() {
  const inputs = document.querySelectorAll('input, textarea, select');
  
  inputs.forEach(input => {
    // التحقق عند التحميل
    if (input.value) {
      input.classList.add('filled');
    }
    
    input.addEventListener('focus', () => {
      input.classList.add('focused');
    });
    
    input.addEventListener('blur', () => {
      input.classList.remove('focused');
      if (input.value) {
        input.classList.add('filled');
      } else {
        input.classList.remove('filled');
      }
    });
  });
}

// ===== Card Click Animation =====
function initCardAnimations() {
  const cards = document.querySelectorAll('.shipment-card, .shipment-list-card, .stat-card-mobile');
  
  cards.forEach(card => {
    card.addEventListener('mousedown', () => {
      card.style.transform = 'scale(0.98)';
    });
    
    card.addEventListener('mouseup', () => {
      card.style.transform = '';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

// ===== FAB Extended/Collapsed State =====
function initFABScrollBehavior() {
  const fab = document.querySelector('.add-shipment-btn');
  if (!fab) return;
  
  let lastScroll = 0;
  
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > lastScroll && currentScroll > 100) {
      // Scrolling down - collapse FAB
      fab.style.transform = 'scale(0.8)';
      fab.style.opacity = '0.8';
    } else {
      // Scrolling up - expand FAB
      fab.style.transform = 'scale(1)';
      fab.style.opacity = '1';
    }
    
    lastScroll = currentScroll;
  }, { passive: true });
}

// ===== Initialize All Material Interactions =====
function initMaterialDesign() {
  console.log('🎨 Initializing Material Design interactions...');
  
  // تهيئة جميع التفاعلات
  initRippleEffect();
  initAppBarScrollEffect();
  initSidebarToggle();
  initBottomNavigation();
  initTouchFeedback();
  initPullToRefresh();
  initScrollToTop();
  initInputAnimations();
  initCardAnimations();
  initFABScrollBehavior();
  
  console.log('✅ Material Design initialized successfully!');
}

// ===== تصدير الدوال للاستخدام الخارجي =====
if (typeof window !== 'undefined') {
  window.MaterialDesign = {
    init: initMaterialDesign,
    showSnackbar: showSnackbar,
    createRipple: createRipple,
    showSkeletonLoading: showSkeletonLoading
  };
}

// ===== Auto Initialize on DOM Ready =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMaterialDesign);
} else {
  initMaterialDesign();
}

// Re-initialize ripple effect when new elements are added
const observer = new MutationObserver(() => {
  initRippleEffect();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

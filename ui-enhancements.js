/**
 * UI/UX Enhancements for Material Design
 * تحسينات واجهة المستخدم وتجربة الاستخدام
 */

// ===== Loading Overlay =====
function showLoadingOverlay(message = 'جاري التحميل...') {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loadingOverlay';
  overlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <p style="color: var(--md-on-surface); margin: 0;">${message}</p>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.remove();
  }
}

// ===== Toast Notifications =====
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  
  const classes = {
    success: 'success-message',
    error: 'error-message',
    warning: 'warning-message',
    info: 'success-message'
  };
  
  toast.className = classes[type] || 'success-message';
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    min-width: 280px;
    max-width: 90%;
  `;
  
  toast.innerHTML = `
    <span style="font-size: 20px; font-weight: bold;">${icons[type]}</span>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== Empty State =====
function showEmptyState(container, icon, title, description, actionButton = null) {
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state animate-fadeIn';
  
  let buttonHTML = '';
  if (actionButton) {
    buttonHTML = `
      <button class="primary-btn" onclick="${actionButton.onClick}" style="margin-top: 16px;">
        ${actionButton.text}
      </button>
    `;
  }
  
  emptyState.innerHTML = `
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-title">${title}</div>
    <div class="empty-state-description">${description}</div>
    ${buttonHTML}
  `;
  
  if (typeof container === 'string') {
    container = document.querySelector(container);
  }
  
  if (container) {
    container.innerHTML = '';
    container.appendChild(emptyState);
  }
}

// ===== Skeleton Loading =====
function createSkeleton(type = 'card', count = 3) {
  const skeletons = [];
  
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton';
    
    if (type === 'card') {
      skeleton.style.cssText = `
        height: 120px;
        margin-bottom: 16px;
        border-radius: 16px;
      `;
    } else if (type === 'text') {
      skeleton.style.cssText = `
        height: 16px;
        margin-bottom: 8px;
        border-radius: 4px;
        width: ${Math.random() * 40 + 60}%;
      `;
    }
    
    skeletons.push(skeleton);
  }
  
  return skeletons;
}

function showSkeletonLoading(container, type = 'card', count = 3) {
  if (typeof container === 'string') {
    container = document.querySelector(container);
  }
  
  if (container) {
    container.innerHTML = '';
    const skeletons = createSkeleton(type, count);
    skeletons.forEach(skeleton => container.appendChild(skeleton));
  }
}

// ===== Smooth Scroll =====
function smoothScrollTo(element, offset = 0) {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  
  if (element) {
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;
    
    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }
}

// ===== Stagger Animation for Cards =====
function applyStaggerAnimation(selector = '.shipment-card') {
  const cards = document.querySelectorAll(selector);
  cards.forEach((card, index) => {
    card.classList.add('stagger-item');
    card.style.animationDelay = `${index * 0.05}s`;
  });
}

// ===== Confirm Dialog =====
function showConfirmDialog(title, message, onConfirm, onCancel = null) {
  const dialog = document.createElement('div');
  dialog.className = 'loading-overlay';
  dialog.style.zIndex = '10001';
  
  dialog.innerHTML = `
    <div class="loading-content animate-scaleIn" style="max-width: 400px; padding: 24px;">
      <h3 style="margin: 0 0 12px 0; color: var(--md-on-surface); font-size: 20px;">${title}</h3>
      <p style="margin: 0 0 24px 0; color: var(--md-on-surface-variant); line-height: 1.5;">${message}</p>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="secondary-btn" id="cancelBtn" style="padding: 10px 20px;">إلغاء</button>
        <button class="primary-btn" id="confirmBtn" style="padding: 10px 20px;">تأكيد</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  const confirmBtn = dialog.querySelector('#confirmBtn');
  const cancelBtn = dialog.querySelector('#cancelBtn');
  
  confirmBtn.onclick = () => {
    dialog.remove();
    if (onConfirm) onConfirm();
  };
  
  cancelBtn.onclick = () => {
    dialog.remove();
    if (onCancel) onCancel();
  };
  
  // Close on overlay click
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      dialog.remove();
      if (onCancel) onCancel();
    }
  };
}

// ===== Form Validation Feedback =====
function showFieldError(inputElement, message) {
  if (typeof inputElement === 'string') {
    inputElement = document.querySelector(inputElement);
  }
  
  if (!inputElement) return;
  
  // Remove existing error
  const existingError = inputElement.parentElement.querySelector('.field-error');
  if (existingError) existingError.remove();
  
  // Add error message
  const errorDiv = document.createElement('div');
  errorDiv.className = 'field-error';
  errorDiv.style.cssText = `
    color: var(--md-error);
    font-size: 12px;
    margin-top: 4px;
    animation: slideIn 0.2s ease-out;
  `;
  errorDiv.textContent = message;
  
  inputElement.parentElement.appendChild(errorDiv);
  inputElement.style.borderBottomColor = 'var(--md-error)';
}

function clearFieldError(inputElement) {
  if (typeof inputElement === 'string') {
    inputElement = document.querySelector(inputElement);
  }
  
  if (!inputElement) return;
  
  const errorDiv = inputElement.parentElement.querySelector('.field-error');
  if (errorDiv) errorDiv.remove();
  
  inputElement.style.borderBottomColor = '';
}

// ===== Badge Notifications =====
function updateBadge(element, count) {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  
  if (!element) return;
  
  let badge = element.querySelector('.badge');
  
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.cssText = `
        position: absolute;
        top: -4px;
        left: -4px;
        background: var(--md-error);
        color: white;
        border-radius: 10px;
        padding: 2px 6px;
        font-size: 11px;
        font-weight: 600;
        min-width: 18px;
        text-align: center;
        box-shadow: var(--elevation-2);
      `;
      element.style.position = 'relative';
      element.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.add('animate-scaleIn');
  } else if (badge) {
    badge.remove();
  }
}

// ===== Auto-init on page load =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎨 UI Enhancements loaded successfully!');
  
  // Apply stagger animation to existing cards
  setTimeout(() => {
    applyStaggerAnimation('.shipment-card');
    applyStaggerAnimation('.shipment-list-card');
  }, 100);
  
  // Add smooth scroll to all anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        smoothScrollTo(target, 80);
      }
    });
  });
});

// Export functions for global use
window.UIEnhancements = {
  showLoadingOverlay,
  hideLoadingOverlay,
  showToast,
  showEmptyState,
  showSkeletonLoading,
  smoothScrollTo,
  applyStaggerAnimation,
  showConfirmDialog,
  showFieldError,
  clearFieldError,
  updateBadge
};

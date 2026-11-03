/* ============================================================
   china-tsf — main.js
   منطق الصفحة الرئيسية
   ============================================================ */

const API_BASE = '/api';
const CART_KEY = 'tsf_cart';

// ---------- State ----------
const state = {
  products: [],
  filtered: [],
  selectedBrand: null,   // null = كل الماركات
  selectedCategory: null,
  brands: [],
  categories: []
};

// ---------- DOM refs ----------
const $ = (sel) => document.querySelector(sel);
const productsGrid = $('#productsGrid');
const brandButtons = $('#brandButtons');
const categoryChips = $('#categoryChips');
const loadingState = $('#loadingState');
const emptyState = $('#emptyState');
const cartBadge = $('#cartBadge');
const shamCashModal = $('#shamCashModal');

// ============================================================
// 1) CART (localStorage)
// ============================================================
function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}
function updateCartBadge() {
  const cart = loadCart();
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  cartBadge.textContent = totalQty;
  cartBadge.style.display = totalQty > 0 ? 'inline-block' : 'none';
}
function addToCart(product, quantity) {
  const cart = loadCart();
  
  // تحويل الـ id إلى رقم لضمان المقارنة الصحيحة
  const productId = Number(product.id);
  
  // البحث عن المنتج في السلة
  const existing = cart.find(i => Number(i.id) === productId);
  
  if (existing) {
    // إذا كان موجوداً، نزيد الكمية فقط
    existing.quantity = Math.min(existing.quantity + quantity, product.stock);
  } else {
    // إذا لم يكن موجوداً، نضيفه كمنتج جديد مع بياناته الصحيحة
    cart.push({
      id: productId,
      name: product.name,
      price: Number(product.price),
      image_url: product.image_url || '',
      stock: Number(product.stock),
      quantity: quantity
    });
  }
  
  saveCart(cart);
  showToast(`✅ تمت إضافة ${quantity} × ${product.name} للسلة`);
}

// ============================================================
// 2) TOAST (إشعار بسيط)
// ============================================================
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position:fixed; bottom:100px; left:50%; transform:translateX(-50%);
    background:#0A2472; color:#fff; padding:12px 24px; border-radius:8px;
    z-index:999; font-weight:600; box-shadow:0 4px 12px rgba(0,0,0,0.3);
    direction:rtl; font-size:0.9rem; max-width:90vw; text-align:center;
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ============================================================
// 3) FETCH PRODUCTS
// ============================================================
async function fetchProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'فشل الجلب');
    state.products = data.products || [];
    state.filtered = [...state.products];

    // استخراج الماركات والأقسام
    state.brands = [...new Set(state.products.map(p => p.brand).filter(Boolean))];
    state.categories = [...new Set(state.products.map(p => p.category).filter(Boolean))];

    renderBrands();
    renderCategories();
    renderProducts();

    loadingState.classList.add('hidden');
  } catch (err) {
    loadingState.textContent = '❌ حدث خطأ في تحميل المنتجات: ' + err.message;
    console.error(err);
  }
}

// ============================================================
// 4) RENDER BRANDS
// ============================================================
function renderBrands() {
  brandButtons.innerHTML = '';
  
  // 1. إضافة زر "جميع الماركات" في البداية
  const allBtn = document.createElement('button');
  allBtn.className = 'btn-primary';
  allBtn.id = 'showAllBtn';
  allBtn.style.flexShrink = '0';
  allBtn.innerHTML = 'جميع الماركات';
  allBtn.onclick = () => {
    state.selectedBrand = null;
    state.selectedCategory = null;
    renderBrands();
    renderCategories();
    applyFilters();
  };
  brandButtons.appendChild(allBtn);

  // 2. إضافة باقي أزرار الماركات
  state.brands.forEach(brand => {
    const chip = document.createElement('button');
    chip.className = 'brand-chip' + (state.selectedBrand === brand ? ' active' : '');
    chip.textContent = brand;
    chip.onclick = () => {
      state.selectedBrand = brand;
      applyFilters();
      renderBrands();
    };
    brandButtons.appendChild(chip);
  });
}

// ============================================================
// 5) RENDER CATEGORIES
// ============================================================
function renderCategories() {
  categoryChips.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.className = 'category-chip' + (state.selectedCategory === null ? ' active' : '');
  allChip.textContent = 'الكل';
  allChip.onclick = () => { state.selectedCategory = null; applyFilters(); renderCategories(); };
  categoryChips.appendChild(allChip);

  state.categories.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'category-chip' + (state.selectedCategory === cat ? ' active' : '');
    chip.textContent = cat;
    chip.onclick = () => { state.selectedCategory = cat; applyFilters(); renderCategories(); };
    categoryChips.appendChild(chip);
  });
}

// ============================================================
// 6) APPLY FILTERS
// ============================================================
function applyFilters() {
  state.filtered = state.products.filter(p => {
    if (state.selectedBrand && p.brand !== state.selectedBrand) return false;
    if (state.selectedCategory && p.category !== state.selectedCategory) return false;
    return true;
  });
  renderProducts();
}

// ============================================================
// 7) RENDER PRODUCTS
// ============================================================
function renderProducts() {
  productsGrid.innerHTML = '';

  if (state.filtered.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  state.filtered.forEach(p => {
    productsGrid.appendChild(buildProductCard(p));
  });
}

// ============================================================
// 8) BUILD PRODUCT CARD
// ============================================================
function buildProductCard(p) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.dataset.id = p.id;

  const maxQty = Math.max(1, p.stock || 1);
  const outOfStock = (p.stock || 0) <= 0;

  card.innerHTML = `
    ${p.created_at && (new Date() - new Date(p.created_at)) < 7 * 24 * 60 * 60 * 1000 ? '<span style="position:absolute; top:10px; left:10px; background:#10b981; color:#fff; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700; z-index:2;">جديد</span>' : ''}
    <span class="product-id-badge">#${p.id}</span>
    <div class="product-img-wrap">
      <img src="/images/products/${p.id}.png" alt="${escapeHtml(p.name)}" loading="lazy" onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='/images/products/${p.id}.jpg';}else{this.outerHTML='<div class=&quot;product-placeholder&quot;>🛍️</div>';}">
    </div>
    <div class="product-info">
      <div class="product-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
      <div class="product-meta">
        <span class="product-price">$${Number(p.price).toFixed(2)}</span>
        <span class="product-stock ${p.stock <= 5 ? 'low' : ''}">${outOfStock ? 'نفد' : `مخزون: ${p.stock}`}</span>
      </div>
      <div class="qty-control">
        <button class="qty-btn" data-act="minus" ${outOfStock ? 'disabled' : ''}>−</button>
        <input type="range" class="qty-slider" min="1" max="${maxQty}" value="1" ${outOfStock ? 'disabled' : ''}>
        <span class="qty-value">1</span>
        <button class="qty-btn" data-act="plus" ${outOfStock ? 'disabled' : ''}>+</button>
      </div>
      <div class="card-actions">
        <button class="btn-add-cart" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'نفد المخزون' : '🛒 أضف للسلة'}</button>
        <button class="btn-icon-small share" title="مشاركة">🔗</button>
        <button class="btn-icon-small trash" title="حذف من السلة">🗑️</button>
      </div>
    </div>
  `;

  // ---------- Wire up quantity controls ----------
  const slider = card.querySelector('.qty-slider');
  const qtyVal = card.querySelector('.qty-value');
  const btnMinus = card.querySelector('[data-act="minus"]');
  const btnPlus  = card.querySelector('[data-act="plus"]');
  const addBtn   = card.querySelector('.btn-add-cart');
  const shareBtn = card.querySelector('.share');
  const trashBtn = card.querySelector('.trash');

  function setQty(v) {
    v = Math.max(1, Math.min(maxQty, v));
    slider.value = v;
    qtyVal.textContent = v;
  }
  slider.addEventListener('input', () => setQty(+slider.value));
  btnMinus.onclick = () => setQty(+slider.value - 1);
  btnPlus.onclick  = () => setQty(+slider.value + 1);

  // ---------- Add to cart ----------
  addBtn.onclick = () => {
    // جلب المنتج الصحيح بناءً على الـ id الخاص بالبطاقة
    const currentProduct = state.products.find(prod => prod.id == p.id) || p;
    addToCart(currentProduct, +slider.value);
    setQty(1);
  };

  // ---------- Share ----------
  shareBtn.onclick = async () => {
    const url = `${location.origin}/product.html?id=${p.id}`;
    const shareData = {
      title: p.name,
      text: `شاهد ${p.name} على متجر شركة المستقبل الأقوى`,
      url
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        showToast('📋 تم نسخ رابط المنتج');
      }
    } catch (e) { /* المستخدم ألغى */ }
  };

  // ---------- Trash (remove from cart) ----------
  trashBtn.onclick = () => {
    const cart = loadCart().filter(i => i.id !== p.id);
    saveCart(cart);
    showToast('🗑️ تم حذف المنتج من السلة');
  };

  return card;
}

// ============================================================
// 9) HELPERS
// ============================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ============================================================
// 10) EVENT LISTENERS (header buttons)
// ============================================================
// تم حذف زر تغيير الماركة

// تم حذف الكود القديم (الزر أصبح يُولد ديناميكياً)

$('#shamCashBtn').onclick = () => shamCashModal.classList.remove('hidden');
$('#closeShamCash').onclick = () => shamCashModal.classList.add('hidden');
shamCashModal.addEventListener('click', (e) => {
  if (e.target === shamCashModal) shamCashModal.classList.add('hidden');
});

// ============================================================
// 11) INIT
// ============================================================
updateCartBadge();
fetchProducts();

// ============================================================
// 12) PRODUCT MODAL (نافذة المنتج المنبثقة)
// ============================================================
const productModal = document.getElementById('productModal');
const pmCloseBtn   = document.getElementById('closeProductModal');
const pmLoading    = document.getElementById('pmLoading');
const pmError      = document.getElementById('pmError');
const pmContent    = document.getElementById('pmContent');

let pmCurrentProduct = null;

// فتح النافذة بمنتج معيّن
async function openProductModal(productId) {
  if (!productModal) return;
  productModal.classList.remove('hidden');
  pmContent.classList.add('hidden');
  pmError.classList.add('hidden');
  pmLoading.classList.remove('hidden');
  pmLoading.textContent = '⏳ جاري تحميل المنتج...';
  pmCurrentProduct = null;

  // تحديث الرابط (بدون إعادة تحميل)
  const newUrl = `${location.pathname}?id=${productId}`;
  history.pushState({ productId }, '', newUrl);

  try {
    const res = await fetch(`${API_BASE}/products?id=${productId}`);
    const data = await res.json();
    if (!data.ok || !data.product) throw new Error('غير موجود');
    pmCurrentProduct = data.product;
    renderProductModal(pmCurrentProduct);
  } catch (e) {
    pmLoading.classList.add('hidden');
    pmError.classList.remove('hidden');
  }
}

// إغلاق النافذة
function closeProductModal(pushHistory = true) {
  if (!productModal) return;
  productModal.classList.add('hidden');
  if (pushHistory) {
    history.pushState({}, '', location.pathname);
  }
  pmCurrentProduct = null;
}

// رسم محتوى النافذة
function renderProductModal(p) {
  pmLoading.classList.add('hidden');
  pmError.classList.add('hidden');
  pmContent.classList.remove('hidden');

  const maxQty = Math.max(1, p.stock || 1);
  const outOfStock = (p.stock || 0) <= 0;

  document.getElementById('pmId').textContent = `#${p.id}`;
  document.getElementById('pmName').textContent = p.name;
  document.getElementById('pmBrand').textContent = p.brand || '';
  document.getElementById('pmCategory').textContent = p.category || '';
  document.getElementById('pmPrice').textContent = `$${Number(p.price).toFixed(2)}`;
  document.getElementById('pmStock').textContent = outOfStock ? 'نفد' : p.stock;

  const img = document.getElementById('pmImg');
  img.dataset.fb = '';
  img.onerror = () => {
    if (!img.dataset.fb) {
      img.dataset.fb = '1';
      img.src = `/images/products/${p.id}.jpg`;
    } else {
      img.outerHTML = '<div class="product-placeholder">🛍️</div>';
    }
  };
  img.src = `/images/products/${p.id}.png`;

  // --- إضافة تكبير/تصغير الصورة بعجلة الماوس (آمن) ---
  try {
    const imgWrap = document.querySelector('.pm-image-wrap');
    if (imgWrap) {
      let scale = 1;
      // إزالة الحدث القديم إن وجد
      imgWrap.onwheel = null;
      imgWrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0) scale = Math.min(3, scale + 0.1);
        else scale = Math.max(1, scale - 0.1);
        img.style.transform = `scale(${scale})`;
        img.style.transition = 'transform 0.1s ease';
      }, { passive: false });
      
      // إعادة تعيين الحجم عند إغلاق النافذة
      const closeBtn = document.getElementById('closeProductModal');
      if (closeBtn) {
        const originalClose = closeBtn.onclick;
        closeBtn.onclick = (e) => {
          scale = 1;
          img.style.transform = 'scale(1)';
          if (originalClose) originalClose(e);
        };
      }
    }
  } catch(err) { console.log('خطأ في التكبير:', err); }

  // شريط الكمية
  const slider = document.getElementById('pmQtySlider');
  const qtyVal = document.getElementById('pmQtyVal');
  const btnMinus = document.getElementById('pmBtnMinus');
  const btnPlus  = document.getElementById('pmBtnPlus');
  const addBtn   = document.getElementById('pmAddToCart');
  const shareBtn = document.getElementById('pmShareBtn');

  slider.max = maxQty;
  slider.value = 1;
  qtyVal.textContent = 1;
  slider.disabled = outOfStock;
  btnMinus.disabled = outOfStock;
  btnPlus.disabled = outOfStock;
  addBtn.disabled = outOfStock;
  addBtn.textContent = outOfStock ? 'نفد المخزون' : '🛒 أضف للسلة';

  const setQty = (v) => {
    v = Math.max(1, Math.min(maxQty, v));
    slider.value = v;
    qtyVal.textContent = v;
  };
  slider.oninput = () => setQty(+slider.value);
  btnMinus.onclick = () => setQty(+slider.value - 1);
  btnPlus.onclick  = () => setQty(+slider.value + 1);

  // إضافة للسلة من النافذة
  addBtn.onclick = () => {
    // جلب المنتج الصحيح بناءً على الـ id الخاص بالبطاقة
    const currentProduct = state.products.find(prod => prod.id == p.id) || p;
    addToCart(currentProduct, +slider.value);
    setQty(1);
  };



  // حذف من السلة
  const trashBtn = document.getElementById('pmTrashBtn');
  if (trashBtn) {
    trashBtn.onclick = () => {
      const cart = loadCart().filter(i => i.id !== p.id);
      saveCart(cart);
      showToast('🗑️ تم حذف المنتج من السلة');
    };
  }
  // مشاركة (تفتح القائمة)
  shareBtn.onclick = () => {
    const url = `${location.origin}/share?id=${p.id}`;
    const text = `شاهد ${p.name} على متجر الصين - شركة المستقبل الأقوى`;
    
    // تجهيز روابط المنصات
    document.getElementById('shareWa').href = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
    document.getElementById('shareFb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    document.getElementById('shareTg').href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    
    // زر النسخ
    document.getElementById('shareCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        showToast('📋 تم نسخ رابط المنتج');
        document.getElementById('shareModal').classList.add('hidden');
      } catch (e) {
        showToast('❌ فشل النسخ');
      }
    };
    
    // إغلاق القائمة عند الضغط على أي زر
    const closeMenu = () => document.getElementById('shareModal').classList.add('hidden');
    document.getElementById('shareWa').addEventListener('click', closeMenu);
    document.getElementById('shareFb').addEventListener('click', closeMenu);
    document.getElementById('shareTg').addEventListener('click', closeMenu);

    // إظهار القائمة
    document.getElementById('shareModal').classList.remove('hidden');
  };
}

// ربط أزرار الإغلاق
if (pmCloseBtn) pmCloseBtn.onclick = () => closeProductModal(true);
if (productModal) {
  productModal.addEventListener('click', (e) => {
    if (e.target === productModal) closeProductModal(true);
  });
}

// دعم زر الرجوع في المتصفح
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (id) openProductModal(id);
  else closeProductModal(false);
});

// فتح النافذة تلقائياً إذا كان هناك ?id= في الرابط
(function handleInitialUrl() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (id) {
    // ننتظر تحميل المنتجات الأساسية ثم نفتح النافذة
    const checkLoaded = setInterval(() => {
      if (state.products.length > 0) {
        clearInterval(checkLoaded);
        openProductModal(id);
      }
    }, 200);
    setTimeout(() => clearInterval(checkLoaded), 10000); // أقصى انتظار 10 ثوان
  }
})();

// ============================================================
// 13) ربط النقر على بطاقة المنتج بفتح النافذة
// ============================================================
document.addEventListener('click', (e) => {
  const card = e.target.closest('.product-card');
  if (!card) return;

  // تجاهل إذا كان النقر على زر (سلة، مشاركة، حذف، شريط السحب)
  if (e.target.closest('button') || e.target.closest('input')) return;

  const id = card.dataset.id;
  if (id) openProductModal(id);
});

// جعل الصورة والاسم مؤشرات للنقر
const style = document.createElement('style');
style.textContent = `
  .product-img-wrap, .product-name { cursor: pointer; }
  .product-img-wrap:hover { opacity: 0.95; }
`;
document.head.appendChild(style);

// ============================================================
// 14) SEARCH (البحث الفوري)
// ============================================================
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

if (searchInput) {
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = searchInput.value.trim().toLowerCase();
      
      // إظهار/إخفاء زر المسح
      if (clearSearchBtn) {
        clearSearchBtn.style.display = q ? 'flex' : 'none';
      }

      if (!q) {
        applyFilters(); // إعادة الفلاتر العادية
        return;
      }

      // بحث في الاسم أو الرقم
      state.filtered = state.products.filter(p => {
        // مراعاة فلتر الماركة والقسم الحالي
        if (state.selectedBrand && p.brand !== state.selectedBrand) return false;
        if (state.selectedCategory && p.category !== state.selectedCategory) return false;
        
        const nameMatch = (p.name || '').toLowerCase().includes(q);
        const idMatch = String(p.id).includes(q);
        const brandMatch = (p.brand || '').toLowerCase().includes(q);
        
        return nameMatch || idMatch || brandMatch;
      });

      renderProducts();
    }, 150); // تأخير بسيط لتحسين الأداء
  });

  // زر المسح
  if (clearSearchBtn) {
    clearSearchBtn.onclick = () => {
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      applyFilters();
      searchInput.focus();
    };
  }
}


// ============================================================
// 15) إغلاق قائمة المشاركة
// ============================================================
// const shareModal = document.getElementById('shareModal'); // (تم التعطيل لحل التكرار)
const closeShareModal = document.getElementById('closeShareModal');
if (shareModal && closeShareModal) {
  closeShareModal.onclick = () => shareModal.classList.add('hidden');
  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) shareModal.classList.add('hidden');
  });
}

// ============================================================
// 15) إغلاق نافذة المشاركة
// ============================================================
// const shareModal = document.getElementById('shareModal'); // (تم التعطيل لحل التكرار)
const closeShareBtn = document.getElementById('closeShareModal');

if (shareModal && closeShareBtn) {
  // إغلاق بزر X
  closeShareBtn.onclick = () => {
    shareModal.classList.add('hidden');
  };
  
  // إغلاق عند النقر خارج النافذة
  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) {
      shareModal.classList.add('hidden');
    }
  });
}

// ============================================================

// ============================================================


// ============================================================
// إغلاق نافذة المشاركة (نسخة آمنة)
// ============================================================
document.addEventListener('click', (e) => {
  const shareModal = document.getElementById('shareModal');
  // إذا كانت النافذة مخفية، لا داعي لفعل شيء
  if (!shareModal || shareModal.classList.contains('hidden')) return;

  // إذا تم النقر على زر الإغلاق
  if (e.target.closest('#closeShareModal')) {
    shareModal.classList.add('hidden');
  }
  
  // إذا تم النقر على الخلفية الداكنة (خارج الصندوق)
  if (e.target === shareModal) {
    shareModal.classList.add('hidden');
  }
});

// ============================================================
// ضمان عمل عجلة الماوس داخل النافذة المنبثقة
// ============================================================

// منع تمرير الصفحة الخلفية عند فتح النافذة
const originalOpenModalForScroll = window.openProductModal;
if (typeof originalOpenModalForScroll === 'function') {
  window.openProductModal = async function(productId) {
    document.body.classList.add('modal-open');
    await originalOpenModalForScroll(productId);
  };
}

// إزالة الكلاس عند الإغلاق
document.addEventListener('click', (e) => {
  const modal = document.getElementById('productModal');
  if (!modal || modal.classList.contains('hidden')) return;
  
  if (e.target.closest('#closeProductModal') || e.target === modal) {
    document.body.classList.remove('modal-open');
  }
});

// ضمان أن التمرير يعمل داخل النافذة
document.addEventListener('DOMContentLoaded', () => {
  const modalContent = document.querySelector('.product-modal-content');
  if (modalContent) {
    // تمرير العجلة يعمل داخل النافذة
    modalContent.addEventListener('wheel', (e) => {
      // إذا كانت النافذة مفتوحة، نسمح بالتمرير داخل النافذة
      const modal = document.getElementById('productModal');
      if (modal && !modal.classList.contains('hidden')) {
        // لا نمنع الحدث، بل نتركه يمر
      }
    }, { passive: true });
  }
});
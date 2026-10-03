/* ============================================
   Warehouse OS — Storefront App
   Vanilla JS, zero dependencies, fast
   ============================================ */

// ─── Demo Data (mapped to Prisma Product model) ───
const PRODUCTS = [
  { id: '1', name: 'لنت ترمز جلو پراید', sku: 'LNT-PRY-001', brand: 'آسیا', category: 'ترمز', price: 185000, stock: 24, unit: 'جفت' },
  { id: '2', name: 'فیلتر روغن پراید', sku: 'FLT-OL-P01', brand: 'فلیپ', category: 'موتور', price: 45000, stock: 80, unit: 'عدد' },
  { id: '3', name: 'فیلتر هوا پراید', sku: 'FLT-AIR-P1', brand: 'فلیپ', category: 'موتور', price: 38000, stock: 65, unit: 'عدد' },
  { id: '4', name: 'شمع موتور NGK پراید', sku: 'SHM-NGK-P1', brand: 'NGK', category: 'موتور', price: 72000, stock: 40, unit: 'عدد' },
  { id: '5', name: 'تسمه دینام پراید', sku: 'TSM-DN-P01', brand: 'دایMOV', category: 'موتور', price: 55000, stock: 30, unit: 'عدد' },
  { id: '6', name: 'روغن موتور ۲۰W-50 چهار لیتری', sku: 'ROGH-20W50', brand: 'ایسوسان', category: 'روغن', price: 320000, stock: 15, unit: 'عدد' },
  { id: '7', name: ' ضد یخ اورجینال ۴ لیتری', sku: 'ANTF-4L', brand: 'پارس', category: 'روغن', price: 280000, stock: 12, unit: 'عدد' },
  { id: '8', name: 'لنت ترمز عقب پراید', sku: 'LNT-PRY-R1', brand: 'آسیا', category: 'ترمز', price: 145000, stock: 18, unit: 'جفت' },
  { id: '9', name: 'دیسک ترمز جلو پراید', sku: 'DSK-PRY-F1', brand: 'آسیا', category: 'ترمز', price: 210000, stock: 10, unit: 'عدد' },
  { id: '10', name: 'باطری ۶۰ آمپر اوربیتال', sku: 'BATT-60A', brand: 'ورتا', category: 'برقی', price: 2850000, stock: 8, unit: 'عدد' },
  { id: '11', name: '蚊rep; دیسک ترمز عقب پراید', sku: 'DSK-PRY-R1', brand: 'آسیا', category: 'ترمز', price: 195000, stock: 0, unit: 'عدد' },
  { id: '12', name: 'فیلتر کابین پراید', sku: 'FLT-CAB-P1', brand: 'فلیپ', category: 'موتور', price: 32000, stock: 50, unit: 'عدد' },
  { id: '13', name: 'گردگیر فرمان پراید', sku: 'GRD-FRN-P1', brand: 'ارج', category: 'فرمان', price: 65000, stock: 20, unit: 'عدد' },
  { id: '14', name: 'مگنت فرمان پراید', sku: 'MAG-FRN-P1', brand: 'ارج', category: 'فرمان', price: 85000, stock: 14, unit: 'عدد' },
  { id: '15', name: 'لاستیک ۱۶۵/۶۵R۱۳', sku: 'TYR-165-13', brand: 'بارز', category: 'لاستیک', price: 1450000, stock: 32, unit: 'عدد' },
  { id: '16', name: 'لاستیک ۱۷۵/۶۵R۱۴', sku: 'TYR-175-14', brand: 'کویر', category: 'لاستیک', price: 1750000, stock: 28, unit: 'عدد' },
  { id: '17', name: 'واشر سرسیلندر پراید', sku: 'WSH-SLC-P1', brand: 'ارج', category: 'موتور', price: 95000, stock: 6, unit: 'عدد' },
  { id: '18', name: 'پمپ بنزین پراید', sku: 'PMP-GAZ-P1', brand: 'بوش', category: 'موتور', price: 420000, stock: 4, unit: 'عدد' },
  { id: '19', name: 'چراغ جلو راست پراید', sku: 'LGT-FR-R1', brand: 'ارج', category: 'برقی', price: 380000, stock: 7, unit: 'عدد' },
  { id: '20', name: 'آینه جانبی راست پراید', sku: 'MRR-SDE-R1', brand: 'ارج', category: 'بدنه', price: 165000, stock: 11, unit: 'عدد' },
];

// ─── Helpers ───
const fa = (n) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const faNum = (n) => n.toLocaleString('fa-IR');
const toman = (n) => faNum(n) + ' تومان';

function stockLabel(qty) {
  if (qty === 0) return { text: 'ناموجود', cls: 'out-of-stock' };
  if (qty <= 10) return { text: fa(qty) + ' ' + 'موجود', cls: 'low-stock' };
  return { text: 'موجود', cls: 'in-stock' };
}

// ─── Cart State ───
let cart = []; // [{id, name, price, qty, unit}]

function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }
function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

function addToCart(product) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, qty: 1, unit: product.unit });
  }
  renderCart();
  showToast(product.name + ' به سبد اضافه شد');
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  renderCart();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  renderCart();
}

// ─── Toast ───
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ─── Render Products ───
function renderProducts(list) {
  const grid = document.getElementById('productGrid');
  if (list.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__text">محصولی یافت نشد</div></div>';
    document.getElementById('productsCount').textContent = '';
    return;
  }
  document.getElementById('productsCount').textContent = fa(list.length) + ' محصول';
  grid.innerHTML = list.map(p => {
    const sl = stockLabel(p.stock);
    const oos = p.stock === 0 ? ' out-of-stock' : '';
    return `
    <article class="p-card${oos}" data-id="${p.id}">
      <div class="p-card__img">
        <span class="p-card__img-placeholder">🔧</span>
        <span class="p-card__stock-badge ${sl.cls}">${sl.text}</span>
      </div>
      <div class="p-card__body">
        <span class="p-card__brand">${p.brand}</span>
        <h3 class="p-card__name">${p.name}</h3>
        <span class="p-card__sku">${p.sku}</span>
        <div class="p-card__footer">
          <div>
            <span class="p-card__price">${faNum(p.price)}</span>
            <span class="p-card__price-unit"> ریال / ${p.unit}</span>
          </div>
          <button class="p-card__add-btn" onclick="handleAdd('${p.id}')" ${p.stock === 0 ? 'disabled' : ''} aria-label="افزودن به سبد">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function handleAdd(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (p && p.stock > 0) {
    addToCart(p);
    // Animate button
    const btn = document.querySelector(`.p-card[data-id="${id}"] .p-card__add-btn`);
    if (btn) {
      btn.classList.add('added');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>';
      setTimeout(() => {
        btn.classList.remove('added');
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
      }, 600);
    }
  }
}

// ─── Render Cart ───
function renderCart() {
  const badge = document.getElementById('cartBadge');
  const items = document.getElementById('cartItems');
  const empty = document.getElementById('cartEmpty');
  const footer = document.getElementById('cartFooter');
  const count = cartCount();

  badge.textContent = count > 0 ? fa(count) : '';

  if (cart.length === 0) {
    empty.style.display = '';
    footer.style.display = 'none';
    // Remove all cart-item elements
    items.querySelectorAll('.cart-item').forEach(el => el.remove());
    return;
  }

  empty.style.display = 'none';
  footer.style.display = '';

  // Build items HTML
  const html = cart.map(i => `
    <div class="cart-item" data-id="${i.id}">
      <div class="cart-item__img"><span style="font-size:1.5rem;">🔧</span></div>
      <div class="cart-item__info">
        <div class="cart-item__name">${i.name}</div>
        <div class="cart-item__price">${faNum(i.price * i.qty)} ریال</div>
        <div class="cart-item__controls">
          <button class="cart-qty-btn" onclick="changeQty('${i.id}', 1)">+</button>
          <span class="cart-item__qty">${fa(i.qty)}</span>
          <button class="cart-qty-btn" onclick="changeQty('${i.id}', -1)">−</button>
          <button class="cart-item__remove" onclick="removeFromCart('${i.id}')">حذف</button>
        </div>
      </div>
    </div>
  `).join('');

  // Keep empty div, replace rest
  items.querySelectorAll('.cart-item').forEach(el => el.remove());
  items.insertAdjacentHTML('beforeend', html);

  document.getElementById('cartSubtotal').textContent = faNum(cartTotal());
  document.getElementById('cartTotal').textContent = toman(cartTotal());
}

// ─── Categories ───
function buildCategories() {
  const cats = [...new Set(PRODUCTS.map(p => p.category))];
  const bar = document.getElementById('catBar');
  cats.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'cat-bar__chip';
    btn.dataset.cat = c;
    btn.textContent = c;
    bar.appendChild(btn);
  });
}

// ─── Filtering & Sorting ───
let activeCat = 'all';
let searchQuery = '';

function getFiltered() {
  let list = PRODUCTS;
  if (activeCat !== 'all') list = list.filter(p => p.category === activeCat);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p =>
      p.name.includes(q) || p.sku.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
    );
  }
  const sort = document.getElementById('sortSelect').value;
  if (sort === 'cheapest') list.sort((a, b) => a.price - b.price);
  else if (sort === 'expensive') list.sort((a, b) => b.price - a.price);
  else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  return list;
}

// ─── Event Listeners ───
document.addEventListener('DOMContentLoaded', () => {
  buildCategories();
  renderProducts(getFiltered());

  // Category clicks
  document.getElementById('catBar').addEventListener('click', e => {
    const chip = e.target.closest('.cat-bar__chip');
    if (!chip) return;
    document.querySelectorAll('.cat-bar__chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeCat = chip.dataset.cat;
    renderProducts(getFiltered());
  });

  // Search
  let searchDebounce;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = e.target.value.trim();
      renderProducts(getFiltered());
    }, 200);
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', () => renderProducts(getFiltered()));

  // Cart drawer
  const openCart = () => {
    document.getElementById('cartDrawer').classList.add('open');
    document.getElementById('cartOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  const closeCart = () => {
    document.getElementById('cartDrawer').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  document.getElementById('cartBtn').addEventListener('click', openCart);
  document.getElementById('mobileCartBtn').addEventListener('click', openCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);

  // Checkout modal
  const openCheckout = () => {
    if (cart.length === 0) return;
    closeCart();
    setTimeout(() => {
      document.getElementById('checkoutModal').classList.add('open');
      document.body.style.overflow = 'hidden';
    }, 300);
  };
  const closeCheckout = () => {
    document.getElementById('checkoutModal').classList.remove('open');
    document.body.style.overflow = '';
  };

  document.getElementById('checkoutBtn').addEventListener('click', openCheckout);
  document.getElementById('checkoutClose').addEventListener('click', closeCheckout);
  document.getElementById('checkoutCancel').addEventListener('click', closeCheckout);
  document.getElementById('checkoutModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCheckout();
  });

  // Checkout confirm
  document.getElementById('checkoutConfirm').addEventListener('click', () => {
    const name = document.getElementById('custName').value.trim();
    if (!name) {
      document.getElementById('custName').focus();
      document.getElementById('custName').style.borderColor = '#e74c3c';
      setTimeout(() => document.getElementById('custName').style.borderColor = '', 1500);
      return;
    }
    // Simulate order
    const orderNum = Math.floor(Math.random() * 9000) + 1000;
    closeCheckout();
    cart = [];
    renderCart();
    showToast('سفارش شماره ' + fa(orderNum) + ' ثبت شد ✓');
    // Clear form
    document.getElementById('custName').value = '';
    document.getElementById('custPhone').value = '';
  });

  // Keyboard: Escape closes overlays
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeCheckout();
      closeCart();
    }
  });
});

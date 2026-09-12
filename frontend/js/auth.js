const API_BASE = window.location.hostname === 'localhost'
  ? '/api'
  : 'https://advancebusbookingsystemv2.onrender.com/api';

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

function isLoggedIn() {
  return !!getToken();
}

function isAdmin() {
  const user = getUser();
  return user && user.role === 'admin';
}

async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await res.json();

  if (res.status === 401) {
    logout();
    return null;
  }

  return data;
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return false;
  }
  return true;
}

function requireAdmin() {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return false;
  }
  if (!isAdmin()) {
    window.location.href = '/dashboard';
    return false;
  }
  return true;
}

function formatCurrency(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let h = parseInt(parts[0]);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function showPageLoader(text, subtext) {
  let loader = document.getElementById('page-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.className = 'page-loader';
    loader.innerHTML = '<div class="spinner"></div><div class="loader-text"></div><div class="loader-subtext"></div>';
    document.body.prepend(loader);
  }
  if (text) loader.querySelector('.loader-text').textContent = text;
  if (subtext) loader.querySelector('.loader-subtext').textContent = subtext;
}

function hidePageLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) loader.classList.add('hidden');
}

function setupNav() {
  const user = getUser();
  const authNav = document.getElementById('auth-nav');
  const userNav = document.getElementById('user-nav');
  const adminNav = document.getElementById('admin-nav');

  [authNav, userNav, adminNav].forEach(nav => {
    if (nav) nav.classList.add('hidden');
  });

  if (user) {
    if (user.role === 'admin' && adminNav) {
      adminNav.classList.remove('hidden');
    } else if (userNav) {
      userNav.classList.remove('hidden');
    }
  } else {
    if (authNav) authNav.classList.remove('hidden');
  }

  const toggle = document.querySelector('.mobile-toggle');
  const navRight = document.querySelector('.navbar-right');

  if (toggle && navRight) {
    let backdrop = document.querySelector('.nav-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'nav-backdrop';
      document.body.appendChild(backdrop);
    }

    function openMenu() {
      navRight.classList.add('open');
      backdrop.classList.add('open');
      toggle.textContent = '✕';
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      navRight.classList.remove('open');
      backdrop.classList.remove('open');
      toggle.textContent = '☰';
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (navRight.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    backdrop.addEventListener('click', closeMenu);

    navRight.querySelectorAll('a, button').forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navRight.classList.contains('open')) {
        closeMenu();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', setupNav);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

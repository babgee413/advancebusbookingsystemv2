/*
 * ATBUBusTransportSystem — PWA module
 * Platform detection, install prompts (Android/desktop), iOS Add-to-Home-Screen
 * instructions, installed-state tracking, offline/online notices and app-update prompts.
 * Loaded after auth.js on every page.
 */

window.PWA = (() => {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  const isAndroid = /Android/i.test(ua);
  const isStandaloneMode =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    navigator.standalone === true; // iOS Safari

  let deferredPrompt = null;
  let updateSWFn = null;

  const platform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';

  function isInstalled() {
    if (isStandaloneMode) return true;
    try { if (localStorage.getItem('pwa-installed') === '1') return true; } catch (e) {}
    return false;
  }

  function markInstalled() {
    try { localStorage.setItem('pwa-installed', '1'); } catch (e) {}
  }

  function canPrompt() {
    return !!deferredPrompt && !isInstalled();
  }

  /* The native install event can arrive a second or two after page load.
     When it hasn't fired yet, wait briefly for it before giving up. */
  const PROMPT_WAIT_MS = 3500;
  let promptPending = false;

  function waitForPrompt(ms) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('beforeinstallprompt', onBip);
        clearTimeout(timer);
        resolve(v);
      };
      const onBip = (e) => {
        e.preventDefault();
        deferredPrompt = e;
        finish(true);
      };
      const timer = setTimeout(() => finish(!!deferredPrompt), ms);
      window.addEventListener('beforeinstallprompt', onBip);
      if (deferredPrompt) finish(true);
    });
  }

  function setPending(on) {
    document.querySelectorAll('[data-pwa-install-btn]').forEach((btn) => {
      if (on) {
        if (btn.dataset.label === undefined) btn.dataset.label = btn.textContent;
        btn.textContent = 'Preparing…';
        btn.disabled = true;
      } else {
        if (btn.dataset.label !== undefined) btn.textContent = btn.dataset.label;
        btn.disabled = false;
      }
    });
  }

  async function runPrompt() {
    const evt = deferredPrompt;
    deferredPrompt = null;
    if (!evt) return { outcome: 'unavailable' };
    let outcome = 'dismissed';
    try {
      evt.prompt();
      const choice = await Promise.race([
        evt.userChoice,
        new Promise((r) => setTimeout(() => r({ outcome: 'dismissed' }), 8000))
      ]);
      outcome = choice && choice.outcome ? choice.outcome : 'dismissed';
    } catch (e) {}
    if (outcome === 'accepted') markInstalled();
    return { outcome };
  }

  async function promptInstall() {
    if (promptPending) return { outcome: 'pending' };
    promptPending = true;
    try {
      if (!deferredPrompt) {
        // The install event usually arrives shortly after the service worker
        // becomes ready (often before the user even clicks). Wait for it before
        // falling back — the API cannot be detected reliably before it fires.
        setPending(true);
        const got = await waitForPrompt(PROMPT_WAIT_MS);
        setPending(false);
        if (!got && !deferredPrompt) {
          openInstructions();
          return { outcome: 'unavailable' };
        }
      }
      const result = await runPrompt();
      if (result.outcome !== 'accepted') renderAll();
      return result;
    } finally {
      promptPending = false;
      setPending(false);
      renderAll();
    }
  }

  /* ---------- Platform-specific instructions ---------- */

  function steps() {
    if (platform === 'ios') {
      return {
        title: 'Install on iPhone / iPad',
        intro: 'Open this page in <strong>Safari</strong>, then:',
        steps: [
          'Tap the <strong>Share</strong> button <span class="inst-inline-icon">􀈂</span> (square with an arrow) in the Safari toolbar.',
          'Scroll and tap <strong>Add to Home Screen</strong>.',
          'Tap <strong>Add</strong> in the top-right corner.',
          'The ATBU Bus app icon now appears on your home screen.'
        ],
        note: 'Use Safari — the Share ▸ Add to Home Screen option is not available in other iOS browsers.'
      };
    }
    if (platform === 'android') {
      return {
        title: 'Install on Android',
        intro: 'In <strong>Chrome</strong> (or your default browser):',
        steps: [
          'Tap the <strong>Install app</strong> / <strong>Add to Home screen</strong> option in the browser menu (⋮).',
          'Confirm by tapping <strong>Install</strong> / <strong>Add</strong>.',
          'The ATBU Bus app icon appears on your home screen and app drawer.'
        ],
        note: 'You can also use “Add to Home screen” from the Share menu in Samsung Internet and other browsers.'
      };
    }
    return {
      title: 'Install on Desktop',
      intro: 'In <strong>Chrome</strong>, <strong>Edge</strong> or another supported browser:',
      steps: [
        'Click the <strong>⋮ menu</strong> (three dots) at the top-right corner of the browser window.',
        'Open <strong>Cast, save, and share ▸ Install page as app…</strong> — or <strong>More tools ▸ Install page as app…</strong> / <strong>Apps ▸ Install this site as an app</strong>, depending on your browser version.',
        'Confirm by clicking <strong>Install</strong> — the app opens in its own window with a taskbar / dock icon.'
      ],
      note: 'If your browser also shows a small install icon at the right end of the address bar, you can click that instead. No install option in the menu? Your browser may not support installing websites as apps — bookmark this page or pin the tab for quick access. On iPhone or iPad, open this page in Safari and use Share ▸ Add to Home Screen.'
    };
  }

  function openInstructions() {
    let modal = document.getElementById('pwa-instructions-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pwa-instructions-modal';
      modal.className = 'pwa-modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeInstructions(); });
      document.body.appendChild(modal);
    }
    const s = steps();
    modal.innerHTML = `
      <div class="pwa-modal" role="dialog" aria-modal="true" aria-label="${s.title}">
        <button class="pwa-modal-close" aria-label="Close" onclick="PWA.closeInstructions()">✕</button>
        <div class="pwa-modal-icon"><img src="/images/icon-192.png" alt=""></div>
        <h3>${s.title}</h3>
        <p class="pwa-modal-intro">${s.intro}</p>
        <ol class="pwa-steps">${s.steps.map(st => `<li>${st}</li>`).join('')}</ol>
        <p class="pwa-modal-note">${s.note}</p>
        <button class="btn btn-primary btn-block" onclick="PWA.closeInstructions()">Got it</button>
      </div>`;
    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeInstructions() {
    const modal = document.getElementById('pwa-instructions-modal');
    if (modal) modal.classList.remove('visible');
    document.body.style.overflow = '';
  }

  /* ---------- Install card rendering ---------- */

  function cardHTML(variant) {
    const compact = variant === 'dashboard';

    if (isInstalled()) {
      return `
        <div class="install-card installed ${compact ? 'compact' : ''}">
          <img class="install-card-icon" src="/images/icon-192.png" alt="">
          <div class="install-card-body">
            <strong>${compact ? 'App installed' : 'You have the app'}</strong>
            <p>${isStandaloneMode
              ? 'You’re running the installed ATBU Bus app. Enjoy the native experience!'
              : 'ATBUBusTransportSystem is already added to your device.'}</p>
          </div>
          <span class="install-status-badge">✓ Installed</span>
        </div>`;
    }

    if (platform === 'ios') {
      return `
        <div class="install-card ${compact ? 'compact' : ''}">
          <img class="install-card-icon" src="/images/icon-192.png" alt="">
          <div class="install-card-body">
            <strong>Install ATBU Bus App</strong>
            <p>Add to your Home Screen with Safari’s Share menu — no App Store needed.</p>
            <div class="install-actions">
              <button class="btn btn-primary" data-pwa-install-btn onclick="PWA.promptInstall()">Install App</button>
              <button class="btn btn-secondary" onclick="PWA.openInstructions()">How to install</button>
            </div>
          </div>
        </div>`;
    }

    const target = platform === 'android' ? 'home screen' : 'desktop';
    return `
      <div class="install-card ${compact ? 'compact' : ''}">
        <img class="install-card-icon" src="/images/icon-192.png" alt="">
        <div class="install-card-body">
          <strong>Install ATBU Bus App</strong>
          <p>Get instant access to bookings, tickets and QR check-in — right from your ${target}.</p>
          <div class="install-actions">
            <button class="btn btn-primary" data-pwa-install-btn onclick="PWA.promptInstall()">Install App</button>
            <button class="btn btn-secondary" onclick="PWA.openInstructions()">How to install</button>
          </div>
        </div>
      </div>`;
  }

  function renderAll() {
    document.querySelectorAll('[data-pwa-install]').forEach((el) => {
      if (sectionDismissed() && !isInstalled()) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.innerHTML = cardHTML(el.getAttribute('data-pwa-install') || 'home');
    });
    document.querySelectorAll('[data-pwa-inline-install]').forEach((el) => {
      el.innerHTML = cardHTML(el.getAttribute('data-pwa-inline-install') || 'home');
    });
    renderBar();
  }

  function sectionDismissed() {
    try { return sessionStorage.getItem('pwa-section-dismissed') === '1'; } catch (e) { return false; }
  }

  function dismissSection() {
    try { sessionStorage.setItem('pwa-section-dismissed', '1'); } catch (e) {}
    renderAll();
  }

  /* ---------- Fixed install bar (persistent section at the bottom of the screen) ---------- */

  function barDismissed() {
    try { return sessionStorage.getItem('pwa-dismissed') === '1'; } catch (e) { return false; }
  }

  function shouldShowBar() {
    if (isInstalled() || isStandaloneMode) return false;
    if (barDismissed()) return false;
    return true;
  }

  function barPrimary() {
    return { label: 'Install App', action: 'install' };
  }

  function renderBar() {
    let bar = document.getElementById('pwa-install-banner');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pwa-install-banner';
      bar.className = 'pwa-install-banner';
      document.body.appendChild(bar);
    }

    if (!shouldShowBar()) {
      bar.classList.remove('visible');
      document.body.classList.remove('pwa-install-bar-open');
      return;
    }

    const primary = barPrimary();
    const sub = platform === 'ios'
      ? 'Add to your Home Screen with Safari’s Share menu'
      : 'Add to your home screen for quick access';

    bar.innerHTML = `
      <div class="pwa-install-content">
        <img src="/images/icon-192.png" alt="" class="pwa-install-icon">
        <div class="pwa-install-text">
          <strong>Install ATBUBusTransportSystem</strong>
          <span>${sub}</span>
        </div>
        <div class="pwa-install-actions">
          <button class="btn btn-sm btn-primary" data-pwa-bar-action data-pwa-install-btn>${primary.label}</button>
          <button class="btn btn-sm btn-ghost" data-pwa-bar-dismiss>Not now</button>
        </div>
      </div>`;

    bar.querySelector('[data-pwa-bar-action]').onclick = () => {
      if (primary.action === 'install') promptInstall();
      else openInstructions();
    };
    bar.querySelector('[data-pwa-bar-dismiss]').onclick = () => {
      try { sessionStorage.setItem('pwa-dismissed', '1'); } catch (e) {}
      renderBar();
    };

    bar.classList.add('visible');
    document.body.classList.add('pwa-install-bar-open');
  }

  /* ---------- Offline / online notices ---------- */

  function noticeHTML(kind) {
    if (kind === 'offline') {
      return `<span class="pwa-notice-dot offline"></span> You’re offline — booking, payment and ticket verification need an internet connection.`;
    }
    return `<span class="pwa-notice-dot online"></span> Back online.`;
  }

  function showNotice(kind) {
    let el = document.getElementById('pwa-network-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pwa-network-notice';
      el.className = 'pwa-network-notice';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = noticeHTML(kind);
    el.className = 'pwa-network-notice visible ' + kind;
    clearTimeout(el._timer);
    if (kind === 'online') {
      el._timer = setTimeout(() => el.classList.remove('visible'), 4000);
    }
  }

  function updateNetworkNotice() {
    if (!navigator.onLine) showNotice('offline');
    else {
      const el = document.getElementById('pwa-network-notice');
      if (el && el.classList.contains('offline')) showNotice('online');
    }
  }

  /* ---------- App update prompt ---------- */

  function notifyUpdate(worker) {
    let el = document.getElementById('pwa-update-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pwa-update-notice';
      el.className = 'pwa-update-notice';
      el.innerHTML = `A new version of the app is available.
        <button class="btn btn-sm btn-primary" id="pwa-update-btn">Update</button>
        <button class="btn btn-sm btn-ghost" id="pwa-update-later">Later</button>`;
      document.body.appendChild(el);
      el.classList.add('visible');
      el.querySelector('#pwa-update-btn').addEventListener('click', () => {
        if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
      });
      el.querySelector('#pwa-update-later').addEventListener('click', () => {
        el.classList.remove('visible');
      });
    }
  }

  /* ---------- Init ---------- */

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    renderAll();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    markInstalled();
    renderAll();
  });

  window.addEventListener('online', updateNetworkNotice);
  window.addEventListener('offline', updateNetworkNotice);

  document.addEventListener('DOMContentLoaded', () => {
    renderAll();
    updateNetworkNotice();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        if (reg.waiting && navigator.serviceWorker.controller) notifyUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) notifyUpdate(sw);
          });
        });
      }).catch(() => {});
    }
  });

  return {
    platform,
    isIOS,
    isAndroid,
    isInstalled,
    isStandalone: () => isStandaloneMode,
    canPrompt,
    promptInstall,
    openInstructions,
    closeInstructions,
    dismissSection,
    renderBar,
    renderAll
  };
})();

// Backwards-compatible entry points used by page markup.
function installPWA() {
  if (PWA.canPrompt()) return PWA.promptInstall();
  PWA.openInstructions();
  return Promise.resolve({ outcome: 'unavailable' });
}

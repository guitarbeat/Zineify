import '@khmyznikov/pwa-install';

function getPwaInstallElement() {
  return document.querySelector('pwa-install');
}

function syncInstallTrigger() {
  const installEl = getPwaInstallElement();
  const trigger = document.getElementById('pwa-install-trigger');
  if (!installEl || !trigger) {return;}

  if (installEl.isUnderStandaloneMode) {
    trigger.hidden = true;
    trigger.disabled = true;
    trigger.setAttribute('aria-disabled', 'true');
    return;
  }

  trigger.hidden = false;
  trigger.disabled = false;
  trigger.setAttribute('aria-disabled', 'false');
}

function wireInstallTrigger() {
  const trigger = document.getElementById('pwa-install-trigger');
  if (!trigger) {return;}

  trigger.addEventListener('click', () => {
    getPwaInstallElement()?.showDialog();
  });
}

function attachCapturedInstallPrompt() {
  const installEl = getPwaInstallElement();
  if (!installEl || !window.__zinePwaPromptEvent) {return;}
  installEl.externalPromptEvent = window.__zinePwaPromptEvent;
}

function wireInstallElementEvents() {
  const installEl = getPwaInstallElement();
  if (!installEl) {return;}

  ['pwa-install-available-event', 'pwa-install-success-event', 'pwa-user-choice-result-event'].forEach(
    (eventName) => {
      installEl.addEventListener(eventName, syncInstallTrigger);
    }
  );

  syncInstallTrigger();
}

export function initPwa() {
  attachCapturedInstallPrompt();
  wireInstallTrigger();
  wireInstallElementEvents();

  let isIframe;
  try {
    isIframe = window.self !== window.top;
  } catch {
    isIframe = true;
  }

  if (isIframe) {
    return;
  }

  if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key !== 'zine-ify-v3') {
          caches.delete(key).catch(() => undefined);
        }
      });
    }).catch(() => undefined);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          if (reg && typeof reg.update === 'function') {
            reg.update().catch(() => undefined);
          }
        })
        .catch(() => undefined);
    });
  }
}



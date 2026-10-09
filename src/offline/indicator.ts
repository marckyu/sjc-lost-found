let bannerEl: HTMLElement | null = null;
let hideTimer: number | null = null;

function ensureBanner(): HTMLElement {
    if (bannerEl && document.body.contains(bannerEl)) return bannerEl;
    const el = document.createElement('div');
    el.id = 'syncBanner';
    el.style.cssText = [
        'position: fixed',
        'bottom: 80px',
        'left: 50%',
        'transform: translateX(-50%)',
        'z-index: 4000',
        'padding: 10px 18px',
        'border-radius: 24px',
        'font-size: 13px',
        'font-weight: 700',
        'color: #fff',
        'box-shadow: 0 4px 16px rgba(0,0,0,0.2)',
        'transition: opacity 0.3s ease, transform 0.3s ease',
        'display: flex',
        'align-items: center',
        'gap: 8px',
        'max-width: 90vw',
        'text-align: center',
        'pointer-events: none',
        'opacity: 0',
        'visibility: hidden'
    ].join(';');
    document.body.appendChild(el);
    bannerEl = el;
    return el;
}

function clearHideTimer(): void {
    if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
}

function hideBanner(): void {
    const el = ensureBanner();
    clearHideTimer();
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    el.style.transform = 'translateX(-50%) translateY(20px)';
}

function showBanner(text: string, color: string, autoHideMs?: number): void {
    const el = ensureBanner();
    clearHideTimer();
    el.style.background = color;
    el.textContent = text;
    el.style.opacity = '1';
    el.style.visibility = 'visible';
    el.style.transform = 'translateX(-50%) translateY(0)';

    if (autoHideMs !== undefined) {
        hideTimer = window.setTimeout(() => {
            el.style.opacity = '0';
            el.style.visibility = 'hidden';
            el.style.transform = 'translateX(-50%) translateY(20px)';
            hideTimer = null;
        }, autoHideMs);
    }
}

export function notifySyncing(): void {
    showBanner('⟳ Syncing...', '#166534');
}

export function notifySuccess(): void {
    showBanner('✓ Sync successful!', '#166534', 1500);
}

export function notifyPending(count: number): void {
    showBanner(`⏳ ${count} pending — will sync when online`, '#1d4ed8');
}

export function notifyOffline(): void {
    showBanner('⚠ Offline — will sync when connected', '#b45309');
}

export function notifyError(): void {
    showBanner('⚠ Sync failed — will retry', '#dc2626', 2500);
}

export function pulseSync(ms: number = 500): void {
    notifySyncing();
    window.setTimeout(() => notifySuccess(), ms);
}

export function initOfflineIndicator(): void {
    // no-op
}
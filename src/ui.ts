export type ToastType = 'success' | 'error' | 'warning' | 'info';

export function showToast(message: string, type: ToastType = 'info'): void {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast ' + type;
    setTimeout(() => toast!.classList.add('show'), 10);
    setTimeout(() => toast!.classList.remove('show'), 3500);
}

export function escapeHtml(str: string | undefined | null): string {
    return String(str || '').replace(/[&<>"']/g, c =>
        ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c] as string)
    );
}

export function openModal(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        const first = el.querySelector<HTMLInputElement>(
            'input:not([readonly]), textarea'
        );
        first?.focus();
    }, 100);
}

export function closeModal(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = '';
}

export function setButtonLoading(
    btn: HTMLButtonElement | null,
    loading: boolean,
    text = 'Loading...'
): void {
    if (!btn) return;
    if (loading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> ${text}`;
    } else {
        btn.disabled = false;
        if (btn.dataset.originalText) {
            btn.innerHTML = btn.dataset.originalText;
            delete btn.dataset.originalText;
        }
    }
}

export function formatDate(date: Date | string | undefined | null): string {
    if (!date) return 'N/A';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Manila'
        });
    } catch {
        return 'N/A';
    }
}
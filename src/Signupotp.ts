import { requestSignupOtp, verifySignupOtp, signIn } from './auth';
import { showToast } from './ui';

const RESEND_SECONDS = 30;

let pending: { fullName: string; email: string; password: string } | null = null;
let cooldownTimer: number | undefined;

function el<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function value(id: string): string {
    return (el<HTMLInputElement>(id)?.value ?? '').trim();
}

function setOtpError(text: string): void {
    const box = el('signupOtpError');
    if (!box) return;
    box.textContent = text;
    box.hidden = !text;
}

function setBusy(btn: HTMLButtonElement | null, busy: boolean, busyText: string, idleText: string): void {
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? busyText : idleText;
}

function startCooldown(): void {
    const btn = el<HTMLButtonElement>('signupResendOtp');
    if (!btn) return;
    window.clearInterval(cooldownTimer);
    let left = RESEND_SECONDS;
    btn.disabled = true;
    btn.textContent = `Resend code (${left}s)`;
    cooldownTimer = window.setInterval(() => {
        left -= 1;
        if (left <= 0) {
            window.clearInterval(cooldownTimer);
            btn.disabled = false;
            btn.textContent = 'Resend code';
        } else {
            btn.textContent = `Resend code (${left}s)`;
        }
    }, 1000);
}

function showOtpStep(email: string): void {
    const signupForm = el<HTMLFormElement>('signupForm');
    const otpForm = el<HTMLFormElement>('signupOtpForm');
    const hint = el('signupOtpHint');
    if (!signupForm || !otpForm) return;

    signupForm.hidden = true;
    otpForm.hidden = false;
    if (hint) hint.textContent = `We sent a 6-digit code to ${email}. It expires in 10 minutes.`;
    setOtpError('');
    const input = el<HTMLInputElement>('signupOtp');
    if (input) {
        input.value = '';
        input.focus();
    }
    startCooldown();
}

// Itatago ang OTP form at ibabalik ang tamang form ayon sa kasalukuyang tab
function resetOtpFlow(): void {
    const signupForm = el<HTMLFormElement>('signupForm');
    const signinForm = el<HTMLFormElement>('signinForm');
    const otpForm = el<HTMLFormElement>('signupOtpForm');
    if (!otpForm || otpForm.hidden) return;

    otpForm.hidden = true;
    window.clearInterval(cooldownTimer);
    setOtpError('');
    const input = el<HTMLInputElement>('signupOtp');
    if (input) input.value = '';
    if (signupForm && signinForm) signupForm.hidden = !signinForm.hidden;
}

function closeAuthModalNow(): void {
    const modal = el('authModal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
}

async function handleRequest(): Promise<void> {
    const fullName = value('signupName');
    const email = value('signupEmail').toLowerCase();
    const password = el<HTMLInputElement>('signupPassword')?.value ?? '';
    const confirm = el<HTMLInputElement>('signupConfirmPassword')?.value ?? '';

    const btn = el<HTMLFormElement>('signupForm')?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    setBusy(btn, true, 'Sending code...', 'Create Account');

    const result = await requestSignupOtp(fullName, email, password, confirm);

    setBusy(btn, false, 'Sending code...', 'Create Account');

    if (!result.success) {
        showToast(result.message, 'error');
        return;
    }

    pending = { fullName, email, password };
    showToast(result.message, 'success');
    showOtpStep(email);
}

async function handleVerify(): Promise<void> {
    if (!pending) {
        setOtpError('Session expired. Please start sign up again.');
        return;
    }

    const btn = el<HTMLButtonElement>('signupOtpSubmit');
    setOtpError('');
    setBusy(btn, true, 'Verifying...', 'Verify & Create Account');

    const result = await verifySignupOtp(
        pending.fullName,
        pending.email,
        pending.password,
        value('signupOtp')
    );

    if (!result.success) {
        setBusy(btn, false, 'Verifying...', 'Verify & Create Account');
        setOtpError(result.message);
        return;
    }

    const { email, password } = pending;
    showToast('Account created!', 'success');

    const login = await signIn(email, password);
    setBusy(btn, false, 'Verifying...', 'Verify & Create Account');
    pending = null;

    if (login.success) {
        resetOtpFlow();
        closeAuthModalNow();
    } else {
        // Nagawa na ang account pero hindi nag-auto login: ibalik sa Sign In tab
        resetOtpFlow();
        (document.querySelector('[data-auth-tab="signin"]') as HTMLElement | null)?.click();
        showToast('Account created. Please sign in.', 'info');
    }
}

async function handleResend(): Promise<void> {
    if (!pending) return;
    const btn = el<HTMLButtonElement>('signupResendOtp');
    if (btn) btn.disabled = true;
    setOtpError('');

    const result = await requestSignupOtp(
        pending.fullName,
        pending.email,
        pending.password,
        pending.password
    );

    if (!result.success) {
        setOtpError(result.message);
        if (btn) btn.disabled = false;
        return;
    }
    showToast('A new code was sent.', 'success');
    startCooldown();
}

function init(): void {
    // Capture phase: nauuna ito sa lumang handler ng signupForm, kaya hindi na ito tatakbo
    document.addEventListener(
        'submit',
        (e) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            if (target.id === 'signupForm') {
                e.preventDefault();
                e.stopImmediatePropagation();
                void handleRequest();
            } else if (target.id === 'signupOtpForm') {
                e.preventDefault();
                e.stopImmediatePropagation();
                void handleVerify();
            }
        },
        true
    );

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        if (target.closest('#signupResendOtp')) {
            void handleResend();
            return;
        }

        if (target.closest('#signupOtpBack')) {
            const otpForm = el<HTMLFormElement>('signupOtpForm');
            const signupForm = el<HTMLFormElement>('signupForm');
            if (otpForm) otpForm.hidden = true;
            if (signupForm) signupForm.hidden = false;
            window.clearInterval(cooldownTimer);
            setOtpError('');
            return;
        }

        // Nagpalit ng tab o isinara ang modal habang nasa OTP step
        if (target.closest('[data-auth-tab], #closeAuthBtn')) {
            setTimeout(resetOtpFlow, 0);
        }
    });

    // Kapag sumara ang modal sa ibang paraan (Esc, click sa labas)
    const modal = el('authModal');
    if (modal) {
        new MutationObserver(() => {
            if (modal.hidden) resetOtpFlow();
        }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    }

    // OTP: numbers lang
    el<HTMLInputElement>('signupOtp')?.addEventListener('input', (e) => {
        const input = e.target as HTMLInputElement;
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
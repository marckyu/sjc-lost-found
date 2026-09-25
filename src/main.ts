import './pb';
import { pb } from './pb';
import { onAuthChange, getUserProfile, signOut, signIn, signUp } from './auth';
import { openModal, closeModal, showToast, escapeHtml } from './ui';
import { getUnreadCount } from './db';
import type { User } from './types';

let currentUser: User | null = null;

function isProtectedPage(): boolean {
    return /\/(admin|report)\.html$/.test(window.location.pathname);
}

function applyRoleUI(user: User | null): void {
    const hideReport = user?.role === 'admin';
    document.querySelectorAll<HTMLElement>('.nav-links a[href="report.html"]').forEach(link => {
        const target = (link.closest('li') as HTMLElement | null) ?? link;
        target.style.display = hideReport ? 'none' : '';
    });
    document.querySelectorAll<HTMLElement>('.nav-links a[href="index.html"]').forEach(link => {
        const target = (link.closest('li') as HTMLElement | null) ?? link;
        target.style.display = hideReport ? 'none' : '';
    });
}

function hideReportLinksIfCachedAdmin(): void {
    if (!pb.authStore.isValid) return;
    const rec = pb.authStore.record;
    if (rec?.role === 'admin') {
        document.documentElement.classList.add('is-admin');
        document.querySelectorAll<HTMLElement>('.nav-links a[href="report.html"], .nav-links a[href="index.html"]').forEach(link => {
            const target = (link.closest('li') as HTMLElement | null) ?? link;
            target.style.display = 'none';
        });
    }
}

hideReportLinksIfCachedAdmin();

async function loadUnreadCount(): Promise<void> {
    if (!currentUser) return;
    try {
        const count = await getUnreadCount(currentUser.uid);
        const badge = document.getElementById('navBellBadge');
        if (badge) {
            badge.textContent = String(count);
            badge.hidden = count === 0;
        }
    } catch (err) {
        console.error('Failed to load notification count:', err);
    }
}

function bindBell(): void {
    document.getElementById('navBell')?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = 'notifications.html';
    });
}

function updateNavAuth(user: User | null): void {
    const navAuth = document.getElementById('navAuth');
    if (!navAuth) return;

    if (user) {
        const isAdmin = user.role === 'admin';
        navAuth.innerHTML = `
            <div class="nav-actions">
                <button class="nav-bell" id="navBell" type="button" aria-label="Notifications">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
                    </svg>
                    <span class="nav-bell-badge" id="navBellBadge" hidden>0</span>
                </button>
                <div class="user-menu" id="userMenu">
                    <button class="user-menu-trigger" type="button" aria-haspopup="true" aria-expanded="false">
                        <span class="user-avatar">${escapeHtml(user.fullName.charAt(0).toUpperCase())}</span>
                        <span class="user-name">${escapeHtml(user.fullName)}</span>
                    </button>
                    <div class="dropdown-menu" role="menu">
                        ${isAdmin ? '<a href="admin.html" class="dashboard" role="menuitem">Dashboard</a>' : ''}
                        <a href="javascript:void(0)" data-signout role="menuitem" class="danger">Logout</a>
                    </div>
                </div>
            </div>
        `;

        bindBell();

        const userMenu = document.getElementById('userMenu')!;
        const trigger = userMenu.querySelector('.user-menu-trigger') as HTMLButtonElement;
        trigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('active');
            trigger.setAttribute(
                'aria-expanded',
                String(userMenu.classList.contains('active'))
            );
        });

        navAuth.querySelector('[data-signout]')?.addEventListener('click', async () => {
            await signOut();
            if (isProtectedPage()) {
                window.location.href = 'index.html';
                return;
            }
            showToast('Signed out.', 'info');
        });

        applyRoleUI(user);
        loadUnreadCount();
    } else {
        navAuth.innerHTML = `
            <button class="nav-button nav-button-outline" type="button" data-open-auth="signin">Sign In</button>
            <button class="nav-button nav-button-solid" type="button" data-open-auth="signup">Sign Up</button>
        `;
        bindAuthButtons();
        applyRoleUI(null);
    }
}

function bindAuthButtons(): void {
    document.querySelectorAll<HTMLElement>('[data-open-auth]').forEach(btn => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openAuthModal((btn.dataset.openAuth || 'signin') as 'signin' | 'signup');
        });
    });
}

function openAuthModal(tab: 'signin' | 'signup'): void {
    openModal('authModal');
    showTab(tab);
}

function showTab(tab: 'signin' | 'signup'): void {
    const isSignin = tab === 'signin';
    const signinForm = document.getElementById('signinForm');
    const signupForm = document.getElementById('signupForm');
    const signinTab = document.getElementById('signinTab');
    const signupTab = document.getElementById('signupTab');
    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');

    if (signinForm) signinForm.hidden = !isSignin;
    if (signupForm) signupForm.hidden = isSignin;
    signinTab?.classList.toggle('active', isSignin);
    signupTab?.classList.toggle('active', !isSignin);

    if (modalTitle) modalTitle.textContent = isSignin ? 'Welcome back' : 'Create your account';
    if (modalSubtitle) {
        modalSubtitle.textContent = isSignin
            ? 'Sign in to manage your lost and found reports.'
            : 'Sign up with your PHINMAEd email to get started.';
    }
}

function showAuthMessage(msg: string, type: 'success' | 'error'): void {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = msg;
    el.className = 'auth-message ' + type;
}

function hideAuthMessage(): void {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = '';
    el.className = 'auth-message';
}

function bindForms(): void {
    const signinForm = document.getElementById('signinForm') as HTMLFormElement | null;
    const signupForm = document.getElementById('signupForm') as HTMLFormElement | null;

    signinForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAuthMessage();

        const email = (document.getElementById('signinEmail') as HTMLInputElement).value.trim();
        const password = (document.getElementById('signinPassword') as HTMLInputElement).value;

        const result = await signIn(email, password);

        if (result.success && result.user) {
            showAuthMessage('Sign in successful! Redirecting...', 'success');
            setTimeout(() => {
                if (result.user!.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    closeModal('authModal');
                    updateNavAuth(result.user!);
                }
            }, 900);
        } else {
            showAuthMessage(result.message, 'error');
        }
    });

    signupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAuthMessage();

        const fullName = (document.getElementById('signupName') as HTMLInputElement).value.trim();
        const email = (document.getElementById('signupEmail') as HTMLInputElement).value.trim();
        const password = (document.getElementById('signupPassword') as HTMLInputElement).value;
        const confirmPassword = (document.getElementById('signupConfirmPassword') as HTMLInputElement).value;

        const result = await signUp(fullName, email, password, confirmPassword);

        if (result.success) {
            showAuthMessage(result.message, 'success');
            signupForm.reset();
            setTimeout(() => {
                showTab('signin');
                const signinEmail = document.getElementById('signinEmail') as HTMLInputElement;
                if (signinEmail) signinEmail.value = email;
                const signinPassword = document.getElementById('signinPassword') as HTMLInputElement;
                signinPassword?.focus();
            }, 1200);
        } else {
            showAuthMessage(result.message, 'error');
        }
    });
}

function bindTabs(): void {
    document.querySelectorAll<HTMLElement>('[data-auth-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            showTab((btn.dataset.authTab || 'signin') as 'signin' | 'signup');
        });
    });
}

function bindPasswordToggles(): void {
    document.querySelectorAll<HTMLElement>('[data-toggle-password]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const inputId = btn.dataset.togglePassword;
            if (!inputId) return;
            const input = document.getElementById(inputId) as HTMLInputElement;
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.textContent = isPassword ? 'Hide' : 'Show';
        });
    });
}

function bindModalClose(): void {
    document.getElementById('closeAuthBtn')?.addEventListener('click', () => closeModal('authModal'));

    const modal = document.getElementById('authModal');
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('authModal');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.hidden) closeModal('authModal');
    });

    document.addEventListener('click', () => {
        const userMenu = document.getElementById('userMenu');
        if (userMenu) userMenu.classList.remove('active');
    });
}

function bindHamburger(): void {
    const hamburger = document.getElementById('hamburgerBtn');
    const navLinks = document.getElementById('navLinks');
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('show');
        hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (e) => {
        if (
            navLinks.classList.contains('show') &&
            !hamburger.contains(e.target as Node) &&
            !navLinks.contains(e.target as Node)
        ) {
            navLinks.classList.remove('show');
            hamburger.setAttribute('aria-expanded', 'false');
        }
    });
}

function bindRequireAuth(): void {
    document.querySelectorAll<HTMLElement>('[data-require-auth]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!currentUser) {
                e.preventDefault();
                e.stopPropagation();
                showToast('Please Sign In or Sign Up first to continue.', 'warning');
                setTimeout(() => openAuthModal('signin'), 400);
            }
        });
    });
}

onAuthChange(async (fbUser) => {
    if (fbUser) {
        currentUser = await getUserProfile(fbUser.uid);
        updateNavAuth(currentUser);
    } else {
        currentUser = null;
        updateNavAuth(null);
    }
});

bindAuthButtons();
bindTabs();
bindPasswordToggles();
bindForms();
bindModalClose();
bindHamburger();
bindRequireAuth();

const lucide = (window as typeof window & { lucide?: { createIcons: () => void } }).lucide;
if (lucide) {
    try {
        lucide.createIcons();
    } catch { }
}
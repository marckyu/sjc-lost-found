import './pb';
import { pb } from './pb';
import { onAuthChange, getUserProfile, signOut, signIn, signUp } from './auth';
import { openModal, closeModal, showToast, escapeHtml } from './ui';
import { watchNotifications, watchUnreadMessages, watchAdminMessagesForUser, watchAllAdminMessages } from './db';
import { initAvatarUploader } from './profile';
import { initSync } from './offline/sync';
import { initOfflineIndicator, pulseSync } from './offline/indicator';
import type { User, Notification } from './types';

const __originalConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const err = args[1];
    if (err && err.status === 0) return;
    const msg = String(err?.message || '').toLowerCase();
    if (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('failed to fetch') ||
        msg.includes('err_internet') ||
        msg.includes('clientresponseerror')
    ) return;
    __originalConsoleError(...args);
};

let currentUser: User | null = null;
let notifUnsubscribe: (() => void) | null = null;
let msgUnreadUnsub: (() => void) | null = null;
let adminMsgUnreadUnsub: (() => void) | null = null;
let userMsgUnread = 0;
let adminMsgUnread = 0;

function isProtectedPage(): boolean {
    return /\/(admin|report|messages)\.html$/.test(window.location.pathname);
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

function updateBellBadge(notifs: Notification[]): void {
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('navBellBadge');
    if (badge) {
        badge.textContent = String(unread);
        badge.hidden = unread === 0;
    }
}

function injectMsgBadgeStyles(): void {
    if (document.getElementById('sjc-msg-badge-styles')) return;
    const style = document.createElement('style');
    style.id = 'sjc-msg-badge-styles';
    style.textContent = `
        .nav-msg-badge {
            position: absolute;
            top: 50%;
            right: 12px;
            transform: translateY(-50%);
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            display: grid;
            place-items: center;
            border-radius: 10px;
            color: #fff;
            background: #dc2626;
            font-size: 10px;
            font-weight: 800;
            line-height: 1;
            box-shadow: 0 2px 6px rgba(220, 38, 38, 0.35);
        }
        .bn-item { position: relative; }
        .bn-msg-badge {
            position: absolute;
            top: 4px;
            right: calc(50% - 22px);
            min-width: 16px;
            height: 16px;
            padding: 0 4px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            color: #fff;
            background: #dc2626;
            font-size: 9px;
            font-weight: 800;
            line-height: 1;
            border: 2px solid #fff;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }
    `;
    document.head.appendChild(style);
}

function attachMsgBadges(): void {
    document.querySelectorAll<HTMLAnchorElement>('a[href="messages.html"].dashboard').forEach(link => {
        if (link.querySelector('.nav-msg-badge')) return;
        if (getComputedStyle(link).position === 'static') {
            link.style.position = 'relative';
        }
        const badge = document.createElement('span');
        badge.className = 'nav-msg-badge';
        badge.dataset.msgBadge = 'dropdown';
        badge.hidden = true;
        badge.textContent = '0';
        link.appendChild(badge);
    });

    document.querySelectorAll<HTMLAnchorElement>('.bn-item[data-page="messages"]').forEach(item => {
        if (item.querySelector('.bn-msg-badge')) return;
        const badge = document.createElement('span');
        badge.className = 'bn-msg-badge';
        badge.dataset.msgBadge = 'bottom';
        badge.hidden = true;
        badge.textContent = '0';
        item.appendChild(badge);
    });
}

function setMsgBadge(count: number): void {
    document.querySelectorAll<HTMLElement>('[data-msg-badge]').forEach(b => {
        b.textContent = String(count);
        b.hidden = count === 0;
    });
}

function refreshMsgBadge(): void {
    setMsgBadge(userMsgUnread + adminMsgUnread);
}

function bindBell(): void {
    document.getElementById('navBell')?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = 'notifications.html';
    });
}

function renderAvatar(user: User): string {
    if (user.avatar) {
        return `<img src="${user.avatar}" alt="${escapeHtml(user.fullName)}">`;
    }
    return escapeHtml(user.fullName.charAt(0).toUpperCase());
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
                        <span class="user-avatar">${renderAvatar(user)}</span>
                        <span class="user-name">${escapeHtml(user.fullName)}</span>
                        <svg class="user-menu-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="dropdown-menu" role="menu">
                        <a href="javascript:void(0)" data-change-avatar class="dashboard" role="menuitem">Change Photo</a>
                        <a href="messages.html" class="dashboard" role="menuitem">Messages</a>
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

        navAuth.querySelector('[data-change-avatar]')?.addEventListener('click', async () => {
            const { openAvatarModal } = await import('./profile');
            openAvatarModal();
        });

        navAuth.querySelector('[data-signout]')?.addEventListener('click', async () => {
            await signOut();
            if (isProtectedPage()) {
                window.location.href = 'index.html';
                return;
            }
            showToast('Signed out.', 'info');
        });

        attachMsgBadges();
        applyRoleUI(user);
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

        pulseSync(900);

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

        pulseSync(900);

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
    if (notifUnsubscribe) {
        notifUnsubscribe();
        notifUnsubscribe = null;
    }
    if (msgUnreadUnsub) {
        msgUnreadUnsub();
        msgUnreadUnsub = null;
    }
    if (adminMsgUnreadUnsub) {
        adminMsgUnreadUnsub();
        adminMsgUnreadUnsub = null;
    }
    userMsgUnread = 0;
    adminMsgUnread = 0;
    refreshMsgBadge();

    if (fbUser) {
        currentUser = await getUserProfile(fbUser.uid);
        updateNavAuth(currentUser);

        if (currentUser) {
            const uid = currentUser.uid;
            notifUnsubscribe = watchNotifications(uid, (notifs) => {
                updateBellBadge(notifs);
            });

            msgUnreadUnsub = watchUnreadMessages(uid, (count) => {
                userMsgUnread = count;
                refreshMsgBadge();
            });

            if (currentUser.role === 'admin') {
                adminMsgUnreadUnsub = watchAllAdminMessages((msgs) => {
                    adminMsgUnread = msgs.filter(m => m.senderRole === 'user' && !m.read).length;
                    refreshMsgBadge();
                });
            } else {
                adminMsgUnreadUnsub = watchAdminMessagesForUser(uid, (msgs) => {
                    adminMsgUnread = msgs.filter(m => m.senderRole === 'admin' && !m.read).length;
                    refreshMsgBadge();
                });
            }
        }
    } else {
        currentUser = null;
        updateNavAuth(null);
    }
});

injectMsgBadgeStyles();
bindAuthButtons();
bindTabs();
bindPasswordToggles();
bindForms();
bindModalClose();
bindHamburger();
bindRequireAuth();
initAvatarUploader();

function updateBottomNav(): void {
    const path = window.location.pathname;
    let currentPage = 'index';
    if (path.includes('items.html')) currentPage = 'items';
    else if (path.includes('report.html')) currentPage = 'report';
    else if (path.includes('messages.html')) currentPage = 'messages';
    else if (path.includes('admin.html')) currentPage = 'admin';
    else if (path.includes('index.html') || path === '/' || path.endsWith('/')) currentPage = 'index';

    document.querySelectorAll<HTMLElement>('.bn-item[data-page]').forEach(item => {
        item.classList.toggle('is-active', item.dataset.page === currentPage);
    });
}

function bindBottomNav(): void {
    const profileBtn = document.getElementById('bnProfileBtn');
    if (!profileBtn) return;

    profileBtn.addEventListener('click', () => {
        if (!currentUser) {
            showToast('Please Sign In first.', 'warning');
            setTimeout(() => openAuthModal('signin'), 400);
            return;
        }

        const userMenu = document.getElementById('userMenu');
        if (userMenu) {
            userMenu.classList.toggle('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

updateBottomNav();
bindBottomNav();

initSync();
initOfflineIndicator();
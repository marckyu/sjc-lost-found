import './main';
import { watchNotifications, markAsRead, markAllAsRead, deleteNotification } from './db';
import { onAuthChange, getCurrentUser } from './auth';
import { showToast, escapeHtml, formatDate } from './ui';
import type { Notification, User } from './types';

let currentUser: User | null = null;
let allNotifs: Notification[] = [];
let notifUnsubscribe: (() => void) | null = null;

const listEl = document.getElementById('notifList');

function addAdminLink(): void {
    if (!currentUser || currentUser.role !== 'admin') return;
    const li = document.getElementById('navAdminLink');
    if (li) {
        li.innerHTML = '<a href="admin.html">Dashboard</a>';
    }
}

function renderNotifications(): void {
    if (!listEl) return;

    const countEl = document.getElementById('notifCount');
    if (countEl) {
        const unread = allNotifs.filter(n => !n.read).length;
        const total = allNotifs.length;
        countEl.textContent = `${total} notification${total === 1 ? '' : 's'} (${unread} unread)`;
    }

    if (allNotifs.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <p>No notifications yet.</p>
                <p style="font-size: 13px; margin-top: 8px; opacity: 0.7;">Updates will appear here once your report is verified or marked as recovered.</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = allNotifs.map(n => `
        <article class="notif-card ${n.read ? 'read' : 'unread'}" data-id="${n.id}">
            <div class="notif-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
                </svg>
            </div>
            <div class="notif-content">
                <p class="notif-message">${escapeHtml(n.message)}</p>
                <small class="notif-time">${formatDate(n.createdAt)}</small>
            </div>
            <button class="notif-delete" data-delete="${n.id}" aria-label="Delete notification">&times;</button>
        </article>
    `).join('');

    listEl.querySelectorAll<HTMLElement>('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.delete;
            if (!id) return;
            try {
                await deleteNotification(id);
            } catch (err) {
                console.error(err);
                showToast('Failed to delete notification.', 'error');
            }
        });
    });

    listEl.querySelectorAll<HTMLElement>('.notif-card').forEach(card => {
        card.addEventListener('click', async () => {
            const id = card.dataset.id;
            if (!id) return;
            const notif = allNotifs.find(n => n.id === id);
            if (!notif || notif.read) return;

            try {
                await markAsRead(id);
            } catch (err) {
                console.error(err);
            }
        });
    });
}

document.getElementById('markAllReadBtn')?.addEventListener('click', async () => {
    if (!currentUser || allNotifs.length === 0) return;
    try {
        await markAllAsRead(currentUser.uid);
        showToast('All notifications marked as read.', 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to mark all as read.', 'error');
    }
});

onAuthChange(async (fbUser) => {
    if (notifUnsubscribe) {
        notifUnsubscribe();
        notifUnsubscribe = null;
    }

    if (fbUser) {
        currentUser = await getCurrentUser();
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }
        addAdminLink();

        const uid = currentUser.uid;
        notifUnsubscribe = watchNotifications(uid, (notifs) => {
            allNotifs = notifs;
            renderNotifications();
        });
    } else {
        window.location.href = 'index.html';
    }
});
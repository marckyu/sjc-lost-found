import { getCurrentUser, signOut } from './auth';
import { watchItems, verifyItem, deleteItem, toggleItemStatus, sendNotification, markAsRecovered, getUnreadCount } from './db';
import { showToast, escapeHtml, formatDate } from './ui';
import type { Item, User } from './types';

let currentUser: User | null = null;
let allItems: Item[] = [];

const itemsList = document.getElementById('itemsList');

function renderStats(): void {
    const total = document.getElementById('totalItems');
    const lost = document.getElementById('lostItems');
    const found = document.getElementById('foundItems');
    const verified = document.getElementById('verifiedItems');
    const recovered = document.getElementById('recoveredItems');

    if (total) total.textContent = String(allItems.length);
    if (lost) lost.textContent = String(allItems.filter(i => i.status === 'lost' && !i.recovered).length);
    if (found) found.textContent = String(allItems.filter(i => i.status === 'found' && !i.recovered).length);
    if (verified) verified.textContent = String(allItems.filter(i => i.verified && !i.recovered).length);
    if (recovered) recovered.textContent = String(allItems.filter(i => i.recovered).length);
}

function getFilteredItems(): Item[] {
    const searchEl = document.getElementById('tableSearch') as HTMLInputElement | null;
    const filterEl = document.getElementById('statusFilter') as HTMLSelectElement | null;
    const search = searchEl?.value.toLowerCase().trim() || '';
    const filter = filterEl?.value || 'all';

    let filtered = allItems;

    if (search) {
        filtered = filtered.filter(i =>
            i.itemName.toLowerCase().includes(search) ||
            i.userName.toLowerCase().includes(search) ||
            i.userEmail.toLowerCase().includes(search) ||
            i.location.toLowerCase().includes(search)
        );
    }

    if (filter === 'lost') {
        filtered = filtered.filter(i => i.status === 'lost' && !i.recovered);
    } else if (filter === 'found') {
        filtered = filtered.filter(i => i.status === 'found' && !i.recovered);
    } else if (filter === 'verified') {
        filtered = filtered.filter(i => i.verified && !i.recovered);
    } else if (filter === 'pending') {
        filtered = filtered.filter(i => !i.verified && !i.recovered);
    } else if (filter === 'recovered') {
        filtered = filtered.filter(i => i.recovered);
    }

    return filtered;
}

function renderTable(): void {
    if (!itemsList) return;

    const filtered = getFilteredItems();

    if (filtered.length === 0) {
        itemsList.innerHTML = '<div class="empty-state"><p>No items found.</p></div>';
        return;
    }

    let html = `
        <table class="items-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Reported By</th>
                    <th>Contact</th>
                    <th>Image</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    filtered.forEach(item => {
        let statusClass = 'status-pending';
        let statusText = 'Pending';

        if (item.recovered) {
            statusClass = 'status-recovered';
            statusText = '✓ Recovered';
        } else if (item.verified) {
            statusClass = 'status-verified';
            statusText = 'Verified';
        } else if (item.status === 'lost') {
            statusClass = 'status-lost';
            statusText = 'Lost';
        } else if (item.status === 'found') {
            statusClass = 'status-found';
            statusText = 'Found';
        }

        const imageCell =
            item.imageUrls.length > 0
                ? `<img class="image-thumb" src="${item.imageUrls[0]}" alt="Item" data-image-src="${item.imageUrls[0]}">`
                : '—';

        let actionsHtml = '';

        if (!item.recovered) {
            if (!item.verified) {
                actionsHtml += `<button class="action-btn verify" data-action="verify" data-id="${item.id}">Verify</button>`;
            }
            if (item.verified) {
                actionsHtml += `<button class="action-btn recover" data-action="recover" data-id="${item.id}">Recovered</button>`;
            }
            actionsHtml += `<button class="action-btn notify" data-action="notify" data-id="${item.id}">Notify</button>`;
            actionsHtml += `<button class="action-btn toggle" data-action="toggle" data-id="${item.id}">Toggle</button>`;
        }
        actionsHtml += `<button class="action-btn delete" data-action="delete" data-id="${item.id}">Delete</button>`;

        html += `
            <tr>
                <td data-label="Item">${escapeHtml(item.itemName)}</td>
                <td data-label="Category">${escapeHtml(item.category)}</td>
                <td data-label="Location">${escapeHtml(item.location)}</td>
                <td data-label="Status"><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td data-label="Date">${formatDate(item.createdAt)}</td>
                <td data-label="By">${escapeHtml(item.userName)}</td>
                <td data-label="Contact"><a href="mailto:${escapeHtml(item.userEmail)}" class="contact-link">${escapeHtml(item.userEmail)}</a></td>
                <td data-label="Image">${imageCell}</td>
                <td data-label="Actions">${actionsHtml}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    itemsList.innerHTML = html;

    bindActions();
}

function bindActions(): void {
    if (!itemsList) return;

    itemsList.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const action = btn.dataset.action;
            if (!id || !action) return;

            const item = allItems.find(i => i.id === id);
            if (!item) return;

            if (action === 'verify') {
                if (!confirm(`Verify "${item.itemName}" as a legitimate report?`)) return;
                try {
                    await verifyItem(id);
                    await sendNotification(
                        item.userId,
                        item.id,
                        `Good news! Your report "${item.itemName}" has been verified by the admin.`
                    );
                    showToast(`"${item.itemName}" verified successfully.`, 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Failed to verify item.', 'error');
                }
            } else if (action === 'recover') {
                if (!confirm(`Mark "${item.itemName}" as RECOVERED? This means the item has been returned to its owner.`)) return;
                if (!currentUser) return;
                try {
                    await markAsRecovered(id, currentUser.uid);
                    await sendNotification(
                        item.userId,
                        item.id,
                        `Great news! "${item.itemName}" has been marked as recovered. Thank you for reporting!`
                    );
                    showToast(`"${item.itemName}" marked as recovered.`, 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Failed to mark item as recovered.', 'error');
                }
            } else if (action === 'toggle') {
                try {
                    const next = await toggleItemStatus(id, item.status);
                    showToast(`Status changed to "${next}".`, 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Failed to toggle status.', 'error');
                }
            } else if (action === 'delete') {
                if (!confirm(`Delete "${item.itemName}"? This cannot be undone.`)) return;
                try {
                    await deleteItem(id, item.imageUrls);
                    showToast('Item deleted.', 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Failed to delete item.', 'error');
                }
            } else if (action === 'notify') {
                openNotifyModal(item);
            }
        });
    });

    itemsList.querySelectorAll<HTMLImageElement>('.image-thumb').forEach(img => {
        img.addEventListener('click', () => {
            const src = img.dataset.imageSrc || img.src;
            openImageModal(src);
        });
    });
}

function openNotifyModal(item: Item): void {
    const modal = document.getElementById('notifyModal');
    const toInput = document.getElementById('notifyTo') as HTMLInputElement | null;
    const subjectInput = document.getElementById('notifySubject') as HTMLInputElement | null;
    const messageInput = document.getElementById('notifyMessage') as HTMLTextAreaElement | null;

    if (!modal || !toInput || !subjectInput || !messageInput) return;

    toInput.value = item.userEmail;
    subjectInput.value = `Update about your ${item.itemName}`;
    messageInput.value = `Good news! We have an update about your ${item.itemName}.`;
    modal.dataset.itemId = item.id;
    modal.dataset.userId = item.userId;

    updateCharCounter();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeNotifyModal(): void {
    const modal = document.getElementById('notifyModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
}

function updateCharCounter(): void {
    const messageInput = document.getElementById('notifyMessage') as HTMLTextAreaElement | null;
    const counter = document.getElementById('notifyCounter');
    if (!messageInput || !counter) return;

    const max = Number(messageInput.dataset.max) || 500;
    const len = messageInput.value.length;

    counter.textContent = `${len} / ${max}`;
    counter.classList.remove('warning', 'danger');
    if (len > max) counter.classList.add('danger');
    else if (len > max * 0.8) counter.classList.add('warning');
}

async function handleSendNotification(): Promise<void> {
    const modal = document.getElementById('notifyModal');
    if (!modal) return;

    const itemId = modal.dataset.itemId;
    const userId = modal.dataset.userId;
    const subjectInput = document.getElementById('notifySubject') as HTMLInputElement | null;
    const messageInput = document.getElementById('notifyMessage') as HTMLTextAreaElement | null;
    const sendBtn = document.getElementById('notifySend') as HTMLButtonElement | null;

    if (!itemId || !userId || !subjectInput || !messageInput) return;

    const subject = subjectInput.value.trim();
    const message = messageInput.value.trim();

    if (!subject || !message) {
        showToast('Please fill in both subject and message.', 'warning');
        return;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="spinner"></span> Sending...';
    }

    try {
        await sendNotification(userId, itemId, `${subject} — ${message}`);
        showToast('Notification sent successfully.', 'success');
        closeNotifyModal();
    } catch (err) {
        console.error(err);
        showToast('Failed to send notification.', 'error');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
        }
    }
}

function openImageModal(src: string): void {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('imageModalImg') as HTMLImageElement | null;
    if (!modal || !img) return;

    img.src = src;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImageModal(): void {
    const modal = document.getElementById('imageModal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

async function handleClearAll(): Promise<void> {
    if (allItems.length === 0) {
        showToast('Nothing to clear.', 'info');
        return;
    }

    if (!confirm(`Delete ALL ${allItems.length} items? This cannot be undone.`)) return;

    try {
        await Promise.all(allItems.map(item => deleteItem(item.id, item.imageUrls)));
        showToast('All items cleared.', 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to clear items.', 'error');
    }
}

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

function renderAdminNav(): void {
    const navAuth = document.getElementById('navAuth');
    if (!navAuth || !currentUser) return;

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
                    <span class="user-avatar">${escapeHtml(currentUser.fullName.charAt(0).toUpperCase())}</span>
                    <span class="user-name">${escapeHtml(currentUser.fullName)}</span>
                </button>
                <div class="dropdown-menu" role="menu">
                    <a href="javascript:void(0)" data-signout role="menuitem" class="danger">Logout</a>
                </div>
            </div>
        </div>
    `;

    document.getElementById('navBell')?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = 'notifications.html';
    });

    const userMenu = document.getElementById('userMenu');
    const trigger = userMenu?.querySelector('.user-menu-trigger') as HTMLButtonElement | null;
    trigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu!.classList.toggle('active');
        trigger.setAttribute('aria-expanded', String(userMenu!.classList.contains('active')));
    });

    navAuth.querySelector('[data-signout]')?.addEventListener('click', async () => {
        await signOut();
        window.location.href = 'index.html';
    });

    loadUnreadCount();
}

function bindUI(): void {
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        showToast('List refreshed.', 'info');
    });

    document.getElementById('clearBtn')?.addEventListener('click', handleClearAll);

    document.getElementById('notifySend')?.addEventListener('click', handleSendNotification);

    document.getElementById('notifyMessage')?.addEventListener('input', updateCharCounter);

    const searchInput = document.getElementById('tableSearch') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => renderTable());

    const statusFilter = document.getElementById('statusFilter') as HTMLSelectElement | null;
    statusFilter?.addEventListener('change', () => renderTable());

    document.querySelectorAll<HTMLElement>('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal') as HTMLElement | null;
            if (modal) {
                modal.hidden = true;
                document.body.style.overflow = '';
            }
        });
    });

    document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.hidden = true;
                document.body.style.overflow = '';
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll<HTMLElement>('.modal:not([hidden])').forEach(m => {
                m.hidden = true;
            });
            document.body.style.overflow = '';
            closeImageModal();
        }
    });

    const imageModal = document.getElementById('imageModal');
    if (imageModal) {
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) closeImageModal();
        });
        imageModal.querySelector('.image-modal-close')?.addEventListener('click', closeImageModal);
    }

    const hamburger = document.getElementById('hamburgerBtn');
    const navLinks = document.getElementById('navLinks');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
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

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('show');
                hamburger.setAttribute('aria-expanded', 'false');
            });
        });
    }

    document.addEventListener('click', () => {
        const userMenu = document.getElementById('userMenu');
        if (userMenu) userMenu.classList.remove('active');
    });
}

async function initializeAdmin(): Promise<void> {
    try {
        const profile = await getCurrentUser();

        if (!profile) {
            window.location.href = 'index.html';
            return;
        }

        if (profile.role !== 'admin') {
            window.location.href = 'index.html';
            return;
        }

        currentUser = profile;
        renderAdminNav();
        bindUI();

        watchItems(items => {
            allItems = items;
            renderStats();
            renderTable();
        });
    } catch (err) {
        console.error('[admin] Error:', err);
        window.location.href = 'index.html';
    }
}

initializeAdmin();
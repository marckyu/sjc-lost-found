import { getCurrentUser } from './auth';
import { watchItems, verifyItem, deleteItem, toggleItemStatus, sendNotification } from './db';
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

    if (total) total.textContent = String(allItems.length);
    if (lost) lost.textContent = String(allItems.filter(i => i.status === 'lost').length);
    if (found) found.textContent = String(allItems.filter(i => i.status === 'found').length);
    if (verified) verified.textContent = String(allItems.filter(i => i.verified).length);
}

function renderTable(): void {
    if (!itemsList) return;

    if (allItems.length === 0) {
        itemsList.innerHTML = '<div class="empty-state"><p>No items reported yet.</p></div>';
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

    allItems.forEach(item => {
        let statusClass = 'status-pending';
        let statusText = 'Pending';

        if (item.verified) {
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
                <td data-label="Actions">
                    ${!item.verified ? `<button class="action-btn verify" data-action="verify" data-id="${item.id}">Verify</button>` : ''}
                    <button class="action-btn notify" data-action="notify" data-id="${item.id}">Notify</button>
                    <button class="action-btn toggle" data-action="toggle" data-id="${item.id}">Toggle</button>
                    <button class="action-btn delete" data-action="delete" data-id="${item.id}">Delete</button>
                </td>
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
                    showToast(`"${item.itemName}" verified successfully.`, 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Failed to verify item.', 'error');
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

function bindUI(): void {
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        showToast('List refreshed.', 'info');
    });

    document.getElementById('clearBtn')?.addEventListener('click', handleClearAll);

    document.getElementById('notifySend')?.addEventListener('click', handleSendNotification);

    document.getElementById('notifyMessage')?.addEventListener('input', updateCharCounter);

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
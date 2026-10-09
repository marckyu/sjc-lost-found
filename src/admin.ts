import { getCurrentUser, signOut } from './auth';
import {
    watchItems, verifyItem, deleteItem, toggleItemStatus,
    sendNotification, markAsRecovered, watchNotifications,
    watchClaims, approveClaim, rejectClaim, createConversation,
    watchAllAdminMessages, getAdminMessagesForThread,
    buildAdminThreads, markAdminThreadAsRead, getUsersByIds,
    watchUnreadMessages
} from './db';
import { sendAdminMessageOffline } from './offline/wrappers';
import { showToast, escapeHtml, formatDate } from './ui';
import { runMatching } from './matcher';
import type { Item, User, Notification, Claim, AdminMessage, AdminThread } from './types';

let currentUser: User | null = null;
let allItems: Item[] = [];
let allClaims: Claim[] = [];
let allAdminMessages: AdminMessage[] = [];
let allAdminThreads: AdminThread[] = [];
let activeThread: AdminThread | null = null;
let notifUnsubscribe: (() => void) | null = null;
let adminMsgsUnsubscribe: (() => void) | null = null;
let msgUnreadUnsub: (() => void) | null = null;
let threadMsgsUnsubscribe: (() => void) | null = null;
let activeClaim: Claim | null = null;
let userMsgUnread = 0;
let adminMsgUnread = 0;

let userCache = new Map<string, { fullname: string; avatar: string }>();

const itemsList = document.getElementById('itemsList');
const claimsList = document.getElementById('claimsList');
const inquiryList = document.getElementById('inquiryList');
const inquiryMessages = document.getElementById('inquiryMessages');
const inquiryEmpty = document.getElementById('inquiryEmpty');
const inquiryActive = document.getElementById('inquiryActive');
const inquiryHeaderName = document.getElementById('inquiryHeaderName');
const inquiryHeaderItem = document.getElementById('inquiryHeaderItem');
const inquiryReplyForm = document.getElementById('inquiryReplyForm') as HTMLFormElement | null;
const inquiryReplyInput = document.getElementById('inquiryReplyInput') as HTMLInputElement | null;

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

function renderClaims(): void {
    if (!claimsList) return;

    const pending = allClaims.filter(c => c.status === 'pending');
    const countEl = document.getElementById('claimsCount');
    if (countEl) countEl.textContent = String(pending.length);

    if (allClaims.length === 0) {
        claimsList.innerHTML = '<div class="empty-state"><p>No claim requests yet.</p></div>';
        return;
    }

    claimsList.innerHTML = allClaims.map(claim => {
        let statusClass = 'claim-status-pending';
        let statusText = 'Pending';

        if (claim.status === 'approved') {
            statusClass = 'claim-status-approved';
            statusText = 'Approved';
        } else if (claim.status === 'rejected') {
            statusClass = 'claim-status-rejected';
            statusText = 'Rejected';
        }

        const item = allItems.find(i => i.id === claim.itemId);
        const itemThumb = item && item.imageUrls.length > 0
            ? `<img class="claim-thumb" src="${item.imageUrls[0]}" alt="Item">`
            : `<div class="claim-thumb-placeholder">?</div>`;

        const info = userCache.get(claim.userId);
        const avatar = info?.avatar;
        const initial = (claim.userName || '?').charAt(0).toUpperCase();

        const claimantAvatar = avatar
            ? `<img src="${avatar}" alt="${escapeHtml(claim.userName)}" class="claim-claimant-avatar">`
            : `<span class="claim-claimant-avatar">${escapeHtml(initial)}</span>`;

        let actionsHtml = '';
        if (claim.status === 'pending') {
            actionsHtml = `
                <button class="admin-button" data-claim-action="review" data-id="${claim.id}">Review</button>
            `;
        }

        return `
            <article class="claim-card">
                ${itemThumb}
                <div class="claim-card-body">
                    <div class="claim-card-head">
                        <div>
                            <strong class="claim-item-name">${escapeHtml(claim.itemName)}</strong>
                            <span class="claim-status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <small class="claim-date">${formatDate(claim.createdAt)}</small>
                    </div>
                    <div class="claim-claimant-row">
                        ${claimantAvatar}
                        <span class="claim-claimant-name">${escapeHtml(claim.userName)}</span>
                    </div>
                    <div class="claim-card-grid">
                        <div>
                            <span class="claim-label">Contact</span>
                            <span class="claim-value">${escapeHtml(claim.contactNumber)}</span>
                        </div>
                        <div>
                            <span class="claim-label">Email</span>
                            <span class="claim-value">${escapeHtml(claim.userEmail)}</span>
                        </div>
                    </div>
                    <div class="claim-proof">
                        <span class="claim-label">Proof of Ownership</span>
                        <p>${escapeHtml(claim.proof)}</p>
                    </div>
                    ${claim.adminNote ? `<div class="claim-admin-note"><strong>Admin Note:</strong> ${escapeHtml(claim.adminNote)}</div>` : ''}
                    <div class="claim-actions">${actionsHtml}</div>
                </div>
            </article>
        `;
    }).join('');

    claimsList.querySelectorAll<HTMLButtonElement>('[data-claim-action="review"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            if (!id) return;
            const claim = allClaims.find(c => c.id === id);
            if (!claim) return;
            openReviewModal(claim);
        });
    });
}

function renderInquiryList(): void {
    if (!inquiryList) return;

    const unreadTotal = allAdminThreads.reduce((sum, t) => sum + t.unreadCount, 0);
    const countEl = document.getElementById('inquiryCount');
    if (countEl) countEl.textContent = String(unreadTotal);

    if (allAdminThreads.length === 0) {
        inquiryList.innerHTML = '<div class="empty-state"><p>No inquiries yet.</p></div>';
        return;
    }

    inquiryList.innerHTML = allAdminThreads.map(thread => {
        const isActive = activeThread?.userId === thread.userId && activeThread?.itemId === thread.itemId;
        const initial = (thread.userName || '?').charAt(0).toUpperCase();
        const info = userCache.get(thread.userId);
        const avatar = info?.avatar;

        const avatarHtml = avatar
            ? `<img src="${avatar}" alt="${escapeHtml(thread.userName)}">`
            : escapeHtml(initial);

        const preview = thread.lastMessage.length > 40
            ? thread.lastMessage.substring(0, 40) + '…'
            : thread.lastMessage;
        const time = formatDate(thread.lastMessageAt);
        const unreadBadge = thread.unreadCount > 0
            ? `<span class="inquiry-unread">${thread.unreadCount}</span>`
            : '';

        return `
            <button class="inquiry-item ${isActive ? 'active' : ''}"
                    data-user-id="${thread.userId}"
                    data-item-id="${thread.itemId}"
                    type="button">
                <span class="inquiry-avatar">${avatarHtml}</span>
                <span class="inquiry-info">
                    <span class="inquiry-top">
                        <strong>${escapeHtml(thread.userName)} ${unreadBadge}</strong>
                        <small>${time}</small>
                    </span>
                    <span class="inquiry-preview">${escapeHtml(preview)}</span>
                    <span class="inquiry-item-name">Re: ${escapeHtml(thread.itemName)}</span>
                </span>
            </button>
        `;
    }).join('');

    inquiryList.querySelectorAll<HTMLElement>('[data-user-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.userId;
            const itemId = btn.dataset.itemId;
            if (!userId || !itemId) return;
            const thread = allAdminThreads.find(t => t.userId === userId && t.itemId === itemId);
            if (!thread) return;
            openInquiryThread(thread);
        });
    });
}

function openInquiryThread(thread: AdminThread): void {
    if (threadMsgsUnsubscribe) {
        threadMsgsUnsubscribe();
        threadMsgsUnsubscribe = null;
    }

    activeThread = thread;

    if (inquiryHeaderName) inquiryHeaderName.textContent = thread.userName;
    if (inquiryHeaderItem) inquiryHeaderItem.textContent = `${thread.userEmail} — Re: ${thread.itemName}`;

    if (inquiryEmpty) inquiryEmpty.hidden = true;
    if (inquiryActive) inquiryActive.hidden = false;

    renderInquiryList();

    threadMsgsUnsubscribe = watchAdminMessagesForThread(thread.userId, thread.itemId, (msgs) => {
        renderThreadMessages(msgs);
    });

    markAdminThreadAsRead(thread.userId, thread.itemId, 'admin').catch(err => {
        console.error('Failed to mark as read:', err);
    });
}

function renderThreadMessages(msgs: AdminMessage[]): void {
    if (!inquiryMessages) return;

    if (msgs.length === 0) {
        inquiryMessages.innerHTML = '<div class="inquiry-empty" style="padding:20px;"><p>No messages yet.</p></div>';
        return;
    }

    inquiryMessages.innerHTML = msgs.map(m => {
        const isAdmin = m.senderRole === 'admin';
        return `
            <div class="inquiry-bubble ${isAdmin ? 'admin' : 'user'}" data-msg-id="${m.id}">
                ${!isAdmin ? `<span class="inquiry-bubble-sender">${escapeHtml(m.userName)}</span>` : ''}
                <p class="inquiry-bubble-text">${escapeHtml(m.text)}</p>
                <small class="inquiry-bubble-time">${formatDate(m.createdAt)}</small>
            </div>
        `;
    }).join('');

    inquiryMessages.scrollTop = inquiryMessages.scrollHeight;
}

function watchAdminMessagesForThread(
    uid: string,
    itemId: string,
    callback: (msgs: AdminMessage[]) => void
): () => void {
    let stopped = false;
    let unsub: (() => void) | null = null;

    const load = async () => {
        try {
            const msgs = await getAdminMessagesForThread(uid, itemId);
            if (!stopped) callback(msgs);
        } catch (err) {
            console.error('Failed to load thread:', err);
        }
    };

    load();

    import('./db').then(() => {
        unsub = watchAllAdminMessages((allMsgs) => {
            const filtered = allMsgs
                .filter(m => m.userId === uid && m.itemId === itemId)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            if (!stopped) callback(filtered);
        });
    });

    return () => {
        stopped = true;
        if (unsub) unsub();
    };
}

function openReviewModal(claim: Claim): void {
    const modal = document.getElementById('reviewModal');
    const info = document.getElementById('reviewClaimInfo');
    const noteInput = document.getElementById('reviewNote') as HTMLTextAreaElement | null;
    if (!modal || !info) return;

    activeClaim = claim;
    if (noteInput) noteInput.value = '';

    info.innerHTML = `
        <div class="review-row">
            <span class="review-label">Item</span>
            <span class="review-value">${escapeHtml(claim.itemName)}</span>
        </div>
        <div class="review-row">
            <span class="review-label">Claimant</span>
            <span class="review-value">${escapeHtml(claim.userName)}</span>
        </div>
        <div class="review-row">
            <span class="review-label">Contact</span>
            <span class="review-value">${escapeHtml(claim.contactNumber)}</span>
        </div>
        <div class="review-row">
            <span class="review-label">Proof</span>
            <span class="review-value">${escapeHtml(claim.proof)}</span>
        </div>
    `;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeReviewModal(): void {
    const modal = document.getElementById('reviewModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    activeClaim = null;
}

async function handleApprove(): Promise<void> {
    if (!activeClaim || !currentUser) return;
    const noteInput = document.getElementById('reviewNote') as HTMLTextAreaElement | null;
    const note = noteInput?.value.trim() || '';

    const approveBtn = document.getElementById('approveBtn') as HTMLButtonElement | null;
    if (approveBtn) approveBtn.disabled = true;

    try {
        await approveClaim(activeClaim.id, currentUser.uid, note);

        const item = allItems.find(i => i.id === activeClaim!.itemId);
        await sendNotification(
            activeClaim.userId,
            activeClaim.itemId,
            `Great news! Your claim for "${activeClaim.itemName}" has been APPROVED. Please visit the SJC office to claim your item.${note ? ' Note: ' + note : ''}`
        );

        if (item) {
            await markAsRecovered(item.id, currentUser.uid);

            try {
                await createConversation({
                    itemId: item.id,
                    itemName: item.itemName,
                    user1Id: item.userId,
                    user1Name: item.userName,
                    user2Id: activeClaim!.userId,
                    user2Name: activeClaim!.userName
                });
            } catch (convErr) {
                console.error('Failed to create conversation:', convErr);
            }
        }

        showToast('Claim approved successfully.', 'success');
        closeReviewModal();
    } catch (err) {
        console.error(err);
        showToast('Failed to approve claim.', 'error');
    } finally {
        if (approveBtn) approveBtn.disabled = false;
    }
}

async function handleReject(): Promise<void> {
    if (!activeClaim || !currentUser) return;
    const noteInput = document.getElementById('reviewNote') as HTMLTextAreaElement | null;
    const note = noteInput?.value.trim() || '';

    const rejectBtn = document.getElementById('rejectBtn') as HTMLButtonElement | null;
    if (rejectBtn) rejectBtn.disabled = true;

    try {
        await rejectClaim(activeClaim.id, currentUser.uid, note);
        await sendNotification(
            activeClaim.userId,
            activeClaim.itemId,
            `We're sorry, but your claim for "${activeClaim.itemName}" was not approved.${note ? ' Reason: ' + note : ''}`
        );

        showToast('Claim rejected.', 'info');
        closeReviewModal();
    } catch (err) {
        console.error(err);
        showToast('Failed to reject claim.', 'error');
    } finally {
        if (rejectBtn) rejectBtn.disabled = false;
    }
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
            statusText = 'Recovered';
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

        const info = userCache.get(item.userId);
        const avatar = info?.avatar;
        const initial = (item.userName || '?').charAt(0).toUpperCase();

        const reporterAvatar = avatar
            ? `<img src="${avatar}" alt="${escapeHtml(item.userName)}" class="table-avatar">`
            : `<span class="table-avatar">${escapeHtml(initial)}</span>`;

        html += `
            <tr>
                <td data-label="Item">${escapeHtml(item.itemName)}</td>
                <td data-label="Category">${escapeHtml(item.category)}</td>
                <td data-label="Location">${escapeHtml(item.location)}</td>
                <td data-label="Status"><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td data-label="Date">${formatDate(item.createdAt)}</td>
                <td data-label="By">
                    <div class="user-cell">
                        ${reporterAvatar}
                        <span>${escapeHtml(item.userName)}</span>
                    </div>
                </td>
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

                    try {
                        const matches = await runMatching(item);
                        if (matches.length > 0) {
                            showToast(`AI found ${matches.length} match(es) for "${item.itemName}".`, 'success');
                        }
                    } catch (matchErr) {
                        console.error('Matching failed:', matchErr);
                    }

                    const verifyMsg = `Good news! Your report "${item.itemName}" has been verified by the admin.`;
                    await sendNotification(item.userId, item.id, verifyMsg);
                    try {
                        await sendAdminMessageOffline({
                            userId: item.userId,
                            userName: item.userName,
                            userEmail: item.userEmail,
                            itemId: item.id,
                            itemName: item.itemName,
                            senderRole: 'admin',
                            text: verifyMsg
                        });
                    } catch (msgErr) {
                        console.error('Failed to open admin thread:', msgErr);
                    }
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
                    const recoverMsg = `Great news! "${item.itemName}" has been marked as recovered. Thank you for reporting!`;
                    await sendNotification(item.userId, item.id, recoverMsg);
                    try {
                        await sendAdminMessageOffline({
                            userId: item.userId,
                            userName: item.userName,
                            userEmail: item.userEmail,
                            itemId: item.id,
                            itemName: item.itemName,
                            senderRole: 'admin',
                            text: recoverMsg
                        });
                    } catch (msgErr) {
                        console.error('Failed to open admin thread:', msgErr);
                    }
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

async function handleRunAiMatch(): Promise<void> {
    const btn = document.getElementById('testMatchBtn') as HTMLButtonElement | null;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Running...';
    }

    showToast('Running AI matching on all items...', 'info');

    try {
        const matches = await runMatching();

        if (matches.length > 0) {
            showToast(`AI found ${matches.length} match(es) in existing items!`, 'success');

            const summary = matches
                .map(
                    m =>
                        `• "${m.lostItem.itemName}" ↔ "${m.foundItem.itemName}" (${m.score}%)`
                )
                .join('\n');

            console.log('[AI Match Results]\n' + summary);
        } else {
            showToast('No matches found in existing items.', 'info');
        }
    } catch (err: any) {
        console.error('[admin] AI matching failed:', err);
        console.error('[admin] error message:', err?.message);
        showToast(`AI matching failed: ${err?.message || 'Check console'}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Run AI Match';
        }
    }
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
        const fullText = `${subject} — ${message}`;
        await sendNotification(userId, itemId, fullText);

        const item = allItems.find(i => i.id === itemId);
        if (item) {
            try {
                await sendAdminMessageOffline({
                    userId: item.userId,
                    userName: item.userName,
                    userEmail: item.userEmail,
                    itemId: item.id,
                    itemName: item.itemName,
                    senderRole: 'admin',
                    text: fullText
                });
            } catch (msgErr) {
                console.error('Failed to open admin thread:', msgErr);
            }
        }

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

async function handleSendAdminReply(): Promise<void> {
    if (!currentUser || !activeThread || !inquiryReplyInput) return;

    const text = inquiryReplyInput.value.trim();
    if (!text) return;

    inquiryReplyInput.value = '';
    inquiryReplyInput.focus();

    try {
        await sendAdminMessageOffline({
            userId: activeThread.userId,
            userName: activeThread.userName,
            userEmail: activeThread.userEmail,
            itemId: activeThread.itemId,
            itemName: activeThread.itemName,
            senderRole: 'admin',
            text
        });
    } catch (err) {
        console.error(err);
        showToast('Failed to send reply.', 'error');
        inquiryReplyInput.value = text;
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

function updateBellBadge(notifs: Notification[]): void {
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('navBellBadge');
    if (badge) {
        badge.textContent = String(unread);
        badge.hidden = unread === 0;
    }
}

function renderAvatar(user: User): string {
    if (user.avatar) {
        return `<img src="${user.avatar}" alt="${escapeHtml(user.fullName)}">`;
    }
    return escapeHtml(user.fullName.charAt(0).toUpperCase());
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
    `;
    document.head.appendChild(style);
}

function attachMsgBadge(): void {
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
}

function refreshMsgBadge(): void {
    const total = userMsgUnread + adminMsgUnread;
    document.querySelectorAll<HTMLElement>('[data-msg-badge]').forEach(b => {
        b.textContent = String(total);
        b.hidden = total === 0;
    });
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
                    <span class="user-avatar">${renderAvatar(currentUser)}</span>
                    <span class="user-name">${escapeHtml(currentUser.fullName)}</span>
                    <svg class="user-menu-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="dropdown-menu" role="menu">
                    <a href="javascript:void(0)" data-change-avatar class="dashboard" role="menuitem">Change Photo</a>
                    <a href="messages.html" class="dashboard" role="menuitem">Messages</a>
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

    navAuth.querySelector('[data-change-avatar]')?.addEventListener('click', async () => {
        const { openAvatarModal } = await import('./profile');
        openAvatarModal();
    });

    navAuth.querySelector('[data-signout]')?.addEventListener('click', async () => {
        await signOut();
        window.location.href = 'index.html';
    });

    attachMsgBadge();
}

function bindUI(): void {
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        showToast('List refreshed.', 'info');
    });

    document.getElementById('clearBtn')?.addEventListener('click', handleClearAll);

    document.getElementById('testMatchBtn')?.addEventListener('click', handleRunAiMatch);

    document.getElementById('notifySend')?.addEventListener('click', handleSendNotification);
    document.getElementById('notifyMessage')?.addEventListener('input', updateCharCounter);

    document.getElementById('approveBtn')?.addEventListener('click', handleApprove);
    document.getElementById('rejectBtn')?.addEventListener('click', handleReject);

    inquiryReplyForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSendAdminReply();
    });

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

        notifUnsubscribe = watchNotifications(currentUser.uid, (notifs) => {
            updateBellBadge(notifs);
        });

        msgUnreadUnsub = watchUnreadMessages(currentUser.uid, (count) => {
            userMsgUnread = count;
            refreshMsgBadge();
        });

        adminMsgsUnsubscribe = watchAllAdminMessages((msgs) => {
            allAdminMessages = msgs;
            allAdminThreads = buildAdminThreads(msgs);
            renderInquiryList();

            adminMsgUnread = msgs.filter(m => m.senderRole === 'user' && !m.read).length;
            refreshMsgBadge();
        });

        watchItems(async items => {
            allItems = items;

            const uids = [...new Set(items.map(i => i.userId))];
            const claimUids = allClaims.map(c => c.userId);
            const allUids = [...new Set([...uids, ...claimUids])];

            try {
                userCache = await getUsersByIds(allUids);
            } catch (err) {
                console.error('User cache failed:', err);
            }

            renderStats();
            renderTable();
            renderClaims();
        });

        watchClaims(async claims => {
            allClaims = claims;

            const uids = claims.map(c => c.userId);
            if (uids.length > 0) {
                try {
                    const users = await getUsersByIds(uids);
                    users.forEach((v, k) => userCache.set(k, v));
                } catch (err) {
                    console.error('Claim user cache failed:', err);
                }
            }

            renderClaims();
        });
    } catch (err) {
        console.error('[admin] Error:', err);
        window.location.href = 'index.html';
    }
}

injectMsgBadgeStyles();
initializeAdmin();
import './main';
import {
    watchItems, createClaim, getClaimsByUser, sendAdminMessage, getUsersByIds,
    getAllMatches, confirmMatch, rejectMatch, createConversation,
    markMatchCompleted, markItemReturned
} from './db';
import { pb } from './pb';
import { onAuthChange, getUserProfile } from './auth';
import { showToast, escapeHtml, formatDate, setButtonLoading, openModal, closeModal } from './ui';
import type { Item, User, Claim, Match } from './types';

let currentUser: User | null = null;
let allItems: Item[] = [];
let allMatches: Match[] = [];
let myClaims: Claim[] = [];
let pendingClaimItemId: string | null = null;
let pendingAskAdminItemId: string | null = null;
let matchUnsubscribe: (() => Promise<void>) | null = null;

const userCache = new Map<string, { fullname: string; avatar: string }>();

const grid = document.getElementById('itemsGrid');
const matchesPanel = document.getElementById('matchesPanel');
const matchesGrid = document.getElementById('matchesGrid');
const matchesCount = document.getElementById('matchesCount');

function renderSkeleton(): void {
    if (!grid) return;
    grid.innerHTML = Array(6).fill(0).map(() => `
        <div class="item-card skeleton-card">
            <div class="skeleton-image"></div>
            <div class="item-info">
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line tiny"></div>
            </div>
        </div>
    `).join('');
}

function hasPendingClaim(itemId: string): boolean {
    return myClaims.some(c => c.itemId === itemId && c.status === 'pending');
}

function hasApprovedClaim(itemId: string): boolean {
    return myClaims.some(c => c.itemId === itemId && c.status === 'approved');
}

function renderItems(items: Item[]): void {
    if (!grid) return;

    if (items.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>No items found.</p></div>';
        return;
    }

    grid.innerHTML = items
        .map(item => {
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

            const verifiedBadge =
                item.verified && !item.recovered
                    ? '<span class="verified-badge">Verified</span>'
                    : '';

            const canClaim =
                item.verified && !item.recovered && item.status === 'found';

            let claimBtn = '';
            if (canClaim) {
                if (hasApprovedClaim(item.id)) {
                    claimBtn = `<div class="claim-status approved"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg> Claim Approved — Contact SJC Office</div>`;
                } else if (hasPendingClaim(item.id)) {
                    claimBtn = `<div class="claim-status pending"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Claim Pending Review</div>`;
                } else {
                    claimBtn = `<button type="button" class="claim-button" data-claim="${item.id}">Claim This Item</button>`;
                }
            }

            const askAdminBtn = item.verified && !item.recovered
                ? `<button type="button" class="ask-admin-button" data-ask-admin="${item.id}">Ask Admin</button>`
                : '';

            const hasImages = item.imageUrls.length > 0;

            const info = userCache.get(item.userId);
            const avatar = info?.avatar;
            const initial = (item.userName || '?').charAt(0).toUpperCase();
            const avatarHtml = avatar
                ? `<span class="item-reporter-avatar"><img src="${avatar}" alt="${escapeHtml(item.userName)}"></span>`
                : `<span class="item-reporter-avatar">${escapeHtml(initial)}</span>`;

            return `
                <div class="item-card" data-item-id="${item.id}">
                    ${
                        hasImages
                            ? `<div class="item-images">${item.imageUrls
                                  .map(
                                      (url, i) =>
                                          `<div class="item-image-thumb"><img src="${url}" alt="Item image ${i + 1}" loading="lazy" data-idx="${i}"></div>`
                                  )
                                  .join('')}</div>`
                            : `<div class="item-image">${escapeHtml(
                                  (item.itemName || '?').charAt(0).toUpperCase()
                              )}</div>`
                    }
                    <div class="item-info">
                        <h3>${escapeHtml(item.itemName)} ${verifiedBadge}</h3>
                        <p><strong>Location:</strong> ${escapeHtml(item.location)}</p>
                        <p><strong>Date:</strong> ${formatDate(item.createdAt)}</p>
                        <p><strong>Category:</strong> ${escapeHtml(item.category)}</p>
                        <span class="item-status ${statusClass}">${statusText}</span>
                        ${claimBtn}
                        ${askAdminBtn}
                        <div class="item-reporter">
                            ${avatarHtml}
                            <span class="item-reporter-name">${escapeHtml(item.userName)}</span>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');

    document.querySelectorAll<HTMLElement>('[data-claim]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!currentUser) {
                showToast('Please Sign In or Sign Up first to claim this item.', 'warning');
                return;
            }
            const itemId = btn.dataset.claim;
            if (!itemId) return;
            const item = allItems.find(i => i.id === itemId);
            if (!item) return;
            openClaimModal(item);
        });
    });

    document.querySelectorAll<HTMLElement>('[data-ask-admin]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!currentUser) {
                showToast('Please Sign In or Sign Up first to message the admin.', 'warning');
                return;
            }
            const itemId = btn.dataset.askAdmin;
            if (!itemId) return;
            const item = allItems.find(i => i.id === itemId);
            if (!item) return;
            openAskAdminModal(item);
        });
    });

    document.querySelectorAll<HTMLImageElement>('.item-image-thumb img').forEach(img => {
        img.addEventListener('click', () => {
            const card = img.closest('.item-card');
            const itemId = card?.getAttribute('data-item-id');
            const item = allItems.find(i => i.id === itemId);
            const idx = Number(img.dataset.idx) || 0;
            const fullUrl = item?.fullImageUrls[idx] || img.src;
            openImageModal(fullUrl);
        });
    });
}

/* ===== MATCH UI ===== */

function getUserMatches(): Match[] {
    if (!currentUser) return [];
    const myItemIds = new Set(
        allItems.filter(i => i.userId === currentUser!.uid).map(i => i.id)
    );
    return allMatches.filter(
        m => myItemIds.has(m.lostItemId) || myItemIds.has(m.foundItemId)
    );
}

function thumbHtml(item: Item): string {
    if (item.imageUrls.length > 0) {
        return `<img src="${item.imageUrls[0]}" alt="${escapeHtml(item.itemName)}">`;
    }
    return escapeHtml((item.itemName || '?').charAt(0).toUpperCase());
}

function renderMatches(): void {
    if (!matchesPanel || !matchesGrid) return;

    if (!currentUser) {
        matchesPanel.hidden = true;
        return;
    }

    const matches = getUserMatches().filter(
        m => m.status === 'pending' || m.status === 'confirmed'
    );

    if (matches.length === 0) {
        matchesPanel.hidden = true;
        return;
    }

    matchesPanel.hidden = false;
    if (matchesCount) matchesCount.textContent = String(matches.length);

    matchesGrid.innerHTML = matches
        .map(m => {
            const lostItem = allItems.find(i => i.id === m.lostItemId);
            const foundItem = allItems.find(i => i.id === m.foundItemId);
            if (!lostItem || !foundItem) return '';

            const isConfirmed = m.status === 'confirmed';

            const statusBadge = isConfirmed
                ? '<span class="match-status-pill confirmed">Match Confirmed — Coordinate Return</span>'
                : '';

            const actionsHtml = isConfirmed
                ? `<button class="match-btn returned" data-match-action="returned" data-match-id="${m.id}" type="button">
                        Item Returned
                   </button>`
                : `<button class="match-btn confirm" data-match-action="confirm" data-match-id="${m.id}" type="button">
                        It's a Match
                   </button>
                   <button class="match-btn reject" data-match-action="reject" data-match-id="${m.id}" type="button">
                        Not My Item
                   </button>`;

            return `
            <div class="match-card" data-match-id="${m.id}">
                <div class="match-thumbs">
                    <div class="match-thumb">${thumbHtml(lostItem)}</div>
                    <div class="match-link-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7"></path>
                        </svg>
                    </div>
                    <div class="match-thumb">${thumbHtml(foundItem)}</div>
                </div>
                <div class="match-body">
                    <div class="match-title">
                        <span>${escapeHtml(lostItem.itemName)} ↔ ${escapeHtml(foundItem.itemName)}</span>
                        <span class="match-score">${m.confidenceScore}% Match</span>
                    </div>
                    <p class="match-reason">${escapeHtml(m.matchReason)}</p>
                    <p class="match-meta">
                        <strong>Lost:</strong> ${escapeHtml(lostItem.location)} &nbsp;•&nbsp;
                        <strong>Found:</strong> ${escapeHtml(foundItem.location)}
                    </p>
                    ${statusBadge}
                </div>
                <div class="match-actions">${actionsHtml}</div>
            </div>
        `;
        })
        .join('');

    bindMatchActions();
}

function bindMatchActions(): void {
    if (!matchesGrid) return;

    matchesGrid.querySelectorAll<HTMLButtonElement>('[data-match-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.matchAction;
            const matchId = btn.dataset.matchId;
            if (!action || !matchId || !currentUser) return;

            const match = allMatches.find(m => m.id === matchId);
            if (!match) return;

            const lostItem = allItems.find(i => i.id === match.lostItemId);
            const foundItem = allItems.find(i => i.id === match.foundItemId);
            if (!lostItem || !foundItem) return;

            if (action === 'confirm') {
                if (!confirm('Confirm this match? You will be redirected to chat with the other user.')) return;

                btn.disabled = true;
                btn.textContent = 'Confirming...';

                try {
                    await confirmMatch(matchId);

                    await createConversation({
                        itemId: lostItem.id,
                        itemName: `${lostItem.itemName} ↔ ${foundItem.itemName}`,
                        user1Id: lostItem.userId,
                        user1Name: lostItem.userName,
                        user2Id: foundItem.userId,
                        user2Name: foundItem.userName
                    });

                    showToast('Match confirmed! Redirecting to messages...', 'success');
                    setTimeout(() => {
                        window.location.href = 'messages.html';
                    }, 1000);
                } catch (err) {
                    console.error('Failed to confirm match:', err);
                    showToast('Failed to confirm match.', 'error');
                    btn.disabled = false;
                    btn.textContent = "It's a Match";
                }
            } else if (action === 'returned') {
                if (!confirm('Confirm that the item has been returned to its owner? This will mark the item as recovered.')) return;

                btn.disabled = true;
                btn.textContent = 'Processing...';

                try {
                    await markItemReturned(lostItem.id);
                    if (foundItem.id !== lostItem.id) {
                        await markItemReturned(foundItem.id);
                    }
                    await markMatchCompleted(matchId);

                    showToast('Item marked as returned! Thank you.', 'success');

                    await loadMatches();
                } catch (err) {
                    console.error('Failed to mark item returned:', err);
                    showToast('Failed to mark item as returned.', 'error');
                    btn.disabled = false;
                    btn.textContent = 'Item Returned';
                }
            } else if (action === 'reject') {
                if (!confirm('Mark this as "Not My Item"? The match will be removed.')) return;

                btn.disabled = true;
                btn.textContent = 'Dismissing...';

                try {
                    await rejectMatch(matchId);
                    showToast('Match dismissed.', 'info');
                } catch (err) {
                    console.error('Failed to reject match:', err);
                    showToast('Failed to dismiss match.', 'error');
                    btn.disabled = false;
                    btn.textContent = 'Not My Item';
                }
            }
        });
    });
}

async function loadMatches(): Promise<void> {
    try {
        allMatches = await getAllMatches();
        renderMatches();
    } catch (err) {
        console.error('Failed to load matches:', err);
        allMatches = [];
    }
}

function subscribeMatches(): void {
    if (matchUnsubscribe) {
        matchUnsubscribe();
        matchUnsubscribe = null;
    }

    pb.collection('matches')
        .subscribe('*', () => {
            loadMatches();
        })
        .then(unsub => {
            matchUnsubscribe = unsub;
        })
        .catch(err => {
            console.error('Matches subscribe failed:', err);
        });
}

/* ===== IMAGE MODAL ===== */

let imageModalReady = false;

function closeImageModal(): void {
    document.getElementById('imageModal')?.classList.remove('active');
    document.body.style.overflow = '';
}

function getImageModal(): HTMLElement {
    let modal = document.getElementById('imageModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal';
        modal.innerHTML = `
            <button class="image-modal-close" type="button" aria-label="Close">&times;</button>
            <img id="imageModalImg" src="" alt="Full size image">
        `;
        document.body.appendChild(modal);
    }

    if (!imageModalReady) {
        imageModalReady = true;
        const el = modal;
        el.querySelector('.image-modal-close')?.addEventListener('click', closeImageModal);
        el.addEventListener('click', (e) => {
            if (e.target === el) closeImageModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeImageModal();
        });
    }

    return modal;
}

function openImageModal(src: string): void {
    const modal = getImageModal();
    const img = modal.querySelector('img') as HTMLImageElement;
    img.src = src;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/* ===== CLAIM MODAL ===== */

function openClaimModal(item: Item): void {
    const modal = document.getElementById('claimModal');
    const preview = document.getElementById('claimItemPreview');
    if (!modal || !preview) return;

    pendingClaimItemId = item.id;

    const thumb = item.imageUrls.length > 0
        ? `<img src="${item.imageUrls[0]}" alt="${escapeHtml(item.itemName)}">`
        : `<div class="claim-preview-placeholder">${escapeHtml((item.itemName || '?').charAt(0).toUpperCase())}</div>`;

    preview.innerHTML = `
        ${thumb}
        <div class="claim-preview-info">
            <strong>${escapeHtml(item.itemName)}</strong>
            <span>${escapeHtml(item.location)}</span>
            <span>${escapeHtml(item.category)}</span>
        </div>
    `;

    const form = document.getElementById('claimForm') as HTMLFormElement | null;
    form?.reset();

    openModal('claimModal');
}

function closeClaimModal(): void {
    closeModal('claimModal');
    pendingClaimItemId = null;
}

function bindClaimModal(): void {
    document.getElementById('closeClaimBtn')?.addEventListener('click', closeClaimModal);

    const modal = document.getElementById('claimModal');
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeClaimModal();
    });

    document.getElementById('claimForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || !pendingClaimItemId) return;

        const item = allItems.find(i => i.id === pendingClaimItemId);
        if (!item) return;

        const contact = (document.getElementById('claimContact') as HTMLInputElement).value.trim();
        const proof = (document.getElementById('claimProof') as HTMLTextAreaElement).value.trim();

        if (!contact || !proof) {
            showToast('Please fill in all fields.', 'warning');
            return;
        }

        const submitBtn = document.querySelector<HTMLButtonElement>('#claimForm .submit-button');
        setButtonLoading(submitBtn, true, 'Submitting...');

        try {
            await createClaim({
                itemId: item.id,
                itemName: item.itemName,
                userId: currentUser.uid,
                userName: currentUser.fullName,
                userEmail: currentUser.email,
                contactNumber: contact,
                proof
            });

            showToast('Claim submitted! Admin will review it soon.', 'success');
            closeClaimModal();

            if (currentUser) {
                myClaims = await getClaimsByUser(currentUser.uid);
                filterItems();
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to submit claim. Please try again.', 'error');
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });
}

/* ===== ASK ADMIN MODAL ===== */

function openAskAdminModal(item: Item): void {
    const modal = document.getElementById('askAdminModal');
    const preview = document.getElementById('askAdminItemPreview');
    const subtitle = document.getElementById('askAdminSubtitle');
    if (!modal || !preview) return;

    pendingAskAdminItemId = item.id;

    if (subtitle) {
        subtitle.textContent = `Ask about "${item.itemName}"`;
    }

    const thumb = item.imageUrls.length > 0
        ? `<img src="${item.imageUrls[0]}" alt="${escapeHtml(item.itemName)}">`
        : `<div class="claim-preview-placeholder">${escapeHtml((item.itemName || '?').charAt(0).toUpperCase())}</div>`;

    preview.innerHTML = `
        ${thumb}
        <div class="claim-preview-info">
            <strong>${escapeHtml(item.itemName)}</strong>
            <span>${escapeHtml(item.location)}</span>
            <span>${escapeHtml(item.category)}</span>
        </div>
    `;

    const form = document.getElementById('askAdminForm') as HTMLFormElement | null;
    form?.reset();

    openModal('askAdminModal');
}

function closeAskAdminModal(): void {
    closeModal('askAdminModal');
    pendingAskAdminItemId = null;
}

function bindAskAdminModal(): void {
    document.getElementById('closeAskAdminBtn')?.addEventListener('click', closeAskAdminModal);

    const modal = document.getElementById('askAdminModal');
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeAskAdminModal();
    });

    document.getElementById('askAdminForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || !pendingAskAdminItemId) return;

        const item = allItems.find(i => i.id === pendingAskAdminItemId);
        if (!item) return;

        const text = (document.getElementById('askAdminText') as HTMLTextAreaElement).value.trim();

        if (!text) {
            showToast('Please type a message.', 'warning');
            return;
        }

        const submitBtn = document.querySelector<HTMLButtonElement>('#askAdminForm .submit-button');
        setButtonLoading(submitBtn, true, 'Sending...');

        try {
            await sendAdminMessage({
                userId: currentUser.uid,
                userName: currentUser.fullName,
                userEmail: currentUser.email,
                itemId: item.id,
                itemName: item.itemName,
                senderRole: 'user',
                text
            });

            showToast('Message sent to admin! Check your Messages inbox for replies.', 'success');
            closeAskAdminModal();
        } catch (err) {
            console.error(err);
            showToast('Failed to send message. Please try again.', 'error');
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });
}

/* ===== FILTERS ===== */

function filterItems(): void {
    const search =
        (document.getElementById('searchInput') as HTMLInputElement)?.value.toLowerCase() || '';
    const category =
        (document.getElementById('categoryFilter') as HTMLSelectElement)?.value || 'all';
    const status =
        (document.getElementById('statusFilter') as HTMLSelectElement)?.value || 'all';

    const filtered = allItems.filter(item => {
        const matchSearch =
            !search ||
            item.itemName.toLowerCase().includes(search) ||
            item.description.toLowerCase().includes(search);
        const matchCategory = category === 'all' || item.category === category;

        let matchStatus = true;
        if (status === 'lost') matchStatus = item.status === 'lost';
        else if (status === 'found') matchStatus = item.status === 'found';
        else if (status === 'recovered') matchStatus = item.recovered;

        return matchSearch && matchCategory && matchStatus;
    });

    renderItems(filtered);
}

document.getElementById('searchInput')?.addEventListener('input', filterItems);
document.getElementById('categoryFilter')?.addEventListener('change', filterItems);
document.getElementById('statusFilter')?.addEventListener('change', filterItems);

bindClaimModal();
bindAskAdminModal();

/* ===== INIT ===== */

onAuthChange(async (fbUser) => {
    if (fbUser) {
        currentUser = await getUserProfile(fbUser.uid);
        if (currentUser) {
            try {
                myClaims = await getClaimsByUser(currentUser.uid);
            } catch (err) {
                console.error('Failed to load my claims:', err);
                myClaims = [];
            }
            filterItems();
            await loadMatches();
            subscribeMatches();
        }
    } else {
        currentUser = null;
        myClaims = [];
        allMatches = [];
        filterItems();
        renderMatches();

        if (matchUnsubscribe) {
            matchUnsubscribe();
            matchUnsubscribe = null;
        }
    }
});

renderSkeleton();

watchItems(async items => {
    allItems = items;

    const uids = [...new Set(items.map(i => i.userId))];
    try {
        const users = await getUsersByIds(uids);
        users.forEach((v, k) => userCache.set(k, v));
    } catch (err) {
        console.error('Failed to load users:', err);
    }

    filterItems();

    if (currentUser) {
        await loadMatches();
    }
});
import './main';
import { watchItems, createClaim, getClaimsByUser } from './db';
import { onAuthChange, getUserProfile } from './auth';
import { showToast, escapeHtml, formatDate, setButtonLoading, openModal, closeModal } from './ui';
import type { Item, User, Claim } from './types';

let currentUser: User | null = null;
let allItems: Item[] = [];
let myClaims: Claim[] = [];
let pendingClaimItemId: string | null = null;

const grid = document.getElementById('itemsGrid');

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

            const hasImages = item.imageUrls.length > 0;

            return `
                <div class="item-card" data-item-id="${item.id}">
                    ${
                        hasImages
                            ? `<div class="item-images">${item.imageUrls
                                  .map(
                                      (url, i) =>
                                          `<div class="item-image-thumb"><img src="${url}" alt="Item image ${i + 1}" loading="lazy"></div>`
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

    document.querySelectorAll<HTMLImageElement>('.item-image-thumb img').forEach(img => {
        img.addEventListener('click', () => openImageModal(img.src));
    });
}

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
        }
    } else {
        currentUser = null;
        myClaims = [];
        filterItems();
    }
});

watchItems(items => {
    allItems = items;
    filterItems();
});
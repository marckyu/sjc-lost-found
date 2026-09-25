import './main';
import { watchItems } from './db';
import { onAuthChange, getUserProfile } from './auth';
import { showToast, escapeHtml, formatDate } from './ui';
import type { Item, User } from './types';

let currentUser: User | null = null;
let allItems: Item[] = [];

const grid = document.getElementById('itemsGrid');

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

            const verifiedBadge =
                item.verified && !item.recovered
                    ? '<span class="verified-badge">✓ Verified</span>'
                    : '';

            const claimBtn =
                item.verified && !item.recovered
                    ? `<button type="button" class="claim-button" data-claim="${item.id}">Claim This Item</button>`
                    : '';

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
            showToast(
                `Thank you, ${currentUser.fullName}! Please contact the SJC office to claim this item.`,
                'success'
            );
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

onAuthChange(async (fbUser) => {
    currentUser = fbUser ? await getUserProfile(fbUser.uid) : null;
});

watchItems(items => {
    allItems = items;
    filterItems();
});
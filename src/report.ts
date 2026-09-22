import './main';
import { getCurrentUser } from './auth';
import { createItem } from './db';
import { showToast, setButtonLoading } from './ui';
import type { User, ItemCategory, ItemStatus } from './types';

let currentUser: User | null = null;
const uploadedFiles: File[] = [];
const MAX_IMAGES = 5;
const MAX_SIZE_MB = 10;

function renderPreviews(): void {
    const preview = document.getElementById('uploadPreview');
    if (!preview) return;

    if (uploadedFiles.length === 0) {
        preview.innerHTML = `
            <div class="upload-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p>Click or drag images here</p>
                <small>JPG, PNG, GIF — up to 5 images</small>
            </div>
        `;
        return;
    }

    preview.innerHTML = `
        <div class="image-list">
            ${uploadedFiles
                .map(
                    (file, i) => `
                <div class="image-item">
                    <img src="${URL.createObjectURL(file)}" alt="${file.name}">
                    <button type="button" class="image-remove" data-remove="${i}">&times;</button>
                </div>
            `
                )
                .join('')}
        </div>
    `;

    preview.querySelectorAll<HTMLElement>('[data-remove]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            uploadedFiles.splice(Number(btn.dataset.remove), 1);
            renderPreviews();
        });
    });
}

function handleFiles(files: FileList | File[]): void {
    const list = Array.from(files);

    for (const file of list) {
        if (uploadedFiles.length >= MAX_IMAGES) {
            showToast(`Maximum of ${MAX_IMAGES} images.`, 'warning');
            break;
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            showToast(`"${file.name}" is too large.`, 'error');
            continue;
        }
        if (!file.type.startsWith('image/')) {
            showToast(`"${file.name}" is not an image.`, 'error');
            continue;
        }
        uploadedFiles.push(file);
    }
    renderPreviews();
}

function initUpload(): void {
    const area = document.getElementById('uploadArea');
    const input = document.getElementById('itemImages') as HTMLInputElement | null;
    if (!area || !input) return;

    area.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.image-remove')) return;
        input.click();
    });

    input.addEventListener('change', (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files) handleFiles(files);
        input.value = '';
    });

    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('dragover');
    });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('dragover');
        if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
    });
}

function formatDateForInput(date: Date): string {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

(async () => {
    currentUser = await getCurrentUser();

    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    if (currentUser.role === 'admin') {
        window.location.href = 'admin.html';
        return;
    }

    const contact = document.getElementById('contact') as HTMLInputElement | null;
    const dateInput = document.getElementById('date') as HTMLInputElement | null;
    if (contact) contact.value = currentUser.email;
    if (dateInput) dateInput.value = formatDateForInput(new Date());
})();

initUpload();
renderPreviews();

document.getElementById('reportForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const submitBtn = document.querySelector<HTMLButtonElement>('.submit-button');
    setButtonLoading(submitBtn, true, 'Submitting...');

    try {
        const itemId = await createItem({
            userId: currentUser.uid,
            userName: currentUser.fullName,
            userEmail: currentUser.email,
            itemName: (document.getElementById('itemName') as HTMLInputElement).value.trim(),
            category: (document.getElementById('category') as HTMLSelectElement).value as ItemCategory,
            location: (document.getElementById('location') as HTMLInputElement).value.trim(),
            description: (document.getElementById('description') as HTMLTextAreaElement).value.trim(),
            status: (document.getElementById('reportType') as HTMLSelectElement).value as ItemStatus,
            date: (document.getElementById('date') as HTMLInputElement).value,
            files: [...uploadedFiles]
        });

        console.log('Item created:', itemId);

        (document.getElementById('reportForm') as HTMLFormElement).reset();
        uploadedFiles.length = 0;
        renderPreviews();

        if (currentUser) {
            const contact = document.getElementById('contact') as HTMLInputElement | null;
            if (contact) contact.value = currentUser.email;
        }
        const dateInput = document.getElementById('date') as HTMLInputElement | null;
        if (dateInput) dateInput.value = formatDateForInput(new Date());

        const successMsg = document.getElementById('successMessage');
        if (successMsg) {
            successMsg.textContent = '✓ Item reported successfully!';
            successMsg.style.display = 'block';
            setTimeout(() => (successMsg.style.display = 'none'), 5000);
        }

        showToast('Report submitted!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to submit. Please try again.', 'error');
    } finally {
        setButtonLoading(submitBtn, false);
    }
});
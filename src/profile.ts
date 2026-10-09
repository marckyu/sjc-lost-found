import { pb } from './pb';
import { updateUserAvatar } from './db';
import { showToast, openModal, closeModal, setButtonLoading } from './ui';

declare global {
    interface Window {
        Cropper: any;
    }
}

let pendingAvatarFile: File | null = null;
let cropper: any = null;

function escapeInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
}

function destroyCropper(): void {
    if (cropper) {
        try {
            cropper.destroy();
        } catch {}
        cropper = null;
    }
}

function resetToPreviewStage(): void {
    const cropArea = document.getElementById('avatarCropArea');
    const previewStage = document.getElementById('avatarPreviewStage');
    if (cropArea) cropArea.hidden = true;
    if (previewStage) previewStage.hidden = false;
}

function openCropView(file: File): void {
    const cropArea = document.getElementById('avatarCropArea');
    const cropImage = document.getElementById('avatarCropImage') as HTMLImageElement | null;
    const previewStage = document.getElementById('avatarPreviewStage');

    if (!cropArea || !cropImage || !previewStage) return;

    if (typeof window.Cropper === 'undefined') {
        showToast('Cropper library not loaded. Refresh the page.', 'error');
        return;
    }

    const url = URL.createObjectURL(file);
    cropImage.src = url;

    previewStage.hidden = true;
    cropArea.hidden = false;

    cropImage.onload = () => {
        destroyCropper();
        cropper = new window.Cropper(cropImage, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.85,
            cropBoxResizable: true,
            cropBoxMovable: true,
            background: false,
            guides: true,
            center: true,
            highlight: false,
            responsive: true,
            checkOrientation: false,
            modal: true
        });
    };
}

async function getCroppedFile(): Promise<File | null> {
    if (!cropper) return null;

    return new Promise<File | null>((resolve) => {
        try {
            const canvas = cropper.getCroppedCanvas({
                width: 512,
                height: 512,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            if (!canvas) {
                resolve(null);
                return;
            }

            canvas.toBlob(
                (blob: Blob | null) => {
                    if (!blob) {
                        resolve(null);
                        return;
                    }
                    resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
                },
                'image/jpeg',
                0.9
            );
        } catch (err) {
            console.error('Crop failed:', err);
            resolve(null);
        }
    });
}

export function openAvatarModal(): void {
    const modal = document.getElementById('avatarModal');
    const preview = document.getElementById('avatarPreview');
    const input = document.getElementById('avatarInput') as HTMLInputElement | null;

    if (!modal || !preview || !input) return;

    pendingAvatarFile = null;
    input.value = '';
    destroyCropper();
    resetToPreviewStage();

    const currentUser = pb.authStore.record;
    const avatarField = currentUser ? (currentUser.avatar as string | undefined) : undefined;
    const currentAvatar =
        currentUser && avatarField
            ? pb.files.getURL(currentUser, avatarField, { thumb: '200x200' })
            : '';

    const displayName =
        (currentUser?.fullname as string | undefined) ||
        (currentUser?.email as string | undefined) ||
        '?';

    preview.innerHTML = currentAvatar
        ? `<img src="${currentAvatar}" alt="Current avatar">`
        : `<div class="avatar-placeholder">${escapeInitial(displayName)}</div>`;

    openModal('avatarModal');
}

export function closeAvatarModal(): void {
    destroyCropper();
    closeModal('avatarModal');
    pendingAvatarFile = null;
}

export function initAvatarUploader(): void {
    const input = document.getElementById('avatarInput') as HTMLInputElement | null;
    const uploadBtn = document.getElementById('avatarChooseBtn') as HTMLButtonElement | null;
    const saveBtn = document.getElementById('avatarSaveBtn') as HTMLButtonElement | null;
    const removeBtn = document.getElementById('avatarRemoveBtn') as HTMLButtonElement | null;
    const closeBtn = document.getElementById('closeAvatarBtn') as HTMLButtonElement | null;
    const applyCropBtn = document.getElementById('avatarApplyCrop') as HTMLButtonElement | null;
    const cancelCropBtn = document.getElementById('avatarCancelCrop') as HTMLButtonElement | null;

    if (input) {
        input.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file.', 'error');
                input.value = '';
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                showToast('Image is too large. Max 5MB.', 'error');
                input.value = '';
                return;
            }

            openCropView(file);
        });
    }

    if (uploadBtn && input) {
        uploadBtn.addEventListener('click', () => input.click());
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeAvatarModal);
    }

    document.querySelectorAll<HTMLElement>('[data-close-avatar]').forEach((btn) => {
        btn.addEventListener('click', closeAvatarModal);
    });

    if (applyCropBtn) {
        applyCropBtn.addEventListener('click', async () => {
            const cropped = await getCroppedFile();

            if (!cropped) {
                showToast('Crop failed. Try again.', 'error');
                return;
            }

            pendingAvatarFile = cropped;
            destroyCropper();
            resetToPreviewStage();

            const preview = document.getElementById('avatarPreview');
            if (preview) {
                const url = URL.createObjectURL(cropped);
                preview.innerHTML = `<img src="${url}" alt="Preview">`;
            }
        });
    }

    if (cancelCropBtn) {
        cancelCropBtn.addEventListener('click', () => {
            destroyCropper();
            resetToPreviewStage();
            if (input) input.value = '';
        });
    }

    if (saveBtn) {
        const saveBtnEl: HTMLButtonElement = saveBtn;

        saveBtnEl.addEventListener('click', async () => {
            if (!pendingAvatarFile) {
                showToast('Please choose an image first.', 'warning');
                return;
            }

            const user = pb.authStore.record;
            if (!user) {
                showToast('You must be signed in.', 'error');
                return;
            }

            const fileToUpload = pendingAvatarFile;
            setButtonLoading(saveBtnEl, true, 'Uploading...');

            try {
                await updateUserAvatar(user.id, fileToUpload);
                await pb.collection('users').authRefresh();

                showToast('Profile picture updated!', 'success');
                closeAvatarModal();

                setTimeout(() => window.location.reload(), 800);
            } catch (err) {
                console.error('Avatar upload failed:', err);
                showToast('Failed to upload. Try again.', 'error');
            } finally {
                setButtonLoading(saveBtnEl, false);
            }
        });
    }

    if (removeBtn) {
        const removeBtnEl: HTMLButtonElement = removeBtn;

        removeBtnEl.addEventListener('click', async () => {
            const user = pb.authStore.record;
            if (!user) return;

            if (!confirm('Remove your profile picture?')) return;

            setButtonLoading(removeBtnEl, true, 'Removing...');

            try {
                await pb.collection('users').update(user.id, { avatar: null });
                await pb.collection('users').authRefresh();

                showToast('Profile picture removed.', 'info');
                closeAvatarModal();

                setTimeout(() => window.location.reload(), 800);
            } catch (err) {
                console.error('Avatar remove failed:', err);
                showToast('Failed to remove.', 'error');
            } finally {
                setButtonLoading(removeBtnEl, false);
            }
        });
    }
}
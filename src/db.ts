import type { RecordModel } from 'pocketbase';
import { pb } from './pb';
import type { Item, ItemStatus, ItemCategory, Notification, Claim, ClaimStatus } from './types';

const ITEMS_COL = 'items';
const NOTIFS_COL = 'notifications';
const CLAIMS_COL = 'claims';

function toDate(value?: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
}

function itemFromRecord(r: RecordModel): Item {
    const files: string[] = Array.isArray(r.images) ? r.images : r.images ? [r.images] : [];

    return {
        id: r.id,
        userId: r.userId,
        userName: r.userName,
        userEmail: r.userEmail,
        itemName: r.itemName,
        category: r.category as ItemCategory,
        location: r.location,
        description: r.description,
        status: r.status as ItemStatus,
        verified: r.verified ?? false,
        recovered: r.recovered ?? false,
        recoveredAt: toDate(r.recoveredAt),
        recoveredBy: r.recoveredBy ?? null,
        imageUrls: files.map(name => pb.files.getURL(r, name, { download: false })),
        createdAt: toDate(r.created) ?? new Date(),
        verifiedAt: toDate(r.verifiedAt)
    } as Item;
}

export async function getAllItems(): Promise<Item[]> {
    const records = await pb.collection(ITEMS_COL).getFullList({ sort: '-created' });
    return records.map(itemFromRecord);
}

export function watchItems(callback: (items: Item[]) => void): () => void {
    let stopped = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const load = async () => {
        try {
            const items = await getAllItems();
            if (!stopped) callback(items);
        } catch (err) {
            console.error('Failed to load items:', err);
        }
    };

    load();

    pb.collection(ITEMS_COL)
        .subscribe('*', () => {
            load();
        })
        .then(unsub => {
            if (stopped) unsub();
            else unsubscribe = unsub;
        })
        .catch(err => console.error('Realtime subscribe failed:', err));

    return () => {
        stopped = true;
        if (unsubscribe) unsubscribe();
    };
}

interface CreateItemInput {
    userId: string;
    userName: string;
    userEmail: string;
    itemName: string;
    category: ItemCategory;
    location: string;
    description: string;
    status: ItemStatus;
    date: string;
    files: File[];
}

export async function createItem(input: CreateItemInput): Promise<string> {
    const form = new FormData();
    form.append('userId', input.userId);
    form.append('userName', input.userName);
    form.append('userEmail', input.userEmail);
    form.append('itemName', input.itemName);
    form.append('category', input.category);
    form.append('location', input.location);
    form.append('description', input.description);
    form.append('status', input.status);
    form.append('date', new Date(input.date).toISOString());
    for (const file of input.files) {
        form.append('images', file);
    }

    const record = await pb.collection(ITEMS_COL).create(form);
    return record.id;
}

export async function verifyItem(itemId: string): Promise<void> {
    await pb.collection(ITEMS_COL).update(itemId, {
        verified: true,
        verifiedAt: new Date().toISOString()
    });
}

export async function markAsRecovered(itemId: string, adminId: string): Promise<void> {
    await pb.collection(ITEMS_COL).update(itemId, {
        recovered: true,
        recoveredAt: new Date().toISOString(),
        recoveredBy: adminId
    });
}

export async function toggleItemStatus(itemId: string, current: ItemStatus): Promise<ItemStatus> {
    const next: ItemStatus =
        current === 'lost' ? 'found' : current === 'found' ? 'pending' : 'lost';
    await pb.collection(ITEMS_COL).update(itemId, { status: next });
    return next;
}

export async function deleteItem(itemId: string, _imageUrls: string[] = []): Promise<void> {
    await pb.collection(ITEMS_COL).delete(itemId);
}

export async function sendNotification(
    userId: string,
    itemId: string,
    message: string
): Promise<void> {
    await pb.collection(NOTIFS_COL).create({
        userId,
        itemId,
        message,
        read: false
    });
}

export async function getNotifications(uid: string): Promise<Notification[]> {
    const records = await pb.collection(NOTIFS_COL).getFullList({
        filter: pb.filter('userId = {:uid}', { uid }),
        sort: '-created'
    });

    return records.map(r => ({
        id: String(r.id),
        userId: String(r.userId),
        itemId: String(r.itemId),
        message: String(r.message),
        read: Boolean(r.read),
        createdAt: toDate(r.created) ?? new Date()
    })) as Notification[];
}

export async function getUnreadCount(uid: string): Promise<number> {
    const result = await pb.collection(NOTIFS_COL).getList(1, 1, {
        filter: pb.filter('userId = {:uid} && read = false', { uid })
    });
    return result.totalItems;
}

export function watchNotifications(uid: string, callback: (notifs: Notification[]) => void): () => void {
    let stopped = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const load = async () => {
        try {
            const notifs = await getNotifications(uid);
            if (!stopped) callback(notifs);
        } catch (err) {
            console.error('Failed to load notifications:', err);
        }
    };

    load();

    pb.collection(NOTIFS_COL)
        .subscribe('*', (e) => {
            const record = e.record as RecordModel | undefined;
            if (!record || String(record.userId) === uid) {
                load();
            }
        })
        .then(unsub => {
            if (stopped) unsub();
            else unsubscribe = unsub;
        })
        .catch(err => console.error('Realtime notifications subscribe failed:', err));

    return () => {
        stopped = true;
        if (unsubscribe) unsubscribe();
    };
}

export async function markAsRead(notifId: string): Promise<void> {
    await pb.collection(NOTIFS_COL).update(notifId, { read: true });
}

export async function markAllAsRead(uid: string): Promise<void> {
    const records = await pb.collection(NOTIFS_COL).getFullList({
        filter: pb.filter('userId = {:uid} && read = false', { uid })
    });
    await Promise.all(
        records.map(r => pb.collection(NOTIFS_COL).update(r.id, { read: true }))
    );
}

export async function deleteNotification(notifId: string): Promise<void> {
    await pb.collection(NOTIFS_COL).delete(notifId);
}

function claimFromRecord(r: RecordModel): Claim {
    return {
        id: String(r.id),
        itemId: String(r.itemId),
        itemName: String(r.itemName || ''),
        userId: String(r.userId),
        userName: String(r.userName),
        userEmail: String(r.userEmail),
        contactNumber: String(r.contactNumber || ''),
        proof: String(r.proof || ''),
        status: (r.status as ClaimStatus) || 'pending',
        adminNote: r.adminNote ? String(r.adminNote) : null,
        reviewedBy: r.reviewedBy ? String(r.reviewedBy) : null,
        reviewedAt: toDate(r.reviewedAt),
        createdAt: toDate(r.created) ?? new Date()
    };
}

interface CreateClaimInput {
    itemId: string;
    itemName: string;
    userId: string;
    userName: string;
    userEmail: string;
    contactNumber: string;
    proof: string;
}

export async function createClaim(input: CreateClaimInput): Promise<string> {
    const record = await pb.collection(CLAIMS_COL).create({
        itemId: input.itemId,
        itemName: input.itemName,
        userId: input.userId,
        userName: input.userName,
        userEmail: input.userEmail,
        contactNumber: input.contactNumber,
        proof: input.proof,
        status: 'pending'
    });
    return record.id;
}

export async function getClaimsByUser(uid: string): Promise<Claim[]> {
    const records = await pb.collection(CLAIMS_COL).getFullList({
        filter: pb.filter('userId = {:uid}', { uid }),
        sort: '-created'
    });
    return records.map(claimFromRecord);
}

export async function getAllClaims(): Promise<Claim[]> {
    const records = await pb.collection(CLAIMS_COL).getFullList({
        sort: '-created'
    });
    return records.map(claimFromRecord);
}

export function watchClaims(callback: (claims: Claim[]) => void): () => void {
    let stopped = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const load = async () => {
        try {
            const claims = await getAllClaims();
            if (!stopped) callback(claims);
        } catch (err) {
            console.error('Failed to load claims:', err);
        }
    };

    load();

    pb.collection(CLAIMS_COL)
        .subscribe('*', () => {
            load();
        })
        .then(unsub => {
            if (stopped) unsub();
            else unsubscribe = unsub;
        })
        .catch(err => console.error('Realtime claims subscribe failed:', err));

    return () => {
        stopped = true;
        if (unsubscribe) unsubscribe();
    };
}

export async function approveClaim(claimId: string, adminId: string, adminNote: string = ''): Promise<void> {
    await pb.collection(CLAIMS_COL).update(claimId, {
        status: 'approved',
        reviewedBy: adminId,
        reviewedAt: new Date().toISOString(),
        adminNote
    });
}

export async function rejectClaim(claimId: string, adminId: string, adminNote: string = ''): Promise<void> {
    await pb.collection(CLAIMS_COL).update(claimId, {
        status: 'rejected',
        reviewedBy: adminId,
        reviewedAt: new Date().toISOString(),
        adminNote
    });
}

export async function getApprovedClaimForItem(itemId: string): Promise<Claim | null> {
    try {
        const record = await pb.collection(CLAIMS_COL).getFirstListItem(
            pb.filter('itemId = {:itemId} && status = "approved"', { itemId })
        );
        return claimFromRecord(record);
    } catch {
        return null;
    }
}
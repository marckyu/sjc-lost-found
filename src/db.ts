import type { RecordModel } from 'pocketbase';
import { pb } from './pb';
import type { Item, ItemStatus, ItemCategory, Notification } from './types';

const ITEMS_COL = 'items';
const NOTIFS_COL = 'notifications';

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
        date: toDate(r.date),
        verified: r.verified ?? false,
        verifiedAt: toDate(r.verifiedAt),
        recovered: r.recovered ?? false,
        recoveredAt: toDate(r.recoveredAt),
        recoveredBy: r.recoveredBy ?? null,
        matchedWithItemId: r.matchedWithItemId ?? null,
        matchedAt: toDate(r.matchedAt),
        returnedAt: toDate(r.returnedAt),
        imageUrls: files.map(name => pb.files.getURL(r, name, { download: false })),
        createdAt: toDate(r.created) ?? new Date()
    };
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

export async function markAsRecovered(itemId: string, userId: string): Promise<void> {
    await pb.collection(ITEMS_COL).update(itemId, {
        recovered: true,
        recoveredAt: new Date().toISOString(),
        recoveredBy: userId,
        status: 'recovered'
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
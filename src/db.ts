import type { RecordModel } from 'pocketbase';
import { pb } from './pb';
import type {
    Item, ItemStatus, ItemCategory, Notification, Claim, ClaimStatus,
    Conversation, Message
} from './types';

const ITEMS_COL = 'items';
const NOTIFS_COL = 'notifications';
const CLAIMS_COL = 'claims';
const CONVS_COL = 'conversations';
const MSGS_COL = 'messages';

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

function conversationFromRecord(r: RecordModel): Conversation {
    return {
        id: String(r.id),
        itemId: String(r.itemId),
        itemName: String(r.itemName || ''),
        user1Id: String(r.user1Id),
        user1Name: String(r.user1Name),
        user2Id: String(r.user2Id),
        user2Name: String(r.user2Name),
        lastMessage: r.lastMessage ? String(r.lastMessage) : null,
        lastMessageAt: toDate(r.lastMessageAt),
        createdAt: toDate(r.created) ?? new Date()
    };
}

function messageFromRecord(r: RecordModel): Message {
    return {
        id: String(r.id),
        conversationId: String(r.conversationId),
        senderId: String(r.senderId),
        senderName: String(r.senderName),
        receiverId: String(r.receiverId),
        text: String(r.text || ''),
        read: Boolean(r.read),
        createdAt: toDate(r.created) ?? new Date()
    };
}

export async function getUserConversations(uid: string): Promise<Conversation[]> {
    const records = await pb.collection(CONVS_COL).getFullList({
        filter: pb.filter('user1Id = {:uid} || user2Id = {:uid}', { uid }),
        sort: '-lastMessageAt,-created'
    });
    return records.map(conversationFromRecord);
}

export function watchUserConversations(uid: string, callback: (convs: Conversation[]) => void): () => void {
    let stopped = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const load = async () => {
        try {
            const convs = await getUserConversations(uid);
            if (!stopped) callback(convs);
        } catch (err) {
            console.error('Failed to load conversations:', err);
        }
    };

    load();

    pb.collection(CONVS_COL)
        .subscribe('*', (e) => {
            const record = e.record as RecordModel | undefined;
            if (!record) {
                load();
                return;
            }
            const u1 = String(record.user1Id);
            const u2 = String(record.user2Id);
            if (u1 === uid || u2 === uid) {
                load();
            }
        })
        .then(unsub => {
            if (stopped) unsub();
            else unsubscribe = unsub;
        })
        .catch(err => console.error('Realtime conversations subscribe failed:', err));

    return () => {
        stopped = true;
        if (unsubscribe) unsubscribe();
    };
}

export async function getConversationById(id: string): Promise<Conversation | null> {
    try {
        const record = await pb.collection(CONVS_COL).getOne(id);
        return conversationFromRecord(record);
    } catch {
        return null;
    }
}

export async function findConversationBetween(
    uid1: string,
    uid2: string,
    itemId: string
): Promise<Conversation | null> {
    try {
        const record = await pb.collection(CONVS_COL).getFirstListItem(
            pb.filter(
                '(user1Id = {:u1} && user2Id = {:u2} || user1Id = {:u2} && user2Id = {:u1}) && itemId = {:itemId}',
                { u1: uid1, u2: uid2, itemId }
            )
        );
        return conversationFromRecord(record);
    } catch {
        return null;
    }
}

interface CreateConversationInput {
    itemId: string;
    itemName: string;
    user1Id: string;
    user1Name: string;
    user2Id: string;
    user2Name: string;
}

export async function createConversation(input: CreateConversationInput): Promise<string> {
    const existing = await findConversationBetween(input.user1Id, input.user2Id, input.itemId);
    if (existing) return existing.id;

    const record = await pb.collection(CONVS_COL).create({
        itemId: input.itemId,
        itemName: input.itemName,
        user1Id: input.user1Id,
        user1Name: input.user1Name,
        user2Id: input.user2Id,
        user2Name: input.user2Name,
        lastMessage: '',
        lastMessageAt: new Date().toISOString()
    });
    return record.id;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
    const records = await pb.collection(MSGS_COL).getFullList({
        filter: pb.filter('conversationId = {:cid}', { cid: conversationId }),
        sort: 'created'
    });
    return records.map(messageFromRecord);
}

export function watchMessages(conversationId: string, callback: (msgs: Message[]) => void): () => void {
    let stopped = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const load = async () => {
        try {
            const msgs = await getMessages(conversationId);
            if (!stopped) callback(msgs);
        } catch (err) {
            console.error('Failed to load messages:', err);
        }
    };

    load();

    pb.collection(MSGS_COL)
        .subscribe('*', (e) => {
            const record = e.record as RecordModel | undefined;
            if (!record || String(record.conversationId) === conversationId) {
                load();
            }
        })
        .then(unsub => {
            if (stopped) unsub();
            else unsubscribe = unsub;
        })
        .catch(err => console.error('Realtime messages subscribe failed:', err));

    return () => {
        stopped = true;
        if (unsubscribe) unsubscribe();
    };
}

interface SendMessageInput {
    conversationId: string;
    senderId: string;
    senderName: string;
    receiverId: string;
    text: string;
}

export async function sendMessage(input: SendMessageInput): Promise<string> {
    const record = await pb.collection(MSGS_COL).create({
        conversationId: input.conversationId,
        senderId: input.senderId,
        senderName: input.senderName,
        receiverId: input.receiverId,
        text: input.text,
        read: false
    });

    try {
        await pb.collection(CONVS_COL).update(input.conversationId, {
            lastMessage: input.text,
            lastMessageAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('Failed to update conversation preview:', err);
    }

    return record.id;
}

export async function markConversationAsRead(conversationId: string, uid: string): Promise<void> {
    const records = await pb.collection(MSGS_COL).getFullList({
        filter: pb.filter(
            'conversationId = {:cid} && receiverId = {:uid} && read = false',
            { cid: conversationId, uid }
        )
    });
    await Promise.all(
        records.map(r => pb.collection(MSGS_COL).update(r.id, { read: true }))
    );
}

export async function getUnreadMessageCount(uid: string): Promise<number> {
    try {
        const result = await pb.collection(MSGS_COL).getList(1, 1, {
            filter: pb.filter('receiverId = {:uid} && read = false', { uid })
        });
        return result.totalItems;
    } catch {
        return 0;
    }
}

export function watchUnreadMessages(uid: string, callback: (count: number) => void): () => void {
    let stopped = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const load = async () => {
        const count = await getUnreadMessageCount(uid);
        if (!stopped) callback(count);
    };

    load();

    pb.collection(MSGS_COL)
        .subscribe('*', (e) => {
            const record = e.record as RecordModel | undefined;
            if (!record || String(record.receiverId) === uid || String(record.senderId) === uid) {
                load();
            }
        })
        .then(unsub => {
            if (stopped) unsub();
            else unsubscribe = unsub;
        })
        .catch(err => console.error('Realtime unread messages subscribe failed:', err));

    return () => {
        stopped = true;
        if (unsubscribe) unsubscribe();
    };
}
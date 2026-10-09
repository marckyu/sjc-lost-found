import { getDB, type PendingOp } from './db';

export async function enqueueOp(
    type: PendingOp['type'],
    payload: any
): Promise<number> {
    const db = await getDB();
    return db.add('queue', {
        type,
        payload,
        createdAt: Date.now(),
        attempts: 0,
        status: 'pending'
    });
}

export async function getPendingOps(): Promise<PendingOp[]> {
    const db = await getDB();
    const all = await db.getAll('queue');
    return all
        .filter(op => op.status === 'pending' || op.status === 'syncing')
        .sort((a, b) => a.createdAt - b.createdAt);
}

export async function markSyncing(id: number): Promise<void> {
    const db = await getDB();
    const op = await db.get('queue', id);
    if (op) {
        op.status = 'syncing';
        await db.put('queue', op);
    }
}

export async function markFailed(id: number, error: string): Promise<void> {
    const db = await getDB();
    const op = await db.get('queue', id);
    if (op) {
        op.status = 'failed';
        op.error = error;
        op.attempts += 1;
        await db.put('queue', op);
    }
}

export async function removeOp(id: number): Promise<void> {
    const db = await getDB();
    await db.delete('queue', id);
}

export async function getQueueCount(): Promise<number> {
    const db = await getDB();
    const all = await db.getAll('queue');
    return all.filter(op => op.status === 'pending' || op.status === 'syncing').length;
}

export async function getAllQueueItems(): Promise<PendingOp[]> {
    const db = await getDB();
    return db.getAll('queue');
}

export async function clearQueue(): Promise<void> {
    const db = await getDB();
    await db.clear('queue');
}
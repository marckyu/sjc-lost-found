import {
    createItem,
    createClaim,
    sendMessage,
    sendAdminMessage,
    markAsRead,
    markAllAsRead
} from '../db';
import {
    getPendingOps,
    markSyncing,
    markFailed,
    removeOp,
    getQueueCount
} from './queue';
import { notifySyncing, notifySuccess, notifyPending, notifyError } from './indicator';
import type { PendingOp } from './db';

let queueRunning = false;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out`)), ms)
        )
    ]);
}

async function getPendingCount(): Promise<number> {
    try {
        return await withTimeout(getQueueCount(), 3000, 'getQueueCount');
    } catch {
        return 0;
    }
}

async function executeOp(op: PendingOp): Promise<void> {
    const p = op.payload;
    const T = 15000;
    switch (op.type) {
        case 'create-item':
            await withTimeout(createItem(p), T, 'create-item');
            break;
        case 'create-claim':
            await withTimeout(createClaim(p), T, 'create-claim');
            break;
        case 'send-message':
            await withTimeout(sendMessage(p), T, 'send-message');
            break;
        case 'send-admin-message':
            await withTimeout(sendAdminMessage(p), T, 'send-admin-message');
            break;
        case 'mark-read':
            await withTimeout(markAsRead(p.id), T, 'mark-read');
            break;
        case 'mark-all-read':
            await withTimeout(markAllAsRead(p.uid), T, 'mark-all-read');
            break;
        default:
            throw new Error(`Unknown op: ${op.type}`);
    }
}

export async function processQueue(): Promise<void> {
    if (queueRunning) return;
    if (!navigator.onLine) return;

    let ops: PendingOp[] = [];
    try {
        ops = await getPendingOps();
    } catch (err) {
        console.error('[sync] failed to load queue:', err);
        return;
    }

    if (ops.length === 0) return;

    queueRunning = true;
    notifySyncing();

    let anyFailed = false;

    try {
        for (const op of ops) {
            if (!op.id) continue;
            try {
                await markSyncing(op.id);
                await executeOp(op);
                await removeOp(op.id);
            } catch (err: any) {
                console.error('[sync] op failed:', op, err);
                anyFailed = true;
                try {
                    await markFailed(op.id, err?.message || 'Unknown error');
                } catch (markErr) {
                    console.error('[sync] markFailed failed:', markErr);
                }
            }
        }
    } finally {
        queueRunning = false;
        const remaining = await getPendingCount();
        if (remaining > 0) {
            notifyPending(remaining);
        } else if (anyFailed) {
            notifyError();
        } else {
            notifySuccess();
            window.dispatchEvent(new CustomEvent('sjc-sync-complete', {
                detail: { processed: ops.length }
            }));
        }
    }
}

export function forceSync(): void {
    queueRunning = false;
    processQueue();
}

export function initSync(): void {
    window.addEventListener('online', () => {
        setTimeout(() => processQueue(), 300);
    });

    window.addEventListener('focus', () => {
        if (navigator.onLine) processQueue();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && navigator.onLine) processQueue();
    });

    setInterval(() => {
        if (navigator.onLine) processQueue();
    }, 5000);

    setTimeout(() => processQueue(), 500);
}
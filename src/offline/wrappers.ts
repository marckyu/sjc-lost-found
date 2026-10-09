import { enqueueOp } from './queue';
import { notifySyncing, notifySuccess, notifyOffline, notifyError } from './indicator';
import {
    createItem,
    createClaim,
    sendMessage,
    sendAdminMessage
} from '../db';

function isNetworkError(err: any): boolean {
    if (!err) return false;
    if (err.status === 0) return true;
    const msg = String(err?.message || '').toLowerCase();
    return (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('failed to fetch') ||
        msg.includes('timeout')
    );
}

export async function createItemOffline(input: any): Promise<string> {
    notifySyncing();
    try {
        if (!navigator.onLine) {
            await enqueueOp('create-item', input);
            notifyOffline();
            return 'offline-' + Date.now();
        }
        try {
            const id = await createItem(input);
            notifySuccess();
            return id;
        } catch (err) {
            if (isNetworkError(err)) {
                await enqueueOp('create-item', input);
                notifyOffline();
                return 'offline-' + Date.now();
            }
            notifyError();
            throw err;
        }
    } catch (err) {
        throw err;
    }
}

export async function createClaimOffline(input: any): Promise<string> {
    notifySyncing();
    try {
        if (!navigator.onLine) {
            await enqueueOp('create-claim', input);
            notifyOffline();
            return 'offline-' + Date.now();
        }
        try {
            const id = await createClaim(input);
            notifySuccess();
            return id;
        } catch (err) {
            if (isNetworkError(err)) {
                await enqueueOp('create-claim', input);
                notifyOffline();
                return 'offline-' + Date.now();
            }
            notifyError();
            throw err;
        }
    } catch (err) {
        throw err;
    }
}

export async function sendMessageOffline(input: any): Promise<string> {
    notifySyncing();
    try {
        if (!navigator.onLine) {
            await enqueueOp('send-message', input);
            notifyOffline();
            return 'offline-' + Date.now();
        }
        try {
            const id = await sendMessage(input);
            notifySuccess();
            return id;
        } catch (err) {
            if (isNetworkError(err)) {
                await enqueueOp('send-message', input);
                notifyOffline();
                return 'offline-' + Date.now();
            }
            notifyError();
            throw err;
        }
    } catch (err) {
        throw err;
    }
}

export async function sendAdminMessageOffline(input: any): Promise<string> {
    notifySyncing();
    try {
        if (!navigator.onLine) {
            await enqueueOp('send-admin-message', input);
            notifyOffline();
            return 'offline-' + Date.now();
        }
        try {
            const id = await sendAdminMessage(input);
            notifySuccess();
            return id;
        } catch (err) {
            if (isNetworkError(err)) {
                await enqueueOp('send-admin-message', input);
                notifyOffline();
                return 'offline-' + Date.now();
            }
            notifyError();
            throw err;
        }
    } catch (err) {
        throw err;
    }
}
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Item, Claim, Notification } from '../types';

export interface PendingOp {
    id?: number;
    type:
        | 'create-item'
        | 'create-claim'
        | 'send-message'
        | 'send-admin-message'
        | 'mark-read'
        | 'mark-all-read';
    payload: any;
    createdAt: number;
    attempts: number;
    status: 'pending' | 'syncing' | 'failed';
    error?: string;
}

interface SJCStore extends DBSchema {
    items: {
        key: string;
        value: Item;
        indexes: { 'by-userId': string; 'by-createdAt': Date };
    };
    claims: {
        key: string;
        value: Claim;
        indexes: { 'by-userId': string; 'by-itemId': string };
    };
    notifications: {
        key: string;
        value: Notification;
        indexes: { 'by-userId': string };
    };
    queue: {
        key: number;
        value: PendingOp;
        indexes: { 'by-status': string; 'by-createdAt': number };
    };
    meta: {
        key: string;
        value: { key: string; value: any; updatedAt: number };
    };
}

let dbPromise: Promise<IDBPDatabase<SJCStore>> | null = null;

export function getDB(): Promise<IDBPDatabase<SJCStore>> {
    if (!dbPromise) {
        dbPromise = openDB<SJCStore>('sjc-lost-found', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('items')) {
                    const s = db.createObjectStore('items', { keyPath: 'id' });
                    s.createIndex('by-userId', 'userId');
                    s.createIndex('by-createdAt', 'createdAt');
                }
                if (!db.objectStoreNames.contains('claims')) {
                    const s = db.createObjectStore('claims', { keyPath: 'id' });
                    s.createIndex('by-userId', 'userId');
                    s.createIndex('by-itemId', 'itemId');
                }
                if (!db.objectStoreNames.contains('notifications')) {
                    const s = db.createObjectStore('notifications', { keyPath: 'id' });
                    s.createIndex('by-userId', 'userId');
                }
                if (!db.objectStoreNames.contains('queue')) {
                    const s = db.createObjectStore('queue', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    s.createIndex('by-status', 'status');
                    s.createIndex('by-createdAt', 'createdAt');
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            }
        });
    }
    return dbPromise;
}
# Offline-First Feature

## Overview

The system continues to function when the user loses internet connectivity. All write operations (reports, claims, messages) are queued locally and automatically synced when connectivity is restored.

## Why Offline-First

Campus WiFi is often unreliable in classrooms, basements, and crowded areas. Users may lose connectivity mid-action. Without offline support, their work is lost.

## Architecture

### Components

- src/offline/db.ts: IndexedDB schema plus connection
- src/offline/queue.ts: Queue CRUD operations
- src/offline/sync.ts: Sync engine plus auto-retry
- src/offline/indicator.ts: Visual feedback banner
- src/offline/wrappers.ts: Offline-aware API wrappers

### Data Flow

User Action becomes Wrapper call (createItemOffline, sendMessageOffline, etc.).

If online: direct API call, success banner.

If offline: enqueue in IndexedDB, offline banner.

Later when online: sync engine detects event, replays queue in FIFO, clears queue.

## User Experience

### Visual Feedback Banner

- Offline submit: warning banner will sync when connected (amber)
- Syncing: syncing indicator (green)
- Success: sync successful (green, auto-hide 1.5s)
- Pending: N pending will sync when online (blue)
- Error: sync failed will retry (red)

### Chat: Messenger-Style Pending Messages

When sending a message offline:

1. Message bubble appears immediately with Sending indicator
2. Bubble pulses subtly while pending
3. When sync completes: text changes to Sent
4. Real message reloads from server, replacing the pending one

## Technical Details

### IndexedDB Schema

Database: sjc-lost-found (version 1)

Stores:

- items (cached items)
- claims (cached claims)
- notifications (cached notifications)
- queue (pending operations)
- meta (metadata)

### Queue Operations

    interface PendingOp {
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

### Sync Triggers

The queue is processed when:

1. window.online event fires
2. window.focus event fires
3. visibilitychange (tab becomes visible)
4. Every 5 seconds (background check)
5. 500ms after page load
6. Manual click on pending banner

### Timeout Protection

- Each op has 15-second timeout
- getQueueCount has 3-second timeout
- Watchdog: if sync runs longer than 30 seconds, force reset
- All timeouts use Promise.race

## Limitations

- Report item: online realtime, offline queued
- Claim item: online yes, offline queued
- Send message: online yes, offline queued
- Browse items: online live, offline cached only
- Realtime updates: online only
- AI matching: online only
- Image upload: online yes, offline queued

## Testing

### Offline Chat Test

1. Open messages.html while online
2. DevTools, Network tab, set to Offline
3. Type and send a message
4. Expected: message appears with Sending pulse, offline banner
5. Set Network back to No throttling
6. Expected: syncing then sync successful, bubble changes to Sent
7. Verify message in PocketBase admin

### Offline Report Test

1. Open report.html while online
2. DevTools, Network, Offline
3. Fill form, click Submit
4. Expected: success toast, offline banner
5. Network, No throttling
6. Expected: syncing then sync successful
7. Verify item in PocketBase items collection

## Defense Highlights

Key points to emphasize:

1. Real-world relevance: campus WiFi is unreliable
2. Persistent local storage: IndexedDB survives page refresh
3. Automatic sync: no user action required
4. Visual feedback: users always know state
5. Multi-tab safety: queue consistent across tabs
6. Timeout protection: stuck operations cannot block the queue

## Future Enhancements

- Full read caching (browse items offline)
- Conflict resolution for concurrent edits
- Background Sync API
- Service worker caching of JS bundles
- Compression of queued image Blobs
# System Architecture

## High-Level Overview

The system follows a three-tier architecture: client, backend, and AI microservice.

### Client Layer

Vite plus TypeScript multi-page application running in the browser.

Six HTML entry points, each loading its own module:

- index.html, main.ts (landing, auth, shared nav)
- items.html, items.ts (listing, claims, matches)
- report.html, report.ts (report form)
- messages.html, messages.ts (chat plus admin inquiries)
- notifications.html, notifications.ts (notification feed)
- admin.html, admin.ts (admin dashboard)

Shared modules:

- pb.ts (PocketBase client)
- auth.ts (session plus PHINMAEd validation)
- db.ts (data access layer)
- ui.ts (toasts, modals, escaping)
- types.ts (shared interfaces)

### Backend Layer

PocketBase provides:

- SQLite database
- REST plus realtime WebSocket API
- File storage for images and avatars
- Auth with PHINMAEd email validation
- Admin UI at /_/
- Custom hooks in pb_hooks/

### AI Image Service

Isolated Python Flask microservice.

Endpoint: POST /compare

Request body:

    {
      "urls1": ["https://.../img1.jpg"],
      "urls2": ["https://.../img2.jpg"]
    }

Response body:

    {
      "similarity": 0.87,
      "matches": 3,
      "total": 25,
      "confidence": 87.0
    }

Algorithm: Perceptual hashing (pHash 50 percent, dHash 30 percent, aHash 20 percent) with Hamming distance.

### Offline Engine

Custom offline-first layer on top of IndexedDB.

Layers:

- wrappers.ts tries online first, falls back to queue
- queue.ts stores pending operations
- sync.ts replays queue on reconnect
- indicator.ts shows visual feedback banner

### Deployment

- Frontend: Vercel
- PocketBase: self-hosted plus Cloudflare Tunnel
- Python AI: self-hosted plus Cloudflare Tunnel

## Data Flow: Report Submission

1. User fills report form
2. If online: POST to PocketBase items collection
3. If offline: save to IndexedDB queue
4. On online event: replay queue, POST to PocketBase
5. Realtime event notifies all subscribers
6. AI matcher runs (matcher.ts)
7. Matches saved to matches collection
8. Notifications sent to affected users

## Data Flow: Ownership Claim

1. User clicks Claim This Item
2. Fill claim form (contact plus proof)
3. POST to claims collection
4. Admin dashboard notified (realtime)
5. Admin reviews via modal
6. Approve: status becomes approved
7. markAsRecovered(itemId) called
8. createConversation between owner and claimant
9. User notified, chat unlocked

## Security

- Email spoofing: server-side PHINMAEd regex validation
- XSS: escapeHtml on all user content
- CSRF: PocketBase token-based auth
- Unauthorized access: role-based UI plus collection rules
- Rate limiting: PocketBase built-in

## Performance

- Realtime updates via PocketBase WebSocket
- Image thumbnails generated on the fly (400x400)
- Debounced form inputs (600ms)
- Lazy image loading
- Parallel image fetch via ThreadPoolExecutor

## Scalability Path

For production scale:

1. Move PocketBase to dedicated VPS
2. Deploy Python service on Railway or Fly.io
3. Add Redis cache for frequently-read items
4. Move AI matching to background job queue
5. Enable daily PocketBase backups
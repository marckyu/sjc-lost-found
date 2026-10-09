# SJC Campus Lost & Found

A Progressive Web App (PWA) for reporting and recovering lost items at Saint Jude College Manila (PHINMA Education).

## Overview

SJC Campus Lost & Found is a full-stack web application designed to streamline the process of reporting, searching, and recovering lost belongings within the campus community. The system features AI-assisted item matching, real-time notifications, secure in-app messaging, and offline-first capability.

## Key Features

- **User Authentication** — PHINMAEd email-based sign-up with role-based access (user / admin)
- **Item Reporting** — Report lost or found items with images, category, location, and description
- **AI-Assisted Matching** — Hybrid matching engine using text similarity and perceptual image hashing
- **Real-Time Notifications** — Instant updates powered by PocketBase realtime subscriptions
- **In-App Messaging** — Secure user-to-user chat and admin inquiry threads
- **Admin Dashboard** — Verify reports, review ownership claims, manage users, send notifications
- **Offline-First** — Submit reports, claims, and messages offline; automatic sync when connected
- **Progressive Web App** — Installable on mobile devices

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite + TypeScript + Vanilla HTML/CSS |
| Backend | PocketBase (SQLite + realtime subscriptions) |
| AI / Image Service | Python Flask + Pillow + ImageHash |
| Offline Storage | IndexedDB (via idb) |
| PWA | Service Worker + Web Manifest |
| Deployment | Vercel (frontend) + Cloudflare Tunnel (backend) |

## Project Structure

    lost-and-found/
    ├── public/                  Static assets
    ├── src/                     TypeScript source
    │   └── offline/             Offline-first engine
    ├── python-service/          AI image similarity microservice
    ├── pocketbase/              PocketBase binary + migrations + hooks
    ├── index.html               Landing page
    ├── items.html               Browse items
    ├── report.html              Report form
    ├── messages.html            In-app chat
    ├── notifications.html       Notifications
    ├── admin.html               Admin dashboard
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── vercel.json

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- PocketBase binary

### Install dependencies

    npm install
    pip install -r python-service/requirements.txt

### Configure environment

Copy .env.example to .env.local:

    VITE_PB_URL=http://localhost:8090
    VITE_MATCHER_URL=http://localhost:5000

### Start all services

Terminal 1 — PocketBase:

    cd pocketbase
    ./pocketbase serve

Terminal 2 — Python AI service:

    cd python-service
    python app.py

Terminal 3 — Vite dev server:

    npm run dev

Open http://localhost:5173

## Build for Production

    npm run build

Output goes to dist/. Deploy the dist/ folder to any static host (Vercel recommended).

## Architecture

The system follows a three-tier architecture.

**Client:** Vite + TypeScript multi-page application. Six HTML entry points, each loading its own module. Shared infrastructure handles PocketBase client, auth, data access, UI helpers, and types.

**Backend:** PocketBase provides SQLite database, REST + realtime WebSocket API, file storage, auth with PHINMAEd email validation, admin UI, and custom hooks.

**AI Image Service:** Python Flask microservice. Accepts two arrays of image URLs, returns a similarity score using perceptual hashing (pHash 50%, dHash 30%, aHash 20%) with Hamming distance.

**Offline Engine:** Custom IndexedDB layer with four modules — wrappers (try online, fallback queue), queue (pending ops), sync (replay on reconnect), and indicator (visual feedback).

### Data Flow — Report Submission

1. User fills report form
2. If online: POST to PocketBase items
3. If offline: save to IndexedDB queue
4. On online event: replay queue, POST to PocketBase
5. Realtime event notifies all subscribers
6. AI matcher runs
7. Matches saved to matches collection
8. Notifications sent to affected users

### Data Flow — Ownership Claim

1. User clicks "Claim This Item"
2. Fill claim form (contact + proof)
3. POST to claims collection
4. Admin dashboard notified (realtime)
5. Admin reviews via modal
6. Approve, status becomes approved
7. markAsRecovered(itemId) called
8. Conversation created between owner and claimant
9. User notified, chat unlocked

## Database Schema

Database is managed by PocketBase (SQLite). Eight collections.

### users

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| email | email | unique, @phinmaed.com |
| password | password | hashed |
| fullname | text | display name |
| avatar | file | optional |
| role | select | user or admin |

### items

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| userId | text | FK users.id |
| userName | text | denormalized |
| userEmail | text | denormalized |
| itemName | text | required |
| category | select | gadgets/books/ids/wallets/keys/clothing/documents/others |
| location | text | required |
| description | text | required |
| status | select | lost/found/pending |
| date | datetime | when lost/found |
| verified | bool | admin-verified |
| recovered | bool | returned to owner |
| images | file array | max 5 |

### claims

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| itemId | text | FK items.id |
| itemName | text | denormalized |
| userId | text | FK users.id |
| userName | text | required |
| userEmail | text | required |
| contactNumber | text | required |
| proof | text | ownership proof |
| status | select | pending/approved/rejected |
| adminNote | text | nullable |
| reviewedBy | text | nullable |

### notifications

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| userId | text | FK users.id |
| itemId | text | FK items.id |
| message | text | required |
| read | bool | default false |

### conversations

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| itemId | text | required |
| itemName | text | required |
| user1Id | text | FK users.id |
| user1Name | text | required |
| user2Id | text | FK users.id |
| user2Name | text | required |
| lastMessage | text | preview |
| hiddenFor | text array | user ids who hid thread |

### messages

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| conversationId | text | FK conversations.id |
| senderId | text | FK users.id |
| senderName | text | required |
| receiverId | text | FK users.id |
| text | text | required |
| read | bool | default false |

### admin_messages

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| userId | text | FK users.id |
| userName | text | required |
| userEmail | text | required |
| itemId | text | FK items.id |
| itemName | text | required |
| senderRole | select | user or admin |
| text | text | required |
| read | bool | default false |

### matches

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| lostItemId | text | FK items.id |
| foundItemId | text | FK items.id |
| confidenceScore | number | 0 to 100 |
| matchReason | text | explanation |
| status | select | pending/confirmed/rejected/completed |

## Offline-First Feature

### Why Offline-First

Campus WiFi is often unreliable. Without offline support, user work is lost when connectivity drops.

### How It Works

All write operations go through a wrapper. If online, the API is called directly. If offline, the operation is enqueued in IndexedDB. A sync engine listens for the online event and replays the queue in order.

### Visual Feedback

| State | Banner | Color |
|-------|--------|-------|
| Offline submit | Offline — will sync when connected | Amber |
| Syncing | Syncing... | Green |
| Success | Sync successful! | Green (auto-hide 1.5s) |
| Pending | N pending | Blue |
| Error | Sync failed — will retry | Red |

### Chat — Messenger-Style Pending Messages

When sending a message offline:

1. Message bubble appears immediately with "Sending..." indicator
2. Bubble pulses subtly while pending
3. When sync completes: text changes to "Sent"
4. Real message reloads from server, replacing the pending one

### Sync Triggers

The queue is processed when:

- window.online event fires
- window.focus event fires
- visibilitychange event fires
- Every 5 seconds (background check)
- 500ms after page load

### Timeout Protection

- Each op has a 15-second timeout
- getQueueCount has a 3-second timeout
- Watchdog forces reset after 30 seconds
- All timeouts use Promise.race

### Limitations

| Feature | Online | Offline |
|---------|--------|---------|
| Report item | Realtime | Queued |
| Claim item | Yes | Queued |
| Send message | Yes | Queued |
| Browse items | Live | Cached only |
| Realtime updates | Yes | No |
| AI matching | Yes | No |

## Deployment

### Frontend — Vercel

1. Push code to GitHub
2. Go to vercel.com, import project
3. Framework preset: Vite
4. Add env vars: VITE_PB_URL and VITE_MATCHER_URL
5. Deploy

### Backend — PocketBase + Cloudflare Tunnel

On your server:

    cd pocketbase
    ./pocketbase serve --http=0.0.0.0:8090

In another terminal:

    cloudflared tunnel --url http://localhost:8090

Copy the generated https URL into Vercel's VITE_PB_URL.

Configure CORS:

    ./pocketbase serve --origins="https://your-app.vercel.app,http://localhost:5173"

### AI Service — Cloudflare Tunnel

    cd python-service
    python app.py
    # new terminal
    cloudflared tunnel --url http://localhost:5000

Copy the tunnel URL into VITE_MATCHER_URL.

## Troubleshooting

**Cannot reach the server** — Check PocketBase is running. Verify .env.local. Restart Vite after changing env vars.

**PHINMAEd email required** — Sign up with email ending in @phinmaed.com.

**Image matching not working** — Check Python service at http://localhost:5000/health. Text matching still works offline.

**Syncing stuck** — DevTools, Application, IndexedDB, sjc-lost-found, queue, Delete database, Refresh.

## Team ArkNights

| Role | Member |
|------|--------|
| Leader / UI Designer | Quintela, Addriane Zhermielle |
| Developer | Asuncion, JohnMarc F. |
| UI Designer | Talusan, Moschin Kunday |
| Documentation | Taladro, Greg Martin |
| Documentation | Osinsao, Camille |

**Institution:** Saint Jude College Manila — PHINMA Education
**School Year:** 2025–2026

## License

Academic project — Saint Jude College Manila. All rights reserved.
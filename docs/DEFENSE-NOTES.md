# Defense Notes

Quick reference for the panel defense.

## 30-Second Pitch

SJC Campus Lost and Found is a Progressive Web App that helps students recover lost belongings. It uses AI-assisted matching to find potential owner-item pairs, provides real-time notifications, and continues to work offline, which is perfect for unreliable campus WiFi. Built with Vite plus TypeScript on the frontend, PocketBase for the backend, and a Python microservice for image similarity.

## Core Features

1. Offline-First Sync: reports and messages queue locally, auto-sync when online
2. AI-Assisted Matching: hybrid text plus image similarity scoring
3. Real-Time Notifications: instant updates via WebSocket
4. Ownership Verification: claim workflow with admin review
5. In-App Messaging: user-to-user plus admin inquiry threads
6. Admin Dashboard: verify, recover, notify, manage

## Anticipated Questions

### Q: Anong AI model ginamit niyo?

We use a hybrid approach. For text, we combine cosine similarity, Jaccard index, and Levenshtein distance, which are classic NLP techniques. For images, we use perceptual hashing: pHash, dHash, and aHash. This compares structural fingerprints. It is rule-based AI, not deep learning, but it is fast, deterministic, and requires no GPU.

### Q: Bakit PocketBase?

PocketBase gives us an entire backend in one binary: SQLite database, REST API, realtime WebSocket subscriptions, file storage, and admin UI. For a capstone project, this means we spend more time on features and less on infrastructure. It is also self-hosted, so there is no vendor lock-in.

### Q: Paano gumagana ang offline sync?

All write operations go through a wrapper. If online, we call the API directly. If offline, we enqueue the operation in IndexedDB. A sync engine listens for the online event and replays the queue in order. Users see a visual banner: syncing, then sync successful. Chat messages show a Sending pulse before confirmation.

### Q: Ano ang security measures?

- PHINMAEd email validation (server-side regex)
- Role-based UI (admin vs user)
- XSS prevention via escapeHtml on all outputs
- PocketBase token-based auth
- HTTPS in production
- Cloudflare Tunnel for backend

### Q: Paano kayo nag-test?

We tested all CRUD flows online and offline. For offline testing, we used Chrome DevTools Network Offline mode. We also tested with multiple tabs, pending items, and network interruptions mid-sync. All queued operations reliably sync when connectivity returns.

### Q: Anong limitations?

Three main ones:

1. Offline browsing works only for cached items
2. Realtime updates require connectivity
3. AI image matching requires the Python service

### Q: Bakit PWA?

Users can install the app on their phone with no app store needed. It also supports service worker caching, so the shell loads faster on repeat visits.

### Q: Paano naiiba sa existing solutions?

Three differentiators:

1. Offline-first: most campus systems assume always-online
2. AI matching: auto-suggests potential owners
3. Integrated messaging: direct user-to-user chat after match confirmation

### Q: Anong tech challenges?

1. Offline-first sync engine: handling partial failures, timeouts, multi-tab consistency
2. Image matching accuracy: tuning thresholds with real campus items
3. Realtime plus offline coexistence: subscriptions must fail gracefully
4. Deployment: Cloudflare Tunnel to expose local PocketBase for Vercel frontend

## Demo Script

### Setup before panel

- PocketBase running
- Python service running
- Vite dev server running
- Chrome with DevTools ready
- Logged in as test user
- One verified found item in system

### Part 1: Browse 

1. Open index.html, show landing page
2. Click Lost and Found, show listing with filters
3. Show one item card, highlight Verified badge

### Part 2: Report Online 

1. Click Report
2. Fill form: Test Wallet, Wallet category, Library location
3. Point out: typing triggers syncing then sync successful
4. Click Submit
5. Show it in PocketBase admin, items collection

### Part 3: Offline Report 

1. DevTools, Network, Offline
2. Fill another report: Test Phone, Gadgets
3. Click Submit
4. Point out: offline banner will sync when connected
5. Network, No throttling
6. Point out: syncing then sync successful
7. Refresh PocketBase, item is there

### Part 4: AI Matching 

1. Go to items.html
2. Show AI Potential Matches panel
3. Explain scoring
4. If no matches, run admin.html Run AI Match button

### Part 5: Chat 

1. Go to messages.html
2. Open admin thread
3. Send message
4. Show real-time bubble

### Part 6: Admin Dashboard 

1. Logout, login as admin
2. Show stats grid
3. Show claims panel
4. Click Review on a claim

### Part 7: Wrap-up 

That is our system. Offline-first, AI-assisted, real-time. Built with modern web tech, deployed on Vercel with a self-hosted backend.

## Backup Plan

If something breaks:

1. PocketBase not starting: have admin tab open as fallback
2. Python service offline: text matching still works
3. Vercel down: switch to localhost:5173
4. Network offline: actually a good thing, demo offline feature

## Source Code

Replace this with your GitHub URL.

## Contact

- Team Member 1
- Team Member 2
- Team Member 3
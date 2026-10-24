# SJC Campus Lost & Found

A Progressive Web App (PWA) for reporting and recovering lost items at Saint Jude College Manila (PHINMA Education).

## Overview

SJC Campus Lost & Found is a full-stack web application designed to streamline the process of reporting, searching, and recovering lost belongings within the campus community. The system features AI-assisted item matching, real-time notifications, secure in-app messaging, an offline-first capability, and a secure OTP-based password recovery system.

## Key Features

- **User Authentication** — PHINMAEd email-based sign-up with role-based access (user / admin)
- **Secure Password Reset (OTP)** — Forgot password flow using a 6-digit email OTP with a 10-minute expiration.
- **Item Reporting** — Report lost or found items with images, category, location, and description
- **AI-Assisted Matching** — Hybrid matching engine using text similarity and perceptual image hashing
- **Real-Time Notifications** — Instant updates powered by PocketBase realtime subscriptions
- **In-App Messaging** — Secure user-to-user chat and admin inquiry threads
- **Admin Dashboard** — Verify reports, review ownership claims, and manage items with an AI-driven matching interface
- **Offline-First** — Submit reports, claims, and messages offline; automatic sync when connected
- **Progressive Web App** — Installable on mobile devices

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite + TypeScript + Vanilla HTML/CSS |
| Backend | PocketBase (SQLite + realtime subscriptions + Custom JS Hooks) |
| AI / Image Service | Python Flask + Pillow + ImageHash |
| Offline Storage | IndexedDB (via idb) |
| PWA | Service Worker + Web Manifest |
| Deployment | Vercel (frontend) + Wisbyte (PocketBase backend) + Cloudflare Tunnel (AI service) |

## System Flowchart

The following diagram illustrates the end-to-end process of the SJC Campus Lost & Found system, from reporting to item recovery.

![SJC Lost and Found System Flowchart](./flowchart.jpg)

**Flow Description:**
1. The process starts when a user reports a **Lost** or **Found** item by filling out the required details (Name, Email, Contact, Location, Description, and Image).
2. The data is submitted and stored in the **Database**.
3. The **AI Matching Engine** processes the data using Text and Image Analysis to find a potential match.
4. If a potential match is found and the confidence meets the threshold, the system generates **AI Match Emails/Notifications**.
5. The users are notified and can initiate a **Secure Chat** to coordinate the item return.
6. Once **Ownership is Verified**, the item is marked as **Returned** and eventually **Recovered**.

## Project Structure

    lost-and-found/
    ├── public/                  Static assets
    ├── src/                     TypeScript source
    │   └── offline/             Offline-first engine
    ├── python-service/          AI image similarity microservice
    ├── pocketbase/              PocketBase binary + pb_hooks + migrations
    ├── index.html               Landing page
    ├── items.html               Browse items
    ├── report.html              Report form
    ├── messages.html            In-app chat
    ├── notifications.html       Notifications
    ├── admin.html               Admin dashboard
    ├── flowchart.jpg            System process diagram
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
    # Windows: .venv\Scripts\activate
    # Mac/Linux: source .venv/bin/activate
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

**Backend:** PocketBase provides SQLite database, REST + realtime WebSocket API, file storage, auth with PHINMAEd email validation, admin UI, and custom JS hooks. The `pb_hooks` folder contains custom server-side logic for generating secure OTPs and handling password resets.

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

### Data Flow — Password Reset (OTP)

1. User clicks "Forgot Password" and enters their PHINMAEd email.
2. Frontend sends a POST request to the custom PocketBase route `/request-otp`.
3. Backend generates a 6-digit numeric OTP and saves it to the `otp_codes` collection with a 10-minute expiration.
4. Backend uses PocketBase's mailer to send the OTP via SMTP to the user's email.
5. User enters the OTP and their new password on the frontend.
6. Frontend sends a POST request to `/verify-otp`.
7. Backend validates the OTP against the database and checks if it has not expired.
8. If valid, the password is updated, and the OTP is deleted from the database to prevent reuse.

## System Connections (Environment Variables)

The system relies on three main components that communicate via REST APIs and WebSockets. The connections are established using the following environment variables:

### 1. Frontend to Backend (PocketBase)
- **Environment Variable:** `VITE_PB_URL`
- **Connection Type:** REST API & Realtime WebSocket
- **Purpose:** The frontend (hosted on Vercel) connects to the PocketBase backend (hosted on Wisbyte) to handle authentication, database queries, file uploads, and real-time subscriptions for chat and notifications.

### 2. Frontend to AI Service (Python Flask)
- **Environment Variable:** `VITE_MATCHER_URL`
- **Connection Type:** HTTP POST Request
- **Purpose:** When the admin triggers "Run AI Match", the frontend sends an HTTP request containing the image URLs to the Python microservice. The service processes the images and returns a similarity score.

### 3. Backend to SMTP Server (Email)
- **Connection Type:** SMTP (Simple Mail Transfer Protocol)
- **Purpose:** The PocketBase backend connects to an external SMTP server to send 6-digit OTPs for sign-up and password resets.

## Database Schema

Database is managed by PocketBase (SQLite). Nine collections.

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

### otp_codes

| Field | Type | Notes |
|-------|------|-------|
| id | text | PK |
| email | text | user's email |
| code | text | 6-digit OTP |
| expiresAt | datetime | 10 minutes from generation |

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

### Backend — PocketBase (Hosted on Wisbyte)

The PocketBase backend and database are hosted on Wisbyte.

1. Log in to your Wisbyte dashboard.
2. Get the public URL provided by Wisbyte (e.g., `https://your-app.wisbyte.dev`).
3. Set this URL as `VITE_PB_URL` in your Vercel environment variables.
4. Configure CORS in Wisbyte to allow requests from your Vercel frontend URL.
5. Upload the custom hook files (`password_reset.pb.js` and `signup_otp.pb.js`) to the `pb_hooks` folder via the Wisbyte file manager.
6. Restart the Wisbyte server to apply the new hooks.

### AI Service — Cloudflare Tunnel (Local / Defense Setup)

    cd python-service
    python app.py
    # new terminal
    cloudflared tunnel --url http://localhost:5000

Copy the tunnel URL into VITE_MATCHER_URL.

## Expected Outcomes & Future Works

**Expected Outcomes:**
1. **Faster Item Recovery:** Because of the AI Matching Engine (Text and Image Analysis), the chances of finding the owner or the lost item are significantly higher and faster compared to manual Facebook group posting.
2. **Centralized System:** Magkakaroon ng iisang platform ang SJC community para sa Lost & Found, kaya hindi na kailangang maghalungkat sa iba't ibang social media groups.
3. **Data Privacy:** Since gagamitin ang PHINMAEd email, siguradong legitimate students, faculty, at staff lang ng SJC ang makakagamit ng system.
4. **Operational Efficiency for Admin:** Magiging mas madali para sa SJC office ang mag-track, mag-verify, at mag-manage ng mga reported items gamit ang Admin Dashboard.

**Future Works (Possibilities):**
1. **SMS Notification Integration:** Para sa mga estudyanteng hindi madalas mag-check ng email, pwedeng magpadala ng SMS alerts kapag may AI Match na nahanap.
2. **Advanced AI (CNN / YOLO):** Pwede pang i-upgrade ang Image Analysis gamit ang mas advanced na object detection models para makilala yung mismong item kahit iba ang anggulo ng pagkakakuha ng picture.
3. **Analytics Dashboard:** Magdadagdag ng charts at graphs sa Admin para makita kung saang location sa campus ang pinakamaraming nawawalang item.

## Possible Defense Questions & Answers

Heto ang mga posibleng itanong ng panel sa defense at kung paano niyo sila sasagutin nang natural (Taglish):

**Q: Bakit may Offline-First feature? Hindi naman laging walang internet.**
* **A:** *"Opo, pero mahina ang signal ng campus WiFi sa ibang sulok ng school, tulad ng CR o basement. Kapag nag-report ang estudyante at biglang nawalan ng internet, masisira yung momentum at mawawala yung data. Sa pamamagitan ng IndexedDB, naka-save muna yung report nila locally. Kapag nagkaroon ulit ng connection, automatic siyang mag-s-sync sa database para hindi sila mahirapan."*

**Q: Bakit kailangan ng AI Matching? Bakit hindi na lang manual search?**
* **A:** *"Malaki po ang campus natin at napakaraming items. Kapag manual search lang, mahihirapan ang user na i-scroll lahat ng reports. Yung AI natin (Text Similarity at Image Hashing) ang tumutulong para automatic na mag-match ang isang 'Lost' item sa isang 'Found' item. Kaya mas mabilis ang recovery process at mas accurate kaysa sa manual."*

**Q: Paano niyo sinisiguro na secure ang system niyo?**
* **A:** *"Una, naka-limit sa PHINMAEd email ang registration, kaya legit students, faculty, at staff lang ang makakapasok. Pangalawa, gumamit kami ng OTP (One-Time Password) na naka-hook sa PocketBase para sa password resets, para hindi basta-basta makakapag-bago ng password ang kahit sino. At pangatlo, ang mga sensitive actions, tulad ng pag-approve ng claims, ay exclusive lang sa Admin role."*

**Q: Paano nag-uusap ang frontend, backend, at AI service niyo?**
* **A:** *"Ang frontend natin ay hosted sa Vercel at nakikipag-communicate sa PocketBase (hosted on Wisbyte) gamit ang REST API at WebSockets para sa real-time updates. Para naman sa AI matching, yung frontend ay nagpapadala ng request sa Python Flask microservice natin through Cloudflare Tunnel para i-analyze yung images at i-compute yung similarity score."*

**Q: Bakit walang 'Delete' button sa Admin Dashboard?**
* **A:** *"Sadya po naming tinanggal ang delete button para mapanatili ang data integrity. Ayaw namin na mabura yung mga items dahil kailangan ng AI matching algorithm na may complete historical dataset para maging accurate ang image analysis. Imbes na i-delete, gumagamit kami ng statuses tulad ng 'Verified' o 'Recovered' para may proper audit trail."*

**Q: Bakit PocketBase ang ginamit niyo bilang backend?**
* **A:** *"PocketBase is an all-in-one backend solution. Mayroon na siyang built-in SQLite database, realtime subscriptions, at authentication system out-of-the-box. Nakakatipid kami sa oras sa pag-setup ng backend infrastructure at nakapag-focus kami sa mas mahahalagang features tulad ng AI matching at offline-first capabilities."*

**Q: Paano kung nag-fail yung AI Matching? Paano pa makukuha ng user yung item niya?**
* **A:** *"Kahit hindi mag-match ang AI, may manual browsing pa rin naman po sa 'Lost & Found' page. Pwede pa rin i-search ng user yung item manually. At the same time, may 'Ask Admin' feature po tayo kung saan pwedeng direktang mag-inquire yung estudyante sa SJC office para i-verify yung item."*

## Troubleshooting

**Cannot reach the server** — Check PocketBase is running. Verify .env.local. Restart Vite after changing env vars.

**PHINMAEd email required** — Sign up with email ending in @phinmaed.com.

**Image matching not working** — Check Python service at http://localhost:5000/health. Text matching still works offline.

**Syncing stuck** — DevTools, Application, IndexedDB, sjc-lost-found, queue, Delete database, Refresh.

**OTP not received / Failed to send OTP** — Check Wisbyte logs for `SMTP ERROR`. Verify that SMTP settings (host, port, username, password, sender address) are properly configured in the PocketBase Admin UI > Settings > Mail settings. Ensure the `otp_codes` collection exists.

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
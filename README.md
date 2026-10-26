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

## System Roles & User Management (Para kay Camille)

Para maging malinaw sa panel at sa documentation, heto ang eksaktong roles at rules ng system:

1. **User (Student / Faculty / Staff):** Lahat ng may valid na `@phinmaed.com` email ay pwedeng mag-register. Sila yung mga nagre-report ng lost/found items at naghahanap ng gamit nila.
2. **Admin (SJC Office / Student Affairs):** Sila yung humahawak ng system. **Hindi kasama ang mga teachers dito**. Ang Admin ay yung specific na opisina sa school (tulad ng SAO) na nag-a-approve ng claims at nag-mamanage ng items.
3. **Non-PHINMAEd Personnel (Janitor, Guard, etc.):** Since required ang PHINMAEd email, **hindi sila makakagawa ng sariling account**. Kapag may nakita silang item, ibibigay nila ito physically sa SJC Office. Ang **Admin** ang magre-report sa system on their behalf para pumasok sa database at AI matching.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite + TypeScript + Vanilla HTML/CSS |
| Backend | PocketBase (SQLite + realtime subscriptions + Custom JS Hooks) |
| AI / Image Service | Python Flask + Pillow + ImageHash |
| Offline Storage | IndexedDB (via idb) |
| PWA | Service Worker + Web Manifest |
| Deployment | Vercel (frontend) + Wisbyte (PocketBase backend) + Cloudflare Tunnel (AI service) |

## Database & Hosting Architecture (Para sa DFD / UML)

Madalas ito nakakalito sa defense, kaya heto ang tamang hierarchy ng backend natin:

1. **Wisbyte (Cloud Hosting Provider):** Ito yung server sa internet kung saan naka-deploy yung backend natin. Sila yung nagbibigay ng public URL (e.g., `sjc-lostfound.wisp.uno`).
2. **PocketBase (Backend Application):** Ito yung software na tumatakbo *sa loob* ng Wisbyte. Sila ang humahawak ng API, WebSockets (para sa chat), Authentication, at Custom JS Hooks (para sa OTP).
3. **SQLite (Main Database):** Ito yung totoong database engine na nag-iimbak ng lahat ng records (users, items, matches).
4. **IndexedDB (Offline Database):** Ito yung nasa browser ng user para makapag-save sila ng report kahit walang internet, tapos sync sa SQLite kapag may net na.

## System Flowchart

The following diagram illustrates the end-to-end process of the SJC Campus Lost & Found system, from reporting to item recovery.

![SJC Lost and Found System Flowchart](./flowchart.jpg)

## AI Matching & Notification Flow (Para sa UML / DFD ni Camille)

Heto ang eksaktong nangyayari sa system kapag may AI Match (napaka-importante para sa Sequence Diagram):

1. **Admin triggers AI:** Pinipindot ng Admin ang "Run AI Match" (o nag-Verify ng bagong item).
2. **AI Service Computes:** Nagpapadala ng request ang Frontend sa **Python Flask Microservice** para i-compare yung images (ImageHash) at text.
3. **Database Saves:** Kapag naka-match (above threshold), nags-save ang system sa **`matches`** collection. Kasabay nito, nag-ge-generate ito ng record sa **`notifications`** database.
4. **User Notified (Real-time):** Dahil naka-WebSocket ang user, **instant na lalabas yung pulang badge** sa notification bell nila. Makikita din nila yung AI Match Card sa "Potential Matches" panel sa items page.
5. **User Action:** Kapag clinick ng user ang "Confirm", mag-ge-generate ng conversation at mapupunta sila sa Messages page para mag-chat.

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

## Architecture & Data Flow

**Client:** Vite + TypeScript multi-page application. Six HTML entry points.
**Backend:** PocketBase provides SQLite database, REST + realtime WebSocket API, file storage, auth, and custom JS hooks.
**AI Image Service:** Python Flask microservice. Accepts two arrays of image URLs, returns a similarity score using perceptual hashing (pHash 50%, dHash 30%, aHash 20%) with Hamming distance.
**Offline Engine:** Custom IndexedDB layer with four modules — wrappers, queue, sync, and indicator.

### Data Flow — Report Submission
1. User fills report form.
2. If online: POST to PocketBase items. If offline: save to IndexedDB queue.
3. On online event: replay queue, POST to PocketBase.
4. Realtime event notifies all subscribers.
5. AI matcher runs (if triggered by admin).
6. Matches saved to matches collection.
7. Notifications sent to affected users.

### Data Flow — Ownership Claim
1. User clicks "Claim This Item" and fills out form.
2. POST to claims collection.
3. Admin dashboard notified (realtime).
4. Admin approves, status becomes approved.
5. `markAsRecovered(itemId)` is called.
6. Conversation created between owner and claimant.
7. User notified, chat unlocked.

### Data Flow — Password Reset (OTP)
1. User clicks "Forgot Password" and enters their PHINMAEd email.
2. Frontend sends POST to `/request-otp`.
3. Backend generates 6-digit OTP, saves to `otp_codes` with 10-min expiration.
4. Backend sends OTP via SMTP to user's email.
5. User enters OTP and new password.
6. Frontend sends POST to `/verify-otp`.
7. Backend validates OTP, updates password, deletes OTP from database.

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

### Sync Triggers
- window.online event
- window.focus event
- visibilitychange event
- Every 5 seconds (background check)
- 500ms after page load

## Expected Outcomes & Future Works

**Expected Outcomes:**
1. **Faster Item Recovery:** Because of the AI Matching Engine, the chances of finding the owner or the lost item are higher and faster compared to manual Facebook group posting.
2. **Centralized System:** Magkakaroon ng iisang platform ang SJC community para sa Lost & Found.
3. **Data Privacy:** Legit students, faculty, at staff lang ng SJC ang makakagamit ng system dahil sa PHINMAEd email restriction.
4. **Operational Efficiency for Admin:** Mas madali para sa SJC office ang mag-track at mag-manage ng mga reported items.

**Future Works (Possibilities):**
1. **SMS Notification Integration:** Para sa mga estudyanteng hindi madalas mag-check ng email.
2. **Advanced AI (CNN / YOLO):** I-upgrade ang Image Analysis gamit ang object detection models.
3. **Analytics Dashboard:** Magdadagdag ng charts sa Admin para makita kung saang location madaming nawawalang item.

## Possible Defense Questions & Answers (Taglish)

Heto ang mga posibleng itanong ng panel sa defense at kung paano niyo sila sasagutin nang natural:

**Q: Sino-sino ang pwedeng maging Admin? Kasama ba ang teachers?**
* **A:** *"Hindi po. Ang Admin role ay exclusive para sa SJC Office or Student Affairs (tulad ng SAO). Sila yung humahawak ng Lost & Found. Yung mga teachers ay 'User' role lang po, same as students, kasi sila yung mga nagrereport at naghahanap ng gamit."*

**Q: Paano kung ang nakakita ng item ay janitor o security guard na walang PHINMAEd email?**
* **A:** *"Since required po ang PHINMAEd email, hindi sila makakagawa ng direct account. Ang protocol po is ibibigay nila physically yung item sa SJC Office. Then, ang Admin po ang magre-report non sa system on their behalf para pumasok sa database at AI matching. This ensures na lahat ng items ay accounted for at legitimate."*

**Q: Saan nakikita ng user yung AI Match notification?**
* **A:** *"Real-time po. Pagka-click ng admin sa 'Run AI Match', mag-ge-generate ng notification record sa database. Dahil naka-WebSocket tayo, magkakaroon agad ng red badge yung bell icon sa screen ng user. Makikita din nila yung match card sa 'Potential Matches' panel sa items page nila kung saan pwede nila i-confirm at mag-start ng chat."*

**Q: Sa UML/DFD, paano nag-uusap ang system?**
* **A:** *"Sa flow po: Admin clicks 'Run AI Match' -> Frontend calls Python AI Microservice -> Python computes image similarity -> PocketBase saves to `matches` and `notifications` database -> User receives the alert via WebSocket at mag-aappear sa UI nila."*

**Q: Ano ba talaga ang Wispbyte, PocketBase, at SQLite?**
* **A:** *"Wisbyte is the cloud hosting provider (yung server). PocketBase is the backend application running inside Wisbyte. And SQLite is the actual database engine na nag-iimbak ng data. Yung IndexedDB naman po ay local database sa browser para sa offline mode."*

**Q: Bakit may Offline-First feature?**
* **A:** *"Mahina po ang campus WiFi sa ibang sulok ng school. Kapag nawalan ng internet, naka-save yung report sa IndexedDB. Kapag bumalik ang connection, automatic siyang mag-s-sync sa SQLite database para hindi mawala yung data."*

**Q: Bakit walang 'Delete' button sa Admin Dashboard?**
* **A:** *"Sadya po naming tinanggal ang delete button para mapanatili ang data integrity. Kailangan ng AI matching algorithm na may complete historical dataset para maging accurate. Imbes na i-delete, gumagamit kami ng statuses tulad ng 'Verified' o 'Recovered'."*

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
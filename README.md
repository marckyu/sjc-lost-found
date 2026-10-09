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
| Offline Storage | IndexedDB (via `idb`) |
| PWA | Service Worker + Web Manifest |
| Deployment | Vercel (frontend) + Cloudflare Tunnel (backend) |

## Project Structure



## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- PocketBase binary

### Install dependencies

```bash
npm install
pip install -r python-service/requirements.txt

VITE_PB_URL=http://localhost:8090
VITE_MATCHER_URL=http://localhost:5000

cd pocketbase
./pocketbase serve

cd python-service
python app.py

npm run dev

npm run build

Team ArkNights Roles and Members

Documentation: Osinsao, Camille
Documentation: Taladro Greg Martin

Designer Ui: Talusan, Moschin Kunday
Designer Ui: Quintela, Addriane Zhermielle

Developer: Asuncion, JohnMarc F.

Members:

Leader: Quintela, Addrieane Zhermielle
1. Asuncion, JohnMarc F.
2. Talusan, Moschin Kunday
3. Taladro, Greg Martin
4. Osinao, Camille


**`Ctrl+S`**

---

## 📄 FILE 2 — `.env.example` (sa root)

```env
VITE_PB_URL=http://localhost:8090
VITE_MATCHER_URL=http://localhost:5000
# Setup Guide

Complete step-by-step installation for running SJC Campus Lost and Found locally.

## Prerequisites

- Node.js 18 or higher (https://nodejs.org)
- Python 3.10 or higher (https://python.org)
- Git (https://git-scm.com)

## Step 1: Clone the Repository

    git clone https://github.com/your-username/sjc-lost-found.git
    cd sjc-lost-found

## Step 2: Install Node Dependencies

    npm install

## Step 3: Install Python Dependencies

    cd python-service
    pip install -r requirements.txt
    cd ..

## Step 4: Download PocketBase

Windows:

1. Download from https://pocketbase.io/docs
2. Extract pocketbase.exe to the pocketbase folder

Mac or Linux:

    cd pocketbase
    wget https://github.com/pocketbase/pocketbase/releases/download/v0.40.4/pocketbase_0.40.4_linux_amd64.zip
    unzip pocketbase_0.40.4_linux_amd64.zip
    chmod +x pocketbase

## Step 5: Configure Environment

Copy .env.example to .env.local:

    cp .env.example .env.local

Edit .env.local:

    VITE_PB_URL=http://localhost:8090
    VITE_MATCHER_URL=http://localhost:5000

## Step 6: Start PocketBase

Terminal 1:

    cd pocketbase
    ./pocketbase serve

Windows:

    .\pocketbase.exe serve

Expected output:

    Server started at http://127.0.0.1:8090
    REST API: http://127.0.0.1:8090/api/
    Dashboard: http://127.0.0.1:8090/_/

### Create Admin Account

1. Open http://127.0.0.1:8090/_/
2. Create the first admin account
3. Save credentials

### Import Collections

1. PocketBase admin, Settings, Import collections
2. Upload pocketbase/pb_migrations JSON files

Or create manually using ERD.md.

## Step 7: Start Python Service

Terminal 2:

    cd python-service
    python app.py

Expected output:

    Starting Image Analysis Service on port 5000

Test: curl http://localhost:5000/health

## Step 8: Start Vite Dev Server

Terminal 3:

    npm run dev

Expected output:

    VITE v5.4.21 ready in XXX ms
    Local: http://localhost:5173/

## Step 9: Access the App

Open http://localhost:5173/

First-time setup:

1. Click Sign Up
2. Register with a @phinmaed.com email
3. Sign in

## Running All Services

Three terminals:

- Terminal 1: cd pocketbase && ./pocketbase serve (backend)
- Terminal 2: cd python-service && python app.py (AI service)
- Terminal 3: npm run dev (frontend)

Tip: Use VS Code integrated terminal and split into three panes.

## Building for Production

    npm run build

Output in dist/. Test locally:

    npm run preview

## Deployment

### Frontend on Vercel

1. Push code to GitHub
2. Go to https://vercel.com, Import project
3. Framework preset: Vite
4. Add environment variables:
   - VITE_PB_URL equals PocketBase public URL
   - VITE_MATCHER_URL equals Python service public URL
5. Deploy

### Backend on PocketBase plus Cloudflare Tunnel

On your server:

    cd pocketbase
    ./pocketbase serve --http=0.0.0.0:8090

In another terminal:

    cloudflared tunnel --url http://localhost:8090

Copy the generated https URL into Vercel VITE_PB_URL.

Configure CORS:

    ./pocketbase serve --origins="https://your-app.vercel.app,http://localhost:5173"

### AI Service on Cloudflare Tunnel

    cd python-service
    python app.py

New terminal:

    cloudflared tunnel --url http://localhost:5000

Copy the tunnel URL into VITE_MATCHER_URL.

## Troubleshooting

### Cannot reach the server

- Check PocketBase is running at http://127.0.0.1:8090/_/
- Verify .env.local has correct VITE_PB_URL
- Restart Vite after changing .env.local

### PHINMAEd email required

- Sign up with an email ending in @phinmaed.com

### Image matching not working

- Check Python service at http://localhost:5000/health
- Verify VITE_MATCHER_URL is set
- Text matching still works if image service is offline

### Syncing stuck

- DevTools, Application, IndexedDB, sjc-lost-found, queue
- Right-click Delete database to reset
- Refresh the page

### Port already in use

- PocketBase: netstat -ano | findstr 8090 (Windows)
- Kill process: taskkill /PID pid /F

## Next Steps

- Read ARCHITECTURE.md
- Read OFFLINE-FEATURE.md
- Read DEFENSE-NOTES.md
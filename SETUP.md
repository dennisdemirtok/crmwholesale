# Flattered Wholesale CRM — Setup Guide

## Prerequisites
- Node.js 20+
- Redis (for BullMQ job queue)
- Supabase project (Postgres database)
- Google Cloud project with Gmail API enabled

## 1. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project "Flattered Wholesale CRM"
3. Enable **Gmail API**
4. Configure **OAuth consent screen**:
   - Type: **Internal** (only @flattered.se accounts)
   - Scopes: `gmail.send`, `gmail.readonly`, `gmail.modify`, `userinfo.email`, `userinfo.profile`
5. Create **OAuth 2.0 Client ID** (Web Application):
   - Redirect URI: `https://crm.flattered.se/auth/google/callback` (or `http://localhost:3001/auth/google/callback` for dev)
   - Save Client ID and Client Secret

## 2. Supabase Setup

1. Create a Supabase project
2. Run the SQL from `backend/src/db/schema.sql` in the Supabase SQL Editor
3. Also create the RPC function for tracking:

```sql
CREATE OR REPLACE FUNCTION increment_open_count(pixel_id uuid)
RETURNS void AS $$
  UPDATE sent_emails
  SET open_count = open_count + 1,
      opened_at = COALESCE(opened_at, NOW())
  WHERE tracking_pixel_id = pixel_id;
$$ LANGUAGE sql;
```

4. Note your Supabase URL and Service Role Key

## 3. Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:3001
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
REDIS_URL=redis://localhost:6379
JWT_SECRET=<random 32+ char string>
ENCRYPTION_KEY=<64 hex chars — run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

## 4. Local Development

```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Backend
cd backend
npm install
npm run dev

# Terminal 3: Frontend
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:3001

## 5. Railway Deployment

### Backend service:
- Root directory: `backend`
- Build: `npm ci && npm run build`
- Start: `npm start`
- Set all env vars from .env.example

### Frontend service:
- Root directory: `frontend`
- Build: `npm ci && npm run build`
- Serve the `dist/` folder as static (or use the Dockerfile)

### Redis:
- Add a Redis service in Railway

### Environment variables on Railway:
- `FRONTEND_URL` = your frontend Railway URL
- `API_URL` = your backend Railway URL
- `GOOGLE_REDIRECT_URI` = `https://<backend-url>/auth/google/callback`

## Architecture

```
frontend (React + Tailwind)  →  backend (Express + TypeScript)  →  Supabase (Postgres)
                                    ↕                                    ↕
                                Gmail API (per user OAuth)          Redis + BullMQ
```

## Key Features
- Google OAuth login (sends email AS the seller)
- Contact management with search, filter, CSV import
- Campaign builder with multi-step email sequences
- Conditional logic: send based on open/reply status
- Tracking pixel for open detection
- Gmail polling for reply detection
- Dashboard with email stats
- Role-based access (seller/manager/admin)

# AI AIKYAM Admin Dashboard

Separate React + Express + PostgreSQL admin dashboard for the existing AI AIKYAM database.

Features:
- Admin password login with JWT
- Registration list, search and status filters
- Verify/unverify registrations
- All / verified / unverified CSV exports
- Query inbox
- Gmail compose links for each query

The dashboard talks directly to PostgreSQL through its own Express server. No MongoDB is needed because the existing AI AIKYAM data is in PostgreSQL.

## Local setup

### Server
```bash
cd server
npm install
```

Create `server/.env`:
```env
PORT=5001
DATABASE_URL=YOUR_RENDER_EXTERNAL_DATABASE_URL
JWT_SECRET=CHANGE_TO_A_LONG_RANDOM_SECRET
ADMIN_PASSWORD=CHANGE_TO_A_STRONG_ADMIN_PASSWORD
CLIENT_URL=http://localhost:5174
NODE_ENV=development
```

Run:
```bash
npm run dev
```

### Client
```bash
cd client
npm install
```

Create `client/.env`:
```env
VITE_API_URL=http://localhost:5001/api
```

Run:
```bash
npm run dev
```

## Render

Deploy `server` as a Web Service:
- Build: `npm install`
- Start: `npm start`
- Environment variables: DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD, CLIENT_URL, NODE_ENV=production

Deploy `client` as a Static Site:
- Build: `npm install && npm run build`
- Publish directory: `dist`
- VITE_API_URL=https://YOUR-DASHBOARD-SERVER.onrender.com/api

Keep DATABASE_URL, ADMIN_PASSWORD and JWT_SECRET only on the server.

The dashboard expects the existing `registrations` and `queries` PostgreSQL tables.

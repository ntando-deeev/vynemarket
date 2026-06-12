# ✦ VyneMarket

**The Social Business Marketplace** — List your business, invite your network, and unlock premium features for free.

## 🚀 Features

### Free (always)
- Business listing with up to 8 photos + 2 videos
- Analytics dashboard (views, leads, saves)
- Featured badge & SEO-optimised profile
- Priority search ranking
- Contact messages from customers

### Business Pro (paid $9.99/mo OR invite 3 friends FREE)
- Customer invite links & QR codes
- Private community feed
- Broadcast announcements to followers
- Loyalty stamp card system
- Custom profile slug

### Growth Suite (paid $19.99/mo OR invite 10 friends FREE)
- Everything in Pro
- Competitor analytics
- Lead export (CSV)
- Verified badge
- Sponsored listing placement
- Custom CTA button

## 🎁 Invite & Earn

Invite friends to VyneMarket. For every friend who signs up with your link:
- **3 invites** → Business Pro unlocked automatically (no payment)
- **10 invites** → Growth Suite unlocked automatically (no payment)

## 🛠️ Tech Stack
- **Backend**: Node.js + Express
- **Auth**: JWT + bcrypt
- **Storage**: JSON files (Render disk / local)
- **Frontend**: Vanilla HTML/CSS/JS
- **Deploy**: Render.com (see render.yaml)

## 🏃 Running locally

```bash
npm install
node server.js
```

Server runs on port 3000 by default (`PORT` env var to override).

## 🌐 Deployment on Render

1. Push to GitHub
2. Connect repo in Render
3. It will auto-detect `render.yaml`
4. Set `DATA_DIR=/data` (or use the disk mount)

## 📁 Data files

All data is stored in `./data/` (or `DATA_DIR`):
- `users.json` — user accounts + referral tracking
- `listings.json` — business listings
- `messages.json` — contact messages
- `reviews.json` — ratings & reviews
- `referrals.json` — referral log
- `follows.json` — saved listings
- `broadcasts.json` — business broadcasts
- `stamps.json` — loyalty stamps

---
Built with ♥ — VyneMarket © 2024

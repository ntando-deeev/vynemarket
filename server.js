const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'growthmarket-secret-2024';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Data helpers ──────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const REVIEWS_FILE  = path.join(DATA_DIR, 'reviews.json');

function readJSON(file)       { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return []; } }
function writeJSON(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ─── File uploads ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isVideo = file.mimetype.startsWith('video/');
    const dir = path.join(__dirname, 'uploads', isVideo ? 'videos' : 'images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm'];
    cb(null, ok.includes(file.mimetype));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ─── Auth middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorised' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
function optionalAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.replace('Bearer ', '');
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch {} }
  next();
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, country, businessName } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required.' });
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
      return res.status(400).json({ error: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(), createdAt: new Date().toISOString(),
      name: name.trim(), email: email.toLowerCase().trim(),
      password: hashed, phone: phone||null, country: country||null,
      businessName: businessName||null, avatar: null,
      verified: false, listingCount: 0
    };
    users.push(user);
    writeJSON(USERS_FILE, users);
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    const { password: _, ...safe } = user;
    res.json({ success: true, token, user: safe });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    const users = readJSON(USERS_FILE);
    const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(400).json({ error: 'Invalid email or password.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid email or password.' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    const { password: _, ...safe } = user;
    res.json({ success: true, token, user: safe });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password: _, ...safe } = user;
  res.json(safe);
});

// Update profile
app.put('/api/auth/profile', authMiddleware, upload.single('avatar'), (req, res) => {
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const { name, phone, country, businessName, bio } = req.body;
  if (name)         users[idx].name = name.trim();
  if (phone)        users[idx].phone = phone;
  if (country)      users[idx].country = country;
  if (businessName) users[idx].businessName = businessName;
  if (bio)          users[idx].bio = bio;
  if (req.file)     users[idx].avatar = `/uploads/images/${req.file.filename}`;
  writeJSON(USERS_FILE, users);
  const { password: _, ...safe } = users[idx];
  res.json({ success: true, user: safe });
});

// ══════════════════════════════════════════════════════════════════════════════
// LISTINGS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Create listing
app.post('/api/listings', optionalAuth, upload.fields([{ name:'images', maxCount:8 }, { name:'videos', maxCount:2 }]), (req, res) => {
  try {
    const {
      businessName, category, description, tagline,
      price, currency, priceType,
      whatsapp, phone, email, website,
      location, country, city,
      instagram, tiktok, facebook, twitter, youtube,
      contactName, contactRole, tags,
      openHours, established, employees
    } = req.body;

    if (!businessName || !description || !category)
      return res.status(400).json({ error: 'businessName, category and description are required.' });

    const images = (req.files?.images || []).map(f => `/uploads/images/${f.filename}`);
    const videos = (req.files?.videos || []).map(f => `/uploads/videos/${f.filename}`);

    const listing = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      featured: false,
      ownerId: req.user?.id || null,
      ownerName: req.user?.name || contactName || null,

      businessName: businessName.trim(),
      tagline: tagline?.trim() || null,
      category,
      description: description.trim(),

      price: price || null,
      currency: currency || 'USD',
      priceType: priceType || null,

      contact: {
        name: contactName||null,
        role: contactRole||null,
        whatsapp: whatsapp||null,
        phone: phone||null,
        email: email||null,
        website: website||null
      },
      location: location||null,
      country: country||null,
      city: city||null,

      social: {
        instagram: instagram||null,
        tiktok: tiktok||null,
        facebook: facebook||null,
        twitter: twitter||null,
        youtube: youtube||null
      },

      openHours: openHours||null,
      established: established||null,
      employees: employees||null,

      tags: tags ? tags.split(',').map(t=>t.trim()).filter(Boolean) : [],
      images,
      videos,
      views: 0,
      leads: 0,
      saves: 0,
      reviewCount: 0,
      rating: 0
    };

    const listings = readJSON(LISTINGS_FILE);
    listings.unshift(listing);
    writeJSON(LISTINGS_FILE, listings);

    // Update user listing count
    if (req.user) {
      const users = readJSON(USERS_FILE);
      const idx   = users.findIndex(u => u.id === req.user.id);
      if (idx !== -1) { users[idx].listingCount = (users[idx].listingCount||0)+1; writeJSON(USERS_FILE, users); }
    }

    res.json({ success: true, listing });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// Get listings
app.get('/api/listings', (req, res) => {
  const { category, country, city, search, featured, ownerId, limit=20, offset=0, sort='newest' } = req.query;
  let listings = readJSON(LISTINGS_FILE).filter(l => l.status === 'active');

  if (category && category !== 'all') listings = listings.filter(l => l.category === category);
  if (country)   listings = listings.filter(l => l.country?.toLowerCase().includes(country.toLowerCase()));
  if (city)      listings = listings.filter(l => l.city?.toLowerCase().includes(city.toLowerCase()));
  if (featured === 'true') listings = listings.filter(l => l.featured);
  if (ownerId)   listings = listings.filter(l => l.ownerId === ownerId);
  if (search) {
    const q = search.toLowerCase();
    listings = listings.filter(l =>
      l.businessName.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.tagline?.toLowerCase().includes(q) ||
      (l.tags||[]).some(t => t.toLowerCase().includes(q)) ||
      l.city?.toLowerCase().includes(q) ||
      l.country?.toLowerCase().includes(q)
    );
  }

  if (sort === 'popular') listings.sort((a,b) => (b.views||0)-(a.views||0));
  else if (sort === 'rating') listings.sort((a,b) => (b.rating||0)-(a.rating||0));
  else listings.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));

  res.json({ total: listings.length, listings: listings.slice(Number(offset), Number(offset)+Number(limit)) });
});

// Get single listing
app.get('/api/listings/:id', (req, res) => {
  const listings = readJSON(LISTINGS_FILE);
  const listing  = listings.find(l => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  listing.views = (listing.views||0)+1;
  writeJSON(LISTINGS_FILE, listings.map(l => l.id === listing.id ? listing : l));
  // Attach owner info
  if (listing.ownerId) {
    const users = readJSON(USERS_FILE);
    const owner = users.find(u => u.id === listing.ownerId);
    if (owner) { const { password: _, ...safe } = owner; listing.owner = safe; }
  }
  res.json(listing);
});

// Update listing
app.put('/api/listings/:id', authMiddleware, upload.fields([{ name:'images', maxCount:8 }, { name:'videos', maxCount:2 }]), (req, res) => {
  const listings = readJSON(LISTINGS_FILE);
  const idx      = listings.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (listings[idx].ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const fields = ['businessName','tagline','category','description','price','currency','priceType',
                  'whatsapp','phone','email','website','location','country','city',
                  'instagram','tiktok','facebook','twitter','youtube',
                  'contactName','contactRole','openHours','established','employees'];
  fields.forEach(f => { if (req.body[f] !== undefined) {
    if (['whatsapp','phone','email','website'].includes(f)) listings[idx].contact[f] = req.body[f];
    else if (['instagram','tiktok','facebook','twitter','youtube'].includes(f)) listings[idx].social[f] = req.body[f];
    else listings[idx][f] = req.body[f];
  }});

  if (req.body.tags) listings[idx].tags = req.body.tags.split(',').map(t=>t.trim()).filter(Boolean);
  if (req.files?.images?.length) listings[idx].images = (req.files.images||[]).map(f=>`/uploads/images/${f.filename}`);
  listings[idx].updatedAt = new Date().toISOString();
  writeJSON(LISTINGS_FILE, listings);
  res.json({ success: true, listing: listings[idx] });
});

// Delete listing
app.delete('/api/listings/:id', authMiddleware, (req, res) => {
  const listings = readJSON(LISTINGS_FILE);
  const listing  = listings.find(l => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });
  if (listing.ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  writeJSON(LISTINGS_FILE, listings.filter(l => l.id !== req.params.id));
  res.json({ success: true });
});

// Save / unsave listing
app.post('/api/listings/:id/save', authMiddleware, (req, res) => {
  const users   = readJSON(USERS_FILE);
  const idx     = users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const saved   = users[idx].saved || [];
  const already = saved.includes(req.params.id);
  users[idx].saved = already ? saved.filter(id=>id!==req.params.id) : [...saved, req.params.id];
  writeJSON(USERS_FILE, users);
  // Update listing save count
  const listings = readJSON(LISTINGS_FILE);
  const lidx     = listings.findIndex(l=>l.id===req.params.id);
  if (lidx !== -1) { listings[lidx].saves = (listings[lidx].saves||0) + (already?-1:1); writeJSON(LISTINGS_FILE,listings); }
  res.json({ success: true, saved: !already });
});

// ══════════════════════════════════════════════════════════════════════════════
// REVIEWS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/listings/:id/reviews', authMiddleware, (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || !comment) return res.status(400).json({ error: 'rating and comment required.' });
  const reviews = readJSON(REVIEWS_FILE);
  const existing = reviews.find(r => r.listingId === req.params.id && r.userId === req.user.id);
  if (existing) return res.status(400).json({ error: 'You already reviewed this listing.' });
  const review = {
    id: uuidv4(), listingId: req.params.id, userId: req.user.id,
    userName: req.user.name, rating: Number(rating), comment: comment.trim(),
    createdAt: new Date().toISOString()
  };
  reviews.push(review);
  writeJSON(REVIEWS_FILE, reviews);
  // Recalculate listing rating
  const listingReviews = reviews.filter(r => r.listingId === req.params.id);
  const avgRating = listingReviews.reduce((a,r)=>a+r.rating,0)/listingReviews.length;
  const listings = readJSON(LISTINGS_FILE);
  const idx      = listings.findIndex(l=>l.id===req.params.id);
  if (idx !== -1) { listings[idx].rating = Math.round(avgRating*10)/10; listings[idx].reviewCount = listingReviews.length; writeJSON(LISTINGS_FILE,listings); }
  res.json({ success: true, review });
});

app.get('/api/listings/:id/reviews', (req, res) => {
  const reviews = readJSON(REVIEWS_FILE).filter(r => r.listingId === req.params.id);
  res.json(reviews);
});

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES (Contact seller)
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/listings/:id/contact', (req, res) => {
  try {
    const { senderName, senderEmail, senderPhone, message } = req.body;
    if (!senderName || !senderEmail || !message) return res.status(400).json({ error: 'name, email and message required.' });
    const listings = readJSON(LISTINGS_FILE);
    const listing  = listings.find(l=>l.id===req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    const messages = readJSON(MESSAGES_FILE);
    messages.push({
      id: uuidv4(), listingId: req.params.id,
      businessName: listing.businessName,
      senderName, senderEmail, senderPhone: senderPhone||null,
      message, createdAt: new Date().toISOString(), read: false
    });
    writeJSON(MESSAGES_FILE, messages);
    // Increment leads
    const idx = listings.findIndex(l=>l.id===req.params.id);
    if (idx !== -1) { listings[idx].leads = (listings[idx].leads||0)+1; writeJSON(LISTINGS_FILE,listings); }
    res.json({ success: true, message: 'Message sent to business owner.' });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// Get messages for my listings
app.get('/api/messages', authMiddleware, (req, res) => {
  const listings = readJSON(LISTINGS_FILE).filter(l=>l.ownerId===req.user.id).map(l=>l.id);
  const messages = readJSON(MESSAGES_FILE).filter(m=>listings.includes(m.listingId));
  res.json(messages);
});

// ══════════════════════════════════════════════════════════════════════════════
// USERS / PUBLIC PROFILES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/users/:id', (req, res) => {
  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password: _, ...safe } = user;
  res.json(safe);
});

// ══════════════════════════════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/stats', (req, res) => {
  const listings = readJSON(LISTINGS_FILE).filter(l=>l.status==='active');
  const users    = readJSON(USERS_FILE);
  const cats     = [...new Set(listings.map(l=>l.category))].length;
  const countries= [...new Set(listings.map(l=>l.country).filter(Boolean))].length;
  res.json({
    activeListings: listings.length,
    totalUsers: users.length,
    categories: cats,
    countries: countries || 0
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/categories', (req, res) => {
  const listings = readJSON(LISTINGS_FILE).filter(l=>l.status==='active');
  const counts   = {};
  listings.forEach(l => { counts[l.category] = (counts[l.category]||0)+1; });
  res.json(counts);
});

// ──────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GrowthMarket v2 running on port ${PORT}`));

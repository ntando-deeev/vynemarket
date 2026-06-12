const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  maxHttpBufferSize: 20 * 1024 * 1024  // 20 MB for file transfers
});

const JWT_SECRET = process.env.JWT_SECRET || 'vynemarket-secret-2024';
const PORT = process.env.PORT || 3000;

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
[DATA_DIR, UPLOADS_DIR,
 path.join(UPLOADS_DIR,'images'),
 path.join(UPLOADS_DIR,'videos'),
 path.join(UPLOADS_DIR,'chat')
].forEach(d => fs.mkdirSync(d, { recursive: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

const LISTINGS_FILE      = path.join(DATA_DIR, 'listings.json');
const USERS_FILE         = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE      = path.join(DATA_DIR, 'messages.json');
const REVIEWS_FILE       = path.join(DATA_DIR, 'reviews.json');
const INVITES_FILE       = path.join(DATA_DIR, 'invites.json');
const FOLLOWS_FILE       = path.join(DATA_DIR, 'follows.json');
const BROADCASTS_FILE    = path.join(DATA_DIR, 'broadcasts.json');
const STAMPS_FILE        = path.join(DATA_DIR, 'stamps.json');
const REFERRALS_FILE     = path.join(DATA_DIR, 'referrals.json');
const CHATS_FILE         = path.join(DATA_DIR, 'chats.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

function readJSON(file){ try{ return JSON.parse(fs.readFileSync(file,'utf8')); }catch{ return []; } }
function writeJSON(file,data){ fs.writeFileSync(file,JSON.stringify(data,null,2)); }

const PLANS = {
  free:   { name:'Free',         price:0,     inviteUnlock:0,  features:['listing','gallery','analytics','featured_badge','seo_profile','priority_search'] },
  pro:    { name:'Pro',          price:9.99,  inviteUnlock:3,  features:['listing','gallery','analytics','featured_badge','seo_profile','priority_search','invite_customers','community_feed','broadcasts','loyalty_stamps','custom_slug'] },
  growth: { name:'Growth Suite', price:19.99, inviteUnlock:10, features:['listing','gallery','analytics','featured_badge','seo_profile','priority_search','invite_customers','community_feed','broadcasts','loyalty_stamps','custom_slug','competitor_analytics','lead_export','verified_badge','sponsored_listing','custom_cta'] }
};

function getEffectivePlan(user){
  const paid=user?.plan||'free';
  const invites=user?.referralCount||0;
  if(invites>=PLANS.growth.inviteUnlock) return 'growth';
  if(invites>=PLANS.pro.inviteUnlock)    return 'pro';
  return paid;
}
function userHasFeature(user,feature){
  return (PLANS[getEffectivePlan(user)]?.features||PLANS.free.features).includes(feature);
}

const storage = multer.diskStorage({
  destination:(req,file,cb)=>{ const d=path.join(UPLOADS_DIR,file.mimetype.startsWith('video/')?'videos':'images'); fs.mkdirSync(d,{recursive:true}); cb(null,d); },
  filename:(req,file,cb)=>cb(null,uuidv4()+path.extname(file.originalname))
});
const upload = multer({ storage, fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm'].includes(file.mimetype)), limits:{fileSize:50*1024*1024} });

// Chat-specific multer (images + videos, stored in /uploads/chat/)
const chatStorage = multer.diskStorage({
  destination:(req,file,cb)=>{ cb(null, path.join(UPLOADS_DIR,'chat')); },
  filename:(req,file,cb)=>cb(null, uuidv4()+path.extname(file.originalname))
});
const chatUpload = multer({
  storage: chatStorage,
  fileFilter:(req,file,cb)=>cb(null,[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/quicktime','video/webm'
  ].includes(file.mimetype)),
  limits:{ fileSize: 20*1024*1024 }
});

// ── Notification helpers ──────────────────────────────────────────
function pushNotification(userId, type, data){
  const notifs = readJSON(NOTIFICATIONS_FILE);
  const n = { id:uuidv4(), createdAt:new Date().toISOString(), userId, type, read:false, ...data };
  notifs.unshift(n);
  writeJSON(NOTIFICATIONS_FILE, notifs.slice(0,200)); // keep last 200
  // Push to socket if user is online
  io.to(`user:${userId}`).emit('notification', n);
  return n;
}

// ── Socket.io auth helper ────────────────────────────────────────
function socketAuthUser(token){
  try{ return jwt.verify(token, JWT_SECRET); }catch{ return null; }
}

function authMiddleware(req,res,next){ const t=(req.headers['authorization']||'').replace('Bearer ',''); if(!t) return res.status(401).json({error:'Unauthorised'}); try{ req.user=jwt.verify(t,JWT_SECRET); next(); }catch{ res.status(401).json({error:'Invalid token'}); } }
function optionalAuth(req,res,next){ const t=(req.headers['authorization']||'').replace('Bearer ',''); if(t){try{req.user=jwt.verify(t,JWT_SECRET);}catch{}} next(); }

// AUTH
app.post('/api/auth/register', async (req,res)=>{
  try{
    const {name,email,password,phone,country,businessName,referralCode}=req.body;
    if(!name||!email||!password) return res.status(400).json({error:'name, email and password are required.'});
    if(password.length<6) return res.status(400).json({error:'Password must be at least 6 characters.'});
    const users=readJSON(USERS_FILE);
    if(users.find(u=>u.email.toLowerCase()===email.toLowerCase())) return res.status(400).json({error:'Email already registered.'});
    const hashed=await bcrypt.hash(password,10);
    const myCode=uuidv4().replace(/-/g,'').slice(0,8).toUpperCase();
    const user={id:uuidv4(),createdAt:new Date().toISOString(),name:name.trim(),email:email.toLowerCase().trim(),password:hashed,phone:phone||null,country:country||null,businessName:businessName||null,bio:null,avatar:null,plan:'free',planActivatedAt:null,planExpiresAt:null,referralCode:myCode,referredBy:null,referralCount:0,listingCount:0};
    if(referralCode){
      const referrer=users.find(u=>u.referralCode===referralCode.toUpperCase());
      if(referrer){
        user.referredBy=referrer.id;
        const rIdx=users.findIndex(u=>u.id===referrer.id);
        if(rIdx!==-1){
          users[rIdx].referralCount=(users[rIdx].referralCount||0)+1;
          const referrals=readJSON(REFERRALS_FILE);
          referrals.push({id:uuidv4(),referrerId:referrer.id,referredId:user.id,referredName:user.name,referredEmail:user.email,createdAt:new Date().toISOString()});
          writeJSON(REFERRALS_FILE,referrals);
        }
      }
    }
    users.push(user);
    writeJSON(USERS_FILE,users);
    const token=jwt.sign({id:user.id,email:user.email,name:user.name},JWT_SECRET,{expiresIn:'30d'});
    const {password:_p,...safe}=user; safe.effectivePlan=getEffectivePlan(safe);
    res.json({success:true,token,user:safe});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.post('/api/auth/login', async (req,res)=>{
  try{
    const {email,password}=req.body;
    if(!email||!password) return res.status(400).json({error:'Email and password required.'});
    const users=readJSON(USERS_FILE);
    const user=users.find(u=>u.email.toLowerCase()===email.toLowerCase());
    if(!user) return res.status(400).json({error:'Invalid email or password.'});
    const match=await bcrypt.compare(password,user.password);
    if(!match) return res.status(400).json({error:'Invalid email or password.'});
    const token=jwt.sign({id:user.id,email:user.email,name:user.name},JWT_SECRET,{expiresIn:'30d'});
    const {password:_p,...safe}=user; safe.effectivePlan=getEffectivePlan(safe);
    res.json({success:true,token,user:safe});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.get('/api/auth/me', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!user) return res.status(404).json({error:'User not found'});
  const {password:_p,...safe}=user; safe.effectivePlan=getEffectivePlan(safe);
  res.json(safe);
});

app.put('/api/auth/profile', authMiddleware, upload.single('avatar'), (req,res)=>{
  const users=readJSON(USERS_FILE);
  const idx=users.findIndex(u=>u.id===req.user.id);
  if(idx===-1) return res.status(404).json({error:'User not found'});
  const {name,phone,country,businessName,bio}=req.body;
  if(name) users[idx].name=name.trim();
  if(phone!==undefined) users[idx].phone=phone;
  if(country!==undefined) users[idx].country=country;
  if(businessName!==undefined) users[idx].businessName=businessName;
  if(bio!==undefined) users[idx].bio=bio;
  if(req.file) users[idx].avatar=`/uploads/images/${req.file.filename}`;
  writeJSON(USERS_FILE,users);
  const {password:_p,...safe}=users[idx]; safe.effectivePlan=getEffectivePlan(safe);
  res.json({success:true,user:safe});
});

// PLANS
app.get('/api/plans', (req,res)=>res.json(PLANS));
app.post('/api/auth/upgrade', authMiddleware, (req,res)=>{
  const {plan}=req.body;
  if(!PLANS[plan]) return res.status(400).json({error:'Invalid plan.'});
  const users=readJSON(USERS_FILE);
  const idx=users.findIndex(u=>u.id===req.user.id);
  if(idx===-1) return res.status(404).json({error:'User not found'});
  const now=new Date(); const expires=new Date(now); expires.setMonth(expires.getMonth()+1);
  users[idx].plan=plan; users[idx].planActivatedAt=now.toISOString(); users[idx].planExpiresAt=expires.toISOString();
  writeJSON(USERS_FILE,users);
  const {password:_p,...safe}=users[idx]; safe.effectivePlan=getEffectivePlan(safe);
  res.json({success:true,user:safe});
});

// REFERRAL SYSTEM
app.get('/api/referral/stats', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!user) return res.status(404).json({error:'User not found'});
  const referrals=readJSON(REFERRALS_FILE).filter(r=>r.referrerId===req.user.id);
  const effectivePlan=getEffectivePlan(user);
  const count=user.referralCount||0;
  const nextUnlock=effectivePlan==='growth'?null:effectivePlan==='pro'?{plan:'growth',needInvites:PLANS.growth.inviteUnlock,progress:count}:{plan:'pro',needInvites:PLANS.pro.inviteUnlock,progress:count};
  res.json({referralCode:user.referralCode,referralCount:count,effectivePlan,nextUnlock,referrals:referrals.map(r=>({id:r.id,name:r.referredName,joinedAt:r.createdAt}))});
});

app.get('/api/referral/leaderboard', (req,res)=>{
  const users=readJSON(USERS_FILE);
  const top=users.filter(u=>(u.referralCount||0)>0).sort((a,b)=>(b.referralCount||0)-(a.referralCount||0)).slice(0,20).map(u=>({name:u.name,businessName:u.businessName||null,referralCount:u.referralCount||0,effectivePlan:getEffectivePlan(u)}));
  res.json(top);
});

app.get('/api/referral/validate/:code', (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.referralCode===req.params.code.toUpperCase());
  if(!user) return res.status(404).json({valid:false});
  res.json({valid:true,referrerName:user.name,referrerBusiness:user.businessName||null});
});

// LISTINGS
app.post('/api/listings', optionalAuth, upload.fields([{name:'images',maxCount:8},{name:'videos',maxCount:2}]), (req,res)=>{
  try{
    const {businessName,category,description,tagline,price,currency,priceType,whatsapp,phone,email,website,location,country,city,instagram,tiktok,facebook,twitter,youtube,contactName,contactRole,tags,openHours,established,employees,customSlug,customCta,ctaLabel}=req.body;
    if(!businessName||!description||!category) return res.status(400).json({error:'businessName, category and description are required.'});
    const images=(req.files?.images||[]).map(f=>`/uploads/images/${f.filename}`);
    const videos=(req.files?.videos||[]).map(f=>`/uploads/videos/${f.filename}`);
    let slug=null;
    if(customSlug&&req.user){const owner=readJSON(USERS_FILE).find(u=>u.id===req.user.id);if(userHasFeature(owner,'custom_slug')){const clean=customSlug.toLowerCase().replace(/[^a-z0-9-]/g,'');if(!readJSON(LISTINGS_FILE).find(l=>l.slug===clean))slug=clean;}}
    let ctaConfig=null;
    if(customCta&&req.user){const owner=readJSON(USERS_FILE).find(u=>u.id===req.user.id);if(userHasFeature(owner,'custom_cta'))ctaConfig={url:customCta,label:ctaLabel||'Contact Now'};}
    const listing={id:uuidv4(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'active',featured:false,sponsored:false,slug,ownerId:req.user?.id||null,ownerName:req.user?.name||contactName||null,businessName:businessName.trim(),tagline:tagline?.trim()||null,category,description:description.trim(),price:price||null,currency:currency||'USD',priceType:priceType||null,contact:{name:contactName||null,role:contactRole||null,whatsapp:whatsapp||null,phone:phone||null,email:email||null,website:website||null},location:location||null,country:country||null,city:city||null,social:{instagram:instagram||null,tiktok:tiktok||null,facebook:facebook||null,twitter:twitter||null,youtube:youtube||null},openHours:openHours||null,established:established||null,employees:employees||null,tags:tags?tags.split(',').map(t=>t.trim()).filter(Boolean):[],images,videos,views:0,leads:0,saves:0,reviewCount:0,rating:0,ctaConfig,analyticsHistory:[]};
    const listings=readJSON(LISTINGS_FILE); listings.unshift(listing); writeJSON(LISTINGS_FILE,listings);
    if(req.user){const users=readJSON(USERS_FILE);const idx=users.findIndex(u=>u.id===req.user.id);if(idx!==-1){users[idx].listingCount=(users[idx].listingCount||0)+1;writeJSON(USERS_FILE,users);}}
    res.json({success:true,listing});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.get('/api/listings', (req,res)=>{
  const {category,country,city,search,featured,sponsored,ownerId,limit=20,offset=0,sort='newest'}=req.query;
  let listings=readJSON(LISTINGS_FILE).filter(l=>l.status==='active');
  if(category&&category!=='all') listings=listings.filter(l=>l.category===category);
  if(country) listings=listings.filter(l=>l.country?.toLowerCase().includes(country.toLowerCase()));
  if(city) listings=listings.filter(l=>l.city?.toLowerCase().includes(city.toLowerCase()));
  if(featured==='true') listings=listings.filter(l=>l.featured);
  if(sponsored==='true') listings=listings.filter(l=>l.sponsored);
  if(ownerId) listings=listings.filter(l=>l.ownerId===ownerId);
  if(search){const q=search.toLowerCase();listings=listings.filter(l=>l.businessName.toLowerCase().includes(q)||l.description.toLowerCase().includes(q)||l.tagline?.toLowerCase().includes(q)||(l.tags||[]).some(t=>t.toLowerCase().includes(q)));}
  if(sort==='popular') listings.sort((a,b)=>((b.views||0)+(b.leads||0))-((a.views||0)+(a.leads||0)));
  else if(sort==='rating') listings.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else listings.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const sp=listings.filter(l=>l.sponsored); const norm=listings.filter(l=>!l.sponsored); listings=[...sp,...norm];
  const total=listings.length;
  res.json({listings:listings.slice(Number(offset),Number(offset)+Number(limit)),total,offset:Number(offset),limit:Number(limit)});
});

app.get('/api/listings/:id', optionalAuth, (req,res)=>{
  const listings=readJSON(LISTINGS_FILE);
  const idx=listings.findIndex(l=>l.id===req.params.id||(l.slug&&l.slug===req.params.id));
  if(idx===-1) return res.status(404).json({error:'Listing not found'});
  listings[idx].views=(listings[idx].views||0)+1;
  const now=new Date().toISOString().slice(0,10);
  const hist=listings[idx].analyticsHistory||[];
  const today=hist.find(h=>h.date===now);
  if(today) today.views=(today.views||0)+1; else hist.push({date:now,views:1,leads:0});
  listings[idx].analyticsHistory=hist.slice(-90);
  writeJSON(LISTINGS_FILE,listings);
  res.json(listings[idx]);
});

app.put('/api/listings/:id', authMiddleware, upload.fields([{name:'images',maxCount:8},{name:'videos',maxCount:2}]), (req,res)=>{
  const listings=readJSON(LISTINGS_FILE);
  const idx=listings.findIndex(l=>l.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Listing not found'});
  if(listings[idx].ownerId!==req.user.id) return res.status(403).json({error:'Forbidden'});
  ['businessName','category','description','tagline','price','currency','priceType','location','country','city','openHours','established','employees'].forEach(f=>{if(req.body[f]!==undefined)listings[idx][f]=req.body[f];});
  if(req.body.tags) listings[idx].tags=req.body.tags.split(',').map(t=>t.trim()).filter(Boolean);
  if(req.files?.images?.length) listings[idx].images=(req.files.images||[]).map(f=>`/uploads/images/${f.filename}`);
  if(req.files?.videos?.length) listings[idx].videos=(req.files.videos||[]).map(f=>`/uploads/videos/${f.filename}`);
  listings[idx].updatedAt=new Date().toISOString();
  writeJSON(LISTINGS_FILE,listings);
  res.json({success:true,listing:listings[idx]});
});

app.delete('/api/listings/:id', authMiddleware, (req,res)=>{
  const listings=readJSON(LISTINGS_FILE);
  const idx=listings.findIndex(l=>l.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Listing not found'});
  if(listings[idx].ownerId!==req.user.id) return res.status(403).json({error:'Forbidden'});
  listings[idx].status='deleted'; writeJSON(LISTINGS_FILE,listings);
  res.json({success:true});
});

// STATS
app.get('/api/stats', (req,res)=>{
  const listings=readJSON(LISTINGS_FILE).filter(l=>l.status==='active');
  const users=readJSON(USERS_FILE);
  const countries=new Set(listings.map(l=>l.country).filter(Boolean));
  res.json({activeListings:listings.length,totalUsers:users.length,countries:countries.size});
});

app.get('/api/categories', (req,res)=>{
  const listings=readJSON(LISTINGS_FILE).filter(l=>l.status==='active');
  const counts={};
  listings.forEach(l=>{ counts[l.category]=(counts[l.category]||0)+1; });
  res.json(counts);
});

// MESSAGES
app.post('/api/messages', optionalAuth, (req,res)=>{
  try{
    const {listingId,senderName,senderEmail,senderPhone,message}=req.body;
    if(!listingId||!message) return res.status(400).json({error:'listingId and message are required.'});
    const listings=readJSON(LISTINGS_FILE);
    const listing=listings.find(l=>l.id===listingId);
    if(!listing) return res.status(404).json({error:'Listing not found'});
    const msg={id:uuidv4(),createdAt:new Date().toISOString(),listingId,listingName:listing.businessName,ownerId:listing.ownerId,senderName:senderName||req.user?.name||'Anonymous',senderEmail:senderEmail||req.user?.email||null,senderPhone:senderPhone||null,message,read:false};
    const messages=readJSON(MESSAGES_FILE); messages.unshift(msg); writeJSON(MESSAGES_FILE,messages);
    const lIdx=listings.findIndex(l=>l.id===listingId);
    if(lIdx!==-1){listings[lIdx].leads=(listings[lIdx].leads||0)+1;const now=new Date().toISOString().slice(0,10);const hist=listings[lIdx].analyticsHistory||[];const today=hist.find(h=>h.date===now);if(today)today.leads=(today.leads||0)+1;else hist.push({date:now,views:0,leads:1});listings[lIdx].analyticsHistory=hist.slice(-90);writeJSON(LISTINGS_FILE,listings);}
    res.json({success:true,message:msg});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.get('/api/messages', authMiddleware, (req,res)=>{
  res.json(readJSON(MESSAGES_FILE).filter(m=>m.ownerId===req.user.id));
});

app.put('/api/messages/:id/read', authMiddleware, (req,res)=>{
  const messages=readJSON(MESSAGES_FILE);
  const idx=messages.findIndex(m=>m.id===req.params.id&&m.ownerId===req.user.id);
  if(idx===-1) return res.status(404).json({error:'Not found'});
  messages[idx].read=true; writeJSON(MESSAGES_FILE,messages);
  res.json({success:true});
});

// REVIEWS
app.post('/api/reviews', authMiddleware, (req,res)=>{
  const {listingId,rating,comment}=req.body;
  if(!listingId||!rating) return res.status(400).json({error:'listingId and rating required.'});
  if(rating<1||rating>5) return res.status(400).json({error:'Rating must be 1-5.'});
  const reviews=readJSON(REVIEWS_FILE);
  if(reviews.find(r=>r.listingId===listingId&&r.userId===req.user.id)) return res.status(400).json({error:'Already reviewed.'});
  const review={id:uuidv4(),createdAt:new Date().toISOString(),listingId,userId:req.user.id,userName:req.user.name,rating:Number(rating),comment:comment||null};
  reviews.push(review); writeJSON(REVIEWS_FILE,reviews);
  const listings=readJSON(LISTINGS_FILE);
  const idx=listings.findIndex(l=>l.id===listingId);
  if(idx!==-1){const lr=reviews.filter(r=>r.listingId===listingId);listings[idx].rating=parseFloat((lr.reduce((s,r)=>s+r.rating,0)/lr.length).toFixed(1));listings[idx].reviewCount=lr.length;writeJSON(LISTINGS_FILE,listings);}
  res.json({success:true,review});
});

app.get('/api/reviews/:listingId', (req,res)=>{
  res.json(readJSON(REVIEWS_FILE).filter(r=>r.listingId===req.params.listingId));
});

// Alias: GET /api/listings/:id/reviews  (used by business.js)
app.get('/api/listings/:id/reviews', (req,res)=>{
  res.json(readJSON(REVIEWS_FILE).filter(r=>r.listingId===req.params.id));
});

// Alias: POST /api/listings/:id/contact  (used by business.js contact form)
app.post('/api/listings/:id/contact', optionalAuth, (req,res)=>{
  req.body.listingId = req.params.id;
  // forward to the same logic as /api/messages
  try{
    const {listingId,senderName,senderEmail,senderPhone,message}=req.body;
    if(!listingId||!message) return res.status(400).json({error:'listingId and message are required.'});
    const listings=readJSON(LISTINGS_FILE);
    const listing=listings.find(l=>l.id===listingId);
    if(!listing) return res.status(404).json({error:'Listing not found'});
    const msg={id:uuidv4(),createdAt:new Date().toISOString(),listingId,listingName:listing.businessName,ownerId:listing.ownerId,senderName:senderName||req.user?.name||'Anonymous',senderEmail:senderEmail||req.user?.email||null,senderPhone:senderPhone||null,message,read:false};
    const messages=readJSON(MESSAGES_FILE); messages.unshift(msg); writeJSON(MESSAGES_FILE,messages);
    const lIdx=listings.findIndex(l=>l.id===listingId);
    if(lIdx!==-1){listings[lIdx].leads=(listings[lIdx].leads||0)+1;const now=new Date().toISOString().slice(0,10);const hist=listings[lIdx].analyticsHistory||[];const today=hist.find(h=>h.date===now);if(today)today.leads=(today.leads||0)+1;else hist.push({date:now,views:0,leads:1});listings[lIdx].analyticsHistory=hist.slice(-90);writeJSON(LISTINGS_FILE,listings);}
    if(listing.ownerId) pushNotification(listing.ownerId,'new_lead',{listingName:listing.businessName,senderName:msg.senderName});
    res.json({success:true,message:msg});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

// SAVES
app.post('/api/saves/:listingId', authMiddleware, (req,res)=>{
  const follows=readJSON(FOLLOWS_FILE);
  const existing=follows.find(f=>f.userId===req.user.id&&f.listingId===req.params.listingId);
  const listings=readJSON(LISTINGS_FILE);
  const idx=listings.findIndex(l=>l.id===req.params.listingId);
  if(existing){
    writeJSON(FOLLOWS_FILE,follows.filter(f=>!(f.userId===req.user.id&&f.listingId===req.params.listingId)));
    if(idx!==-1){listings[idx].saves=Math.max(0,(listings[idx].saves||0)-1);writeJSON(LISTINGS_FILE,listings);}
    return res.json({saved:false});
  }
  follows.push({id:uuidv4(),userId:req.user.id,listingId:req.params.listingId,createdAt:new Date().toISOString()});
  writeJSON(FOLLOWS_FILE,follows);
  if(idx!==-1){listings[idx].saves=(listings[idx].saves||0)+1;writeJSON(LISTINGS_FILE,listings);}
  res.json({saved:true});
});

app.get('/api/saves', authMiddleware, (req,res)=>{
  const follows=readJSON(FOLLOWS_FILE).filter(f=>f.userId===req.user.id);
  const listings=readJSON(LISTINGS_FILE);
  res.json(follows.map(f=>listings.find(l=>l.id===f.listingId)).filter(Boolean));
});

// COMMUNITY
app.get('/api/community/invite', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!user) return res.status(404).json({error:'User not found'});
  if(!userHasFeature(user,'invite_customers')) return res.status(403).json({error:'Upgrade to Pro to use customer invites.'});
  const invites=readJSON(INVITES_FILE).filter(i=>i.ownerId===req.user.id);
  res.json({inviteCode:user.id.slice(0,8).toUpperCase(),invites});
});

app.get('/api/community/followers', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!userHasFeature(user,'community_feed')) return res.status(403).json({error:'Upgrade required.'});
  const follows=readJSON(FOLLOWS_FILE);
  const myListings=readJSON(LISTINGS_FILE).filter(l=>l.ownerId===req.user.id).map(l=>l.id);
  const followerIds=[...new Set(follows.filter(f=>myListings.includes(f.listingId)).map(f=>f.userId))];
  res.json(followerIds.map(id=>{const u=users.find(u=>u.id===id);return u?{id:u.id,name:u.name,email:u.email,joinedAt:u.createdAt}:null;}).filter(Boolean));
});

// BROADCASTS
app.post('/api/broadcasts', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!userHasFeature(user,'broadcasts')) return res.status(403).json({error:'Upgrade to Pro to send broadcasts.'});
  const {title,message,listingId}=req.body;
  if(!title||!message) return res.status(400).json({error:'title and message required.'});
  const broadcast={id:uuidv4(),createdAt:new Date().toISOString(),ownerId:req.user.id,listingId:listingId||null,title,message,sent:true};
  const broadcasts=readJSON(BROADCASTS_FILE); broadcasts.unshift(broadcast); writeJSON(BROADCASTS_FILE,broadcasts);
  res.json({success:true,broadcast});
});

app.get('/api/broadcasts', authMiddleware, (req,res)=>{
  res.json(readJSON(BROADCASTS_FILE).filter(b=>b.ownerId===req.user.id));
});

// LOYALTY STAMPS
app.post('/api/stamps', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!userHasFeature(user,'loyalty_stamps')) return res.status(403).json({error:'Upgrade required.'});
  const {customerEmail,listingId}=req.body;
  if(!customerEmail||!listingId) return res.status(400).json({error:'customerEmail and listingId required.'});
  const stamps=readJSON(STAMPS_FILE);
  const key=`${listingId}:${customerEmail.toLowerCase()}`;
  const existing=stamps.find(s=>s.key===key);
  if(existing){existing.count=(existing.count||0)+1;existing.updatedAt=new Date().toISOString();writeJSON(STAMPS_FILE,stamps);return res.json({success:true,stamp:existing});}
  const stamp={id:uuidv4(),key,listingId,ownerId:req.user.id,customerEmail:customerEmail.toLowerCase(),count:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  stamps.push(stamp); writeJSON(STAMPS_FILE,stamps);
  res.json({success:true,stamp});
});

app.get('/api/stamps/:listingId', authMiddleware, (req,res)=>{
  res.json(readJSON(STAMPS_FILE).filter(s=>s.listingId===req.params.listingId&&s.ownerId===req.user.id));
});

// ANALYTICS
app.get('/api/analytics/:listingId', authMiddleware, (req,res)=>{
  const listing=readJSON(LISTINGS_FILE).find(l=>l.id===req.params.listingId&&l.ownerId===req.user.id);
  if(!listing) return res.status(404).json({error:'Not found.'});
  res.json({listing,history:listing.analyticsHistory||[]});
});

// COMPETITOR ANALYTICS
app.get('/api/competitor/:category', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!userHasFeature(user,'competitor_analytics')) return res.status(403).json({error:'Upgrade to Growth Suite.'});
  const top=readJSON(LISTINGS_FILE).filter(l=>l.status==='active'&&l.category===req.params.category&&l.ownerId!==req.user.id).sort((a,b)=>((b.views||0)+(b.leads||0))-((a.views||0)+(a.leads||0))).slice(0,10).map(l=>({id:l.id,businessName:l.businessName,views:l.views,leads:l.leads,rating:l.rating,reviewCount:l.reviewCount}));
  res.json(top);
});

// LEAD EXPORT
app.get('/api/leads/export', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!userHasFeature(user,'lead_export')) return res.status(403).json({error:'Upgrade to Growth Suite.'});
  const messages=readJSON(MESSAGES_FILE).filter(m=>m.ownerId===req.user.id);
  const csv=['Name,Email,Phone,Listing,Date,Message',...messages.map(m=>`"${m.senderName}","${m.senderEmail||''}","${m.senderPhone||''}","${m.listingName}","${m.createdAt}","${m.message.replace(/"/g,"'")}"`)].join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="leads.csv"');
  res.send(csv);
});

// FEATURES CHECK
app.get('/api/features', authMiddleware, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.user.id);
  if(!user) return res.status(404).json({error:'User not found'});
  const plan=getEffectivePlan(user);
  const count=user.referralCount||0;
  res.json({plan,features:PLANS[plan]?.features||PLANS.free.features,referralCount:count,nextUnlock:plan==='growth'?null:plan==='pro'?{plan:'growth',invitesNeeded:Math.max(0,PLANS.growth.inviteUnlock-count)}:{plan:'pro',invitesNeeded:Math.max(0,PLANS.pro.inviteUnlock-count)}});
});

// ════════════════════════════════════════════════════════
//  LIVE CHAT REST ENDPOINTS
// ════════════════════════════════════════════════════════

// Get or create a chat thread between a visitor and a listing owner
app.post('/api/chat/thread', optionalAuth, (req,res)=>{
  try{
    const { listingId, guestName, guestEmail } = req.body;
    if(!listingId) return res.status(400).json({error:'listingId required'});
    const listings = readJSON(LISTINGS_FILE);
    const listing  = listings.find(l=>l.id===listingId);
    if(!listing) return res.status(404).json({error:'Listing not found'});

    const chats = readJSON(CHATS_FILE);
    const senderId = req.user?.id || null;
    // Find existing thread
    let thread = senderId
      ? chats.find(c=>c.listingId===listingId && c.participantIds.includes(listing.ownerId) && c.participantIds.includes(senderId))
      : null;

    if(!thread){
      thread = {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        listingId,
        listingName: listing.businessName,
        ownerId: listing.ownerId,
        participantIds: senderId ? [listing.ownerId, senderId] : [listing.ownerId],
        guestName: guestName || req.user?.name || 'Guest',
        guestEmail: guestEmail || req.user?.email || null,
        messages: [],
        ownerUnread: 0,
        guestUnread: 0
      };
      chats.unshift(thread);
      writeJSON(CHATS_FILE, chats);
    }
    res.json({ success:true, thread });
  }catch(err){ console.error(err); res.status(500).json({error:'Server error'}); }
});

// Get all threads for the logged-in owner
app.get('/api/chat/threads', authMiddleware, (req,res)=>{
  const chats = readJSON(CHATS_FILE);
  const threads = chats.filter(c=>c.ownerId===req.user.id || (c.participantIds||[]).includes(req.user.id));
  // Return without full message history (just latest msg for inbox preview)
  res.json(threads.map(t=>({ ...t, messages: t.messages.slice(-1) })));
});

// Get full thread by id
app.get('/api/chat/thread/:id', optionalAuth, (req,res)=>{
  const chats = readJSON(CHATS_FILE);
  const thread = chats.find(c=>c.id===req.params.id);
  if(!thread) return res.status(404).json({error:'Thread not found'});
  res.json(thread);
});

// REST fallback: post a text message to a thread
app.post('/api/chat/thread/:id/message', optionalAuth, (req,res)=>{
  try{
    const { text } = req.body;
    if(!text?.trim()) return res.status(400).json({error:'text required'});
    const chats = readJSON(CHATS_FILE);
    const idx = chats.findIndex(c=>c.id===req.params.id);
    if(idx===-1) return res.status(404).json({error:'Thread not found'});
    const senderId = req.user?.id || null;
    const isOwner  = senderId === chats[idx].ownerId;
    const msg = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      senderId,
      senderName: req.user?.name || chats[idx].guestName || 'Guest',
      isOwner,
      type: 'text',
      text: text.trim()
    };
    chats[idx].messages.push(msg);
    if(isOwner) chats[idx].guestUnread=(chats[idx].guestUnread||0)+1;
    else        chats[idx].ownerUnread=(chats[idx].ownerUnread||0)+1;
    writeJSON(CHATS_FILE, chats);
    // notify the other party
    const notifyId = isOwner ? null : chats[idx].ownerId;
    if(notifyId) pushNotification(notifyId,'chat_message',{ threadId:chats[idx].id, listingName:chats[idx].listingName, senderName:msg.senderName });
    io.to(`thread:${chats[idx].id}`).emit('chat_message', msg);
    res.json({ success:true, message:msg });
  }catch(err){ console.error(err); res.status(500).json({error:'Server error'}); }
});

// Upload image or video in chat
app.post('/api/chat/thread/:id/upload', optionalAuth, chatUpload.single('file'), (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'No file uploaded'});
    const chats = readJSON(CHATS_FILE);
    const idx = chats.findIndex(c=>c.id===req.params.id);
    if(idx===-1) return res.status(404).json({error:'Thread not found'});
    const senderId = req.user?.id || null;
    const isOwner  = senderId === chats[idx].ownerId;
    const isVideo  = req.file.mimetype.startsWith('video/');
    const fileUrl  = `/uploads/chat/${req.file.filename}`;
    const msg = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      senderId,
      senderName: req.user?.name || chats[idx].guestName || 'Guest',
      isOwner,
      type: isVideo ? 'video' : 'image',
      fileUrl,
      fileName: req.file.originalname
    };
    chats[idx].messages.push(msg);
    if(isOwner) chats[idx].guestUnread=(chats[idx].guestUnread||0)+1;
    else        chats[idx].ownerUnread=(chats[idx].ownerUnread||0)+1;
    writeJSON(CHATS_FILE, chats);
    const notifyId = isOwner ? null : chats[idx].ownerId;
    if(notifyId) pushNotification(notifyId,'chat_message',{ threadId:chats[idx].id, listingName:chats[idx].listingName, senderName:msg.senderName });
    io.to(`thread:${chats[idx].id}`).emit('chat_message', msg);
    res.json({ success:true, message:msg, fileUrl });
  }catch(err){ console.error(err); res.status(500).json({error:'Server error'}); }
});

// Mark thread as read for the current user
app.put('/api/chat/thread/:id/read', optionalAuth, (req,res)=>{
  const chats = readJSON(CHATS_FILE);
  const idx = chats.findIndex(c=>c.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Not found'});
  const senderId = req.user?.id || null;
  if(senderId===chats[idx].ownerId) chats[idx].ownerUnread=0;
  else chats[idx].guestUnread=0;
  writeJSON(CHATS_FILE, chats);
  res.json({success:true});
});

// ════════════════════════════════════════════════════════
//  NOTIFICATIONS REST ENDPOINTS
// ════════════════════════════════════════════════════════

app.get('/api/notifications', authMiddleware, (req,res)=>{
  const notifs = readJSON(NOTIFICATIONS_FILE).filter(n=>n.userId===req.user.id);
  res.json(notifs.slice(0,50));
});

app.get('/api/notifications/unread-count', authMiddleware, (req,res)=>{
  const count = readJSON(NOTIFICATIONS_FILE).filter(n=>n.userId===req.user.id&&!n.read).length;
  res.json({ count });
});

app.put('/api/notifications/read-all', authMiddleware, (req,res)=>{
  const notifs = readJSON(NOTIFICATIONS_FILE);
  notifs.forEach(n=>{ if(n.userId===req.user.id) n.read=true; });
  writeJSON(NOTIFICATIONS_FILE, notifs);
  res.json({success:true});
});

app.put('/api/notifications/:id/read', authMiddleware, (req,res)=>{
  const notifs = readJSON(NOTIFICATIONS_FILE);
  const idx = notifs.findIndex(n=>n.id===req.params.id&&n.userId===req.user.id);
  if(idx===-1) return res.status(404).json({error:'Not found'});
  notifs[idx].read=true;
  writeJSON(NOTIFICATIONS_FILE, notifs);
  res.json({success:true});
});

// ════════════════════════════════════════════════════════
//  SOCKET.IO — LIVE CHAT ENGINE
// ════════════════════════════════════════════════════════
const onlineUsers = new Map(); // userId -> Set<socketId>

io.on('connection', (socket)=>{
  let authedUser = null;

  // Authenticate
  socket.on('auth', (token)=>{
    const user = socketAuthUser(token);
    if(user){
      authedUser = user;
      socket.join(`user:${user.id}`);
      if(!onlineUsers.has(user.id)) onlineUsers.set(user.id, new Set());
      onlineUsers.get(user.id).add(socket.id);
      socket.emit('auth_ok', { id:user.id, name:user.name });
    }
  });

  // Join a chat thread room
  socket.on('join_thread', (threadId)=>{
    socket.join(`thread:${threadId}`);
    socket.emit('joined_thread', threadId);
  });

  // Leave a chat thread room
  socket.on('leave_thread', (threadId)=>{
    socket.leave(`thread:${threadId}`);
  });

  // Send a text message via socket
  socket.on('send_message', ({ threadId, text })=>{
    if(!text?.trim()) return;
    const chats = readJSON(CHATS_FILE);
    const idx = chats.findIndex(c=>c.id===threadId);
    if(idx===-1) return;
    const senderId = authedUser?.id || null;
    const isOwner  = senderId === chats[idx].ownerId;
    const msg = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      senderId,
      senderName: authedUser?.name || chats[idx].guestName || 'Guest',
      isOwner,
      type: 'text',
      text: text.trim()
    };
    chats[idx].messages.push(msg);
    if(isOwner) chats[idx].guestUnread=(chats[idx].guestUnread||0)+1;
    else        chats[idx].ownerUnread=(chats[idx].ownerUnread||0)+1;
    writeJSON(CHATS_FILE, chats);
    io.to(`thread:${threadId}`).emit('chat_message', msg);
    const notifyId = isOwner ? null : chats[idx].ownerId;
    if(notifyId) pushNotification(notifyId,'chat_message',{ threadId, listingName:chats[idx].listingName, senderName:msg.senderName });
  });

  // Typing indicator
  socket.on('typing', ({ threadId, isTyping })=>{
    socket.to(`thread:${threadId}`).emit('typing', {
      senderId: authedUser?.id || null,
      senderName: authedUser?.name || 'Guest',
      isTyping
    });
  });

  socket.on('disconnect', ()=>{
    if(authedUser){
      const sockets = onlineUsers.get(authedUser.id);
      if(sockets){ sockets.delete(socket.id); if(sockets.size===0) onlineUsers.delete(authedUser.id); }
    }
  });
});

// Online status check
app.get('/api/chat/online/:userId', (req,res)=>{
  res.json({ online: onlineUsers.has(req.params.userId) });
});

server.listen(PORT, ()=>console.log(`VyneMarket running on port ${PORT}`));

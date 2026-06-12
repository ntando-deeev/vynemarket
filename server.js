const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors:{ origin:'*', methods:['GET','POST'] }, maxHttpBufferSize: 20*1024*1024 });

const JWT_SECRET  = process.env.JWT_SECRET  || 'vynemarket-secret-2024';
const PORT        = process.env.PORT        || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');

[UPLOADS_DIR, path.join(UPLOADS_DIR,'images'), path.join(UPLOADS_DIR,'videos'), path.join(UPLOADS_DIR,'chat'), path.join(UPLOADS_DIR,'reels')].forEach(d=>fs.mkdirSync(d,{recursive:true}));

app.use(express.static(path.join(__dirname,'public')));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Mongoose Schemas ──────────────────────────────────
const M = mongoose.Schema.Types.Mixed;

const UserSchema = new mongoose.Schema({ id:{type:String,default:()=>uuidv4(),unique:true}, createdAt:{type:Date,default:Date.now}, name:String, email:{type:String,unique:true,lowercase:true,trim:true}, password:String, phone:String, country:String, businessName:String, bio:String, avatar:String, plan:{type:String,default:'free'}, planActivatedAt:Date, planExpiresAt:Date, referralCode:String, referredBy:String, referralCount:{type:Number,default:0}, listingCount:{type:Number,default:0} });

const ListingSchema = new mongoose.Schema({ id:{type:String,default:()=>uuidv4(),unique:true}, createdAt:{type:Date,default:Date.now}, updatedAt:{type:Date,default:Date.now}, ownerId:String, ownerName:String, status:{type:String,default:'active'}, businessName:String, tagline:String, category:String, description:String, phone:String, email:String, website:String, address:String, city:String, country:String, images:[String], videos:[String], sampleVideo:String, sampleVideoThumb:String, views:{type:Number,default:0}, leads:{type:Number,default:0}, saves:{type:Number,default:0}, rating:{type:Number,default:0}, reviewCount:{type:Number,default:0}, analyticsHistory:[M], featured:{type:Boolean,default:false}, verified:{type:Boolean,default:false}, customSlug:String, customCta:String, sponsoredUntil:Date });

const MessageSchema    = new mongoose.Schema({ id:{type:String,default:()=>uuidv4(),unique:true}, createdAt:{type:Date,default:Date.now}, listingId:String, listingName:String, ownerId:String, senderName:String, senderEmail:String, senderPhone:String, message:String, read:{type:Boolean,default:false} });
const ReviewSchema     = new mongoose.Schema({ id:{type:String,default:()=>uuidv4(),unique:true}, createdAt:{type:Date,default:Date.now}, listingId:String, authorId:String, authorName:String, rating:Number, comment:String });
const ReferralSchema   = new mongoose.Schema({ id:{type:String,default:()=>uuidv4()}, createdAt:{type:Date,default:Date.now}, referrerId:String, referredId:String, referredName:String, referredEmail:String });
const FollowSchema     = new mongoose.Schema({ id:{type:String,default:()=>uuidv4()}, createdAt:{type:Date,default:Date.now}, userId:String, listingId:String });
const BroadcastSchema  = new mongoose.Schema({ id:{type:String,default:()=>uuidv4()}, createdAt:{type:Date,default:Date.now}, ownerId:String, listingId:String, title:String, message:String, sent:{type:Boolean,default:true} });
const StampSchema      = new mongoose.Schema({ id:{type:String,default:()=>uuidv4()}, key:{type:String,unique:true}, listingId:String, ownerId:String, customerEmail:String, count:{type:Number,default:1}, createdAt:{type:Date,default:Date.now}, updatedAt:{type:Date,default:Date.now} });
const ChatSchema       = new mongoose.Schema({ id:{type:String,default:()=>uuidv4(),unique:true}, createdAt:{type:Date,default:Date.now}, listingId:String, listingName:String, ownerId:String, guestId:String, guestName:String, guestEmail:String, ownerUnread:{type:Number,default:0}, guestUnread:{type:Number,default:0}, messages:[M], lastMessageAt:{type:Date,default:Date.now} });
const NotifSchema      = new mongoose.Schema({ id:{type:String,default:()=>uuidv4()}, createdAt:{type:Date,default:Date.now}, userId:String, type:String, read:{type:Boolean,default:false}, data:M });
const ReelSchema       = new mongoose.Schema({ id:{type:String,default:()=>uuidv4(),unique:true}, createdAt:{type:Date,default:Date.now}, authorId:String, authorName:String, authorAvatar:String, caption:String, listingId:String, videoUrl:String, views:{type:Number,default:0}, likeCount:{type:Number,default:0}, commentCount:{type:Number,default:0} });
const ReelLikeSchema   = new mongoose.Schema({ id:{type:String,default:()=>uuidv4()}, createdAt:{type:Date,default:Date.now}, reelId:String, userId:String });
const ReelCommentSchema= new mongoose.Schema({ id:{type:String,default:()=>uuidv4()}, createdAt:{type:Date,default:Date.now}, reelId:String, authorId:String, authorName:String, authorAvatar:String, text:String });

const User        = mongoose.model('User',       UserSchema);
const Listing     = mongoose.model('Listing',    ListingSchema);
const Message     = mongoose.model('Message',    MessageSchema);
const Review      = mongoose.model('Review',     ReviewSchema);
const Referral    = mongoose.model('Referral',   ReferralSchema);
const Follow      = mongoose.model('Follow',     FollowSchema);
const Broadcast   = mongoose.model('Broadcast',  BroadcastSchema);
const Stamp       = mongoose.model('Stamp',      StampSchema);
const Chat        = mongoose.model('Chat',       ChatSchema);
const Notif       = mongoose.model('Notif',      NotifSchema);
const Reel        = mongoose.model('Reel',       ReelSchema);
const ReelLike    = mongoose.model('ReelLike',   ReelLikeSchema);
const ReelComment = mongoose.model('ReelComment',ReelCommentSchema);

// ── Plans ─────────────────────────────────────────────
const PLANS = {
  free:   { name:'Free',         price:0,     inviteUnlock:0,  features:['listing','gallery','analytics','featured_badge','seo_profile','priority_search'] },
  pro:    { name:'Pro',          price:9.99,  inviteUnlock:3,  features:['listing','gallery','analytics','featured_badge','seo_profile','priority_search','invite_customers','community_feed','broadcasts','loyalty_stamps','custom_slug'] },
  growth: { name:'Growth Suite', price:19.99, inviteUnlock:10, features:['listing','gallery','analytics','featured_badge','seo_profile','priority_search','invite_customers','community_feed','broadcasts','loyalty_stamps','custom_slug','competitor_analytics','lead_export','verified_badge','sponsored_listing','custom_cta'] }
};
function getEffectivePlan(user){ const paid=user?.plan||'free',inv=user?.referralCount||0; if(inv>=PLANS.growth.inviteUnlock)return'growth'; if(inv>=PLANS.pro.inviteUnlock)return'pro'; return paid; }
function userHasFeature(user,f){ return(PLANS[getEffectivePlan(user)]?.features||PLANS.free.features).includes(f); }
function safeUser(u){ const o=u.toObject?u.toObject():{...u}; delete o.password;delete o._id;delete o.__v; o.effectivePlan=getEffectivePlan(o); return o; }
function safeListing(l){ const o=l.toObject?l.toObject():{...l}; delete o._id;delete o.__v; return o; }

// ── Multer ────────────────────────────────────────────
const storage   = multer.diskStorage({ destination:(req,f,cb)=>{ const d=path.join(UPLOADS_DIR,f.mimetype.startsWith('video/')?'videos':'images');fs.mkdirSync(d,{recursive:true});cb(null,d);}, filename:(req,f,cb)=>cb(null,uuidv4()+path.extname(f.originalname)) });
const upload    = multer({ storage, fileFilter:(req,f,cb)=>cb(null,['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm'].includes(f.mimetype)), limits:{fileSize:50*1024*1024} });
const chatStor  = multer.diskStorage({ destination:(req,f,cb)=>cb(null,path.join(UPLOADS_DIR,'chat')), filename:(req,f,cb)=>cb(null,uuidv4()+path.extname(f.originalname)) });
const chatUpload= multer({ storage:chatStor, fileFilter:(req,f,cb)=>cb(null,['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm'].includes(f.mimetype)), limits:{fileSize:20*1024*1024} });
const reelStor  = multer.diskStorage({ destination:(req,f,cb)=>cb(null,path.join(UPLOADS_DIR,'reels')), filename:(req,f,cb)=>cb(null,uuidv4()+path.extname(f.originalname)) });
const reelUpload= multer({ storage:reelStor, fileFilter:(req,f,cb)=>cb(null,['video/mp4','video/quicktime','video/webm'].includes(f.mimetype)), limits:{fileSize:200*1024*1024} });

// ── Auth helpers ──────────────────────────────────────
function authMiddleware(req,res,next){ const t=(req.headers['authorization']||'').replace('Bearer ',''); if(!t)return res.status(401).json({error:'Unauthorised'}); try{req.user=jwt.verify(t,JWT_SECRET);next();}catch{res.status(401).json({error:'Invalid token'});} }
function optionalAuth(req,res,next){ const t=(req.headers['authorization']||'').replace('Bearer ',''); if(t){try{req.user=jwt.verify(t,JWT_SECRET);}catch{}} next(); }
function socketAuthUser(token){ try{return jwt.verify(token,JWT_SECRET);}catch{return null;} }

// ── Notification helper ───────────────────────────────
async function pushNotification(userId,type,data){
  const n=await Notif.create({userId,type,read:false,data});
  io.to(`user:${userId}`).emit('notification',{id:n.id,createdAt:n.createdAt,userId,type,read:false,...data});
  return n;
}

// ════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req,res)=>{
  try{
    const {name,email,password,phone,country,businessName,referralCode}=req.body;
    if(!name||!email||!password) return res.status(400).json({error:'name, email and password are required.'});
    if(password.length<6) return res.status(400).json({error:'Password must be at least 6 characters.'});
    const exists=await User.findOne({email:email.toLowerCase().trim()});
    if(exists) return res.status(400).json({error:'Email already registered.'});
    const hashed=await bcrypt.hash(password,10);
    const myCode=uuidv4().replace(/-/g,'').slice(0,8).toUpperCase();
    const userData={id:uuidv4(),name:name.trim(),email:email.toLowerCase().trim(),password:hashed,phone:phone||'',country:country||'',businessName:businessName||'',plan:'free',referralCode:myCode,referredBy:null,referralCount:0,listingCount:0};
    if(referralCode){
      const referrer=await User.findOne({referralCode:referralCode.toUpperCase()});
      if(referrer){
        userData.referredBy=referrer.id;
        await User.updateOne({id:referrer.id},{$inc:{referralCount:1}});
        await Referral.create({referrerId:referrer.id,referredId:userData.id,referredName:userData.name,referredEmail:userData.email});
      }
    }
    const user=await User.create(userData);
    const token=jwt.sign({id:user.id,email:user.email,name:user.name},JWT_SECRET,{expiresIn:'30d'});
    res.json({success:true,token,user:safeUser(user)});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.post('/api/auth/login', async (req,res)=>{
  try{
    const {email,password}=req.body;
    if(!email||!password) return res.status(400).json({error:'Email and password required.'});
    const user=await User.findOne({email:email.toLowerCase().trim()});
    if(!user||!(await bcrypt.compare(password,user.password))) return res.status(400).json({error:'Invalid email or password.'});
    const token=jwt.sign({id:user.id,email:user.email,name:user.name},JWT_SECRET,{expiresIn:'30d'});
    res.json({success:true,token,user:safeUser(user)});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.get('/api/auth/me', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!user) return res.status(404).json({error:'User not found'});
  res.json(safeUser(user));
});

// Forgot password — returns generic success message to prevent user enumeration
app.post('/api/auth/forgot-password', async (req,res)=>{
  const {email}=req.body;
  if(!email) return res.status(400).json({error:'Email required'});
  // In a production app you would send an email here.
  // For now, just acknowledge so the UX can inform the user.
  res.json({message:'If an account with that email exists, a password reset link has been sent. Please check your inbox (and spam folder).'});
});

app.put('/api/auth/profile', authMiddleware, upload.single('avatar'), async (req,res)=>{
  const {name,phone,country,businessName,bio}=req.body;
  const upd={};
  if(name) upd.name=name.trim();
  if(phone!==undefined) upd.phone=phone;
  if(country!==undefined) upd.country=country;
  if(businessName!==undefined) upd.businessName=businessName;
  if(bio!==undefined) upd.bio=bio;
  if(req.file) upd.avatar=`/uploads/images/${req.file.filename}`;
  const user=await User.findOneAndUpdate({id:req.user.id},upd,{new:true});
  if(!user) return res.status(404).json({error:'User not found'});
  res.json({success:true,user:safeUser(user)});
});

// PLANS
app.get('/api/plans',(req,res)=>res.json(PLANS));
app.post('/api/auth/upgrade', authMiddleware, async (req,res)=>{
  const {plan}=req.body;
  if(!PLANS[plan]) return res.status(400).json({error:'Invalid plan.'});
  const now=new Date(), expires=new Date(now); expires.setMonth(expires.getMonth()+1);
  const user=await User.findOneAndUpdate({id:req.user.id},{plan,planActivatedAt:now,planExpiresAt:expires},{new:true});
  if(!user) return res.status(404).json({error:'User not found'});
  res.json({success:true,user:safeUser(user)});
});

// REFERRAL
app.get('/api/referral/stats', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!user) return res.status(404).json({error:'User not found'});
  const referrals=await Referral.find({referrerId:req.user.id}).sort({createdAt:-1});
  const effectivePlan=getEffectivePlan(user);
  const invitesNeeded=effectivePlan==='growth'?0:effectivePlan==='pro'?Math.max(0,PLANS.growth.inviteUnlock-user.referralCount):Math.max(0,PLANS.pro.inviteUnlock-user.referralCount);
  res.json({referralCode:user.referralCode,referralCount:user.referralCount,effectivePlan,invitesNeeded,referrals:referrals.map(r=>({id:r.id,referredName:r.referredName,referredEmail:r.referredEmail,createdAt:r.createdAt}))});
});

app.get('/api/referral/leaderboard', async (req,res)=>{
  const users=await User.find({referralCount:{$gt:0}}).sort({referralCount:-1}).limit(10);
  res.json(users.map(u=>({name:u.name,referralCount:u.referralCount,effectivePlan:getEffectivePlan(u)})));
});

app.get('/api/referral/validate/:code', async (req,res)=>{
  const user=await User.findOne({referralCode:req.params.code.toUpperCase()});
  if(!user) return res.status(404).json({valid:false});
  res.json({valid:true,ownerName:user.name});
});

// ════════════════════════════════════════════════════════
//  LISTINGS
// ════════════════════════════════════════════════════════
app.post('/api/listings', optionalAuth, upload.fields([{name:'images',maxCount:8},{name:'videos',maxCount:2},{name:'sampleVideo',maxCount:1}]), async (req,res)=>{
  try{
    const {businessName,tagline,category,description,phone,email,website,address,city,country,customSlug,customCta}=req.body;
    if(!businessName||!category) return res.status(400).json({error:'businessName and category are required.'});
    const images=(req.files?.images||[]).map(f=>`/uploads/images/${f.filename}`);
    const videos=(req.files?.videos||[]).map(f=>`/uploads/videos/${f.filename}`);
    const svFile=req.files?.sampleVideo?.[0];
    const listing=await Listing.create({id:uuidv4(),ownerId:req.user?.id||null,ownerName:req.user?.name||'Anonymous',businessName,tagline:tagline||'',category,description:description||'',phone:phone||'',email:email||'',website:website||'',address:address||'',city:city||'',country:country||'',images,videos,sampleVideo:svFile?`/uploads/videos/${svFile.filename}`:null,customSlug:customSlug||null,customCta:customCta||null});
    if(req.user?.id) await User.updateOne({id:req.user.id},{$inc:{listingCount:1}});
    res.json({success:true,listing:safeListing(listing)});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.get('/api/listings', async (req,res)=>{
  try{
    const {q='',category='',country='',limit:lim=24,offset:off=0,sort='recent'}=req.query;
    const filter={status:'active'};
    if(category&&category!=='all') filter.category=category;
    if(country) filter.country=country;
    if(q){ const rx=new RegExp(q,'i'); filter.$or=[{businessName:rx},{tagline:rx},{description:rx},{category:rx},{city:rx}]; }
    const sortMap={recent:{createdAt:-1},views:{views:-1},rating:{rating:-1}};
    const total=await Listing.countDocuments(filter);
    const listings=await Listing.find(filter).sort(sortMap[sort]||{createdAt:-1}).skip(Number(off)).limit(Math.min(Number(lim),100));
    res.json({total,listings:listings.map(safeListing)});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.get('/api/listings/:id', optionalAuth, async (req,res)=>{
  try{
    const listing=await Listing.findOne({$or:[{id:req.params.id},{customSlug:req.params.id}]});
    if(!listing) return res.status(404).json({error:'Listing not found'});
    // track view
    const now=new Date().toISOString().slice(0,10);
    const hist=listing.analyticsHistory||[];
    const todayIdx=hist.findIndex(h=>h.date===now);
    if(todayIdx!==-1) hist[todayIdx].views=(hist[todayIdx].views||0)+1;
    else hist.push({date:now,views:1,leads:0});
    await Listing.updateOne({id:listing.id},{$inc:{views:1},analyticsHistory:hist.slice(-90)});
    res.json(safeListing(listing));
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.put('/api/listings/:id', authMiddleware, upload.fields([{name:'images',maxCount:8},{name:'videos',maxCount:2}]), async (req,res)=>{
  try{
    const listing=await Listing.findOne({id:req.params.id,ownerId:req.user.id});
    if(!listing) return res.status(404).json({error:'Listing not found or not yours.'});
    const fields=['businessName','tagline','category','description','phone','email','website','address','city','country','customSlug','customCta'];
    const upd={updatedAt:new Date()};
    fields.forEach(f=>{ if(req.body[f]!==undefined) upd[f]=req.body[f]; });
    if(req.files?.images?.length) upd.images=(req.files.images||[]).map(f=>`/uploads/images/${f.filename}`);
    if(req.files?.videos?.length) upd.videos=(req.files.videos||[]).map(f=>`/uploads/videos/${f.filename}`);
    const updated=await Listing.findOneAndUpdate({id:req.params.id},upd,{new:true});
    res.json({success:true,listing:safeListing(updated)});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.delete('/api/listings/:id', authMiddleware, async (req,res)=>{
  const listing=await Listing.findOneAndDelete({id:req.params.id,ownerId:req.user.id});
  if(!listing) return res.status(404).json({error:'Listing not found or not yours.'});
  await User.updateOne({id:req.user.id},{$inc:{listingCount:-1}});
  res.json({success:true});
});

// Reels from listings (sample videos)
app.get('/api/reels', async (req,res)=>{
  const {limit:lim=12,offset:off=0,category=''}=req.query;
  const filter={status:'active',sampleVideo:{$ne:null}};
  if(category&&category!=='all') filter.category=category;
  const total=await Listing.countDocuments(filter);
  const listings=await Listing.find(filter).sort({views:-1,saves:-1}).skip(Number(off)).limit(Math.min(Number(lim),50));
  res.json({total,reels:listings.map(l=>({id:l.id,businessName:l.businessName,tagline:l.tagline||null,category:l.category,country:l.country||null,city:l.city||null,sampleVideo:l.sampleVideo,sampleVideoThumb:l.sampleVideoThumb||null,images:l.images||[],rating:l.rating||0,reviewCount:l.reviewCount||0,views:l.views||0,saves:l.saves||0,ownerName:l.ownerName||null}))});
});

app.post('/api/listings/:id/sample-video', authMiddleware,
  multer({storage:multer.diskStorage({destination:(req,f,cb)=>{const d=path.join(UPLOADS_DIR,'videos');fs.mkdirSync(d,{recursive:true});cb(null,d);},filename:(req,f,cb)=>cb(null,uuidv4()+path.extname(f.originalname))}),fileFilter:(req,f,cb)=>cb(null,['video/mp4','video/quicktime','video/webm'].includes(f.mimetype)),limits:{fileSize:100*1024*1024}}).single('video'),
  async (req,res)=>{
    if(!req.file) return res.status(400).json({error:'No video file uploaded.'});
    const listing=await Listing.findOneAndUpdate({id:req.params.id,ownerId:req.user.id},{sampleVideo:`/uploads/videos/${req.file.filename}`,updatedAt:new Date()},{new:true});
    if(!listing) return res.status(404).json({error:'Listing not found or not yours.'});
    res.json({success:true,sampleVideo:listing.sampleVideo});
});

app.delete('/api/listings/:id/sample-video', authMiddleware, async (req,res)=>{
  const listing=await Listing.findOneAndUpdate({id:req.params.id,ownerId:req.user.id},{sampleVideo:null},{new:true});
  if(!listing) return res.status(404).json({error:'Not found.'});
  res.json({success:true});
});

app.get('/api/stats', async (req,res)=>{
  const [listingCount,userCount,countries]=await Promise.all([Listing.countDocuments({status:'active'}),User.countDocuments(),Listing.distinct('country',{status:'active'})]);
  res.json({activeListings:listingCount,totalUsers:userCount,countries:countries.filter(Boolean).length});
});

app.get('/api/categories', async (req,res)=>{
  const cats=await Listing.distinct('category',{status:'active'});
  res.json(cats.filter(Boolean).sort());
});

// ════════════════════════════════════════════════════════
//  MESSAGES, REVIEWS, SAVES, COMMUNITY, STAMPS, ANALYTICS
// ════════════════════════════════════════════════════════
app.post('/api/messages', optionalAuth, async (req,res)=>{
  try{
    const {listingId,senderName,senderEmail,senderPhone,message}=req.body;
    if(!listingId||!message) return res.status(400).json({error:'listingId and message are required.'});
    const listing=await Listing.findOne({id:listingId});
    if(!listing) return res.status(404).json({error:'Listing not found'});
    const msg=await Message.create({listingId,listingName:listing.businessName,ownerId:listing.ownerId,senderName:senderName||req.user?.name||'Anonymous',senderEmail:senderEmail||req.user?.email||null,senderPhone:senderPhone||null,message});
    await Listing.updateOne({id:listingId},{$inc:{leads:1}});
    if(listing.ownerId) await pushNotification(listing.ownerId,'new_lead',{listingName:listing.businessName,senderName:msg.senderName});
    res.json({success:true,message:msg});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.post('/api/listings/:id/contact', optionalAuth, async (req,res)=>{
  req.body.listingId=req.params.id;
  try{
    const {senderName,senderEmail,senderPhone,message}=req.body;
    if(!message) return res.status(400).json({error:'message required.'});
    const listing=await Listing.findOne({id:req.params.id});
    if(!listing) return res.status(404).json({error:'Listing not found'});
    const msg=await Message.create({listingId:req.params.id,listingName:listing.businessName,ownerId:listing.ownerId,senderName:senderName||req.user?.name||'Anonymous',senderEmail:senderEmail||req.user?.email||null,senderPhone:senderPhone||null,message});
    await Listing.updateOne({id:req.params.id},{$inc:{leads:1}});
    if(listing.ownerId) await pushNotification(listing.ownerId,'new_lead',{listingName:listing.businessName,senderName:msg.senderName});
    res.json({success:true,message:msg});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.get('/api/messages', authMiddleware, async (req,res)=>{
  const msgs=await Message.find({ownerId:req.user.id}).sort({createdAt:-1});
  res.json(msgs);
});

app.put('/api/messages/:id/read', authMiddleware, async (req,res)=>{
  await Message.updateOne({id:req.params.id,ownerId:req.user.id},{read:true});
  res.json({success:true});
});

// REVIEWS
app.post('/api/reviews', authMiddleware, async (req,res)=>{
  try{
    const {listingId,rating,comment}=req.body;
    if(!listingId||!rating) return res.status(400).json({error:'listingId and rating required.'});
    const listing=await Listing.findOne({id:listingId});
    if(!listing) return res.status(404).json({error:'Listing not found'});
    const review=await Review.create({listingId,authorId:req.user.id,authorName:req.user.name||'User',rating:Math.min(5,Math.max(1,Number(rating))),comment:comment||''});
    const reviews=await Review.find({listingId});
    const avgRating=reviews.reduce((s,r)=>s+r.rating,0)/reviews.length;
    await Listing.updateOne({id:listingId},{rating:Math.round(avgRating*10)/10,reviewCount:reviews.length});
    res.json({success:true,review});
  }catch(err){console.error(err);res.status(500).json({error:'Server error.'});}
});

app.get('/api/reviews/:listingId',(req,res)=>Review.find({listingId:req.params.listingId}).sort({createdAt:-1}).then(r=>res.json(r)));
app.get('/api/listings/:id/reviews',(req,res)=>Review.find({listingId:req.params.id}).sort({createdAt:-1}).then(r=>res.json(r)));

// SAVES
app.post('/api/saves/:listingId', authMiddleware, async (req,res)=>{
  const existing=await Follow.findOne({userId:req.user.id,listingId:req.params.listingId});
  if(existing){ await Follow.deleteOne({_id:existing._id}); await Listing.updateOne({id:req.params.listingId},{$inc:{saves:-1}}); return res.json({saved:false}); }
  await Follow.create({userId:req.user.id,listingId:req.params.listingId});
  await Listing.updateOne({id:req.params.listingId},{$inc:{saves:1}});
  res.json({saved:true});
});

app.get('/api/saves', authMiddleware, async (req,res)=>{
  const follows=await Follow.find({userId:req.user.id});
  const ids=follows.map(f=>f.listingId);
  const listings=await Listing.find({id:{$in:ids}});
  res.json(listings.map(safeListing));
});

// COMMUNITY
app.get('/api/community/invite', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!user) return res.status(404).json({error:'User not found'});
  if(!userHasFeature(user,'invite_customers')) return res.status(403).json({error:'Upgrade to Pro to use customer invites.'});
  res.json({inviteCode:user.id.slice(0,8).toUpperCase(),invites:[]});
});

app.get('/api/community/followers', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!userHasFeature(user,'community_feed')) return res.status(403).json({error:'Upgrade required.'});
  const myListings=await Listing.find({ownerId:req.user.id}).select('id');
  const listingIds=myListings.map(l=>l.id);
  const follows=await Follow.find({listingId:{$in:listingIds}});
  const followerIds=[...new Set(follows.map(f=>f.userId))];
  const users=await User.find({id:{$in:followerIds}});
  res.json(users.map(u=>({id:u.id,name:u.name,email:u.email,joinedAt:u.createdAt})));
});

// BROADCASTS
app.post('/api/broadcasts', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!userHasFeature(user,'broadcasts')) return res.status(403).json({error:'Upgrade to Pro to send broadcasts.'});
  const {title,message,listingId}=req.body;
  if(!title||!message) return res.status(400).json({error:'title and message required.'});
  const bc=await Broadcast.create({ownerId:req.user.id,listingId:listingId||null,title,message});
  res.json({success:true,broadcast:bc});
});

app.get('/api/broadcasts', authMiddleware, async (req,res)=>{
  const bcs=await Broadcast.find({ownerId:req.user.id}).sort({createdAt:-1});
  res.json(bcs);
});

// STAMPS
app.post('/api/stamps', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!userHasFeature(user,'loyalty_stamps')) return res.status(403).json({error:'Upgrade required.'});
  const {customerEmail,listingId}=req.body;
  if(!customerEmail||!listingId) return res.status(400).json({error:'customerEmail and listingId required.'});
  const key=`${listingId}:${customerEmail.toLowerCase()}`;
  const stamp=await Stamp.findOneAndUpdate({key},{$inc:{count:1},updatedAt:new Date()},{new:true,upsert:true,setDefaultsOnInsert:true});
  res.json({success:true,stamp});
});

app.get('/api/stamps/:listingId', authMiddleware, async (req,res)=>{
  const stamps=await Stamp.find({listingId:req.params.listingId,ownerId:req.user.id});
  res.json(stamps);
});

// ANALYTICS
app.get('/api/analytics/:listingId', authMiddleware, async (req,res)=>{
  const listing=await Listing.findOne({id:req.params.listingId,ownerId:req.user.id});
  if(!listing) return res.status(404).json({error:'Listing not found'});
  const msgs=await Message.countDocuments({listingId:req.params.listingId});
  res.json({views:listing.views||0,leads:msgs,saves:listing.saves||0,rating:listing.rating||0,reviewCount:listing.reviewCount||0,history:listing.analyticsHistory||[]});
});

app.get('/api/competitor/:category', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!userHasFeature(user,'competitor_analytics')) return res.status(403).json({error:'Upgrade to Growth Suite.'});
  const listings=await Listing.find({category:req.params.category,status:'active'}).sort({views:-1}).limit(10);
  res.json(listings.map(l=>({id:l.id,businessName:l.businessName,views:l.views||0,leads:l.leads||0,saves:l.saves||0,rating:l.rating||0,reviewCount:l.reviewCount||0})));
});

app.get('/api/leads/export', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!userHasFeature(user,'lead_export')) return res.status(403).json({error:'Upgrade to Growth Suite.'});
  const msgs=await Message.find({ownerId:req.user.id}).sort({createdAt:-1});
  const csv=['listingName,senderName,senderEmail,senderPhone,message,date',...msgs.map(m=>`"${m.listingName||''}","${m.senderName||''}","${m.senderEmail||''}","${m.senderPhone||''}","${(m.message||'').replace(/"/g,'""')}","${m.createdAt||''}"`)].join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="leads.csv"');
  res.send(csv);
});

app.get('/api/features', authMiddleware, async (req,res)=>{
  const user=await User.findOne({id:req.user.id});
  if(!user) return res.status(404).json({error:'Not found'});
  const plan=getEffectivePlan(user);
  const features={};
  PLANS[plan].features.forEach(f=>features[f]=true);
  res.json({plan,features,referralCount:user.referralCount||0});
});

// ════════════════════════════════════════════════════════
//  CHAT
// ════════════════════════════════════════════════════════
app.post('/api/chat/thread', optionalAuth, async (req,res)=>{
  try{
    const {listingId,guestName,guestEmail}=req.body;
    if(!listingId) return res.status(400).json({error:'listingId required'});
    const listing=await Listing.findOne({id:listingId});
    if(!listing) return res.status(404).json({error:'Listing not found'});
    const gId=req.user?.id||null;
    let thread=await Chat.findOne({listingId,guestId:gId||guestEmail});
    if(!thread){
      thread=await Chat.create({listingId,listingName:listing.businessName,ownerId:listing.ownerId,guestId:gId||guestEmail||uuidv4(),guestName:req.user?.name||guestName||'Guest',guestEmail:req.user?.email||guestEmail||null,messages:[]});
    }
    res.json({success:true,thread});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.get('/api/chat/threads', authMiddleware, async (req,res)=>{
  const threads=await Chat.find({$or:[{ownerId:req.user.id},{guestId:req.user.id}]}).sort({lastMessageAt:-1});
  res.json(threads);
});

app.get('/api/chat/thread/:id', optionalAuth, async (req,res)=>{
  const thread=await Chat.findOne({id:req.params.id});
  if(!thread) return res.status(404).json({error:'Thread not found'});
  res.json(thread);
});

app.post('/api/chat/thread/:id/message', optionalAuth, async (req,res)=>{
  try{
    const {text}=req.body;
    if(!text?.trim()) return res.status(400).json({error:'text required'});
    const thread=await Chat.findOne({id:req.params.id});
    if(!thread) return res.status(404).json({error:'Thread not found'});
    const senderId=req.user?.id||null;
    const isOwner=senderId===thread.ownerId;
    const msg={id:uuidv4(),createdAt:new Date().toISOString(),senderId,senderName:req.user?.name||thread.guestName||'Guest',isOwner,type:'text',text:text.trim()};
    const updFields={$push:{messages:msg},lastMessageAt:new Date()};
    if(isOwner) updFields.$inc={guestUnread:1}; else updFields.$inc={ownerUnread:1};
    await Chat.updateOne({id:req.params.id},updFields);
    const notifyId=isOwner?null:thread.ownerId;
    if(notifyId) await pushNotification(notifyId,'chat_message',{threadId:thread.id,listingName:thread.listingName,senderName:msg.senderName});
    io.to(`thread:${thread.id}`).emit('chat_message',msg);
    res.json({success:true,message:msg});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.post('/api/chat/thread/:id/upload', optionalAuth, chatUpload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'No file uploaded'});
    const thread=await Chat.findOne({id:req.params.id});
    if(!thread) return res.status(404).json({error:'Thread not found'});
    const senderId=req.user?.id||null;
    const isOwner=senderId===thread.ownerId;
    const isVideo=req.file.mimetype.startsWith('video/');
    const fileUrl=`/uploads/chat/${req.file.filename}`;
    const msg={id:uuidv4(),createdAt:new Date().toISOString(),senderId,senderName:req.user?.name||thread.guestName||'Guest',isOwner,type:isVideo?'video':'image',fileUrl,fileName:req.file.originalname};
    const updFields={$push:{messages:msg},lastMessageAt:new Date()};
    if(isOwner) updFields.$inc={guestUnread:1}; else updFields.$inc={ownerUnread:1};
    await Chat.updateOne({id:req.params.id},updFields);
    const notifyId=isOwner?null:thread.ownerId;
    if(notifyId) await pushNotification(notifyId,'chat_message',{threadId:thread.id,listingName:thread.listingName,senderName:msg.senderName});
    io.to(`thread:${thread.id}`).emit('chat_message',msg);
    res.json({success:true,message:msg,fileUrl});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.put('/api/chat/thread/:id/read', optionalAuth, async (req,res)=>{
  const thread=await Chat.findOne({id:req.params.id});
  if(!thread) return res.status(404).json({error:'Not found'});
  const senderId=req.user?.id||null;
  if(senderId===thread.ownerId) await Chat.updateOne({id:req.params.id},{ownerUnread:0});
  else await Chat.updateOne({id:req.params.id},{guestUnread:0});
  res.json({success:true});
});

// ════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════════════════════
app.get('/api/notifications', authMiddleware, async (req,res)=>{
  const notifs=await Notif.find({userId:req.user.id}).sort({createdAt:-1}).limit(50);
  res.json(notifs);
});
app.get('/api/notifications/unread-count', authMiddleware, async (req,res)=>{
  const count=await Notif.countDocuments({userId:req.user.id,read:false});
  res.json({count});
});
app.put('/api/notifications/read-all', authMiddleware, async (req,res)=>{
  await Notif.updateMany({userId:req.user.id},{read:true});
  res.json({success:true});
});
app.put('/api/notifications/:id/read', authMiddleware, async (req,res)=>{
  await Notif.updateOne({id:req.params.id,userId:req.user.id},{read:true});
  res.json({success:true});
});

// ════════════════════════════════════════════════════════
//  REELS (user-posted)
// ════════════════════════════════════════════════════════
app.post('/api/reels/post', authMiddleware, reelUpload.single('video'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'No video file provided.'});
    const {caption='',listingId=''}=req.body;
    const author=await User.findOne({id:req.user.id});
    const reel=await Reel.create({authorId:req.user.id,authorName:author?.name||'User',authorAvatar:author?.avatar||null,caption:caption.slice(0,300),listingId:listingId||null,videoUrl:`/uploads/reels/${req.file.filename}`});
    res.json({success:true,reel});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.get('/api/reels/feed', optionalAuth, async (req,res)=>{
  const {limit:lim=10,offset:off=0}=req.query;
  const total=await Reel.countDocuments();
  const reels=await Reel.find().sort({createdAt:-1}).skip(Number(off)).limit(Math.min(Number(lim),50));
  const myId=req.user?.id||null;
  let likedIds=[];
  if(myId){ const likes=await ReelLike.find({userId:myId,reelId:{$in:reels.map(r=>r.id)}}); likedIds=likes.map(l=>l.reelId); }
  res.json({total,reels:reels.map(r=>({...r.toObject(),_id:undefined,__v:undefined,liked:likedIds.includes(r.id)}))});
});

app.get('/api/reels/user/:userId', optionalAuth, async (req,res)=>{
  const reels=await Reel.find({authorId:req.params.userId}).sort({createdAt:-1});
  res.json({total:reels.length,reels:reels.map(r=>({...r.toObject(),_id:undefined,__v:undefined}))});
});

app.put('/api/reels/:id/view', async (req,res)=>{
  const reel=await Reel.findOneAndUpdate({id:req.params.id},{$inc:{views:1}},{new:true});
  if(!reel) return res.status(404).json({error:'Not found'});
  res.json({success:true,views:reel.views});
});

app.post('/api/reels/:id/like', authMiddleware, async (req,res)=>{
  const reel=await Reel.findOne({id:req.params.id});
  if(!reel) return res.status(404).json({error:'Not found'});
  const existing=await ReelLike.findOne({reelId:req.params.id,userId:req.user.id});
  let liked,likeCount;
  if(!existing){
    await ReelLike.create({reelId:req.params.id,userId:req.user.id});
    const updated=await Reel.findOneAndUpdate({id:req.params.id},{$inc:{likeCount:1}},{new:true});
    likeCount=updated.likeCount; liked=true;
    if(reel.authorId!==req.user.id) await pushNotification(reel.authorId,'reel_like',{reelId:req.params.id,likerName:req.user.name||'Someone'});
  } else {
    await ReelLike.deleteOne({_id:existing._id});
    const updated=await Reel.findOneAndUpdate({id:req.params.id},{$inc:{likeCount:-1}},{new:true});
    likeCount=Math.max(0,updated.likeCount); liked=false;
  }
  io.emit('reel_like',{reelId:req.params.id,likeCount});
  res.json({success:true,liked,likeCount});
});

app.get('/api/reels/:id/comments', async (req,res)=>{
  const comments=await ReelComment.find({reelId:req.params.id}).sort({createdAt:-1});
  res.json(comments.map(c=>({...c.toObject(),_id:undefined,__v:undefined})));
});

app.post('/api/reels/:id/comments', authMiddleware, async (req,res)=>{
  const {text=''}=req.body;
  if(!text.trim()) return res.status(400).json({error:'Comment text required'});
  const reel=await Reel.findOne({id:req.params.id});
  if(!reel) return res.status(404).json({error:'Reel not found'});
  const author=await User.findOne({id:req.user.id});
  const comment=await ReelComment.create({reelId:req.params.id,authorId:req.user.id,authorName:author?.name||'User',authorAvatar:author?.avatar||null,text:text.trim().slice(0,500)});
  await Reel.updateOne({id:req.params.id},{$inc:{commentCount:1}});
  if(reel.authorId!==req.user.id) await pushNotification(reel.authorId,'reel_comment',{reelId:req.params.id,commenterName:author?.name||'Someone',text:comment.text.slice(0,80)});
  io.emit('reel_comment',{reelId:req.params.id,comment:{...comment.toObject(),_id:undefined,__v:undefined}});
  res.json({success:true,comment:{...comment.toObject(),_id:undefined,__v:undefined}});
});

app.delete('/api/reels/:id', authMiddleware, async (req,res)=>{
  const reel=await Reel.findOneAndDelete({id:req.params.id,authorId:req.user.id});
  if(!reel) return res.status(404).json({error:'Not found or not yours'});
  res.json({success:true});
});

// ════════════════════════════════════════════════════════
//  SOCKET.IO
// ════════════════════════════════════════════════════════
const onlineUsers = new Map();

io.on('connection', (socket)=>{
  let authedUser=null;

  socket.on('auth', (token)=>{
    const user=socketAuthUser(token);
    if(user){ authedUser=user; socket.join(`user:${user.id}`); if(!onlineUsers.has(user.id))onlineUsers.set(user.id,new Set()); onlineUsers.get(user.id).add(socket.id); socket.emit('auth_ok',{id:user.id,name:user.name}); }
  });

  socket.on('join_thread', (threadId)=>{ socket.join(`thread:${threadId}`); socket.emit('joined_thread',threadId); });
  socket.on('leave_thread', (threadId)=>socket.leave(`thread:${threadId}`));

  socket.on('send_message', async ({threadId,text})=>{
    if(!text?.trim()) return;
    const thread=await Chat.findOne({id:threadId});
    if(!thread) return;
    const senderId=authedUser?.id||null;
    const isOwner=senderId===thread.ownerId;
    const msg={id:uuidv4(),createdAt:new Date().toISOString(),senderId,senderName:authedUser?.name||thread.guestName||'Guest',isOwner,type:'text',text:text.trim()};
    const updFields={$push:{messages:msg},lastMessageAt:new Date()};
    if(isOwner) updFields.$inc={guestUnread:1}; else updFields.$inc={ownerUnread:1};
    await Chat.updateOne({id:threadId},updFields);
    io.to(`thread:${threadId}`).emit('chat_message',msg);
    const notifyId=isOwner?null:thread.ownerId;
    if(notifyId) await pushNotification(notifyId,'chat_message',{threadId,listingName:thread.listingName,senderName:msg.senderName});
  });

  socket.on('typing', ({threadId,isTyping})=>{ socket.to(`thread:${threadId}`).emit('typing',{senderId:authedUser?.id||null,senderName:authedUser?.name||'Guest',isTyping}); });

  socket.on('disconnect', ()=>{
    if(authedUser){ const sockets=onlineUsers.get(authedUser.id); if(sockets){sockets.delete(socket.id);if(sockets.size===0)onlineUsers.delete(authedUser.id);} }
  });
});

// ════════════════════════════════════════════════════════
//  SITEMAP + MISC
// ════════════════════════════════════════════════════════
app.get('/sitemap.xml', async (req,res)=>{
  const base=process.env.SITE_URL||'https://vynemarket.zone.id';
  const listings=await Listing.find({status:'active'}).select('id updatedAt createdAt');
  const staticPages=['','/listings.html','/pricing.html','/referral.html','/register.html','/login.html','/reels.html'];
  const listingUrls=listings.map(l=>`<url><loc>${base}/business.html?id=${l.id}</loc><lastmod>${(l.updatedAt||l.createdAt||new Date()).toISOString().slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');
  const staticUrls=staticPages.map(p=>`<url><loc>${base}${p}</loc><changefreq>daily</changefreq><priority>${p===''?'1.0':'0.6'}</priority></url>`).join('');
  res.setHeader('Content-Type','application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${listingUrls}</urlset>`);
});

app.get('/api/chat/online/:userId',(req,res)=>res.json({online:onlineUsers.has(req.params.userId)}));

// ════════════════════════════════════════════════════════
//  CONNECT TO MONGODB & START
// ════════════════════════════════════════════════════════
async function start(){
  if(!MONGODB_URI){ console.error('ERROR: MONGODB_URI env var is not set.'); process.exit(1); }
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB connected');
  server.listen(PORT, ()=>console.log(`VyneMarket running on port ${PORT}`));
}

start().catch(err=>{ console.error('Startup error:', err); process.exit(1); });

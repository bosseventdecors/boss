const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'YOUR_SUPABASE_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const PORT = process.env.PORT || 8080;

// Setup Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'rkg-wedding-planner-secret',
    resave: false,
    saveUninitialized: false
}));

// Setup Multer for Image Uploads (Memory Storage for Supabase)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Admin Authentication Middleware
const requireAuth = (req, res, next) => {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Static content for landing page
const staticContent = {
    hero_tagline: "RPG Catering is Cuddalore's trusted event planner,<br>delivering premium wedding catering services —<br>crafting unforgettable memories since 2005.",
    about_title: "RPG CATERING",
    about_text: "<p>At <strong>RPG Catering</strong>, we believe every celebration deserves extraordinary food and seamless hospitality. We create unforgettable dining experiences tailored to your vision.</p><p>Our team delivers freshly prepared cuisine and flawless event execution. From intimate family gatherings to grand weddings, we ensure your guests enjoy every moment.</p><p class=\"about-studio__signature\">Your Celebration. Our Passion.</p>"
};

const staticServices = [
    { id: 1, title: "Wedding Catering", image_url: "wedding_catering.png" },
    { id: 2, title: "🎂 Birthday Party Catering", image_url: "event_catering.png" },
    { id: 3, title: "❤️ Anniversary Catering", image_url: "hero.png" },
    { id: 4, title: "🎉 Event Catering", image_url: "decor.png" },
    { id: 5, title: "🍽 Buffet & Live Counters", image_url: "buffet_catering.png" },
    { id: 6, title: "👨‍🍳 Professional Service Staff", image_url: "service_staff.png" }
];

// --- PUBLIC ROUTES ---
app.get('/', async (req, res) => {
    // Fetch gallery from Supabase
    const { data: gallery, error } = await supabase.from('Gallery').select('*').order('created_at', { ascending: false });
    res.render('index', { content: staticContent, services: staticServices, gallery: gallery || [] });
});

app.get('/gallery', async (req, res) => {
    const { data: gallery, error } = await supabase.from('Gallery').select('*').order('created_at', { ascending: false });
    res.render('gallery', { gallery: gallery || [] });
});

// --- ADMIN ROUTES ---
app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/admin');
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    // Hardcoded simple auth for MVP (Admin / admin123)
    // We use bcrypt for demonstration: bcrypt.hashSync('admin123', 10) = $2b$10$wTf2t22.gR67Y4B2O/k51ueFzFOfw26aEpsM/W3O/H10nJq4L11x2
    const adminHash = '$2b$10$CES6chtSrIRDXjLxOG5VGuOBUg5R.9YDyNMZENc/B6KE8McVjwSZW';
    
    if (username === 'Admin' && await bcrypt.compare(password, adminHash)) {
        req.session.loggedIn = true;
        res.redirect('/admin');
    } else {
        res.render('login', { error: 'Invalid username or password' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/admin', requireAuth, async (req, res) => {
    const { data: gallery, error } = await supabase.from('Gallery').select('*').order('created_at', { ascending: false });
    res.render('admin', { gallery: gallery || [] });
});

// Admin: Add Gallery Image (Upload to Supabase Storage)
app.post('/admin/gallery', requireAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.redirect('/admin');
    
    const fileExt = path.extname(req.file.originalname);
    const fileName = `${Date.now()}${fileExt}`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('rpg-uploads')
        .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
        });
        
    if (uploadError) {
        console.error("Storage upload error:", uploadError);
        return res.redirect('/admin');
    }
    
    // Get public URL
    const { data: publicUrlData } = supabase.storage.from('rpg-uploads').getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;
    
    // Insert into Supabase DB
    await supabase.from('Gallery').insert([{ image_url: imageUrl }]);
    
    res.redirect('/admin');
});

// Admin: Delete Gallery Image
app.post('/admin/gallery/delete/:id', requireAuth, async (req, res) => {
    // 1. Get the image URL from DB to extract the filename
    const { data: galleryItem } = await supabase.from('Gallery').select('image_url').eq('id', req.params.id).single();
    
    if (galleryItem) {
        // Extract filename from URL
        const parts = galleryItem.image_url.split('/');
        const fileName = parts[parts.length - 1];
        
        // 2. Delete from Storage
        await supabase.storage.from('rpg-uploads').remove([fileName]);
    }
    
    // 3. Delete from DB
    await supabase.from('Gallery').delete().eq('id', req.params.id);
    
    res.redirect('/admin');
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}
module.exports = app;

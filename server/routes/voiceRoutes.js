const express = require('express');
const router = express.Router();
const cors = require('cors');
const voiceController = require('../controllers/voiceController');

// Add CORS to all voice routes
const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://omnnia.studio',
      'https://omnia-webui-production.up.railway.app/',
      'https://www.omnia.studio',
    ];
    
    if (!origin || allowedOrigins.includes(origin) || 
        origin.endsWith('.vercel.app') || origin.endsWith('.up.railway.app')) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Apply CORS to this router
router.use(cors(corsOptions));
router.options('*', cors(corsOptions));

// Routes
router.post('/clone', voiceController.cloneVoice);
router.post('/preview', voiceController.generatePreview);
router.get('/list', voiceController.listVoices);
router.delete('/:voiceId', voiceController.deleteVoice);

module.exports = router;
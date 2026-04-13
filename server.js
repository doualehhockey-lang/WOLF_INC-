import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { EngineTwilio } from './src/ENGINE/Engine.js';
import { autoReply, getTones }        from './responder.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    engine: 'active'
  });
});

// Twilio routes
app.use('/twilio', EngineTwilio.router);

// ── Auto-répondeur ──────────────────────────────────────────────────────────

// GET /tones — liste des tons disponibles
app.get('/tones', (_req, res) => {
  res.json({ tones: getTones() });
});

// POST /reply — génère une réponse stylée
// Body: { content: string, tone?: 'pro'|'sec'|'friendly'|'sarcastique'|'wolf-inc' }
app.post('/reply', async (req, res) => {
  const { content, tone } = req.body ?? {};
  if (!content?.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  try {
    const reply = await autoReply(content.trim(), tone);
    res.json({ reply, tone: tone ?? 'friendly' });
  } catch (err) {
    console.error('[Reply]', err.message);
    res.status(503).json({ error: 'LLM unavailable', detail: err.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Engine server running on port ${PORT}`);
  console.log(`📞 Twilio routes active at /twilio`);
  console.log(`💚 Health check at /health`);
});
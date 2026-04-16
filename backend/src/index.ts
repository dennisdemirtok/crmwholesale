import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import contactRoutes from './routes/contacts';
import campaignRoutes from './routes/campaigns';
import enrollmentRoutes from './routes/enrollments';
import emailRoutes from './routes/emails';
import trackingRoutes from './routes/tracking';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import { startSequenceWorker, startReplyCheckWorker, scheduleReplyChecks } from './jobs/queue';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// Routes
app.use('/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/track', trackingRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Supabase RPC function for open count increment (create this in Supabase)
// CREATE OR REPLACE FUNCTION increment_open_count(pixel_id uuid)
// RETURNS void AS $$
//   UPDATE sent_emails
//   SET open_count = open_count + 1,
//       opened_at = COALESCE(opened_at, NOW())
//   WHERE tracking_pixel_id = pixel_id;
// $$ LANGUAGE sql;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start workers
  try {
    startSequenceWorker();
    startReplyCheckWorker();
    scheduleReplyChecks();
    console.log('Job workers started');
  } catch (err) {
    console.warn('Workers not started (Redis may not be available):', (err as Error).message);
  }
});

export default app;

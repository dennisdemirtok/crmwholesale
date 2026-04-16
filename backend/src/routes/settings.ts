import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, queryOne } from '../db/supabase';

const router = Router();
router.use(authenticate);

// Get user settings
router.get('/', async (req: Request, res: Response) => {
  const user = await queryOne(
    'SELECT id, email, name, role, signature, token_status FROM crm_users WHERE id = $1',
    [req.user!.userId]
  );
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

// Update signature
router.put('/signature', async (req: Request, res: Response) => {
  const { signature } = req.body;
  const user = await queryOne(
    'UPDATE crm_users SET signature = $1 WHERE id = $2 RETURNING id, email, name, role, signature',
    [signature || null, req.user!.userId]
  );
  res.json(user);
});

// Upload image — returns a data URI that can be embedded in signature HTML
router.post('/upload-image', async (req: Request, res: Response) => {
  const { image, filename } = req.body;
  // image should be base64 encoded with data URI prefix, e.g. "data:image/png;base64,..."
  if (!image) {
    res.status(400).json({ error: 'image required (base64 data URI)' });
    return;
  }
  // Just echo it back — the frontend will embed it directly in the signature HTML
  // In production you'd upload to a CDN, but for email signatures data URIs work fine
  res.json({ url: image, filename });
});

export default router;

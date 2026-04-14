import { Router, Request, Response } from 'express';
import { pool } from '../db/supabase';

const router = Router();

const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

router.get('/open/:trackingPixelId', async (req: Request, res: Response) => {
  const { trackingPixelId } = req.params;

  // Fire and forget
  pool.query('SELECT crm_increment_open_count($1)', [trackingPixelId]).catch(() => {});

  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL.length.toString(),
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.send(PIXEL);
});

export default router;

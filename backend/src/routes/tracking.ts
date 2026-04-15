import { Router, Request, Response } from 'express';
import { pool, queryOne } from '../db/supabase';

const router = Router();

const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

router.get('/open/:trackingPixelId', async (req: Request, res: Response) => {
  const { trackingPixelId } = req.params;

  // Always return pixel immediately — don't block on DB
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL.length.toString(),
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.send(PIXEL);

  // Fire and forget: check timing then update
  try {
    const email = await queryOne<{ sent_at: string }>(
      'SELECT sent_at FROM crm_sent_emails WHERE tracking_pixel_id = $1',
      [trackingPixelId]
    );

    if (!email) return;

    const secondsSinceSent = (Date.now() - new Date(email.sent_at).getTime()) / 1000;

    // Ignore opens within 60 seconds — that's the sender's own mail client
    if (secondsSinceSent < 60) return;

    await pool.query(
      `UPDATE crm_sent_emails
       SET open_count = open_count + 1,
           opened_at = COALESCE(opened_at, NOW())
       WHERE tracking_pixel_id = $1`,
      [trackingPixelId]
    );
  } catch {
    // Silently ignore errors
  }
});

export default router;

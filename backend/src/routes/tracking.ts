import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

router.get('/open/:trackingPixelId', async (req: Request, res: Response) => {
  const { trackingPixelId } = req.params;

  // Fire and forget — don't block the response
  supabase
    .from('sent_emails')
    .update({
      opened_at: new Date().toISOString(),
    })
    .eq('tracking_pixel_id', trackingPixelId)
    .is('opened_at', null)
    .then(() => {});

  // Increment open count via RPC
  supabase.rpc('increment_open_count', { pixel_id: trackingPixelId }).then(() => {});

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

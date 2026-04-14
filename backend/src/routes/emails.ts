import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, queryOne, queryAll } from '../db/supabase';
import { sendEmail, getThread } from '../services/gmail';
import { injectTrackingPixel } from '../utils/template';
import { v4 as uuid } from 'uuid';

const router = Router();
router.use(authenticate);

router.post('/send', async (req: Request, res: Response) => {
  const { contact_id, subject, body, thread_id } = req.body;
  const userId = req.user!.userId;
  if (!contact_id || !subject || !body) { res.status(400).json({ error: 'contact_id, subject, and body required' }); return; }

  const contact = await queryOne('SELECT email, contact_name, company FROM crm_contacts WHERE id = $1', [contact_id]);
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }

  const trackingPixelId = uuid();
  const htmlBody = injectTrackingPixel(body, trackingPixelId);

  try {
    const result = await sendEmail(userId, contact.email, subject, htmlBody, thread_id);
    const sentEmail = await queryOne(
      `INSERT INTO crm_sent_emails (contact_id, sender_id, gmail_message_id, gmail_thread_id, subject, body, tracking_pixel_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [contact_id, userId, result.messageId, result.threadId, subject, body, trackingPixelId]
    );
    res.json(sentEmail);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/contact/:contactId', async (req: Request, res: Response) => {
  const data = await queryAll(
    'SELECT * FROM crm_sent_emails WHERE contact_id = $1 ORDER BY sent_at DESC',
    [req.params.contactId]
  );
  res.json(data);
});

router.get('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const thread = await getThread(req.user!.userId, req.params.threadId);
    res.json(thread);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { period = '30d' } = req.query;
  const daysAgo = parseInt((period as string).replace('d', '')) || 30;
  const since = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  const isSeller = req.user!.role === 'seller';
  const emails = await queryAll(
    `SELECT sent_at, opened_at, replied_at FROM crm_sent_emails
     WHERE sent_at >= $1 ${isSeller ? 'AND sender_id = $2' : ''}`,
    isSeller ? [since, userId] : [since]
  );

  res.json({
    sent: emails.length,
    opened: emails.filter(e => e.opened_at).length,
    replied: emails.filter(e => e.replied_at).length,
    openRate: emails.length > 0 ? Math.round((emails.filter(e => e.opened_at).length / emails.length) * 100) : 0,
    replyRate: emails.length > 0 ? Math.round((emails.filter(e => e.replied_at).length / emails.length) * 100) : 0,
  });
});

export default router;

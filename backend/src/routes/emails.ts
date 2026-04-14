import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../db/supabase';
import { sendEmail, getThread } from '../services/gmail';
import { injectTrackingPixel } from '../utils/template';
import { v4 as uuid } from 'uuid';

const router = Router();
router.use(authenticate);

// Send a single email (outside of a sequence)
router.post('/send', async (req: Request, res: Response) => {
  const { contact_id, subject, body, thread_id } = req.body;
  const userId = req.user!.userId;

  if (!contact_id || !subject || !body) {
    res.status(400).json({ error: 'contact_id, subject, and body required' });
    return;
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('email, contact_name, company')
    .eq('id', contact_id)
    .single();

  if (!contact) {
    res.status(404).json({ error: 'Contact not found' });
    return;
  }

  const trackingPixelId = uuid();
  const htmlBody = injectTrackingPixel(body, trackingPixelId);

  try {
    const result = await sendEmail(userId, contact.email, subject, htmlBody, thread_id);

    const { data: sentEmail, error } = await supabase
      .from('sent_emails')
      .insert({
        contact_id,
        sender_id: userId,
        gmail_message_id: result.messageId,
        gmail_thread_id: result.threadId,
        subject,
        body,
        tracking_pixel_id: trackingPixelId,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(sentEmail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get emails for a contact
router.get('/contact/:contactId', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('sent_emails')
    .select('*')
    .eq('contact_id', req.params.contactId)
    .order('sent_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

// Get email thread from Gmail
router.get('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const thread = await getThread(req.user!.userId, req.params.threadId);
    res.json(thread);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get sent email stats
router.get('/stats', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { period = '30d' } = req.query;

  const daysAgo = parseInt((period as string).replace('d', '')) || 30;
  const since = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('sent_emails')
    .select('sent_at, opened_at, replied_at')
    .gte('sent_at', since);

  if (req.user!.role === 'seller') {
    query = query.eq('sender_id', userId);
  }

  const { data } = await query;
  const emails = data || [];

  res.json({
    sent: emails.length,
    opened: emails.filter(e => e.opened_at).length,
    replied: emails.filter(e => e.replied_at).length,
    openRate: emails.length > 0
      ? Math.round((emails.filter(e => e.opened_at).length / emails.length) * 100)
      : 0,
    replyRate: emails.length > 0
      ? Math.round((emails.filter(e => e.replied_at).length / emails.length) * 100)
      : 0,
  });
});

export default router;

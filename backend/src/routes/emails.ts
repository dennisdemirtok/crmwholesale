import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, queryOne, queryAll } from '../db/supabase';
import { sendEmail, getThread, getMessage, checkThreadsForReplies } from '../services/gmail';
import { injectTrackingPixel } from '../utils/template';
import { v4 as uuid } from 'uuid';

const router = Router();
router.use(authenticate);

router.post('/send', async (req: Request, res: Response) => {
  const { contact_id, subject, body, thread_id, reply_to_message_id } = req.body;
  const userId = req.user!.userId;
  if (!contact_id || !subject || !body) { res.status(400).json({ error: 'contact_id, subject, and body required' }); return; }

  const contact = await queryOne('SELECT email, contact_name, company FROM crm_contacts WHERE id = $1', [contact_id]);
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }

  const trackingPixelId = uuid();
  const htmlBody = injectTrackingPixel(body, trackingPixelId);

  try {
    const result = await sendEmail(userId, contact.email, subject, htmlBody, reply_to_message_id, thread_id);
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

// Get full thread from Gmail (all messages in conversation)
router.get('/thread/:threadId', async (req: Request, res: Response) => {
  try {
    const thread = await getThread(req.user!.userId, req.params.threadId);

    // Parse messages into a clean format
    const messages = (thread.messages || []).map((msg: any) => {
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      // Get body content
      let body = '';
      if (msg.payload?.body?.data) {
        body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
      } else if (msg.payload?.parts) {
        const htmlPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/html');
        const textPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain');
        const part = htmlPart || textPart;
        if (part?.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }

      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: msg.snippet,
        body,
        labelIds: msg.labelIds || [],
      };
    });

    res.json({ threadId: thread.id, messages });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Check for replies on a contact's sent emails (call from frontend when viewing contact)
router.post('/check-replies/:contactId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const contactId = req.params.contactId;

  try {
    // Get all sent emails with thread IDs that haven't been marked as replied
    const unreplied = await queryAll(
      `SELECT id, gmail_thread_id FROM crm_sent_emails
       WHERE contact_id = $1 AND sender_id = $2 AND gmail_thread_id IS NOT NULL AND replied_at IS NULL`,
      [contactId, userId]
    );

    if (unreplied.length === 0) {
      res.json({ checked: 0, newReplies: 0 });
      return;
    }

    const threadIds = unreplied.map(e => e.gmail_thread_id);
    const replies = await checkThreadsForReplies(userId, threadIds);

    let newReplies = 0;
    for (const reply of replies) {
      if (reply.hasReply) {
        // Find matching sent email and mark as replied
        const email = unreplied.find(e => e.gmail_thread_id === reply.threadId);
        if (email) {
          await pool.query(
            'UPDATE crm_sent_emails SET replied_at = NOW() WHERE id = $1 AND replied_at IS NULL',
            [email.id]
          );

          // Also update enrollment if linked
          await pool.query(
            `UPDATE crm_enrollments SET status = 'replied', next_step_at = NULL
             WHERE id = (SELECT enrollment_id FROM crm_sent_emails WHERE id = $1) AND status = 'active'`,
            [email.id]
          );
          newReplies++;
        }
      }
    }

    res.json({ checked: unreplied.length, newReplies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual sync: check all recent emails for replies
router.post('/sync-replies', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const unreplied = await queryAll(
      `SELECT id, gmail_thread_id FROM crm_sent_emails
       WHERE sender_id = $1 AND gmail_thread_id IS NOT NULL AND replied_at IS NULL
       AND sent_at > NOW() - INTERVAL '30 days'`,
      [userId]
    );

    if (unreplied.length === 0) {
      res.json({ checked: 0, newReplies: 0 });
      return;
    }

    const threadIds = unreplied.map(e => e.gmail_thread_id);
    const replies = await checkThreadsForReplies(userId, threadIds);

    let newReplies = 0;
    for (const reply of replies) {
      if (reply.hasReply) {
        const email = unreplied.find(e => e.gmail_thread_id === reply.threadId);
        if (email) {
          await pool.query(
            'UPDATE crm_sent_emails SET replied_at = NOW() WHERE id = $1 AND replied_at IS NULL',
            [email.id]
          );
          await pool.query(
            `UPDATE crm_enrollments SET status = 'replied', next_step_at = NULL
             WHERE id = (SELECT enrollment_id FROM crm_sent_emails WHERE id = $1) AND status = 'active'`,
            [email.id]
          );
          newReplies++;
        }
      }
    }

    res.json({ checked: unreplied.length, newReplies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

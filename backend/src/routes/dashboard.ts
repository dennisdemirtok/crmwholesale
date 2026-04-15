import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, queryAll } from '../db/supabase';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const isSeller = req.user!.role === 'seller';

  // Active campaigns
  const campaigns = await queryAll(
    `SELECT id, name, status, created_at FROM crm_campaigns
     WHERE status = 'active' ${isSeller ? 'AND owner_id = $1' : ''}
     ORDER BY created_at DESC LIMIT 10`,
    isSeller ? [userId] : []
  );

  // Email stats (last 30 days)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const emails = await queryAll(
    `SELECT sent_at, opened_at, replied_at FROM crm_sent_emails
     WHERE sent_at >= $1 ${isSeller ? 'AND sender_id = $2' : ''}`,
    isSeller ? [since, userId] : [since]
  );

  // Contact counts
  const contactRows = await queryAll(
    `SELECT status, COUNT(*) as count FROM crm_contacts
     ${isSeller ? 'WHERE owner_id = $1' : ''} GROUP BY status`,
    isSeller ? [userId] : []
  );
  const totalContacts = contactRows.reduce((sum, r) => sum + parseInt(r.count), 0);
  const activeContacts = parseInt(contactRows.find(r => r.status === 'active')?.count || '0');
  const prospectContacts = parseInt(contactRows.find(r => r.status === 'prospect')?.count || '0');

  // Replied enrollments needing attention
  const repliedEnrollments = await queryAll(
    `SELECT e.id, e.contact_id, e.status, e.enrolled_at,
       json_build_object('company', c.company, 'contact_name', c.contact_name, 'email', c.email) as contacts,
       json_build_object('name', ca.name) as campaigns
     FROM crm_enrollments e
     JOIN crm_contacts c ON e.contact_id = c.id
     JOIN crm_campaigns ca ON e.campaign_id = ca.id
     WHERE e.status = 'replied'
     ORDER BY e.enrolled_at DESC LIMIT 10`
  );

  // Recent activity
  const recentActivity = await queryAll(
    `SELECT se.id, se.contact_id, se.gmail_thread_id, se.subject, se.sent_at, se.opened_at, se.replied_at,
       json_build_object('company', c.company, 'contact_name', c.contact_name, 'email', c.email) as contacts
     FROM crm_sent_emails se
     JOIN crm_contacts c ON se.contact_id = c.id
     ${isSeller ? 'WHERE se.sender_id = $1' : ''}
     ORDER BY se.sent_at DESC LIMIT 15`,
    isSeller ? [userId] : []
  );

  res.json({
    campaigns,
    emailStats: {
      sent: emails.length,
      opened: emails.filter(e => e.opened_at).length,
      replied: emails.filter(e => e.replied_at).length,
      openRate: emails.length > 0 ? Math.round((emails.filter(e => e.opened_at).length / emails.length) * 100) : 0,
      replyRate: emails.length > 0 ? Math.round((emails.filter(e => e.replied_at).length / emails.length) * 100) : 0,
    },
    contactStats: { total: totalContacts, active: activeContacts, prospect: prospectContacts },
    needsAttention: repliedEnrollments,
    recentActivity,
  });
});

export default router;

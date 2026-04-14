import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../db/supabase';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const isSeller = req.user!.role === 'seller';

  // Active campaigns
  let campaignsQuery = supabase
    .from('campaigns')
    .select('id, name, status, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10);

  if (isSeller) campaignsQuery = campaignsQuery.eq('owner_id', userId);
  const { data: campaigns } = await campaignsQuery;

  // Email stats (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let emailsQuery = supabase
    .from('sent_emails')
    .select('sent_at, opened_at, replied_at')
    .gte('sent_at', thirtyDaysAgo);

  if (isSeller) emailsQuery = emailsQuery.eq('sender_id', userId);
  const { data: emails } = await emailsQuery;
  const allEmails = emails || [];

  // Contact counts
  let contactsQuery = supabase
    .from('contacts')
    .select('status', { count: 'exact' });

  if (isSeller) contactsQuery = contactsQuery.eq('owner_id', userId);
  const { data: contactStats } = await contactsQuery;

  // Active enrollments needing attention (replied)
  let enrollmentsQuery = supabase
    .from('enrollments')
    .select(`
      id, status, enrolled_at,
      contacts(company, contact_name, email),
      campaigns(name)
    `)
    .eq('status', 'replied')
    .order('enrolled_at', { ascending: false })
    .limit(10);

  const { data: repliedEnrollments } = await enrollmentsQuery;

  // Recent activity
  let recentQuery = supabase
    .from('sent_emails')
    .select(`
      id, subject, sent_at, opened_at, replied_at,
      contacts(company, contact_name, email)
    `)
    .order('sent_at', { ascending: false })
    .limit(15);

  if (isSeller) recentQuery = recentQuery.eq('sender_id', userId);
  const { data: recentActivity } = await recentQuery;

  const totalContacts = contactStats?.length || 0;
  const activeContacts = contactStats?.filter((c: any) => c.status === 'active').length || 0;
  const prospectContacts = contactStats?.filter((c: any) => c.status === 'prospect').length || 0;

  res.json({
    campaigns: campaigns || [],
    emailStats: {
      sent: allEmails.length,
      opened: allEmails.filter(e => e.opened_at).length,
      replied: allEmails.filter(e => e.replied_at).length,
      openRate: allEmails.length > 0
        ? Math.round((allEmails.filter(e => e.opened_at).length / allEmails.length) * 100)
        : 0,
      replyRate: allEmails.length > 0
        ? Math.round((allEmails.filter(e => e.replied_at).length / allEmails.length) * 100)
        : 0,
    },
    contactStats: {
      total: totalContacts,
      active: activeContacts,
      prospect: prospectContacts,
    },
    needsAttention: repliedEnrollments || [],
    recentActivity: recentActivity || [],
  });
});

export default router;

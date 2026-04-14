import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../db/supabase';

const router = Router();
router.use(authenticate);

// List campaigns
router.get('/', async (req: Request, res: Response) => {
  const { status } = req.query;

  let query = supabase
    .from('campaigns')
    .select(`
      *,
      users!campaigns_owner_id_fkey(name, email),
      sequence_steps(count),
      enrollments(count)
    `)
    .order('created_at', { ascending: false });

  if (req.user!.role === 'seller') {
    query = query.eq('owner_id', req.user!.userId);
  }
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

// Get campaign with steps
router.get('/:id', async (req: Request, res: Response) => {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select(`
      *,
      users!campaigns_owner_id_fkey(name, email),
      sequence_steps(*, id, step_order, delay_hours, subject_template, body_template, condition)
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  // Get enrollment stats
  const { data: stats } = await supabase
    .from('enrollments')
    .select('status')
    .eq('campaign_id', req.params.id);

  const enrollmentStats = {
    total: stats?.length || 0,
    active: stats?.filter(e => e.status === 'active').length || 0,
    completed: stats?.filter(e => e.status === 'completed').length || 0,
    replied: stats?.filter(e => e.status === 'replied').length || 0,
    paused: stats?.filter(e => e.status === 'paused').length || 0,
  };

  // Get email stats
  const { data: emails } = await supabase
    .from('sent_emails')
    .select('opened_at, replied_at')
    .in(
      'enrollment_id',
      (stats || []).map(e => (e as any).id).filter(Boolean)
    );

  // Fallback: get emails through enrollments
  const { data: enrollmentEmails } = await supabase
    .from('sent_emails')
    .select('opened_at, replied_at, enrollment_id')
    .not('enrollment_id', 'is', null);

  const campaignEmails = enrollmentEmails?.filter(e => {
    const enrollment = stats?.find((s: any) => s.id === e.enrollment_id);
    return !!enrollment;
  }) || emails || [];

  const emailStats = {
    sent: campaignEmails.length,
    opened: campaignEmails.filter(e => e.opened_at).length,
    replied: campaignEmails.filter(e => e.replied_at).length,
    openRate: campaignEmails.length > 0
      ? Math.round((campaignEmails.filter(e => e.opened_at).length / campaignEmails.length) * 100)
      : 0,
    replyRate: campaignEmails.length > 0
      ? Math.round((campaignEmails.filter(e => e.replied_at).length / campaignEmails.length) * 100)
      : 0,
  };

  res.json({
    ...campaign,
    enrollmentStats,
    emailStats,
    sequence_steps: (campaign.sequence_steps || []).sort(
      (a: any, b: any) => a.step_order - b.step_order
    ),
  });
});

// Create campaign
router.post('/', async (req: Request, res: Response) => {
  const { name, steps } = req.body;

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({
      name,
      owner_id: req.user!.userId,
      status: 'draft',
    })
    .select()
    .single();

  if (error || !campaign) {
    res.status(400).json({ error: error?.message || 'Failed to create campaign' });
    return;
  }

  // Insert steps if provided
  if (steps && Array.isArray(steps) && steps.length > 0) {
    const stepRows = steps.map((s: any, i: number) => ({
      campaign_id: campaign.id,
      step_order: i + 1,
      delay_hours: s.delay_hours || 0,
      subject_template: s.subject_template,
      body_template: s.body_template,
      condition: s.condition || 'always',
    }));

    await supabase.from('sequence_steps').insert(stepRows);
  }

  res.status(201).json(campaign);
});

// Update campaign
router.put('/:id', async (req: Request, res: Response) => {
  const { name, status } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabase
    .from('campaigns')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json(data);
});

// Update sequence steps
router.put('/:id/steps', async (req: Request, res: Response) => {
  const { steps } = req.body;
  const campaignId = req.params.id;

  // Delete existing steps
  await supabase
    .from('sequence_steps')
    .delete()
    .eq('campaign_id', campaignId);

  // Insert new steps
  if (steps && Array.isArray(steps) && steps.length > 0) {
    const stepRows = steps.map((s: any, i: number) => ({
      campaign_id: campaignId,
      step_order: i + 1,
      delay_hours: s.delay_hours || 0,
      subject_template: s.subject_template,
      body_template: s.body_template,
      condition: s.condition || 'always',
    }));

    const { error } = await supabase.from('sequence_steps').insert(stepRows);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
  }

  res.json({ ok: true });
});

// Delete campaign
router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', req.params.id);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// Get campaign enrollments
router.get('/:id/enrollments', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      *,
      contacts(company, contact_name, email, country)
    `)
    .eq('campaign_id', req.params.id)
    .order('enrolled_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

export default router;

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../db/supabase';
import { sequenceQueue } from '../jobs/queue';

const router = Router();
router.use(authenticate);

// Enroll contacts in a campaign
router.post('/', async (req: Request, res: Response) => {
  const { campaign_id, contact_ids } = req.body;

  if (!campaign_id || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    res.status(400).json({ error: 'campaign_id and contact_ids required' });
    return;
  }

  // Verify campaign exists and has steps
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('id', campaign_id)
    .single();

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const { data: steps } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('step_order');

  if (!steps || steps.length === 0) {
    res.status(400).json({ error: 'Campaign has no sequence steps' });
    return;
  }

  // Create enrollments
  const firstStepDelay = steps[0].delay_hours;
  const nextStepAt = new Date(Date.now() + firstStepDelay * 60 * 60 * 1000);

  const rows = contact_ids.map((contactId: string) => ({
    contact_id: contactId,
    campaign_id,
    current_step: 1,
    status: 'active' as const,
    next_step_at: nextStepAt.toISOString(),
  }));

  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .upsert(rows, { onConflict: 'contact_id,campaign_id' })
    .select();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Activate campaign if draft
  if (campaign.status === 'draft') {
    await supabase
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', campaign_id);
  }

  // Queue sequence jobs
  for (const enrollment of enrollments || []) {
    await sequenceQueue.add(
      'process-step',
      {
        enrollmentId: enrollment.id,
        campaignId: campaign_id,
        stepOrder: 1,
        userId: req.user!.userId,
      },
      {
        delay: firstStepDelay * 60 * 60 * 1000,
        jobId: `seq-${enrollment.id}-step-1`,
      }
    );
  }

  res.status(201).json({ enrolled: enrollments?.length || 0 });
});

// Pause enrollment
router.post('/:id/pause', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('enrollments')
    .update({ status: 'paused' })
    .eq('id', req.params.id)
    .eq('status', 'active')
    .select()
    .single();

  if (error || !data) {
    res.status(400).json({ error: 'Enrollment not found or not active' });
    return;
  }

  res.json(data);
});

// Resume enrollment
router.post('/:id/resume', async (req: Request, res: Response) => {
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('*')
    .eq('id', req.params.id)
    .eq('status', 'paused')
    .single();

  if (!enrollment) {
    res.status(400).json({ error: 'Enrollment not found or not paused' });
    return;
  }

  const nextStepAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const { data, error } = await supabase
    .from('enrollments')
    .update({ status: 'active', next_step_at: nextStepAt.toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Re-queue the step
  await sequenceQueue.add(
    'process-step',
    {
      enrollmentId: enrollment.id,
      campaignId: enrollment.campaign_id,
      stepOrder: enrollment.current_step,
      userId: req.user!.userId,
    },
    {
      delay: 60 * 60 * 1000,
      jobId: `seq-${enrollment.id}-step-${enrollment.current_step}-resume`,
    }
  );

  res.json(data);
});

// Cancel enrollment
router.post('/:id/cancel', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('enrollments')
    .update({ status: 'cancelled' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) {
    res.status(400).json({ error: 'Enrollment not found' });
    return;
  }

  res.json(data);
});

export default router;

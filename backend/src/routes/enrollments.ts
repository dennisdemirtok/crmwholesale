import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, queryOne, queryAll } from '../db/supabase';
import { sequenceQueue } from '../jobs/queue';

const router = Router();
router.use(authenticate);

router.post('/', async (req: Request, res: Response) => {
  const { campaign_id, contact_ids } = req.body;
  if (!campaign_id || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    res.status(400).json({ error: 'campaign_id and contact_ids required' }); return;
  }

  const campaign = await queryOne('SELECT id, status FROM crm_campaigns WHERE id = $1', [campaign_id]);
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

  const steps = await queryAll('SELECT * FROM crm_sequence_steps WHERE campaign_id = $1 ORDER BY step_order', [campaign_id]);
  if (steps.length === 0) { res.status(400).json({ error: 'Campaign has no sequence steps' }); return; }

  const firstStepDelay = steps[0].delay_hours;
  const nextStepAt = new Date(Date.now() + firstStepDelay * 60 * 60 * 1000);
  let enrolled = 0;

  for (const contactId of contact_ids) {
    try {
      const enrollment = await queryOne(
        `INSERT INTO crm_enrollments (contact_id, campaign_id, current_step, status, next_step_at)
         VALUES ($1, $2, 1, 'active', $3)
         ON CONFLICT (contact_id, campaign_id) DO UPDATE SET status = 'active', current_step = 1, next_step_at = $3
         RETURNING *`,
        [contactId, campaign_id, nextStepAt]
      );

      if (enrollment) {
        await sequenceQueue.add('process-step', {
          enrollmentId: enrollment.id,
          campaignId: campaign_id,
          stepOrder: 1,
          userId: req.user!.userId,
        }, {
          delay: firstStepDelay * 60 * 60 * 1000,
          jobId: `seq-${enrollment.id}-step-1`,
        });
        enrolled++;
      }
    } catch { /* skip */ }
  }

  if (campaign.status === 'draft') {
    await pool.query("UPDATE crm_campaigns SET status = 'active' WHERE id = $1", [campaign_id]);
  }

  res.status(201).json({ enrolled });
});

router.post('/:id/pause', async (req: Request, res: Response) => {
  const data = await queryOne(
    "UPDATE crm_enrollments SET status = 'paused' WHERE id = $1 AND status = 'active' RETURNING *",
    [req.params.id]
  );
  if (!data) { res.status(400).json({ error: 'Enrollment not found or not active' }); return; }
  res.json(data);
});

router.post('/:id/resume', async (req: Request, res: Response) => {
  const enrollment = await queryOne(
    "SELECT * FROM crm_enrollments WHERE id = $1 AND status = 'paused'",
    [req.params.id]
  );
  if (!enrollment) { res.status(400).json({ error: 'Enrollment not found or not paused' }); return; }

  const nextStepAt = new Date(Date.now() + 60 * 60 * 1000);
  const data = await queryOne(
    "UPDATE crm_enrollments SET status = 'active', next_step_at = $1 WHERE id = $2 RETURNING *",
    [nextStepAt, req.params.id]
  );

  await sequenceQueue.add('process-step', {
    enrollmentId: enrollment.id,
    campaignId: enrollment.campaign_id,
    stepOrder: enrollment.current_step,
    userId: req.user!.userId,
  }, {
    delay: 60 * 60 * 1000,
    jobId: `seq-${enrollment.id}-step-${enrollment.current_step}-resume`,
  });

  res.json(data);
});

router.post('/:id/cancel', async (req: Request, res: Response) => {
  const data = await queryOne(
    "UPDATE crm_enrollments SET status = 'cancelled' WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (!data) { res.status(400).json({ error: 'Enrollment not found' }); return; }
  res.json(data);
});

export default router;

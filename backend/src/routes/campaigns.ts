import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, queryOne, queryAll } from '../db/supabase';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  const { status } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (req.user!.role === 'seller') { conditions.push(`c.owner_id = $${idx++}`); params.push(req.user!.userId); }
  if (status) { conditions.push(`c.status = $${idx++}`); params.push(status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const campaigns = await queryAll(
    `SELECT c.*, json_build_object('name', u.name, 'email', u.email) as users
     FROM crm_campaigns c LEFT JOIN crm_users u ON c.owner_id = u.id
     ${where} ORDER BY c.created_at DESC`,
    params
  );
  res.json(campaigns);
});

router.get('/:id', async (req: Request, res: Response) => {
  const campaign = await queryOne(
    `SELECT c.*, json_build_object('name', u.name, 'email', u.email) as users
     FROM crm_campaigns c LEFT JOIN crm_users u ON c.owner_id = u.id WHERE c.id = $1`,
    [req.params.id]
  );
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

  const steps = await queryAll(
    'SELECT * FROM crm_sequence_steps WHERE campaign_id = $1 ORDER BY step_order',
    [req.params.id]
  );

  const enrollments = await queryAll(
    'SELECT status FROM crm_enrollments WHERE campaign_id = $1',
    [req.params.id]
  );

  const enrollmentStats = {
    total: enrollments.length,
    active: enrollments.filter(e => e.status === 'active').length,
    completed: enrollments.filter(e => e.status === 'completed').length,
    replied: enrollments.filter(e => e.status === 'replied').length,
    paused: enrollments.filter(e => e.status === 'paused').length,
  };

  const enrollmentIds = (await queryAll(
    'SELECT id FROM crm_enrollments WHERE campaign_id = $1',
    [req.params.id]
  )).map(e => e.id);

  let emailStats = { sent: 0, opened: 0, replied: 0, openRate: 0, replyRate: 0 };
  if (enrollmentIds.length > 0) {
    const emails = await queryAll(
      `SELECT opened_at, replied_at FROM crm_sent_emails WHERE enrollment_id = ANY($1)`,
      [enrollmentIds]
    );
    emailStats = {
      sent: emails.length,
      opened: emails.filter(e => e.opened_at).length,
      replied: emails.filter(e => e.replied_at).length,
      openRate: emails.length > 0 ? Math.round((emails.filter(e => e.opened_at).length / emails.length) * 100) : 0,
      replyRate: emails.length > 0 ? Math.round((emails.filter(e => e.replied_at).length / emails.length) * 100) : 0,
    };
  }

  res.json({ ...campaign, sequence_steps: steps, enrollmentStats, emailStats });
});

router.post('/', async (req: Request, res: Response) => {
  const { name, steps } = req.body;
  const campaign = await queryOne(
    `INSERT INTO crm_campaigns (name, owner_id, status) VALUES ($1, $2, 'draft') RETURNING *`,
    [name, req.user!.userId]
  );
  if (!campaign) { res.status(400).json({ error: 'Failed to create campaign' }); return; }

  if (steps && Array.isArray(steps) && steps.length > 0) {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await pool.query(
        `INSERT INTO crm_sequence_steps (campaign_id, step_order, delay_hours, subject_template, body_template, condition)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [campaign.id, i + 1, s.delay_hours || 0, s.subject_template, s.body_template, s.condition || 'always']
      );
    }
  }
  res.status(201).json(campaign);
});

router.put('/:id', async (req: Request, res: Response) => {
  const { name, status } = req.body;
  const sets: string[] = []; const params: any[] = []; let idx = 1;
  if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
  if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
  if (sets.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
  params.push(req.params.id);
  const data = await queryOne(`UPDATE crm_campaigns SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
  res.json(data);
});

router.put('/:id/steps', async (req: Request, res: Response) => {
  const { steps } = req.body;
  const campaignId = req.params.id;
  await pool.query('DELETE FROM crm_sequence_steps WHERE campaign_id = $1', [campaignId]);
  if (steps && Array.isArray(steps)) {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await pool.query(
        `INSERT INTO crm_sequence_steps (campaign_id, step_order, delay_hours, subject_template, body_template, condition)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [campaignId, i + 1, s.delay_hours || 0, s.subject_template, s.body_template, s.condition || 'always']
      );
    }
  }
  res.json({ ok: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM crm_campaigns WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/:id/enrollments', async (req: Request, res: Response) => {
  const data = await queryAll(
    `SELECT e.*, json_build_object('company', c.company, 'contact_name', c.contact_name, 'email', c.email, 'country', c.country) as contacts
     FROM crm_enrollments e LEFT JOIN crm_contacts c ON e.contact_id = c.id
     WHERE e.campaign_id = $1 ORDER BY e.enrolled_at DESC`,
    [req.params.id]
  );
  res.json(data);
});

export default router;

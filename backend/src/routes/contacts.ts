import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, queryOne, queryAll } from '../db/supabase';

const router = Router();
router.use(authenticate);

// List contacts
router.get('/', async (req: Request, res: Response) => {
  const { user } = req;
  const { status, country, category, tag, search, page = '1', limit = '50' } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (user!.role === 'seller') {
    conditions.push(`c.owner_id = $${paramIdx++}`);
    params.push(user!.userId);
  }
  if (status) { conditions.push(`c.status = $${paramIdx++}`); params.push(status); }
  if (country) { conditions.push(`c.country = $${paramIdx++}`); params.push(country); }
  if (category) { conditions.push(`c.category = $${paramIdx++}`); params.push(category); }
  if (tag) { conditions.push(`$${paramIdx++} = ANY(c.tags)`); params.push(tag); }
  if (search) {
    conditions.push(`(c.company ILIKE $${paramIdx} OR c.contact_name ILIKE $${paramIdx} OR c.email ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const offset = (pageNum - 1) * limitNum;

  const countResult = await pool.query(`SELECT COUNT(*) FROM crm_contacts c ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const contacts = await queryAll(
    `SELECT c.*, json_build_object('name', u.name, 'email', u.email) as users
     FROM crm_contacts c LEFT JOIN crm_users u ON c.owner_id = u.id
     ${where} ORDER BY c.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limitNum, offset]
  );

  res.json({ contacts, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
});

router.get('/:id', async (req: Request, res: Response) => {
  const contact = await queryOne(
    `SELECT c.*, json_build_object('name', u.name, 'email', u.email) as users
     FROM crm_contacts c LEFT JOIN crm_users u ON c.owner_id = u.id WHERE c.id = $1`,
    [req.params.id]
  );
  if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
  if (req.user!.role === 'seller' && contact.owner_id !== req.user!.userId) {
    res.status(403).json({ error: 'Access denied' }); return;
  }
  res.json(contact);
});

router.post('/', async (req: Request, res: Response) => {
  const { company, contact_name, email, country, category, status, tags, notes } = req.body;
  try {
    const contact = await queryOne(
      `INSERT INTO crm_contacts (company, contact_name, email, country, category, status, tags, owner_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [company, contact_name, email, country, category, status || 'prospect', tags || [], req.user!.userId, notes]
    );
    res.status(201).json(contact);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { company, contact_name, email, country, category, status, tags, notes, owner_id } = req.body;
  const sets: string[] = []; const params: any[] = []; let idx = 1;
  const add = (n: string, v: any) => { if (v !== undefined) { sets.push(`${n} = $${idx++}`); params.push(v); } };
  add('company', company); add('contact_name', contact_name); add('email', email);
  add('country', country); add('category', category); add('status', status);
  add('tags', tags); add('notes', notes);
  if (owner_id !== undefined && req.user!.role !== 'seller') add('owner_id', owner_id);
  if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  params.push(req.params.id);
  const contact = await queryOne(`UPDATE crm_contacts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
  res.json(contact);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM crm_contacts WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/import', async (req: Request, res: Response) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) { res.status(400).json({ error: 'No contacts provided' }); return; }
  let imported = 0;
  for (const c of contacts) {
    try {
      await pool.query(
        `INSERT INTO crm_contacts (company, contact_name, email, country, category, status, tags, owner_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [c.company, c.contact_name, c.email, c.country || null, c.category || null, c.status || 'prospect', c.tags || [], req.user!.userId, c.notes || null]
      );
      imported++;
    } catch { /* skip bad rows */ }
  }
  res.status(201).json({ imported });
});

export default router;

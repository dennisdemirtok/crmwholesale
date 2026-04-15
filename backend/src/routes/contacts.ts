import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool, queryOne, queryAll } from '../db/supabase';
import { getValidAccessToken } from '../services/gmail';
import { google } from 'googleapis';

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

// Import contact from Gmail email address
router.post('/import-from-email', async (req: Request, res: Response) => {
  const { email } = req.body;
  const userId = req.user!.userId;

  if (!email) { res.status(400).json({ error: 'email required' }); return; }

  try {
    const accessToken = await getValidAccessToken(userId);
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    // Search for emails from/to this address
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: `from:${email} OR to:${email}`,
      maxResults: 20,
    });

    const messages = data.messages || [];

    // Get details from first few messages to extract contact info
    let contactName = '';
    let company = '';
    const emailHistory: Array<{
      from: string;
      to: string;
      subject: string;
      date: string;
      snippet: string;
      messageId: string;
      threadId: string;
    }> = [];

    for (const msg of messages.slice(0, 15)) {
      const { data: message } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const headers = message.payload?.headers || [];
      const getH = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const from = getH('From');
      const to = getH('To');
      const subject = getH('Subject');
      const date = getH('Date');

      // Try to extract name from the "From" header: "Name <email>"
      if (from.toLowerCase().includes(email.toLowerCase()) && !contactName) {
        const match = from.match(/^"?([^"<]+)"?\s*</);
        if (match) contactName = match[1].trim();
      }

      // Try to extract company from email domain
      if (!company) {
        const domain = email.split('@')[1];
        if (domain && !['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'].includes(domain)) {
          company = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
        }
      }

      emailHistory.push({
        from,
        to,
        subject,
        date,
        snippet: message.snippet || '',
        messageId: message.id!,
        threadId: message.threadId!,
      });
    }

    // Create contact
    const contact = await queryOne(
      `INSERT INTO crm_contacts (company, contact_name, email, status, owner_id, notes)
       VALUES ($1, $2, $3, 'prospect', $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        company || 'Okänt företag',
        contactName || email.split('@')[0],
        email,
        userId,
        `Importerad från Gmail. ${messages.length} mail hittade.`,
      ]
    );

    if (!contact) {
      // Contact might already exist
      const existing = await queryOne('SELECT * FROM crm_contacts WHERE email = $1 AND owner_id = $2', [email, userId]);
      if (existing) {
        res.json({ contact: existing, emailHistory, message: 'Kontakten finns redan' });
        return;
      }
    }

    res.json({
      contact: contact,
      emailHistory,
      message: `Kontakt skapad med ${emailHistory.length} mail hittade`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

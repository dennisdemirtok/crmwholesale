import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../db/supabase';

const router = Router();
router.use(authenticate);

// List contacts
router.get('/', async (req: Request, res: Response) => {
  const { user } = req;
  const { status, country, category, tag, search, page = '1', limit = '50' } = req.query;

  let query = supabase
    .from('contacts')
    .select('*, users!contacts_owner_id_fkey(name, email)', { count: 'exact' });

  // Role-based filtering
  if (user!.role === 'seller') {
    query = query.eq('owner_id', user!.userId);
  }

  if (status) query = query.eq('status', status);
  if (country) query = query.eq('country', country);
  if (category) query = query.eq('category', category);
  if (tag) query = query.contains('tags', [tag as string]);
  if (search) {
    query = query.or(
      `company.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const offset = (pageNum - 1) * limitNum;

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limitNum - 1);

  const { data, error, count } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    contacts: data,
    total: count,
    page: pageNum,
    totalPages: Math.ceil((count || 0) / limitNum),
  });
});

// Get single contact
router.get('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('contacts')
    .select('*, users!contacts_owner_id_fkey(name, email)')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Contact not found' });
    return;
  }

  if (req.user!.role === 'seller' && data.owner_id !== req.user!.userId) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  res.json(data);
});

// Create contact
router.post('/', async (req: Request, res: Response) => {
  const { company, contact_name, email, country, category, status, tags, notes } = req.body;

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      company,
      contact_name,
      email,
      country,
      category,
      status: status || 'prospect',
      tags: tags || [],
      owner_id: req.user!.userId,
      notes,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

// Update contact
router.put('/:id', async (req: Request, res: Response) => {
  const { company, contact_name, email, country, category, status, tags, notes, owner_id } = req.body;

  const updates: Record<string, any> = {};
  if (company !== undefined) updates.company = company;
  if (contact_name !== undefined) updates.contact_name = contact_name;
  if (email !== undefined) updates.email = email;
  if (country !== undefined) updates.country = country;
  if (category !== undefined) updates.category = category;
  if (status !== undefined) updates.status = status;
  if (tags !== undefined) updates.tags = tags;
  if (notes !== undefined) updates.notes = notes;
  if (owner_id !== undefined && req.user!.role !== 'seller') {
    updates.owner_id = owner_id;
  }

  const { data, error } = await supabase
    .from('contacts')
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

// Delete contact
router.delete('/:id', async (req: Request, res: Response) => {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', req.params.id);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// Bulk import contacts (CSV)
router.post('/import', async (req: Request, res: Response) => {
  const { contacts } = req.body;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: 'No contacts provided' });
    return;
  }

  const rows = contacts.map((c: any) => ({
    company: c.company,
    contact_name: c.contact_name,
    email: c.email,
    country: c.country || null,
    category: c.category || null,
    status: c.status || 'prospect',
    tags: c.tags || [],
    owner_id: req.user!.userId,
    notes: c.notes || null,
  }));

  const { data, error } = await supabase
    .from('contacts')
    .insert(rows)
    .select();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json({ imported: data?.length || 0 });
});

export default router;

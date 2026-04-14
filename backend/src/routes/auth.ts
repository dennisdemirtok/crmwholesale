import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getAuthUrl, exchangeCode } from '../services/gmail';
import { encrypt } from '../utils/encryption';
import { pool, queryOne } from '../db/supabase';

const router = Router();

router.get('/google/start', (_req: Request, res: Response) => {
  const url = getAuthUrl();
  res.redirect(url);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    const { tokens, userInfo } = await exchangeCode(code);

    // Check if user exists
    const existingUser = await queryOne<{ id: string; role: string }>(
      'SELECT id, role FROM crm_users WHERE email = $1',
      [userInfo.email]
    );

    let userId: string;
    let userRole: string;

    if (existingUser) {
      userId = existingUser.id;
      userRole = existingUser.role;
      const updates: string[] = ['name = $2', 'token_status = $3', 'last_token_refresh = $4'];
      const params: any[] = [userId, userInfo.name, 'active', new Date()];

      if (tokens.refresh_token) {
        updates.push(`google_refresh_token = $${params.length + 1}`);
        params.push(encrypt(tokens.refresh_token));
      }

      await pool.query(
        `UPDATE crm_users SET ${updates.join(', ')} WHERE id = $1`,
        params
      );
    } else {
      const newUser = await queryOne<{ id: string; role: string }>(
        `INSERT INTO crm_users (email, name, role, google_refresh_token, token_status, last_token_refresh)
         VALUES ($1, $2, 'seller', $3, $4, $5)
         RETURNING id, role`,
        [
          userInfo.email,
          userInfo.name,
          tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          tokens.refresh_token ? 'active' : 'pending',
          new Date(),
        ]
      );

      if (!newUser) {
        res.status(500).json({ error: 'Failed to create user' });
        return;
      }
      userId = newUser.id;
      userRole = newUser.role;
    }

    // Cache access token in Redis
    if (tokens.access_token) {
      const { redis } = await import('../services/redis');
      await redis.setex(`gmail:token:${userId}`, 3000, tokens.access_token);
    }

    // Create session JWT
    const sessionToken = jwt.sign(
      { userId, email: userInfo.email, role: userRole },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${frontendUrl}/dashboard?auth=success`);
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

router.get('/me', async (req: Request, res: Response) => {
  const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const user = await queryOne(
      'SELECT id, email, name, role, token_status, created_at FROM crm_users WHERE id = $1',
      [payload.userId]
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getAuthUrl, exchangeCode } from '../services/gmail';
import { encrypt } from '../utils/encryption';
import { supabase } from '../db/supabase';
import { redis } from '../services/redis';

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

    // Upsert user
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, role')
      .eq('email', userInfo.email)
      .single();

    let userId: string;
    let userRole: string;

    if (existingUser) {
      userId = existingUser.id;
      userRole = existingUser.role;
      await supabase
        .from('users')
        .update({
          name: userInfo.name,
          google_refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
          token_status: 'active',
          last_token_refresh: new Date().toISOString(),
        })
        .eq('id', userId);
    } else {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email: userInfo.email,
          name: userInfo.name,
          role: 'seller',
          google_refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          token_status: tokens.refresh_token ? 'active' : 'pending',
          last_token_refresh: new Date().toISOString(),
        })
        .select('id, role')
        .single();

      if (error || !newUser) {
        res.status(500).json({ error: 'Failed to create user' });
        return;
      }
      userId = newUser.id;
      userRole = newUser.role;
    }

    // Cache access token
    if (tokens.access_token) {
      await redis.setex(`gmail:token:${userId}`, 3000, tokens.access_token);
    }

    // Create session JWT
    const sessionToken = jwt.sign(
      { userId, email: userInfo.email, role: userRole! },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Set cookie and redirect
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, role, token_status, created_at')
      .eq('id', payload.userId)
      .single();

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

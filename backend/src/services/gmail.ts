import { google } from 'googleapis';
import { redis } from './redis';
import { supabase } from '../db/supabase';
import { encrypt, decrypt } from '../utils/encryption';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function getAuthUrl(state?: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

export async function exchangeCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  return {
    tokens,
    userInfo: {
      email: userInfo.email!,
      name: userInfo.name || userInfo.email!,
    },
  };
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const cacheKey = `gmail:token:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const { data: user, error } = await supabase
    .from('users')
    .select('google_refresh_token, token_status')
    .eq('id', userId)
    .single();

  if (error || !user?.google_refresh_token) {
    throw new Error('No refresh token available');
  }

  if (user.token_status === 'revoked') {
    throw new Error('Token has been revoked — user needs to re-authenticate');
  }

  const refreshToken = decrypt(user.google_refresh_token);

  try {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (credentials.access_token) {
      await redis.setex(cacheKey, 3000, credentials.access_token);
      await supabase
        .from('users')
        .update({ last_token_refresh: new Date().toISOString(), token_status: 'active' })
        .eq('id', userId);
      return credentials.access_token;
    }
    throw new Error('No access token received');
  } catch (err: any) {
    if (err.message?.includes('invalid_grant') || err.code === 400) {
      await supabase
        .from('users')
        .update({ token_status: 'revoked' })
        .eq('id', userId);
      throw new Error('Refresh token revoked — user needs to re-authenticate');
    }
    throw err;
  }
}

function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
}

export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string,
  threadId?: string
): Promise<{ messageId: string; threadId: string }> {
  const accessToken = await getValidAccessToken(userId);
  const gmail = getGmailClient(accessToken);

  const { data: user } = await supabase
    .from('users')
    .select('email, name')
    .eq('id', userId)
    .single();

  if (!user) throw new Error('User not found');

  const messageParts = [
    `From: ${user.name} <${user.email}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ];

  if (threadId) {
    messageParts.splice(3, 0, `In-Reply-To: ${threadId}`, `References: ${threadId}`);
  }

  const raw = Buffer.from(messageParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: threadId || undefined,
    },
  });

  return {
    messageId: response.data.id!,
    threadId: response.data.threadId!,
  };
}

export async function checkForReplies(
  userId: string,
  afterTimestamp: number
): Promise<Array<{ threadId: string; messageId: string; from: string; snippet: string }>> {
  const accessToken = await getValidAccessToken(userId);
  const gmail = getGmailClient(accessToken);

  const afterSeconds = Math.floor(afterTimestamp / 1000);
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q: `in:inbox is:unread after:${afterSeconds}`,
    maxResults: 50,
  });

  if (!data.messages) return [];

  const replies: Array<{ threadId: string; messageId: string; from: string; snippet: string }> = [];

  for (const msg of data.messages) {
    const { data: message } = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject'],
    });

    const fromHeader = message.payload?.headers?.find(h => h.name === 'From');
    replies.push({
      threadId: message.threadId!,
      messageId: message.id!,
      from: fromHeader?.value || '',
      snippet: message.snippet || '',
    });
  }

  return replies;
}

export async function getThread(userId: string, threadId: string) {
  const accessToken = await getValidAccessToken(userId);
  const gmail = getGmailClient(accessToken);

  const { data } = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  return data;
}

export { encrypt };

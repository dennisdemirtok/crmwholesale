import { google } from 'googleapis';
import { redis } from './redis';
import { pool, queryOne } from '../db/supabase';
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

  const user = await queryOne<{ google_refresh_token: string; token_status: string }>(
    'SELECT google_refresh_token, token_status FROM crm_users WHERE id = $1',
    [userId]
  );

  if (!user?.google_refresh_token) {
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
      await pool.query(
        "UPDATE crm_users SET last_token_refresh = $1, token_status = 'active' WHERE id = $2",
        [new Date(), userId]
      );
      return credentials.access_token;
    }
    throw new Error('No access token received');
  } catch (err: any) {
    if (err.message?.includes('invalid_grant') || err.code === 400) {
      await pool.query(
        "UPDATE crm_users SET token_status = 'revoked' WHERE id = $1",
        [userId]
      );
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

/**
 * RFC 2047 encode a header value for UTF-8 support
 */
function encodeHeader(value: string): string {
  // Check if the value contains non-ASCII characters
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  // Use RFC 2047 B-encoding for UTF-8
  const encoded = Buffer.from(value, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

export interface Attachment {
  filename: string;
  mimeType: string;
  content: string; // base64 encoded
}

export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string,
  replyToMessageId?: string,
  threadId?: string,
  attachments?: Attachment[]
): Promise<{ messageId: string; threadId: string }> {
  const accessToken = await getValidAccessToken(userId);
  const gmail = getGmailClient(accessToken);

  const user = await queryOne<{ email: string; name: string; signature: string | null }>(
    'SELECT email, name, signature FROM crm_users WHERE id = $1',
    [userId]
  );

  if (!user) throw new Error('User not found');

  // Append signature if set
  let fullBody = htmlBody;
  if (user.signature) {
    fullBody += `<br/><br/>--<br/>${user.signature}`;
  }

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = attachments && attachments.length > 0;

  const headers = [
    `From: =?UTF-8?B?${Buffer.from(user.name, 'utf-8').toString('base64')}?= <${user.email}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];

  if (replyToMessageId) {
    headers.push(`In-Reply-To: ${replyToMessageId}`);
    headers.push(`References: ${replyToMessageId}`);
  }

  let message: string;

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const parts: string[] = [];

    // HTML body part
    parts.push([
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(fullBody, 'utf-8').toString('base64'),
    ].join('\r\n'));

    // Attachment parts
    for (const att of attachments!) {
      parts.push([
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${att.filename}"`,
        '',
        att.content,
      ].join('\r\n'));
    }

    parts.push(`--${boundary}--`);
    message = headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
  } else {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    headers.push('Content-Transfer-Encoding: base64');
    const bodyBase64 = Buffer.from(fullBody, 'utf-8').toString('base64');
    message = headers.join('\r\n') + '\r\n\r\n' + bodyBase64;
  }

  const raw = Buffer.from(message, 'utf-8')
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
  // Don't require unread — the user may have already read the reply in Gmail
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q: `in:inbox after:${afterSeconds}`,
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

/**
 * Detect if a message is an out-of-office / automatic reply
 * Returns true if it looks like an auto-reply (don't stop sequence)
 */
function isAutoReply(subject: string, snippet: string, headers: any[]): boolean {
  // Check Auto-Submitted header (RFC 3834)
  const autoSubmitted = headers.find((h: any) => h.name?.toLowerCase() === 'auto-submitted')?.value;
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') return true;

  // Check X-Auto-Response-Suppress, X-Autoreply, etc.
  const autoreplyHeaders = ['x-autoreply', 'x-autorespond', 'x-auto-response-suppress', 'precedence'];
  for (const h of headers) {
    const name = h.name?.toLowerCase();
    if (autoreplyHeaders.includes(name)) {
      const val = (h.value || '').toLowerCase();
      if (name === 'precedence' && (val === 'auto_reply' || val === 'bulk' || val === 'list')) return true;
      if (name !== 'precedence') return true;
    }
  }

  const text = `${subject} ${snippet}`.toLowerCase();
  const ooPatterns = [
    'out of office', 'out-of-office', 'ooo',
    'automatic reply', 'auto-reply', 'auto reply', 'autoreply',
    'automatiskt svar', 'autosvar',
    'frånvaro', 'är inte på kontoret', 'är ute', 'är borta',
    'är på semester', 'på semester', 'tillbaka den',
    'i am away', 'i am out of', 'i will be away', 'currently away',
    'on vacation', 'on holiday', 'on leave', 'on parental leave',
    'kommer tillbaka', 'will return', 'will be back',
    'outside the office', 'unavailable',
    'no longer with', 'has left', 'no longer works',
    'thank you for your email', 'thank you for your message', // common in OOO
  ];

  return ooPatterns.some((p) => text.includes(p));
}

/**
 * Check specific thread IDs for replies (more targeted than polling all inbox)
 */
export async function checkThreadsForReplies(
  userId: string,
  threadIds: string[]
): Promise<Array<{ threadId: string; hasReply: boolean; isAutoReply: boolean; latestFrom: string; latestSnippet: string; latestDate: string; latestSubject: string }>> {
  const accessToken = await getValidAccessToken(userId);
  const gmail = getGmailClient(accessToken);

  const user = await queryOne<{ email: string }>('SELECT email FROM crm_users WHERE id = $1', [userId]);
  if (!user) return [];

  const results: Array<{ threadId: string; hasReply: boolean; isAutoReply: boolean; latestFrom: string; latestSnippet: string; latestDate: string; latestSubject: string }> = [];

  for (const threadId of threadIds) {
    try {
      const { data: thread } = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'metadata',
        metadataHeaders: ['From', 'Date', 'Subject', 'Auto-Submitted', 'X-Autoreply', 'X-Autorespond', 'Precedence'],
      });

      const messages = thread.messages || [];
      // Check if any message in thread is NOT from us (= a reply from someone else)
      const replies = messages.filter(msg => {
        const from = msg.payload?.headers?.find(h => h.name === 'From')?.value || '';
        return !from.toLowerCase().includes(user.email.toLowerCase());
      });

      if (replies.length > 0) {
        const latest = replies[replies.length - 1];
        const headers = latest.payload?.headers || [];
        const latestFrom = headers.find(h => h.name === 'From')?.value || '';
        const latestDate = headers.find(h => h.name === 'Date')?.value || '';
        const latestSubject = headers.find(h => h.name === 'Subject')?.value || '';
        const latestSnippet = latest.snippet || '';
        const autoReply = isAutoReply(latestSubject, latestSnippet, headers);

        results.push({
          threadId,
          hasReply: true,
          isAutoReply: autoReply,
          latestFrom,
          latestSnippet,
          latestDate,
          latestSubject,
        });
      }
    } catch {
      // Thread might not exist or be inaccessible
    }
  }

  return results;
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

export async function getMessage(userId: string, messageId: string) {
  const accessToken = await getValidAccessToken(userId);
  const gmail = getGmailClient(accessToken);

  const { data } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  return data;
}

export { encrypt };

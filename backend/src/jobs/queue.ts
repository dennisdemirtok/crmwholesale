import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../services/redis';
import { pool, queryOne, queryAll } from '../db/supabase';
import { sendEmail } from '../services/gmail';
import { renderTemplate, injectTrackingPixel } from '../utils/template';
import { v4 as uuid } from 'uuid';
import { Contact, User, SequenceStep } from '../types';

const connection = { connection: redis };

export const sequenceQueue = new Queue('sequences', connection);
export const replyCheckQueue = new Queue('reply-checks', connection);

export function startSequenceWorker() {
  const worker = new Worker(
    'sequences',
    async (job: Job) => {
      const { enrollmentId, campaignId, stepOrder, userId } = job.data;

      const enrollment = await queryOne('SELECT * FROM crm_enrollments WHERE id = $1', [enrollmentId]);
      if (!enrollment || enrollment.status !== 'active') return;

      const step = await queryOne(
        'SELECT * FROM crm_sequence_steps WHERE campaign_id = $1 AND step_order = $2',
        [campaignId, stepOrder]
      );
      if (!step) {
        await pool.query("UPDATE crm_enrollments SET status = 'completed' WHERE id = $1", [enrollmentId]);
        return;
      }

      const contact = await queryOne('SELECT * FROM crm_contacts WHERE id = $1', [enrollment.contact_id]);
      if (!contact) return;

      const sender = await queryOne('SELECT * FROM crm_users WHERE id = $1', [userId]);
      if (!sender) return;

      // Evaluate condition
      const shouldSend = await evaluateCondition(step, enrollmentId);
      if (!shouldSend) {
        await scheduleNextStep(enrollmentId, campaignId, stepOrder, userId);
        return;
      }

      const subject = renderTemplate(step.subject_template, contact as Contact, sender as User);
      const trackingPixelId = uuid();
      const body = renderTemplate(step.body_template, contact as Contact, sender as User);
      const htmlBody = injectTrackingPixel(body, trackingPixelId);

      const prevEmail = await queryOne(
        `SELECT gmail_thread_id FROM crm_sent_emails
         WHERE enrollment_id = $1 AND gmail_thread_id IS NOT NULL
         ORDER BY sent_at DESC LIMIT 1`,
        [enrollmentId]
      );

      try {
        const result = await sendEmail(userId, contact.email, subject, htmlBody, prevEmail?.gmail_thread_id || undefined);

        await pool.query(
          `INSERT INTO crm_sent_emails (enrollment_id, contact_id, sender_id, gmail_message_id, gmail_thread_id, subject, body, tracking_pixel_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [enrollmentId, contact.id, userId, result.messageId, result.threadId, subject, body, trackingPixelId]
        );

        await pool.query('UPDATE crm_enrollments SET current_step = $1 WHERE id = $2', [stepOrder, enrollmentId]);
        await scheduleNextStep(enrollmentId, campaignId, stepOrder, userId);
        console.log(`Sent step ${stepOrder} for enrollment ${enrollmentId}`);
      } catch (err: any) {
        console.error(`Failed to send email for enrollment ${enrollmentId}:`, err.message);
        throw err;
      }
    },
    {
      ...connection,
      concurrency: 5,
      limiter: { max: 50, duration: 60 * 60 * 1000 },
    }
  );

  worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
  return worker;
}

async function evaluateCondition(step: any, enrollmentId: string): Promise<boolean> {
  if (step.condition === 'always') return true;

  const lastEmail = await queryOne(
    'SELECT opened_at, replied_at FROM crm_sent_emails WHERE enrollment_id = $1 ORDER BY sent_at DESC LIMIT 1',
    [enrollmentId]
  );
  if (!lastEmail) return true;

  switch (step.condition) {
    case 'not_opened': return !lastEmail.opened_at;
    case 'opened_not_replied': return !!lastEmail.opened_at && !lastEmail.replied_at;
    case 'not_replied': return !lastEmail.replied_at;
    default: return true;
  }
}

async function scheduleNextStep(enrollmentId: string, campaignId: string, currentStep: number, userId: string) {
  const nextStep = await queryOne(
    'SELECT * FROM crm_sequence_steps WHERE campaign_id = $1 AND step_order = $2',
    [campaignId, currentStep + 1]
  );

  if (!nextStep) {
    await pool.query("UPDATE crm_enrollments SET status = 'completed', next_step_at = NULL WHERE id = $1", [enrollmentId]);
    return;
  }

  const jitterMs = (Math.random() * 10 - 5) * 60 * 1000;
  const delayMs = nextStep.delay_hours * 60 * 60 * 1000 + jitterMs;
  const nextStepAt = new Date(Date.now() + delayMs);

  await pool.query('UPDATE crm_enrollments SET next_step_at = $1 WHERE id = $2', [nextStepAt, enrollmentId]);

  await sequenceQueue.add('process-step', {
    enrollmentId, campaignId, stepOrder: currentStep + 1, userId,
  }, {
    delay: Math.max(delayMs, 0),
    jobId: `seq-${enrollmentId}-step-${currentStep + 1}`,
  });
}

export function startReplyCheckWorker() {
  const worker = new Worker(
    'reply-checks',
    async (job: Job) => {
      const { userId } = job.data;
      const { checkThreadsForReplies } = await import('../services/gmail');

      // Get unreplied emails from last 30 days
      const unreplied = await queryAll(
        `SELECT id, gmail_thread_id, enrollment_id FROM crm_sent_emails
         WHERE sender_id = $1 AND gmail_thread_id IS NOT NULL AND replied_at IS NULL
         AND sent_at > NOW() - INTERVAL '30 days'`,
        [userId]
      );

      if (unreplied.length === 0) return;

      const threadIds = unreplied.map(e => e.gmail_thread_id);
      const replies = await checkThreadsForReplies(userId, threadIds);

      for (const reply of replies) {
        if (!reply.hasReply) continue;
        const email = unreplied.find(e => e.gmail_thread_id === reply.threadId);
        if (!email) continue;

        if (reply.isAutoReply) {
          // OOO / auto-reply — flag but DON'T stop sequence
          await pool.query('UPDATE crm_sent_emails SET is_auto_reply = true WHERE id = $1', [email.id]);
        } else {
          // Real reply — stop sequence
          await pool.query('UPDATE crm_sent_emails SET replied_at = NOW() WHERE id = $1', [email.id]);
          if (email.enrollment_id) {
            await pool.query(
              "UPDATE crm_enrollments SET status = 'replied', next_step_at = NULL WHERE id = $1 AND status = 'active'",
              [email.enrollment_id]
            );
          }
        }
      }
    },
    connection
  );
  return worker;
}

export async function scheduleReplyChecks() {
  const users = await queryAll("SELECT id FROM crm_users WHERE token_status = 'active'");
  for (const user of users) {
    await replyCheckQueue.add('check-replies', { userId: user.id }, {
      repeat: { every: 2 * 60 * 1000 },
      jobId: `reply-check-${user.id}`,
    });
  }
}

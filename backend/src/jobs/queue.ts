import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../services/redis';
import { supabase } from '../db/supabase';
import { sendEmail } from '../services/gmail';
import { renderTemplate, injectTrackingPixel } from '../utils/template';
import { v4 as uuid } from 'uuid';
import { Contact, User, SequenceStep } from '../types';

const connection = { connection: redis };

export const sequenceQueue = new Queue('sequences', connection);
export const replyCheckQueue = new Queue('reply-checks', connection);

// Sequence step processor
export function startSequenceWorker() {
  const worker = new Worker(
    'sequences',
    async (job: Job) => {
      const { enrollmentId, campaignId, stepOrder, userId } = job.data;

      // Get enrollment
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('*')
        .eq('id', enrollmentId)
        .single();

      if (!enrollment || enrollment.status !== 'active') {
        console.log(`Enrollment ${enrollmentId} not active, skipping`);
        return;
      }

      // Get step
      const { data: step } = await supabase
        .from('sequence_steps')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('step_order', stepOrder)
        .single();

      if (!step) {
        // No more steps — mark as completed
        await supabase
          .from('enrollments')
          .update({ status: 'completed' })
          .eq('id', enrollmentId);
        return;
      }

      // Get contact
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', enrollment.contact_id)
        .single();

      if (!contact) return;

      // Get sender
      const { data: sender } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (!sender) return;

      // Check condition
      const shouldSend = await evaluateCondition(
        step as SequenceStep,
        enrollmentId,
        contact as Contact
      );

      if (!shouldSend) {
        console.log(`Condition not met for enrollment ${enrollmentId}, step ${stepOrder}`);
        // Skip to next step
        await scheduleNextStep(enrollmentId, campaignId, stepOrder, userId);
        return;
      }

      // Render and send email
      const subject = renderTemplate(step.subject_template, contact as Contact, sender as User);
      const trackingPixelId = uuid();
      const body = renderTemplate(step.body_template, contact as Contact, sender as User);
      const htmlBody = injectTrackingPixel(body, trackingPixelId);

      // Get existing thread ID if continuing conversation
      const { data: prevEmail } = await supabase
        .from('sent_emails')
        .select('gmail_thread_id')
        .eq('enrollment_id', enrollmentId)
        .not('gmail_thread_id', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      try {
        const result = await sendEmail(
          userId,
          contact.email,
          subject,
          htmlBody,
          prevEmail?.gmail_thread_id || undefined
        );

        // Record sent email
        await supabase.from('sent_emails').insert({
          enrollment_id: enrollmentId,
          contact_id: contact.id,
          sender_id: userId,
          gmail_message_id: result.messageId,
          gmail_thread_id: result.threadId,
          subject,
          body,
          tracking_pixel_id: trackingPixelId,
        });

        // Update enrollment
        await supabase
          .from('enrollments')
          .update({ current_step: stepOrder })
          .eq('id', enrollmentId);

        // Schedule next step
        await scheduleNextStep(enrollmentId, campaignId, stepOrder, userId);

        console.log(`Sent step ${stepOrder} for enrollment ${enrollmentId}`);
      } catch (err: any) {
        console.error(`Failed to send email for enrollment ${enrollmentId}:`, err.message);
        throw err; // BullMQ will retry
      }
    },
    {
      ...connection,
      concurrency: 5,
      limiter: {
        max: 50,
        duration: 60 * 60 * 1000, // 50 per hour per queue
      },
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

async function evaluateCondition(
  step: SequenceStep,
  enrollmentId: string,
  contact: Contact
): Promise<boolean> {
  if (step.condition === 'always') return true;

  // Get previous emails for this enrollment
  const { data: emails } = await supabase
    .from('sent_emails')
    .select('opened_at, replied_at')
    .eq('enrollment_id', enrollmentId)
    .order('sent_at', { ascending: false });

  const lastEmail = emails?.[0];
  if (!lastEmail) return true;

  switch (step.condition) {
    case 'not_opened':
      return !lastEmail.opened_at;
    case 'opened_not_replied':
      return !!lastEmail.opened_at && !lastEmail.replied_at;
    case 'not_replied':
      return !lastEmail.replied_at;
    default:
      return true;
  }
}

async function scheduleNextStep(
  enrollmentId: string,
  campaignId: string,
  currentStep: number,
  userId: string
) {
  const nextStepOrder = currentStep + 1;

  const { data: nextStep } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('step_order', nextStepOrder)
    .single();

  if (!nextStep) {
    // No more steps — mark as completed
    await supabase
      .from('enrollments')
      .update({ status: 'completed', next_step_at: null })
      .eq('id', enrollmentId);
    return;
  }

  // Add jitter (±5 minutes) to avoid spam classification
  const jitterMs = (Math.random() * 10 - 5) * 60 * 1000;
  const delayMs = nextStep.delay_hours * 60 * 60 * 1000 + jitterMs;
  const nextStepAt = new Date(Date.now() + delayMs);

  await supabase
    .from('enrollments')
    .update({ next_step_at: nextStepAt.toISOString() })
    .eq('id', enrollmentId);

  await sequenceQueue.add(
    'process-step',
    {
      enrollmentId,
      campaignId,
      stepOrder: nextStepOrder,
      userId,
    },
    {
      delay: Math.max(delayMs, 0),
      jobId: `seq-${enrollmentId}-step-${nextStepOrder}`,
    }
  );
}

// Reply check worker — polls Gmail for replies and updates enrollments
export function startReplyCheckWorker() {
  const worker = new Worker(
    'reply-checks',
    async (job: Job) => {
      const { userId } = job.data;
      const { checkForReplies } = await import('../services/gmail');

      // Check for replies in the last 10 minutes
      const since = Date.now() - 10 * 60 * 1000;
      const replies = await checkForReplies(userId, since);

      for (const reply of replies) {
        // Find matching sent email
        const { data: sentEmail } = await supabase
          .from('sent_emails')
          .select('id, enrollment_id')
          .eq('gmail_thread_id', reply.threadId)
          .is('replied_at', null)
          .single();

        if (sentEmail) {
          // Mark email as replied
          await supabase
            .from('sent_emails')
            .update({ replied_at: new Date().toISOString() })
            .eq('id', sentEmail.id);

          // Stop enrollment sequence
          if (sentEmail.enrollment_id) {
            await supabase
              .from('enrollments')
              .update({ status: 'replied', next_step_at: null })
              .eq('id', sentEmail.enrollment_id)
              .eq('status', 'active');
          }
        }
      }
    },
    connection
  );

  return worker;
}

// Schedule periodic reply checks for all active users
export async function scheduleReplyChecks() {
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('token_status', 'active');

  for (const user of users || []) {
    await replyCheckQueue.add(
      'check-replies',
      { userId: user.id },
      {
        repeat: { every: 2 * 60 * 1000 }, // Every 2 minutes
        jobId: `reply-check-${user.id}`,
      }
    );
  }
}

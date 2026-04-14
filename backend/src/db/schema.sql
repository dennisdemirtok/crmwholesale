-- Flattered Wholesale CRM - Database Schema
-- Run this in Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (sellers)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'seller' CHECK (role IN ('seller', 'manager', 'admin')),
  google_refresh_token text,
  token_status text NOT NULL DEFAULT 'pending' CHECK (token_status IN ('active', 'revoked', 'pending')),
  last_token_refresh timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Contacts (customers)
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  country text,
  category text CHECK (category IN ('boutique', 'department', 'agent', 'online')),
  status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('active', 'prospect', 'churned')),
  tags text[] DEFAULT '{}',
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sequence steps
CREATE TABLE IF NOT EXISTS sequence_steps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  delay_hours int NOT NULL DEFAULT 0,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  condition text NOT NULL DEFAULT 'always' CHECK (condition IN ('always', 'not_opened', 'opened_not_replied', 'not_replied')),
  UNIQUE(campaign_id, step_order)
);

-- Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  current_step int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'replied', 'paused', 'cancelled')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  next_step_at timestamptz,
  UNIQUE(contact_id, campaign_id)
);

-- Sent emails
CREATE TABLE IF NOT EXISTS sent_emails (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id uuid REFERENCES enrollments(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gmail_message_id text,
  gmail_thread_id text,
  subject text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  open_count int NOT NULL DEFAULT 0,
  replied_at timestamptz,
  tracking_pixel_id uuid UNIQUE NOT NULL DEFAULT uuid_generate_v4()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(country);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_enrollments_campaign ON enrollments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_next_step ON enrollments(next_step_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sent_emails_thread ON sent_emails(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_tracking ON sent_emails(tracking_pixel_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_contact ON sent_emails(contact_id);

-- Row Level Security
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using service role key bypasses these; they apply to anon/authenticated keys)
-- For this app we use service key on backend, so RLS is enforced in application logic.
-- These policies serve as a safety net.

CREATE POLICY contacts_access ON contacts FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('manager', 'admin'))
);

CREATE POLICY campaigns_access ON campaigns FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('manager', 'admin'))
);

CREATE POLICY enrollments_access ON enrollments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = enrollments.contact_id
    AND (c.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('manager', 'admin')))
  )
);

CREATE POLICY sent_emails_access ON sent_emails FOR ALL USING (
  sender_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('manager', 'admin'))
);

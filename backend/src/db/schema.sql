-- Flattered Wholesale CRM - Database Schema
-- All tables prefixed with crm_ to avoid conflicts with other services

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CRM Users (sellers)
CREATE TABLE IF NOT EXISTS crm_users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'seller' CHECK (role IN ('seller', 'manager', 'admin')),
  google_refresh_token text,
  token_status text NOT NULL DEFAULT 'pending' CHECK (token_status IN ('active', 'revoked', 'pending')),
  last_token_refresh timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Contacts (customers)
CREATE TABLE IF NOT EXISTS crm_contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  country text,
  category text CHECK (category IN ('boutique', 'department', 'agent', 'online')),
  status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('active', 'prospect', 'churned')),
  tags text[] DEFAULT '{}',
  owner_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Campaigns
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CRM Sequence steps
CREATE TABLE IF NOT EXISTS crm_sequence_steps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  delay_hours int NOT NULL DEFAULT 0,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  condition text NOT NULL DEFAULT 'always' CHECK (condition IN ('always', 'not_opened', 'opened_not_replied', 'not_replied')),
  UNIQUE(campaign_id, step_order)
);

-- CRM Enrollments
CREATE TABLE IF NOT EXISTS crm_enrollments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  current_step int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'replied', 'paused', 'cancelled')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  next_step_at timestamptz,
  UNIQUE(contact_id, campaign_id)
);

-- CRM Sent emails
CREATE TABLE IF NOT EXISTS crm_sent_emails (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id uuid REFERENCES crm_enrollments(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner ON crm_contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts(status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_country ON crm_contacts(country);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tags ON crm_contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_crm_enrollments_campaign ON crm_enrollments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_enrollments_status ON crm_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_crm_enrollments_next_step ON crm_enrollments(next_step_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_crm_sent_emails_thread ON crm_sent_emails(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_sent_emails_tracking ON crm_sent_emails(tracking_pixel_id);
CREATE INDEX IF NOT EXISTS idx_crm_sent_emails_contact ON crm_sent_emails(contact_id);

-- RPC function for tracking pixel
CREATE OR REPLACE FUNCTION crm_increment_open_count(pixel_id uuid)
RETURNS void AS $$
  UPDATE crm_sent_emails
  SET open_count = open_count + 1,
      opened_at = COALESCE(opened_at, NOW())
  WHERE tracking_pixel_id = pixel_id;
$$ LANGUAGE sql;

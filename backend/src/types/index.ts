export interface User {
  id: string;
  email: string;
  name: string;
  role: 'seller' | 'manager' | 'admin';
  google_refresh_token: string | null;
  token_status: 'active' | 'revoked' | 'pending';
  last_token_refresh: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  company: string;
  contact_name: string;
  email: string;
  country: string;
  category: 'boutique' | 'department' | 'agent' | 'online';
  status: 'active' | 'prospect' | 'churned';
  tags: string[];
  owner_id: string;
  notes: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  owner_id: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface SequenceStep {
  id: string;
  campaign_id: string;
  step_order: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  condition: 'always' | 'not_opened' | 'opened_not_replied' | 'not_replied';
}

export interface Enrollment {
  id: string;
  contact_id: string;
  campaign_id: string;
  current_step: number;
  status: 'active' | 'completed' | 'replied' | 'paused' | 'cancelled';
  enrolled_at: string;
  next_step_at: string | null;
}

export interface SentEmail {
  id: string;
  enrollment_id: string | null;
  contact_id: string;
  sender_id: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  subject: string;
  body: string;
  sent_at: string;
  opened_at: string | null;
  open_count: number;
  replied_at: string | null;
  tracking_pixel_id: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

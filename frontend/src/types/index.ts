export interface User {
  id: string;
  email: string;
  name: string;
  role: 'seller' | 'manager' | 'admin';
  token_status: 'active' | 'revoked' | 'pending';
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
  users?: { name: string; email: string };
}

export interface Campaign {
  id: string;
  name: string;
  owner_id: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  created_at: string;
  users?: { name: string; email: string };
  sequence_steps?: SequenceStep[];
  enrollmentStats?: {
    total: number;
    active: number;
    completed: number;
    replied: number;
    paused: number;
  };
  emailStats?: {
    sent: number;
    opened: number;
    replied: number;
    openRate: number;
    replyRate: number;
  };
}

export interface SequenceStep {
  id?: string;
  campaign_id?: string;
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
  contacts?: { company: string; contact_name: string; email: string; country: string };
  campaigns?: { name: string };
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
  contacts?: { company: string; contact_name: string; email: string };
}

export interface DashboardData {
  campaigns: Campaign[];
  emailStats: {
    sent: number;
    opened: number;
    replied: number;
    openRate: number;
    replyRate: number;
  };
  contactStats: {
    total: number;
    active: number;
    prospect: number;
  };
  needsAttention: Enrollment[];
  recentActivity: SentEmail[];
}

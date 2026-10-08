export type UserRole = 'admin' | 'accountant' | 'employee';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  hourly_rate: number;
  avatar_url: string | null;
  resume_url: string | null;
  phone: string | null;
  created_at: string;
}

export interface LoginLog {
  id: string;
  user_id: string;
  login_time: string;
  ip_address: string | null;
  profiles?: Pick<Profile, 'full_name' | 'email' | 'role'>;
}

export type TaskStatus = 'in_progress' | 'completed' | 'blocked';

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  hours_spent: number;
  date_worked: string;
  start_date: string;
  due_date: string | null;
  is_timer_running: boolean;
  timer_start_time: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'avatar_url' | 'department'>;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string;
  href: string;
  entity_type: string | null;
  entity_id: string | null;
  event_key: string;
  read_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  channel: string;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'avatar_url' | 'role'>;
}

export interface DirectConversation {
  id: string;
  member_one: string;
  member_two: string;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'avatar_url' | 'role'>;
}

export interface PayrollSummary {
  user_id: string;
  full_name: string | null;
  email: string;
  department: string | null;
  hourly_rate: number;
  total_hours: number;
  total_pay: number;
}

export interface SessionRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
}

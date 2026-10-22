/** Row types mirroring the SQL schema. SQLite stores booleans as 0/1 and JSON as TEXT. */

export type JobRole = "sales_manager" | "sales_rep" | "ops_manager" | "general";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  avatar_color: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  created_at: string;
}

export interface MembershipRow {
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  job_role: JobRole;
  created_at: string;
}

export interface PreferencesRow {
  user_id: string;
  workspace_id: string;
  job_role: JobRole;
  primary_goals: string;
  density: "compact" | "comfortable" | "spacious";
  preferred_metrics: string;
  accessibility: string;
  active_interface_id: string | null;
  onboarding_complete: 0 | 1;
  dismissed_suggestions: string;
  created_at: string;
  updated_at: string;
}

export type InterfaceKind = "personal" | "baseline" | "demo" | "template";

export interface InterfaceRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  kind: InterfaceKind;
  owner_id: string | null;
  is_default: 0 | 1;
  created_at: string;
  updated_at: string;
}

export type VersionSource =
  | "seed"
  | "ai"
  | "local-planner"
  | "manual"
  | "restore"
  | "undo"
  | "demo"
  | "template";

export interface InterfaceVersionRow {
  id: string;
  interface_id: string;
  workspace_id: string;
  version: number;
  config: string;
  summary: string;
  source: VersionSource;
  created_by: string | null;
  is_current: 0 | 1;
  created_at: string;
}

export type TransformationStatus =
  | "proposed"
  | "applied"
  | "discarded"
  | "rejected"
  | "failed"
  | "needs_review";

export interface TransformationRow {
  id: string;
  workspace_id: string;
  interface_id: string;
  user_id: string;
  prompt: string;
  engine: string;
  model: string | null;
  status: TransformationStatus;
  intent: string | null;
  operations: string | null;
  result_config: string | null;
  explanation: string | null;
  warnings: string;
  kind: string;
  result: string | null;
  error: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  applied_at: string | null;
}

export interface CompanyRow {
  id: string;
  workspace_id: string;
  name: string;
  industry: string;
  size: string;
  city: string | null;
  website: string | null;
  created_at: string;
}

export interface ContactRow {
  id: string;
  workspace_id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  title: string | null;
  created_at: string;
}

export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "converted";

export interface LeadRow {
  id: string;
  workspace_id: string;
  company_id: string | null;
  contact_id: string | null;
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: LeadStatus;
  score: number;
  owner_id: string | null;
  last_contacted_at: string | null;
  flagged: 0 | 1;
  flag_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type DealStage =
  | "prospecting"
  | "qualification"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export interface DealRow {
  id: string;
  workspace_id: string;
  company_id: string | null;
  lead_id: string | null;
  name: string;
  stage: DealStage;
  amount: number;
  probability: number;
  owner_id: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  workspace_id: string;
  title: string;
  notes: string | null;
  status: "open" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  assignee_id: string | null;
  related_type: "lead" | "deal" | "company" | "none" | null;
  related_id: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export type ActivityKind =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "task"
  | "stage_change"
  | "workflow"
  | "system";

export interface ActivityRow {
  id: string;
  workspace_id: string;
  kind: ActivityKind;
  subject: string;
  body: string | null;
  lead_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface WorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  enabled: 0 | 1;
  definition: string;
  trigger_type: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
}

export interface WorkflowRunRow {
  id: string;
  workspace_id: string;
  workflow_id: string;
  trigger_type: string;
  status: "success" | "partial" | "failed" | "skipped";
  matched: number;
  actions: string;
  log: string;
  dedupe_key: string | null;
  error: string | null;
  duration_ms: number;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  title: string;
  body: string;
  kind: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AiUsageRow {
  id: string;
  workspace_id: string;
  user_id: string;
  engine: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  ok: 0 | 1;
  created_at: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

export interface WorkspaceContext {
  workspace: WorkspaceRow;
  membership: MembershipRow;
  user: SessionUser;
  preferences: PreferencesRow;
  teammates: Array<SessionUser & { jobRole: JobRole; role: string }>;
}

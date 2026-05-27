CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES org_units(id) ON DELETE RESTRICT,
  name text NOT NULL,
  full_path text NOT NULL,
  level integer NOT NULL CHECK (level > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (full_path)
);

CREATE UNIQUE INDEX IF NOT EXISTS org_units_parent_name_idx
  ON org_units ((COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)), name);

CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_unit_id uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
  title text NOT NULL,
  planned_fte numeric(8,2) NOT NULL DEFAULT 0 CHECK (planned_fte >= 0),
  occupied_fte numeric(8,2) NOT NULL DEFAULT 0 CHECK (occupied_fte >= 0),
  is_supervisor boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_unit_id, title)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'manager', 'hr', 'moderator', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  position_id uuid NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  rate numeric(8,2) CHECK (rate IS NULL OR rate >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS assignments_unique_active_user_position_idx
  ON assignments (user_id, position_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS invitation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (token_hash)
);

CREATE TABLE IF NOT EXISTS interview_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'submitted')),
  answers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  last_saved_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type text NOT NULL CHECK (artifact_type IN ('job_instruction', 'org_unit_regulation', 'prof_standard_future', 'other')),
  title text NOT NULL,
  source_file_path text NOT NULL,
  source_file_name text NOT NULL,
  cleaned_text text NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'needs_review', 'archived', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_file_path, source_file_name)
);

CREATE TABLE IF NOT EXISTS artifact_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  relation_type text NOT NULL,
  link_confidence numeric(4,2) NOT NULL CHECK (link_confidence >= 0 AND link_confidence <= 1),
  review_status text NOT NULL DEFAULT 'needs_review' CHECK (review_status IN ('auto_accepted', 'needs_review', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, target_type, target_id, relation_type)
);

CREATE INDEX IF NOT EXISTS artifact_links_target_idx
  ON artifact_links (target_type, target_id);

CREATE TABLE IF NOT EXISTS expected_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  org_unit_id uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
  assignment_id uuid REFERENCES assignments(id) ON DELETE RESTRICT,
  profile_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'failed', 'stale')),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expected_profiles_current_idx
  ON expected_profiles (position_id, org_unit_id, is_current);

CREATE TABLE IF NOT EXISTS interview_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_run_id uuid NOT NULL REFERENCES interview_runs(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  profile_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'failed', 'stale')),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_profiles_current_idx
  ON interview_profiles (assignment_id, interview_run_id, is_current);

CREATE TABLE IF NOT EXISTS profile_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expected_profile_id uuid NOT NULL REFERENCES expected_profiles(id) ON DELETE RESTRICT,
  interview_profile_id uuid NOT NULL REFERENCES interview_profiles(id) ON DELETE RESTRICT,
  interview_run_id uuid NOT NULL REFERENCES interview_runs(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  result_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('pending', 'generated', 'failed', 'stale')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_unit_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_unit_id uuid NOT NULL REFERENCES org_units(id) ON DELETE CASCADE,
  reviewer_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  reviewer_position_id uuid REFERENCES positions(id) ON DELETE CASCADE,
  reviewer_role text NOT NULL CHECK (reviewer_role IN ('manager', 'deputy', 'hr_partner', 'observer')),
  include_child_units boolean NOT NULL DEFAULT true,
  can_view_interviews boolean NOT NULL DEFAULT true,
  can_view_comparisons boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reviewer_user_id IS NOT NULL OR reviewer_position_id IS NOT NULL)
);

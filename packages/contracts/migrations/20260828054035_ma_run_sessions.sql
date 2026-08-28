CREATE TABLE ma_run_sessions (
  run_id text PRIMARY KEY,
  ma_session_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

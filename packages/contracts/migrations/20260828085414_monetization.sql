CREATE TABLE credit_accounts (
  seller_id text PRIMARY KEY,
  balance integer NOT NULL DEFAULT 20 CHECK (balance >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_debit_decisions (
  id text PRIMARY KEY,
  seller_id text NOT NULL REFERENCES credit_accounts(seller_id),
  run_id text NOT NULL,
  idempotency_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('generate_design', 'deep_analysis')),
  cost integer NOT NULL CHECK (cost > 0),
  -- pending is an internal transaction claim and is never returned as a
  -- CreditDebitResult; the transaction finalizes it as applied or rejected.
  decision_status text NOT NULL DEFAULT 'pending'
    CHECK (decision_status IN ('pending', 'applied', 'rejected')),
  balance_before integer CHECK (balance_before >= 0),
  balance_after integer CHECK (balance_after >= 0),
  operation_status text NOT NULL DEFAULT 'not_started'
    CHECK (operation_status IN ('not_started', 'started', 'succeeded', 'failed_refunded')),
  operation_started_at timestamptz,
  operation_completed_at timestamptz,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, idempotency_key),
  UNIQUE (id, seller_id),
  CHECK (
    (decision_status = 'pending' AND balance_before IS NULL AND balance_after IS NULL)
    OR
    (decision_status = 'applied' AND balance_before IS NOT NULL AND balance_after IS NOT NULL AND balance_after = balance_before - cost)
    OR
    (decision_status = 'rejected' AND balance_before IS NOT NULL AND balance_after IS NOT NULL AND balance_after = balance_before)
  ),
  CHECK (decision_status = 'applied' OR operation_status = 'not_started'),
  CHECK (
    (operation_status = 'not_started' AND operation_started_at IS NULL AND operation_completed_at IS NULL)
    OR
    (operation_status = 'started' AND operation_started_at IS NOT NULL AND operation_completed_at IS NULL)
    OR
    (operation_status IN ('succeeded', 'failed_refunded') AND operation_started_at IS NOT NULL AND operation_completed_at IS NOT NULL)
  )
);

CREATE TABLE credit_ledger_entries (
  id text PRIMARY KEY,
  seller_id text NOT NULL REFERENCES credit_accounts(seller_id),
  entry_kind text NOT NULL CHECK (entry_kind IN ('grant', 'debit')),
  grant_reason text CHECK (grant_reason IN ('seed', 'refund')),
  action text CHECK (action IN ('generate_design', 'deep_analysis')),
  credits integer NOT NULL CHECK (credits > 0),
  idempotency_key text NOT NULL,
  debit_decision_id text REFERENCES credit_debit_decisions(id),
  original_debit_decision_id text REFERENCES credit_debit_decisions(id),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, idempotency_key),
  UNIQUE (debit_decision_id),
  UNIQUE (original_debit_decision_id),
  CHECK (
    (
      entry_kind = 'grant'
      AND grant_reason = 'seed'
      AND action IS NULL
      AND debit_decision_id IS NULL
      AND original_debit_decision_id IS NULL
    )
    OR
    (
      entry_kind = 'grant'
      AND grant_reason = 'refund'
      AND action IS NULL
      AND debit_decision_id IS NULL
      AND original_debit_decision_id IS NOT NULL
    )
    OR
    (
      entry_kind = 'debit'
      AND grant_reason IS NULL
      AND action IS NOT NULL
      AND debit_decision_id IS NOT NULL
      AND original_debit_decision_id IS NULL
    )
  )
);

CREATE TABLE publications (
  id text PRIMARY KEY,
  seller_id text NOT NULL,
  project_id text NOT NULL REFERENCES seller_projects(id),
  idempotency_key text NOT NULL,
  provider text NOT NULL DEFAULT 'printerval' CHECK (provider = 'printerval'),
  status text NOT NULL CHECK (status IN ('pending', 'published', 'failed')),
  -- MVP debt: replace the Seedream URL with a durable BytePlus TOS object key
  -- before enabling real Printerval publishing.
  design_asset_url text NOT NULL,
  design_title text NOT NULL,
  design_description text,
  design_tags jsonb,
  market text NOT NULL,
  product_type text NOT NULL,
  provider_publication_id text UNIQUE,
  published_url text,
  failure_code text CHECK (failure_code IN ('printerval_rejected', 'printerval_unavailable')),
  failure_recoverable boolean,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, idempotency_key),
  CHECK (
    (status = 'pending' AND failure_code IS NULL AND failure_recoverable IS NULL AND failure_message IS NULL)
    OR
    (status = 'published' AND provider_publication_id IS NOT NULL AND failure_code IS NULL AND failure_recoverable IS NULL AND failure_message IS NULL)
    OR
    (status = 'failed' AND failure_code IS NOT NULL AND failure_recoverable IS NOT NULL AND failure_message IS NOT NULL)
  )
);

CREATE UNIQUE INDEX credit_ledger_one_seed_grant_per_seller
  ON credit_ledger_entries (seller_id)
  WHERE entry_kind = 'grant' AND grant_reason = 'seed';

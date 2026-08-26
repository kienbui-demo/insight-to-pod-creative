CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE trend_cards (
  id text PRIMARY KEY,
  market text NOT NULL,
  seed text NOT NULL,
  product_type text,
  opportunity_score double precision NOT NULL
    CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
  confidence double precision NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),
  available_sources jsonb NOT NULL,
  missing_sources jsonb NOT NULL,
  trend_series jsonb NOT NULL,
  reference_images jsonb NOT NULL,
  competitors jsonb,
  recommendation jsonb NOT NULL,
  freshness_tier text NOT NULL
    CHECK (freshness_tier IN ('hot', 'warm', 'cold')),
  updated_at timestamptz NOT NULL,
  -- embedding dim 1024 = skylark-embedding-vision; change here if switching embedding model.
  embedding vector(1024)
);

CREATE TABLE seller_projects (
  id text PRIMARY KEY,
  seller_id text NOT NULL,
  market text NOT NULL,
  seed text NOT NULL,
  product_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

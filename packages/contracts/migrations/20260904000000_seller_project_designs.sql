ALTER TABLE seller_projects
  ADD COLUMN design_asset_url text,
  ADD COLUMN design_title text,
  ADD COLUMN design_description text,
  ADD COLUMN design_tags jsonb;

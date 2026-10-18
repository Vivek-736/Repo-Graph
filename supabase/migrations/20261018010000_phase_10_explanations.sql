-- Phase 10: Explanations caching and folder support
-- 1. Allow file_id to be nullable for folded folder explanations
alter table public.explanations alter column file_id drop not null;

-- 2. Add target_type ('file' | 'folder'), folder_path, and content_hash
alter table public.explanations add column if not exists target_type text not null default 'file';
alter table public.explanations add column if not exists folder_path text;
alter table public.explanations add column if not exists content_hash text;

-- 3. Indexes for fast cache lookups
create index if not exists idx_explanations_cache_file
  on public.explanations(analysis_id, target_type, content_hash, model);

create index if not exists idx_explanations_cache_folder
  on public.explanations(analysis_id, target_type, folder_path, model);

-- Phase 2 Migration: Multi-Tenant Architecture & Database Schema
-- 8 Tables: projects, analyses, files, edges, routes, explanations, file_roles, insights
-- Every table references organizations(id) on delete cascade
-- RLS policies enforced on all tables reading auth.jwt() ->> 'org_id'

create extension if not exists "pgcrypto";

-- Organizations table (parent table mapping Clerk org_id)
create table if not exists public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.organizations force row level security;

drop policy if exists "organizations_org_isolation" on public.organizations;
create policy "organizations_org_isolation" on public.organizations
  for all
  to authenticated
  using (id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

-- 1. Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  repo_url text not null,
  default_branch text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_organization_id on public.projects(organization_id);
alter table public.projects enable row level security;
alter table public.projects force row level security;

drop policy if exists "projects_org_isolation" on public.projects;
create policy "projects_org_isolation" on public.projects
  for all
  to authenticated
  using (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

-- 2. Analyses
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  commit_hash text,
  status text not null default 'pending', -- 'pending', 'fetching', 'parsing', 'completed', 'failed'
  failure_reason text,
  stage text,
  files_count integer not null default 0,
  edges_count integer not null default 0,
  routes_count integer not null default 0,
  coverage_percentage numeric(5,2),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analyses_organization_id on public.analyses(organization_id);
create index if not exists idx_analyses_project_id on public.analyses(project_id);
alter table public.analyses enable row level security;
alter table public.analyses force row level security;

drop policy if exists "analyses_org_isolation" on public.analyses;
create policy "analyses_org_isolation" on public.analyses
  for all
  to authenticated
  using (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

-- 3. Files
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  path text not null,
  folder text not null,
  extension text,
  lines_count integer not null default 0,
  content_hash text,
  fan_in integer not null default 0,
  fan_out integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_files_organization_id on public.files(organization_id);
create index if not exists idx_files_analysis_id on public.files(analysis_id);
create index if not exists idx_files_path on public.files(analysis_id, path);
alter table public.files enable row level security;
alter table public.files force row level security;

drop policy if exists "files_org_isolation" on public.files;
create policy "files_org_isolation" on public.files
  for all
  to authenticated
  using (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

-- 4. Edges
create table if not exists public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  source_file_id uuid not null references public.files(id) on delete cascade,
  target_file_id uuid references public.files(id) on delete cascade,
  kind text not null, -- 'import', 'reexport', 'dynamic'
  raw_specifier text not null,
  resolved boolean not null default true,
  unresolved_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_edges_organization_id on public.edges(organization_id);
create index if not exists idx_edges_analysis_id on public.edges(analysis_id);
create index if not exists idx_edges_source on public.edges(source_file_id);
create index if not exists idx_edges_target on public.edges(target_file_id);
alter table public.edges enable row level security;
alter table public.edges force row level security;

drop policy if exists "edges_org_isolation" on public.edges;
create policy "edges_org_isolation" on public.edges
  for all
  to authenticated
  using (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

-- 5. Routes
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  method text not null,
  path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_routes_organization_id on public.routes(organization_id);
create index if not exists idx_routes_analysis_id on public.routes(analysis_id);
alter table public.routes enable row level security;
alter table public.routes force row level security;

drop policy if exists "routes_org_isolation" on public.routes;
create policy "routes_org_isolation" on public.routes
  for all
  to authenticated
  using (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

-- 6. Explanations
create table if not exists public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  content text not null,
  model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_explanations_organization_id on public.explanations(organization_id);
create index if not exists idx_explanations_analysis_id on public.explanations(analysis_id);
create index if not exists idx_explanations_file_id on public.explanations(file_id);
alter table public.explanations enable row level security;
alter table public.explanations force row level security;

drop policy if exists "explanations_org_isolation" on public.explanations;
create policy "explanations_org_isolation" on public.explanations
  for all
  to authenticated
  using (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

-- 7. File Roles
create table if not exists public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  role text not null,
  confidence numeric(3,2) not null default 1.0,
  source text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_file_roles_organization_id on public.file_roles(organization_id);
create index if not exists idx_file_roles_analysis_id on public.file_roles(analysis_id);
create index if not exists idx_file_roles_file_id on public.file_roles(file_id);
alter table public.file_roles enable row level security;
alter table public.file_roles force row level security;

drop policy if exists "file_roles_org_isolation" on public.file_roles;
create policy "file_roles_org_isolation" on public.file_roles
  for all
  to authenticated
  using (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

-- 8. Insights
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  kind text not null,
  description text not null,
  file_id uuid references public.files(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_insights_organization_id on public.insights(organization_id);
create index if not exists idx_insights_analysis_id on public.insights(analysis_id);
alter table public.insights enable row level security;
alter table public.insights force row level security;

drop policy if exists "insights_org_isolation" on public.insights;
create policy "insights_org_isolation" on public.insights
  for all
  to authenticated
  using (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')));

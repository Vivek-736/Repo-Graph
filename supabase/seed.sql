-- Phase 2 Seed Data: Seeded rows for two distinct organizations
-- Demonstrates multi-tenant isolation via database RLS

-- 1. Insert Organizations
insert into public.organizations (id, name)
values 
  ('org_alpha', 'Alpha Systems'),
  ('org_beta', 'Beta Labs')
on conflict (id) do update set name = excluded.name;

-- 2. Insert Projects for both organizations
insert into public.projects (id, organization_id, name, repo_url, default_branch)
values
  ('11111111-1111-1111-1111-111111111111', 'org_alpha', 'repo-graph', 'https://github.com/vivek-736/repo-graph', 'main'),
  ('22222222-2222-2222-2222-222222222222', 'org_beta', 'syntax-flow', 'https://github.com/example/syntax-flow', 'main')
on conflict (id) do nothing;

-- 3. Insert Analyses for both organizations
insert into public.analyses (
  id, organization_id, project_id, commit_hash, status, stage, files_count, edges_count, routes_count, coverage_percentage, summary
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'org_alpha',
    '11111111-1111-1111-1111-111111111111',
    '3bf99e1',
    'completed',
    'completed',
    42,
    89,
    4,
    98.50,
    'Initial full parse: 42 files discovered, Next.js framework detected'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'org_alpha',
    '11111111-1111-1111-1111-111111111111',
    'dae1594',
    'parsing',
    'parsing_dependencies',
    38,
    72,
    3,
    85.00,
    'Parsing in progress: resolving barrel files and re-exports'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'org_beta',
    '22222222-2222-2222-2222-222222222222',
    '9988776',
    'completed',
    'completed',
    115,
    320,
    12,
    99.20,
    'Complete AST mapping: 115 modules indexed'
  )
on conflict (id) do nothing;

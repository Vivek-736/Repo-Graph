-- Phase 7 Migration: Realtime Stage Broadcasting & Channel Authorization

-- 1. Trigger function publishing stage and status over Realtime broadcast
create or replace function public.broadcast_analysis_stage_changes()
returns trigger
security definer
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_payload jsonb;
begin
  -- Publish stage, status and reason, not the whole row
  v_payload := jsonb_build_object(
    'analysis_id', NEW.id,
    'status', NEW.status,
    'stage', NEW.stage,
    'failure_reason', NEW.failure_reason,
    'commit_hash', NEW.commit_hash,
    'files_count', NEW.files_count,
    'edges_count', NEW.edges_count,
    'coverage_percentage', NEW.coverage_percentage
  );

  perform realtime.send(
    v_payload,
    'stage_change',
    'analysis:' || NEW.id::text,
    true -- private channel requiring authorization
  );
  return null;
end;
$$;

-- 2. Trigger on public.analyses
drop trigger if exists trigger_analysis_stage_changes on public.analyses;
create trigger trigger_analysis_stage_changes
after insert or update on public.analyses
for each row
when (
  tg_op = 'INSERT' or
  new.stage is distinct from old.stage or
  new.status is distinct from old.status
)
execute function public.broadcast_analysis_stage_changes();

-- 3. Channel authorization policy on realtime.messages
-- Who may subscribe is a policy: an organization can only receive broadcasts for its own analyses.
drop policy if exists "analysis_realtime_broadcast_select" on "realtime"."messages";
create policy "analysis_realtime_broadcast_select"
on "realtime"."messages"
for select
to authenticated
using (
  exists (
    select 1
    from public.analyses a
    where ('analysis:' || a.id::text) = (select realtime.topic())
      and a.organization_id = (select coalesce(auth.jwt() ->> 'org_id', current_setting('request.jwt.claims', true)::jsonb ->> 'org_id'))
      and realtime.messages.extension in ('broadcast')
  )
);
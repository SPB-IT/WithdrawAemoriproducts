-- Store the database time at which a requisition becomes approved.
alter table public.requisitions
  add column if not exists approved_at timestamptz;

comment on column public.requisitions.approved_at is
  'Database timestamp when the requisition most recently changed to approved';

-- Historical rows do not have a recoverable approval time. Use their request
-- creation time as the closest available fallback so reports are not left blank.
update public.requisitions
set approved_at = created_at
where status = 'approved'
  and approved_at is null;

create or replace function public.set_requisition_approved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at = now();
  elsif new.status is distinct from 'approved' then
    new.approved_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists requisitions_set_approved_at on public.requisitions;
create trigger requisitions_set_approved_at
before update of status on public.requisitions
for each row
execute function public.set_requisition_approved_at();

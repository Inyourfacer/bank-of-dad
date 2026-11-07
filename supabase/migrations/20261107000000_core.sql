-- Bank of Dad: core schema (Phase 2)
--
-- Access model (docs/DESIGN.md §9.4):
--   parent: full read/write on their family's data.
--   device: shared login on kids' devices; read-only here (plus the PIN and
--           open-account functions). Withdrawal requests arrive in Phase 3.
-- Business rules that keep the ledger consistent with the interest engine:
--   * Once an account is open, ledger entries can only be added or removed in
--     the current month (past months' Paydays are final).
--   * Rate changes can only take effect today or later.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  time_zone text not null default 'UTC',
  regular_bank_apy numeric(7, 6) not null default 0.005 check (regular_bank_apy between 0 and 0.5),
  cd_bonus_monthly_rate numeric(7, 6) not null default 0.01 check (cd_bonus_monthly_rate between 0 and 0.2),
  loan_monthly_rate numeric(7, 6) not null default 0.03 check (loan_monthly_rate between 0 and 0.2),
  created_at timestamptz not null default now()
);

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  role text not null check (role in ('parent', 'device')),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create index members_family_idx on public.members (family_id);

create table public.kids (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  avatar text not null default '🐷' check (length(avatar) between 1 and 16),
  mode text not null default 'standard' check (mode in ('junior', 'standard')),
  -- Rate template, turned into rate_periods when the account opens.
  intro_monthly_rate numeric(7, 6) not null default 0.02 check (intro_monthly_rate between 0 and 0.2),
  intro_months int not null default 3 check (intro_months between 0 and 24),
  ongoing_monthly_rate numeric(7, 6) not null default 0.01 check (ongoing_monthly_rate between 0 and 0.2),
  -- Set on the kid's first login (open_account). Interest starts this day.
  account_opened_on date,
  created_at timestamptz not null default now(),
  unique (family_id, name)
);
create index kids_family_idx on public.kids (family_id);

-- Hashed PINs live apart from kids so no client can ever select them.
create table public.kid_pins (
  kid_id uuid primary key references public.kids (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.rate_periods (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  effective_from date not null,
  monthly_rate numeric(7, 6) not null check (monthly_rate between 0 and 0.2),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kid_id, effective_from)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal', 'interest', 'adjustment')),
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000),
  occurred_on date not null,
  note text check (note is null or length(note) <= 200),
  -- First day of the month an interest payment was earned in.
  period_month date check (period_month is null or extract(day from period_month) = 1),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (kind <> 'deposit' or amount_cents > 0),
  check (kind <> 'withdrawal' or amount_cents < 0),
  check (kind <> 'interest' or amount_cents > 0),
  check ((kind = 'interest') = (period_month is not null))
);
create index transactions_kid_idx on public.transactions (kid_id, occurred_on);
create unique index transactions_one_payday_per_month on public.transactions (kid_id, period_month)
  where kind = 'interest';

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies can read members without recursion)
-- ---------------------------------------------------------------------------

create function public.my_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select family_id from public.members where user_id = auth.uid()
$$;

create function public.is_parent() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where user_id = auth.uid() and role = 'parent')
$$;

create function public.kid_family_id(p_kid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select family_id from public.kids where id = p_kid
$$;

create function public.family_today(p_family uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone time_zone)::date from public.families where id = p_family
$$;

-- ---------------------------------------------------------------------------
-- Business rules
-- ---------------------------------------------------------------------------

create function public.check_transaction_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record := coalesce(new, old);
  opened date;
  today date;
begin
  if r.kind = 'interest' then
    return r; -- Paydays are posted by the server job (service role).
  end if;

  select k.account_opened_on, public.family_today(k.family_id)
    into opened, today
    from public.kids k where k.id = r.kid_id;
  if not found then
    return r; -- the kid is being deleted (cascade)
  end if;

  if tg_op = 'INSERT' and r.occurred_on > today then
    raise exception 'Transactions can''t be dated in the future.' using errcode = 'check_violation';
  end if;

  if opened is not null and r.occurred_on < date_trunc('month', today)::date then
    raise exception 'That month''s Payday is final. Use a date in the current month, or record an adjustment.'
      using errcode = 'check_violation';
  end if;

  return r;
end;
$$;

create trigger transactions_dates
  before insert or delete on public.transactions
  for each row execute function public.check_transaction_dates();

create function public.check_rate_period() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record := coalesce(new, old);
  opened date;
  today date;
begin
  select k.account_opened_on, public.family_today(k.family_id)
    into opened, today
    from public.kids k where k.id = r.kid_id;
  if not found then
    return r; -- the kid is being deleted (cascade)
  end if;

  if opened is null then
    raise exception 'This account isn''t open yet. Edit the starting rates instead.' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' and r.effective_from < today then
    raise exception 'Rate changes can only start today or later.' using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' and r.effective_from <= today then
    raise exception 'Rates already in effect can''t be removed. Add a new rate change instead.'
      using errcode = 'check_violation';
  end if;

  return r;
end;
$$;

create trigger rate_periods_rules
  before insert or delete on public.rate_periods
  for each row execute function public.check_rate_period();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.kids enable row level security;
alter table public.kid_pins enable row level security; -- no policies: functions only
alter table public.rate_periods enable row level security;
alter table public.transactions enable row level security;

create policy "family can read" on public.families
  for select to authenticated using (id = public.my_family_id());
create policy "parents can update" on public.families
  for update to authenticated
  using (id = public.my_family_id() and public.is_parent())
  with check (id = public.my_family_id());

create policy "family can read" on public.members
  for select to authenticated using (family_id = public.my_family_id());

create policy "family can read" on public.kids
  for select to authenticated using (family_id = public.my_family_id());
create policy "parents can add" on public.kids
  for insert to authenticated with check (family_id = public.my_family_id() and public.is_parent());
create policy "parents can update" on public.kids
  for update to authenticated
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id());
create policy "parents can delete" on public.kids
  for delete to authenticated using (family_id = public.my_family_id() and public.is_parent());

create policy "family can read" on public.rate_periods
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
create policy "parents can add" on public.rate_periods
  for insert to authenticated
  with check (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent());
create policy "parents can delete" on public.rate_periods
  for delete to authenticated
  using (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent());

create policy "family can read" on public.transactions
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
create policy "parents can add" on public.transactions
  for insert to authenticated
  with check (
    public.kid_family_id(kid_id) = public.my_family_id()
    and public.is_parent()
    and kind in ('deposit', 'withdrawal', 'adjustment')
    and created_by = auth.uid()
  );
create policy "parents can delete" on public.transactions
  for delete to authenticated
  using (
    public.kid_family_id(kid_id) = public.my_family_id()
    and public.is_parent()
    and kind <> 'interest'
  );

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; column-limited writes for signed-in users.
-- ---------------------------------------------------------------------------

revoke all on public.families, public.members, public.kids, public.kid_pins,
  public.rate_periods, public.transactions from anon, authenticated;

grant select on public.families, public.members, public.kids, public.rate_periods, public.transactions
  to authenticated;
grant update (name, time_zone, regular_bank_apy, cd_bonus_monthly_rate, loan_monthly_rate)
  on public.families to authenticated;
grant insert (family_id, name, avatar, mode, intro_monthly_rate, intro_months, ongoing_monthly_rate),
  update (name, avatar, mode, intro_monthly_rate, intro_months, ongoing_monthly_rate),
  delete
  on public.kids to authenticated;
grant insert (kid_id, effective_from, monthly_rate), delete on public.rate_periods to authenticated;
grant insert (kid_id, kind, amount_cents, occurred_on, note), delete on public.transactions to authenticated;

-- ---------------------------------------------------------------------------
-- Functions (RPCs)
-- ---------------------------------------------------------------------------

-- First parent sets up the family. Sign-ups are disabled in Supabase, so only
-- users a parent invited from the dashboard can ever reach this.
create function public.create_family(p_name text, p_display_name text, p_time_zone text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'You already belong to a family.' using errcode = 'unique_violation';
  end if;
  perform now() at time zone p_time_zone; -- rejects unknown zones

  insert into public.families (name, time_zone) values (p_name, p_time_zone) returning id into fid;
  insert into public.members (user_id, family_id, role, display_name)
    values (auth.uid(), fid, 'parent', p_display_name);
  return fid;
end;
$$;

-- Adds an existing Supabase user (invited from the dashboard) to the family.
create function public.add_family_member(p_email text, p_role text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if not public.is_parent() then
    raise exception 'Only parents can add family members.' using errcode = 'insufficient_privilege';
  end if;
  if p_role not in ('parent', 'device') then
    raise exception 'Role must be parent or device.' using errcode = 'check_violation';
  end if;

  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'No user with that email. Create or invite them in Supabase (Authentication → Users) first.'
      using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    raise exception 'That user already belongs to a family.' using errcode = 'unique_violation';
  end if;

  insert into public.members (user_id, family_id, role, display_name)
    values (uid, public.my_family_id(), p_role, p_display_name);
  return uid;
end;
$$;

create function public.remove_family_member(p_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_parent() then
    raise exception 'Only parents can remove family members.' using errcode = 'insufficient_privilege';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You can''t remove yourself.' using errcode = 'check_violation';
  end if;
  delete from public.members where user_id = p_user_id and family_id = public.my_family_id();
end;
$$;

create function public.set_kid_pin(p_kid uuid, p_pin text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_parent() or public.kid_family_id(p_kid) is distinct from public.my_family_id() then
    raise exception 'Only parents can set PINs.' using errcode = 'insufficient_privilege';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be 4 digits.' using errcode = 'check_violation';
  end if;

  insert into public.kid_pins (kid_id, pin_hash)
    values (p_kid, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (kid_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end;
$$;

-- Which of my family's kids have a PIN set (hashes are never exposed).
create function public.kids_with_pin()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.kid_id from public.kid_pins p
  join public.kids k on k.id = p.kid_id
  where k.family_id = public.my_family_id()
$$;

-- Returns 'ok' | 'wrong' | 'locked' | 'no_pin'. Never raises on a wrong PIN, so
-- the failed-attempt counter is saved. 5 misses lock the profile for 1 minute.
create function public.verify_kid_pin(p_kid uuid, p_pin text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.kid_pins;
begin
  if public.kid_family_id(p_kid) is distinct from public.my_family_id() then
    raise exception 'Not your family.' using errcode = 'insufficient_privilege';
  end if;

  select * into p from public.kid_pins where kid_id = p_kid for update;
  if not found then
    return 'no_pin';
  end if;
  if p.locked_until is not null and p.locked_until > now() then
    return 'locked';
  end if;

  if p.pin_hash = extensions.crypt(p_pin, p.pin_hash) then
    update public.kid_pins set failed_attempts = 0, locked_until = null where kid_id = p_kid;
    return 'ok';
  end if;

  update public.kid_pins
    set failed_attempts = case when p.failed_attempts + 1 >= 5 then 0 else p.failed_attempts + 1 end,
        locked_until = case when p.failed_attempts + 1 >= 5 then now() + interval '1 minute' else null end
    where kid_id = p_kid;
  return case when p.failed_attempts + 1 >= 5 then 'locked' else 'wrong' end;
end;
$$;

-- Opens a kid's account on their first login. Idempotent: returns the
-- existing open date if already open. Creates the rate schedule from the
-- kid's rate template (intro rate for N months, then the ongoing rate).
create function public.open_account(p_kid uuid)
returns date
language plpgsql security definer set search_path = '' as $$
declare
  k public.kids;
  today date;
begin
  select * into k from public.kids where id = p_kid for update;
  if not found or k.family_id is distinct from public.my_family_id() then
    raise exception 'Not your family.' using errcode = 'insufficient_privilege';
  end if;
  if k.account_opened_on is not null then
    return k.account_opened_on;
  end if;

  today := public.family_today(k.family_id);
  -- Open first, so the starting rates pass the normal "today or later" rule.
  update public.kids set account_opened_on = today where id = k.id;

  if k.intro_months > 0 then
    insert into public.rate_periods (kid_id, effective_from, monthly_rate)
      values (k.id, today, k.intro_monthly_rate);
  end if;
  insert into public.rate_periods (kid_id, effective_from, monthly_rate)
    values (k.id, (today + make_interval(months => k.intro_months))::date, k.ongoing_monthly_rate);

  return today;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.my_family_id(),
  public.is_parent(),
  public.kid_family_id(uuid),
  public.family_today(uuid),
  public.create_family(text, text, text),
  public.add_family_member(text, text, text),
  public.remove_family_member(uuid),
  public.set_kid_pin(uuid, text),
  public.kids_with_pin(),
  public.verify_kid_pin(uuid, text),
  public.open_account(uuid)
to authenticated;

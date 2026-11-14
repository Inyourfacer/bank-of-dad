-- Bank of Dad: CDs (locked savings) and loans from Dad.
--
-- CDs: lock money from savings for 3, 6 or 12 months at the kid's current
-- rate plus the family's CD bonus (compounded monthly). At maturity it pays
-- back into savings; breaking early pays the base rate only.
--
-- Loans: a kid asks to borrow; a parent approves and hands over the cash.
-- The balance grows at the family's loan rate (charged at month end, worked
-- out in the app like savings interest). Kids repay from savings or the Spend
-- jar; parents can record cash payments.
--
-- Money only moves "today", so past months stay final in the ledger.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Ledger money in the account (deposits, withdrawals, posted interest). This
-- is never more than the real balance, which also has this month's interest,
-- so it's a safe ceiling for locking or spending savings.
create function public.ledger_balance(p_kid uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0) from public.transactions where kid_id = p_kid
$$;

-- Kid actions pass a PIN; parents pass null. Returns 'ok' or a PIN status.
create function public.check_kid_or_parent(p_kid uuid, p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin is null then
    if not public.is_parent() or public.kid_family_id(p_kid) is distinct from public.my_family_id() then
      raise exception 'Only parents can do that without a PIN.' using errcode = 'insufficient_privilege';
    end if;
    return 'ok';
  end if;
  return public.check_kid_pin(p_kid, p_pin);
end;
$$;

-- Whole months from a to b (a month counts once its day comes round; Jan 31
-- + 1 month = Feb 28). Matches fullMonthsBetween in src/engine/cd.ts.
create function public.full_months(a date, b date) returns int
language plpgsql immutable as $$
declare
  m int := 0;
begin
  if b <= a then
    return 0;
  end if;
  while (a + make_interval(months => m + 1))::date <= b loop
    m := m + 1;
  end loop;
  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- CDs
-- ---------------------------------------------------------------------------
create table public.cds (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  principal_cents bigint not null check (principal_cents > 0 and principal_cents <= 100000000),
  base_monthly_rate numeric(7, 6) not null check (base_monthly_rate between 0 and 0.2),
  bonus_monthly_rate numeric(7, 6) not null check (bonus_monthly_rate between 0 and 0.2),
  term_months int not null check (term_months in (3, 6, 12)),
  opened_on date not null,
  matures_on date not null,
  status text not null default 'open' check (status in ('open', 'matured', 'broken')),
  closed_on date,
  payout_cents bigint,
  created_at timestamptz not null default now()
);
create index cds_kid_idx on public.cds (kid_id);

alter table public.cds enable row level security;
create policy "family can read" on public.cds
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
revoke all on public.cds from anon, authenticated;
grant select on public.cds to authenticated;

-- Lock money in a CD. Returns {"status": ..., "id": ...}.
create function public.open_cd(p_kid uuid, p_pin text, p_cents bigint, p_months int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s text := public.check_kid_or_parent(p_kid, p_pin);
  k public.kids;
  today date;
  base numeric;
  bonus numeric;
  cid uuid;
begin
  if s <> 'ok' then
    return jsonb_build_object('status', s, 'id', null);
  end if;
  select * into k from public.kids where id = p_kid for update;
  if k.account_opened_on is null then
    raise exception 'The account isn''t open yet.' using errcode = 'check_violation';
  end if;
  if p_months not in (3, 6, 12) then
    raise exception 'Choose 3, 6 or 12 months.' using errcode = 'check_violation';
  end if;
  if p_cents is null or p_cents <= 0 then
    raise exception 'Enter an amount.' using errcode = 'check_violation';
  end if;
  if p_cents > public.ledger_balance(p_kid) then
    raise exception 'You can lock up to % right now.', to_char(public.ledger_balance(p_kid) / 100.0, 'FM$999999990.00')
      using errcode = 'check_violation';
  end if;

  today := public.family_today(k.family_id);
  select monthly_rate into base from public.rate_periods
    where kid_id = p_kid and effective_from <= today order by effective_from desc limit 1;
  select cd_bonus_monthly_rate into bonus from public.families where id = k.family_id;

  insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note)
    values (p_kid, 'adjustment', -p_cents, today, 'Locked in a CD');
  insert into public.cds (kid_id, principal_cents, base_monthly_rate, bonus_monthly_rate, term_months, opened_on, matures_on)
    values (p_kid, p_cents, coalesce(base, 0), coalesce(bonus, 0), p_months, today, (today + make_interval(months => p_months))::date)
    returning id into cid;
  return jsonb_build_object('status', 'ok', 'id', cid);
end;
$$;

-- Break a CD early: base rate only for the whole months so far.
create function public.break_cd(p_kid uuid, p_pin text, p_cd uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s text := public.check_kid_or_parent(p_kid, p_pin);
  c public.cds;
  today date;
  payout bigint;
begin
  if s <> 'ok' then
    return jsonb_build_object('status', s);
  end if;
  select * into c from public.cds where id = p_cd and kid_id = p_kid for update;
  if not found or c.status <> 'open' then
    raise exception 'That CD isn''t open.' using errcode = 'check_violation';
  end if;
  today := public.family_today(public.kid_family_id(p_kid));
  if today >= c.matures_on then
    raise exception 'That CD has matured. It pays out in full.' using errcode = 'check_violation';
  end if;
  payout := round(c.principal_cents * power(1 + c.base_monthly_rate, public.full_months(c.opened_on, today)));
  insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note)
    values (p_kid, 'adjustment', payout, today, 'CD broken early');
  update public.cds set status = 'broken', closed_on = today, payout_cents = payout where id = p_cd;
  return jsonb_build_object('status', 'ok', 'payout_cents', payout);
end;
$$;

-- Pay out a matured CD (base + bonus for the full term) into savings.
-- Any family member can trigger it (the app does on load); so can the daily job.
create function public.collect_cd(p_cd uuid)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  c public.cds;
  today date;
  payout bigint;
begin
  select * into c from public.cds where id = p_cd for update;
  if not found then
    raise exception 'CD not found.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and public.kid_family_id(c.kid_id) is distinct from public.my_family_id() then
    raise exception 'Not your family.' using errcode = 'insufficient_privilege';
  end if;
  if c.status <> 'open' then
    return c.payout_cents; -- already paid out
  end if;
  today := public.family_today(public.kid_family_id(c.kid_id));
  if today < c.matures_on then
    raise exception 'That CD matures on %.', c.matures_on using errcode = 'check_violation';
  end if;
  payout := round(c.principal_cents * power(1 + c.base_monthly_rate + c.bonus_monthly_rate, c.term_months));
  insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note)
    values (c.kid_id, 'adjustment', payout, today, 'CD matured');
  update public.cds set status = 'matured', closed_on = today, payout_cents = payout where id = p_cd;
  return payout;
end;
$$;

-- ---------------------------------------------------------------------------
-- Loans
-- ---------------------------------------------------------------------------
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  principal_cents bigint not null check (principal_cents > 0 and principal_cents <= 100000000),
  monthly_rate numeric(7, 6) not null check (monthly_rate between 0 and 0.2),
  purpose text check (purpose is null or length(purpose) <= 200),
  status text not null default 'pending' check (status in ('pending', 'active', 'denied', 'cancelled')),
  started_on date,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index loans_kid_idx on public.loans (kid_id);

create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  kid_id uuid not null references public.kids (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  paid_on date not null,
  source text not null check (source in ('savings', 'spend', 'cash')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index loan_payments_loan_idx on public.loan_payments (loan_id);

alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;
create policy "family can read" on public.loans
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
create policy "family can read" on public.loan_payments
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
revoke all on public.loans, public.loan_payments from anon, authenticated;
grant select on public.loans, public.loan_payments to authenticated;

-- A kid asks to borrow (one loan at a time).
create function public.request_loan(p_kid uuid, p_pin text, p_cents bigint, p_purpose text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s text := public.check_kid_pin(p_kid, p_pin);
  rate numeric;
begin
  if s <> 'ok' then
    return jsonb_build_object('status', s);
  end if;
  if p_cents is null or p_cents <= 0 then
    raise exception 'Enter an amount.' using errcode = 'check_violation';
  end if;
  perform 1 from public.kids where id = p_kid for update;
  if exists (select 1 from public.loans where kid_id = p_kid and status in ('pending', 'active')
             and not public.loan_is_paid(id)) then
    raise exception 'You already have a loan. Pay it off first.' using errcode = 'check_violation';
  end if;
  select loan_monthly_rate into rate from public.families where id = public.kid_family_id(p_kid);
  insert into public.loans (kid_id, principal_cents, monthly_rate, purpose)
    values (p_kid, p_cents, coalesce(rate, 0.03), nullif(trim(p_purpose), ''));
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.cancel_loan(p_kid uuid, p_pin text, p_loan uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s text := public.check_kid_pin(p_kid, p_pin);
begin
  if s <> 'ok' then
    return jsonb_build_object('status', s);
  end if;
  update public.loans set status = 'cancelled', decided_at = now()
    where id = p_loan and kid_id = p_kid and status = 'pending';
  if not found then
    raise exception 'That request isn''t waiting anymore.' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.decide_loan(p_loan uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.loans;
begin
  select * into l from public.loans where id = p_loan for update;
  if not found or not public.is_parent() or public.kid_family_id(l.kid_id) is distinct from public.my_family_id() then
    raise exception 'Only parents can decide loans.' using errcode = 'insufficient_privilege';
  end if;
  if l.status <> 'pending' then
    raise exception 'That loan was already %.', l.status using errcode = 'check_violation';
  end if;
  update public.loans
    set status = case when p_approve then 'active' else 'denied' end,
        started_on = case when p_approve then public.family_today(public.kid_family_id(l.kid_id)) end,
        decided_by = auth.uid(),
        decided_at = now()
    where id = p_loan;
end;
$$;

-- A generous ceiling on what's owed: principal grown one month past today,
-- minus payments. (The exact balance is worked out in the app.)
create function public.loan_ceiling(p_loan uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select ceil(l.principal_cents * power(1 + l.monthly_rate,
           public.full_months(l.started_on, public.family_today(public.kid_family_id(l.kid_id))) + 1))::bigint
         - coalesce((select sum(amount_cents) from public.loan_payments p where p.loan_id = l.id), 0)
  from public.loans l where l.id = p_loan
$$;

-- Paid off: payments cover the principal grown for every month so far.
create function public.loan_is_paid(p_loan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select l.status = 'active'
     and coalesce((select sum(amount_cents) from public.loan_payments p where p.loan_id = l.id), 0)
         >= floor(l.principal_cents * power(1 + l.monthly_rate,
              public.full_months(l.started_on, public.family_today(public.kid_family_id(l.kid_id)))))
  from public.loans l where l.id = p_loan
$$;

-- Pay toward a loan. Kids (PIN) pay from savings or the Spend jar; parents
-- (no PIN) can also record cash.
create function public.pay_loan(p_kid uuid, p_pin text, p_loan uuid, p_cents bigint, p_source text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s text := public.check_kid_or_parent(p_kid, p_pin);
  l public.loans;
  today date;
begin
  if s <> 'ok' then
    return jsonb_build_object('status', s);
  end if;
  select * into l from public.loans where id = p_loan and kid_id = p_kid for update;
  if not found or l.status <> 'active' then
    raise exception 'That loan isn''t active.' using errcode = 'check_violation';
  end if;
  if p_source not in ('savings', 'spend', 'cash') or (p_source = 'cash' and p_pin is not null) then
    raise exception 'Pay from savings or the Spend jar.' using errcode = 'check_violation';
  end if;
  if p_cents is null or p_cents <= 0 then
    raise exception 'Enter an amount.' using errcode = 'check_violation';
  end if;
  if p_cents > public.loan_ceiling(p_loan) then
    raise exception 'That''s more than you owe.' using errcode = 'check_violation';
  end if;

  today := public.family_today(public.kid_family_id(p_kid));
  if p_source = 'savings' then
    if p_cents > public.ledger_balance(p_kid) then
      raise exception 'Your savings don''t have that much right now.' using errcode = 'check_violation';
    end if;
    insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note)
      values (p_kid, 'adjustment', -p_cents, today, 'Loan payment');
  elsif p_source = 'spend' then
    insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on, note)
      values (p_kid, 'spend', -p_cents, today, 'Loan payment');
  end if;
  insert into public.loan_payments (loan_id, kid_id, amount_cents, paid_on, source)
    values (p_loan, p_kid, p_cents, today, p_source);
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges (Supabase grants new functions to its API roles by default).
-- ---------------------------------------------------------------------------
revoke execute on function
  public.ledger_balance(uuid),
  public.check_kid_or_parent(uuid, text),
  public.full_months(date, date),
  public.loan_ceiling(uuid),
  public.loan_is_paid(uuid),
  public.open_cd(uuid, text, bigint, int),
  public.break_cd(uuid, text, uuid),
  public.collect_cd(uuid),
  public.request_loan(uuid, text, bigint, text),
  public.cancel_loan(uuid, text, uuid),
  public.decide_loan(uuid, boolean),
  public.pay_loan(uuid, text, uuid, bigint, text)
from public, anon;
revoke execute on function
  public.ledger_balance(uuid),
  public.check_kid_or_parent(uuid, text),
  public.loan_ceiling(uuid),
  public.loan_is_paid(uuid)
from authenticated;
grant execute on function
  public.open_cd(uuid, text, bigint, int),
  public.break_cd(uuid, text, uuid),
  public.collect_cd(uuid),
  public.request_loan(uuid, text, bigint, text),
  public.cancel_loan(uuid, text, uuid),
  public.decide_loan(uuid, boolean),
  public.pay_loan(uuid, text, uuid, bigint, text)
to authenticated;
grant execute on function public.collect_cd(uuid) to service_role;

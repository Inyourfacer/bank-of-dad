-- Bank of Dad: pay and expenses (pay stubs).
--
-- Each kid can have a pretend monthly salary. Taxes (the family's brackets)
-- and living expenses come out of it, and only the take-home pay is real money:
-- it's deposited into the kid's account on payday. Kids see the pay stub.
--
-- The app computes the stub (src/engine/paycheck.ts); post_paycheck checks the
-- math and records the stub and the deposit together.

-- ---------------------------------------------------------------------------
-- Family tax brackets: [{"up_to_cents": 2000 | null, "rate": 0.10}, ...]
-- ---------------------------------------------------------------------------
alter table public.families
  add column tax_brackets jsonb not null
    default '[{"up_to_cents": 2000, "rate": 0.10}, {"up_to_cents": 6000, "rate": 0.15}, {"up_to_cents": null, "rate": 0.22}]'::jsonb
    check (jsonb_typeof(tax_brackets) = 'array' and jsonb_array_length(tax_brackets) <= 10);
grant update (tax_brackets) on public.families to authenticated;

-- ---------------------------------------------------------------------------
-- Pay plans: one per kid.
-- ---------------------------------------------------------------------------
create table public.pay_plans (
  kid_id uuid primary key references public.kids (id) on delete cascade,
  enabled boolean not null default false,
  salary_cents bigint not null default 10000 check (salary_cents between 0 and 10000000),
  pay_day int not null default 1 check (pay_day between 1 and 28),
  -- [{"name": "Rent", "cents": 4000}, ...]
  expenses jsonb not null default '[]'::jsonb
    check (jsonb_typeof(expenses) = 'array' and jsonb_array_length(expenses) <= 20),
  updated_at timestamptz not null default now()
);

alter table public.pay_plans enable row level security;
create policy "family can read" on public.pay_plans
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
create policy "parents can add" on public.pay_plans
  for insert to authenticated with check (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent());
create policy "parents can update" on public.pay_plans
  for update to authenticated
  using (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent())
  with check (public.kid_family_id(kid_id) = public.my_family_id());
create policy "parents can delete" on public.pay_plans
  for delete to authenticated using (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent());

revoke all on public.pay_plans from anon, authenticated;
grant select, delete on public.pay_plans to authenticated;
grant insert (kid_id, enabled, salary_cents, pay_day, expenses),
  update (enabled, salary_cents, pay_day, expenses, updated_at)
  on public.pay_plans to authenticated;

-- ---------------------------------------------------------------------------
-- Pay stubs: one per kid per month. Written only by post_paycheck.
-- ---------------------------------------------------------------------------
create table public.pay_statements (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  pay_month date not null check (extract(day from pay_month) = 1),
  paid_on date not null,
  gross_cents bigint not null check (gross_cents >= 0),
  -- [{"label": "10% on the first $20", "cents": 200}, ...]
  taxes jsonb not null check (jsonb_typeof(taxes) = 'array'),
  expenses jsonb not null check (jsonb_typeof(expenses) = 'array'),
  net_cents bigint not null check (net_cents >= 0),
  -- Deleting the take-home deposit (a mistake this month) removes the stub too,
  -- so the month can be paid again.
  transaction_id uuid references public.transactions (id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kid_id, pay_month),
  check (paid_on >= pay_month and paid_on < (pay_month + interval '1 month')::date)
);

alter table public.pay_statements enable row level security;
create policy "family can read" on public.pay_statements
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
revoke all on public.pay_statements from anon, authenticated;
grant select on public.pay_statements to authenticated;

-- ---------------------------------------------------------------------------
-- post_paycheck: records a month's pay stub and deposits the take-home pay.
-- Callable by a parent of the kid's family ("Pay now") or by the daily job
-- (service role). Checks that the stub adds up.
-- ---------------------------------------------------------------------------
create function public.post_paycheck(
  p_kid uuid,
  p_pay_month date,
  p_paid_on date,
  p_gross_cents bigint,
  p_taxes jsonb,
  p_expenses jsonb,
  p_net_cents bigint
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tax_sum bigint;
  expense_sum bigint;
  tid uuid;
  sid uuid;
begin
  -- A signed-in caller must be a parent in this kid's family. (The daily job
  -- runs with the service role, which has no signed-in user; anon can't call.)
  if auth.uid() is not null
     and (not public.is_parent() or public.kid_family_id(p_kid) is distinct from public.my_family_id()) then
    raise exception 'Only parents can pay a salary.' using errcode = 'insufficient_privilege';
  end if;
  if public.kid_family_id(p_kid) is null then
    raise exception 'Kid not found.' using errcode = 'no_data_found';
  end if;
  if extract(day from p_pay_month) <> 1 then
    raise exception 'Pay month must be the first day of a month.' using errcode = 'check_violation';
  end if;
  if p_paid_on < p_pay_month or p_paid_on >= (p_pay_month + interval '1 month')::date then
    raise exception 'Payday must fall in the pay month.' using errcode = 'check_violation';
  end if;

  select coalesce(sum((x->>'cents')::bigint), 0) into tax_sum from jsonb_array_elements(p_taxes) x;
  select coalesce(sum((x->>'cents')::bigint), 0) into expense_sum from jsonb_array_elements(p_expenses) x;
  if tax_sum < 0 or expense_sum < 0 or p_gross_cents < 0
     or p_net_cents <> greatest(0, p_gross_cents - tax_sum - expense_sum) then
    raise exception 'The pay stub doesn''t add up.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.pay_statements where kid_id = p_kid and pay_month = p_pay_month) then
    raise exception 'This month''s pay was already paid.' using errcode = 'unique_violation';
  end if;

  if p_net_cents > 0 then
    insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note, created_by)
      values (p_kid, 'deposit', p_net_cents, p_paid_on, 'Paycheck', auth.uid())
      returning id into tid;
  end if;

  insert into public.pay_statements (kid_id, pay_month, paid_on, gross_cents, taxes, expenses, net_cents, transaction_id)
    values (p_kid, p_pay_month, p_paid_on, p_gross_cents, p_taxes, p_expenses, p_net_cents, tid)
    returning id into sid;
  return sid;
end;
$$;

revoke execute on function public.post_paycheck(uuid, date, date, bigint, jsonb, jsonb, bigint) from public, anon;
grant execute on function public.post_paycheck(uuid, date, date, bigint, jsonb, jsonb, bigint) to authenticated, service_role;

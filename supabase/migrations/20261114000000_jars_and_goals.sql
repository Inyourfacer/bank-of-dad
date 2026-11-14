-- Bank of Dad: Save / Spend / Give jars and savings goals.
--
-- On payday the take-home pay is split three ways (per the kid's pay plan):
--   Save  -> the bank account (earns interest), as before
--   Spend -> the Spend jar (no interest; parents hand it over when spent)
--   Give  -> the Give jar (no interest; for charity or gifts)
-- Kids can move Spend money into savings themselves. Parents record spending
-- and giving. Kids and parents can set savings goals.

-- ---------------------------------------------------------------------------
-- Pay plan split (whole percentages adding up to 100).
-- ---------------------------------------------------------------------------
alter table public.pay_plans
  add column save_pct int not null default 50 check (save_pct between 0 and 100),
  add column spend_pct int not null default 40 check (spend_pct between 0 and 100),
  add column give_pct int not null default 10 check (give_pct between 0 and 100),
  add constraint pay_plans_split_adds_up check (save_pct + spend_pct + give_pct = 100);
grant insert (save_pct, spend_pct, give_pct), update (save_pct, spend_pct, give_pct)
  on public.pay_plans to authenticated;

-- Stubs remember the split. Older stubs (null) put everything in savings.
alter table public.pay_statements
  add column save_cents bigint check (save_cents >= 0),
  add column spend_cents bigint check (spend_cents >= 0),
  add column give_cents bigint check (give_cents >= 0);

-- ---------------------------------------------------------------------------
-- Jar ledger: positive adds to a jar, negative takes from it.
-- ---------------------------------------------------------------------------
create table public.jar_entries (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  jar text not null check (jar in ('spend', 'give')),
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000),
  occurred_on date not null,
  note text check (note is null or length(note) <= 200),
  -- Set for payday entries: removing the stub removes them.
  statement_id uuid references public.pay_statements (id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index jar_entries_kid_idx on public.jar_entries (kid_id, occurred_on);

-- A jar can never go below zero.
create function public.check_jar_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  bal bigint;
begin
  if new.amount_cents >= 0 then
    return new;
  end if;
  -- Serialize changes to one kid's jars.
  perform 1 from public.kids where id = new.kid_id for update;
  select coalesce(sum(amount_cents), 0) into bal
    from public.jar_entries where kid_id = new.kid_id and jar = new.jar;
  if bal + new.amount_cents < 0 then
    raise exception 'There''s only % in the % jar.', to_char(bal / 100.0, 'FM$999999990.00'), initcap(new.jar)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger jar_entries_balance before insert on public.jar_entries
  for each row execute function public.check_jar_balance();

alter table public.jar_entries enable row level security;
create policy "family can read" on public.jar_entries
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
create policy "parents can add" on public.jar_entries
  for insert to authenticated
  with check (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent() and statement_id is null);
create policy "parents can delete" on public.jar_entries
  for delete to authenticated
  using (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent() and statement_id is null);
revoke all on public.jar_entries from anon, authenticated;
grant select, delete on public.jar_entries to authenticated;
grant insert (kid_id, jar, amount_cents, occurred_on, note) on public.jar_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Savings goals (up to 3 per kid).
-- ---------------------------------------------------------------------------
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  emoji text not null default '🎯' check (length(emoji) between 1 and 16),
  target_cents bigint not null check (target_cents > 0 and target_cents <= 100000000),
  created_at timestamptz not null default now()
);
create index savings_goals_kid_idx on public.savings_goals (kid_id);

create function public.check_goal_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.savings_goals where kid_id = new.kid_id) >= 3 then
    raise exception 'Up to 3 goals at a time. Remove one first.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger savings_goals_limit before insert on public.savings_goals
  for each row execute function public.check_goal_limit();

alter table public.savings_goals enable row level security;
create policy "family can read" on public.savings_goals
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
create policy "parents can add" on public.savings_goals
  for insert to authenticated with check (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent());
create policy "parents can delete" on public.savings_goals
  for delete to authenticated using (public.kid_family_id(kid_id) = public.my_family_id() and public.is_parent());
revoke all on public.savings_goals from anon, authenticated;
grant select, delete on public.savings_goals to authenticated;
grant insert (kid_id, name, emoji, target_cents) on public.savings_goals to authenticated;

-- ---------------------------------------------------------------------------
-- Kid actions on the tablet (PIN re-checked each time).
-- Each returns {"status": "ok" | "wrong" | "locked" | "no_pin"}.
-- ---------------------------------------------------------------------------
create function public.move_to_savings(p_kid uuid, p_pin text, p_cents bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pin_status text := public.check_kid_pin(p_kid, p_pin);
begin
  if pin_status <> 'ok' then
    return jsonb_build_object('status', pin_status);
  end if;
  if p_cents is null or p_cents <= 0 then
    raise exception 'Enter an amount.' using errcode = 'check_violation';
  end if;
  insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on, note)
    values (p_kid, 'spend', -p_cents, public.family_today(public.kid_family_id(p_kid)), 'Moved to savings');
  insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note)
    values (p_kid, 'deposit', p_cents, public.family_today(public.kid_family_id(p_kid)), 'From my Spend jar');
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.kid_add_goal(p_kid uuid, p_pin text, p_name text, p_emoji text, p_target_cents bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pin_status text := public.check_kid_pin(p_kid, p_pin);
begin
  if pin_status <> 'ok' then
    return jsonb_build_object('status', pin_status);
  end if;
  insert into public.savings_goals (kid_id, name, emoji, target_cents)
    values (p_kid, trim(p_name), coalesce(nullif(p_emoji, ''), '🎯'), p_target_cents);
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.kid_remove_goal(p_kid uuid, p_pin text, p_goal uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pin_status text := public.check_kid_pin(p_kid, p_pin);
begin
  if pin_status <> 'ok' then
    return jsonb_build_object('status', pin_status);
  end if;
  delete from public.savings_goals where id = p_goal and kid_id = p_kid;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- post_paycheck now splits the take-home into Save / Spend / Give.
-- (Called without a split, everything is saved, as before.)
-- ---------------------------------------------------------------------------
drop function public.post_paycheck(uuid, date, date, bigint, jsonb, jsonb, bigint);

create function public.post_paycheck(
  p_kid uuid,
  p_pay_month date,
  p_paid_on date,
  p_gross_cents bigint,
  p_taxes jsonb,
  p_expenses jsonb,
  p_net_cents bigint,
  p_save_cents bigint default null,
  p_spend_cents bigint default null,
  p_give_cents bigint default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tax_sum bigint;
  expense_sum bigint;
  v_save bigint;
  v_spend bigint := coalesce(p_spend_cents, 0);
  v_give bigint := coalesce(p_give_cents, 0);
  tid uuid;
  sid uuid;
begin
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

  v_save := coalesce(p_save_cents, p_net_cents - v_spend - v_give);
  if v_save < 0 or v_spend < 0 or v_give < 0 or v_save + v_spend + v_give <> p_net_cents then
    raise exception 'The Save / Spend / Give split doesn''t add up to the take-home pay.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.pay_statements where kid_id = p_kid and pay_month = p_pay_month) then
    raise exception 'This month''s pay was already paid.' using errcode = 'unique_violation';
  end if;

  if v_save > 0 then
    insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note, created_by)
      values (p_kid, 'deposit', v_save, p_paid_on, 'Paycheck', auth.uid())
      returning id into tid;
  end if;

  insert into public.pay_statements
    (kid_id, pay_month, paid_on, gross_cents, taxes, expenses, net_cents, transaction_id, save_cents, spend_cents, give_cents)
    values (p_kid, p_pay_month, p_paid_on, p_gross_cents, p_taxes, p_expenses, p_net_cents, tid, v_save, v_spend, v_give)
    returning id into sid;

  if v_spend > 0 then
    insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on, note, statement_id)
      values (p_kid, 'spend', v_spend, p_paid_on, 'Paycheck', sid);
  end if;
  if v_give > 0 then
    insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on, note, statement_id)
      values (p_kid, 'give', v_give, p_paid_on, 'Paycheck', sid);
  end if;
  return sid;
end;
$$;

-- Functions: Supabase grants new functions to its API roles by default.
revoke execute on function
  public.check_jar_balance(),
  public.check_goal_limit(),
  public.move_to_savings(uuid, text, bigint),
  public.kid_add_goal(uuid, text, text, text, bigint),
  public.kid_remove_goal(uuid, text, uuid),
  public.post_paycheck(uuid, date, date, bigint, jsonb, jsonb, bigint, bigint, bigint, bigint)
from public, anon;
revoke execute on function public.check_jar_balance(), public.check_goal_limit() from authenticated;
grant execute on function
  public.move_to_savings(uuid, text, bigint),
  public.kid_add_goal(uuid, text, text, text, bigint),
  public.kid_remove_goal(uuid, text, uuid)
to authenticated;
grant execute on function
  public.post_paycheck(uuid, date, date, bigint, jsonb, jsonb, bigint, bigint, bigint, bigint)
to authenticated, service_role;

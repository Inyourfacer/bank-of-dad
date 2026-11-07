-- Bank of Dad: kid sign-in and withdrawal requests (Phase 3)
--
-- Kids act through the shared family-device login, so every kid action
-- re-checks that kid's PIN on the server. A sibling holding the tablet can't
-- act for someone else by calling the API directly.

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  reason text check (reason is null or length(reason) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index withdrawal_requests_kid_idx on public.withdrawal_requests (kid_id, created_at desc);

alter table public.withdrawal_requests enable row level security;
create policy "family can read" on public.withdrawal_requests
  for select to authenticated using (public.kid_family_id(kid_id) = public.my_family_id());
revoke all on public.withdrawal_requests from anon, authenticated;
grant select on public.withdrawal_requests to authenticated;
-- All writes go through the functions below.

-- ---------------------------------------------------------------------------
-- PIN check shared by the kid functions. Returns 'ok' | 'wrong' | 'locked' |
-- 'no_pin'. Counts failures (5 misses lock for a minute). Never raises on a
-- wrong PIN, so the failure count is saved.
-- ---------------------------------------------------------------------------
create function public.check_kid_pin(p_kid uuid, p_pin text)
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

  if p.pin_hash = extensions.crypt(coalesce(p_pin, ''), p.pin_hash) then
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

-- verify_kid_pin keeps its contract; it now shares check_kid_pin.
create or replace function public.verify_kid_pin(p_kid uuid, p_pin text)
returns text
language sql security definer set search_path = '' as $$
  select public.check_kid_pin(p_kid, p_pin)
$$;

-- Kid signs in on the family device. On the first successful sign-in this
-- opens the account (interest starts today). Returns
-- {"status": "...", "opened_on": "YYYY-MM-DD" | null, "first_login": bool}.
create function public.kid_sign_in(p_kid uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result text := public.check_kid_pin(p_kid, p_pin);
  was_open date;
  opened date;
begin
  if result <> 'ok' then
    return jsonb_build_object('status', result, 'opened_on', null, 'first_login', false);
  end if;
  select account_opened_on into was_open from public.kids where id = p_kid;
  opened := public.open_account(p_kid);
  return jsonb_build_object('status', 'ok', 'opened_on', opened, 'first_login', was_open is null);
end;
$$;

-- A kid asks to take money out. Parents approve or deny it.
-- (The app checks the amount against the kid's available balance; the
-- parent's approval is the real gate, since interest is computed in the app.)
-- Returns {"status": "ok" | "wrong" | "locked" | "no_pin", "id": uuid | null}.
create function public.request_withdrawal(p_kid uuid, p_pin text, p_amount_cents bigint, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pin_status text := public.check_kid_pin(p_kid, p_pin);
  rid uuid;
begin
  -- A wrong PIN is reported, not raised, so the failure count is saved.
  if pin_status <> 'ok' then
    return jsonb_build_object('status', pin_status, 'id', null);
  end if;
  if (select account_opened_on from public.kids where id = p_kid) is null then
    raise exception 'This account isn''t open yet.' using errcode = 'check_violation';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.withdrawal_requests where kid_id = p_kid and status = 'pending') >= 5 then
    raise exception 'You already have 5 requests waiting. Ask a parent to look at them first.'
      using errcode = 'check_violation';
  end if;

  insert into public.withdrawal_requests (kid_id, amount_cents, reason)
    values (p_kid, p_amount_cents, nullif(trim(p_reason), ''))
    returning id into rid;
  return jsonb_build_object('status', 'ok', 'id', rid);
end;
$$;

-- A kid cancels their own pending request. Returns the PIN status.
create function public.cancel_withdrawal(p_kid uuid, p_pin text, p_request uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  pin_status text := public.check_kid_pin(p_kid, p_pin);
begin
  if pin_status <> 'ok' then
    return pin_status;
  end if;
  update public.withdrawal_requests set status = 'cancelled', decided_at = now()
    where id = p_request and kid_id = p_kid and status = 'pending';
  if not found then
    raise exception 'That request isn''t waiting anymore.' using errcode = 'no_data_found';
  end if;
  return 'ok';
end;
$$;

-- A parent approves (records the withdrawal today) or denies a request.
create function public.decide_withdrawal(p_request uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.withdrawal_requests;
  tid uuid;
begin
  select * into r from public.withdrawal_requests where id = p_request for update;
  if not found or not public.is_parent() or public.kid_family_id(r.kid_id) is distinct from public.my_family_id() then
    raise exception 'Only parents can decide requests.' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'pending' then
    raise exception 'That request was already %.', r.status using errcode = 'check_violation';
  end if;

  if p_approve then
    insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note, created_by)
      values (
        r.kid_id, 'withdrawal', -r.amount_cents,
        public.family_today(public.my_family_id()),
        coalesce(r.reason, 'Withdrawal'),
        auth.uid()
      )
      returning id into tid;
  end if;

  update public.withdrawal_requests
    set status = case when p_approve then 'approved' else 'denied' end,
        decided_by = auth.uid(),
        decided_at = now(),
        transaction_id = tid
    where id = p_request;
end;
$$;

revoke execute on function
  public.check_kid_pin(uuid, text),
  public.kid_sign_in(uuid, text),
  public.request_withdrawal(uuid, text, bigint, text),
  public.cancel_withdrawal(uuid, text, uuid),
  public.decide_withdrawal(uuid, boolean)
from public, anon;
grant execute on function
  public.kid_sign_in(uuid, text),
  public.request_withdrawal(uuid, text, bigint, text),
  public.cancel_withdrawal(uuid, text, uuid),
  public.decide_withdrawal(uuid, boolean)
to authenticated;
-- check_kid_pin stays internal. Supabase grants new functions to its API
-- roles by default, so take it back from signed-in users explicitly.
revoke execute on function public.check_kid_pin(uuid, text) from authenticated;

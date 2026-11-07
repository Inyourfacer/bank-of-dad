-- Kid sign-in and withdrawal requests (Phase 3). Uses its own family.
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-00000000000d', 'w-dad@example.com'),
  ('10000000-0000-0000-0000-0000000000de', 'w-tablet@example.com'),
  ('10000000-0000-0000-0000-000000000005', 'w-other@example.com');

\set dad    '10000000-0000-0000-0000-00000000000d'
\set tablet '10000000-0000-0000-0000-0000000000de'
\set other  '10000000-0000-0000-0000-000000000005'

select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select public.create_family('The Withdrawers', 'Dad', 'UTC');
select public.add_family_member('w-tablet@example.com', 'device', 'Tablet');
insert into public.kids (family_id, name) values (public.my_family_id(), 'Kit'), (public.my_family_id(), 'Lou');
select public.set_kid_pin((select id from public.kids where name = 'Kit'), '1111');
select public.set_kid_pin((select id from public.kids where name = 'Lou'), '2222');
insert into public.transactions (kid_id, kind, amount_cents, occurred_on)
  values ((select id from public.kids where name = 'Kit'), 'deposit', 5000, current_date);

-- ---------- Kid sign-in ----------
reset role;
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(public.kid_sign_in((select id from public.kids where name = 'Kit'), '0000')->>'status' = 'wrong', 'wrong PIN does not sign in');
select tests.ok((select account_opened_on from public.kids where name = 'Kit') is null, 'wrong PIN does not open the account');
select tests.ok((public.kid_sign_in((select id from public.kids where name = 'Kit'), '1111')->>'first_login')::boolean, 'first sign-in is reported');
select tests.ok((select account_opened_on from public.kids where name = 'Kit') = current_date, 'first sign-in opens the account today');
select tests.ok(tests.count($$select * from public.rate_periods r join public.kids k on k.id = r.kid_id where k.name = 'Kit'$$) = 2, 'first sign-in creates the rate schedule');
select tests.ok(not (public.kid_sign_in((select id from public.kids where name = 'Kit'), '1111')->>'first_login')::boolean, 'later sign-ins are not first logins');

-- ---------- Requests ----------
select tests.ok(public.request_withdrawal((select id from public.kids where name = 'Kit'), '1111', 1000, 'Toy store')->>'status' = 'ok', 'kid requests a withdrawal with their PIN');
select tests.ok(public.request_withdrawal((select id from public.kids where name = 'Kit'), '2222', 1000, 'Sneaky')->>'status' = 'wrong', 'a sibling''s PIN cannot request for another kid');
select tests.ok(tests.count($$select * from public.withdrawal_requests where reason = 'Sneaky'$$) = 0, 'no request is created with a wrong PIN');
select tests.throws(format($$select public.request_withdrawal(%L, '2222', 500, 'x')$$, (select id from public.kids where name = 'Lou')), 'isn''t open', 'unopened accounts cannot request');
select tests.throws(format($$select public.request_withdrawal(%L, '1111', 0, 'x')$$, (select id from public.kids where name = 'Kit')), 'Enter an amount', 'amount must be positive');
select tests.throws($$insert into public.withdrawal_requests (kid_id, amount_cents) select id, 100 from public.kids where name = 'Kit'$$, 'permission denied', 'requests cannot be inserted directly');
select tests.throws(format($$select public.decide_withdrawal(%L, true)$$, (select id from public.withdrawal_requests where reason = 'Toy store')), 'Only parents', 'device cannot approve');
select public.request_withdrawal((select id from public.kids where name = 'Kit'), '1111', 200, 'Candy');
select tests.ok(public.cancel_withdrawal((select id from public.kids where name = 'Kit'), '1111', (select id from public.withdrawal_requests where reason = 'Candy')) = 'ok', 'kid cancels their own request');
select tests.ok((select status from public.withdrawal_requests where reason = 'Candy') = 'cancelled', 'cancelled request is marked');
select public.request_withdrawal((select id from public.kids where name = 'Kit'), '1111', 100, 'r' || n) from generate_series(1, 4) n;
select tests.throws(format($$select public.request_withdrawal(%L, '1111', 100, 'one too many')$$, (select id from public.kids where name = 'Kit')), '5 requests waiting', 'at most 5 pending requests');

-- ---------- Other families ----------
reset role;
select set_config('request.jwt.claim.sub', :'other', false);
set role authenticated;
select public.create_family('Others', 'Pat', 'UTC');
select tests.ok(tests.count('select * from public.withdrawal_requests') = 0, 'other family cannot see our requests');
select tests.throws(format($$select public.kid_sign_in(%L, '1111')$$, (select id from public.kids where name = 'Kit')), 'Not your family', 'other family cannot sign our kids in');
select tests.throws(format($$select public.decide_withdrawal(%L, true)$$, (select id from public.withdrawal_requests where reason = 'Toy store')), 'Only parents', 'other family cannot approve our requests');

-- ---------- Parent decides ----------
reset role;
select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select public.decide_withdrawal((select id from public.withdrawal_requests where reason = 'Toy store'), true);
select tests.ok((select status from public.withdrawal_requests where reason = 'Toy store') = 'approved', 'parent approves a request');
select tests.ok(tests.count($$select * from public.transactions where kind = 'withdrawal' and amount_cents = -1000 and note = 'Toy store' and occurred_on = current_date$$) = 1, 'approval records the withdrawal today');
select tests.ok((select transaction_id is not null and decided_by = auth.uid() from public.withdrawal_requests where reason = 'Toy store'), 'approval links the transaction and who decided');
select tests.throws(format($$select public.decide_withdrawal(%L, true)$$, (select id from public.withdrawal_requests where reason = 'Toy store')), 'already approved', 'a request is decided only once');
select public.decide_withdrawal((select id from public.withdrawal_requests where reason = 'r1'), false);
select tests.ok((select status from public.withdrawal_requests where reason = 'r1') = 'denied', 'parent denies a request');
select tests.ok(tests.count($$select * from public.transactions where note = 'r1'$$) = 0, 'denial records no money movement');

-- ---------- Lockout is shared across kid actions ----------
reset role;
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select public.request_withdrawal((select id from public.kids where name = 'Kit'), '9999', 100, 'guess') from generate_series(1, 5);
select tests.ok(public.kid_sign_in((select id from public.kids where name = 'Kit'), '1111')->>'status' = 'locked', 'wrong PINs during requests count toward the lockout');
select tests.ok(public.verify_kid_pin((select id from public.kids where name = 'Kit'), '1111') = 'locked', 'verify_kid_pin still works and sees the lock');
select tests.throws($$select public.check_kid_pin(gen_random_uuid(), '1')$$, 'permission denied', 'internal PIN check is not callable directly');
reset role;

-- CDs and loans.
insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-00000000000d', 'c-dad@example.com'),
  ('50000000-0000-0000-0000-0000000000de', 'c-tablet@example.com'),
  ('50000000-0000-0000-0000-000000000005', 'c-other@example.com');

\set dad    '50000000-0000-0000-0000-00000000000d'
\set tablet '50000000-0000-0000-0000-0000000000de'
\set other  '50000000-0000-0000-0000-000000000005'

select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select public.create_family('The Lockers', 'Dad', 'UTC');
select public.add_family_member('c-tablet@example.com', 'device', 'Tablet');
insert into public.kids (family_id, name, intro_months) values (public.my_family_id(), 'Cy', 0), (public.my_family_id(), 'Lu', 0);
select public.set_kid_pin((select id from public.kids where name = 'Cy'), '1234');
select public.set_kid_pin((select id from public.kids where name = 'Lu'), '5678');
insert into public.transactions (kid_id, kind, amount_cents, occurred_on)
  values ((select id from public.kids where name = 'Cy'), 'deposit', 5000, current_date);
reset role;

-- ---------- full_months matches the app ----------
select tests.ok(public.full_months('2027-01-15', '2027-02-14') = 0, 'a month counts once its day comes round');
select tests.ok(public.full_months('2027-01-15', '2027-04-20') = 3, 'three full months');
select tests.ok(public.full_months('2027-01-31', '2027-02-28') = 1, 'month-end dates clamp like the app');

-- ---------- CDs ----------
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.throws(format($$select public.open_cd(%L, '1234', 1000, 6)$$, (select id from public.kids where name = 'Cy')), 'isn''t open', 'the account must be open');
select public.kid_sign_in((select id from public.kids where name = 'Cy'), '1234');
select tests.ok(public.open_cd((select id from public.kids where name = 'Cy'), '0000', 1000, 6)->>'status' = 'wrong', 'locking money needs the PIN');
select tests.throws(format($$select public.open_cd(%L, '1234', 1000, 5)$$, (select id from public.kids where name = 'Cy')), '3, 6 or 12', 'terms are 3, 6 or 12 months');
select tests.throws(format($$select public.open_cd(%L, '1234', 9000, 6)$$, (select id from public.kids where name = 'Cy')), 'lock up to $50.00', 'can''t lock more than savings');
select tests.ok(public.open_cd((select id from public.kids where name = 'Cy'), '1234', 2000, 6)->>'status' = 'ok', 'a kid locks $20 for 6 months');
select tests.ok((select base_monthly_rate = 0.01 and bonus_monthly_rate = 0.01 and matures_on = (current_date + interval '6 months')::date from public.cds),
  'the CD gets the current rate plus the family bonus');
select tests.ok(tests.count($$select * from public.transactions where note = 'Locked in a CD' and amount_cents = -2000$$) = 1, 'the money leaves savings');
select tests.throws(format($$select public.collect_cd(%L)$$, (select id from public.cds)), 'matures on', 'a CD can''t be collected early');
reset role;

-- Time travel: make the CD three months old.
update public.cds set opened_on = current_date - interval '3 months' - interval '2 days',
  matures_on = (current_date - interval '3 months' - interval '2 days' + interval '6 months')::date;
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok((public.break_cd((select id from public.kids where name = 'Cy'), '1234', (select id from public.cds))->>'payout_cents')::bigint = round(2000 * 1.01 ^ 3),
  'breaking early pays the base rate only ($20.61)');
select tests.ok(tests.count($$select * from public.transactions where note = 'CD broken early' and amount_cents = 2061$$) = 1, 'the payout goes back to savings');
select tests.throws(format($$select public.break_cd(%L, '1234', %L)$$, (select id from public.kids where name = 'Cy'), (select id from public.cds)), 'isn''t open', 'a CD closes once');

-- A matured CD pays base + bonus in full.
select public.open_cd((select id from public.kids where name = 'Cy'), '1234', 2000, 6);
reset role;
update public.cds set opened_on = current_date - interval '6 months', matures_on = current_date where status = 'open';
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(public.collect_cd((select id from public.cds where status = 'open')) = round(2000 * 1.02 ^ 6), 'a matured CD pays base + bonus ($22.52)');
select tests.ok(public.collect_cd((select id from public.cds where payout_cents = 2252)) = 2252, 'collecting again changes nothing');
select tests.ok(tests.count($$select * from public.transactions where note = 'CD matured'$$) = 1, 'it pays out only once');
select tests.throws($$insert into public.cds (kid_id, principal_cents, base_monthly_rate, bonus_monthly_rate, term_months, opened_on, matures_on)
  select id, 1, 0, 0, 3, current_date, current_date from public.kids limit 1$$, 'permission denied', 'CDs can''t be written directly');
reset role;

-- ---------- Loans ----------
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(public.request_loan((select id from public.kids where name = 'Lu'), '1234', 5000, 'Skateboard')->>'status' = 'wrong', 'a sibling''s PIN can''t borrow');
select tests.ok(public.request_loan((select id from public.kids where name = 'Lu'), '5678', 5000, 'Skateboard')->>'status' = 'ok', 'a kid asks to borrow $50');
select tests.ok((select monthly_rate = 0.03 and status = 'pending' from public.loans), 'loans use the family loan rate');
select tests.throws(format($$select public.request_loan(%L, '5678', 100, 'More')$$, (select id from public.kids where name = 'Lu')), 'already have a loan', 'one loan at a time');
select tests.throws(format($$select public.decide_loan(%L, true)$$, (select id from public.loans)), 'Only parents', 'the tablet can''t approve loans');
select tests.throws(format($$select public.pay_loan(%L, '5678', %L, 100, 'spend')$$, (select id from public.kids where name = 'Lu'), (select id from public.loans)), 'isn''t active', 'can''t pay a loan that isn''t approved');
reset role;

select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select public.decide_loan((select id from public.loans), true);
select tests.ok((select status = 'active' and started_on is not null from public.loans), 'a parent approves the loan');
-- Lu has $3 in the Spend jar to pay with.
insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on) values ((select id from public.kids where name = 'Lu'), 'spend', 300, current_date);
reset role;

select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(public.pay_loan((select id from public.kids where name = 'Lu'), '5678', (select id from public.loans), 300, 'spend')->>'status' = 'ok', 'a kid pays from the Spend jar');
select tests.ok((select sum(amount_cents) from public.jar_entries j join public.kids k on k.id = j.kid_id where k.name = 'Lu') = 0, 'the Spend jar goes down');
select tests.throws(format($$select public.pay_loan(%L, '5678', %L, 100, 'savings')$$, (select id from public.kids where name = 'Lu'), (select id from public.loans)), 'savings don''t have', 'can''t pay from empty savings');
select tests.throws(format($$select public.pay_loan(%L, '5678', %L, 100, 'cash')$$, (select id from public.kids where name = 'Lu'), (select id from public.loans)), 'savings or the Spend jar', 'kids can''t record cash payments');
select tests.throws(format($$select public.pay_loan(%L, '5678', %L, 99999, 'spend')$$, (select id from public.kids where name = 'Lu'), (select id from public.loans)), 'more than you owe', 'can''t pay more than is owed');
reset role;

select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select tests.ok(public.pay_loan((select id from public.kids where name = 'Lu'), null, (select id from public.loans), 4700, 'cash')->>'status' = 'ok', 'a parent records a cash payment');
select tests.ok((select sum(amount_cents) from public.loan_payments) = 5000, 'payments are recorded');
reset role;
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(public.request_loan((select id from public.kids where name = 'Lu'), '5678', 1000, 'Next thing')->>'status' = 'ok', 'once paid off, a kid can borrow again');
select tests.ok(public.cancel_loan((select id from public.kids where name = 'Lu'), '5678', (select id from public.loans where status = 'pending'))->>'status' = 'ok', 'a kid cancels a pending loan request');
reset role;

-- ---------- Other families ----------
select set_config('request.jwt.claim.sub', :'other', false);
set role authenticated;
select public.create_family('Others', 'Pat', 'UTC');
select tests.ok(tests.count('select * from public.cds') + tests.count('select * from public.loans') + tests.count('select * from public.loan_payments') = 0, 'other families can''t see our CDs or loans');
select tests.throws(format($$select public.collect_cd(%L)$$, (select id from public.cds limit 1)), '', 'other families can''t touch our CDs');
select tests.throws(format($$select public.open_cd(%L, null, 100, 3)$$, (select id from public.kids where name = 'Cy')), '', 'other parents can''t open our CDs');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tests.throws($$select * from public.cds$$, 'permission denied', 'anonymous visitors see nothing');
reset role;

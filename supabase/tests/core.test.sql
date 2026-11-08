-- Access rules and business rules for the core schema.
-- Users: dad + mom (parents), tablet (family device), sam (another family).

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000d', 'dad@example.com'),
  ('00000000-0000-0000-0000-00000000000a', 'mom@example.com'),
  ('00000000-0000-0000-0000-0000000000de', 'tablet@example.com'),
  ('00000000-0000-0000-0000-000000000005', 'sam@example.com');

\set dad    '00000000-0000-0000-0000-00000000000d'
\set mom    '00000000-0000-0000-0000-00000000000a'
\set tablet '00000000-0000-0000-0000-0000000000de'
\set sam    '00000000-0000-0000-0000-000000000005'

-- ---------- Family setup ----------
select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;

select tests.ok(public.create_family('The Smiths', 'Dad', 'America/Chicago') is not null, 'parent creates a family');
select tests.throws($$select public.create_family('Again', 'Dad', 'UTC')$$, 'already belong', 'cannot create a second family');
select tests.ok(public.add_family_member('MOM@example.com', 'parent', 'Mom') is not null, 'parent adds the second parent (email case-insensitive)');
select tests.ok(public.add_family_member('tablet@example.com', 'device', 'Kids tablet') is not null, 'parent adds the family device');
select tests.throws($$select public.add_family_member('nobody@example.com', 'parent', 'X')$$, 'No user with that email', 'unknown emails are rejected');
select tests.throws($$select public.add_family_member('mom@example.com', 'parent', 'Mom')$$, 'already belongs', 'members cannot be added twice');
select tests.throws($$select public.add_family_member('sam@example.com', 'admin', 'Sam')$$, 'Role must be', 'invalid roles are rejected');
select tests.ok(tests.count('select * from public.members') = 3, 'parent sees 3 family members');

insert into public.kids (family_id, name, avatar, mode) values (public.my_family_id(), 'Ava', '🦊', 'standard');
insert into public.kids (family_id, name, intro_months) values (public.my_family_id(), 'Ben', 0);
select tests.ok(tests.count('select * from public.kids') = 2, 'parent adds kids');
select tests.throws($$update public.kids set account_opened_on = '2020-01-01'$$, 'permission denied', 'nobody can set the open date directly');
select tests.throws($$select * from public.kid_pins$$, 'permission denied', 'PIN hashes are never readable');

-- ---------- Other family is invisible ----------
reset role;
select set_config('request.jwt.claim.sub', :'sam', false);
set role authenticated;
select tests.ok(public.create_family('The Joneses', 'Sam', 'UTC') is not null, 'another parent makes their own family');
select tests.ok(tests.count('select * from public.kids') = 0, 'other family sees none of our kids');
select tests.ok(tests.count('select * from public.members') = 1, 'other family sees only its own members');
select tests.throws(
  format($$insert into public.kids (family_id, name) values (%L, 'Mallory')$$, (select id from public.families where name = 'The Smiths')),
  'row-level security', 'cannot add kids to another family');

-- ---------- PINs ----------
reset role;
select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select tests.throws(format($$select public.set_kid_pin(%L, '12a4')$$, (select id from public.kids where name = 'Ava')), '4 digits', 'PIN must be 4 digits');
select public.set_kid_pin((select id from public.kids where name = 'Ava'), '1234');
select tests.ok(tests.count('select * from public.kids_with_pin()') = 1, 'kids_with_pin lists kids with a PIN');

reset role;
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(public.verify_kid_pin((select id from public.kids where name = 'Ava'), '1234') = 'ok', 'device verifies the right PIN');
select tests.ok(public.verify_kid_pin((select id from public.kids where name = 'Ben'), '1234') = 'no_pin', 'kid without a PIN reports no_pin');
select tests.ok(public.verify_kid_pin((select id from public.kids where name = 'Ava'), '0000') = 'wrong', 'wrong PIN is rejected');
select public.verify_kid_pin((select id from public.kids where name = 'Ava'), '0000') from generate_series(1, 3);
select tests.ok(public.verify_kid_pin((select id from public.kids where name = 'Ava'), '0000') = 'locked', '5th wrong PIN locks the profile');
select tests.ok(public.verify_kid_pin((select id from public.kids where name = 'Ava'), '1234') = 'locked', 'right PIN is refused while locked');
select tests.throws(format($$select public.set_kid_pin(%L, '9999')$$, (select id from public.kids where name = 'Ava')), 'Only parents', 'device cannot change PINs');

reset role;
update public.kid_pins set locked_until = now() - interval '1 second';
select set_config('request.jwt.claim.sub', :'sam', false);
set role authenticated;
select tests.throws(format($$select public.verify_kid_pin(%L, '1234')$$, (select id from public.kids where name = 'Ava')), 'Not your family', 'other family cannot check our PINs');

reset role;
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(public.verify_kid_pin((select id from public.kids where name = 'Ava'), '1234') = 'ok', 'lock expires');

-- ---------- Device is read-only ----------
select tests.ok(tests.count('select * from public.kids') = 2, 'device can see the kids');
select tests.throws($$insert into public.kids (family_id, name) values (public.my_family_id(), 'Zed')$$, 'row-level security', 'device cannot add kids');
select tests.throws(
  format($$insert into public.transactions (kid_id, kind, amount_cents, occurred_on) values (%L, 'deposit', 100, public.family_today(public.my_family_id()))$$,
    (select id from public.kids where name = 'Ava')),
  'row-level security', 'device cannot record deposits');
update public.families set regular_bank_apy = 0.2;
select tests.ok((select regular_bank_apy from public.families) = 0.005, 'device cannot change family settings');

-- ---------- Ledger before opening ----------
reset role;
select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
insert into public.transactions (kid_id, kind, amount_cents, occurred_on, note)
  values ((select id from public.kids where name = 'Ava'), 'deposit', 5000, public.family_today(public.my_family_id()) - 70, 'Birthday');
select tests.ok(tests.count('select * from public.transactions') = 1, 'parent backfills a deposit before the account opens');
select tests.throws(
  format($$insert into public.transactions (kid_id, kind, amount_cents, occurred_on) values (%L, 'deposit', 100, public.family_today(public.my_family_id()) + 2)$$,
    (select id from public.kids where name = 'Ava')),
  'future', 'no future-dated transactions');
select tests.throws(
  format($$insert into public.transactions (kid_id, kind, amount_cents, occurred_on) values (%L, 'interest', 100, public.family_today(public.my_family_id()))$$,
    (select id from public.kids where name = 'Ava')),
  '', 'parents cannot post interest');
select tests.throws(
  format($$insert into public.transactions (kid_id, kind, amount_cents, occurred_on) values (%L, 'deposit', -100, public.family_today(public.my_family_id()))$$,
    (select id from public.kids where name = 'Ava')),
  'check constraint', 'deposits must be positive');
select tests.throws(
  format($$insert into public.transactions (kid_id, kind, amount_cents, occurred_on) values (%L, 'withdrawal', 100, public.family_today(public.my_family_id()))$$,
    (select id from public.kids where name = 'Ava')),
  'check constraint', 'withdrawals must be negative');
select tests.throws(
  format($$select public.add_family_member('sam@example.com', 'parent', 'Sam')$$), 'already belongs', 'cannot poach members of another family');

-- ---------- Opening the account (first login) ----------
reset role;
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(public.open_account((select id from public.kids where name = 'Ava')) = public.family_today(public.my_family_id()), 'first login opens the account today');
select tests.ok(public.open_account((select id from public.kids where name = 'Ava')) = public.family_today(public.my_family_id()), 'opening again is a no-op');
select tests.ok(tests.count($$select * from public.rate_periods where monthly_rate = 0.02 and effective_from = public.family_today(public.my_family_id())$$) = 1, 'starter rate begins on the open date');
select tests.ok(tests.count($$select * from public.rate_periods where monthly_rate = 0.01 and effective_from = (public.family_today(public.my_family_id()) + interval '3 months')::date$$) = 1, 'regular rate begins 3 months later');
select public.open_account((select id from public.kids where name = 'Ben'));
select tests.ok(tests.count($$select * from public.rate_periods r join public.kids k on k.id = r.kid_id where k.name = 'Ben'$$) = 1, 'no starter period when intro is 0 months');

reset role;
select set_config('request.jwt.claim.sub', :'sam', false);
set role authenticated;
select tests.throws(format($$select public.open_account(%L)$$, (select id from public.kids where name = 'Ava')), 'Not your family', 'other family cannot open our accounts');

-- ---------- Ledger after opening ----------
reset role;
select set_config('request.jwt.claim.sub', :'mom', false);
set role authenticated;
select tests.throws(
  format($$insert into public.transactions (kid_id, kind, amount_cents, occurred_on) values (%L, 'deposit', 100, (date_trunc('month', public.family_today(public.my_family_id())) - interval '1 day')::date)$$,
    (select id from public.kids where name = 'Ava')),
  'Payday is final', 'once open, past months are final');
insert into public.transactions (kid_id, kind, amount_cents, occurred_on)
  values ((select id from public.kids where name = 'Ava'), 'withdrawal', -1000, public.family_today(public.my_family_id()));
select tests.ok(tests.count('select * from public.transactions') = 2, 'second parent records a withdrawal this month');
select tests.throws($$delete from public.transactions where note = 'Birthday'$$, 'Payday is final', 'cannot delete entries from finished months');
delete from public.transactions where kind = 'withdrawal';
select tests.ok(tests.count('select * from public.transactions') = 1, 'can delete a mistake from this month');

-- ---------- Rate changes ----------
select tests.throws(
  format($$insert into public.rate_periods (kid_id, effective_from, monthly_rate) values (%L, public.family_today(public.my_family_id()) - 1, 0.03)$$,
    (select id from public.kids where name = 'Ava')),
  'today or later', 'rate changes cannot be backdated');
insert into public.rate_periods (kid_id, effective_from, monthly_rate)
  values ((select id from public.kids where name = 'Ava'), public.family_today(public.my_family_id()) + 30, 0.015);
select tests.ok(tests.count($$select * from public.rate_periods where monthly_rate = 0.015$$) = 1, 'parent schedules a future rate change');
delete from public.rate_periods where monthly_rate = 0.015;
select tests.ok(tests.count($$select * from public.rate_periods where monthly_rate = 0.015$$) = 0, 'parent cancels a future rate change');
select tests.throws($$delete from public.rate_periods where monthly_rate = 0.02$$, 'already in effect', 'rates in effect cannot be removed');
select tests.throws(
  format($$insert into public.rate_periods (kid_id, effective_from, monthly_rate) values (%L, current_date + 5, 0.5)$$,
    (select id from public.kids where name = 'Ava')),
  'check constraint', 'rates are capped at 20%/month');

-- ---------- Members ----------
select tests.throws(format($$select public.remove_family_member(%L)$$, :'mom'), 'yourself', 'cannot remove yourself');
select public.remove_family_member(:'tablet');
select tests.ok(tests.count('select * from public.members') = 2, 'parent removes the device');

-- ---------- Deleting a kid cascades past the ledger rules ----------
reset role;
update public.kids set account_opened_on = current_date - 90 where name = 'Ava';
select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
delete from public.kids where name = 'Ava';
select tests.ok(tests.count('select * from public.kids') = 1, 'parent can delete a kid with history');

-- ---------- Anonymous visitors get nothing ----------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tests.throws($$select * from public.kids$$, 'permission denied', 'anon cannot read kids');
select tests.throws($$select public.create_family('x', 'y', 'UTC')$$, 'permission denied', 'anon cannot call functions');
reset role;

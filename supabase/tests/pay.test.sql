-- Pay and expenses: pay plans, tax brackets, pay stubs.
insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-00000000000d', 'p-dad@example.com'),
  ('30000000-0000-0000-0000-0000000000de', 'p-tablet@example.com'),
  ('30000000-0000-0000-0000-000000000005', 'p-other@example.com');

\set dad    '30000000-0000-0000-0000-00000000000d'
\set tablet '30000000-0000-0000-0000-0000000000de'
\set other  '30000000-0000-0000-0000-000000000005'

-- Default stub for $100: taxes $16.80, bills $76, take-home $7.20.
\set taxes '[{"label": "10% on the first $20", "cents": 200}, {"label": "15% on $20 to $60", "cents": 600}, {"label": "22% on pay above $60", "cents": 880}]'
\set bills '[{"label": "Rent", "cents": 4000}, {"label": "Groceries", "cents": 2000}, {"label": "Utilities", "cents": 1000}, {"label": "Insurance", "cents": 600}]'

select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select public.create_family('The Payers', 'Dad', 'UTC');
select public.add_family_member('p-tablet@example.com', 'device', 'Tablet');
insert into public.kids (family_id, name) values (public.my_family_id(), 'Pat'), (public.my_family_id(), 'Quinn');

-- ---------- Tax brackets ----------
select tests.ok((select jsonb_array_length(tax_brackets) = 3 from public.families), 'families start with default tax brackets');
update public.families set tax_brackets = '[{"up_to_cents": null, "rate": 0.2}]';
select tests.ok((select tax_brackets->0->>'rate' = '0.2' from public.families), 'parents can change the tax brackets');
select tests.throws($$update public.families set tax_brackets = '{"rate": 1}'$$, 'check constraint', 'tax brackets must be a list');

-- ---------- Pay plans ----------
insert into public.pay_plans (kid_id, enabled, salary_cents, pay_day, expenses)
  values ((select id from public.kids where name = 'Pat'), true, 10000, 1, :'bills'::jsonb);
select tests.ok(tests.count('select * from public.pay_plans') = 1, 'parents can create a pay plan');
update public.pay_plans set salary_cents = 12000;
select tests.ok((select salary_cents from public.pay_plans) = 12000, 'parents can change a pay plan');
select tests.throws(
  format($$insert into public.pay_plans (kid_id, pay_day) values (%L, 31)$$, (select id from public.kids where name = 'Quinn')),
  'check constraint', 'payday must be between the 1st and 28th');
update public.pay_plans set salary_cents = 10000;
reset role;

select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.ok(tests.count('select * from public.pay_plans') = 1, 'the tablet can see pay plans');
update public.pay_plans set salary_cents = 99999;
select tests.ok((select salary_cents from public.pay_plans) = 10000, 'the tablet cannot change pay plans');
select tests.throws(
  format($$select public.post_paycheck(%L, date_trunc('month', current_date)::date, current_date, 10000, %L::jsonb, %L::jsonb, 720)$$,
    (select id from public.kids where name = 'Pat'), :'taxes', :'bills'),
  'Only parents', 'the tablet cannot pay a salary');
reset role;

-- ---------- Paying ----------
select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select public.post_paycheck((select id from public.kids where name = 'Pat'), date_trunc('month', current_date)::date, current_date,
  10000, :'taxes'::jsonb, :'bills'::jsonb, 720);
select tests.ok(tests.count('select * from public.pay_statements') = 1, 'a parent pays this month''s salary');
select tests.ok(tests.count($$select * from public.transactions where kind = 'deposit' and amount_cents = 720 and note = 'Paycheck'$$) = 1,
  'only the take-home pay is deposited');
select tests.ok((select transaction_id is not null from public.pay_statements), 'the stub links to its deposit');
select tests.throws(
  format($$select public.post_paycheck(%L, date_trunc('month', current_date)::date, current_date, 10000, %L::jsonb, %L::jsonb, 720)$$,
    (select id from public.kids where name = 'Pat'), :'taxes', :'bills'),
  'already paid', 'each month is paid once');
select tests.throws(
  format($$select public.post_paycheck(%L, date_trunc('month', current_date)::date, current_date, 10000, %L::jsonb, %L::jsonb, 5000)$$,
    (select id from public.kids where name = 'Quinn'), :'taxes', :'bills'),
  'add up', 'a stub that doesn''t add up is rejected');
select tests.throws(
  format($$select public.post_paycheck(%L, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month')::date, 10000, %L::jsonb, %L::jsonb, 720)$$,
    (select id from public.kids where name = 'Quinn'), :'taxes', :'bills'),
  'fall in the pay month', 'payday must fall in the pay month');
select tests.throws($$insert into public.pay_statements (kid_id, pay_month, paid_on, gross_cents, taxes, expenses, net_cents)
  select id, date_trunc('month', current_date)::date, current_date, 1, '[]', '[]', 1 from public.kids where name = 'Quinn'$$,
  'permission denied', 'stubs cannot be written directly');

-- Bills bigger than the pay: a $0 stub with no deposit.
select public.post_paycheck((select id from public.kids where name = 'Quinn'), date_trunc('month', current_date)::date, current_date,
  1000, '[]'::jsonb, '[{"label": "Rent", "cents": 4000}]'::jsonb, 0);
select tests.ok((select net_cents = 0 and transaction_id is null from public.pay_statements p join public.kids k on k.id = p.kid_id where k.name = 'Quinn'),
  'a $0 take-home records the stub without a deposit');

-- Undo a mistake: deleting this month's paycheck deposit removes its stub.
delete from public.transactions where note = 'Paycheck';
select tests.ok(tests.count($$select * from public.pay_statements p join public.kids k on k.id = p.kid_id where k.name = 'Pat'$$) = 0,
  'deleting the paycheck deposit removes the stub so the month can be paid again');
reset role;

-- ---------- Other families ----------
select set_config('request.jwt.claim.sub', :'other', false);
set role authenticated;
select public.create_family('Others', 'Pat', 'UTC');
select tests.ok(tests.count('select * from public.pay_statements') = 0, 'other families cannot see our pay stubs');
select tests.ok(tests.count('select * from public.pay_plans') = 0, 'other families cannot see our pay plans');
select tests.throws(
  format($$select public.post_paycheck(%L, date_trunc('month', current_date)::date, current_date, 10000, %L::jsonb, %L::jsonb, 720)$$,
    (select id from public.kids where name = 'Pat'), :'taxes', :'bills'),
  'Only parents', 'other families cannot pay our kids');
reset role;

-- ---------- The daily job (service role) ----------
-- Server calls have no signed-in user.
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
select public.post_paycheck((select id from public.kids where name = 'Pat'), date_trunc('month', current_date)::date, current_date,
  10000, :'taxes'::jsonb, :'bills'::jsonb, 720);
select tests.ok(tests.count($$select * from public.pay_statements p join public.kids k on k.id = p.kid_id where k.name = 'Pat'$$) = 1,
  'the daily job can pay a salary');
reset role;
set role anon;
select tests.throws($$select public.post_paycheck(gen_random_uuid(), current_date, current_date, 0, '[]', '[]', 0)$$, 'permission denied', 'anonymous visitors cannot pay');
reset role;

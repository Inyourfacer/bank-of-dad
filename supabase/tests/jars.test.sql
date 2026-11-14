-- Save / Spend / Give jars and savings goals.
insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-00000000000d', 'j-dad@example.com'),
  ('40000000-0000-0000-0000-0000000000de', 'j-tablet@example.com'),
  ('40000000-0000-0000-0000-000000000005', 'j-other@example.com');

\set dad    '40000000-0000-0000-0000-00000000000d'
\set tablet '40000000-0000-0000-0000-0000000000de'
\set other  '40000000-0000-0000-0000-000000000005'
\set taxes '[{"label": "10% on the first $20", "cents": 200}, {"label": "15% on $20 to $60", "cents": 600}, {"label": "22% on pay above $60", "cents": 880}]'
\set bills '[{"label": "Rent", "cents": 4000}, {"label": "Groceries", "cents": 2000}, {"label": "Utilities", "cents": 1000}, {"label": "Insurance", "cents": 600}]'

select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
select public.create_family('The Jars', 'Dad', 'UTC');
select public.add_family_member('j-tablet@example.com', 'device', 'Tablet');
insert into public.kids (family_id, name) values (public.my_family_id(), 'Jo');
select public.set_kid_pin((select id from public.kids where name = 'Jo'), '1234');

-- ---------- Pay plan split ----------
insert into public.pay_plans (kid_id, enabled) values ((select id from public.kids where name = 'Jo'), true);
select tests.ok((select save_pct = 50 and spend_pct = 40 and give_pct = 10 from public.pay_plans), 'pay plans default to 50 / 40 / 10');
select tests.throws($$update public.pay_plans set give_pct = 20$$, 'split_adds_up', 'the split must add up to 100%');
update public.pay_plans set save_pct = 60, spend_pct = 30, give_pct = 10;
select tests.ok((select save_pct from public.pay_plans) = 60, 'parents can change the split');

-- ---------- Payday splits the take-home ----------
select public.post_paycheck((select id from public.kids where name = 'Jo'), date_trunc('month', current_date)::date, current_date,
  10000, :'taxes'::jsonb, :'bills'::jsonb, 720, 360, 288, 72);
select tests.ok(tests.count($$select * from public.transactions where note = 'Paycheck' and amount_cents = 360$$) = 1, 'the Save share goes into the account');
select tests.ok((select sum(amount_cents) from public.jar_entries where jar = 'spend') = 288, 'the Spend share goes into the Spend jar');
select tests.ok((select sum(amount_cents) from public.jar_entries where jar = 'give') = 72, 'the Give share goes into the Give jar');
select tests.ok((select save_cents = 360 and spend_cents = 288 and give_cents = 72 from public.pay_statements), 'the stub records the split');
select tests.throws(
  format($$select public.post_paycheck(%L, (date_trunc('month', current_date) - interval '1 month')::date, (date_trunc('month', current_date) - interval '1 month')::date, 10000, %L::jsonb, %L::jsonb, 720, 400, 400, 0)$$,
    (select id from public.kids where name = 'Jo'), :'taxes', :'bills'),
  'split doesn''t add up', 'a split that doesn''t add up is rejected');

-- ---------- Jars ----------
insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on, note)
  values ((select id from public.kids where name = 'Jo'), 'spend', -100, current_date, 'Stickers');
select tests.ok((select sum(amount_cents) from public.jar_entries where jar = 'spend') = 188, 'parents record spending from the Spend jar');
select tests.throws(
  format($$insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on) values (%L, 'give', -500, current_date)$$, (select id from public.kids where name = 'Jo')),
  'only $0.72 in the Give jar', 'a jar can''t go below zero');
select tests.throws(
  format($$insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on) values (%L, 'savings', 100, current_date)$$, (select id from public.kids where name = 'Jo')),
  'check constraint', 'only Spend and Give are jars');
delete from public.jar_entries where note = 'Paycheck' and jar = 'give';
select tests.ok(tests.count($$select * from public.jar_entries where note = 'Paycheck'$$) = 2, 'payday jar entries are still there');
reset role;

-- ---------- The tablet ----------
select set_config('request.jwt.claim.sub', :'tablet', false);
set role authenticated;
select tests.throws(
  format($$insert into public.jar_entries (kid_id, jar, amount_cents, occurred_on) values (%L, 'spend', -10, current_date)$$, (select id from public.kids where name = 'Jo')),
  'row-level security', 'the tablet can''t record spending');
select tests.ok(public.move_to_savings((select id from public.kids where name = 'Jo'), '0000', 100)->>'status' = 'wrong', 'moving money needs the right PIN');
select tests.ok(public.move_to_savings((select id from public.kids where name = 'Jo'), '1234', 100)->>'status' = 'ok', 'a kid moves Spend money into savings');
select tests.ok((select sum(amount_cents) from public.jar_entries where jar = 'spend') = 88, 'the Spend jar goes down');
select tests.ok(tests.count($$select * from public.transactions where note = 'From my Spend jar' and amount_cents = 100$$) = 1, 'the savings account goes up');
select tests.throws(format($$select public.move_to_savings(%L, '1234', 500)$$, (select id from public.kids where name = 'Jo')), 'only $0.88', 'can''t move more than the jar holds');

-- ---------- Goals ----------
select tests.throws($$insert into public.savings_goals (kid_id, name, target_cents) select id, 'x', 1 from public.kids$$, 'row-level security', 'the tablet can''t add goals directly');
select tests.ok(public.kid_add_goal((select id from public.kids where name = 'Jo'), '1234', 'New bike', '🚲', 12000)->>'status' = 'ok', 'a kid sets a goal');
select tests.ok(public.kid_add_goal((select id from public.kids where name = 'Jo'), '0000', 'Sneaky', '🎯', 100)->>'status' = 'wrong', 'setting a goal needs the PIN');
select public.kid_add_goal((select id from public.kids where name = 'Jo'), '1234', 'Game', '🎮', 6000);
select public.kid_add_goal((select id from public.kids where name = 'Jo'), '1234', 'Book', '📚', 1500);
select tests.throws(format($$select public.kid_add_goal(%L, '1234', 'Fourth', '🎯', 100)$$, (select id from public.kids where name = 'Jo')), 'Up to 3 goals', 'at most 3 goals');
select tests.ok(public.kid_remove_goal((select id from public.kids where name = 'Jo'), '1234', (select id from public.savings_goals where name = 'Book'))->>'status' = 'ok', 'a kid removes a goal');
select tests.ok(tests.count('select * from public.savings_goals') = 2, 'the goal is gone');
reset role;

select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
insert into public.savings_goals (kid_id, name, emoji, target_cents) values ((select id from public.kids where name = 'Jo'), 'Camp', '⛺', 5000);
select tests.ok(tests.count('select * from public.savings_goals') = 3, 'parents can add goals');
select tests.throws($$insert into public.savings_goals (kid_id, name, target_cents) select id, 'x', 0 from public.kids$$, '', 'goals need a positive target');
reset role;

-- ---------- Other families ----------
select set_config('request.jwt.claim.sub', :'other', false);
set role authenticated;
select public.create_family('Others', 'Pat', 'UTC');
select tests.ok(tests.count('select * from public.jar_entries') = 0, 'other families can''t see our jars');
select tests.ok(tests.count('select * from public.savings_goals') = 0, 'other families can''t see our goals');
select tests.throws(format($$select public.move_to_savings(%L, '1234', 10)$$, (select id from public.kids where name = 'Jo')), 'Not your family', 'other families can''t move our money');
reset role;

-- ---------- Undo a payday ----------
select set_config('request.jwt.claim.sub', :'dad', false);
set role authenticated;
-- Spend the rest of the Spend jar back to 0 isn't required: removing the stub removes its jar entries.
delete from public.transactions where note = 'Paycheck';
select tests.ok(tests.count('select * from public.pay_statements') = 0, 'deleting the paycheck deposit removes the stub');
select tests.ok(tests.count($$select * from public.jar_entries where note = 'Paycheck'$$) = 0, '...and its jar entries');
reset role;

-- ---------- Old-style call: no split means everything is saved ----------
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
select public.post_paycheck((select id from public.kids where name = 'Jo'), date_trunc('month', current_date)::date, current_date,
  10000, :'taxes'::jsonb, :'bills'::jsonb, 720);
select tests.ok((select save_cents = 720 and spend_cents = 0 and give_cents = 0 from public.pay_statements), 'with no split, all take-home is saved');
reset role;

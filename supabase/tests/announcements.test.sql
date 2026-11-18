-- Rate-change announcements.
insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-00000000000d', 'a-dad@example.com'),
  ('60000000-0000-0000-0000-0000000000de', 'a-tablet@example.com');

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-00000000000d', false);
set role authenticated;
select public.create_family('The Announcers', 'Dad', 'UTC');
select public.add_family_member('a-tablet@example.com', 'device', 'Tablet');
insert into public.kids (family_id, name) values (public.my_family_id(), 'Ann');
select public.open_account((select id from public.kids where name = 'Ann'));

insert into public.rate_periods (kid_id, effective_from, monthly_rate, message)
  values ((select id from public.kids where name = 'Ann'), current_date + 20, 0.015, 'Great saving! Your rate goes up.');
select tests.ok((select message from public.rate_periods where monthly_rate = 0.015) = 'Great saving! Your rate goes up.', 'parents can add a message to a rate change');
select tests.throws(
  format($$insert into public.rate_periods (kid_id, effective_from, monthly_rate, message) values (%L, current_date + 30, 0.02, %L)$$,
    (select id from public.kids where name = 'Ann'), repeat('x', 281)),
  'check constraint', 'messages are kept short');
reset role;

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-0000000000de', false);
set role authenticated;
select tests.ok(tests.count($$select * from public.rate_periods where message is not null$$) = 1, 'the tablet can read the announcement');
select tests.throws(
  format($$insert into public.rate_periods (kid_id, effective_from, monthly_rate, message) values (%L, current_date + 40, 0.2, 'hi')$$,
    (select id from public.kids where name = 'Ann')),
  'row-level security', 'the tablet can''t announce rate changes');
reset role;

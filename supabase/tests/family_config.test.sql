-- Setting up a family from the config file (apply_family_config).
insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-00000000000d', 'dad@bankofdad.local'),
  ('20000000-0000-0000-0000-00000000000a', 'mom@bankofdad.local'),
  ('20000000-0000-0000-0000-0000000000de', 'kids-tablet@bankofdad.local');

\set config '{"family": {"name": "The Smiths", "time_zone": "America/Chicago"}, "members": [{"user_id": "20000000-0000-0000-0000-00000000000d", "role": "parent", "display_name": "Dad"}, {"user_id": "20000000-0000-0000-0000-00000000000a", "role": "parent", "display_name": "Mom"}, {"user_id": "20000000-0000-0000-0000-0000000000de", "role": "device", "display_name": "Kids tablet"}], "kids": [{"name": "Ava", "avatar": "🦊", "mode": "standard", "pin": "4821"}, {"name": "Cora", "avatar": "🦄", "mode": "junior", "pin": "7395", "intro_months": 0, "ongoing_monthly_rate": 0.015}]}'

-- ---------- Only the server can run it ----------
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-00000000000d', false);
set role authenticated;
select tests.throws(format('select public.apply_family_config(%L::jsonb)', :'config'), 'permission denied', 'signed-in users cannot apply a config');
reset role;
set role anon;
select tests.throws(format('select public.apply_family_config(%L::jsonb)', :'config'), 'permission denied', 'anonymous visitors cannot apply a config');
reset role;

-- ---------- First run creates everything ----------
set role service_role;
create temp table r as select public.apply_family_config(:'config'::jsonb) as s;
select tests.ok((select (s->>'family_created')::boolean from r), 'first run creates the family');
select tests.ok((select jsonb_array_length(s->'members_added') = 3 from r), 'first run adds both parents and the tablet');
select tests.ok((select jsonb_array_length(s->'kids_created') = 2 from r), 'first run creates the kids');
select tests.ok((select jsonb_array_length(s->'pins_set') = 2 from r), 'first run sets the PINs');
select tests.ok((select time_zone from public.families) = 'America/Chicago', 'family time zone comes from the config');
select tests.ok((select mode = 'junior' and intro_months = 0 and ongoing_monthly_rate = 0.015 from public.kids where name = 'Cora'), 'per-kid view and rates come from the config');
select tests.ok((select intro_monthly_rate = 0.02 and intro_months = 3 and ongoing_monthly_rate = 0.01 from public.kids where name = 'Ava'), 'missing rates use the defaults');
reset role;

-- The PIN from the config works on the tablet.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000de', false);
set role authenticated;
select tests.ok(public.kid_sign_in((select id from public.kids where name = 'Ava'), '4821')->>'status' = 'ok', 'kid signs in with the PIN from the config');
reset role;

-- A parent changes things in the app.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-00000000000d', false);
set role authenticated;
select public.set_kid_pin((select id from public.kids where name = 'Ava'), '1111');
update public.kids set avatar = '🐼' where name = 'Ava';
insert into public.kids (family_id, name) values (public.my_family_id(), 'Ben');
reset role;

-- ---------- Re-running never overwrites app changes ----------
set role service_role;
drop table r;
create temp table r as select public.apply_family_config(:'config'::jsonb) as s;
select tests.ok((select not (s->>'family_created')::boolean from r), 're-run reuses the family');
select tests.ok((select jsonb_array_length(s->'members_added') = 0 from r), 're-run adds no duplicate logins');
select tests.ok((select jsonb_array_length(s->'kids_created') = 0 and jsonb_array_length(s->'kids_kept') = 2 from r), 're-run keeps existing kids');
select tests.ok((select jsonb_array_length(s->'pins_set') = 0 from r), 're-run does not overwrite PINs');
select tests.ok((select s->'kids_not_in_config' = '["Ben"]'::jsonb from r), 're-run lists kids added in the app');
select tests.ok((select avatar from public.kids where name = 'Ava') = '🐼', 'picture changed in the app is kept');
select tests.ok(tests.count('select * from public.kids') = 3, 'no kids are deleted');
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000de', false);
set role authenticated;
select tests.ok(public.kid_sign_in((select id from public.kids where name = 'Ava'), '1111')->>'status' = 'ok', 'PIN changed in the app still works');
reset role;

-- ---------- reset_pin forces the config PIN ----------
set role service_role;
select public.apply_family_config(jsonb_set(:'config'::jsonb, '{kids,0,reset_pin}', 'true'));
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000de', false);
set role authenticated;
select tests.ok(public.kid_sign_in((select id from public.kids where name = 'Ava'), '4821')->>'status' = 'ok', 'reset_pin puts the config PIN back');
reset role;

-- ---------- Bad configs ----------
set role service_role;
select tests.throws($$select public.apply_family_config('{"family": {"name": ""}}')$$, 'needs a family name', 'family name is required');
select tests.throws($$select public.apply_family_config('{"family": {"name": "X"}, "kids": [{"name": "Zed", "pin": "12"}]}')$$, '4 digits', 'PINs must be 4 digits');
select tests.ok(tests.count($$select * from public.kids where name = 'Zed'$$) = 0, 'a bad config changes nothing');
select tests.throws($$select public.apply_family_config('{"family": {"name": "X"}, "members": [{"user_id": "20000000-0000-0000-0000-00000000000d", "role": "admin", "display_name": "D"}]}')$$, 'Role must be', 'roles are checked');
reset role;

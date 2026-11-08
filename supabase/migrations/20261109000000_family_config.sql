-- Bank of Dad: set up the family from a config file (docs/SETUP.md step 4).
--
-- The "Set up family" GitHub job reads the FAMILY_CONFIG secret, creates the
-- parent and tablet logins, then calls this function with the result. Only the
-- server's secret key (service_role) can call it.
--
-- Rule: the config creates what doesn't exist yet and never overwrites changes
-- made in the app. A kid's PIN is set when the kid is new or has no PIN, or
-- when the config says reset_pin: true.
--
-- Input:
-- {
--   "family":  {"name": "...", "time_zone": "America/Chicago"},
--   "members": [{"user_id": "...", "role": "parent" | "device", "display_name": "..."}],
--   "kids":    [{"name": "...", "avatar": "🦊", "mode": "standard",
--                "pin": "1234", "reset_pin": false,
--                "intro_monthly_rate": 0.02, "intro_months": 3, "ongoing_monthly_rate": 0.01}]
-- }
-- Returns a summary (never PINs): created/kept counts and anything in the
-- database that the config doesn't mention.

create function public.apply_family_config(p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fid uuid;
  fam_count int;
  m jsonb;
  k jsonb;
  v_kid uuid;
  created_family boolean := false;
  kids_created text[] := '{}';
  kids_kept text[] := '{}';
  pins_set text[] := '{}';
  members_added text[] := '{}';
  other_family uuid;
  pin text;
begin
  if p is null or p->'family' is null or coalesce(trim(p->'family'->>'name'), '') = '' then
    raise exception 'The config needs a family name.' using errcode = 'check_violation';
  end if;

  -- One family per Bank of Dad project.
  select count(*) into fam_count from public.families;
  if fam_count > 1 then
    raise exception 'This database has more than one family; the config can''t tell which to use.'
      using errcode = 'check_violation';
  end if;
  select id into fid from public.families limit 1;
  if fid is null then
    perform now() at time zone coalesce(p->'family'->>'time_zone', 'UTC'); -- rejects unknown zones
    insert into public.families (name, time_zone)
      values (trim(p->'family'->>'name'), coalesce(p->'family'->>'time_zone', 'UTC'))
      returning id into fid;
    created_family := true;
  end if;

  -- Logins: add anyone not yet in the family. Existing members keep their names.
  for m in select * from jsonb_array_elements(coalesce(p->'members', '[]'::jsonb)) loop
    if (m->>'role') not in ('parent', 'device') then
      raise exception 'Role must be parent or device.' using errcode = 'check_violation';
    end if;
    select family_id into other_family from public.members where user_id = (m->>'user_id')::uuid;
    if other_family is null then
      insert into public.members (user_id, family_id, role, display_name)
        values ((m->>'user_id')::uuid, fid, m->>'role', trim(m->>'display_name'));
      members_added := members_added || (m->>'display_name');
    elsif other_family <> fid then
      raise exception 'Login % belongs to a different family.', m->>'display_name' using errcode = 'check_violation';
    end if;
  end loop;

  -- Kids: create new ones; never overwrite what parents changed in the app.
  for k in select * from jsonb_array_elements(coalesce(p->'kids', '[]'::jsonb)) loop
    select id into v_kid from public.kids where family_id = fid and lower(name) = lower(trim(k->>'name'));
    if v_kid is null then
      insert into public.kids (family_id, name, avatar, mode, intro_monthly_rate, intro_months, ongoing_monthly_rate)
        values (
          fid,
          trim(k->>'name'),
          coalesce(k->>'avatar', '🐷'),
          coalesce(k->>'mode', 'standard'),
          coalesce((k->>'intro_monthly_rate')::numeric, 0.02),
          coalesce((k->>'intro_months')::int, 3),
          coalesce((k->>'ongoing_monthly_rate')::numeric, 0.01)
        )
        returning id into v_kid;
      kids_created := kids_created || (k->>'name');
    else
      kids_kept := kids_kept || (k->>'name');
    end if;

    pin := k->>'pin';
    if pin is not null then
      if pin !~ '^[0-9]{4}$' then
        raise exception 'PIN for % must be 4 digits.', k->>'name' using errcode = 'check_violation';
      end if;
      if coalesce((k->>'reset_pin')::boolean, false)
         or not exists (select 1 from public.kid_pins kp where kp.kid_id = v_kid) then
        insert into public.kid_pins (kid_id, pin_hash)
          values (v_kid, extensions.crypt(pin, extensions.gen_salt('bf')))
        on conflict (kid_id) do update
          set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
        pins_set := pins_set || (k->>'name');
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'family_id', fid,
    'family_created', created_family,
    'members_added', to_jsonb(members_added),
    'kids_created', to_jsonb(kids_created),
    'kids_kept', to_jsonb(kids_kept),
    'pins_set', to_jsonb(pins_set),
    'kids_not_in_config', coalesce((
      select jsonb_agg(name order by name) from public.kids
      where family_id = fid
        and lower(name) not in (select lower(trim(x->>'name')) from jsonb_array_elements(coalesce(p->'kids', '[]'::jsonb)) x)
    ), '[]'::jsonb)
  );
end;
$$;

-- Server only: Supabase grants new functions to its API roles by default.
revoke execute on function public.apply_family_config(jsonb) from public, anon, authenticated;
grant execute on function public.apply_family_config(jsonb) to service_role;

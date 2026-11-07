create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

create function tests.throws(sql text, pattern text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then
      raise notice 'ok - %', label;
      return;
    end if;
    raise exception 'FAIL: % (wrong error: %)', label, sqlerrm;
  end;
  raise exception 'FAIL: % (no error raised)', label;
end $$;

create function tests.count(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || sql || ') q' into n;
  return n;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Bank of Dad: rate-change announcements.
--
-- A parent scheduling a rate change can add a short message for the kid
-- ("Great saving this year! Your rate goes up in January."). Kids see an
-- announcement before the change and for two weeks after.

alter table public.rate_periods
  add column message text check (message is null or length(message) <= 280);

grant insert (message) on public.rate_periods to authenticated;

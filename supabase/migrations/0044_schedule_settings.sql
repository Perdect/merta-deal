-- Scheduled delivery: the two rules the slot picker needs, as settings (never hardcoded).
insert into public.settings (key, value, "group", label, description, is_public) values
  ('scheduled_slot_lead_minutes', '30'::jsonb, 'delivery', 'Scheduled slot lead time (minutes)', 'A slot can be booked only if it starts at least this many minutes from now.', true),
  ('scheduled_days_ahead', '2'::jsonb, 'delivery', 'Scheduled delivery days offered', 'How many days (today included) customers can pick a slot for.', true)
on conflict (key) do nothing;

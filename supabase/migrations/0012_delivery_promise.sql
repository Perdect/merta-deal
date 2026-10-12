-- ============================================================================
-- MERTA DEAL — Delivery promise moves to 20–25 minutes.
-- The UI reads the zone ETA first and the settings ETA as fallback, so both move
-- together or the header and the trust strip disagree.
-- ============================================================================

update public.settings set value = '20'::jsonb, updated_at = now() where key = 'delivery_eta_min_minutes';
update public.settings set value = '25'::jsonb, updated_at = now() where key = 'delivery_eta_max_minutes';

update public.delivery_zones
set eta_min_minutes = 20, eta_max_minutes = 25, updated_at = now()
where is_active;

-- Marketing copy that quoted the old window.
update public.banners
set subtitle = replace(replace(subtitle, '30–60 minutes', '20–25 minutes'), '30-60 minutes', '20-25 minutes'),
    updated_at = now()
where subtitle is not null and (subtitle like '%30–60%' or subtitle like '%30-60%');

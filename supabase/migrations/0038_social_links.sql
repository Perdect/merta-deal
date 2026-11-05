-- ============================================================================
-- MERTA DEAL — Social media profiles (Facebook, Instagram, LinkedIn).
-- Public settings edited under Admin → Settings → Brand and support. Each holds the full https URL of
-- the business page, or stays empty. Shown in the site footer and listed as Organization sameAs for
-- search engines only when filled in; nothing is guessed. Idempotent.
-- ============================================================================
insert into public.settings (key, value, "group", label, description, is_public) values
('social_facebook', '""', 'general', 'Facebook page', 'Full link, e.g. https://www.facebook.com/mertadeal. Leave empty to hide the icon.', true),
('social_instagram', '""', 'general', 'Instagram profile', 'Full link, e.g. https://www.instagram.com/mertadeal. Leave empty to hide the icon.', true),
('social_linkedin', '""', 'general', 'LinkedIn page', 'Full link, e.g. https://www.linkedin.com/company/mertadeal. Leave empty to hide the icon.', true)
on conflict (key) do nothing;

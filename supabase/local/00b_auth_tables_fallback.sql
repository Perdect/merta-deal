-- Minimal auth tables used ONLY when the GoTrue binary is not available locally.
create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz,
  phone text, phone_confirmed_at timestamptz, confirmation_token text, recovery_token text, email_change text, email_change_token_new text,
  email_change_token_current text, last_sign_in_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
  created_at timestamptz, updated_at timestamptz, is_sso_user boolean default false, is_anonymous boolean default false
);
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users(id) on delete cascade, identity_data jsonb,
  provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, email text
);

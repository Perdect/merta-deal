-- 0057: an order only from a mobile number confirmed by OTP (switchable).
--
-- Until now a guest could order with the name and number typed on the address, so a made-up number
-- could place an order. With `order_mobile_otp_required` on, the app asks for the SMS code after the
-- address is chosen and before the payment step, and this trigger is the rule that counts: an order
-- row for a guest profile is refused whatever the app did. Wholesale orders are created by an admin
-- for a signed-in buyer, so they are left alone. Off by default: it must only be switched on once
-- SMS OTP is actually being delivered, or nobody could order.

insert into public.settings (key, value, "group", label, description, is_public) values
  ('order_mobile_otp_required', 'false', 'orders', 'Verify mobile by OTP before an order',
   'On: the customer confirms their mobile number with an SMS code before the order is placed, so every order carries a real number. Off: a guest can order with the name and number typed on the address. Switch on only when SMS OTP is working.', true)
on conflict (key) do nothing;

create or replace function public._orders_require_verified_mobile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.channel = 'retail'
     and public.get_setting_bool('order_mobile_otp_required', false)
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.is_guest) then
    raise exception 'MOBILE_NOT_VERIFIED';
  end if;
  return new;
end $$;

drop trigger if exists orders_require_verified_mobile on public.orders;
create trigger orders_require_verified_mobile before insert on public.orders
  for each row execute function public._orders_require_verified_mobile();

-- ============================================================================
-- MERTA DEAL — Payment provider helpers (Razorpay). Signature verification happens in the
-- Next.js server routes; only the service role may confirm a payment as paid.
-- ============================================================================

-- Order owner attaches the provider order id created by the server before opening checkout.
create or replace function public.attach_provider_order(p_order_id uuid, p_provider_order_id text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.user_id <> auth.uid() and auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if o.payment_status <> 'pending' then raise exception 'PAYMENT_NOT_PENDING'; end if;
  update public.payments set provider_order_id = p_provider_order_id where order_id = p_order_id and provider = 'razorpay';
end $$;

create or replace function public.mark_refund_processed(p_order_id uuid, p_refund_id text, p_amount numeric, p_raw jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  update public.payments set status = case when p_amount >= amount then 'refunded' else 'partially_refunded' end,
    refund_amount = p_amount, refund_id = p_refund_id, refund_required = false, raw_response = coalesce(p_raw, raw_response)
  where order_id = p_order_id;
  update public.orders set payment_status = case when p_amount >= o.total then 'refunded' else 'partially_refunded' end where id = p_order_id;
  perform public.notify_user(o.user_id, 'refund', 'Refund processed', format('₹%s has been refunded for order %s. It will reflect in 5-7 working days.', to_char(p_amount,'FM9999990.00'), o.order_number), jsonb_build_object('order_id', o.id));
end $$;

-- Payments awaiting a provider payment (used by admin "pending online payments")
create or replace function public.expire_unpaid_orders(p_minutes int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  for r in select id from public.orders where status = 'placed' and payment_status = 'pending' and payment_method <> 'cod' and created_at < now() - make_interval(mins => p_minutes) loop
    perform public.cancel_order(r.id, 'Payment not completed');
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function public.attach_provider_order(uuid, text) to authenticated, service_role;
grant execute on function public.mark_refund_processed(uuid, text, numeric, jsonb) to authenticated, service_role;
grant execute on function public.expire_unpaid_orders(int) to authenticated, service_role;

# WhatsApp ordering

Customers send a grocery list to the Merta Deal WhatsApp number; the webhook parses it, matches real products
and replies with a summary plus a link that opens the list in the shopping assistant for checkout.

```
client.ts          Meta Cloud API sender: sendWhatsAppText / sendWhatsAppTemplate / markWhatsAppRead
signature.ts       X-Hub-Signature-256 verification (HMAC-SHA256 over the raw body, timing-safe)
webhook-schema.ts  zod schema for the webhook payload + extractInboundTexts()
```

Routes:

| route | purpose |
| --- | --- |
| `GET  /api/webhooks/whatsapp` | Meta verification handshake (`hub.mode=subscribe`, `hub.verify_token`, returns `hub.challenge`) |
| `POST /api/webhooks/whatsapp` | inbound messages -> `whatsapp_messages` -> parse -> match -> reply |
| `GET  /api/ai/whatsapp-draft?id=` | parsed lines for one stored message (used by `/assistant?wa=<id>`) |

## Flow

```
WhatsApp message
  -> POST /api/webhooks/whatsapp        signature verified, row inserted (status: received; idempotent on wa_message_id)
  -> AI / rules parser                  parseOrder(): Claude when ANTHROPIC_API_KEY is set, else parseOrderText()
                                        parsed_items stored, status: parsed, matched_user_id when the phone matches a profile
  -> Product matching                   matchItems(): search_products RPC, 3 in-stock candidates per line, pack maths
  -> Reply                              short summary + https://<site>/assistant?wa=<row id>   (status: replied | failed)
  -> Cart                               /assistant reads ?wa=, GET /api/ai/whatsapp-draft, re-runs parse+match, "Add all to cart"
                                        (single store per order: the store covering the most lines is chosen; others are skipped with a note)
  -> Checkout                           /checkout — address, slot, COD / Razorpay
  -> Order                              place_order RPC; store gets the new-order notification
  -> Store                              store portal: accept -> pack
  -> Rider                              delivery offer -> pickup -> OTP-verified handover; customer tracks live
```

Planned next steps (not built yet): reply with interactive list messages so the customer can confirm from WhatsApp,
create the cart server-side for matched users (`cart_id` column is already on `whatsapp_messages`), and send order
status updates back over WhatsApp via `dispatchNotification({ channels: ["whatsapp"] })` using an approved template.

## Meta app setup (exact steps)

1. Go to https://developers.facebook.com/apps -> **Create app** -> type **Business** -> name it "Merta Deal".
2. In the app dashboard, **Add product -> WhatsApp -> Set up**. Create or select a Meta Business Account when asked.
3. **WhatsApp -> API Setup**:
   - Copy the **Phone number ID** -> `WHATSAPP_PHONE_NUMBER_ID`.
   - Generate a temporary access token for testing -> `WHATSAPP_ACCESS_TOKEN` (24h). For production create a
     **System User** in Business Settings, assign the app + WhatsApp asset, generate a permanent token with
     `whatsapp_business_messaging` and `whatsapp_business_management` scopes, and use that instead.
   - Add your own number under "To" and send the hello_world template once so the number is verified.
4. **App settings -> Basic**: copy **App secret** -> `WHATSAPP_APP_SECRET` (used to verify `X-Hub-Signature-256`).
5. Choose any random string for `WHATSAPP_VERIFY_TOKEN` (for example `openssl rand -hex 24`).
6. Deploy with these four env vars plus `SUPABASE_SERVICE_ROLE_KEY` (the webhook writes to `whatsapp_messages`).
   Locally, expose the dev server with `ngrok http 3000` and use the https URL below.
7. **WhatsApp -> Configuration -> Webhook -> Edit**:
   - Callback URL: `https://<your-domain>/api/webhooks/whatsapp`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
   - Click **Verify and save** (Meta calls `GET` with `hub.challenge`; the route echoes it).
8. Under **Webhook fields** click **Manage** and subscribe to **messages**.
9. Send "2 kg atta aur 1 litre oil" from the test number. Check the `whatsapp_messages` table: the inbound row moves
   `received -> parsed -> replied` and an outbound row holds the reply text.
10. Before going live: add a real business phone number (Phone numbers -> Add), complete Business Verification,
    set the display name, and switch the app from Development to **Live** mode. Free-form replies are only allowed
    inside the 24-hour window after the customer's last message; anything outside that (order updates) needs an
    approved **Message template** (WhatsApp Manager -> Message templates) referenced by `WHATSAPP_NOTIFY_TEMPLATE`.

## Environment

```
WHATSAPP_ACCESS_TOKEN        system-user token (production) or temporary token (testing)
WHATSAPP_PHONE_NUMBER_ID     from WhatsApp -> API Setup
WHATSAPP_VERIFY_TOKEN        random string you choose; pasted into the webhook config
WHATSAPP_APP_SECRET          App settings -> Basic -> App secret
SUPABASE_SERVICE_ROLE_KEY    required by the webhook and the draft route
ANTHROPIC_API_KEY            optional; without it the rule-based parser is used and the reply says so
NEXT_PUBLIC_SITE_URL         used to build the checkout link in the reply
```

## Privacy

Rows in `whatsapp_messages` contain phone numbers and free text. The draft route only exposes the parsed lines, the
message text and a masked phone (`98XXXXX45`), keyed by an unguessable UUID that was sent only to the sender's own
WhatsApp. Do not add it to any listing endpoint.

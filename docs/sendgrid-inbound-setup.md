# SendGrid Inbound Parse — DNS + Webhook Setup

NeuroCann routes vendor email replies through SendGrid Inbound Parse. Outbound emails
(`netlify/functions/utils/email.ts`) stamp a `Reply-To: thread-<uuid>@replies.neurocann.app`
header; when the vendor hits reply, SendGrid POSTs the parsed message to
`/.netlify/functions/receive-email`, which matches it to a `contact_threads` row and
enqueues it for AI menu parsing (Unit 5).

This doc covers the one-time setup. None of it is code — it happens in DNS and the SendGrid UI.

## 1. Pick the inbound subdomain

Use a dedicated subdomain so a misconfigured MX can never clobber your primary mail flow.
The convention for this project is:

```
replies.neurocann.app
```

Do not reuse `mail.neurocann.app` (that one is already used by SendGrid domain
authentication for outbound).

## 2. Add the MX record

In your DNS provider (Cloudflare / Route53 / whatever), add:

| Type | Name                       | Value            | Priority | TTL  |
|------|----------------------------|------------------|----------|------|
| MX   | `replies.neurocann.app`    | `mx.sendgrid.net`| `10`     | Auto |

Verify with `dig`:

```bash
dig MX replies.neurocann.app +short
# expected: 10 mx.sendgrid.net.
```

Propagation can take a few minutes.

## 3. Configure SendGrid Inbound Parse

1. Log into SendGrid → **Settings → Inbound Parse**.
2. Click **Add Host & URL**.
3. Fill in:
   - **Receiving Domain:** `replies.neurocann.app`
   - **Destination URL:** `https://neurocann.app/.netlify/functions/receive-email`
   - **POST the raw, full MIME message:** **OFF** (we want SendGrid's parsed form fields).
   - **Check incoming emails for spam:** **ON** (SendGrid sets an `spam_score` field we can inspect later).
   - **Send Grid signed event webhook:** optional, but recommended for prod. If you enable it,
     copy the generated ECDSA public key into the Netlify env var `SENDGRID_WEBHOOK_PUBLIC_KEY`.
4. Save.

## 4. Netlify environment variables

Set in Netlify → Site settings → Environment variables:

| Key                              | Example                       | Notes                                             |
|----------------------------------|-------------------------------|---------------------------------------------------|
| `SENDGRID_INBOUND_DOMAIN`        | `replies.neurocann.app`       | Used by outbound email to build `thread-<uuid>@…` |
| `SENDGRID_WEBHOOK_PUBLIC_KEY`    | `-----BEGIN PUBLIC KEY-----…` | Leave unset to disable signature verification.    |

## 5. Smoke test with curl

You can POST a mock SendGrid payload against a local `netlify dev` instance. This
exercises the multipart parser and the thread-matching logic but does **not** require
a real DNS round-trip.

```bash
curl -sS -X POST http://localhost:8888/.netlify/functions/receive-email \
  -F "from=grower@example.com" \
  -F "to=thread-00000000-0000-0000-0000-000000000000@replies.neurocann.app" \
  -F "subject=Re: Menu request" \
  -F "text=Here is our current menu..." \
  -F 'headers=Message-ID: <abc@mail.example.com>
In-Reply-To: <xyz@neurocann.app>' \
  -F 'envelope={"to":["thread-00000000-0000-0000-0000-000000000000@replies.neurocann.app"],"from":"grower@example.com"}'
```

Expected response (after Unit 3's `contact_threads` / `contact_messages` migration lands):

```json
{"ok":true,"threadId":"…","messageId":"…","match":"unmatched"}
```

If the migration has **not** landed, the function will log a DB error and return 500. That
is expected until the schema exists.

## 6. End-to-end verification (once DNS is live)

1. Send an outbound vendor email via the CRM (Unit 2) — it should include a `Reply-To`
   header of `thread-<uuid>@replies.neurocann.app`.
2. Reply from any real inbox.
3. Within ~5–10 seconds, a new `contact_messages` row should appear with `direction='inbound'`
   and the correct `thread_id`.
4. Inspect `contact_threads.last_activity_at` — it should equal the receive time.

## 7. Troubleshooting

- **No webhook traffic at all:** verify the MX record with `dig MX replies.neurocann.app` and
  that SendGrid shows "verified" next to the host in the Inbound Parse UI.
- **401 "Invalid signature":** the public key in Netlify env doesn't match the one SendGrid
  rotated to. Either re-copy it or unset `SENDGRID_WEBHOOK_PUBLIC_KEY` temporarily.
- **All inbound messages land on `status='unmatched'` threads:** the outbound mailer isn't
  stamping `Reply-To` correctly, or `SENDGRID_INBOUND_DOMAIN` on the outbound side differs
  from the receiving host. They must match exactly.

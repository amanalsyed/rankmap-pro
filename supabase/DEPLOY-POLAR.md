# Deploy Polar billing (Supabase Edge Functions)

RankMap Pro billing uses three Supabase Edge Functions:

| Function | URL |
|---|---|
| Checkout | `https://ydficltfmssvqbrqpchn.supabase.co/functions/v1/create-checkout` |
| Customer portal | `https://ydficltfmssvqbrqpchn.supabase.co/functions/v1/customer-portal` |
| Sync billing | `https://ydficltfmssvqbrqpchn.supabase.co/functions/v1/sync-billing` |
| Webhook | `https://ydficltfmssvqbrqpchn.supabase.co/functions/v1/polar-webhook` |

## Pricing (display vs Polar)

| Plan | Monthly | Annual offer | Compare-at annual |
|---|---|---|---|
| Pro | $10/mo | $100/yr | $120 (12 × $10) |
| Lifetime | — | $130 one-time | Limited-time offer |

Plans: **Free**, **Pro**, **Lifetime** only (no Starter tier).

Polar products must use the **offer** prices ($100, $130). Compare-at amounts are shown in the extension/website UI only.

## 1. Run the SQL migrations

In **Supabase → SQL Editor**, run:

1. `supabase/migrations/20260908_plan_limits_update.sql` (if not already run)
2. `supabase/migrations/20260909_pricing_lifetime.sql`
3. `supabase/migrations/20260910_three_plans.sql`

This updates plan limits, adds Polar columns, and extends `get_current_usage()`.

## 2. Set Supabase secrets

**Project Settings → Edge Functions → Secrets**

| Secret | Value |
|---|---|
| `POLAR_ACCESS_TOKEN` | From Polar → Developers (see **Required token scopes** below) |
| `POLAR_WEBHOOK_SECRET` | From Polar webhook endpoint |
| `POLAR_ENVIRONMENT` | `sandbox` |
| `POLAR_PRO_MONTHLY_PRODUCT_ID` | Pro monthly ($10/mo) product UUID |
| `POLAR_PRO_ANNUAL_PRODUCT_ID` | Pro annual ($100/yr) product UUID |
| `POLAR_LIFETIME_PRODUCT_ID` | Lifetime one-time ($130) product UUID |
| `BILLING_SUCCESS_URL` | Your extension success page (see below) |
| `BILLING_CANCEL_URL` | Your extension cancel page (see below) |

**Billing URLs (extension pages):**

After loading the extension in Chrome, open `chrome://extensions`, copy your extension ID, then set:

```
BILLING_SUCCESS_URL=chrome-extension://YOUR_EXTENSION_ID/src/billing/success.html
BILLING_CANCEL_URL=chrome-extension://YOUR_EXTENSION_ID/src/billing/cancel.html
```

The extension also sends these URLs dynamically when starting checkout, so secrets are optional fallbacks.

`SUPABASE_SERVICE_ROLE_KEY` is injected automatically for Edge Functions.

### Required token scopes

When creating the **Organization Access Token** in Polar → Developers, enable at least:

| Scope | Used by |
|---|---|
| `checkouts:write` | create-checkout |
| `customer_sessions:write` | customer-portal (**Manage billing & cancel**) |
| `customers:read` | polar-webhook (resolve user from Polar customer) |
| `subscriptions:read` | polar-webhook (sync plan on subscription events) |

If **Manage billing & cancel** returns `insufficient_scope`, your token was created without `customer_sessions:write`. Create a new token with that scope and update `POLAR_ACCESS_TOKEN` in Supabase secrets (no redeploy needed).

## 3. Install Supabase CLI (one time)

```powershell
npm install -g supabase
```

Or use Scoop: `scoop install supabase`

Login and link:

```powershell
cd "C:\Users\DELL\Desktop\no website extension"
supabase login
supabase link --project-ref ydficltfmssvqbrqpchn
```

## 4. Deploy functions

```powershell
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy customer-portal --no-verify-jwt
supabase functions deploy sync-billing --no-verify-jwt
supabase functions deploy polar-webhook --no-verify-jwt
supabase functions deploy billing-return --no-verify-jwt
```

`--no-verify-jwt` matches `verify_jwt = false` in `supabase/config.toml` (checkout/portal validate the user JWT manually; webhook uses Polar signature).

## 5. Polar webhook

In Polar → Webhooks:

- **URL:** `https://ydficltfmssvqbrqpchn.supabase.co/functions/v1/polar-webhook`
- **Format:** Raw
- **API version:** 2026-04
- **Events:** `subscription.active`, `subscription.updated`, `subscription.created`, `subscription.canceled`, `subscription.revoked`, `customer.state_changed`, `checkout.updated`, `order.paid`, `order.updated`, `order.created`

**Important:** Enable `customer.state_changed` — this is the main event when customers upgrade/downgrade in the Polar portal.

## 6. Test flow

1. Reload extension in Chrome
2. Sign in → Settings → Account
3. Click **Upgrade — $10/mo** (Pro sandbox)
4. Complete Polar sandbox checkout
5. Return to success page → Open Settings — plan should show **Starter**
6. Test **Manage billing & cancel**
7. After upgrading in the portal, click **Refresh plan** in Settings (or wait for webhook sync)

## 7. Go live

1. Create the same products in Polar **Production**
2. Update secrets: `POLAR_ENVIRONMENT=production` and production product IDs
3. Create a production webhook endpoint
4. Redeploy functions

## Troubleshooting

- **Plan stuck after portal upgrade:** Click **Refresh plan** in Settings. Ensure Polar webhook includes `customer.state_changed` and `order.paid`. Redeploy `polar-webhook` and `sync-billing`.
- **Checkout opens but plan never updates:** Webhook not deployed, wrong secret, or Polar sandbox webhook missing `customer.state_changed`. Check Supabase → Edge Functions → Logs for `polar-webhook`. After deploy, retry checkout or replay the webhook delivery from Polar.
- **Success page shows raw HTML:** Redeploy `billing-return` (latest version sets `Content-Type: text/html`).
- **403 on webhook:** Wrong `POLAR_WEBHOOK_SECRET` or payload format not Raw.
- **401 on checkout:** User not signed in, or session expired.
- **`insufficient_scope` on Manage billing:** Regenerate `POLAR_ACCESS_TOKEN` with `customer_sessions:write` (see **Required token scopes** above).
- **CORS errors:** Extension origin should be allowed; functions return `Access-Control-Allow-Origin: *`.

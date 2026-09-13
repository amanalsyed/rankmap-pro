# Deploy Creem.io Licensing (Supabase Edge Functions)

RankMap Pro uses Creem.io for one-time payments with license key activation.

## Pricing

| Plan | Price | Type |
|---|---|---|
| Free | $0 | Limited features |
| Lifetime | $130 | One-time payment, unlimited features |

## Architecture

1. **Customer purchases** on Creem.io → Receives license key (format: `ABCDE-FGHIJ-KLMNO-PQRST-UVWXY`)
2. **Creem webhook** notifies Supabase of purchase with license details
3. **Customer activates** license key in extension
4. **Extension validates** key against database
5. **Extension activates** key using Creem API, linking it to user account
6. **User gets lifetime access**

## 1. Run the SQL migration

In **Supabase → SQL Editor**, run:

```
supabase/migrations/20260910_gumroad_licenses.sql
```

This creates the `licenses` table with Creem-specific columns.

## 2. Create Creem Product

### Via Creem Dashboard:

1. Go to https://creem.io/dashboard/products/new
2. Fill in product details:
   - **Name:** RankMap Pro - Lifetime Access
   - **Description:** (Add features list)
   - **Price:** $130 USD
   - **Billing type:** One-time
   - ✅ **Enable License Keys**
   - **Activation limit:** 1
   - **Expiration:** None (lifetime)
3. Click "Create product"
4. **Copy the Product ID** (format: `prod_...`)

### Via Creem CLI (alternative):

```bash
# Install CLI
brew tap armitage-labs/creem
brew install creem

# Login
creem login --api-key creem_test_YOUR_KEY

# Create product
creem products create \
  --name "RankMap Pro - Lifetime Access" \
  --price 13000 \
  --currency USD \
  --billing-type one-time \
  --license-keys true \
  --activation-limit 1
```

## 3. Get Your API Keys

1. Dashboard → **Developers** section
2. Copy your **API Key** (starts with `creem_test_` for test mode or `creem_live_` for production)
3. Toggle between Test/Live mode as needed

## 4. Set Supabase Secrets

**Project Settings → Edge Functions → Secrets**

| Secret | Value |
|---|---|
| `CREEM_API_KEY` | Your API key (test or live) |
| `CREEM_PRODUCT_ID` | Your product ID from step 2 |
| `CREEM_WEBHOOK_SECRET` | Webhook secret (from step 5) |

## 5. Setup Creem Webhook

In Creem Dashboard → **Developers → Webhooks**:

1. Click "Add endpoint"
2. **URL:** `https://ydficltfmssvqbrqpchn.supabase.co/functions/v1/creem-webhook`
3. **Events:** 
   - ✅ `checkout.completed`
   - ✅ `refund.created`
4. Click "Save"
5. **Copy the Webhook Secret** and add to Supabase secrets (step 4)

## 6. Deploy Edge Functions

```powershell
cd "C:\Users\DELL\Desktop\no website extension"

supabase functions deploy creem-webhook --no-verify-jwt
supabase functions deploy creem-validate-license --no-verify-jwt
supabase functions deploy creem-activate-license --no-verify-jwt
```

✅ **Already deployed!**

## 7. Create Checkout Link

You need to create a checkout session to get a checkout URL for customers.

### Option A: Via CLI
```bash
creem checkouts create --product prod_YOUR_PRODUCT_ID
```

### Option B: Via API
```bash
curl -X POST https://test-api.creem.io/v1/checkouts \
  -H "x-api-key: creem_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "prod_YOUR_PRODUCT_ID",
    "success_url": "https://chromewebstore.google.com/detail/YOUR_EXTENSION_ID"
  }'
```

Response will include:
```json
{
  "checkout_url": "https://creem.io/checkout/ck_ABC123..."
}
```

### Option C: Create a permanent checkout link

For a permanent link that doesn't expire:

1. Create a product checkout in Creem dashboard
2. Get the permanent checkout link
3. Or use the Creem hosted product page

## 8. Update Extension Code

Update these files with your checkout URL:

**`src/components/UpgradePlans.tsx`:**
```typescript
const CREEM_CHECKOUT_URL = 'https://creem.io/checkout/ck_YOUR_CHECKOUT_ID';
```

**`src/components/LicenseKeyInput.tsx`:**
```typescript
href="https://creem.io/checkout/ck_YOUR_CHECKOUT_ID"
```

Then rebuild:
```powershell
npm run build
```

## 9. Test Flow

### Purchase Test (in test mode):
1. Go to your checkout URL
2. Use test card: `4111 1111 1111 1111`
3. Complete purchase
4. Receive license key via email (format: `ABCDE-FGHIJ-KLMNO-PQRST-UVWXY`)

### Activation Test:
1. Install/reload extension
2. Sign in → Settings
3. Click "I have a license key"
4. Enter license key
5. Click "Activate"
6. Verify plan changes to "Lifetime"

### Webhook Test:
1. Check Supabase → Edge Functions → Logs
2. Look for `[Creem Webhook]` entries
3. Verify license was added to database

### Database Check:
1. Supabase → Table Editor → `licenses`
2. Verify your license appears with status "active"
3. Check `profiles` table → your user has `license_key` populated

## 10. Going Live

### Switch to Production Mode:

1. **Creem Dashboard:** Toggle to "Live" mode
2. **Create production product** (same settings as test)
3. **Get production API key** (starts with `creem_live_`)
4. **Update Supabase secrets:**
   - `CREEM_API_KEY`: Production key
   - `CREEM_PRODUCT_ID`: Production product ID
   - `CREEM_WEBHOOK_SECRET`: Production webhook secret
5. **Update webhook URL** in Creem (same URL, but in live mode)
6. **Create production checkout link**
7. **Update extension** with production checkout URL
8. **Build and publish** to Chrome Web Store

## Troubleshooting

**License validation fails:**
- Check `CREEM_API_KEY` is correct
- Check `CREEM_PRODUCT_ID` matches your product
- Check you're in the right mode (test vs live)

**License already activated error:**
- Each license can only activate once
- Purchase a new license or clear database for testing

**Webhook not working:**
- Check webhook URL is correct
- Check webhook events include `checkout.completed`
- Check Supabase function logs for errors
- Verify webhook secret matches

**Activation fails:**
- Check Creem API endpoint is reachable
- Check license key format is correct (5 groups of 5 chars)
- Check license hasn't been refunded

## Key Differences from Gumroad

| Feature | Creem.io | Gumroad |
|---|---|---|
| Fees | 3.9% + 40¢ | ~10% |
| License Format | `ABCDE-FGHIJ-KLMNO-PQRST-UVWXY` | `gumroad_abc123...` |
| Activation API | ✅ Built-in | ❌ Manual |
| Webhook Signature | HMAC-SHA256 | None |
| Tax Handling | Automatic (MoR) | Manual |
| Test Mode | ✅ Full sandbox | Limited |

## Summary

✅ **Lower fees** (3.9% + 40¢ vs Gumroad's 10%)  
✅ **Professional license management** with activation API  
✅ **Better developer experience** with TypeScript SDK and CLI  
✅ **Automatic tax compliance** as Merchant of Record  
✅ **Secure webhooks** with HMAC signature verification  
✅ **Full test mode** for development

---

**Need Help?**
- Creem Docs: https://docs.creem.io
- Creem Discord: https://discord.gg/creem
- Support: support@creem.io

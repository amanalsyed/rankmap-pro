# Website Content Updates Needed

## Summary
Your website messaging is mostly accurate but has **critical outdated references** to the old Polar payment system and manual sign-up flow. The extension now uses Creem.io with license key activation and auto-account creation.

---

## 1. HERO SECTION (Hero.tsx)
**Current:** ✅ Accurate - No changes needed

---

## 2. HOW IT WORKS (HowItWorks.tsx / site.ts)

### STEP 1 - NEEDS UPDATE

**Current:**
```
"Add RankMap Pro to Chrome in one click. Sign in with Google or email to sync your account."
```

**Should be:**
```
"Add RankMap Pro to Chrome. Purchase a license key and activate instantly — no sign-up forms, just enter your key and go."
```

**OR (if free plan exists):**
```
"Add RankMap Pro to Chrome. Start free with monthly limits, or purchase a lifetime license key for unlimited access."
```

---

## 3. PRICING SECTION (Pricing.tsx / site.ts)

### Subtitle - NEEDS UPDATE

**Current:**
```
"Start free. Upgrade inside the extension when you need more scans, audits, and enrichment. Payments secured by Polar."
```

**Should be:**
```
"Start free. Upgrade to Lifetime with a one-time purchase — unlimited scans, audits, and enrichment. Secure payments via Creem.io."
```

### Plans - NEEDS CLARIFICATION

**Current plans:**
- Free: $0
- Pro: $10/mo or $100/yr
- Lifetime: $130 one-time

**Questions:**
1. **Is Pro monthly/annual still available?** If not, remove it entirely
2. **If you're only selling Lifetime now**, update the plans to show just:
   - Free (limited)
   - Lifetime ($130 one-time, unlimited)

**Recommended:** Remove Pro monthly/annual plans if you're focusing on Creem Lifetime only.

### Footer Note - NEEDS UPDATE

**Current:**
```
"Paid plans are activated inside the extension after sign-in. Open Settings → Account to upgrade or manage billing."
```

**Should be:**
```
"After purchasing Lifetime, you'll receive a license key via email. Enter it in the extension (Settings → Account) to activate unlimited access. Each key can be used on one device."
```

---

## 4. FAQ SECTION (site.ts)

### FAQ: "How do I upgrade or manage billing?" - NEEDS MAJOR UPDATE

**Current:**
```
"Sign in inside the extension, open Settings → Account, and choose Pro (monthly or annual) or Lifetime. Payments are processed securely by Polar. Manage or cancel Pro subscriptions from the same panel."
```

**Should be:**
```
"Purchase a Lifetime license key from our website. After payment, you'll receive a license key via email. Open the extension, go to Settings → Account, enter your license key, and activate. Payments are processed securely by Creem.io. No subscriptions — pay once, use forever."
```

### NEW FAQ TO ADD: "How do license keys work?"

**Add this new FAQ:**
```
Q: How do license keys work?
A: After purchasing Lifetime access, you'll receive a license key via email (format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX). Enter this key in Settings → Account inside the extension to activate unlimited access. Each license can be used on one device. Your account syncs across browser sessions on that device.
```

### NEW FAQ TO ADD: "Do I need to create an account?"

**Add this new FAQ:**
```
Q: Do I need to create an account?
A: No manual sign-up required! When you activate your license key for the first time, an account is automatically created and linked to your license. Just enter your key and you're ready to go.
```

### EXISTING FAQ: "What is the Lifetime plan?" - GOOD, keep it

✅ Current text is accurate

---

## 5. INSTALL CTA / BUTTONS

### CTA buttons throughout site

**Current:** "Add to Chrome — Free" ✅ (This is fine if free plan exists)

**Note:** Make sure free plan is still available. If not, change to:
- "Get Started" or "Add to Chrome"

---

## 6. CONTACT/SUPPORT

### Consider adding:
- Link to email support for license key issues
- "Lost your license key?" recovery flow (if you have one)

---

## Summary of Required Changes

### CRITICAL (Must fix):
1. ❌ Change "Polar" → "Creem.io" in Pricing subtitle
2. ❌ Change "Polar" → "Creem.io" in FAQ about billing
3. ❌ Update FAQ to explain license key activation (not subscription management)
4. ❌ Update "How It Works" Step 1 to mention license key activation

### HIGH PRIORITY (Should fix):
5. ⚠️ Clarify pricing: Is Pro monthly/annual still sold? If not, remove it
6. ⚠️ Add new FAQs about license keys
7. ⚠️ Update Pricing footer note to explain license key delivery

### NICE TO HAVE:
8. 💡 Add "Lost license key?" support info
9. 💡 Add "One device per license" clarification in multiple places

---

## Files to Update

1. `website/content/site.ts` - Main content file
   - Line 13: heroSubtitle (optional update)
   - Line 165-181: STEPS array (Step 1)
   - Line 50: Pricing subtitle
   - Line 200-204: Pricing note
   - Line 258-261: FAQ about billing
   - Add 2 new FAQ entries about license keys

2. No changes needed to component files (Hero.tsx, Features.tsx, etc.) - they just read from site.ts

---

## Next Steps

1. **Confirm:** Is Pro monthly/annual still being sold, or just Lifetime?
2. **Update:** `website/content/site.ts` with the changes above
3. **Rebuild:** Website (if it's a Next.js site: `npm run build`)
4. **Deploy:** Updated website to production
5. **Test:** Click through all pages and verify messaging matches extension

---

## Questions to Answer

Before making changes, please confirm:

1. **Are you still selling Pro monthly/annual?** Or only Lifetime now?
2. **Do you have a free plan?** Or is it paid-only with Creem?
3. **Can users recover lost license keys?** Should this be in FAQ?
4. **Can users transfer a license to a new device?** If yes, how?

Once you answer these, I can make the exact updates to site.ts for you.

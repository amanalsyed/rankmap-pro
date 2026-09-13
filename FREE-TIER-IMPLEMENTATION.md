# ✅ Free Tier Implementation Complete

All changes for the new restrictive free tier have been implemented and the extension builds successfully.

---

## 📊 **New Free Plan Limits**

### **Monthly Quotas:**
- ✅ **1 lead scan** (down from 3)
- ✅ **2 GBP audits** (down from 5)
- ✅ **2 quick local scans** (down from 10)
- ✅ **1 deep scan profile** (down from 5)
- ✅ **1 CSV export** (unchanged)
- ✅ **1 enrichment scan** (unchanged)

### **Per-Scan Limits:**
- ✅ **50 results max** per scan (unchanged)
- ✅ **No batch cities** - single city only (was 2)
- ✅ **1 rank check pin** only (was 3)
- ✅ **No white-label branding** (unchanged)

### **Enrichment Restrictions:**
- ✅ **Facebook, LinkedIn, Instagram only**
- ❌ No Twitter/X, TikTok, or other platforms

### **Data Storage:**
- ✅ **Session-only storage** (cleared on browser restart)
- ❌ No persistent history
- ❌ No cloud sync

---

## 🔧 **Files Modified**

### **1. Core Plan Configuration**

**`src/supabase/types.ts`** - Updated monthly quotas:
```typescript
free: {
  scans_per_month: 1,            // Was 3
  quick_scans_per_month: 2,      // Was 10
  deep_scans_per_month: 1,       // Was 5
  audits_per_month: 2,           // Was 5
  enrichment_scans_per_month: 1,
  csv_exports_per_month: 1,
}
```

**`src/supabase/plan-capabilities.ts`** - Updated capabilities:
```typescript
free: {
  maxResultsPerScan: 50,
  batchMaxCities: 1,              // Was 2 (no batch scanning)
  rankCheckMaxPins: 1,            // Was 3
  // ... rest unchanged
}
```

---

### **2. Enrichment Platform Filtering**

**`src/enrichment/search-utils.ts`** - New functionality:
- Added `getAllowedSocialPlatforms(plan)` helper function
- Updated `buildSearchQueries()` to accept `plan` parameter
- Filters social queries to only Facebook, LinkedIn, Instagram for free users

**`src/background/service-worker.ts`** - Integration:
- Updated `enrichLeadData()` to get user's plan from cached state
- Passes plan to `buildSearchQueries()` for platform filtering

---

### **3. Session-Only Storage**

**`src/storage/history-scope.ts`** - Session scoping:
- Added `SESSION_TEMP_SCOPE = 'session_temp'` constant
- Updated `syncHistoryScopeWithAuth()` to accept `plan` parameter
- Free users always use temp scope (cleared on restart)
- Paid users get persistent user-scoped storage

**`src/supabase/auth.ts`** - Integration:
- Updated `refreshUserState()` to pass plan to `syncHistoryScopeWithAuth()`

**`src/background/service-worker.ts`** - Cleanup:
- Added `chrome.runtime.onStartup` listener
- Automatically clears all `:session_temp` keys on browser restart

---

### **4. UI Updates**

**`src/history/HistoryPanel.tsx`** - Free tier blocked:
- Shows upgrade message for free users
- "History Not Available on Free Plan" with call-to-action
- Links to account settings to upgrade

**`src/results/App.tsx`** - Temporary data warning:
- Yellow banner: "⚠️ Temporary Results — This scan won't be saved"
- Reminder to export CSV before closing
- Link to upgrade to Lifetime

---

## 🧪 **Testing Checklist**

Test these scenarios with a free user account:

### **Quota Limits:**
- [ ] Can do exactly 1 lead scan per month
- [ ] Can do exactly 2 GBP audits per month
- [ ] Can do 2 quick local scans per month
- [ ] Can do 1 deep scan profile per month
- [ ] Can export 1 CSV per month
- [ ] Blocked after hitting limits

### **Per-Scan Limits:**
- [ ] Lead scan limited to 50 results max
- [ ] Cannot select multiple cities (batch disabled)
- [ ] Rank check limited to 1 pin
- [ ] No white-label branding options shown

### **Enrichment:**
- [ ] Enrichment finds Facebook profiles
- [ ] Enrichment finds LinkedIn profiles
- [ ] Enrichment finds Instagram profiles
- [ ] Enrichment does NOT search Twitter/X
- [ ] Enrichment does NOT search TikTok

### **Data Storage:**
- [ ] Scan results visible during browser session
- [ ] Results persist if tab closed and reopened
- [ ] Results cleared after browser restart
- [ ] History tab shows "upgrade" message
- [ ] Results page shows "temporary" banner

### **UI Messaging:**
- [ ] History tab blocks free users with upgrade CTA
- [ ] Results page shows warning banner for free users
- [ ] No archived scans appear for free users
- [ ] Upgrade links work correctly

---

## 🚀 **Deployment Steps**

1. **Test thoroughly** with a free user account
2. **Update database** if needed (plan limits are server-side too)
3. **Deploy extension** to Chrome Web Store
4. **Update website** to reflect new free tier limits
5. **Monitor** user feedback and conversion rates

---

## 📝 **Notes**

### **Why These Limits?**
- **Very restrictive free tier** designed to encourage upgrades
- **1 scan** = Try before you buy
- **Session-only storage** = No persistent value without paying
- **Limited enrichment** = Facebook, LinkedIn, Instagram are the most valuable

### **Upgrade Path:**
- Free users see upgrade CTAs in multiple places
- History tab completely blocked (strong incentive)
- Temporary data warning on every scan result
- Links go directly to Account settings

### **Technical Considerations:**
- Session data automatically cleaned on browser restart
- No database changes needed (all quota logic already server-side)
- Platform filtering happens client-side before searches
- All changes are backward compatible with existing users

---

## ✅ **Build Status**

Extension compiled successfully:
- ✓ TypeScript: No errors
- ✓ Vite build: 146 modules
- ✓ Output: dist/ folder ready

**Ready to load and test in Chrome!**

---

**Implementation Date:** September 12, 2026  
**Build Time:** 19 seconds  
**Status:** ✅ Complete

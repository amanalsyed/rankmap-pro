# RankMap Pro — Admin Panel Setup

The admin dashboard lives at **`/admin`** on the marketing website. Only users with `is_super_admin = true` on their profile can access it.

## 1. Run the database migration

In Supabase → **SQL Editor**, run:

`supabase/migrations/20260913_admin_panel.sql`

## 2. Grant yourself super-admin

Run `SET-SUPER-ADMIN.sql` (edit the email first). Your account must exist in **Authentication → Users** with a password set.

## 3. Deploy Edge Functions

```bash
supabase functions deploy admin-api
supabase functions deploy log-activity
```

Redeploy if you updated license activation:

```bash
supabase functions deploy creem-activate-license
```

## 4. Configure the website

`website/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://ydficltfmssvqbrqpchn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
```

```bash
cd website
npm install
npm run dev
```

Open **http://localhost:3000/admin**

## 5. Production

- Add env vars to Vercel/hosting
- Set `ADMIN_PANEL_URL` in `src/supabase/config.ts` if your domain differs
- `/admin` is `noindex`

---

## Features (complete)

| Area | Capabilities |
|------|----------------|
| **Overview** | User counts, active today, usage totals, 30-day signup/activity charts, alerts |
| **Users** | Search (email, ID, license key), usage columns, suspend/restore/soft-delete/hard-delete, change plan, reset usage, impersonation link |
| **Licenses** | List, search, revoke, reassign to another user |
| **Feedback** | Inbox with category filter |
| **Activity** | Live extension events with type + date filters |
| **Audit log** | All admin actions logged server-side |
| **Export** | Download users CSV and usage CSV |
| **Extension** | Super-admins see an **Admin** button in the popup |

## Activity logging

The extension sends events via `log-activity` Edge Function:

- sign_in, sign_out
- scan_started, batch_scan_started
- local_scan, deep_scan
- license_activated (also logged server-side on activation)
- feedback_sent

Events appear in the **Activity** tab after users interact with the extension.

## Impersonation

Use **Impersonate** on a user detail panel. Open the generated magic link in an **incognito window** to sign in as that user for support. Action is logged in the audit log.

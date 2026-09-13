# RankMap Pro — Marketing Website

Static marketing site for [rankmappro.com](https://rankmappro.com), deployed on Vercel.

## Pages

- `/` — Homepage (hero, features, pricing, FAQ)
- `/privacy` — Privacy Policy
- `/terms` — Terms of Service

## Local development

```bash
cd website
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Set **Root Directory** to `website`.
4. Framework preset: **Next.js** (auto-detected).
5. Add environment variables (Project → Settings → Environment Variables):

   **Gmail (recommended — uses rankmappro@gmail.com):**
   - `GMAIL_USER` = `rankmappro@gmail.com`
   - `GMAIL_APP_PASSWORD` = [Google App Password](https://myaccount.google.com/apppasswords) (16 characters, no spaces)
   - `CONTACT_TO_EMAIL` = `rankmappro@gmail.com`

   To create a Google App Password: enable 2-Step Verification on the Google account, then go to Google Account → Security → App passwords → create one for "Mail".

   **Or Resend (alternative):**
   - `RESEND_API_KEY` — from [resend.com](https://resend.com)
   - `CONTACT_TO_EMAIL` = `rankmappro@gmail.com`

   For local dev, copy `.env.local.example` to `.env.local` and fill in `GMAIL_APP_PASSWORD`.

6. Deploy.
7. Add custom domain `rankmappro.com` in Vercel → Settings → Domains.
8. Point DNS to Vercel (A record `76.76.21.21` or CNAME `cname.vercel-dns.com`).

## After launch

- Add Chrome Web Store URL to `content/site.ts` (`CHROME_STORE_URL`).
- Use `https://rankmappro.com/privacy` in Chrome Web Store listing.
- Add `rankmappro.com` as authorized domain in Google Cloud OAuth.

# Shiprocket Ads — Launch

Launch Meta (Facebook/Instagram) campaigns straight from one screen, pre-filled for Indian D2C.

Four flows:

1. **New Campaign + Ad Set** — create a campaign and its first ad set together.
2. **New Ad Set → Existing Campaign** — add an ad set to a campaign you already have.
3. **Duplicate an Ad Set** — copy an ad set (and all its ads) into a new or existing campaign.
4. **New Catalog Campaign** — Advantage+ catalog ads: pick a catalog and product set, retarget or prospect, and build the catalog ad template with a live product preview.

Built with Next.js 14 (App Router), TypeScript and the Meta Marketing API (Graph API v23.0 by default). Facebook Login is server-side; the long-lived user token is stored in an encrypted, http-only cookie and never reaches the browser.

## Deploy on Vercel

1. Import this repo in Vercel (framework preset: Next.js).
2. Add the environment variables below in **Settings → Environment Variables**, then redeploy.
3. In your Meta app (developers.facebook.com):
   - Add the **Facebook Login** (or Facebook Login for Business) product.
   - Under Facebook Login → Settings, add `https://<your-domain>/api/auth/callback` to **Valid OAuth Redirect URIs**.
   - Under App settings → Basic, add your domain to **App domains**.
   - Request **Advanced access** for the permissions listed below (App Review), or test with users who have a role on the app.

### Environment variables

| Name | Required | What it is |
| --- | --- | --- |
| `FACEBOOK_APP_ID` | Yes | Meta app ID |
| `FACEBOOK_APP_SECRET` | Yes | Meta app secret (also used for `appsecret_proof` on every Graph call) |
| `SESSION_SECRET` | Yes | Random 32+ character string to encrypt the session cookie (`openssl rand -base64 32`) |
| `APP_URL` | No | Public URL, e.g. `https://ads-launch.vercel.app`. Defaults to the request host |
| `META_API_VERSION` | No | Graph API version, default `v23.0` |
| `FACEBOOK_CONFIG_ID` | No | Facebook Login for Business configuration ID. When set, permissions come from the configuration |
| `FACEBOOK_SCOPES` | No | Comma-separated override of the permissions requested |

### Permissions requested

| Permission | Why |
| --- | --- |
| `public_profile`, `email` | Your name and photo |
| `ads_management` | Create campaigns, ad sets, ads, ad copies |
| `ads_read` | Read campaigns and ad sets for the pickers |
| `business_management` | Find catalogs owned by the ad account's business |
| `catalog_management` | Read catalogs and product sets; link a pixel to a catalog |
| `pages_show_list`, `pages_read_engagement` | List Pages for the catalog ad identity |
| `instagram_basic` | Find the Instagram account connected to a Page |

## Run locally

```bash
cp .env.example .env.local   # fill in the three required values
npm install
npm run dev                  # http://localhost:3000
```

Add `http://localhost:3000/api/auth/callback` to the app's redirect URIs for local login.

## How it's organised

```
src/app/api/auth/*          Facebook OAuth (login → callback → long-lived token → encrypted cookie)
src/app/api/meta/[action]   Server proxy to the Graph API (lists, search, catalog health, launch)
src/lib/constants.ts        Objectives, goals, events, bid strategies, attribution, CTAs
src/lib/form.ts             Form defaults, duplicate pre-fill, flow context, validation
src/lib/launch.ts           Builds Marketing API payloads and runs the launch sequence
src/components/*            Launch UI
```

### Launch sequence

Everything is created **paused** first (campaign → ad set → catalog creative + ad, or ad copies for duplicates). If you chose *Active*, the app switches everything on only after every step succeeded, so a failed launch never spends money. If a step fails, the review dialog shows Facebook's own error and which objects were already created.

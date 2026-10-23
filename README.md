# Fastrr Ads Launcher

Create and launch Meta (Facebook and Instagram) ads from one guided screen, pre-filled for Indian D2C. Two sections: **Catalog Ads** (performance, product sets, create catalog ads) and **Launch** (start with an ad, choose where it runs, launch).

**How the whole app works, end to end: see [APP_GUIDE.md](./APP_GUIDE.md).**

Built with Next.js 14 (App Router), TypeScript and the Meta Marketing API (Graph API v23.0 by default). Facebook Login is server-side; the long-lived user token is stored in an encrypted, http-only cookie and never reaches the browser.

## Run locally

```bash
cp .env.example .env.local   # fill in the four required values (APP_URL=http://localhost:3000)
npm install
npm run dev                  # http://localhost:3000
```

Add `http://localhost:3000/api/auth/callback` to the Meta app's redirect URIs for local login.

## Deploy

1. Import the repo in Vercel (framework preset: Next.js), or build it on your own hosting.
2. Add the environment variables below, then redeploy.
3. In your Meta app (developers.facebook.com): add the **Facebook Login** product; add `<APP_URL>/api/auth/callback` to **Valid OAuth Redirect URIs**; add your domain to **App domains**; request **Advanced access** for the permissions below (or test with people who have a role on the app).

On your own hosting, make sure the gateway accepts request bodies of at least 4.5 MB and requests of at least 60 seconds.

### Environment variables

| Name | Required | What it is |
| --- | --- | --- |
| `FACEBOOK_APP_ID` | Yes | Meta app ID |
| `FACEBOOK_APP_SECRET` | Yes | Meta app secret (also used for `appsecret_proof` on every Graph call) |
| `SESSION_SECRET` | Yes | Random 32+ character string to encrypt the session cookie (`openssl rand -base64 32`) |
| `APP_URL` | Yes | The app's address, no trailing slash. The login callback is always `<APP_URL>/api/auth/callback` |
| `META_API_VERSION` | No | Graph API version, default `v23.0` |
| `FACEBOOK_CONFIG_ID` | No | Facebook Login for Business configuration ID |
| `FACEBOOK_SCOPES` | No | Comma-separated override of the permissions requested |
| `OPENROUTER_API_KEY` | No | Turns on AI-written ad text |
| `OPENROUTER_MODEL` | No | Default `qwen/qwen3.7-flash` |
| `OPENROUTER_BASE_URL` | No | Default `https://openrouter.ai/api/v1` |
| `OPENROUTER_DATA_COLLECTION` | No | `deny` = only providers that do not store prompts |
| `AI_MAX_VIDEO_SECONDS` | No | Longest video the AI watches by link, default 300 |
| `AI_VIDEO_COPY` | No | `off` = skip the low-resolution video copy |

### Permissions requested

| Permission | Why |
| --- | --- |
| `public_profile`, `email` | Your name and photo |
| `ads_management` | Create campaigns, ad sets, ads and creatives |
| `ads_read` | Read campaigns, ad sets and results |
| `business_management` | Find catalogs and pixels owned by the business |
| `catalog_management` | Read catalogs and product sets; link a pixel to a catalog |
| `pages_show_list`, `pages_read_engagement` | List Pages and read posts |
| `instagram_basic` | Find the Instagram account connected to a Page |

## Launch sequence

Everything is created **paused** first (campaign, ad set, creative, ad). If you chose *Active*, the app switches it all on only after every step worked, so a failed launch never spends money. If a step fails, the review shows Facebook's own error and which objects were already created.

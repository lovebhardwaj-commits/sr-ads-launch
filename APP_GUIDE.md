# Fastrr Ads Launcher: how the app works, end to end

## 1. What it is

A web app that lets a merchant create and launch **Meta (Facebook and Instagram) ads** from one guided screen, pre-filled for Indian D2C brands. It talks to Meta's Marketing API (Graph API) with the person's own Facebook login, so every campaign, ad set and ad is created in the ad account they pick. Nothing is stored on our side except an encrypted login cookie.

It has two sections in the left menu:

| Section | What it is for |
| --- | --- |
| **Catalog Ads** (`/catalog-ads`) | See how catalog ads perform, browse product sets, and create catalog ads. |
| **Launch** (`/launch`) | **Start with an Ad**: create any ad (catalog, image or video, or an existing post), choose where it runs, launch. |

The home page (`/`) goes straight to Catalog Ads. Both sections share the same "Start with an Ad" workspace for creating ads.

## 2. Signing in

1. The person clicks **Log in with Facebook** (`/login`).
2. The app asks Facebook for these permissions (`src/lib/config.ts`):

| Permission | Used for |
| --- | --- |
| `public_profile`, `email` | Name and photo in the app |
| `ads_management` | Create campaigns, ad sets, ads and creatives |
| `ads_read` | Read campaigns, ad sets and results |
| `business_management` | Find catalogs and pixels owned by the business |
| `catalog_management` | Read catalogs and product sets, link a pixel to a catalog |
| `pages_show_list`, `pages_read_engagement` | List Pages and read posts for ads |
| `instagram_basic` | Find the Instagram account connected to a Page |

3. Facebook returns a code. The server swaps it for a **long-lived token (about 60 days)** and puts it in an **encrypted, http-only cookie** (`sr_launch_session`, AES-256-GCM through `jose`). The token never reaches the browser's JavaScript.
4. If the person declines some permissions, a yellow notice says which options will not load, with a link to log in again.
5. The person picks an **ad account** at the top right (all accounts they can access). Everything below is scoped to it.

## 3. Catalog Ads

Four tabs. A date range picker (two-month calendar and presets from Today to Last 365 days) and a Refresh button sit above them.

- **Overview.** Starts empty with a **Check Performance** button, so nothing loads until asked. After that: **Catalog Ads vs Normal Ads** side by side (ads, reach, spend, ROAS, CTR, purchases, cost per purchase, frequency) and cards showing the difference.
- **My Catalog Ads.** A sortable, searchable table of the account's catalog ads: thumbnail, name, campaign and ad set, status, spend, ROAS, cost per result, CPM, CTR, purchases, purchase value. An ad counts as a catalog ad when its creative, ad set or campaign carries a product set or catalog.
- **Product Sets.** Pick a catalog. Its product sets are listed with how many catalog ads use each and their spend. **View products** shows the products and two checks (out-of-stock count, and a sample of product links opened to see they land on a product page). **Create ad** opens the Create Ad tab with that set already chosen.
- **Create Ad.** The "Start with an Ad" workspace for catalog ads only (section 4).

One request (`catalog-performance`) feeds Overview, My Catalog Ads and Product Sets, so switching tabs does not reload.

## 4. Launch: Start with an Ad

A four-step workspace. A step bar at the top shows the steps, the **Continue** button is named after what comes next, and a bar at the bottom lists **Still needed** items as chips; clicking one scrolls to the field and flashes it. A side panel shows a **live preview** (Feed, Stories, Reels) and a **Runs in** card (campaign, ad set and ad, with "New" on anything being created).

### Step 1: Ad
Pick the type:

- **Catalog ad.** Products from a catalog, chosen for each shopper by Meta. The card shows **Catalog**, **Dataset (pixel)** and **Product sets**, then two status lines: how many products the catalog has, and whether the pixel is linked to it (with a **Link pixel to catalog** button if not). Then the ad details: name, Page, format (carousel or single), media (images, slideshow, video), primary text, headline, description, button, link, and whether clicks open the website or the app.
- **Image or video ad.** One creative with its own text, link and button.
  - *Upload.* Images: JPG or PNG under 3 MB. Videos: MP4 or MOV up to 1 GB. A video is cut into 3.5 MB pieces that go through this app's server to Meta; a frame is taken as its thumbnail; Meta then processes it (a progress percentage and a **Check now** link show while it does).
  - *Write the text with AI* (only when `OPENROUTER_API_KEY` is set). See section 7.
- **Existing post.** Promote a Facebook or Instagram post. The post keeps its own text, headline, description, media and engagement; these cannot be changed, so AI text does not apply here. Recent posts are listed with playable previews. You choose the **Call to action** button (Shop now, Buy now, Order now, Get offer, Learn more, Sign up, Book now) and the **Website URL** it opens, which is prefilled from the Page's website. Both are required.

All ad types also have an optional **Tracking** part: a dataset (pixel) so Ads Manager tracks website events, and URL parameters (UTM) added to every link.

### Step 2: Campaign and ad set
A searchable list of the account's campaigns (running first, then by last-7-day spend). Pick one of:

- an **existing ad set**: the ad joins it as it is (budget, audience and schedule do not change);
- **New ad set in this campaign**;
- **New campaign** (a new campaign with its first ad set).

Only places this ad can go are shown (a catalog ad cannot go into a campaign using a different catalog or a non-Sales campaign; a normal ad cannot go into a catalog campaign). A link shows the hidden ones and the reason for each. Once you pick, the long list folds into a one-line summary with a **Change** link.

### Step 3: Setup (new campaign or new ad set only)
- **Campaign** (new campaigns): name, objective (Sales, Leads, Traffic, Engagement, Awareness; catalog ads are always Sales), Manual or **Advantage+ Shopping** setup, bid strategy (highest volume, cost per result goal, bid cap, ROAS goal for the Value goal), and **budget level** (one campaign budget, or a budget per ad set; daily or lifetime, lifetime needs an end date).
- **Ad set:** performance goal (for example maximise conversions or value of conversions), dataset (pixel), conversion event, attribution window, budget (when set at ad set level) and schedule.
- **Audience.**
  - *Advantage+ audience* (Meta widens from your suggestions) or *Original audience options*.
  - Locations (India by default), age, gender, languages, **detailed targeting** with one-click **suggested interests**, and an **Advantage detailed targeting** switch.
  - **Custom audiences and lookalikes** to include or exclude, and **saved audiences** (shown with what they contain; what you add is added on top).
  - An **estimated audience size** gauge (Narrow, Moderate, Broad) from Meta, when Meta provides it.
  - Catalog ads can retarget (viewed or added to cart, upsell, cross-sell, custom combination) or use a broad audience.
- **Placements.** Advantage+ placements, or manual: Facebook, Instagram, Messenger, Audience Network, with positions (Feed, Stories, Reels and more) for Facebook and Instagram, and **devices** (all, mobile only with iOS or Android, desktop only). Meta's rules are checked here (for example, Facebook Stories needs Feed or Instagram Stories, and Stories are mobile only).

Rarely changed settings sit in collapsed **Advanced** sections that show their current values.

### Step 4: Review and launch
Rows grouped as Campaign, Ad set and Ad (or "Ad set it joins", "Your ad", "Tracking" when the ad joins an existing ad set). For an existing ad set, warnings show where something will not deliver (campaign or ad set paused, schedule ended, pixel mismatch, no pixel). Choose **Paused** (default) or **Active** (needs a tick to confirm spending).

What happens on launch (`src/lib/launch.ts`):
1. Create the campaign (if new), always **paused**.
2. Create the ad set, paused.
3. Create the creative and the ad (with pixel tracking), paused.
4. Only if **Active** was chosen, and only after every step worked, switch everything on.

If a step fails, the screen shows Meta's own message and trace ID and lists what was already created (paused), so nothing is half-live.

**Result screen:** links to review the ad, ad set and campaign in Ads Manager, **Add this ad to another ad set** (same ad, new destination) and **Start a new ad**.

Switching ad account mid-flow keeps the ad's name, Page, text and format, and clears what belongs to the old account (catalog, product set, dataset, saved and custom audiences, uploaded media), with a notice saying so.

## 5. Rules the app enforces
- Every required field is checked live (the "Still needed" chips). Launch is disabled until none are left.
- Everything is created paused first; money is never spent on a failed launch.
- Meta's own errors are shown as they come back.
- Catalog ads need a Sales campaign, a catalog, a product set, a dataset linked to the catalog, and products in the catalog.
- Existing-post ads need a post, a button and a website link.

## 6. Under the hood

**Stack:** Next.js 14 (App Router), TypeScript, Meta Marketing API (Graph API `v23.0` by default), `jose` for the session cookie, `lucide-react` icons. No database.

**Request path:** the browser calls this app's own `/api/meta/<action>`; the server reads the session cookie, calls Graph with the token plus an `appsecret_proof`, and returns the data together with a log of the Graph calls it made. The **API log** panel (the `>_` icon, top right) shows those calls, with secrets removed, for debugging.

**Server actions** (`src/app/api/meta/[action]/route.ts`):

- *Read:* `adaccounts`, `campaigns`, `adsets`, `pixels`, `pages`, `posts`, `catalogs`, `product-sets`, `products`, `set-health`, `health`, `saved-audiences`, `custom-audiences`, `interest-suggestions`, `search` (locations, languages, interests), `catalog-performance`, `video-status`, `ai-status`, `me`.
- *Write:* `link-pixel`, `upload-image`, `upload-video` and `upload-video-chunk`, `audience-estimate`, `ai-copy`, `launch`.
- *Login:* `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`.

**Code map**

| Path | What is in it |
| --- | --- |
| `src/app/` | Pages (`/launch`, `/catalog-ads`, `/login`), API routes, global styles |
| `src/components/LaunchApp.tsx` | The Launch page: the workspace, then the result |
| `src/components/CatalogAdsApp.tsx` | The Catalog Ads section and its four tabs |
| `src/components/AdFirstWorkspace.tsx` | The four-step workspace (shared by both sections) |
| `src/components/StandardAdSection.tsx`, `AdSection.tsx` | Ad forms: image or video or post, and catalog |
| `src/components/LaunchForm.tsx` | The Setup step: campaign, ad set, audience, placements |
| `src/components/ReviewPanel.tsx`, `AdOnlyReview.tsx` | The Review step (new campaign or ad set, or an existing ad set) |
| `src/components/DestinationTree.tsx`, `Pickers.tsx` | The campaign and ad set picker, and its helpers (list text, which ads fit which campaigns) |
| `src/components/CatalogPanel.tsx` | Catalog, dataset and product set card |
| `src/components/AudienceControls.tsx`, `PlacementControls.tsx` | Audience extras and placement options |
| `src/components/AiCopy.tsx` | The "Write the text with AI" box |
| `src/lib/launch.ts` | Builds Meta's payloads and runs the launch sequence |
| `src/lib/form.ts`, `types.ts`, `constants.ts`, `positions.ts` | Form defaults and checks, shared types, option lists, placement positions |
| `src/lib/graph.ts`, `session.ts`, `config.ts` | Graph client, login cookie, settings and permissions |
| `src/lib/ai-copy.ts`, `video-proxy.ts`, `mp4-mux.ts` | AI ad text, the low-resolution video copy, the MP4 writer |

## 7. AI ad text (optional)

Shown for image and video ads when `OPENROUTER_API_KEY` is set. It looks at the creative and writes a **primary text, headline (up to 40 characters) and description**, using the team's own prompt. Options: language (English, Hinglish, Hindi) and an optional offer. **Use this text** fills the fields; **Undo** puts the old text back; **Write again** gives another version.

- **Inputs:** the creative, the Page name, the website's title and description (read safely by the server), the button, the offer and what is already written.
- **Video:** while the video uploads, the browser makes a small, silent, low-resolution copy of the whole video (2 frames a second, about 540 px, a few MB). The AI watches that, so it does not wait for Meta. If it cannot, the app falls back to the video on Meta by link, then to the cover image, and says which one the AI saw.
- **Checks on the answer:** text that sounds like a medical claim, a guaranteed result, a timeline, or an offer you did not give is **flagged** (never silently changed).
- **Privacy:** the creative and details are sent to the AI service (default model `qwen/qwen3.7-flash` through OpenRouter). The screen says so.

## 8. Settings (environment variables)

| Name | Required | What it is |
| --- | --- | --- |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Yes | The Meta app (the secret also signs every Graph call) |
| `SESSION_SECRET` | Yes | 32+ random characters that encrypt the login cookie |
| `APP_URL` | Yes | The app's address, no trailing slash. Login returns to `<APP_URL>/api/auth/callback` |
| `META_API_VERSION` | No | Graph version, default `v23.0` |
| `FACEBOOK_CONFIG_ID`, `FACEBOOK_SCOPES` | No | Facebook Login for Business configuration, or a permission override |
| `OPENROUTER_API_KEY` | No | Turns on AI ad text |
| `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL` | No | Model (default `qwen/qwen3.7-flash`) and gateway |
| `OPENROUTER_DATA_COLLECTION` | No | `deny` = only providers that do not store prompts |
| `AI_MAX_VIDEO_SECONDS` | No | Longest video watched by link (default 300) |
| `AI_VIDEO_COPY` | No | `off` = skip the low-resolution copy (use it with a model that listens to audio) |

## 9. Numbers worth knowing

| What | Value |
| --- | --- |
| Image | JPG or PNG, under 3 MB |
| Video | MP4 or MOV, up to 1 GB, sent in 3.5 MB pieces |
| One request to the server | The pieces and the video copy are sized to stay under 4.5 MB (Vercel's limit) |
| Server route time | 60 seconds; the AI call stops at 55 |
| Login | About 60 days, then log in again |

## 10. Running and deploying

- **Locally:** copy `.env.example` to `.env.local`, fill the four required values (`APP_URL=http://localhost:3000`), `npm install`, `npm run dev`. Add `http://localhost:3000/api/auth/callback` to the Meta app's redirect URIs.
- **Vercel:** import the repo, add the variables, set the redirect URI to `<APP_URL>/api/auth/callback`, add the domain under App domains.
- **Your own hosting:** the same build works. Check that the gateway accepts request bodies of at least 4.5 MB (nginx's default is 1 MB) and allows requests of at least 60 seconds. The piece size is the `CHUNK` constant in `StandardAdSection.tsx` if you want bigger pieces.
- **Meta side:** the app needs the Facebook Login product, and Advanced access (App Review) for the permissions above, or test with people who have a role on the app.

## 11. Good to know
- AI text, the audience-size gauge, interest suggestions and the custom audience list depend on what Meta and the AI service allow for the account; when one is unavailable it hides itself or shows a short message.
- The low-resolution video copy needs a recent Chrome or Edge (newer Safari and Firefox work too); otherwise the app uses the video on Meta.
- The Meta app's Advanced access and the ad account's own settings (for example a locked attribution window) can make Meta reject a launch; the message is shown as Meta sent it.
- On an existing post, Meta takes the button and link we send together with the post. Meta's documentation shows this for Facebook posts (with a Page-visit button) and for Instagram posts; it should also work for Shop now and the other buttons, but check the first real launch in Ads Manager.

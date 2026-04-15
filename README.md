=======

# Simple Timesheets

A lightweight Chrome extension for tracking time on client projects — inspired by Harvest, but free, open source, and yours.

## Features

- **Projects** with hourly rates and color coding
- **Timer** — start/stop, persists when the popup closes
- **Manual time entry** with H:MM format
- **¼ hour rounding** (per-project toggle) — rounds UP to nearest 15 min
- **Memos** on every entry (timer or manual)
- **Reports** — This Week / This Month / This Year / Custom date range
- **Export / Import JSON** — manual backup, zero setup required
- **Google Drive sync** (optional) — your data in your own Drive, we never see it
- **First-run onboarding** for new users

---

## Quick start (personal use)

1. Clone or download this repo
2. Copy `manifest.example.json` → `manifest.json`
3. Open `icons/generate.html` in a browser → click Download Icons → move the 3 PNGs into `icons/`
4. Go to `chrome://extensions` → enable Developer mode → Load unpacked → select this folder
5. Done — Drive sync is optional, the extension works fully without it

---

## Setup for Google Drive sync

> Only needed if you want automatic cross-device sync.

### Step 1 — Chrome Web Store developer account (for publishing)

A permanent extension ID is required for the Google Cloud setup. You get this by:

- Paying the one-time $5 Chrome Web Store developer fee
- Uploading the extension as a draft (don't publish yet)
- Copying the permanent extension ID from the draft listing

### Step 2 — Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a new project
2. **APIs & Services → Enable APIs** → enable **Google Drive API** and **People API**
3. **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: Simple Timesheets
   - Add scopes: `drive.appdata`, `userinfo.profile`, `userinfo.email`
   - Add yourself as a test user (for beta)
4. **Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Chrome Extension**
   - Paste your permanent extension ID from Step 1
5. Copy the **Client ID**

### Step 3 — Add the client ID

1. Open `manifest.json` (copied from `manifest.example.json`)
2. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with the real client ID
3. Reload the extension in `chrome://extensions`

> **Important:** `manifest.json` is in `.gitignore`. Never commit your real client ID to a public repo. `manifest.example.json` (with the placeholder) is committed instead.

---

## Protecting your client ID in git

If `manifest.json` was already committed before you added your client ID, it's safe — it only had the placeholder. Once you add a real client ID, it's gitignored automatically.

If git is already tracking `manifest.json`, run this once to stop tracking it:

```bash
git rm --cached manifest.json
```

---

## Privacy policy

`privacy-policy.html` is a standalone page that can be hosted on GitHub Pages.

**To publish it:**

1. Make the repo public on GitHub (recommended for an open-source extension)
2. Go to **Settings → Pages → Source → main branch → / (root)**
3. Your privacy policy will be at: `https://samuelkobe.github.io/Simple-Timesheets/privacy-policy.html`
4. Use that URL in the Chrome Web Store listing and Google Cloud OAuth consent screen
5. Update the GitHub link at the bottom of `privacy-policy.html` with your real username

---

## Publishing to the Chrome Web Store

1. Complete the Google Cloud setup above
2. Zip the extension folder (exclude `.git`, `.gitignore`, `icons/generate.html`, `manifest.example.json`, `README.md`, `privacy-policy.html`)
3. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Upload the zip → fill in store listing (description, screenshots)
5. Set privacy policy URL to your GitHub Pages URL
6. Submit for review

**For OAuth verification (to remove the "unverified app" warning for public users):**

- Start in testing mode (up to 100 test users, no review needed)
- When ready for public release, submit for Google's OAuth verification review
- Requires the privacy policy URL and a description of how Drive is used

---

## Rounding logic

| Raw time  | Rounded to  |
| --------- | ----------- |
| 1–15 min  | 15 min      |
| 16–30 min | 30 min      |
| 31–45 min | 45 min      |
| 46–60 min | 60 min (1h) |

---

## Data & storage

| Store                        | What                   | Size                  |
| ---------------------------- | ---------------------- | --------------------- |
| `chrome.storage.local`       | All projects & entries | Effectively unlimited |
| Google Drive `appDataFolder` | Optional sync backup   | Your Drive quota      |
| Export JSON                  | Manual backup          | A dated `.json` file  |

We have no servers. No analytics. No tracking. Your data never leaves your device unless you explicitly enable Drive sync — and even then, it goes to your own Google account, not ours.

---

## File structure

```
simple-timesheets/
├── manifest.json         # Your local copy (gitignored — add your client ID here)
├── manifest.example.json # Committed placeholder — copy this to manifest.json
├── popup.html            # Main UI
├── popup.js              # UI controller
├── background.js         # Service worker (badge, sync)
├── privacy-policy.html   # Hostable on GitHub Pages
├── css/
│   └── style.css
├── js/
│   ├── storage.js        # chrome.storage abstraction
│   ├── drive.js          # Google Drive API
│   └── utils.js          # Rounding, formatting, date helpers
└── icons/
    ├── generate.html     # Open in browser to regenerate PNGs
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

# <<<<<<< HEAD

> > > > > > > 9473509 (Initial extension build with onboarding, privacy policy, and manifest protection)
> > > > > > > main

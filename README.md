# @nominalcrew/webflow-kit

Vite plugin and CLI for Webflow site repos. Internal agency tooling, published publicly so projects can install it — the license does not grant third-party use.

It does **not** ship a CDN origin. Each site passes its own `cdn` (or `PUBLIC_ASSET_URL` in `.env`).

- **Dev:** HTTPS Vite on `https://localhost:3000`, then open the site’s Webflow staging URL with `?nc-env=dev` so the site loader pulls local modules.
- **Deploy:** upload `dist/bundle.js` and `dist/bundle.css` to R2 under `{name}/staging/` or `{name}/production/`.

This directory is the **package root**. Depend on it from each site; do not copy it into a site as source.

## What a site gets

| Command in the site repo | What the kit does |
| ------------------------ | ----------------- |
| `pnpm dev` (`vite`) | HTTPS dev server, CORS, CSS HMR, full reload on JS, open `WEBFLOW_STAGING_URL?nc-env=dev` |
| `pnpm deploy:staging` | Build unminified + sourcemaps, upload to `{name}/staging/` |
| `pnpm deploy:production` | Build minified, upload to `{name}/production/` |

The kit never uploads on save. Staging and production change only when you deploy.

## Add it to a site

```bash
pnpm add -D @nominalcrew/webflow-kit
```

Node.js 24+. Peer: Vite 8.

To work on the kit itself next to a site:

```json
{
  "devDependencies": {
    "@nominalcrew/webflow-kit": "link:../webflow-kit"
  }
}
```

### 1. Site `vite.config.js`

Load `.env` **before** the plugin so `process.env` is filled. Secrets and the CDN origin stay in the site `.env`, never in this package.

```js
import 'dotenv/config';
import { defineConfig } from 'vite';
import { webflowKit } from '@nominalcrew/webflow-kit';
import config from './webflow.config.js';

export default defineConfig(({ mode }) => ({
  plugins: [
    webflowKit({
      mode,
      ...config,
      cdn: process.env.PUBLIC_ASSET_URL
    })
  ]
}));
```

`cdn` is the public origin of your asset bucket (no trailing slash), for example `https://cdn.example.com`. After a deploy, the CLI prints `{cdn}/{name}/staging/bundle.js`.

You can also set `cdn` in `webflow.config.js`. The value passed to `webflowKit()` wins; if both are omitted, `PUBLIC_ASSET_URL` is read from the environment.

### 2. Site `webflow.config.js`

`name` is the R2 folder and must match the loader `data-project`.

```js
export default {
  name: 'my-site',
  assets: {
    js: 'bundle.js',
    css: 'bundle.css'
  },
  environments: {
    staging: { path: 'staging' },
    production: { path: 'production' }
  }
};
```

### 3. Site `.env`

Copy `.env.example` from this repo into the **site**.

| Variable | Required | Role |
| -------- | -------- | ---- |
| `PUBLIC_ASSET_URL` | for public deploy URLs | CDN origin passed as `cdn` |
| `WEBFLOW_STAGING_URL` | for `pnpm dev` | Published `*.webflow.io` URL; opened with `?nc-env=dev` |
| `R2_ACCOUNT_ID` | for deploy | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | for deploy | R2 access key |
| `R2_SECRET_ACCESS_KEY` | for deploy | R2 secret |
| `R2_BUCKET` | for deploy | Bucket name |
| `PROJECT_ID` | no | Overrides `name` for the R2 prefix |
| `R2_STAGING_PREFIX` | no | Defaults to `staging` |
| `R2_PRODUCTION_PREFIX` | no | Defaults to `production` |

Shared across sites on the same account: R2 keys, `PUBLIC_ASSET_URL`. Per site: `name` and `WEBFLOW_STAGING_URL`.

If `WEBFLOW_STAGING_URL` is empty, Vite still starts and logs a warning. It does not open a browser.

### 4. Webflow

One loader script in Custom Code (head). Host that loader on **your** CDN. `data-project` must equal `name`:

```html
<script src="https://cdn.example.com/loader.js" data-project="my-site"></script>
```

Do not paste `bundle.js` / `bundle.css` into Webflow. Publish the site once so `.webflow.io` exists, then put that URL in `WEBFLOW_STAGING_URL`.

### 5. Site `package.json` scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build:staging": "vite build --mode staging",
    "build:production": "vite build --mode production",
    "deploy:staging": "pnpm build:staging && webflow-kit deploy staging",
    "deploy:production": "pnpm build:production && webflow-kit deploy production"
  }
}
```

## Daily loop (from the site repo)

```bash
pnpm dev
```

1. Vite listens on `https://localhost:3000`.
2. The browser opens `{WEBFLOW_STAGING_URL}?nc-env=dev`.
3. The loader injects `@vite/client` and `/src/js/main.js`.
4. Save CSS → HMR. Save JS → full page reload.

First run: if scripts fail, open `https://localhost:3000` and accept the self-signed certificate, then reload Webflow.

```bash
pnpm deploy:staging      # QA / client on *.webflow.io (no ?nc-env=dev)
pnpm deploy:production   # live custom domain
```

R2 keys:

```text
{name}/staging/bundle.js
{name}/staging/bundle.css
{name}/production/bundle.js
{name}/production/bundle.css
```

CLI (same thing, from the site cwd after a build):

```bash
webflow-kit deploy staging
webflow-kit deploy production
```

## Plugin options

| Option | Default | Description |
| ------ | ------- | ----------- |
| `cdn` | `PUBLIC_ASSET_URL` | Public CDN origin (no trailing slash) |
| `mode` | from Vite | `staging` or `production` |
| `name` | `PROJECT_ID` or `project` | R2 folder |
| `entry` | `./src/js/main.js` | JS entry |
| `outDir` | `dist` | Build output |
| `assets.js` | `bundle.js` | Uploaded JS filename |
| `assets.css` | `bundle.css` | Uploaded CSS filename |
| `environments.staging.path` | `staging` | Folder under `{name}/` |
| `environments.production.path` | `production` | Folder under `{name}/` |
| `server` | HTTPS `localhost:3000` | Vite `server` overrides |

Default server: `host: true`, `strictPort: true`, `cors: true`, HMR on `wss://localhost:3000`. Override via `server` in `webflow.config.js` if a site cannot use port 3000 — then set the loader `data-dev-origin` to match.

## Publish

The package is on npm: [`@nominalcrew/webflow-kit`](https://www.npmjs.com/package/@nominalcrew/webflow-kit). License: `UNLICENSED` (agency use only).

To release a new version, bump `version` in `package.json`, then:

```bash
npm login
pnpm publish --access public
```

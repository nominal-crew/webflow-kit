export function isStagingSyncEnabled() {
  const raw = (process.env.WEBFLOW_SYNC_STAGING || process.env.WEBFLOW_SYNC_STAGING_CSS || 'true')
    .trim()
    .toLowerCase();

  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

export function getDevOpenUrl() {
  const raw = (process.env.WEBFLOW_STAGING_URL || '').trim();

  if (!raw) {
    return false;
  }

  try {
    const url = new URL(raw);
    url.searchParams.set('nc-env', 'dev');
    return url.href;
  } catch {
    console.warn(`[webflow-kit] Invalid WEBFLOW_STAGING_URL: ${raw}`);
    return false;
  }
}

function trimTrailingSlash(value = '') {
  return value.replace(/\/$/, '');
}

function resolveCdn(rawCdn) {
  return trimTrailingSlash(rawCdn || process.env.PUBLIC_ASSET_URL || '');
}

function resolveServer(rawServer = {}) {
  const port = rawServer.port ?? 3000;
  const open = Object.prototype.hasOwnProperty.call(rawServer, 'open') ? rawServer.open : getDevOpenUrl();

  return {
    host: true,
    strictPort: true,
    cors: true,
    open,
    ...rawServer,
    port,
    origin: rawServer.origin ?? `http://localhost:${port}`,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      clientPort: port,
      ...rawServer.hmr
    },
  };
}

export function resolveOptions(raw = {}) {
  const name = raw.name || process.env.PROJECT_ID || 'project';
  const entry = raw.entry || './src/js/main.js';
  const outDir = raw.outDir || 'dist';
  const mode = raw.mode || 'production';

  return {
    ...raw,
    name,
    entry,
    outDir,
    mode,
    cdn: resolveCdn(raw.cdn),
    assets: {
      js: raw.assets?.js || 'bundle.js',
      css: raw.assets?.css || 'bundle.css'
    },
    environments: {
      staging: {
        path: raw.environments?.staging?.path || 'staging'
      },
      production: {
        path: raw.environments?.production?.path || 'production'
      }
    },
    server: resolveServer(raw.server)
  };
}

export async function loadProjectConfig(cwd = process.cwd()) {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const configPath = resolve(cwd, 'webflow.config.js');
  const module = await import(pathToFileURL(configPath).href);

  return resolveOptions(module.default);
}

export function getCdnOrigin(options) {
  return trimTrailingSlash(options.cdn || '');
}

export function getProjectId(options) {
  return process.env.PROJECT_ID || options.name;
}

function trimPrefix(value = '') {
  return value.replace(/^\/+|\/+$/g, '');
}

function joinProjectPrefix(projectId, environmentPath) {
  const folder = trimPrefix(environmentPath);
  const id = trimPrefix(projectId);

  if (!folder) {
    return id;
  }

  if (folder === id || folder.startsWith(`${id}/`)) {
    return folder;
  }

  return `${id}/${folder}`;
}

export function getStagingPrefix(options) {
  return joinProjectPrefix(getProjectId(options), process.env.R2_STAGING_PREFIX || options.environments.staging.path);
}

export function getProductionPrefix(options) {
  return joinProjectPrefix(getProjectId(options), process.env.R2_PRODUCTION_PREFIX || options.environments.production.path);
}

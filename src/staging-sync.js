import { build } from 'vite';

import { isStagingSyncEnabled } from './config.js';
import { hasR2Credentials, uploadStagingAssets } from './r2-deploy.js';

const SOURCE_FILE = /\.(css|js|mjs|cjs)$/i;
const CSS_FILE = /\.css$/i;
const DEBOUNCE_MS = 400;

function createScheduler(task) {
  let timer;
  let running = false;
  let queued = false;

  async function run() {
    if (running) {
      queued = true;
      return;
    }

    running = true;

    try {
      await task();
    } catch (error) {
      console.error(`[webflow-kit] Staging sync failed: ${error.message}`);
    } finally {
      running = false;

      if (queued) {
        queued = false;
        await run();
      }
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  }

  schedule.now = run;

  return schedule;
}

async function buildStagingAssets(options) {
  process.env.WEBFLOW_STAGING_SYNC = '1';

  try {
    const result = await build({
      mode: 'staging',
      logLevel: 'silent',
      build: {
        write: false,
        emptyOutDir: false,
        sourcemap: false
      }
    });

    const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output || []);
    const js = outputs.find((item) => item.type === 'chunk' && item.fileName === options.assets.js);
    const css = outputs.find((item) => item.type === 'asset' && item.fileName === options.assets.css);

    if (!js?.code) {
      throw new Error(`Build did not produce ${options.assets.js}`);
    }

    if (!css) {
      throw new Error(`Build did not produce ${options.assets.css}`);
    }

    return {
      js: js.code,
      css: css.source
    };
  } finally {
    delete process.env.WEBFLOW_STAGING_SYNC;
  }
}

async function syncStaging(options) {
  console.log('[webflow-kit] Syncing staging JS + CSS…');

  const assets = await buildStagingAssets(options);
  const uploaded = await uploadStagingAssets(assets, options);

  for (const file of uploaded) {
    console.log(`[webflow-kit] Staging → ${file.publicUrl || file.destination}`);
  }
}

export function createStagingSyncPlugin(options) {
  let schedule = () => {};

  return {
    name: 'webflow-kit-staging-sync',
    apply: 'serve',
    configureServer() {
      if (!isStagingSyncEnabled()) {
        return;
      }

      if (!hasR2Credentials()) {
        console.warn('[webflow-kit] Staging is not synced: missing R2 credentials.');
        return;
      }

      schedule = createScheduler(() => syncStaging(options));

      return () => {
        schedule.now();
      };
    },
    handleHotUpdate({ file, server }) {
      const normalized = file.replaceAll('\\', '/');
      const isIgnored = normalized.includes('/node_modules/') || normalized.includes('/dist/');
      const isSource = SOURCE_FILE.test(normalized);
      const isCss = CSS_FILE.test(normalized);

      if (isSource && !isIgnored) {
        schedule();
      }

      if (isCss || isIgnored) {
        return;
      }

      server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    }
  };
}

import basicSsl from '@vitejs/plugin-basic-ssl';

import { resolveOptions } from './config.js';
import { createStagingSyncPlugin } from './staging-sync.js';

function createConfigPlugin(options) {
  const isProduction = options.mode === 'production';
  const isStagingSync = process.env.WEBFLOW_STAGING_SYNC === '1';

  return {
    name: 'webflow-kit-config',
    config() {
      return {
        build: {
          outDir: options.outDir,
          emptyOutDir: true,
          sourcemap: isStagingSync ? false : !isProduction,
          minify: isProduction ? 'oxc' : false,
          lib: {
            entry: options.entry,
            formats: ['es'],
            fileName: () => options.assets.js
          },
          rollupOptions: {
            output: {
              entryFileNames: options.assets.js,
              assetFileNames: (assetInfo) => {
                if (assetInfo.name?.endsWith('.css')) {
                  return options.assets.css;
                }

                return 'assets/[name][extname]';
              }
            }
          }
        },
        server: options.server
      };
    },
    configureServer() {
      if (options.server.open) {
        return;
      }

      if ((process.env.WEBFLOW_STAGING_URL || '').trim()) {
        return;
      }

      console.warn('[webflow-kit] Set WEBFLOW_STAGING_URL to open Webflow staging on `pnpm dev`.');
    }
  };
}

export function webflowKit(rawOptions = {}) {
  const options = resolveOptions(rawOptions);

  return [basicSsl(), createConfigPlugin(options), createStagingSyncPlugin(options)];
}

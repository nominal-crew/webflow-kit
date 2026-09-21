import basicSsl from '@vitejs/plugin-basic-ssl';

import { resolveOptions } from './config.js';

function createConfigPlugin(options) {
  const isProduction = options.mode === 'production';

  return {
    name: 'webflow-kit-config',
    config() {
      return {
        build: {
          outDir: options.outDir,
          emptyOutDir: true,
          sourcemap: !isProduction,
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

function createHmrPlugin() {
  return {
    name: 'webflow-kit-hmr',
    handleHotUpdate({ file, server }) {
      if (/\.css$/i.test(file.replaceAll('\\', '/'))) {
        return;
      }

      server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    }
  };
}

export function webflowKit(rawOptions = {}) {
  const options = resolveOptions(rawOptions);

  return [basicSsl(), createConfigPlugin(options), createHmrPlugin()];
}

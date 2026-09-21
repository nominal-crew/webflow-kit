import fs from 'node:fs/promises';
import path from 'node:path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getCdnOrigin, getProductionPrefix, getStagingPrefix, loadProjectConfig, resolveOptions } from './config.js';

const requiredEnvironmentVariables = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

function assertEnvironmentVariables() {
  for (const variable of requiredEnvironmentVariables) {
    if (!process.env[variable]) {
      throw new Error(`Missing environment variable: ${variable}`);
    }
  }
}

function createClient() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
}

export async function deployEnvironment(environment, rawOptions) {
  if (!['staging', 'production'].includes(environment)) {
    throw new Error('Environment must be either "staging" or "production".');
  }

  assertEnvironmentVariables();

  const options = resolveOptions(rawOptions ?? (await loadProjectConfig()));
  const { R2_BUCKET } = process.env;
  const prefix = environment === 'production' ? getProductionPrefix(options) : getStagingPrefix(options);
  const cdn = getCdnOrigin(options);
  const client = createClient();

  const files = [
    {
      source: path.resolve(options.outDir, options.assets.js),
      destination: `${prefix}/${options.assets.js}`,
      contentType: 'application/javascript; charset=utf-8'
    },
    {
      source: path.resolve(options.outDir, options.assets.css),
      destination: `${prefix}/${options.assets.css}`,
      contentType: 'text/css; charset=utf-8'
    }
  ];

  for (const file of files) {
    const body = await fs.readFile(file.source);

    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: file.destination,
        Body: body,
        ContentType: file.contentType,
        CacheControl: environment === 'production' ? 'public, max-age=3600' : 'no-cache'
      })
    );

    console.log(`Uploaded: ${file.destination}`);

    if (cdn) {
      console.log(`Public: ${cdn}/${file.destination}`);
    }
  }

  console.log(`Deployment complete: ${environment}`);
}

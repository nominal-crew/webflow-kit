import fs from 'node:fs/promises';
import path from 'node:path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getCdnOrigin, getProductionPrefix, getStagingPrefix, loadProjectConfig, resolveOptions } from './config.js';

const requiredEnvironmentVariables = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

let client;

export function hasR2Credentials() {
  return requiredEnvironmentVariables.every((variable) => Boolean(process.env[variable]));
}

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

function getClient() {
  client ??= createClient();
  return client;
}

function toBody(body) {
  return typeof body === 'string' ? Buffer.from(body) : body;
}

export async function uploadObject({ destination, body, contentType, cacheControl }) {
  assertEnvironmentVariables();

  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: destination,
      Body: toBody(body),
      ContentType: contentType,
      CacheControl: cacheControl
    })
  );
}

export async function uploadStagingAssets({ js, css }, rawOptions) {
  const options = resolveOptions(rawOptions ?? (await loadProjectConfig()));
  const prefix = getStagingPrefix(options);
  const cdn = getCdnOrigin(options);
  const cacheControl = 'no-cache, must-revalidate';

  const files = [
    {
      body: js,
      destination: `${prefix}/${options.assets.js}`,
      contentType: 'application/javascript; charset=utf-8'
    },
    {
      body: css,
      destination: `${prefix}/${options.assets.css}`,
      contentType: 'text/css; charset=utf-8'
    }
  ];

  const uploaded = [];

  for (const file of files) {
    await uploadObject({
      destination: file.destination,
      body: file.body,
      contentType: file.contentType,
      cacheControl
    });

    uploaded.push({
      destination: file.destination,
      publicUrl: cdn ? `${cdn}/${file.destination}` : ''
    });
  }

  return uploaded;
}

export async function deployEnvironment(environment, rawOptions) {
  if (!['staging', 'production'].includes(environment)) {
    throw new Error('Environment must be either "staging" or "production".');
  }

  assertEnvironmentVariables();

  const options = resolveOptions(rawOptions ?? (await loadProjectConfig()));
  const prefix = environment === 'production' ? getProductionPrefix(options) : getStagingPrefix(options);
  const cdn = getCdnOrigin(options);
  const cacheControl = environment === 'production' ? 'public, max-age=3600' : 'no-cache, must-revalidate';

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

    await uploadObject({
      destination: file.destination,
      body,
      contentType: file.contentType,
      cacheControl
    });

    console.log(`Uploaded: ${file.destination}`);

    if (cdn) {
      console.log(`Public: ${cdn}/${file.destination}`);
    }
  }

  console.log(`Deployment complete: ${environment}`);
}

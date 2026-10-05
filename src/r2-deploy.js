import fs from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  getCdnOrigin,
  getProductionPrefix,
  getStagingPrefix,
  loadProjectConfig,
  resolveOptions,
} from "./config.js";

const requiredEnvironmentVariables = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

let client;

export function hasR2Credentials() {
  return requiredEnvironmentVariables.every((variable) =>
    Boolean(process.env[variable]),
  );
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
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

function getClient() {
  client ??= createClient();
  return client;
}

function toBody(body) {
  return typeof body === "string" ? Buffer.from(body) : body;
}

function toPosix(relative) {
  return relative.split(path.sep).join("/");
}

const contentTypes = {
  css: "text/css; charset=utf-8",
  gif: "image/gif",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  otf: "font/otf",
  png: "image/png",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8",
  webmanifest: "application/manifest+json",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xml: "application/xml",
};

export function contentTypeFor(fileName) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  return contentTypes[extension] || "application/octet-stream";
}

export function isIncludedUpload(fileName, include) {
  if (!include?.length) {
    return true;
  }

  const extension = path.extname(fileName).slice(1).toLowerCase();
  return include.includes(extension);
}

async function listDistFiles(outDir, include) {
  let entries;

  try {
    entries = await fs.readdir(outDir, {
      recursive: true,
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Build output not found: ${outDir}`);
    }

    throw error;
  }

  return entries.flatMap((entry) => {
    if (!entry.isFile() || !isIncludedUpload(entry.name, include)) {
      return [];
    }

    const source = path.join(entry.parentPath, entry.name);
    const relative = toPosix(path.relative(outDir, source));

    return [
      {
        source,
        relative,
        contentType: contentTypeFor(entry.name),
      },
    ];
  });
}

export async function uploadObject({
  destination,
  body,
  contentType,
  cacheControl,
}) {
  assertEnvironmentVariables();

  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: destination,
      Body: toBody(body),
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

export async function uploadStagingAssets({ files: outputs }, rawOptions) {
  const options = resolveOptions(rawOptions ?? (await loadProjectConfig()));
  const prefix = getStagingPrefix(options);
  const cdn = getCdnOrigin(options);
  const cacheControl = "no-cache, must-revalidate";

  const files = outputs
    .filter((file) => isIncludedUpload(file.fileName, options.upload.include))
    .map((file) => ({
      body: file.body,
      destination: `${prefix}/${toPosix(file.fileName)}`,
      contentType: contentTypeFor(file.fileName),
    }));

  const uploaded = [];

  for (const file of files) {
    await uploadObject({
      destination: file.destination,
      body: file.body,
      contentType: file.contentType,
      cacheControl,
    });

    uploaded.push({
      destination: file.destination,
      publicUrl: cdn ? `${cdn}/${file.destination}` : "",
    });
  }

  return uploaded;
}

export async function deployEnvironment(environment, rawOptions) {
  if (!["staging", "production"].includes(environment)) {
    throw new Error('Environment must be either "staging" or "production".');
  }

  assertEnvironmentVariables();

  const options = resolveOptions(rawOptions ?? (await loadProjectConfig()));
  const prefix =
    environment === "production"
      ? getProductionPrefix(options)
      : getStagingPrefix(options);
  const cdn = getCdnOrigin(options);
  const cacheControl =
    environment === "production"
      ? "public, max-age=3600"
      : "no-cache, must-revalidate";

  const files = (
    await listDistFiles(options.outDir, options.upload.include)
  ).map((file) => ({
    source: file.source,
    destination: `${prefix}/${file.relative}`,
    contentType: file.contentType,
  }));

  if (files.length === 0) {
    throw new Error(`No files to upload in ${options.outDir}`);
  }

  for (const file of files) {
    const body = await fs.readFile(file.source);

    await uploadObject({
      destination: file.destination,
      body,
      contentType: file.contentType,
      cacheControl,
    });

    console.log(`Uploaded: ${file.destination}`);

    if (cdn) {
      console.log(`Public: ${cdn}/${file.destination}`);
    }
  }

  console.log(`Deployment complete: ${environment}`);
}

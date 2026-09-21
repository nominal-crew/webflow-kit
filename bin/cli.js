#!/usr/bin/env node

import 'dotenv/config';

import { deployEnvironment, loadProjectConfig } from '../src/index.js';

function printUsage() {
  console.log(`Usage:
  webflow-kit deploy <staging|production>`);
}

const [command, argument] = process.argv.slice(2);

try {
  if (command === 'deploy' && ['staging', 'production'].includes(argument)) {
    const options = await loadProjectConfig();
    await deployEnvironment(argument, options);
  } else {
    printUsage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

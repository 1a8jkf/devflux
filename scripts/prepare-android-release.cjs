/* global __dirname */
const path = require('node:path');
const { getConfig } = require('expo/config');
const { compileModsAsync } = require('expo/config-plugins');
const withDevFluxAndroid = require('../plugins/withDevFluxAndroid');

async function prepare(projectRoot = path.resolve(__dirname, '..')) {
  const { exp } = getConfig(projectRoot, { skipPlugins: true });
  await compileModsAsync(withDevFluxAndroid(exp), {
    projectRoot, platforms: ['android'], ignoreExistingNativeFiles: false,
  });
}

module.exports = { prepare };
if (require.main === module) prepare().catch(error => { console.error(error.message); process.exitCode = 1; });

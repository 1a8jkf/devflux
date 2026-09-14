const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('prebuild removes background service and permission leftovers without removing other services', () => {
  const callbacks = {};
  const api = { AndroidConfig: { Manifest: { getMainApplicationOrThrow: value => value.manifest.application[0] } } };
  for (const name of ['withAppBuildGradle','withGradleProperties','withAndroidManifest','withMainApplication']) api[name]=(config,fn)=>{callbacks[name]=fn;return config;};
  api.withDangerousMod=config=>config;
  const context={module:{exports:{}},require:name=>name==='expo/config-plugins'?api:require(name)};
  vm.runInNewContext(fs.readFileSync('plugins/withDevFluxAndroid.js','utf8'),context);
  context.module.exports({});
  const modResults={manifest:{
    'uses-permission': ['INTERNET','FOREGROUND_SERVICE','FOREGROUND_SERVICE_SPECIAL_USE','POST_NOTIFICATIONS'].map(name=>({$:{'android:name':'android.permission.'+name}})),
    application:[{$:{},service:[{$:{'android:name':'.DevFluxService'}},{$:{'android:name':'.OtherService'}}]}],
  }};
  callbacks.withAndroidManifest({modResults});
  assert.equal(modResults.manifest.application[0].service.length,1);
  assert.equal(modResults.manifest.application[0].service[0].$['android:name'],'.OtherService');
  assert.equal(modResults.manifest['uses-permission'].length,1);
  for(const file of ['src/components/BackgroundSessionControl.tsx','src/services/BackgroundSessionService.ts','native-src/DevFluxModule.kt','native-src/DevFluxService.kt']) assert.equal(fs.existsSync(file),false);
});

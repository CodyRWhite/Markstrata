'use strict';

const build = require('@microsoft/sp-build-web');

// Optional: load SPFX_SERVE_TENANT_DOMAIN from a local .env so the workbench URL
// can be set without committing tenant details.
require('dotenv').config();

build.addSuppression(/Warning/gi);

if (process.env.SPFX_SERVE_TENANT_DOMAIN) {
  console.log(`Using tenant: ${process.env.SPFX_SERVE_TENANT_DOMAIN}`);
}

const getTasks = build.rig.getTasks;
build.rig.getTasks = function () {
  const result = getTasks.call(build.rig);
  result.set('serve', result.get('serve-deprecated'));
  return result;
};

build.initialize(require('gulp'));

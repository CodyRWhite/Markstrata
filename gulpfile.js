'use strict';

const path = require('path');
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

// SPFx 1.23's webpack configuration has no rule for font files referenced from
// a stylesheet, so KaTeX's bundled CSS cannot resolve its own woff2 files. The
// fonts ship with the solution rather than coming from a CDN, so the rule is
// added back here.

build.configureWebpack.mergeConfig({
  additionalConfiguration: (generatedConfiguration) => {
    generatedConfiguration.resolve = generatedConfiguration.resolve || {};
    generatedConfiguration.resolve.alias = Object.assign({}, generatedConfiguration.resolve.alias, {
      fonts: path.resolve(__dirname, 'node_modules/katex/dist/fonts')
    });
    return generatedConfiguration;
  }
});

/*
 * SPFx 1.23 resolves url() references in a stylesheet as module requests, so
 * KaTeX's own `url(fonts/KaTeX_*.woff2)` lines no longer resolve and the build
 * fails. The fonts ship inside the solution rather than coming from a CDN, so
 * the alias points those requests back at the package they belong to.
 */
build.configureWebpack.mergeConfig({
  additionalConfiguration: (generatedConfiguration) => {
    generatedConfiguration.resolve = generatedConfiguration.resolve || {};
    generatedConfiguration.resolve.alias = Object.assign({}, generatedConfiguration.resolve.alias, {
      fonts: path.resolve(__dirname, 'node_modules', 'katex', 'dist', 'fonts')
    });
    return generatedConfiguration;
  }
});

build.initialize(require('gulp'));

const { existsSync } = require('fs')

/** @type {import('./lib/install')} */
let utils

try {
  utils = require('./lib/install')
} catch {}

async function install() {
  let version = process.env.GOCQHTTP_VERSION || 'v1.0.0-rc3'
  if (version === 'latest') {
    version = await utils.getLatestRelease()
  }

  await utils.downloadRelease(version)
}

if (utils && !existsSync(__dirname + '/bin')) {
  install()
}

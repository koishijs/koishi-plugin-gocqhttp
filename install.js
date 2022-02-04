const { existsSync } = require('fs')

async function install() {
  const {
    downloadRelease,
    getLatestRelease,
  } = require('./lib/install')

  let version = process.env.GOCQHTTP_VERSION || 'v1.0.0-beta8-fix2'
  if (version === 'latest') {
    version = await getLatestRelease()
  }

  await downloadRelease(version)
}

if (!existsSync(__dirname + '/bin')) {
  install()
}

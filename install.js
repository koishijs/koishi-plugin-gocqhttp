async function install() {
  const {
    downloadRelease,
    getReleaseByTag,
    getLatestRelease,
  } = require('./lib/install')

  const version = process.env.GOCQHTTP_VERSION || 'v1.0.0-beta8-fix2'
  const release = version === 'latest'
    ? await getLatestRelease('Mrs4s/go-cqhttp')
    : await getReleaseByTag('Mrs4s/go-cqhttp', version)
  await downloadRelease(release)
}

if (__dirname.includes('node_modules')) {
  install()
}

async function install() {
  const {
    downloadRelease,
    getReleaseByTag,
    getLatestRelease,
  } = require('./lib/install')
  const release =
    process.env.GOCQHTTP_LATEST_RELEASE === 'true'
      ? await getLatestRelease('Mrs4s/go-cqhttp')
      : await getReleaseByTag('Mrs4s/go-cqhttp', 'v1.0.0-beta8-fix2')
  await downloadRelease(release);
}

if (__dirname.includes('node_modules')) {
  install()
}

import axios from 'axios'
import { createWriteStream, existsSync, promises as fsp } from 'fs'
import { components } from '@octokit/openapi-types'
import { resolve } from 'path'
import { extract } from 'tar'

type Release = components['schemas']['release']

function getArch() {
  switch (process.arch) {
    case 'x32': return '386'
    case 'x64': return 'amd64'
    case 'arm64': return 'arm64'
    case 'arm': return 'armv7'
  }

  throw new Error(`architecture "${process.arch}" is not supported`)
}

function getPlatform() {
  switch (process.platform) {
    case 'darwin': return 'darwin'
    case 'linux': return 'linux'
    case 'win32': return 'windows'
  }

  throw new Error(`platform "${process.platform}" is not supported`)
}

export async function getLatestRelease(repo: string) {
  const { data } = await axios.get<Release[]>(`https://api.github.com/repos/${repo}/releases`)
  return data[0].tag_name
}

export async function downloadRelease(tag: string) {
  const arch = getArch()
  const platform = getPlatform()
  const outDir = resolve(__dirname, '../bin')

  if (existsSync(outDir)) return

  const name = `go-cqhttp_${platform}_${arch}.${platform === 'windows' ? 'exe' : 'tar.gz'}`
  const mirror = process.env.GITHUB_MIRROR || 'https://download.fastgit.org'
  const url = `${mirror}/Mrs4s/go-cqhttp/releases/download/${tag}/${name}`
  const [{ data: stream }] = await Promise.all([
    axios.get<NodeJS.ReadableStream>(url, { responseType: 'stream' }),
    fsp.mkdir(outDir, { recursive: true }),
  ])

  return new Promise<void>(async (resolve, reject) => {
    stream.on('end', resolve)
    stream.on('error', reject)
    if (platform === 'windows') {
      stream.pipe(createWriteStream(outDir + '/go-cqhttp'))
    } else {
      stream.pipe(extract({ cwd: outDir, newer: true }, ['go-cqhttp']))
    }
  }).catch(() => fsp.rm(outDir, { force: true, recursive: true }))
}

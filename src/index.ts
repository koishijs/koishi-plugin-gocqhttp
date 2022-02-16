import { Context, interpolate, Logger, Schema } from 'koishi'
import onebot, { OneBotBot } from '@koishijs/plugin-adapter-onebot'
import {} from '@koishijs/plugin-manager'
import { spawn } from 'cross-spawn'
import { ChildProcess } from 'child_process'
import { resolve } from 'path'
import { promises as fsp } from 'fs'
import { URL } from 'url'
import strip from 'strip-ansi'

const { mkdir, copyFile, readFile, writeFile } = fsp

declare module 'koishi' {
  interface Bot {
    qrcode?: string
  }

  namespace Bot {
    interface BaseConfig {
      gocqhttp?: boolean
    }
  }
}

declare module '@koishijs/plugin-manager' {
  namespace BotProvider {
    interface Data {
      qrcode?: string
    }
  }
}

declare module '@koishijs/plugin-adapter-onebot/lib/bot' {
  interface OneBotBot {
    process: ChildProcess
  }
}

export const logger = new Logger('gocqhttp')

export const name = 'go-cqhttp'

export interface Config {
  root?: string
  logLevel?: number
}

export const Config: Schema<Config> = Schema.object({
  root: Schema.string().description('存放账户文件的目录。').default('accounts'),
})

const logLevelMap = {
  DEBUG: 'debug',
  INFO: 'debug',
  WARNING: 'warn',
  ERROR: 'error',
  FATAL: 'error',
}

async function start(bot: OneBotBot, config: Config) {
  // create working folder
  const cwd = resolve(bot.app.baseDir, config.root, bot.selfId)
  const file = '/go-cqhttp' + (process.platform === 'win32' ? '.exe' : '')
  await mkdir(cwd, { recursive: true })
  await copyFile(resolve(__dirname, '../bin/go-cqhttp'), cwd + file)

  // create config.yml
  const { port, host = 'localhost' } = bot.app.options
  const { path = '/onebot' } = bot.app.registry.get(onebot).config
  const template = await readFile(resolve(__dirname, '../template.yml'), 'utf8')
  await writeFile(cwd + '/config.yml', interpolate(template, {
    bot: bot.config,
    adapter: bot.adapter.config,
    endpoint: bot.config.endpoint && new URL(bot.config.endpoint),
    selfUrl: `${host}:${port}${path}`,
  }, /\$\{\{(.+?)\}\}/g))

  // spawn go-cqhttp process
  bot.process = spawn('.' + file, ['-faststart'], { cwd })

  return new Promise<void>((resolve, reject) => {
    bot.process.stdout.on('data', (data) => {
      data = strip(data.toString()).trim()
      if (!data) return
      for (const line of data.trim().split('\n')) {
        const text = line.slice(23)
        const [type] = text.split(']: ', 1)
        if (type in logLevelMap) {
          logger[logLevelMap[type]](text.slice(type.length + 3))
        } else {
          logger.info(line.trim())
        }
        if (text.includes('qrcode.png')) {
          setQRCode(bot, cwd)
        } else if (text.includes('アトリは、高性能ですから')) {
          resolve()
          bot.qrcode = null
          bot.app.console?.bots?.refresh()
        }
      }
    })

    bot.process.on('exit', () => {
      bot.process = null
      reject()
    })

    if (bot.config.protocol === 'ws-reverse') {
      resolve()
    }
  })
}

async function setQRCode(bot: OneBotBot, cwd: string) {
  const buffer = await fsp.readFile(cwd + '/qrcode.png')
  bot.qrcode = 'data:image/png;base64,' + buffer.toString('base64')
  bot.app.console?.bots?.refresh()
}

export function apply(ctx: Context, config: Config) {
  logger.level = config.logLevel || 3

  ctx.on('bot-connect', async (bot: OneBotBot) => {
    if (!bot.config.gocqhttp) return
    return start(bot, config)
  })

  ctx.on('bot-disconnect', async (bot: OneBotBot) => {
    if (!bot.config.gocqhttp) return
    bot.process?.kill()
  })

  ctx.using(['console.bots'], (ctx) => {
    ctx.console.bots.extend((bot) => ({
      qrcode: bot.qrcode,
    }))

    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })
  })
}

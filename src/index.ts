import { Context, Dict, interpolate, Logger, Schema } from 'koishi'
import OneBotBot from '@koishijs/plugin-adapter-onebot'
import {} from '@koishijs/plugin-market'
import { spawn } from 'cross-spawn'
import { ChildProcess } from 'child_process'
import { resolve } from 'path'
import { promises as fsp } from 'fs'
import strip from 'strip-ansi'
import { DataService } from '@koishijs/plugin-console'

const { mkdir, copyFile, readFile, writeFile } = fsp

declare module '@koishijs/plugin-console' {
  namespace Console {
    interface Services {
      gocqhttp: Launcher
    }
  }
}

declare module '@satorijs/adapter-onebot/lib/bot' {
  interface OneBotBot {
    qrcode?: string
    process: ChildProcess
  }

  namespace OneBotBot {
    interface BaseConfig {
      gocqhttp?: boolean
    }
  }
}

interface Data {
  qrcode?: string
}

export const logger = new Logger('gocqhttp')

const logLevelMap = {
  DEBUG: 'debug',
  INFO: 'debug',
  WARNING: 'warn',
  ERROR: 'error',
  FATAL: 'error',
}

class Launcher extends DataService<Dict<Data>> {
  data: Dict<Data> = Object.create(null)
  templateTask: Promise<string>

  constructor(ctx: Context, private config: Launcher.Config) {
    super(ctx, 'gocqhttp')
    logger.level = config.logLevel || 3

    ctx.on('bot-connect', async (bot: OneBotBot<Context>) => {
      if (!bot.config.gocqhttp) return
      return this.connect(bot)
    })

    ctx.on('bot-disconnect', async (bot: OneBotBot<Context>) => {
      if (!bot.config.gocqhttp) return
      return this.disconnect(bot)
    })

    ctx.using(['console.config'], (ctx) => {
      ctx.console.addEntry({
        dev: resolve(__dirname, '../client/index.ts'),
        prod: resolve(__dirname, '../dist'),
      })
    })
  }

  private async getTemplate() {
    const filename = this.config.template
      ? resolve(this.ctx.baseDir, this.config.template)
      : resolve(__dirname, '../template.yml')
    return readFile(filename, 'utf8')
  }

  private async getConfig(bot: OneBotBot<Context>) {
    const template = await (this.templateTask ||= this.getTemplate())
    const config = { ...bot.config }
    if ('endpoint' in config) {
      config.endpoint = `0.0.0.0:${new URL(config.endpoint).port}`
    }
    if ('path' in config) {
      const { port, host = 'localhost' } = bot.ctx.options
      config['selfUrl'] = `${host}:${port}${config.path}`
    }
    return interpolate(template, config, /\$\{\{(.+?)\}\}/g)
  }

  async get() {
    return this.data
  }

  async connect(bot: OneBotBot<Context>) {
    // create working folder
    const cwd = resolve(bot.ctx.baseDir, this.config.root, bot.selfId)
    const file = '/go-cqhttp' + (process.platform === 'win32' ? '.exe' : '')
    await mkdir(cwd, { recursive: true })
    await copyFile(resolve(__dirname, '../bin/go-cqhttp'), cwd + file)

    // create config.yml
    await writeFile(cwd + '/config.yml', await this.getConfig(bot))

    // spawn go-cqhttp process
    bot.process = spawn('.' + file, ['-faststart'], { cwd })

    return new Promise<void>((resolve, reject) => {
      bot.process.stdout.on('data', async (data) => {
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
            const buffer = await fsp.readFile(cwd + '/qrcode.png')
            this.data[bot.sid] = {
              qrcode: 'data:image/png;base64,' + buffer.toString('base64'),
            }
            this.refresh()
          } else if (text.includes('アトリは、高性能ですから')) {
            resolve()
            this.data[bot.sid] = {}
            this.refresh()
          }
        }
      })

      bot.process.on('exit', () => {
        bot.process = null
        reject(new Error())
      })

      if (bot.config.protocol === 'ws-reverse') {
        resolve()
      }
    })
  }

  async disconnect(bot: OneBotBot<Context>) {
    bot.process?.kill()
  }
}

namespace Launcher {
  export interface Config {
    root?: string
    template?: string
    logLevel?: number
  }

  export const Config: Schema<Config> = Schema.object({
    root: Schema.string().description('存放账户文件的目录。').default('accounts'),
    logLevel: Schema.number().description('输出日志等级。').default(3),
  })
}

export default Launcher

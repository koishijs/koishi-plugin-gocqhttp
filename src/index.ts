import { Context, Dict, interpolate, Logger, Schema } from 'koishi'
import OneBotBot from '@koishijs/plugin-adapter-onebot'
import { DataService } from '@koishijs/plugin-console'
import {} from '@koishijs/plugin-market'
import { spawn } from 'cross-spawn'
import { ChildProcess } from 'child_process'
import { resolve } from 'path'
import { promises as fsp } from 'fs'
import strip from 'strip-ansi'

const { mkdir, copyFile, readFile, writeFile } = fsp

declare module '@koishijs/plugin-console' {
  namespace Console {
    interface Services {
      gocqhttp: Launcher
    }
  }

  interface Events {
    'gocqhttp/write'(sid: string, text: string): void
  }
}

declare module '@satorijs/adapter-onebot/lib/bot' {
  interface OneBotBot {
    process: ChildProcess
  }

  namespace OneBotBot {
    interface BaseConfig {
      gocqhttp?: GoCqhttpConfig
    }
  }
}

interface GoCqhttpConfig {
  enabled: boolean
  password?: string
}

export const logger = new Logger('gocqhttp')

const logLevelMap = {
  DEBUG: 'debug',
  INFO: 'debug',
  WARNING: 'warn',
  ERROR: 'error',
  FATAL: 'error',
}

namespace Data {
  export type Status =
    | 'success'
    | 'init'
    | 'sms'
    | 'qrcode'
    | 'slider'
    | 'captcha'
    | 'sms-confirm'
    | 'sms-or-qrcode'
    | 'slider-or-qrcode'
}

interface Data {
  status: Data.Status
  image?: string
  phone?: string
}

class Launcher extends DataService<Dict<Data>> {
  payload: Dict<Data> = Object.create(null)
  templateTask: Promise<string>

  constructor(ctx: Context, private config: Launcher.Config) {
    super(ctx, 'gocqhttp')
    logger.level = config.logLevel || 3

    ctx.on('bot-connect', async (bot: OneBotBot<Context>) => {
      if (!bot.config.gocqhttp?.enabled) return
      return this.connect(bot)
    })

    ctx.on('bot-disconnect', async (bot: OneBotBot<Context>) => {
      if (!bot.config.gocqhttp?.enabled) return
      return this.disconnect(bot)
    })

    ctx.using(['console.config'], (ctx) => {
      ctx.console.addEntry({
        dev: resolve(__dirname, '../client/index.ts'),
        prod: resolve(__dirname, '../dist'),
      })
    })

    ctx.console.addListener('gocqhttp/write', (sid, text) => {
      const bot = ctx.bots[sid] as OneBotBot<Context>
      return new Promise<void>((resolve, reject) => {
        bot.process.stdin.write(text + '\n', (error) => {
          error ? reject(error) : resolve()
        })
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
    const config = {
      message: JSON.stringify(this.config.message),
      ...bot.config,
      ...bot.config.gocqhttp,
    }
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
    return this.payload
  }

  private setData(bot: OneBotBot<Context>, data: Data, skip = false) {
    this.payload[bot.sid] = data
    if (!skip) this.refresh()
  }

  async connect(bot: OneBotBot<Context>) {
    // create working folder
    const cwd = resolve(bot.ctx.baseDir, this.config.root, bot.selfId)
    const file = '/go-cqhttp' + (process.platform === 'win32' ? '.exe' : '')
    await mkdir(cwd, { recursive: true })
    await copyFile(resolve(__dirname, '../bin/go-cqhttp'), cwd + file)

    // create config.yml
    await writeFile(cwd + '/config.yml', await this.getConfig(bot))

    return new Promise<void>((resolve, reject) => {
      this.setData(bot, { status: 'init' })

      // spawn go-cqhttp process
      bot.process = spawn('.' + file, ['-faststart'], { cwd })

      bot.process.stdout.on('data', async (data: string) => {
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
          let cap: RegExpMatchArray
          if (text.includes('????????????????????????????????????')) {
            resolve()
            this.setData(bot, { status: 'success' })
          } else if (text.includes('??????10??????????????????')) {
            this.refresh()
          } else if (text.includes('????????????????????????????????????????????????')) {
            this.payload[bot.status] = { status: 'sms-or-qrcode' }
          } else if (text.includes('???????????????????????????, ?????????????????????')) {
            this.payload[bot.status] = { status: 'slider-or-qrcode' }
            // eslint-disable-next-line no-cond-assign
          } else if (cap = text.match(/?????????(.+)?????????????????????/)) {
            const phone = cap[1].trim()
            if (text.includes('????????????????????????')) {
              this.setData(bot, { status: 'sms-confirm', phone })
            } else {
              this.payload[bot.status].phone = phone
            }
          } else if (text.includes('captcha.jpg')) {
            const buffer = await fsp.readFile(cwd + '/captcha.png')
            this.setData(bot, {
              status: 'captcha',
              image: 'data:image/png;base64,' + buffer.toString('base64'),
            })
          } else if (text.includes('qrcode.png')) {
            const buffer = await fsp.readFile(cwd + '/qrcode.png')
            this.setData(bot, {
              status: 'qrcode',
              image: 'data:image/png;base64,' + buffer.toString('base64'),
            })
          } else if (text.includes('????????????????????????')) {
            this.payload[bot.status].status = 'sms'
            this.refresh()
          } else if (text.includes('????????????????????????')) {
            this.setData(bot, { status: 'slider' })
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
    bot.process = null
    this.setData(bot, null)
  }
}

namespace Launcher {
  export interface Config {
    root?: string
    logLevel?: number
    template?: string
    message?: Dict
  }

  export const Config: Schema<Config> = Schema.object({
    root: Schema.string().description('??????????????????????????????').default('accounts'),
    logLevel: Schema.number().description('?????????????????????').default(3),
    template: Schema.string().description('??????????????????????????????').hidden(),
    message: Schema.object({
      'ignore-invalid-cqcode': Schema.boolean().default(false).description('?????????????????????????????? (??????????????????????????????)???'),
      'force-fragment': Schema.boolean().default(false).description('?????????????????????????????? (????????????????????????????????????????????????????????????????????????)???'),
      'fix-url': Schema.boolean().default(false).description('????????? URL ???????????????'),
      'proxy-rewrite': Schema.string().default('').description('???????????????????????????????????????????????????'),
      'report-self-message': Schema.boolean().default(false).description('???????????????????????????'),
      'remove-reply-at': Schema.boolean().default(false).description('?????? reply ?????????????????? at ????????????'),
      'extra-reply-data': Schema.boolean().default(false).description('??? reply ??????????????????????????????'),
      'skip-mime-scan': Schema.boolean().default(false).description('?????? mime ??????????????????????????????'),
    }).description('????????????'),
  })
}

export default Launcher

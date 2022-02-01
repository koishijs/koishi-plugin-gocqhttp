import { Context, Schema, interpolate, Logger } from "koishi";
import onebot, {
    OneBotBot,
    HttpServer,
    WebSocketClient,
    WebSocketServer,
} from "@koishijs/plugin-adapter-onebot";
import { spawn } from "cross-spawn";
import { ChildProcess } from "child_process";
import { resolve } from "path";
import { promises as fsp, existsSync, readFileSync } from "fs";
import { URL } from "url";
import {
    Device,
    DeviceInfo,
    equalsConfig,
    parseProtocol,
    setConfig,
} from "./device";

const { mkdir, copyFile, readFile, writeFile } = fsp;

declare module "@koishijs/plugin-adapter-onebot/lib/bot" {
    interface BotConfig {
        password?: string;
    }

    interface OneBotBot {
        process: ChildProcess;
    }
}

export const logger = new Logger("gocqhttp");

export const name = "gocqhttp";

export const Config = Schema.object({
    device: Schema.string().description("设备设置").default("iPad"),
    mirror: Schema.string()
        .description("GITMIRROR(只有没有下载成功才配置)")
        .default("https://download.fastgit.org"),
    version: Schema.string()
        .description("GOCQHTTP_VERSION")
        .default("v1.0.0-beta8-fix2"),
});

const password = Schema.string().description("机器人的密码。");

HttpServer.schema.dict.password = password;
WebSocketClient.schema.dict.password = password;
WebSocketServer.schema.dict.password = password;

const logLevelMap = {
    DEBUG: "debug",
    INFO: "debug",
    WARNING: "warn",
    ERROR: "error",
};

async function start(bot: OneBotBot, { device, mirror, version }: Config) {
    // check gocqhttp download
    const filename =
        process.platform === "win32" ? "go-cqhttp.exe" : "go-cqhttp";
    const bin = resolve(__dirname, "../bin", filename);
    if (!existsSync(bin)) {
        const GITHUB_MIRROR = mirror ? mirror : "";
        const GOCQHTTP_VERSION = version ? version : "";

        const ins = spawn("node install.js", {
            cwd: __dirname,
            env: {
                GITHUB_MIRROR,
                GOCQHTTP_VERSION,
            },
        });
        ins.stdout.on("data", (data) => {
            data = data.toString().trim();
            if (!data) return;
            for (const line of data.split("\n")) {
                const text = line.slice(23);
                const [type] = text.split("]: ", 1);
                if (type in logLevelMap) {
                    logger[logLevelMap[type]](text.slice(type.length + 3));
                } else {
                    logger.info(line.trim());
                }
            }
        });
    }

    // create working folder
    const cwd = resolve(bot.app.baseDir, "accounts/" + bot.selfId);
    await mkdir(cwd, { recursive: true });

    await copyFile(bin, resolve(cwd, filename));

    // create config.yml
    const { port, host = "localhost" } = bot.app.options;
    const { path = "/onebot" } = bot.app.registry.get(onebot).config;
    const template = await readFile(
        resolve(__dirname, "../template.yml"),
        "utf8"
    );
    await writeFile(
        cwd + "/config.yml",
        interpolate(
            template,
            {
                bot: bot.config,
                adapter: bot.adapter.config,
                endpoint: bot.config.endpoint && new URL(bot.config.endpoint),
                selfUrl: `${host}:${port}${path}`,
            },
            /<<(.+?)>>/g
        )
    );

    // modify device.json
    const dvjson = resolve(cwd, "device.json");
    if (existsSync(dvjson) && device) {
        const device_json = JSON.parse(
            readFileSync(dvjson, "utf8")
        ) as DeviceInfo;
        if (typeof device === "number" || typeof device === "string") {
            const protocol = parseProtocol(device);
            if (device_json.protocol !== protocol) {
                device_json.protocol = protocol;
                writeFile(dvjson, JSON.stringify(device_json), "utf8");
            }
        } else if (typeof device === "object") {
            if (!equalsConfig(device_json, device)) {
                setConfig(device_json, device);
                writeFile(dvjson, JSON.stringify(device_json), "utf8");
            }
        }
    }
    // spawn go-cqhttp process
    bot.process = spawn("./go-cqhttp", ["faststart"], { cwd });
    return new Promise<void>((resolve, reject) => {
        bot.process.stdout.on("data", (data) => {
            data = data.toString().trim();
            if (!data) return;
            for (const line of data.split("\n")) {
                const text = line.slice(23);
                const [type] = text.split("]: ", 1);
                if (type in logLevelMap) {
                    logger[logLevelMap[type]](text.slice(type.length + 3));
                } else {
                    logger.info(line.trim());
                }
                if (text.includes("アトリは、高性能ですから")) resolve();
            }
        });
        bot.process.stderr.on("data", (data) => {
            data = data.toString().trim();
            if (!data) return;
            for (const line of data.split("\n")) {
                const text = line.slice(23);
                const [type] = text.split("]: ", 1);
                if (type in logLevelMap) {
                    logger[logLevelMap[type]](text.slice(type.length + 3));
                } else {
                    logger.info(line.trim());
                }
                if (text.includes("アトリは、高性能ですから")) resolve();
            }
        });

        bot.process.on("exit", reject);
    });
}

export interface Config {
    logLevel?: number;
    device?: Device;
    mirror?: string;
    version?: string;
}

export function apply(ctx: Context, config: Config = {}) {
    logger.level = config.logLevel || 2;

    ctx.on("bot-connect", async (bot: OneBotBot) => {
        if (bot.adapter.platform !== "onebot") return;
        return start(bot, config);
    });

    ctx.on("bot-disconnect", async (bot: OneBotBot) => {
        if (bot.adapter.platform !== "onebot") return;
        bot.process?.kill();
    });
}

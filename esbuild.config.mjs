import { readdirSync } from "fs";
import { build } from "esbuild";
import { resolve, relative } from "path";
const entryPoints = readdirSync(resolve(process.cwd(), "src")).map(v => {
  return relative(process.cwd(), resolve(process.cwd(), "src", v))
}).filter(v => /(install|index)/.test(v))
build({
  external: ["@koishijs/plugin-adapter-onebot", "koishi"],
  entryPoints,
  bundle: true,
  sourcemap: true,
  platform: 'node',
  outdir: "lib",
}).catch(() => process.exit(1))

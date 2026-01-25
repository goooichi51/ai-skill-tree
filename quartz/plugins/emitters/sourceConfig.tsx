import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"
import { FullSlug, joinSegments } from "../../util/path"
import * as fs from "fs"
import * as path from "path"

interface Options {}

const defaultOptions: Options = {}

export const SourceConfig: QuartzEmitterPlugin<Partial<Options>> = (_opts) => {
  return {
    name: "SourceConfig",
    async *emit(ctx) {
      // content/_config/sources.json を読み込み、static に出力
      // ctx.argv.directory はすでに "content" なので、"_config" のみ追加
      const configPath = path.join(ctx.argv.directory, "_config", "sources.json")

      let configContent = JSON.stringify({
        youtube: { channels: {} },
        note: { authors: {} },
        x: { users: {} },
        blog: { domains: {} },
      })

      if (fs.existsSync(configPath)) {
        try {
          configContent = fs.readFileSync(configPath, "utf-8")
        } catch {
          // ファイル読み込みエラー時はデフォルト
        }
      }

      const fp = joinSegments("static", "_config", "sources") as FullSlug
      yield write({
        ctx,
        content: configContent,
        slug: fp,
        ext: ".json",
      })
    },
  }
}

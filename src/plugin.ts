import { Plugin, ResolvedConfig } from 'vite'
import { promises as fs } from 'fs'
import fg from 'fast-glob'
import path from 'path'
import chokidar from 'chokidar'
import { Resvg } from '@resvg/resvg-js'
import { createHash } from 'crypto'
import { join } from 'path'
import encode from '@wasm-codecs/oxipng'

const PLUGIN_NAME = 'vite-plugin-render-svg'

export interface RenderSVGOptions {
  pattern: string
  urlPrefix: string
  scales?: number[]
  copyOriginal?: boolean
}

async function renderFile(svg: Buffer, scale: number = 1, optimise: boolean = false): Promise<Buffer> {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'zoom',
      value: scale
    }
  })
  let data = resvg.render().asPng()
  if (optimise) {
    data = encode(data, { level: 3 })
  }
  return data
}

function getFiles(pattern: string): Map<string, string> {
  const files = fg.sync(pattern)
  const map = new Map<string, string>()
  for (const file of files) {
    map.set(path.basename(file, '.svg'), file)
  }
  return map
}

export function renderSVG({
  pattern,
  urlPrefix,
  scales = [1, 2],
  copyOriginal = false
}: RenderSVGOptions): Plugin[] {
  let config: ResolvedConfig
  let watcher: chokidar.FSWatcher

  let pattern_path: string
  let files: Map<string, string>

  async function configResolved(_config: ResolvedConfig) {
    config = _config
    pattern_path = join(config.root, pattern)
    files = getFiles(pattern_path)
  }

  return [
    {
      name: `${PLUGIN_NAME}:build`,
      apply: 'build',
      configResolved,
      async writeBundle() {
        const output_dir = join(config.root, config.build.outDir!, urlPrefix)
        await fs.mkdir(output_dir, { recursive: true })

        for (const [name, file] of files) {
          for (const scale of scales) {
            const png = await renderFile(await fs.readFile(file), scale)
            let suffix = ''
            if (scale > 1) {
              suffix = `@${scale}x`
            }
            await fs.writeFile(join(output_dir, `${name}.png${suffix}`), png)

            if (copyOriginal) {
              await fs.copyFile(file, join(output_dir, `${name}.svg`))
            }
          }
        }
      }
    },
    {
      name: `${PLUGIN_NAME}:serve`,
      apply: 'serve',
      configResolved,
      configureServer(server) {
        function onChange() {
          server.ws.send({ type: 'full-reload', path: '*' })
          files = getFiles(pattern_path)
        }

        watcher = chokidar
          .watch(pattern, {
            cwd: config.root,
            ignoreInitial: true
          })
          .on('add', onChange)
          .on('change', onChange)
          .on('unlink', onChange)

        return () => {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith(urlPrefix)) {
              return next()
            }
            const match = req.url.match(/.*\/(?<name>.*)\.png(@(?<scale>[0-9])x)?$/)
            if (!match || !files.has(match.groups!.name!)) {
              return next()
            }
            const name = match.groups!.name!
            const scale = match.groups?.scale ? parseInt(match.groups?.scale) : 1

            if (!scales.includes(scale)) {
              return next()
            }

            const file_path = files.get(name)!
            let data: Buffer = undefined!
            try {
              data = await fs.readFile(file_path)
            } catch (e) {
              console.error(`Error reading SVG file: ${file_path}`, e)
              return next()
            }

            const hash = createHash('md5').update(data).digest('hex')

            if (req.headers['if-none-match'] === hash) {
              res.writeHead(304)
              return res.end()
            }

            let svg: Buffer = undefined!
            try {
              svg = await renderFile(data, scale)
            } catch (e) {
              console.error(`Error rendering SVG file: ${file_path}`, e)
              return next()
            }

            res.writeHead(200, {
              'Content-Type': 'image/png',
              ETag: hash,
              'Cache-Control': 'no-cache'
            })
            res.end(svg)
          })
        }
      },
      async closeBundle() {
        await watcher.close()
      }
    }
  ]
}

// dsh-splash-deepsea — host half.
//
// 三件事：
//   1) 用 webServer.register 把开屏视频挂成一条 exact 路由（带 Range，<video> 才能 seek）。
//   2) 通过 webserver/index-inject 推两行：一行 html（<style> + 结构），一行 script（驱动）。
//   3) 保底：视频挂了、脚本没跑起来，CSS 里的 auto-hide 依然会在 7.2 秒把开屏收掉。
//
// 为什么把 html/script 放在旁边的文件里读，而不是拼在 JS 字符串里：
// 这些文件是 UTF-8 的中文/样式，独立文件比转义字符串好维护，也避免 BOM/转义踩坑。

import { readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PLUGIN_NAME = 'dsh-startup'
const VIDEO_ROUTE = '/dsh-startup/intro'
const IDLE_ROUTE = '/dsh-startup/idle'
const HERE = dirname(fileURLToPath(import.meta.url))
const ASSET = join(HERE, 'assets', 'intro.webm')
const ASSET_IDLE = join(HERE, 'assets', 'idle.webm')

const log = {
  info: (msg, ...a) => console.log(`[${PLUGIN_NAME}] ${msg}`, ...a),
  warn: (msg, ...a) => console.warn(`[${PLUGIN_NAME}] ${msg}`, ...a),
  error: (msg, ...a) => console.error(`[${PLUGIN_NAME}] ${msg}`, ...a),
}

function readText(name) {
  try {
    return readFileSync(join(HERE, name), 'utf8')
  } catch (err) {
    log.error(`cannot read ${name}:`, err?.message ?? err)
    return ''
  }
}

/** Range-capable handler for a splash video (206/416/200). */
function createVideoHandler(assetPath = ASSET) {
  let buffer = null
  let failed = null

  const load = () => {
    if (buffer !== null || failed !== null) return
    try {
      if (!existsSync(assetPath)) { failed = 'missing'; return }
      const st = statSync(assetPath)
      if (st.size === 0) { failed = 'empty'; return }
      buffer = readFileSync(assetPath)
    } catch (err) {
      failed = 'io'
      log.warn('video read failed:', err?.message ?? err)
    }
  }

  return (req, res) => {
    load()
    if (failed !== null) {
      res.statusCode = 404
      res.end(failed === 'missing' ? 'splash video not found' : 'splash video unreadable')
      return
    }
    const total = buffer.length
    const mime = 'video/webm'
    const range = req.headers?.range
    res.setHeader('Content-Type', mime)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'no-store')

    if (typeof range === 'string') {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
      if (m) {
        let start = m[1] === '' ? null : Number(m[1])
        let end = m[2] === '' ? null : Number(m[2])
        if (start === null && end === null) { /* fall through to 200 */ }
        else {
          if (start === null) { start = Math.max(0, total - end); end = total - 1 }
          else if (end === null) end = total - 1
          if (start > end || start >= total) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${total}`)
            res.end()
            return
          }
          end = Math.min(end, total - 1)
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
          res.setHeader('Content-Length', String(end - start + 1))
          res.end(buffer.subarray(start, end + 1))
          return
        }
      }
    }
    res.statusCode = 200
    res.setHeader('Content-Length', String(total))
    res.end(buffer)
  }
}

export default {
  name: PLUGIN_NAME,
  inject: ['webServer'],

  apply(ctx) {
    // 1) 视频路由：出场段 + 常驻循环段（后者让她"一直动"）
    try {
      if (typeof ctx?.webServer?.register === 'function') {
        ctx.webServer.register({ kind: 'exact', path: VIDEO_ROUTE, handler: createVideoHandler(ASSET) })
        ctx.webServer.register({ kind: 'exact', path: IDLE_ROUTE, handler: createVideoHandler(ASSET_IDLE) })
        log.info('video routes registered at', VIDEO_ROUTE, 'and', IDLE_ROUTE)
      } else {
        log.warn('webServer.register unavailable — splash will fall back to no video')
      }
    } catch (err) {
      log.error('route registration failed:', err?.message ?? err)
    }

    // 2) 注入行
    //    注意：html/script 在**每次 index 渲染时**重新读盘，而不是在 apply 时读一次。
    //    这样改 splash.html / client.js 之后，页面刷新就生效，不用重启宿主。
    try {
      if (typeof ctx?.on !== 'function') {
        log.warn('ctx.on unavailable, injection skipped')
        return
      }
      ctx.on('webserver/index-inject', (table) => {
        try {
          if (!table || typeof table.push !== 'function') return
          const splashHtml = readText('splash.html')
          const clientJs = readText('client.js')
          if (splashHtml) table.push({ kind: 'html', placement: 'body', html: splashHtml })
          if (clientJs) table.push({ kind: 'script', placement: 'body', text: clientJs })
          log.info('rows pushed:', splashHtml.length, '+', clientJs.length, 'bytes')
        } catch (err) {
          log.error('index-inject failed:', err?.message ?? err)
        }
      })
    } catch (err) {
      log.error('index-inject subscription failed:', err?.message ?? err)
    }
  },
}

export { createVideoHandler, VIDEO_ROUTE, IDLE_ROUTE, PLUGIN_NAME }

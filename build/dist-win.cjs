const { spawnSync } = require('node:child_process')
const { mkdirSync, mkdtempSync, renameSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { version } = require('../package.json')

const project = resolve(__dirname, '..')
const release = join(project, 'release')
const installer = `BTC-Float-${version}-x64-Setup.exe`

function buildInstaller() {
  mkdirSync(release, { recursive: true })
  // Windows 会锁住正在运行的解包版。每次构建使用独立的目录。
  const staging = mkdtempSync(join(release, '.win-build-'))
  let published = false
  try {
    const result = spawnSync(process.execPath, [
      require.resolve('electron-builder/cli.js'),
      '--win', '--x64', '--publish', 'never',
      `--config.directories.output=${staging}`
    ], { cwd: project, stdio: 'inherit', windowsHide: true })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`electron-builder 退出（${result.status ?? result.signal}）`)

    const destination = join(release, installer)
    renameSync(join(staging, installer), destination)
    published = true
    console.log(`安装包已生成：${destination}`)
  } finally {
    if (published) {
      rmSync(staging, { recursive: true, force: true, maxRetries: 3 })
    } else {
      console.error(`本次打包文件保留在：${staging}`)
    }
  }
}

try {
  buildInstaller()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}

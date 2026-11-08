import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_UNITY_EXPORT =
  '/Users/computercomputer/justinops/git_backup/ui/ProcessingGraphManager/FragmintWeb/FragmintWeb'
const DEST_ROOT = path.join(process.cwd(), 'public', 'generated', 'unity')

const inlineArg = process.argv.find((v) => v.startsWith('--unity-export='))
const sourceArg = inlineArg ? inlineArg.split('=').slice(1).join('=') : ''
const sourceRoot = path.resolve(sourceArg || process.env.UNITY_WEB_EXPORT_DIR || DEFAULT_UNITY_EXPORT)
const buildDir = path.join(sourceRoot, 'Build')

if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory())
  throw new Error(`[stage-unity] missing source root: ${sourceRoot}`)
if (!fs.existsSync(buildDir) || !fs.statSync(buildDir).isDirectory())
  throw new Error(`[stage-unity] missing Build dir: ${buildDir}`)

const buildFiles = fs.readdirSync(buildDir)
const loaderFile = buildFiles.find((n) => n.endsWith('.loader.js'))
if (!loaderFile) throw new Error(`[stage-unity] no loader file found in ${buildDir}`)

const stem = loaderFile.slice(0, -'.loader.js'.length)
const pick = (suffixes) => {
  for (const suffix of suffixes) {
    const name = `${stem}.${suffix}`
    if (fs.existsSync(path.join(buildDir, name))) return name
  }
  throw new Error(`[stage-unity] missing ${stem} file variants: ${suffixes.join(', ')}`)
}

const frameworkFile = pick(['framework.js', 'framework.js.gz', 'framework.js.br', 'framework.js.unityweb'])
const codeFile = pick(['wasm', 'wasm.gz', 'wasm.br', 'wasm.unityweb'])
const dataFile = pick(['data', 'data.gz', 'data.br', 'data.unityweb'])

const tmpDest = `${DEST_ROOT}.tmp`
fs.rmSync(tmpDest, { recursive: true, force: true })
fs.mkdirSync(path.dirname(DEST_ROOT), { recursive: true })

try {
  fs.cpSync(sourceRoot, tmpDest, { recursive: true, force: true })

  const manifest = {
    loaderUrl: `/generated/unity/Build/${loaderFile}`,
    dataUrl: `/generated/unity/Build/${dataFile}`,
    frameworkUrl: `/generated/unity/Build/${frameworkFile}`,
    codeUrl: `/generated/unity/Build/${codeFile}`,
    streamingAssetsUrl: fs.existsSync(path.join(tmpDest, 'StreamingAssets'))
      ? '/generated/unity/StreamingAssets'
      : '',
    companyName: 'Fragmint',
    productName: stem,
    productVersion: 'dev',
    matchWebGLToCanvasSize: true
  }

  fs.writeFileSync(path.join(tmpDest, 'unity-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  fs.rmSync(DEST_ROOT, { recursive: true, force: true })
  fs.renameSync(tmpDest, DEST_ROOT)
} catch (error) {
  fs.rmSync(tmpDest, { recursive: true, force: true })
  throw error
}

console.log(`[stage-unity] staged ${sourceRoot} -> ${DEST_ROOT}`)

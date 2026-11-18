import { execFileSync, execSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { afterAll, beforeAll, expect, it } from 'vitest'

let packageRoot = ''

beforeAll(() => {
  const repositoryRoot = path.resolve(__dirname, '..')
  packageRoot = mkdtempSync(path.join(tmpdir(), 'semverint-compatibility-'))
  const stagedSource = path.join(packageRoot, 'src')
  cpSync(path.join(repositoryRoot, 'src'), stagedSource, { recursive: true })
  for (const filename of ['package.json', 'tsconfig.json', 'tsconfig.cjs.json']) {
    copyFileSync(path.join(repositoryRoot, filename), path.join(packageRoot, filename))
  }
  const buildDependencies = path.join(packageRoot, 'node_modules')
  symlinkSync(path.join(repositoryRoot, 'node_modules'), buildDependencies, 'junction')
  execSync('npm run --silent build', { cwd: packageRoot, stdio: 'inherit', timeout: 30_000 })
  rmSync(buildDependencies)
  // The published package only ships dist, so consumer checks must catch exports that point at source files.
  rmSync(stagedSource, { recursive: true })

  // The consumers must sit inside the temporary package so its real exports map resolves.
  for (const filename of ['consumePackage.mjs', 'consumePackage.cts', 'consumePackage.mts']) {
    copyFileSync(path.join(__dirname, 'test', filename), path.join(packageRoot, filename))
  }
}, 30_000)

afterAll(() => {
  if (packageRoot) rmSync(packageRoot, { recursive: true, force: true })
})

it.each([
  ['cjs', 'available'],
  ['cjs', 'unavailable'],
  ['esm', 'available'],
  ['esm', 'unavailable'],
])('converts through the native %s export with BigInt %s', (format, bigInt) => {
  execFileSync(process.execPath, ['consumePackage.mjs', format, bigInt], {
    cwd: packageRoot,
    stdio: 'inherit',
    timeout: 5_000,
  })
})

it('typechecks the public exports for CommonJS and ESM consumers', () => {
  execFileSync(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      '--skipLibCheck',
      'false',
      'consumePackage.cts',
      'consumePackage.mts',
    ],
    { cwd: packageRoot, stdio: 'inherit', timeout: 30_000 },
  )
}, 30_000)

function collectJavaScriptFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(filename))
    } else if (filename.endsWith('.js')) {
      files.push(filename)
    }
  }
  return files
}

it.each([
  ['cjs', 'commonjs'],
  ['esm', 'module'],
])('emits %s as %s without bigint literal syntax', (format, moduleType) => {
  const outputDirectory = path.join(packageRoot, 'dist', format)
  const metadata = JSON.parse(readFileSync(path.join(outputDirectory, 'package.json'), 'utf8'))
  expect(metadata.type).toBe(moduleType)

  // Hiding BigInt does not disable Node's parser support for literals such as 1n.
  const emittedFiles = collectJavaScriptFiles(outputDirectory)
  expect(emittedFiles.length).toBeGreaterThan(0)
  const literals: string[] = []
  for (const filename of emittedFiles) {
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    function visit(node: ts.Node) {
      if (ts.isBigIntLiteral(node)) literals.push(`${path.relative(outputDirectory, filename)}: ${node.getText(source)}`)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(literals).toEqual([])
})

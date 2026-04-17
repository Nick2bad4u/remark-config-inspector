# Remark Config Inspector

Visual inspector for exploring resolved **remark / remark-lint** configuration.

It helps you understand:

- which config items are active,
- where rule states come from,
- how overrides and file globs affect resolution,
- and how final rule behavior is composed.

## Quick start

From a project that contains a remark config (`.remarkrc*` or
`package.json#remarkConfig`):

```bash
npx remark-config-inspector@latest
```

Use a specific target file when you want context-sensitive resolution:

```bash
npx remark-config-inspector --target docs/guide.md
```

If neither `--file` nor `--target` is supplied, the inspector uses a synthetic
target file: `remark-inspector-target.md`.

## CLI

```bash
remark-config-inspector [options]
remark-config-inspector build [options]
```

### Core options

- `--config <configFile>`: explicit config file path
- `--basePath <basePath>`: root path used for glob resolution
- `--file <filePath>`: alias of `--target`
- `--target <filePath>`: file used for effective config resolution
- `--files`: include matched file metadata in payload (enabled by default)

### Dev-server options

- `--host <host>`
- `--port <port>` (default: `9999`)
- `--open`

### Static build options

- `--base <baseURL>`: deployment base URL
- `--outDir <dir>`: output directory (default: `.remark-config-inspector`)

## Environment variables

Primary variables:

- `REMARK_CONFIG`
- `REMARK_BASE_PATH`
- `REMARK_TARGET`

Legacy compatibility variables (still supported):

- `ESLINT_CONFIG`
- `ESLINT_BASE_PATH`
- `ESLINT_TARGET`

These variables are respected by both the CLI and the Nuxt dev server API
(`npm run dev`).

## Static export

Generate a static inspector bundle:

```bash
npx remark-config-inspector build
```

This writes a static app and payload into `.remark-config-inspector`.

## Local development

```bash
npm ci
npm run dev
```

Use env overrides when you want dev mode to inspect a specific config or
target:

```bash
REMARK_CONFIG=.remarkrc.mjs REMARK_BASE_PATH=. REMARK_TARGET=docs/guide.md npm run dev
```

PowerShell example:

```powershell
$env:REMARK_CONFIG = ".remarkrc.mjs"
$env:REMARK_BASE_PATH = "."
$env:REMARK_TARGET = "docs/guide.md"
npm run dev
```

## Validation

```bash
npm run lint
npm run typecheck
npm run test
```

## Project docs

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SUPPORT.md](./SUPPORT.md)
- [SECURITY.md](./SECURITY.md)
- [RELEASING.md](./RELEASING.md)

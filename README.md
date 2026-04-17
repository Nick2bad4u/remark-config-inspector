# Remark Config Inspector

A visual inspector for understanding resolved **remark / remark-lint** configuration.

## Quick start

From a project that contains a remark config (`.remarkrc*` or `package.json#remarkConfig`):

```bash
npx remark-config-inspector@latest
```

Use a target file when you want context-sensitive resolution:

```bash
npx remark-config-inspector --file docs/guide.md
```

If you do not provide `--file` or `--target`, the inspector uses a synthetic target file named `remark-inspector-target.md`.

## CLI

```bash
remark-config-inspector [options]
remark-config-inspector build [options]
```

### Common options

- `--config <configFile>`: explicit config file path
- `--basePath <basePath>`: root path used for glob resolution
- `--file <filePath>`: alias of `--target`
- `--target <filePath>`: file used for effective config resolution
- `--files`: include matched file metadata in payload (enabled by default)

### Dev-server options

- `--host <host>`
- `--port <port>`
- `--open`

### Build options

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

## Static build

Generate a static inspector bundle:

```bash
npx remark-config-inspector build
```

This writes a static app and payload into `.remark-config-inspector`.

## Development

```bash
npm install
npm run dev
```

## Status

This repository is now maintained as a remark-first config inspector architecture.

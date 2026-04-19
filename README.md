# Remark Config Inspector

[![npm license.](https://flat.badgen.net/npm/license/remark-config-inspector?color=purple)](https://github.com/Nick2bad4u/remark-config-inspector/blob/main/LICENSE) [![npm total downloads.](https://flat.badgen.net/npm/dt/remark-config-inspector?color=pink)](https://www.npmjs.com/package/remark-config-inspector) [![latest GitHub release.](https://flat.badgen.net/github/release/Nick2bad4u/remark-config-inspector?color=cyan)](https://github.com/Nick2bad4u/remark-config-inspector/releases) [![GitHub stars.](https://flat.badgen.net/github/stars/Nick2bad4u/remark-config-inspector?color=yellow)](https://github.com/Nick2bad4u/remark-config-inspector/stargazers) [![GitHub forks.](https://flat.badgen.net/github/forks/Nick2bad4u/remark-config-inspector?color=green)](https://github.com/Nick2bad4u/remark-config-inspector/forks) [![GitHub open issues.](https://flat.badgen.net/github/open-issues/Nick2bad4u/remark-config-inspector?color=red)](https://github.com/Nick2bad4u/remark-config-inspector/issues) [![codecov.](https://flat.badgen.net/codecov/github/Nick2bad4u/remark-config-inspector?color=blue)](https://codecov.io/gh/Nick2bad4u/remark-config-inspector)

A visual tool for inspecting and understanding your **remark / remark-lint** configuration.

It helps you understand:

- which config items are active,
- where rule states come from,
- how overrides and file globs affect resolution,
- and how final rule behavior is composed.

## Screenshot

<p align="center">
  <img src="https://raw.githubusercontent.com/Nick2bad4u/remark-config-inspector/refs/heads/main/docs/assets/remark-inspector-screenshot.svg" alt="Remark Config Inspector">
</p>

## Usage

From a project that contains a remark config (`.remarkrc*` or
`package.json#remarkConfig`):

```bash
npx remark-config-inspector@latest
```

Then open http://localhost:9999/ (If it does not open automatically) to explore your config.

### Resolve for a target file

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

### Static build

To generate a static inspector snapshot:

```bash
npx remark-config-inspector build
```

This emits a single-page app in `.remark-config-inspector`.

### Static build options

- `--base <baseURL>`: deployment base URL
- `--outDir <dir>`: output directory (default: `.remark-config-inspector`)

## Environment variables

Primary variables:

- `REMARK_CONFIG` (or legacy `ESLINT_BASE_PATH`)
- `REMARK_BASE_PATH` (or legacy `ESLINT_BASE_PATH`)
- `REMARK_TARGET` (or legacy `ESLINT_TARGET`)

Run `npx remark-config-inspector --help` for all options.

## License

[Apache-2.0](./LICENSE)

## Contributors ✨

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors.](https://img.shields.io/badge/all_contributors-39-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/9romise"><img src="https://avatars.githubusercontent.com/9romise?v=4?s=80" width="80px;" alt="9romise"/><br /><sub><b>9romise</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=9romise" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Nick2bad4u"><img src="https://avatars.githubusercontent.com/u/20943337?v=4?s=80" width="80px;" alt="Nick2bad4u"/><br /><sub><b>Nick2bad4u</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/issues?q=author%3ANick2bad4u" title="Bug reports">🐛</a> <a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=Nick2bad4u" title="Code">💻</a> <a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=Nick2bad4u" title="Documentation">📖</a> <a href="#ideas-Nick2bad4u" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-Nick2bad4u" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-Nick2bad4u" title="Maintenance">🚧</a> <a href="https://github.com/Nick2bad4u/remark-config-inspector/pulls?q=is%3Apr+reviewed-by%3ANick2bad4u" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=Nick2bad4u" title="Tests">⚠️</a> <a href="#tool-Nick2bad4u" title="Tools">🔧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Pixel998"><img src="https://avatars.githubusercontent.com/Pixel998?v=4?s=80" width="80px;" alt="Pixel998"/><br /><sub><b>Pixel998</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=Pixel998" title="Code">💻</a> <a href="#infra-Pixel998" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://snyk.io/"><img src="https://avatars.githubusercontent.com/u/19733683?v=4?s=80" width="80px;" alt="Snyk bot"/><br /><sub><b>Snyk bot</b></sub></a><br /><a href="#security-snyk-bot" title="Security">🛡️</a> <a href="#infra-snyk-bot" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-snyk-bot" title="Maintenance">🚧</a> <a href="https://github.com/Nick2bad4u/remark-config-inspector/pulls?q=is%3Apr+reviewed-by%3Asnyk-bot" title="Reviewed Pull Requests">👀</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/StarHeartHunt"><img src="https://avatars.githubusercontent.com/StarHeartHunt?v=4?s=80" width="80px;" alt="StarHeartHunt"/><br /><sub><b>StarHeartHunt</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=StarHeartHunt" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.stepsecurity.io/"><img src="https://avatars.githubusercontent.com/u/89328645?v=4?s=80" width="80px;" alt="StepSecurity Bot"/><br /><sub><b>StepSecurity Bot</b></sub></a><br /><a href="#security-step-security-bot" title="Security">🛡️</a> <a href="#infra-step-security-bot" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-step-security-bot" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/aladdin-add"><img src="https://avatars.githubusercontent.com/aladdin-add?v=4?s=80" width="80px;" alt="aladdin-add"/><br /><sub><b>aladdin-add</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=aladdin-add" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/amareshsm"><img src="https://avatars.githubusercontent.com/amareshsm?v=4?s=80" width="80px;" alt="amareshsm"/><br /><sub><b>amareshsm</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=amareshsm" title="Code">💻</a> <a href="#infra-amareshsm" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/antfu"><img src="https://avatars.githubusercontent.com/antfu?v=4?s=80" width="80px;" alt="antfu"/><br /><sub><b>antfu</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=antfu" title="Code">💻</a> <a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=antfu" title="Documentation">📖</a> <a href="#infra-antfu" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/benmccann"><img src="https://avatars.githubusercontent.com/benmccann?v=4?s=80" width="80px;" alt="benmccann"/><br /><sub><b>benmccann</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=benmccann" title="Code">💻</a> <a href="#infra-benmccann" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/brettz9"><img src="https://avatars.githubusercontent.com/brettz9?v=4?s=80" width="80px;" alt="brettz9"/><br /><sub><b>brettz9</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=brettz9" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/clemyan"><img src="https://avatars.githubusercontent.com/clemyan?v=4?s=80" width="80px;" alt="clemyan"/><br /><sub><b>clemyan</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=clemyan" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/coliff"><img src="https://avatars.githubusercontent.com/coliff?v=4?s=80" width="80px;" alt="coliff"/><br /><sub><b>coliff</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=coliff" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/apps/dependabot"><img src="https://avatars.githubusercontent.com/in/29110?v=4?s=80" width="80px;" alt="dependabot[bot]"/><br /><sub><b>dependabot[bot]</b></sub></a><br /><a href="#infra-dependabot[bot]" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#security-dependabot[bot]" title="Security">🛡️</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/eslintbot"><img src="https://avatars.githubusercontent.com/eslintbot?v=4?s=80" width="80px;" alt="eslintbot"/><br /><sub><b>eslintbot</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=eslintbot" title="Code">💻</a> <a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=eslintbot" title="Documentation">📖</a> <a href="#infra-eslintbot" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-eslintbot" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/github-actions%5Bbot%5D"><img src="https://avatars.githubusercontent.com/github-actions%5Bbot%5D?v=4?s=80" width="80px;" alt="github-actions[bot]"/><br /><sub><b>github-actions[bot]</b></sub></a><br /><a href="#infra-github-actions[bot]" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-github-actions[bot]" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/hyoban"><img src="https://avatars.githubusercontent.com/hyoban?v=4?s=80" width="80px;" alt="hyoban"/><br /><sub><b>hyoban</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=hyoban" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/kabirsky"><img src="https://avatars.githubusercontent.com/kabirsky?v=4?s=80" width="80px;" alt="kabirsky"/><br /><sub><b>kabirsky</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=kabirsky" title="Code">💻</a> <a href="#infra-kabirsky" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/kecrily"><img src="https://avatars.githubusercontent.com/kecrily?v=4?s=80" width="80px;" alt="kecrily"/><br /><sub><b>kecrily</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=kecrily" title="Code">💻</a> <a href="#infra-kecrily" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/kron-sh"><img src="https://avatars.githubusercontent.com/kron-sh?v=4?s=80" width="80px;" alt="kron-sh"/><br /><sub><b>kron-sh</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=kron-sh" title="Code">💻</a> <a href="#infra-kron-sh" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/lumirlumir"><img src="https://avatars.githubusercontent.com/lumirlumir?v=4?s=80" width="80px;" alt="lumirlumir"/><br /><sub><b>lumirlumir</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=lumirlumir" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/lvjiaxuan"><img src="https://avatars.githubusercontent.com/lvjiaxuan?v=4?s=80" width="80px;" alt="lvjiaxuan"/><br /><sub><b>lvjiaxuan</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=lvjiaxuan" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mdjermanovic"><img src="https://avatars.githubusercontent.com/mdjermanovic?v=4?s=80" width="80px;" alt="mdjermanovic"/><br /><sub><b>mdjermanovic</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=mdjermanovic" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/michkot"><img src="https://avatars.githubusercontent.com/michkot?v=4?s=80" width="80px;" alt="michkot"/><br /><sub><b>michkot</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=michkot" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mmkal"><img src="https://avatars.githubusercontent.com/mmkal?v=4?s=80" width="80px;" alt="mmkal"/><br /><sub><b>mmkal</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=mmkal" title="Code">💻</a> <a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=mmkal" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ntnyq"><img src="https://avatars.githubusercontent.com/ntnyq?v=4?s=80" width="80px;" alt="ntnyq"/><br /><sub><b>ntnyq</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=ntnyq" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/nzakas"><img src="https://avatars.githubusercontent.com/nzakas?v=4?s=80" width="80px;" alt="nzakas"/><br /><sub><b>nzakas</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=nzakas" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/rakleed"><img src="https://avatars.githubusercontent.com/rakleed?v=4?s=80" width="80px;" alt="rakleed"/><br /><sub><b>rakleed</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=rakleed" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/renovate%5Bbot%5D"><img src="https://avatars.githubusercontent.com/renovate%5Bbot%5D?v=4?s=80" width="80px;" alt="renovate[bot]"/><br /><sub><b>renovate[bot]</b></sub></a><br /><a href="#infra-renovate[bot]" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-renovate[bot]" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/rotu"><img src="https://avatars.githubusercontent.com/rotu?v=4?s=80" width="80px;" alt="rotu"/><br /><sub><b>rotu</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=rotu" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/scottohara"><img src="https://avatars.githubusercontent.com/scottohara?v=4?s=80" width="80px;" alt="scottohara"/><br /><sub><b>scottohara</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=scottohara" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/typed-sigterm"><img src="https://avatars.githubusercontent.com/typed-sigterm?v=4?s=80" width="80px;" alt="typed-sigterm"/><br /><sub><b>typed-sigterm</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=typed-sigterm" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/vinayakkulkarni"><img src="https://avatars.githubusercontent.com/vinayakkulkarni?v=4?s=80" width="80px;" alt="vinayakkulkarni"/><br /><sub><b>vinayakkulkarni</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=vinayakkulkarni" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/voxpelli"><img src="https://avatars.githubusercontent.com/voxpelli?v=4?s=80" width="80px;" alt="voxpelli"/><br /><sub><b>voxpelli</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=voxpelli" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/webdiscus"><img src="https://avatars.githubusercontent.com/webdiscus?v=4?s=80" width="80px;" alt="webdiscus"/><br /><sub><b>webdiscus</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=webdiscus" title="Code">💻</a> <a href="#infra-webdiscus" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/will-stone"><img src="https://avatars.githubusercontent.com/will-stone?v=4?s=80" width="80px;" alt="will-stone"/><br /><sub><b>will-stone</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=will-stone" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ycs77"><img src="https://avatars.githubusercontent.com/ycs77?v=4?s=80" width="80px;" alt="ycs77"/><br /><sub><b>ycs77</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=ycs77" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/yidingww"><img src="https://avatars.githubusercontent.com/yidingww?v=4?s=80" width="80px;" alt="yidingww"/><br /><sub><b>yidingww</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=yidingww" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/yuyinws"><img src="https://avatars.githubusercontent.com/yuyinws?v=4?s=80" width="80px;" alt="yuyinws"/><br /><sub><b>yuyinws</b></sub></a><br /><a href="https://github.com/Nick2bad4u/remark-config-inspector/commits?author=yuyinws" title="Code">💻</a> <a href="#infra-yuyinws" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

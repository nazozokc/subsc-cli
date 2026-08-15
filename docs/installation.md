---
title: Installation
description: Install subtrack via npm, pnpm, or build from source.
---

## Requirements

**subtrack** requires **Node.js 22 or later**. It is a pure Node.js package and does not require any system-level dependencies.

## Install via npm (recommended)

```bash
npm install -g subtrack
```

## Install via pnpm

```bash
pnpm add -g subtrack
```

## Install via bun

```bash
bun add -g subtrack
```

## Run with npx (no install)

If you prefer not to install globally, use `npx`:

```bash
npx subtrack list
```

Note that `npx` will download the package on every first run, so global install is recommended for regular use.

## Build from source

Clone the repository and build locally:

```bash
git clone https://github.com/nazozokc/subtrack.git
cd subtrack
pnpm install
pnpm build
pnpm link --global
```

This links the `subtrack` command to your global `node_modules`. Re-run `pnpm link --global` after pulling updates.

<div class="callout info">
  <strong>💡 Tip:</strong> Run <code>subtrack --help</code> after installation to verify everything works.
</div>

## Verify installation

```bash
subtrack --help
```

You should see the list of available commands.

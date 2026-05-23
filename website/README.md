# @serviceconnect/website

The documentation site for the `@serviceconnect/*` Node.js packages, built with [Astro Starlight](https://starlight.astro.build/).

## Local development

```bash
pnpm install
pnpm --filter @serviceconnect/website dev
```

Then open <http://localhost:4321/ServiceConnect-NodeJS/>.

## Build

```bash
pnpm --filter @serviceconnect/website build
```

Output lands in `website/dist/`. Deployed to GitHub Pages from `v3` via `.github/workflows/docs.yml`.

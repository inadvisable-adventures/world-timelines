# Bootstrap web-client Project

## Summary

Initialize the `web-client/` directory as a TypeScript project with a build system, public HTML shell, and the full source directory structure needed for subsequent TODO items.

## Affected Files

- `web-client/package.json`
- `web-client/tsconfig.json`
- `web-client/tsconfig.worker.json`
- `web-client/public/index.html`
- `web-client/src/` (directory structure, empty placeholder files)

## Step-by-Step Implementation

1. Create `web-client/package.json` with:
   - `devDependencies`: `typescript`
   - `scripts.build`: run both `tsc -p tsconfig.json` and `tsc -p tsconfig.worker.json`
2. Create `web-client/tsconfig.json` targeting ES2022 modules, strict mode, outputting to `public/`.
3. Create `web-client/tsconfig.worker.json` for the worker entry point, also outputting to `public/`.
4. Create `web-client/public/index.html` with the app shell: loads `main.js` as a module, contains `<app-root>` element.
5. Create `web-client/src/` subdirectories: `types/`, `components/`, `worker/`.

## Key Design Decisions

- Use native ES modules (no bundler) for simplicity; TypeScript compiles each `.ts` file to a corresponding `.js` file.
- Two `tsconfig` files because the worker is a separate compilation unit with `lib: ["WebWorker"]` instead of `lib: ["DOM"]`.
- `outDir: "../public"` so compiled JS lands in the static serve directory.

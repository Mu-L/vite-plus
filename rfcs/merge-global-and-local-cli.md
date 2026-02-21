# RFC: Merge Global and Local CLI into a Single Package

## Background

Previously, the CLI was split across two npm packages:

- **`vite-plus`** (`packages/cli/`) — The local CLI, installed as a project devDependency. Handles build, test, lint, fmt, run, and other task commands via NAPI bindings to Rust.
- **`vite-plus-cli`** (`packages/global/`) — The global CLI, installed to `~/.vite-plus/`. Handles create, migrate, version, and package manager commands. Had its own NAPI binding crate, rolldown build, install scripts, and snap tests.

The Rust binary `vp` (`crates/vite_global_cli/`) acted as the entry point, delegating to `packages/global/dist/index.js` which detected the local `vite-plus` installation and forwarded commands accordingly.

**Problems with the two-package approach:**

1. Two separate NAPI binding crates with overlapping dependencies
2. Two separate build pipelines (tsc for local, rolldown for global)
3. Two npm packages to publish and version
4. A JS shim layer (`dist/index.js`) for detecting/installing local vite-plus
5. Complex CI workflows to build, test, and release both packages
6. Duplicated utilities and types across packages

## Goals

1. Merge `packages/global/` (`vite-plus-cli`) into `packages/cli/` (`vite-plus`)
2. Publish a single npm package: `vite-plus`
3. Unify the NAPI binding crate
4. Replace the JS shim with direct Rust resolution via `oxc_resolver`
5. Simplify CI build and release pipelines
6. Keep all existing functionality working

## Architecture (After Merge)

### Single Package: `packages/cli/` (`vite-plus`)

```
packages/cli/
├── bin/vp                    # Node.js entry script
├── binding/                  # Unified NAPI binding crate (migration, package_manager, utils)
├── src/
│   ├── bin.ts                # Unified entry point for both local and global commands
│   ├── create/               # vp create command (from global)
│   ├── migration/            # vp migrate command (from global)
│   ├── version.ts            # vp --version (from global)
│   ├── utils/                # Shared utilities (from global-utils)
│   ├── types/                # Shared types (from global-types)
│   ├── resolve-*.ts          # Local CLI tool resolvers
│   └── ...                   # Other local CLI source files
├── dist/                     # tsc output (local CLI)
│   ├── bin.js                # Compiled entry point
│   └── global/               # rolldown output (global CLI chunks)
│       ├── create.js
│       ├── migrate.js
│       └── version.js
├── install.sh / install.ps1  # Global install scripts (from global)
├── templates/                # Project templates (from global)
├── rules/                    # Oxlint rules (from global)
├── snap-tests/               # Local CLI snap tests
└── snap-tests-global/        # Global CLI snap tests (from global)
```

### Command Routing

The Rust `vp` binary (`crates/vite_global_cli/`) routes commands in three categories:

- **Category A (Package Manager)**: `install`, `add`, `remove`, `update`, etc. — Handled directly in Rust
- **Category B (Global JS)**: `create`, `migrate`, `--version` — Rust calls `dist/bin.js` with the command name, which dynamically imports the rolldown-bundled module from `dist/global/`
- **Category C (Local CLI)**: `build`, `test`, `lint`, `fmt`, `run`, etc. — Rust uses `oxc_resolver` to find the project's local `vite-plus/dist/bin.js` and runs it directly. Falls back to the global installation's `dist/bin.js` if no local installation exists.

### Local vite-plus Resolution (Rust)

```rust
// Uses oxc_resolver to resolve vite-plus/package.json from the project directory
// If found and dist/bin.js exists, runs the local installation
// Otherwise falls back to the global installation's dist/bin.js
fn resolve_local_vite_plus(project_path: &AbsolutePath) -> Option<AbsolutePathBuf> {
    let resolver = Resolver::new(ResolveOptions {
        condition_names: vec!["import".into(), "node".into()],
        ..ResolveOptions::default()
    });
    let resolved = resolver.resolve(project_path, "vite-plus/package.json").ok()?;
    let pkg_dir = resolved.path().parent()?;
    let bin_js = pkg_dir.join("dist").join("bin.js");
    if bin_js.exists() { AbsolutePathBuf::new(bin_js) } else { None }
}
```

### Unified Entry Point (`bin.ts`)

```typescript
// Global commands — handled by rolldown-bundled modules in dist/global/
if (command === 'create') {
  await import('./global/create.js');
} else if (command === 'migrate') {
  await import('./global/migrate.js');
} else if (command === '--version' || command === '-V') {
  await import('./global/version.js');
} else {
  // All other commands — delegate to Rust core via NAPI binding
  run({ lint, pack, fmt, vite, test, doc, resolveUniversalViteConfig, args });
}
```

## Changes Summary

### Completed

1. **Merged all source code** from `packages/global/` into `packages/cli/`:
   - `src/create/`, `src/migration/`, `src/version.ts` — Global commands
   - `src/utils/`, `src/types/` — Shared utilities and types (renamed from `global-utils`, `global-types`)
   - `binding/` — Unified NAPI crate with migration, package_manager, utils modules
   - `install.sh`, `install.ps1` — Install scripts
   - `templates/`, `rules/` — Assets
   - `snap-tests-global/` — Global snap tests

2. **Deleted `packages/global/`** entirely

3. **Updated Rust `vp` binary** (`crates/vite_global_cli/`):
   - Added `oxc_resolver` dependency for direct local vite-plus resolution
   - Removed JS shim layer — no more `dist/index.js` intermediary
   - Updated all command entry points from `index.js` to `bin.js`
   - Changed `MAIN_PACKAGE_NAME` from `vite-plus-cli` to `vite-plus`
   - Added `binding/` to install entries for upgrade command

4. **Updated build system**:
   - Added `rolldown.config.ts` to bundle global CLI modules into `dist/global/`
   - `treeshake: false` required for dynamic imports
   - Plugin to fix binding import paths in rolldown output
   - Simplified root `package.json` build scripts (removed global package steps)

5. **Updated CI/CD**:
   - Simplified `build-upstream` action (removed global package build steps)
   - Simplified `release.yml` (removed global package publish, now 3 packages instead of 4)
   - Bumped cache key from `v2` to `v3`

6. **Removed `vite` bin alias** — Only `vp` binary entry remains

7. **Updated package.json**:
   - Added runtime deps: `cross-spawn`, `picocolors`
   - Added devDeps from global: `semver`, `yaml`, `glob`, `minimatch`, `mri`, etc.
   - Added `snap-test-global` script
   - Added `files` entries: `AGENTS.md`, `rules`, `templates`

8. **Updated documentation**: `CLAUDE.md`, `CONTRIBUTING.md`

## Verification

- `cargo test -p vite_global_cli` — Rust unit tests pass
- `pnpm -F vite-plus snap-test-local` — Local CLI snap tests pass
- `pnpm -F vite-plus snap-test-global` — Global CLI snap tests pass
- `pnpm bootstrap-cli` — Full build and global install succeeds
- Manual testing: `vp create`, `vp migrate`, `vp --version`, `vp build`, `vp test` all work

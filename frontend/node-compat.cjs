// @tailwindcss/node calls module.register() at load time to register an ESM cache loader.
// This deadlocks on Node.js v20+ due to a circular dependency in the hook worker startup.
// Setting process.versions.bun skips the register() call (the guard is !process.versions.bun.
// The esm-cache-loader is a performance optimization only — Tailwind still works without it.
process.versions.bun = 'skip-esm-cache-loader'

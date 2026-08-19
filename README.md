# Archmap

Archmap keeps a true map of a software system, business logic first, so a reviewer can see what an AI change touches before it merges.

- `docs/product.md` holds the product record.
- `CONTEXT.md` holds the vocabulary.
- `docs/adr/` holds the architectural decisions.
- The prototypes that settled the map's shape live in the `archmap-prototype` repo.

## Status

Pre-skeleton. The next milestone is the walking skeleton: a Tauri shell, a Node sidecar, three extractors (TypeScript with JavaScript, Go, Ruby), scope globs, one traced cross-language flow, and one stale badge.

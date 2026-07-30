# NiveauIndex regression tests

Drop `test/niveau-create-regression.mjs` into the current `curriculum-store` repository and run:

```sh
npm test -- test/niveau-create-regression.mjs
```

or, with the package script as currently written:

```sh
npx tap test/niveau-create-regression.mjs
```

The tests are intentionally small synthetic graphs. They encode the old `scripts/tojsontag.mjs` behavior for `addNiveauIndex()`:

1. Recurse into non-`Vakleergebied` children first.
2. Merge existing `NiveauIndex`.
3. Merge own `Niveau`.
4. Write the merged result back to `entity.NiveauIndex`.

With the current refactored `src/index.niveau.mjs`, the first three create tests should fail. That is useful: those failures point at the short-circuit in `registerNiveauIndex()` where an entity with `Niveau` or existing `NiveauIndex` no longer has its children visited.

The last update test checks a separate robustness issue: when a child is newly linked and has `Niveau` but not yet `NiveauIndex`, the parent update currently cannot derive the level because `getNiveaus()` only reads `child.NiveauIndex`.

# Manual installation override

`overrides/catalog_installation.json` is a working copy of the current published installation catalog.

The override input is the `mods` array inside `overrides/catalog_installation.json`. There is no separate `.mods` file.

1. Open `overrides/catalog_installation.json`.
2. Before running the workflow, keep only the mods that should be overridden in the `mods` array.
3. Edit the full `installationProcess`, including `decisionReason`, for each remaining mod.
4. Commit the changed working copy to `main`. This commit can be temporarily large because the working copy is trimmed down to only the override entries.
5. Run the `Manual installation override` workflow.

After a successful workflow run:

- `overrides/catalog_installation.json` is regenerated as a full copy of the newly published installation catalog.
- `overrides/catalog.json` is regenerated as a full copy of the newly published catalog.
- `catalog.json` changes only `catalogVersion`.
- `catalog_installation.json` changes only `catalogVersion` and the selected `installationProcess` overrides.
- `catalog-changelog.json` changes only `catalogVersion`; `previousCatalogVersion` and changelog contents are preserved.

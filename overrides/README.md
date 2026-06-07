# Manual installation override

`overrides/catalog_installation.json` is a working copy of the current published installation catalog.

1. Open `overrides/catalog_installation.json`.
2. Before running the workflow, keep only the mods that should be overridden in the `mods` array.
3. Edit the full `installationProcess`, including `decisionReason`.
4. Commit the changed working copy to `main`.
5. Run the `Manual installation override` workflow.

After a successful workflow run, `overrides/catalog_installation.json` is regenerated as a full copy of the newly published version.

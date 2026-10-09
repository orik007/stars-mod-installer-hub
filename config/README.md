# Catalog configurations

This directory contains manually maintained configuration data for mods that require the user to choose installation variants or optional components in Stars Mod Installer.

The configuration source is separate from the generated catalog because these rules describe known exceptions that must survive normal catalog regeneration.

## Source file

The configuration source is stored in:

```text
config/catalog-configurations.json
```

This file is the long-lived source of truth for manually defined mod configurations.

It is not downloaded directly by the desktop application.

## Published catalog flow

The catalog publishing process must:

1. Generate the normal `catalog_installation.json` in the private application repository.
2. Read `config/catalog-configurations.json` from this hub repository.
3. Match configuration entries to generated installation entries by `source` and `sourceId`.
4. Apply the matching complete `installationProcess` when supplied, then add the `configuration` object to the mod entry in `catalog_installation.json`.
5. Validate the merged installation catalog.
6. Package the merged `catalog_installation.json` into `latest/catalog.zip` and the corresponding history artifact.

The desktop application continues to download the normal catalog bundle. No additional configuration file is added to the downloaded ZIP.

The published installation entry has this shape:

```json
{
  "source": "wgmods",
  "sourceId": "1234",
  "title": "Example mod",
  "classificationInput": {
    "latestFileExt": ".zip",
    "latestInstallGuide": "..."
  },
  "installationProcess": {
    "installationTemplate": "ExtractArchiveThenCopyToMods",
    "installableByApp": true,
    "decisionReason": "...",
    "deleteDataWgpdc": false
  },
  "configuration": {
    "groups": []
  }
}
```

`configuration` is a sibling of `installationProcess`:

- `installationProcess` defines how the downloaded package is prepared and where its files would normally be copied.
- `configuration` defines which prepared target files belong to the user's selected options.

Mods without manual configuration do not contain the `configuration` property.

## Source document structure

```text
CatalogConfigurationDocument
- schemaVersion
- mods
```

```text
CatalogConfigurationMod
- source
- sourceId
- title
- installationProcess (optional)
- configuration
```

Example:

```json
{
  "schemaVersion": 1,
  "mods": [
    {
      "source": "wgmods",
      "sourceId": "1234",
      "title": "Example mod",
      "configuration": {
        "groups": []
      }
    }
  ]
}
```

### Mod identity

A mod is matched only by:

```text
source
sourceId
```

`title` is included for human readability. It is not part of the identity and must not be used for matching.

The source document does not contain `catalogVersion`. Its entries persist across published catalog versions until they are changed or removed manually.

## Persistent installation process

A configured mod may optionally include a complete `installationProcess` beside `configuration`:

```json
{
  "source": "wgmods",
  "sourceId": "1234",
  "title": "Example mod",
  "installationProcess": {
    "installationTemplate": "ExtractArchiveThenCopyToMods",
    "installableByApp": true,
    "decisionReason": "Package variants are handled by the verified configuration.",
    "deleteDataWgpdc": false
  },
  "configuration": {
    "groups": []
  }
}
```

Replace the illustrative empty groups with the verified choices and file-selection rules for the actual package.

When this optional object is present, the publisher replaces the complete AI-classified installation process on every publish. It does not merge individual fields. When absent, the classifier result is preserved. Optional means omitting the field; `null`, an empty object, and partial objects are invalid. The `configuration` object and its `groups` array remain required. The presence of radio buttons or checkboxes alone does not change Manual to Auto.

Required fields are `installationTemplate`, `installableByApp`, `decisionReason`, and `deleteDataWgpdc`. The reason must be a non-empty string and both flags must be booleans. Use `deleteDataWgpdc`, never `deleteWgpdc`.

App-installable templates require `installableByApp=true`:

- `CopyAllToMods`
- `CopyAllToResMods`
- `ExtractArchiveThenCopyToMods`
- `ExtractArchiveThenCopyToResMods`
- `ExtractArchiveAndCopyFolderToMods`
- `ExtractToGameRoot`

Manual templates require `installableByApp=false`:

- `RunExternalInstaller`
- `ManualExternalDependency`
- `DeterministicButUnsupported`
- `MixedCustomPathButDeterministic`
- `Unknown`

`manualFolder` is required and must be a non-empty string only for `ExtractArchiveAndCopyFolderToMods`; it must be omitted for all other templates. Missing fields, unsupported templates, incompatible capability flags, or an invalid folder field stop publishing.

Existing entries without this optional object remain valid under schema version 1. The separate manual installation override workflow remains a quick repair of the published catalog; this source records persistent, reviewed installation behavior. Upstream-package change detection is outside this addition.

## Configuration model

A configuration contains one or more root groups.

```text
Configuration
- groups
```

### Group

A group defines how its direct options are selected and validated.

```text
Group
- id
- name
- required
- type
- groups
- options
- installationContent
```

Fields:

- `id`: Stable technical identifier. It must not change when the displayed name changes.
- `name`: Optional user-facing group title. It may be omitted for a group that should not render an additional heading.
- `required`: Defines whether the group requires a valid selection.
- `type`: `single` or `multiple`.
- `groups`: Nested groups that are active whenever this group is active.
- `options`: Direct selectable options in this group.
- `installationContent`: Optional file-selection rules shared by the selected subtree of this group.

Selection rules:

| Type | Required | Valid selection |
|---|---:|---|
| `single` | `true` | Exactly one option |
| `single` | `false` | Zero or one option |
| `multiple` | `true` | At least one option |
| `multiple` | `false` | Zero or more options |

A `single` group is rendered as radio buttons. All direct options in that group automatically belong to the same radio group.

A `multiple` group is rendered as checkboxes.

For an optional `single` group, selecting the currently selected radio option again clears the selection.

Group-level `installationContent` is included only when the group contains at least one selected option directly or in an active descendant group. This allows files shared by the whole selected subtree to be defined once on the group.

### Option

An option is a concrete selectable item.

```text
Option
- id
- name
- groups
- installationContent
```

Fields:

- `id`: Stable technical identifier within the configuration tree.
- `name`: User-facing label.
- `groups`: Nested groups that become active only while this option is selected.
- `installationContent`: Optional file-selection rules specific to this option.

An option may omit `installationContent` when it exists only to activate nested groups.

## Installation content

The first supported installation-content rule is:

```text
InstallationContent
- includeTargetPathRegexes
```

```json
{
  "includeTargetPathRegexes": [
    "^.*\\.wotmod$"
  ]
}
```

Each regular expression is evaluated against the file's final normalized relative target path after the existing `installationTemplate` has determined where the file would be copied inside the World of Tanks folder.

Example target path:

```text
mods/2.33.1.0/example.wotmod
```

The matched target path is:

- relative to the World of Tanks root,
- normalized to use `/` separators,
- stored without a leading `/` or `./`,
- matched case-insensitively.

Multiple expressions in one `includeTargetPathRegexes` list use OR logic. A target file is included when it matches at least one expression.

The final set of files is the union of installation content from:

- every selected option in an active branch,
- every group whose subtree contains at least one selected option,
- all selected nested branches.

Each target file is copied at most once.

Files that do not match any collected expression are not copied. There is no fallback that copies the complete package when matching fails.

## Pansy's Revamped Skies Volume 1 example

The current archive contains:

```text
installation.txt
PansyRevampedSkiesVol1v1.12.wotmod
PansyRevampedSkiesVol1v1.12NoDarkMaps.wotmod
```

The mod requires one selected variant:

```json
{
  "schemaVersion": 1,
  "mods": [
    {
      "source": "wgmods",
      "sourceId": "6868",
      "title": "Pansy's Revamped Skies Volume 1",
      "configuration": {
        "groups": [
          {
            "id": "skyVersionVolume1",
            "name": "Sky version",
            "required": true,
            "type": "single",
            "groups": [],
            "options": [
              {
                "id": "allMaps",
                "name": "All maps",
                "groups": [],
                "installationContent": {
                  "includeTargetPathRegexes": [
                    "^(?!.*NoDarkMaps).*\\.wotmod$"
                  ]
                }
              },
              {
                "id": "noDarkMaps",
                "name": "No Dark Maps",
                "groups": [],
                "installationContent": {
                  "includeTargetPathRegexes": [
                    "^.*NoDarkMaps.*\\.wotmod$"
                  ]
                }
              }
            ]
          }
        ]
      }
    }
  ]
}
```

The `All maps` option (`allMaps`) selects the `.wotmod` target path that does not contain `NoDarkMaps`.

The `No Dark Maps` option (`noDarkMaps`) selects the `.wotmod` target path that contains `NoDarkMaps`.

`installation.txt` is not selected because it does not end with `.wotmod`.

## Required validation

The publishing process must fail when:

- `schemaVersion` is unsupported,
- two entries use the same `source` and `sourceId`,
- a configured mod does not exist in the generated installation catalog,
- group or option IDs are missing or duplicated within their relevant scope,
- a group has an unsupported `type`,
- a required field is missing,
- a regular expression is invalid,
- a configuration tree is structurally invalid,
- a supplied `installationProcess` is incomplete or invalid, including template/capability or `manualFolder` mismatches.

Runtime matching against the downloaded package is performed by the desktop application during mod preparation. User-facing handling for a valid expression that no longer matches any target file is defined by the application, not by this source document.

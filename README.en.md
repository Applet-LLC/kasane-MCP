# kasane-MCP

[日本語](README.md) | English

An MCP server that creates settings files for [kasane](https://appletllc.com/%e3%82%ad%e3%83%bc%e3%83%aa%e3%83%9e%e3%83%83%e3%83%97%e3%82%bd%e3%83%95%e3%83%88-%e3%81%8b%e3%81%95%e3%81%ad%e3%80%80/), a key remapping software for Windows 11.

Import a created settings file in the kasane editor, and it is applied to kasane's settings.

Status: v0.1.10 (manual search, read-only tools, settings-file generation).

> **Note on language:** the tool descriptions, tool results and prompts of this server are written in Japanese. The manual can be searched and read in both Japanese and English (the `language` option; the CLI tutorial exists only in Japanese). Your agent can translate for you. The editor's screen names quoted in this document are the ones shown in the English UI.

## What it provides

| Kind | Name | Description |
|---|---|---|
| Tool | `kasane_list_docs` | Lists the pages of the manual and the CLI tutorial (page name, title, section headings). `language` chooses Japanese (`ja`) or English (`en`) |
| Tool | `kasane_read_doc` | Returns the full text of a page (or one section). For a long page it returns the position (`offset`) to continue from. This lets an agent read the whole page instead of guessing from search excerpts |
| Tool | `kasane_search_docs` | Searches the manual and the CLI tutorial; returns excerpts and page names. `language` chooses Japanese or English |
| Tool | `kasane_status` | Installation status (KeymapTool, manual, kasane and kasane-MCP versions, number of keyboards, license hints) and what to do next |
| Tool | `kasane_mcp_version` | The version of kasane-MCP itself |
| Tool | `kasane_get_output_settings` | Where settings files are saved (the default, the `KASANE` environment variable, whether saving there is allowed) |
| Tool | `kasane_list_devices` | Connected keyboards (UniqId, etc.) |
| Tool | `kasane_get_keymap` | The keymap currently loaded on a keyboard (remapped keys only; `all` for everything) |
| Tool | `kasane_get_layer_state` | Active layers, remapping ON/OFF, NICOLA |
| Tool | `kasane_get_settings` | Feature on/off, timing, sharing scope |
| Tool | `kasane_search_keycodes` | Finds `KC_*` keycodes by part of a name or by scan code |
| Tool | `kasane_get_file_format` | Describes the settings-file format (`*.kasane.json`) with working examples. Call it before writing a file |
| Tool | `kasane_validate_keymap` | Checks a `*.kasane.json` without touching any settings (keycodes, number ranges, duplicates, references to missing layers, where each action is allowed, power-key warnings) |
| Tool | `kasane_create_keymap_file` | Saves a validated setting as a new `*.kasane.json` and returns the steps to apply it. The location is chosen with `destination` (`KASANE` needs your permission) |
| Resource | `kasane-doc://manual/ja/{page}`, `kasane-doc://manual/en/{page}` | A full page of the manual (Japanese, English). Some clients do not let the agent read resources by itself (a person attaches them), so have the agent use `kasane_read_doc` |
| Resource | `kasane-doc://format/kasane-export` | The settings-file format and examples (same as `kasane_get_file_format`) |
| Resource | `kasane-doc://cli-tutorial` | The KeymapTool (CLI) tutorial |
| Prompt | `setup-first-time` / `remap-key` / `recover-lockout` | First-time setup, assigning keys, when you can't type |

## Usage

[Getting started](docs/GETTING-STARTED.en.md) shows how to register the server in Claude Desktop, and how to ask for key swaps, key sequences and so on. The essentials are below.

On Windows with kasane installed, register the server in your MCP client:

```json
{
  "mcpServers": {
    "kasane": { "command": "npx", "args": ["-y", "kasane-mcp"] }
  }
}
```

The server also starts where kasane is not installed (Linux, macOS, the VM of a cloud AI, and so on). There you can search keycodes, read the format description, and validate and create settings files. Manual search and keyboard reading work only on Windows with kasane installed. A file created in such an environment stays in it, so you bring it to your own PC and import it in the editor. For having Muse (muse.ai) install the server in its own VM, see [docs/FOR-MUSE.en.md](docs/FOR-MUSE.en.md).

The manual (`manual\ja` and `manual\en`) is looked up in this order:

1. The `KASANE_HOME` environment variable (a folder that contains `manual\ja` and `docs\TUTORIAL-CLI.md`)
2. `InstallDir` in the registry
3. `C:\Program Files\applet\kasane`

If it is not found, the server still starts. The tools tell you that it was not found.

## Applying a setting

This server only creates the file. You apply it to the keyboard yourself.

1. Ask the agent, for example, "Make Caps Lock a left Ctrl."
2. The agent creates a `*.kasane.json` (by default in `Documents\kasane-mcp\`; change it with the `KASANE_MCP_OUTPUT_DIR` environment variable).
3. In the kasane editor, press "Import / Export..." at the bottom, open the "Import" tab, and choose the file.
4. For the import mode, choose "Add" to only add to the current settings ("Replace" resets keys that are not in the file to their defaults). Check the result with "Preview", then press "Import".
5. Press "Apply to keyboard (ON)".

The files it creates are run through the editor's own import code (`PortableIO` and `PortableImporter`) to confirm that they load. When saving, it never overwrites a file and never writes outside the output folder.

## Where settings files are saved

- **By default**, in `Documents\kasane-mcp\`. Use the `KASANE_MCP_OUTPUT_DIR` environment variable to choose another folder.
- It can also save into `kasane-mcp\` under **kasane's settings folder** (the `KASANE` environment variable). `KASANE` is read from the process environment. If your MCP client passes only a filtered set of environment variables, it is read, read-only, from the Windows registry (the user's value first, then the machine-wide one). The editor's import and export screens open in the settings folder by default, so the files are easy to find there. This works **only when you allow it**: add an `env` entry to the kasane section of your MCP configuration. The agent cannot change this permission.

  ```json
  "kasane": {
    "command": "npx",
    "args": ["-y", "kasane-mcp"],
    "env": { "KASANE_MCP_ALLOW_KASANE_DIR": "1" }
  }
  ```

  Once allowed, the file goes to `KASANE\kasane-mcp\` only when the agent passes `kasane` as `destination` of `kasane_create_keymap_file`. Otherwise it goes to the default location. If `KASANE` is unset, not an absolute path, or not an existing folder, nothing is saved, and the settings folder is never created.
- File names always start with `kasane-mcp-`. It never writes `kasane-import.json` or `kasane-recovery.kasane.json`, which kasane reads automatically, and it never touches files such as `project.json` in the settings folder.

## Safety

- It only launches the read-only commands of KeymapTool.exe (`--list`, `--get*`). `--set-*`, `--on`, `--off`, `--apply*` and the like are not allowed in code.
- A UniqId must be 1 to 8 hexadecimal digits. Anything else is rejected before launching.
- Administrator rights are not needed.

## About the keycode table

`src/keycodes/data.ts` is generated from kasane's `KeycodeTable.cpp` with `tools/gen-keycodes.mjs`. When kasane gets new keycodes, regenerate it like this (a stopgap; in the future it is planned to come from a "knowledge pack" built with each kasane release):

```
node tools/gen-keycodes.mjs <kasane>\driver\KeymapTool\KeycodeTable.cpp
```

## Development

```
npm install
npm run build
npm test
```

## License

Apache License 2.0.

## Releasing (for maintainers)

Pushing a tag (`vX.Y.Z`) makes `.github/workflows/release.yml` publish to npm. It uses npm Trusted Publishing (OIDC) and no long-lived token. Before the first release, the preparation described at the top of `release.yml` (a first manual publish and registering the trusted publisher) is needed, after the repository is made public.

`node scripts/check-package.mjs` checks a package before publishing (that `dist/` is included, and that test fixtures and development files are not).

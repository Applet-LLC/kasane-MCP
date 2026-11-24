# Getting started with kasane-MCP

[日本語](GETTING-STARTED.md) | English

Ask an AI agent "Make Caps Lock a left Ctrl", and it creates a kasane settings file for you. This guide shows the setup and how to use it, with Claude Desktop as the example.

**This local MCP server only creates settings files.** You apply them yourself, by importing the file in the kasane editor. The agent creates only the settings file (`*.kasane.json`); applying it to the keyboard is something you do in the editor.

> The tool results and messages of kasane-MCP are in Japanese. The agent translates them when it talks to you.

## What you need

- kasane installed, with the license activated.
- Node.js 18 or later. Check that `npx` works by typing `node -v` and `npx -v` in a terminal.
- An AI agent. This guide covers Claude Desktop.

If kasane is in its default location (`C:\Program Files\applet\kasane`), it is found as is. If you installed it elsewhere, add an `env` entry to the settings below ([When kasane is not found](#when-kasane-is-not-found)).

## Using it with Claude Desktop

### First, turn on developer mode

To use an MCP server that runs on your own PC, such as kasane-MCP, you first need to turn on Claude Desktop's developer mode. Until you do, "Developer" does not appear in the settings.

How to turn on developer mode can change with Claude Desktop updates, so it is not written here. Ask Claude Desktop:

> How do I put Claude Desktop into developer mode?

Follow the steps it gives you, then continue below.

### Register the server

1. Open `claude_desktop_config.json`. In the Claude Desktop menu, choose "Developer", then "Open App config file" (the menu names may differ by version). The file opens in a folder window or in your registered editor.
2. Add an `mcpServers` entry to the file. The file lives at `%APPDATA%\Claude\claude_desktop_config.json`. With the Microsoft Store version of Claude Desktop, the real location is under `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\`. How to add it depends on what the file contains now.

   **If the file is empty, or contains only `{ }`**, make the whole file like this:

   ```json
   {
     "mcpServers": {
       "kasane": {
         "command": "npx",
         "args": ["-y", "kasane-mcp"]
       }
     }
   }
   ```

   **If the file has other settings but no `mcpServers`**, add `"mcpServers": { ... }` just before the final `}` of the file, at the same level as the other items. Don't forget to add a comma (`,`) after the current last item.

   For example, suppose the end of the file looks like this (the contents of `"preferences"` are omitted, and the path is your own user name):

   ```json
       },
     "coworkUserFilesPath": "C:\\Users\\(your user name)\\Claude"
   }
   ```

   Add a comma at the end of the `"coworkUserFilesPath"` line and continue with `mcpServers` below it. After the change, the end looks like this:

   ```json
       },
     "coworkUserFilesPath": "C:\\Users\\(your user name)\\Claude",
     "mcpServers": {
       "kasane": {
         "command": "npx",
         "args": ["-y", "kasane-mcp"]
       }
     }
   }
   ```

   Don't put a comma after the last item (`"mcpServers"`). Leave the earlier part of the file, such as `"preferences"`, as it is.

   **If `mcpServers` already exists**, add only the `"kasane": { ... }` part inside its `{ }`, after a comma following the other server's definition.

   ```json
   "mcpServers": {
     "(an existing server)": { "command": "..." },
     "kasane": {
       "command": "npx",
       "args": ["-y", "kasane-mcp"]
     }
   }
   ```

   A missing comma or a missing bracket makes Claude Desktop unable to read the settings. Before saving, check that the numbers of `{` and `}` match.

3. Save, quit Claude Desktop completely (not just closing the window; quit it from the system tray too), and start it again.
4. After the restart, Claude Desktop treats the registered kasane as a "plugin". In a new conversation, ask:

   > Please enable the plugin kasane-MCP.

   Once it is enabled, go on to "Check that it works".

If it does not start, change `command` and `args` to this form and try again:

```json
"command": "cmd",
"args": ["/c", "npx", "-y", "kasane-mcp"]
```

### Check that it works

In a conversation where kasane-MCP is enabled, ask:

> Tell me the status of kasane.

If it returns whether kasane is installed, its version and the number of connected keyboards, it works. If it says "UniqId is 00000000", the license may not be activated yet.

## Asking for settings

After registration, the flow is the same for any agent. Here are three ways to ask.

In every example, the agent goes through these steps:

1. Check the installation and the current keymap.
2. Look up the keycodes to use, and validate the contents of the settings file.
3. If there is no problem, save a `*.kasane.json` in `Documents\kasane-mcp\`.
4. Tell you where the file is and how to import it in the editor.

At this point, nothing has changed on the keyboard yet.

### Example A: swap Caps Lock and left Ctrl

> Create a settings file that swaps Caps Lock and left Ctrl.

This targets the Caps Lock at the position of the Eisu key on a JIS keyboard. The setting it creates is the same as [capslock-ctrl-swap.kasane.json](examples/capslock-ctrl-swap.kasane.json).

### Example B: type a fixed string when a key is pressed (output a key sequence)

> Make Ctrl+1 type "ありがとうございます".

A kasane "macro" types a sequence of keys in order. In this example it creates a macro that types the romaji `a r i g a t o u g o z a i m a s u` and assigns it to Ctrl+1. The setting it creates is the same as [ctrl1-macro.kasane.json](examples/ctrl1-macro.kasane.json).

- With the IME on, pressing it enters "ありがとうございます". Press Enter to confirm.
- One macro holds up to 64 steps. A key uses 2 steps, so you can type about 32 keys. Long text does not fit.
- A macro can contain only keycodes, not Japanese characters themselves. This example assumes romaji input. If you use kana input, the same keys produce different characters.

### Example C: arrow keys with Space + H J K L

> Make H J K L act as arrow keys while Space is held.

While Space is held down, a different layer is active. A short press is a normal Space. The setting it creates is the same as [space-arrows.kasane.json](examples/space-arrows.kasane.json). If you type fast, a press may be taken as a hold by mistake. In that case, change the decision method in the "Timing" tab of the editor's settings.

## Import it in the editor and apply it

Import the file the agent saved in the kasane editor.

1. Open the editor. To apply to the keyboard, it must be running as administrator.
2. Press "Import / Export..." at the bottom of the window and choose the "Import" tab.
3. With "Choose File...", pick the file the agent told you about.
4. For the import mode, choose **"Add"**. It keeps your current settings and only adds the contents of this file. **"Replace" rebuilds the selected items and resets keys that are not in the file to their defaults.** Use it only to swap the whole setting.
5. Match the keyboards in the file to your connected keyboards (they are assigned automatically).
6. Press "Preview" to see the result. If it is fine, press "Import".
7. Finally, press "Apply to keyboard (ON)". Only now does the keyboard's behavior change.

Before importing, export your current settings with "Export" as a precaution. Then you can always go back.

### When you can't type

Hold the left and right Ctrl and the left and right Shift (the default combination) together for 3 seconds. Remapping turns OFF. Then fix the settings in the editor. For details, see "7. Emergency release" in the kasane manual. If you tell the agent "I can't type any more", it gives you the same steps.

## Using the example files without AI

The files for examples A to C are in [docs/examples](examples/). Download them and import them with the steps above, and you get the same settings without an agent.

## Troubleshooting

### When kasane is not found

If you installed kasane somewhere other than the default location, add an `env` entry to the registration. Set `KASANE_HOME` to the kasane installation folder, the one that contains the `manual` and `docs` folders.

```json
"kasane": {
  "command": "npx",
  "args": ["-y", "kasane-mcp"],
  "env": { "KASANE_HOME": "D:\\Tools\\applet\\kasane" }
}
```

### When the tools do not appear

- Check the JSON syntax. A missing comma or a missing closing bracket is the most common cause.
- Check that `node -v` is 18 or later.
- Quit Claude Desktop completely and start it again.
- On a work or school PC, local MCP servers may be restricted. Ask your administrator.

### When an old version keeps running after a new one is published

Even after a new version is published, the old server keeps running while Claude Desktop is running. Starting a new conversation does not replace it. To see the version, ask "What version of kasane-MCP is this?"

Quit Claude Desktop, including from the system tray (not just closing the window), and start it again. If it is still the old version, change `args` in the settings to `["-y", "kasane-mcp@latest"]`. It then checks for the latest version at every start.

### When the settings file is not saved

If the agent says "validation found errors", something in the settings is wrong. The agent fixes it and saves again. You can change the location with the `KASANE_MCP_OUTPUT_DIR` environment variable.

## What kasane-MCP can and cannot do

- **Can do:** search the kasane manual, check the installation, read the connected keyboards and their current keymaps, search keycodes, validate and save settings files.
- **Does not do:** change keyboard settings, turn remapping ON or OFF, write to the driver. It does not use administrator rights either.
- Applying is always done by you, in the editor.

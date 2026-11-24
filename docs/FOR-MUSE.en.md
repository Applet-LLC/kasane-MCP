# How to set up kasane-mcp in Muse (muse.ai)

[日本語](FOR-MUSE.md) | English

Audience: the Muse agent (running on a Linux VM). This is not written for human users. The user asks Muse like this:

> Please set up the MCP server "kasane-mcp" for kasane in your Muse.
> The instructions are at https://github.com/Applet-LLC/kasane-MCP/blob/main/docs/FOR-MUSE.en.md.
> Read them, do the installation and checks exactly as written, and report which tools work and which do not.

With this method, kasane-mcp runs inside Muse's VM. Nothing on the user's PC is exposed.
How to register it in Claude Desktop is in GETTING-STARTED.en.md (it does not apply to Muse).

## What it is

- Source: only the `kasane-mcp` package on the official npm registry (published by Applet LLC). Do not install a similarly named package or install from any other source.
- An MCP server for kasane (a key remapper for Windows). npm package `kasane-mcp`, stdio transport, Node.js >= 18.
- It does **not write** to the driver or to kasane's settings. It only searches the manual and generates and validates settings files (`*.kasane.json`).
- Muse's VM has no kasane (it is Windows software), so the tools below do not work. Tell the user so honestly. Do not pretend they work.
  - Not available: `kasane_search_docs`, `kasane_list_docs`, `kasane_read_doc`, `kasane_list_devices`, `kasane_get_keymap`, `kasane_get_layer_state`, `kasane_get_settings`
  - Available: `kasane_mcp_version`, `kasane_search_keycodes`, `kasane_get_file_format`, `kasane_validate_keymap`, `kasane_create_keymap_file`, `kasane_get_output_settings`, `kasane_status` (returns normally, reporting that kasane was not found)
- Files you create are made inside the VM. Hand the file itself to the user, so they can import it on their own PC.

## Step 1: Install it in the VM

Use `~/workspace/custom-connectors/custom.kasane-mcp/server/` as the install location, without exception.
From 0.1.8 on, it installs normally on Linux. Up to 0.1.7, `"os": ["win32"]` in package.json made it fail with EBADPLATFORM on Linux. Always install the latest version.

```sh
VER=$(npm view kasane-mcp version)
mkdir -p /tmp/kasane-mcp-install && cd /tmp/kasane-mcp-install
npm pack "kasane-mcp@$VER"
mkdir -p ~/workspace/custom-connectors/custom.kasane-mcp/server
tar xzf "kasane-mcp-$VER.tgz" -C ~/workspace/custom-connectors/custom.kasane-mcp/server --strip-components=1
cd ~/workspace/custom-connectors/custom.kasane-mcp/server
npm install --omit=dev
```

## Step 2: Prepare a stdio client

Muse has no UI for registering MCP servers. Use a small client that starts the server as a child process and exchanges JSON-RPC over stdio.

First, create the place for the client:

```sh
mkdir -p ~/workspace/custom-connectors/custom.kasane-mcp/bin
```

Save the following as `~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py`.

```python
#!/usr/bin/env python3
import argparse, json, subprocess, os
SERVER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server")
ENTRY = os.path.join(SERVER_DIR, "dist", "index.js")

def run(requests):
    proc = subprocess.Popen(["node", ENTRY], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=SERVER_DIR)
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2025-03-26", "capabilities": {},
                    "clientInfo": {"name": "muse-kasane-client", "version": "0.1"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
    ] + requests
    out, _ = proc.communicate("\n".join(json.dumps(m) for m in msgs) + "\n", timeout=30)
    return {o["id"]: o for line in out.splitlines() if line.strip()
            for o in [json.loads(line)] if "id" in o}

ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
sub.add_parser("list-tools")
ct = sub.add_parser("call-tool")
ct.add_argument("--name", required=True)
ct.add_argument("--arguments")
ct.add_argument("--arguments-file")
a = ap.parse_args()
if a.cmd == "list-tools":
    r = run([{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}])
    print(json.dumps(r.get(2, {}).get("result", {}), ensure_ascii=False, indent=2))
else:
    tool_args = (json.load(open(a.arguments_file, encoding="utf-8")) if a.arguments_file
                 else json.loads(a.arguments) if a.arguments else {})
    r = run([{"jsonrpc": "2.0", "id": 2, "method": "tools/call",
              "params": {"name": a.name, "arguments": tool_args}}])
    print(json.dumps(r.get(2, {}).get("result", r.get(2, {})), ensure_ascii=False, indent=2))
```

## Step 3: Verify (say "installed" only after all of these pass)

```sh
python3 ~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py list-tools
# -> 14 tools are returned (as of 0.1.10. If a later version adds or removes tools,
#    take that version's count as correct, and report only a decrease as abnormal)

python3 ~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py call-tool \
  --name kasane_mcp_version --arguments '{}'
# -> {"name": "kasane-mcp", "version": "<the version you installed>", "kasaneVersion": null}

python3 ~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py call-tool \
  --name kasane_search_keycodes --arguments '{"query":"KC_ESC"}'
# -> KC_ESCAPE / SC_0001 is returned
```

## Step 4: Keep a record

Record the setup in `~/workspace/custom-connectors/custom.kasane-mcp/CONNECTOR.md`, using the template below.
In later conversations, read this record before doing any kasane work.

```markdown
# kasane-mcp connector (Muse VM)

- Install location: ~/workspace/custom-connectors/custom.kasane-mcp/server/
- Installed version: <the version kasane_mcp_version returned in step 3>
- Client: ~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py
  - List: python3 <client> list-tools
  - Call: python3 <client> call-tool --name <tool name> --arguments '<JSON>'

## Tools that work in the VM
kasane_mcp_version / kasane_search_keycodes / kasane_get_file_format /
kasane_validate_keymap / kasane_create_keymap_file /
kasane_get_output_settings / kasane_status (returns "kasane not found")

## Tools that do not work in the VM (kasane itself is on the Windows side)
kasane_search_docs / kasane_list_docs / kasane_read_doc / kasane_list_devices / kasane_get_keymap /
kasane_get_layer_state / kasane_get_settings

## Notes
- This server never writes to the driver or to kasane's settings.
- Hand the created *.kasane.json to the user as a file.
  The user applies it by importing it in the kasane editor on Windows.
```

## After setup: how to use it

When the user asks something like "I want Caps Lock to be left Ctrl":

1. Check the format with `kasane_get_file_format`.
2. Build the setting and validate it with `kasane_validate_keymap`.
3. Create the `*.kasane.json` with `kasane_create_keymap_file`, and **hand the file itself to the user**.
4. The user applies it on Windows, in the kasane editor: "Import / Export..." → "Import" tab. Do not automate this part.

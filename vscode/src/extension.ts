import * as vscode from "vscode";

interface ManifestNode {
  label: string;
  description: string;
  children?: ManifestNode[];
}

const defaultNodes: ManifestNode[] = [
  {
    label: "support-crm-mcp",
    description: "workspace manifest",
    children: [
      { label: "refund_order", description: "tool, warning: confirmation copy recommended" },
      { label: "lookup_order", description: "tool, read-only" },
      { label: "crm://customers/{id}", description: "resource" },
      { label: "refund_triage", description: "prompt" },
    ],
  },
];

class AgentStudioManifestProvider implements vscode.TreeDataProvider<ManifestNode> {
  constructor(private nodes: ManifestNode[]) {}

  getTreeItem(element: ManifestNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      element.children?.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    item.description = element.description;
    item.tooltip = `${element.label}: ${element.description}`;
    item.contextValue = element.children?.length ? "agentStudioServer" : "agentStudioManifestItem";
    return item;
  }

  getChildren(element?: ManifestNode): ManifestNode[] {
    return element?.children ?? this.nodes;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new AgentStudioManifestProvider(defaultNodes);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("agentStudio.manifest", provider));

  context.subscriptions.push(
    vscode.commands.registerCommand("agentStudio.connectWorkspace", async () => {
      const candidates = await vscode.workspace.findFiles("**/{mcp.json,mcp-servers.json,.mcp.json}", "**/node_modules/**", 20);
      const message = candidates.length
        ? `Agent Studio found ${candidates.length} workspace MCP config file(s).`
        : "Agent Studio found no workspace MCP configs. Use Compose or continue in the desktop app.";
      await vscode.window.showInformationMessage(message);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentStudio.openCompose", () => {
      const panel = vscode.window.createWebviewPanel("agentStudioCompose", "Agent Studio Compose", vscode.ViewColumn.Beside, {
        enableScripts: true,
      });
      panel.webview.html = composeWebviewHtml();
      panel.reveal();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentStudio.openDesktop", async () => {
      await vscode.env.openExternal(vscode.Uri.parse("auraone://agent-studio/open?surface=replay"));
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ pattern: "**/*.{ts,tsx,js,jsx,py,json}" }, {
      provideHover(document) {
        const text = document.getText();
        if (text.includes("delete_customer")) {
          return new vscode.Hover("Agent Studio risk: destructive MCP tool should require explicit confirmation and dry-run review.");
        }
        if (text.includes("refund_order")) {
          return new vscode.Hover("Agent Studio risk: financial MCP tool should include confirmation copy and idempotency keys.");
        }
        return undefined;
      },
    }),
  );
}

export function deactivate() {
  return undefined;
}

function composeWebviewHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Studio Compose</title>
  <style>
    :root {
      color-scheme: light;
      --pl-font-ui: var(
        --pl-official-font-ui,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Arial,
        sans-serif
      );
      --pl-font-mono: var(
        --pl-official-font-mono,
        ui-monospace,
        "SFMono-Regular",
        Consolas,
        monospace
      );
      font-family: var(--pl-font-ui);
      background: #f5f7fa;
      color: #101820;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #101820; }
    main { max-width: 760px; padding: 20px; display: grid; gap: 16px; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    label { display: grid; gap: 6px; color: #3f4b59; font-size: 12px; font-weight: 600; }
    textarea, select, button {
      min-height: 36px;
      padding: 8px 10px;
      border: 1px solid #d5dde6;
      border-radius: 6px;
      background: #ffffff;
      color: #101820;
      font: inherit;
    }
    textarea {
      min-height: 220px;
      font-family: var(--pl-font-mono);
      line-height: 1.5;
    }
    button {
      justify-self: start;
      border-color: #007582;
      background: #007582;
      color: #ffffff;
      font-weight: 650;
      cursor: pointer;
    }
    button:hover { border-color: #006a75; background: #006a75; }
    textarea:focus-visible, select:focus-visible, button:focus-visible {
      outline: 2px solid #0b6cff;
      outline-offset: 2px;
    }
    pre {
      padding: 12px;
      overflow-wrap: anywhere;
      border: 1px solid #e3e8ee;
      border-radius: 6px;
      background: #eef2f6;
      color: #3f4b59;
      white-space: pre-wrap;
    }
    @media (max-width: 600px) {
      main { padding: 14px; }
      textarea, select, button { min-height: 44px; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Agent Studio Compose</h1>
    <label>Tool <select><option>refund_order</option><option>lookup_order</option></select></label>
    <label>JSON payload <textarea>{ "order_id": "ORD-1842", "reason": "late", "notify_customer": true }</textarea></label>
    <button type="button">Send to Desktop Replay</button>
    <pre>Deep link: auraone://agent-studio/open?surface=compose</pre>
  </main>
</body>
</html>`;
}

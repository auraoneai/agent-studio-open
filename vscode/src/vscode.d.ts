declare module "vscode" {
  export interface Disposable {
    dispose(): unknown;
  }

  export interface ExtensionContext {
    subscriptions: Disposable[];
    workspaceState: {
      get<T>(key: string, fallback?: T): T | undefined;
      update(key: string, value: unknown): Thenable<void>;
    };
  }

  export interface TreeDataProvider<T> {
    getTreeItem(element: T): TreeItem | Thenable<TreeItem>;
    getChildren(element?: T): ProviderResult<T[]>;
  }

  export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

  export class TreeItem {
    constructor(label: string, collapsibleState?: TreeItemCollapsibleState);
    label?: string;
    description?: string | boolean;
    tooltip?: string;
    contextValue?: string;
  }

  export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
  }

  export const commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
    executeCommand(command: string, ...rest: unknown[]): Thenable<unknown>;
  };

  export const window: {
    registerTreeDataProvider<T>(viewId: string, provider: TreeDataProvider<T>): Disposable;
    showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    showTextDocument(document: TextDocument, options?: { preview?: boolean; viewColumn?: ViewColumn }): Thenable<unknown>;
    createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: ViewColumn,
      options?: { enableScripts?: boolean },
    ): WebviewPanel;
  };

  export const workspace: {
    workspaceFolders?: Array<{ uri: Uri; name: string }>;
    findFiles(include: string, exclude?: string, maxResults?: number): Thenable<Uri[]>;
    openTextDocument(content: { content: string; language: string } | Uri): Thenable<TextDocument>;
  };

  export class Uri {
    static parse(value: string): Uri;
    toString(): string;
    fsPath: string;
  }

  export interface TextDocument {
    getText(): string;
  }

  export interface WebviewPanel {
    webview: { html: string };
    reveal(): void;
  }

  export enum ViewColumn {
    One = 1,
    Beside = 2,
  }

  export namespace env {
    function openExternal(target: Uri): Thenable<boolean>;
  }

  export namespace languages {
    function registerHoverProvider(selector: string | { pattern: string }, provider: HoverProvider): Disposable;
  }

  export interface HoverProvider {
    provideHover(document: TextDocument, position: Position): ProviderResult<Hover>;
  }

  export class Position {
    line: number;
    character: number;
  }

  export class Hover {
    constructor(contents: string);
  }
}

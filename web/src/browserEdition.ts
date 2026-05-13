import type { Capability, Transport } from "../../app/src/types";

export const browserAllowedTransports: Transport[] = ["sse", "http", "websocket"];

export const browserBlockedCapabilities = ["stdio", "otlp-receiver", "keychain"] as const;

const DB_NAME = "agent-studio-open";
const DB_VERSION = 1;
const TRACE_STORE = "traceSessions";
const SECRET_STORE = "providerKeys";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface BrowserTraceSession {
  id: string;
  name: string;
  createdAt: string;
  payload: unknown;
}

export interface BrowserProviderKeyRecord {
  provider: string;
  salt: string;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

export function canBrowserUseTransport(transport: Transport): boolean {
  return browserAllowedTransports.includes(transport);
}

export function describeBrowserConstraint(capability: Capability): string {
  if (capability.browser) {
    return `${capability.label} is available in the browser edition.`;
  }
  return capability.reason ?? `${capability.label} is desktop-only.`;
}

export function guardBrowserConnection(transport: Transport): { ok: true } | { ok: false; message: string } {
  if (canBrowserUseTransport(transport)) {
    return { ok: true };
  }
  return {
    ok: false,
    message: "Browser edition supports MCP only over SSE, HTTP, and WebSocket. It cannot spawn stdio servers.",
  };
}

export async function putBrowserTraceSession(session: BrowserTraceSession): Promise<void> {
  const db = await openBrowserDatabase();
  await putRecord(db, TRACE_STORE, session);
  db.close();
}

export async function getBrowserTraceSession(id: string): Promise<BrowserTraceSession | undefined> {
  const db = await openBrowserDatabase();
  const session = await getRecord<BrowserTraceSession>(db, TRACE_STORE, id);
  db.close();
  return session;
}

export async function listBrowserTraceSessions(): Promise<BrowserTraceSession[]> {
  const db = await openBrowserDatabase();
  const sessions = await getAllRecords<BrowserTraceSession>(db, TRACE_STORE);
  db.close();
  return sessions;
}

export async function saveBrowserProviderKey(provider: string, apiKey: string, passphrase: string): Promise<BrowserProviderKeyRecord> {
  if (!provider.trim()) {
    throw new Error("provider is required");
  }
  if (apiKey.length < 8) {
    throw new Error("provider API key is too short");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBrowserSecretKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, encoder.encode(apiKey));
  const record: BrowserProviderKeyRecord = {
    provider,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
  };
  const db = await openBrowserDatabase();
  await putRecord(db, SECRET_STORE, record);
  db.close();
  return record;
}

export async function loadBrowserProviderKey(provider: string, passphrase: string): Promise<string> {
  const db = await openBrowserDatabase();
  const record = await getRecord<BrowserProviderKeyRecord>(db, SECRET_STORE, provider);
  db.close();
  if (!record) {
    throw new Error(`no provider key saved for ${provider}`);
  }
  const salt = base64ToBytes(record.salt);
  const iv = base64ToBytes(record.iv);
  const key = await deriveBrowserSecretKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, asBufferSource(base64ToBytes(record.ciphertext)));
  return decoder.decode(plaintext);
}

export function validateByoProviderKey(provider: string, apiKey: string): { ok: true } | { ok: false; message: string } {
  if (!provider.trim()) {
    return { ok: false, message: "Choose a provider before saving a key." };
  }
  if (apiKey.trim().length < 8) {
    return { ok: false, message: "Provider API key must be at least 8 characters." };
  }
  return { ok: true };
}

async function deriveBrowserSecretKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (passphrase.length < 8) {
    throw new Error("passphrase must be at least 8 characters");
  }
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: asBufferSource(salt), iterations: 210_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function openBrowserDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACE_STORE)) {
        db.createObjectStore(TRACE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SECRET_STORE)) {
        db.createObjectStore(SECRET_STORE, { keyPath: "provider" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("failed to open browser database"));
  });
}

function putRecord(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`failed to write ${storeName}`));
  });
}

function getRecord<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error(`failed to read ${storeName}`));
  });
}

function getAllRecords<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error(`failed to list ${storeName}`));
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

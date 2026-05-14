export interface IntakeInstallSigningKeypair {
  algorithm: "Ed25519";
  public_key: string;
  private_key: string;
  created_at: string;
}

const memoryKeychain = new Map<string, IntakeInstallSigningKeypair>();

export async function ensureAgentIntakeInstallSigningKeypair(): Promise<IntakeInstallSigningKeypair> {
  const existing = memoryKeychain.get("agent-studio-open");
  if (existing) {
    return existing;
  }
  const created: IntakeInstallSigningKeypair = {
    algorithm: "Ed25519",
    public_key: "agent-studio-open:intake:install:public",
    private_key: "agent-studio-open:intake:install:private",
    created_at: new Date().toISOString(),
  };
  memoryKeychain.set("agent-studio-open", created);
  return created;
}

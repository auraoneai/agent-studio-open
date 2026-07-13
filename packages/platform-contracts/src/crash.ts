export interface CrashReporterConfig {
  enabled: boolean;
  provider: 'sentry';
  project: string;
  scrubPaths: boolean;
  scrubHostnames: boolean;
  scrubApiKeys: boolean;
  scrubEnvironment: boolean;
  uploadMinidumpsOnNextLaunch: boolean;
  sampleRate: 1;
}

export function defaultCrashReporterConfig(project: string): CrashReporterConfig {
  return {
    enabled: false,
    provider: 'sentry',
    project,
    scrubPaths: true,
    scrubHostnames: true,
    scrubApiKeys: true,
    scrubEnvironment: true,
    uploadMinidumpsOnNextLaunch: true,
    sampleRate: 1,
  };
}

const API_KEY_RE =
  /(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{20,})/g;

export function scrubDiagnosticText(input: string): string {
  return input
    .replace(/[A-Za-z]:\\[^ \n\r\t]+/g, '<PATH>')
    .replace(/\/Users\/[^ \n\r\t]+/g, '<PATH>')
    .replace(/\/home\/[^ \n\r\t]+/g, '<PATH>')
    .replace(/\b[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '<HOSTNAME>')
    .replace(API_KEY_RE, '<SECRET>');
}

export function scrubCrashText(input: string): string {
  return scrubDiagnosticText(input);
}

export function sanitizeConsoleArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === 'string') {
      return scrubDiagnosticText(arg);
    }
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: scrubDiagnosticText(arg.message),
        stack: arg.stack ? scrubDiagnosticText(arg.stack) : undefined,
      };
    }
    return arg;
  });
}

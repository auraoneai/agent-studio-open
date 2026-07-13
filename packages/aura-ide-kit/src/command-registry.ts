import type { AuraCommand } from "./types";

export type CommandRegistry = {
  register: (command: AuraCommand) => () => void;
  list: () => AuraCommand[];
  find: (query: string) => AuraCommand[];
  run: (id: string) => Promise<void>;
};

export function createCommandRegistry(initialCommands: AuraCommand[] = []): CommandRegistry {
  const commands = new Map<string, AuraCommand>();
  for (const command of initialCommands) {
    commands.set(command.id, command);
  }

  const list = () => Array.from(commands.values()).sort((a, b) => a.title.localeCompare(b.title));

  return {
    register(command) {
      if (commands.has(command.id)) {
        throw new Error(`Command already registered: ${command.id}`);
      }
      commands.set(command.id, command);
      return () => {
        commands.delete(command.id);
      };
    },
    list,
    find(query) {
      const available = list();
      const normalizedQuery = normalize(query);
      if (!normalizedQuery) {
        return available;
      }

      return available.filter((command) => {
        const haystack = normalize([command.title, command.group, command.id, ...(command.keywords ?? [])].join(" "));
        return haystack.includes(normalizedQuery) || isSubsequence(normalizedQuery, haystack);
      });
    },
    async run(id) {
      const command = commands.get(id);
      if (!command) {
        throw new Error(`Unknown command: ${id}`);
      }
      if (command.disabled) {
        return;
      }
      await command.handler();
    },
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) {
      index += 1;
    }
    if (index === needle.length) {
      return true;
    }
  }
  return false;
}

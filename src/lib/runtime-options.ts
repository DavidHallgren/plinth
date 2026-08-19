import { homedir } from "node:os";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

export type RuntimeEnvironment = Record<string, string | undefined>;

export type ServerRuntimeOptions = {
  dataDirectory: string;
  hostname: string;
  openBrowser: boolean;
  port: number;
  showHelp: boolean;
};

type PathContext = {
  currentDirectory?: string;
  environment?: RuntimeEnvironment;
  homeDirectory?: string;
  platform?: string;
};

export function defaultProjectDirectory(context: PathContext = {}): string {
  const platform = context.platform ?? process.platform;
  const environment = context.environment ?? process.env;
  const homeDirectory = context.homeDirectory ?? homedir();
  if (platform === "darwin") return join(homeDirectory, "Library", "Application Support", "Plinth", "projects");
  if (platform === "win32") return join(environment.LOCALAPPDATA?.trim() || join(homeDirectory, "AppData", "Local"), "Plinth", "projects");
  return join(environment.XDG_DATA_HOME?.trim() || join(homeDirectory, ".local", "share"), "plinth", "projects");
}

export function resolveDataDirectory(value: string, context: PathContext = {}): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("The data directory cannot be empty.");
  const homeDirectory = context.homeDirectory ?? homedir();
  const expanded = trimmed === "~"
    ? homeDirectory
    : trimmed.startsWith("~/") || trimmed.startsWith("~\\")
      ? join(homeDirectory, trimmed.slice(2))
      : trimmed;
  return resolve(context.currentDirectory ?? process.cwd(), expanded);
}

function optionValue(args: readonly string[], index: number, option: string): { value: string; consumed: number } {
  const argument = args[index];
  const inlinePrefix = `${option}=`;
  if (argument?.startsWith(inlinePrefix)) return { value: argument.slice(inlinePrefix.length), consumed: 0 };
  const next = args[index + 1];
  if (!next || next.startsWith("--")) throw new Error(`Option ${option} requires a value.`);
  return { value: next, consumed: 1 };
}

function parsePort(value: string, source: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`${source} must be an integer between 0 and 65535.`);
  return port;
}

export function parseServerRuntimeOptions(
  args: readonly string[],
  context: PathContext = {},
): ServerRuntimeOptions {
  const environment = context.environment ?? process.env;
  let dataDirectoryValue = environment.PLINTH_DATA_ROOT?.trim() || defaultProjectDirectory({ ...context, environment });
  let port = environment.PORT?.trim() ? parsePort(environment.PORT, "PORT") : 0;
  let openBrowser = !["1", "true", "yes"].includes(environment.PLINTH_NO_OPEN?.trim().toLowerCase() ?? "");
  let showHelp = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (argument === "--help" || argument === "-h") {
      showHelp = true;
      continue;
    }
    if (argument === "--no-open") {
      openBrowser = false;
      continue;
    }
    if (argument === "--data-dir" || argument.startsWith("--data-dir=")) {
      const parsed = optionValue(args, index, "--data-dir");
      dataDirectoryValue = parsed.value;
      index += parsed.consumed;
      continue;
    }
    if (argument === "--port" || argument.startsWith("--port=")) {
      const parsed = optionValue(args, index, "--port");
      port = parsePort(parsed.value, "--port");
      index += parsed.consumed;
      continue;
    }
    throw new Error(`Unknown option "${argument}". Use --help for usage.`);
  }

  return {
    dataDirectory: resolveDataDirectory(dataDirectoryValue, context),
    hostname: environment.HOST?.trim() || "127.0.0.1",
    openBrowser,
    port,
    showHelp,
  };
}

export function serverHelp(defaultDirectory = defaultProjectDirectory()): string {
  return `Plinth

Usage:
  plinth [options]

Options:
  --data-dir <path>  Store projects in this directory
  --port <number>    Listen on this port; 0 chooses an available port (default: 0)
  --no-open          Do not open the editor in the default browser
  --help, -h         Show this help

Default project directory:
  ${defaultDirectory}

Environment:
  PLINTH_DATA_ROOT, PORT, HOST, and PLINTH_NO_OPEN
`;
}

export function browserOpenCommand(url: string, platform = process.platform): string[] | null {
  if (platform === "darwin") return ["open", url];
  if (platform === "win32") return ["cmd", "/c", "start", "", url];
  if (["linux", "freebsd", "openbsd"].includes(platform)) return ["xdg-open", url];
  return null;
}

type AvailablePortResolver = (hostname: string) => Promise<number>;

async function probeAvailablePort(hostname: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen({ host: hostname, port: 0, exclusive: true }, () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not choose an available local port."));
        return;
      }
      probe.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

export async function resolveServerPort(port: number, hostname: string, resolveAvailablePort: AvailablePortResolver = probeAvailablePort): Promise<number> {
  return port === 0 ? resolveAvailablePort(hostname) : port;
}

export function openEditorInBrowser(url: string, platform = process.platform): boolean {
  const command = browserOpenCommand(url, platform);
  if (!command) return false;
  try {
    const child = Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

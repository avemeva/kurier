# 03 — @tg/logger

## Purpose
Structured logging shared across all packages and apps. Pluggable transport system — each consumer configures where logs go (stdout, file, beacon, etc.).

## Package
- **Name:** `@tg/logger`
- **Location:** `packages/logger/`
- **Dependencies:** none (zero deps)

## Structure
```
packages/logger/
├── src/
│   ├── index.ts          # Re-exports
│   ├── logger.ts         # Core Logger class
│   ├── transports.ts     # Built-in transports
│   └── types.ts          # LogEntry, LogLevel, Transport types
├── __tests__/
│   └── logger.test.ts
├── package.json
└── tsconfig.json
```

## API

### types.ts
```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogSource = "daemon" | "cli" | "web" | "app" | "store";

export interface LogEntry {
  time: number;      // Date.now()
  source: LogSource;
  level: LogLevel;
  message: string;
  context?: string;  // tab ID, request ID, etc.
  data?: unknown;    // structured payload
}

export interface Transport {
  write(entry: LogEntry): void;
}
```

### logger.ts
```ts
export class Logger {
  constructor(source: LogSource, transports?: Transport[]);

  // Log methods
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;

  // Child logger with context
  child(context: string): Logger;

  // Add/remove transports at runtime
  addTransport(transport: Transport): void;
  removeTransport(transport: Transport): void;
}
```

### transports.ts
```ts
// Format: "HH:MM:SS.mmm SOURCE LEVEL [CTX] message"
export class ConsoleTransport implements Transport {
  constructor(options?: { minLevel?: LogLevel });
  write(entry: LogEntry): void;
}

// Write to file (append mode)
export class FileTransport implements Transport {
  constructor(filePath: string, options?: { minLevel?: LogLevel });
  write(entry: LogEntry): void;
}

// Write JSON lines (for structured log processing)
export class JsonTransport implements Transport {
  constructor(writeFn: (json: string) => void);
  write(entry: LogEntry): void;
}
```

## Usage Examples

```ts
// Daemon
const log = new Logger("daemon", [
  new ConsoleTransport(),
  new FileTransport("~/.tg/daemon.log"),
]);

// CLI
const log = new Logger("cli", [
  new ConsoleTransport({ minLevel: "warn" }), // only warn/error to stderr
]);

// Web (browser)
const log = new Logger("web", [
  new ConsoleTransport(),
  // Custom beacon transport added by consumer
]);
```

## Safe Stringify
- Handles circular references
- Converts BigInt to string
- Caps string length at 4096 chars
- Used internally for `data` field serialization

## Testability
- Unit test all log methods
- Test transport filtering (minLevel)
- Test child logger context propagation
- Test safe stringify edge cases (circular, BigInt, large strings)
- Mock transports — no I/O needed for tests

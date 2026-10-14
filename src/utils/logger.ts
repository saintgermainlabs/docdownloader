/**
 * Logging and diagnostic utilities for docdownloader and ddocs CLI.
 */

// Text formatting / ANSI colors
const isTTY = Boolean(process.stdout.isTTY);

export const colors = {
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  red: (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  blue: (s: string) => (isTTY ? `\x1b[34m${s}\x1b[0m` : s),
  magenta: (s: string) => (isTTY ? `\x1b[35m${s}\x1b[0m` : s),
  cyan: (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
  gray: (s: string) => (isTTY ? `\x1b[90m${s}\x1b[0m` : s),
};

let explicitDebug: boolean | null = null;

/**
 * Checks if debug mode is currently active via environment variables or explicit toggle.
 */
export function isDebugEnabled(): boolean {
  if (explicitDebug !== null) {
    return explicitDebug;
  }
  const envVal = (
    process.env.DEBUG ||
    process.env.DDOCS_DEBUG ||
    process.env.DOCDOWNLOADER_DEBUG ||
    process.env.VERBOSE ||
    ''
  ).toLowerCase().trim();

  return (
    envVal === '1' ||
    envVal === 'true' ||
    envVal === 'yes' ||
    envVal === 'on' ||
    envVal === '*' ||
    envVal.includes('ddocs') ||
    envVal.includes('docdownloader')
  );
}

/**
 * Explicitly enables or disables debug mode.
 */
export function setDebugMode(enabled: boolean): void {
  explicitDebug = enabled;
  if (enabled) {
    process.env.DEBUG = '1';
    process.env.DDOCS_DEBUG = '1';
  }
}

/**
 * Returns formatted local timestamp: HH:MM:SS.mmm
 */
function getTimestamp(): string {
  const now = new Date();
  return colors.gray(now.toISOString().substring(11, 23));
}

/**
 * Structured Logger for docdownloader crawler and CLI.
 */
export const logger = {
  /**
   * Verbose debug log - only outputs when debug mode is enabled.
   */
  debug(tag: string, message: string, ...details: any[]): void {
    if (!isDebugEnabled()) return;
    const prefix = `${getTimestamp()} ${colors.magenta(`[DEBUG:${tag}]`)}`;
    if (details.length > 0) {
      console.log(`${prefix} ${message}`, ...details);
    } else {
      console.log(`${prefix} ${message}`);
    }
  },

  /**
   * Major workflow step notification.
   */
  step(stepName: string, message: string): void {
    const prefix = isDebugEnabled()
      ? `${getTimestamp()} ${colors.bold(colors.cyan(`[STEP: ${stepName}]`))}`
      : colors.bold(colors.cyan(`→ [${stepName}]`));
    console.log(`${prefix} ${message}`);
  },

  /**
   * Worker-specific step notification.
   */
  worker(workerId: number, message: string, ...details: any[]): void {
    const workerTag = colors.yellow(`[Worker #${workerId}]`);
    const prefix = isDebugEnabled()
      ? `${getTimestamp()} ${workerTag}`
      : workerTag;
    if (details.length > 0) {
      console.log(`${prefix} ${message}`, ...details);
    } else {
      console.log(`${prefix} ${message}`);
    }
  },

  /**
   * General informational log.
   */
  info(message: string, ...details: any[]): void {
    const prefix = isDebugEnabled() ? `${getTimestamp()} ${colors.blue('[INFO]')}` : '';
    if (prefix) {
      if (details.length > 0) {
        console.log(`${prefix} ${message}`, ...details);
      } else {
        console.log(`${prefix} ${message}`);
      }
    } else {
      if (details.length > 0) {
        console.log(message, ...details);
      } else {
        console.log(message);
      }
    }
  },

  /**
   * Warning notification.
   */
  warn(tag: string, message: string, ...details: any[]): void {
    const prefix = `${getTimestamp()} ${colors.yellow(`[WARN:${tag}]`)}`;
    if (details.length > 0) {
      console.warn(`${prefix} ${message}`, ...details);
    } else {
      console.warn(`${prefix} ${message}`);
    }
  },

  /**
   * Error notification with stack trace in debug mode.
   */
  error(tag: string, message: string, error?: any): void {
    const prefix = `${getTimestamp()} ${colors.bold(colors.red(`[ERROR:${tag}]`))}`;
    console.error(`${prefix} ${message}`);
    if (error) {
      if (isDebugEnabled() && error.stack) {
        console.error(colors.red(error.stack));
      } else if (error.message) {
        console.error(colors.red(`  Reason: ${error.message}`));
      } else {
        console.error(error);
      }
    }
  },

  /**
   * Success notification.
   */
  success(message: string): void {
    const prefix = isDebugEnabled()
      ? `${getTimestamp()} ${colors.bold(colors.green('[SUCCESS]'))}`
      : colors.bold(colors.green('✔'));
    console.log(`${prefix} ${message}`);
  },

  /**
   * Prints a structured banner or section divider.
   */
  banner(title: string): void {
    const bar = '─'.repeat(Math.max(50, title.length + 4));
    console.log(colors.cyan(`\n┌${bar}┐`));
    console.log(colors.cyan(`│  ${colors.bold(title)}  │`));
    console.log(colors.cyan(`└${bar}┘\n`));
  }
};

import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

/**
 * Convert argparse-style `-long-opt` tokens to `--long-opt` for `node:util.parseArgs`.
 * Leaves `--long`, single-char shorts (`-h`), and positionals unchanged.
 */
export function normalizeArgvForParseArgs(argv: string[]): string[] {
  return argv.map((arg) => {
    if (!arg.startsWith('-') || arg.startsWith('--') || arg === '-') {
      return arg;
    }

    const eqIndex = arg.indexOf('=');
    const name = eqIndex === -1 ? arg.slice(1) : arg.slice(1, eqIndex);
    if (name.length <= 1) {
      return arg;
    }

    return eqIndex === -1 ? `--${name}` : `--${name}${arg.slice(eqIndex)}`;
  });
}

/** Parse CLI args with `util.parseArgs`, accepting both `-flag` and `--flag` long options. */
export function parseCliArgs<const T extends ParseArgsOptionsConfig>(
  options: T,
  argv: string[] = Bun.argv.slice(2),
) {
  return parseArgs({
    args: normalizeArgvForParseArgs(argv),
    options,
    allowPositionals: true,
    strict: false,
  });
}

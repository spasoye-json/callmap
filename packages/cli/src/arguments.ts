export const USAGE = 'usage: archmap review [<repo>] [--out <file>] [--no-open]';

export class CliError extends Error {
  override readonly name = 'CliError';
}

export interface ReviewInvocation {
  readonly repo: string;
  readonly out: string | undefined;
  readonly open: boolean;
}

export const readArguments = (args: readonly string[], cwd: string): ReviewInvocation => {
  const [command, ...rest] = args;
  if (command !== 'review') throw new CliError(USAGE);

  let repo: string | undefined;
  let out: string | undefined;
  let open = true;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    if (argument === '--no-open') {
      open = false;
    } else if (argument === '--out') {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`${argument} needs a value after it`);
      }
      out = value;
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new CliError(`${argument} is not a flag archmap review knows`);
    } else if (repo === undefined) {
      repo = argument;
    } else {
      throw new CliError(`'${argument}' follows no flag; only one repo is reviewed at a time`);
    }
  }

  return { repo: repo ?? cwd, out, open };
};

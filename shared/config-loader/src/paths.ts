import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { Environment, type EnvironmentName } from './services';

function ensureDirectory(path: string): string {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
  return path;
}

export function getProjectRoot(startDir = process.cwd()): string {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    current = dirname(current);
  }
  throw new Error('Project root with .git folder not found.');
}

export function getOutputDirectory(): string {
  const envPath = process.env.OPENL2_OUTPUT_PATH;
  if (envPath) {
    return envPath;
  }

  try {
    const projectRoot = getProjectRoot();
    return ensureDirectory(join(projectRoot, '.output'));
  } catch {
    const systemOutputPath = join(homedir(), '.openl2', 'output');
    return ensureDirectory(systemOutputPath);
  }
}

export function getEnvSpecificOutputDirectory(
  environment: EnvironmentName = Environment.DEFAULT,
): string {
  return ensureDirectory(join(getOutputDirectory(), environment));
}

export function getConfigDirectory(): string {
  const envPath = process.env.OPENL2_CONFIG_PATH;
  if (envPath) {
    return envPath;
  }

  try {
    const projectRoot = getProjectRoot();
    return join(projectRoot, '.config');
  } catch {
    return join(homedir(), '.openl2', 'config');
  }
}

export function getEnvSpecificConfigDirectory(
  environment: EnvironmentName = Environment.DEFAULT,
): string {
  return join(getConfigDirectory(), environment);
}

export function getConfigFilePath(
  service: string,
  environment: EnvironmentName = Environment.DEFAULT,
): string {
  const serviceFileName = service === 'bitcoin.conf'
    ? 'bitcoin.conf'
    : `${service}-config.json`;
  return join(getConfigDirectory(), environment, serviceFileName);
}

export function getDockerEnvFilePath(
  service: string,
  environment: EnvironmentName = Environment.DEFAULT,
): string {
  return join(getConfigDirectory(), environment, `${service}.env`);
}

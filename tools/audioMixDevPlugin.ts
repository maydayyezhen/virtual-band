import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

const CONFIG_RELATIVE_PATH = 'config/audio-mix.json';
const CONFIG_PATH = path.resolve(process.cwd(), CONFIG_RELATIVE_PATH);
const API_PREFIX = '/__dev/audio-mix';
const MIN_DB = -48;
const MAX_DB = 24;

const INSTRUMENT_TARGETS = [
  'drums',
  'keyboard.lower',
  'keyboard.upper',
  'violin.arco',
  'violin.pizzicato',
  'acoustic',
  'electric',
] as const;

const ACOUSTIC_PROGRAMS = [24, 25] as const;
const ELECTRIC_PROGRAMS = [26, 27, 28, 29, 30, 31] as const;

interface AudioMixConfigJson {
  schemaVersion: 1;
  source: string;
  instrumentTrimDb: Record<string, number>;
  programTrimDb: {
    acoustic: Record<string, number>;
    electric: Record<string, number>;
  };
}

interface SaveRequest {
  config?: unknown;
  git?: boolean;
  expectedBranch?: string;
}

export function audioMixDevPlugin(): Plugin {
  return {
    name: 'virtual-band-audio-mix-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = requestPath(req);
        if (!pathname.startsWith(API_PREFIX)) {
          next();
          return;
        }

        try {
          if (req.method === 'GET' && pathname === `${API_PREFIX}/status`) {
            const config = await readConfig();
            const branch = await currentBranch();
            const fileStatus = (await runGit(['status', '--short', '--', CONFIG_RELATIVE_PATH])).stdout.trim();
            respondJson(res, 200, {
              config,
              git: {
                branch,
                fileStatus,
              },
            });
            return;
          }

          if (req.method === 'POST' && pathname === `${API_PREFIX}/save`) {
            const request = await readBodyJson(req) as SaveRequest;
            const config = normalizeConfig(request.config);
            await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

            let gitResult: Record<string, unknown> | null = null;
            if (request.git) {
              gitResult = await commitAndPush(request.expectedBranch);
            }

            respondJson(res, 200, {
              ok: true,
              path: CONFIG_RELATIVE_PATH,
              git: gitResult,
            });
            scheduleReload(server);
            return;
          }

          respondJson(res, 404, { error: 'Unknown audio mix dev endpoint' });
        } catch (error) {
          respondJson(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}

async function readConfig(): Promise<AudioMixConfigJson> {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  return normalizeConfig(JSON.parse(raw));
}

function normalizeConfig(value: unknown): AudioMixConfigJson {
  if (!value || typeof value !== 'object') throw new Error('Audio mix config must be an object');
  const root = value as Record<string, unknown>;
  if (root.schemaVersion !== 1) throw new Error('Audio mix config schemaVersion must be 1');
  if (typeof root.source !== 'string' || root.source.trim().length === 0) {
    throw new Error('Audio mix config source must be a non-empty string');
  }

  const instruments = requireObject(root.instrumentTrimDb, 'instrumentTrimDb');
  const programs = requireObject(root.programTrimDb, 'programTrimDb');
  const acoustic = requireObject(programs.acoustic, 'programTrimDb.acoustic');
  const electric = requireObject(programs.electric, 'programTrimDb.electric');

  return {
    schemaVersion: 1,
    source: root.source,
    instrumentTrimDb: Object.fromEntries(
      INSTRUMENT_TARGETS.map((target) => [target, finiteDb(instruments[target], `instrumentTrimDb.${target}`)]),
    ),
    programTrimDb: {
      acoustic: Object.fromEntries(
        ACOUSTIC_PROGRAMS.map((program) => {
          const key = String(program);
          return [key, finiteDb(acoustic[key], `programTrimDb.acoustic.${key}`)];
        }),
      ),
      electric: Object.fromEntries(
        ELECTRIC_PROGRAMS.map((program) => {
          const key = String(program);
          return [key, finiteDb(electric[key], `programTrimDb.electric.${key}`)];
        }),
      ),
    },
  };
}

async function commitAndPush(expectedBranch?: string): Promise<Record<string, unknown>> {
  const branch = await currentBranch();
  if (!branch) throw new Error('Cannot commit audio mix config from a detached HEAD');
  if (expectedBranch && branch !== expectedBranch) {
    throw new Error(`Git branch changed from ${expectedBranch} to ${branch}; reload before pushing`);
  }

  await runGit(['add', '--', CONFIG_RELATIVE_PATH]);
  const staged = (await runGit(['diff', '--cached', '--name-only', '--', CONFIG_RELATIVE_PATH])).stdout.trim();
  if (!staged) {
    return {
      branch,
      committed: false,
      pushed: false,
      message: 'No audio mix config changes to commit',
    };
  }

  await runGit(['commit', '-m', 'tune audio mix profile', '--', CONFIG_RELATIVE_PATH]);
  const sha = (await runGit(['rev-parse', 'HEAD'])).stdout.trim();
  await runGit(['push', 'origin', `HEAD:refs/heads/${branch}`]);
  return {
    branch,
    committed: true,
    pushed: true,
    sha,
  };
}

async function currentBranch(): Promise<string> {
  return (await runGit(['branch', '--show-current'])).stdout.trim();
}

function runGit(args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('git', [...args], { cwd: process.cwd(), encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(' ')} failed: ${(stderr || stdout || error.message).trim()}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finiteDb(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (value < MIN_DB || value > MAX_DB) {
    throw new Error(`${label} must stay between ${MIN_DB} and ${MAX_DB} dB`);
  }
  return Math.round(value * 100) / 100;
}

function requestPath(req: IncomingMessage): string {
  return new URL(req.url ?? '/', 'http://localhost').pathname;
}

async function readBodyJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 64 * 1024) throw new Error('Audio mix request body is too large');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function scheduleReload(server: ViteDevServer): void {
  setTimeout(() => {
    server.ws.send({ type: 'full-reload' });
  }, 120);
}

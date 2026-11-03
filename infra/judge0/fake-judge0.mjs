// LOCAL DEVELOPMENT ONLY. This fake has NO SANDBOX: it runs submitted code directly with the
// machine's python3, with full access to the files and network of the user running it.
// Never deploy it, never expose it to a network, and only run your own code through it.
//
// It imitates the parts of the Judge0 CE API that apps/api uses, so the practice flow can be
// developed without a Linux VM. Real Judge0 must still be verified before any public release.
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const HOST = '127.0.0.1'; // Deliberately not configurable; see the warning above.
const PORT = Number(process.env.FAKE_JUDGE0_PORT ?? 2358);
const MAX_OUTPUT_BYTES = 1024 * 1024;

const STATUS = {
  IN_QUEUE: { id: 1, description: 'In Queue' },
  ACCEPTED: { id: 3, description: 'Accepted' },
  WRONG_ANSWER: { id: 4, description: 'Wrong Answer' },
  TIME_LIMIT: { id: 5, description: 'Time Limit Exceeded' },
  RUNTIME_ERROR: { id: 11, description: 'Runtime Error (NZEC)' },
};

const submissions = new Map();

const fromBase64 = (value) => Buffer.from(value ?? '', 'base64').toString('utf8');
const toBase64 = (value) => (value ? Buffer.from(value, 'utf8').toString('base64') : null);
const normalize = (text) =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();

async function execute(submission, spec) {
  const dir = await mkdtemp(join(tmpdir(), 'fake-judge0-'));
  try {
    const scriptPath = join(dir, 'script.py');
    await writeFile(scriptPath, fromBase64(spec.source_code));
    const startedAt = Date.now();
    const result = await new Promise((resolve) => {
      const child = spawn('python3', [scriptPath], {
        cwd: dir,
        timeout: Number(spec.wall_time_limit ?? 5) * 1000,
        killSignal: 'SIGKILL',
        env: { PATH: process.env.PATH, PYTHONIOENCODING: 'utf-8' },
      });
      const stdout = [];
      const stderr = [];
      let size = 0;
      const collect = (target) => (chunk) => {
        size += chunk.length;
        if (size > MAX_OUTPUT_BYTES) child.kill('SIGKILL');
        else target.push(chunk);
      };
      child.stdout.on('data', collect(stdout));
      child.stderr.on('data', collect(stderr));
      child.on('error', () => {}); // For example python3 is missing; 'close' still reports the failure.
      child.stdin.on('error', () => {}); // The program may exit without reading its input.
      child.stdin.end(fromBase64(spec.stdin));
      child.on('close', (code, signal) => {
        resolve({ stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), code, signal });
      });
    });

    let status = STATUS.ACCEPTED;
    if (result.signal) status = STATUS.TIME_LIMIT;
    else if (result.code !== 0) status = STATUS.RUNTIME_ERROR;
    else if (normalize(result.stdout) !== normalize(fromBase64(spec.expected_output))) status = STATUS.WRONG_ANSWER;

    Object.assign(submission, {
      status,
      stdout: toBase64(result.stdout),
      stderr: toBase64(result.stderr),
      time: ((Date.now() - startedAt) / 1000).toFixed(3),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

function send(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    const tokenMatch = url.pathname.match(/^\/submissions\/([\w-]+)$/);

    if (req.method === 'POST' && url.pathname === '/submissions/batch') {
      const body = await readJson(req);
      const created = body.submissions.map((spec) => {
        const token = randomUUID();
        const submission = { token, status: STATUS.IN_QUEUE, stdout: null, stderr: null, compile_output: null, time: null };
        submissions.set(token, submission);
        void execute(submission, spec);
        return { token };
      });
      return send(res, 201, created);
    }

    if (req.method === 'GET' && url.pathname === '/submissions/batch') {
      const tokens = (url.searchParams.get('tokens') ?? '').split(',');
      return send(res, 200, { submissions: tokens.map((token) => submissions.get(token) ?? null) });
    }

    if (req.method === 'DELETE' && tokenMatch) {
      const submission = submissions.get(tokenMatch[1]);
      if (!submission) return send(res, 404, { error: 'not found' });
      if (submission.status.id === STATUS.IN_QUEUE.id) return send(res, 400, { error: 'still running' });
      submissions.delete(tokenMatch[1]);
      return send(res, 200, { token: tokenMatch[1] });
    }

    return send(res, 404, { error: 'not found' });
  } catch {
    return send(res, 500, { error: 'fake judge0 failed' });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Fake Judge0 (NO SANDBOX, local only) on http://${HOST}:${PORT}\n`);
});

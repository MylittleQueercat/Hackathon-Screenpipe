// Eval harness only, copied into each workflow pipe's .pi/extensions in a run's data
// dir. Pi stays on the host (model calls, the workflow_workspace tool); the agent's
// bash, read, write and edit run in the run's container, with Pi's own tool
// definitions so names, schemas and output handling match production.
//
// Inside the container 127.0.0.1:3030 is the eval engine (sandbox/portal.py), so the
// prompts' and the curl shim's port-3030 assumptions hold, and the real screenpipe on
// the host's 3030 is unreachable.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import {
	type BashOperations,
	createBashToolDefinition,
	createEditToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type EditOperations,
	type ExtensionAPI,
	type ReadOperations,
	type WriteOperations,
} from "@earendil-works/pi-coding-agent";

const PORT = "3030";

// Fail closed: without a container, every tool errors instead of touching the host.
function container(): string {
	const name = process.env.SANDBOX_CONTAINER;
	if (!name) throw new Error("SANDBOX_CONTAINER is not set; refusing to run tools on the host");
	return name;
}

// What the agent's shell sees of Pi's environment: screenpipe's own variables, with
// the API address rewritten to the container's relay. Never the cloud JWT.
function sandboxEnv(): string[] {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v !== undefined && k.startsWith("SCREENPIPE_") && k !== "SCREENPIPE_API_KEY") env[k] = v;
	}
	env.SCREENPIPE_LOCAL_API_URL = `http://localhost:${PORT}`;
	env.SCREENPIPE_PORT = PORT;
	if (process.env.BASH_ENV) env.BASH_ENV = process.env.BASH_ENV;
	return Object.entries(env).flatMap(([k, v]) => ["--env", `${k}=${v}`]);
}

interface Exec {
	code: number | null;
	stdout: Buffer;
	stderr: Buffer;
}

function docker(args: string[], opts: { input?: Buffer | string; signal?: AbortSignal; onData?: (b: Buffer) => void } = {}): Promise<Exec> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.env.DOCKER ?? "docker", args, { stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		child.stdout.on("data", (b: Buffer) => (opts.onData ? opts.onData(b) : out.push(b)));
		child.stderr.on("data", (b: Buffer) => (opts.onData ? opts.onData(b) : err.push(b)));
		const onAbort = () => child.kill();
		opts.signal?.addEventListener("abort", onAbort, { once: true });
		child.on("error", reject);
		child.on("close", (code) => {
			opts.signal?.removeEventListener("abort", onAbort);
			resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
		});
		if (opts.input !== undefined) child.stdin!.end(opts.input);
	});
}

const inBox = (cmd: string[], extra: string[] = []) => ["exec", ...extra, container(), ...cmd];

function fileError(path: string, r: Exec): Error {
	const msg = r.stderr.toString("utf8").trim() || `exit ${r.code}`;
	const e = new Error(`${path}: ${msg}`) as NodeJS.ErrnoException;
	if (/No such file/.test(msg)) e.code = "ENOENT";
	else if (/Permission denied|Read-only/.test(msg)) e.code = "EACCES";
	return e;
}

async function readFile(path: string): Promise<Buffer> {
	const r = await docker(inBox(["/bin/cat", "--", path]));
	if (r.code !== 0) throw fileError(path, r);
	return r.stdout;
}

async function access(path: string): Promise<void> {
	const r = await docker(inBox(["/bin/bash", "-c", 'test -r "$1" || { echo "No such file or directory" >&2; exit 1; }', "_", path]));
	if (r.code !== 0) throw fileError(path, r);
}

async function writeFile(path: string, content: string): Promise<void> {
	const r = await docker(inBox(["/bin/bash", "-c", 'cat > "$1"', "_", path], ["--interactive"]), { input: content });
	if (r.code !== 0) throw fileError(path, r);
}

async function mkdir(dir: string): Promise<void> {
	const r = await docker(inBox(["/bin/mkdir", "-p", "--", dir]));
	if (r.code !== 0) throw fileError(dir, r);
}

// Pi's bash tool handles its own timeout, truncation and output files; the kill
// runs inside the container too, since killing the docker client alone would
// leave the process running.
const bashOps: BashOperations = {
	exec: async (command, cwd, { onData, signal, timeout }) => {
		const t = String(timeout ?? 600);
		const r = await docker(
			inBox(["/bin/timeout", "-s", "KILL", t, "/bin/bash", "-c", command], ["--workdir", cwd, ...sandboxEnv()]),
			{ signal, onData },
		);
		return { exitCode: r.code };
	},
};
const readOps: ReadOperations = { readFile, access };
const writeOps: WriteOperations = { writeFile, mkdir };
const editOps: EditOperations = { readFile, writeFile, access };

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");

// One line per provider request and response (from eval-sketch): the settings sent
// and hashes of what the model saw, with the full instructions and tools when they
// change, so a run can be checked against its variant.
function requestLogger() {
	const path = process.env.WFEVAL_REQUEST_LOG;
	let seq = 0;
	let lastInstructions = "";
	let lastTools = "";
	const write = (entry: object) => path && appendFileSync(path, `${JSON.stringify(entry)}\n`);
	return {
		request(payload: unknown) {
			const { input: responsesInput, messages, system, instructions: responsesInstructions, tools, ...settings } =
				(payload ?? {}) as Record<string, unknown>;
			const chat = Array.isArray(messages) ? (messages as { role: string; content: unknown }[]) : null;
			// Chat payloads lead with the system prompt as a `system` or `developer` message.
			const lead = chat ? chat.findIndex((m) => m.role !== "system" && m.role !== "developer") : 0;
			const head = chat ? chat.slice(0, lead < 0 ? chat.length : lead) : [];
			const instructions = system ?? (head.length ? head.map((m) => m.content) : responsesInstructions);
			const input = chat ? chat.slice(head.length) : responsesInput;
			const instructionsHash = sha256(instructions);
			const toolsHash = sha256(tools);
			write({
				type: "request", seq: ++seq, at: new Date().toISOString(), task: process.env.SCREENPIPE_PIPE_NAME,
				settings, instructions_sha256: instructionsHash, tools_sha256: toolsHash,
				input_items: Array.isArray(input) ? input.length : null, input_sha256: sha256(input),
				...(instructionsHash !== lastInstructions ? { instructions } : {}),
				// The task prompt, in full once per agent run: with the instructions, what
				// the agent was given before any tool result.
				...(seq === 1 ? { input } : {}),
				...(toolsHash !== lastTools ? { tools } : {}),
			});
			lastInstructions = instructionsHash;
			lastTools = toolsHash;
		},
		// Usage per assistant message and one line per tool call. The engine keeps only
		// the head of a long run's stdout in its pipe log, so usage read from there
		// undercounts; this is the complete record.
		usage(message: { role?: string; model?: string; usage?: unknown; stopReason?: string }) {
			if (message?.role !== "assistant") return;
			write({ type: "usage", seq, at: new Date().toISOString(), task: process.env.SCREENPIPE_PIPE_NAME,
				model: message.model, stop: message.stopReason, usage: message.usage });
		},
		tool(name: string) {
			write({ type: "tool", at: new Date().toISOString(), task: process.env.SCREENPIPE_PIPE_NAME, tool: name });
		},
		response(status: number, headers: Record<string, string>) {
			const kept = Object.fromEntries(Object.entries(headers ?? {}).filter(([k]) => !/cookie|authorization|token/i.test(k)));
			write({ type: "response", seq, at: new Date().toISOString(), status, headers: kept });
		},
	};
}

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	container();
	pi.registerTool(createBashToolDefinition(cwd, { operations: bashOps }));
	pi.registerTool(createReadToolDefinition(cwd, { operations: readOps }));
	pi.registerTool(createWriteToolDefinition(cwd, { operations: writeOps }));
	pi.registerTool(createEditToolDefinition(cwd, { operations: editOps }));
	pi.on("user_bash", () => ({ operations: bashOps }));
	const log = requestLogger();
	pi.on("before_provider_request", (event) => {
		log.request(event.payload);
		return event.payload;
	});
	pi.on("after_provider_response", (event) => {
		log.response(event.status, event.headers);
	});
	pi.on("message_end", (event) => {
		log.usage(event.message as { role?: string });
	});
	pi.on("tool_execution_start", (event) => {
		log.tool(event.toolName);
	});
}

#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:7777";

export function buildRequest(argv, env = process.env) {
	const args = [...argv];
	let baseUrl = env.OPENGUI_BASE_URL || DEFAULT_BASE_URL;
	let deviceId;
	let json = false;
	const commandArgs = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--" && commandArgs.length === 0) {
			continue;
		}
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (arg === "--base-url") {
			baseUrl = requireValue(args, (index += 1), "--base-url");
			continue;
		}
		if (arg === "--device") {
			deviceId = requireValue(args, (index += 1), "--device");
			continue;
		}
		commandArgs.push(arg);
	}

	const command = commandArgs[0];
	const rest = commandArgs.slice(1);
	if (!command || command === "help" || command === "--help" || command === "-h") {
		return {
			baseUrl,
			json,
			method: "HELP",
			path: "",
			body: undefined,
		};
	}

	switch (command) {
		case "devices":
			return {
				baseUrl,
				json,
				method: "GET",
				path: "/api/remote-control/devices",
				body: undefined,
			};
		case "do": {
			const description = rest.join(" ").trim();
			if (!description) throw new Error('Usage: opengui do "<description>"');
			return {
				baseUrl,
				json,
				method: "POST",
				path: "/api/remote-control/tasks/do",
				body: compactObject({ description, deviceId }),
			};
		}
		case "run": {
			const taskId = parsePositiveInt(rest[0], "taskId");
			return {
				baseUrl,
				json,
				method: "POST",
				path: "/api/remote-control/tasks/run",
				body: compactObject({ taskId, deviceId }),
			};
		}
		case "status": {
			const executionId = parsePositiveInt(rest[0], "executionId");
			return {
				baseUrl,
				json,
				method: "GET",
				path: `/api/remote-control/executions/${executionId}`,
				body: undefined,
			};
		}
		case "cancel":
		case "pause": {
			const executionId = parsePositiveInt(rest[0], "executionId");
			return {
				baseUrl,
				json,
				method: "PUT",
				path: `/api/remote-control/executions/${executionId}/${command}`,
				body: undefined,
			};
		}
		case "resume": {
			const executionId = parsePositiveInt(rest[0], "executionId");
			const feedback = rest.slice(1).join(" ").trim() || undefined;
			return {
				baseUrl,
				json,
				method: "PUT",
				path: `/api/remote-control/executions/${executionId}/resume`,
				body: compactObject({ feedback }),
			};
		}
		default:
			throw new Error(`Unknown command: ${command}`);
	}
}

export async function runCli({
	argv = process.argv.slice(2),
	env = process.env,
	fetchFn = globalThis.fetch,
	stdout = process.stdout,
	stderr = process.stderr,
} = {}) {
	try {
		const request = buildRequest(argv, env);
		if (request.method === "HELP") {
			stdout.write(helpText());
			return 0;
		}

		if (typeof fetchFn !== "function") {
			throw new Error("This CLI requires Node.js 22+ with global fetch");
		}

		const response = await fetchFn(`${trimSlash(request.baseUrl)}${request.path}`, {
			method: request.method,
			headers: request.body ? { "content-type": "application/json" } : undefined,
			body: request.body ? JSON.stringify(request.body) : undefined,
		});
		const data = await readJson(response);

		if (!response.ok) {
			stderr.write(`${extractErrorMessage(data, response.status)}\n`);
			return 1;
		}

		stdout.write(
			request.json
				? `${JSON.stringify(data, null, 2)}\n`
				: `${formatHuman(request, data)}\n`,
		);
		return 0;
	} catch (error) {
		stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

function requireValue(args, index, flag) {
	const value = args[index];
	if (!value) throw new Error(`${flag} requires a value`);
	return value;
}

function parsePositiveInt(value, name) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return parsed;
}

function compactObject(value) {
	return Object.fromEntries(
		Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
	);
}

function trimSlash(url) {
	return url.replace(/\/+$/, "");
}

async function readJson(response) {
	try {
		return await response.json();
	} catch {
		return {};
	}
}

function extractErrorMessage(data, status) {
	if (typeof data?.message === "string") return data.message;
	if (Array.isArray(data?.message)) return data.message.join("; ");
	if (typeof data?.error === "string") return data.error;
	return `Request failed with status ${status}`;
}

function formatHuman(request, data) {
	if (request.path.endsWith("/devices")) {
		const devices = data.devices || [];
		if (devices.length === 0) return "No online devices";
		return devices
			.map((device) => `${device.deviceName || device.deviceId} (${device.deviceId})`)
			.join("\n");
	}

	if (data.executionId) {
		return [
			`Execution #${data.executionId}`,
			data.taskName ? `Task: ${data.taskName}` : undefined,
			data.device
				? `Device: ${data.device.deviceName || data.device.deviceId}`
				: undefined,
			data.message,
		]
			.filter(Boolean)
			.join("\n");
	}

	return JSON.stringify(data, null, 2);
}

function helpText() {
	return [
		"Usage:",
		"  pnpm opengui -- devices [--json] [--base-url <url>]",
		'  pnpm opengui -- do "<description>" [--device <deviceId>]',
		"  pnpm opengui -- run <taskId> [--device <deviceId>]",
		"  pnpm opengui -- status <executionId>",
		"  pnpm opengui -- cancel <executionId>",
		"  pnpm opengui -- pause <executionId>",
		'  pnpm opengui -- resume <executionId> ["feedback"]',
		"",
	].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
	process.exitCode = await runCli();
}

import assert from "node:assert/strict";
import test from "node:test";
import { buildRequest, runCli } from "./opengui-control.mjs";

test("builds a devices request with the default base URL", () => {
	assert.deepEqual(buildRequest(["devices"], {}), {
		baseUrl: "http://localhost:7777",
		json: false,
		method: "GET",
		path: "/api/remote-control/devices",
		body: undefined,
	});
});

test("ignores a leading pnpm argument separator", () => {
	assert.equal(
		buildRequest(["--", "devices"], {}).path,
		"/api/remote-control/devices",
	);
});

test("builds a do request with flags", () => {
	assert.deepEqual(
		buildRequest(
			[
				"--base-url",
				"http://127.0.0.1:8888",
				"--device",
				"phone-a",
				"--json",
				"do",
				"open X and search OpenGUI",
			],
			{},
		),
		{
			baseUrl: "http://127.0.0.1:8888",
			json: true,
			method: "POST",
			path: "/api/remote-control/tasks/do",
			body: {
				description: "open X and search OpenGUI",
				deviceId: "phone-a",
			},
		},
	);
});

test("builds execution control requests", () => {
	assert.deepEqual(buildRequest(["run", "42"], {}), {
		baseUrl: "http://localhost:7777",
		json: false,
		method: "POST",
		path: "/api/remote-control/tasks/run",
		body: { taskId: 42 },
	});
	assert.deepEqual(buildRequest(["resume", "9", "continue now"], {}), {
		baseUrl: "http://localhost:7777",
		json: false,
		method: "PUT",
		path: "/api/remote-control/executions/9/resume",
		body: { feedback: "continue now" },
	});
});

test("runCli writes raw JSON in json mode", async () => {
	const stdout = [];
	const exitCode = await runCli({
		argv: ["--json", "status", "7"],
		env: {},
		fetchFn: async (url, init) => ({
			ok: true,
			status: 200,
			json: async () => ({ url, method: init.method, id: 7 }),
		}),
		stdout: { write: (text) => stdout.push(text) },
		stderr: { write: () => {} },
	});

	assert.equal(exitCode, 0);
	assert.deepEqual(JSON.parse(stdout.join("")), {
		url: "http://localhost:7777/api/remote-control/executions/7",
		method: "GET",
		id: 7,
	});
});

test("runCli returns non-zero and prints backend errors", async () => {
	const stderr = [];
	const exitCode = await runCli({
		argv: ["devices"],
		env: {},
		fetchFn: async () => ({
			ok: false,
			status: 400,
			json: async () => ({ message: "No online device" }),
		}),
		stdout: { write: () => {} },
		stderr: { write: (text) => stderr.push(text) },
	});

	assert.equal(exitCode, 1);
	assert.match(stderr.join(""), /No online device/);
});

/**
 * k6 load script for layer2ledger POST /transfer/push_transaction.
 *
 * Expects Bun prep to write:
 *   /stress-data/push-requests.json  — JSON array of request bodies
 *   /stress-data/push-meta.json      — session metadata (optional for k6)
 *
 * Env:
 *   LAYER2LEDGER_API_URL  — base URL (default http://layer2ledgerapihandler-nginx:8000)
 *   STRESS_VUS            — concurrent VUs (default 1024)
 *   STRESS_DATASET        — path to request JSON array
 */
import { check } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import http from "k6/http";
import { Counter, Rate } from "k6/metrics";

const pushAccepted = new Counter("push_accepted");
const pushSuccess = new Rate("push_success");

const datasetPath = __ENV.STRESS_DATASET || "/stress-data/push-requests.json";
const baseUrl = (
	__ENV.LAYER2LEDGER_API_URL || "http://layer2ledgerapihandler-nginx:8000"
).replace(/\/$/, "");
const vus = Number(__ENV.STRESS_VUS || "1024");

const bodies = new SharedArray("push_requests", () => {
	const raw = open(datasetPath);
	const parsed = JSON.parse(raw);
	if (!Array.isArray(parsed)) {
		throw new Error(`Expected JSON array in ${datasetPath}`);
	}
	return parsed;
});

export const options = {
	scenarios: {
		push_transaction: {
			executor: "shared-iterations",
			vus: Math.max(1, Math.min(vus, bodies.length)),
			iterations: bodies.length,
			maxDuration: __ENV.STRESS_K6_MAX_DURATION || "15m",
			gracefulStop: "30s",
		},
	},
	thresholds: {
		http_req_failed: ["rate<0.05"],
		push_success: ["rate>0.95"],
	},
};

export default function () {
	const index = exec.scenario.iterationInTest;
	const body = bodies[index];
	if (!body) {
		return;
	}
	const res = http.post(
		`${baseUrl}/transfer/push_transaction`,
		JSON.stringify(body),
		{
			headers: {
				"Content-Type": "application/json",
				"X-Request-Id": body.transaction_id || `${__VU}-${__ITER}`,
			},
			tags: { name: "push_transaction" },
		},
	);

	let errorCode = -1;
	try {
		errorCode = JSON.parse(String(res.body)).error_code;
	} catch {
		errorCode = -1;
	}
	const ok = res.status === 200 && errorCode === 0;
	pushSuccess.add(ok);
	if (ok) {
		pushAccepted.add(1);
	}
	check(res, {
		"status is 200": (r) => r.status === 200,
		"error_code success": () => ok,
	});
}

export function handleSummary(data) {
	return {
		"/stress-data/k6-summary.json": JSON.stringify(data, null, 2),
		stdout: textSummary(data),
	};
}

function textSummary(data) {
	const metrics = data.metrics || {};
	const lines = ["k6 push_transaction summary"];
	const duration = metrics.http_req_duration?.values;
	const accepted = metrics.push_accepted?.values?.count ?? 0;
	const success = metrics.push_success?.values?.rate;
	if (duration) {
		lines.push(
			`  http_req_duration avg=${duration.avg?.toFixed?.(2)}ms ` +
				`p95=${duration["p(95)"]?.toFixed?.(2)}ms max=${duration.max?.toFixed?.(2)}ms`,
		);
	}
	lines.push(`  push_accepted=${accepted}`);
	if (typeof success === "number") {
		lines.push(`  push_success_rate=${(success * 100).toFixed(2)}%`);
	}
	lines.push("");
	return lines.join("\n");
}

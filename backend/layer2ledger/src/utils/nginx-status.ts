/**
 * Parse nginx stub_status text from GET /nginx-status.
 *
 * Example body:
 *   Active connections: 291
 *   server accepts handled requests
 *    12345 12345 67890
 *   Reading: 0 Writing: 12 Waiting: 279
 */
export interface NginxStubStatus {
	active: number;
	accepts: number;
	handled: number;
	requests: number;
	reading: number;
	writing: number;
	waiting: number;
}

export function parseNginxStubStatus(body: string): NginxStubStatus {
	const activeMatch = body.match(/Active connections:\s*(\d+)/i);
	const countersMatch = body.match(
		/server accepts handled requests\s+(\d+)\s+(\d+)\s+(\d+)/i,
	);
	const rwwMatch = body.match(
		/Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)/i,
	);
	if (!activeMatch || !countersMatch || !rwwMatch) {
		throw new Error(`Unrecognized nginx stub_status body: ${body}`);
	}
	return {
		active: Number(activeMatch[1]),
		accepts: Number(countersMatch[1]),
		handled: Number(countersMatch[2]),
		requests: Number(countersMatch[3]),
		reading: Number(rwwMatch[1]),
		writing: Number(rwwMatch[2]),
		waiting: Number(rwwMatch[3]),
	};
}

export async function fetchNginxStubStatus(
	nginxBaseUrl: string,
): Promise<NginxStubStatus> {
	const url = `${nginxBaseUrl.replace(/\/$/, "")}/nginx-status`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`nginx-status HTTP ${response.status} from ${url}`);
	}
	return parseNginxStubStatus(await response.text());
}

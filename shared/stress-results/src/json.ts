/**
 * Cast a JSON.parse result to a writer-defined structure.
 * Callers must immediately validate via that structure's `parse` method.
 */
export function parseJsonAs<T>(text: string): T {
	return JSON.parse(text) as T;
}

export function isStructuredObject(value: object | null): value is object {
	return value !== null && typeof value === "object";
}

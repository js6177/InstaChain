/**
 * Cast a JSON.parse result to a writer-defined structure.
 * Callers must immediately validate via that structure's `parse` method.
 */
export function parseJsonAs<T>(text: string): T {
	return JSON.parse(text) as T;
}

export function isStructuredObject(
	value: object | null | undefined,
): value is object {
	return value !== null && value !== undefined && typeof value === "object";
}

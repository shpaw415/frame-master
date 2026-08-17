export function formatDebugSource(text: string, language?: string): string {
	if (language !== "json") return text;
	try {
		return JSON.stringify(JSON.parse(text), null, 2);
	} catch {
		return text;
	}
}

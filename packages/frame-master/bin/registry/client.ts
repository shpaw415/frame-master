import { BASE_URL } from "../share";

export async function registryFetch(
	path: string,
	init: RequestInit & { token?: string } = {},
): Promise<{ data: any; response: Response }> {
	const headers = new Headers(init.headers);
	if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	const response = await fetch(new URL(path, BASE_URL), {
		...init,
		headers,
	});
	const text = await response.text();
	const data = text ? JSON.parse(text) : null;
	return { data, response };
}

import { IdResolver } from '@atproto/identity';
import { getConfig } from './config';

let resolver: IdResolver | undefined;

export function getIdResolver(): IdResolver {
	resolver ??= new IdResolver({ plcUrl: getConfig().plcUrl });
	return resolver;
}

export async function resolveHandle(handle: string): Promise<string | null> {
	const { devIntrospectUrl } = getConfig();
	const resolved = await getIdResolver().handle.resolve(handle);
	if (resolved) return resolved;
	if (!devIntrospectUrl) return null;

	// The multi-PDS dev network's handles have no real DNS/well-known records;
	// ask each PDS that serves the handle's domain directly.
	for (const pdsUrl of await getDevPdsUrls(devIntrospectUrl, handle)) {
		const did = await resolveHandleAt(pdsUrl, handle);
		if (did) return did;
	}
	return null;
}

async function resolveHandleAt(service: string, handle: string): Promise<string | null> {
	const url = new URL(`${service}/xrpc/com.atproto.identity.resolveHandle`);
	url.searchParams.set('handle', handle);
	const response = await fetch(url, { cache: 'no-store' });
	if (response.ok) {
		const body = (await response.json()) as { did: string };
		return body.did;
	}
	if (response.status === 400) return null;
	throw new Error(`Handle resolution failed (${response.status})`);
}

async function getDevPdsUrls(introspectUrl: string, handle: string): Promise<string[]> {
	const response = await fetch(introspectUrl);
	if (!response.ok) throw new Error(`Introspection failed (${response.status})`);
	const body = (await response.json()) as {
		pdses?: Array<{ url: string; handleDomains?: string[] }>;
	};
	return (body.pdses ?? [])
		.filter((pds) => pds.handleDomains?.some((domain) => handle.endsWith(domain)))
		.map((pds) => pds.url);
}

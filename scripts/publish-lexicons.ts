/**
 * Publish the lexicons in ./lexicons/my to the lexicon authority's repo as
 * com.atproto.lexicon.schema records, so that NSID-based OAuth scopes
 * (include:me.byjp.pebble-index.auth) resolve.
 *
 * Against a real PDS, set LEXICON_AUTHORITY_HANDLE, LEXICON_AUTHORITY_PASSWORD
 * (an app password) and LEXICON_AUTHORITY_PDS; the account's DID must be named
 * by a _lexicon.pebble-index.byjp.me TXT record ("did=<did>").
 *
 * Against the atproto multi-PDS dev network, set DEV_INTROSPECT_URL instead and
 * the network's built-in lexicon authority is used.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const LEXICON_COLLECTION = "com.atproto.lexicon.schema";

type LexiconDoc = {
	lexicon: number;
	id: string;
	defs: Record<string, unknown>;
};

type Authority = { handle: string; password: string; pds: string };

async function loadLexicons(dir: string): Promise<LexiconDoc[]> {
	const docs: LexiconDoc[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) docs.push(...(await loadLexicons(path)));
		if (entry.isFile() && entry.name.endsWith(".json")) {
			docs.push(JSON.parse(await readFile(path, "utf8")) as LexiconDoc);
		}
	}
	return docs;
}

async function xrpc(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(`${url} failed (${response.status}): ${await response.text()}`);
	}
	return (await response.json()) as Record<string, unknown>;
}

function digest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function getAuthority(): Promise<Authority> {
	const handle = process.env.LEXICON_AUTHORITY_HANDLE;
	const password = process.env.LEXICON_AUTHORITY_PASSWORD;
	const pds = process.env.LEXICON_AUTHORITY_PDS;
	if (handle && password && pds) return { handle, password, pds };
	if (handle || password || pds) {
		throw new Error(
			"Set LEXICON_AUTHORITY_HANDLE, LEXICON_AUTHORITY_PASSWORD, and LEXICON_AUTHORITY_PDS together.",
		);
	}

	const devIntrospectUrl = process.env.DEV_INTROSPECT_URL;
	if (!devIntrospectUrl) {
		throw new Error(
			"Set LEXICON_AUTHORITY_* (real PDS) or DEV_INTROSPECT_URL (dev network) to publish lexicons.",
		);
	}
	let introspectionResponse: Response;
	try {
		introspectionResponse = await fetch(devIntrospectUrl);
	} catch {
		throw new Error(
			`Cannot reach ${devIntrospectUrl}. Start the atproto multi-PDS test network first.`,
		);
	}
	if (!introspectionResponse.ok) {
		throw new Error(`Dev introspection failed: ${introspectionResponse.status}`);
	}
	const introspection = (await introspectionResponse.json()) as {
		lexiconAuthority?: Authority;
	};
	if (!introspection.lexiconAuthority) {
		throw new Error("The dev network has no lexicon authority");
	}
	return introspection.lexiconAuthority;
}

async function publishLexicons(): Promise<void> {
	const authority = await getAuthority();
	const login = await xrpc(`${authority.pds}/xrpc/com.atproto.server.createSession`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ identifier: authority.handle, password: authority.password }),
	});
	const accessJwt = String(login.accessJwt);
	const did = String(login.did);
	const docs = await loadLexicons(join(process.cwd(), "lexicons", "my"));

	for (const doc of docs) {
		const existingUrl = new URL(`${authority.pds}/xrpc/com.atproto.repo.getRecord`);
		existingUrl.searchParams.set("repo", did);
		existingUrl.searchParams.set("collection", LEXICON_COLLECTION);
		existingUrl.searchParams.set("rkey", doc.id);
		const existingResponse = await fetch(existingUrl, {
			headers: { authorization: `Bearer ${accessJwt}` },
		});
		if (existingResponse.ok) {
			const existing = (await existingResponse.json()) as { value: unknown };
			if (digest(existing.value) === digest(doc)) {
				console.log(`lexicon unchanged: ${doc.id}`);
				continue;
			}
		}

		await xrpc(`${authority.pds}/xrpc/com.atproto.repo.putRecord`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${accessJwt}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				repo: did,
				collection: LEXICON_COLLECTION,
				rkey: doc.id,
				record: doc,
			}),
		});
		console.log(`published lexicon: ${doc.id}`);
	}
}

try {
	await publishLexicons();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}

export type RingWebhook = {
	test: boolean;
	trigger?: string;
	client: string;
	recordedAt: Date;
	transcription?: string;
	audio?: { bytes: Uint8Array; recordingId?: string };
};

export class WebhookParseError extends Error {}

const RKEY_SAFE = /^[A-Za-z0-9._:~-]{1,512}$/;

/**
 * Parse a Pebble Index ring webhook request.
 *
 * The Pebble app POSTs multipart/form-data with fields `audio` (audio/mp4
 * file, present in "Recording only"/"Both" modes), `transcription` (plain
 * text, "Transcription only"/"Both"), `test` ("true" for test events),
 * `recordedAt` (unix ms) and `client` ("ring"), plus `X-Index-Trigger` and
 * `X-Index-Test` headers.
 */
export async function parseRingWebhook(request: Request): Promise<RingWebhook> {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw new WebhookParseError('Expected a multipart/form-data body');
	}

	const test =
		request.headers.get('x-index-test') === 'true' || textField(form, 'test') === 'true';

	const recordedAtMs = Number(textField(form, 'recordedAt'));
	if (!Number.isFinite(recordedAtMs) || recordedAtMs <= 0) {
		throw new WebhookParseError('Missing or invalid recordedAt field');
	}

	const transcription = textField(form, 'transcription');
	let audio: RingWebhook['audio'];
	const audioEntry = form.get('audio');
	if (audioEntry instanceof File) {
		const bytes = new Uint8Array(await audioEntry.arrayBuffer());
		if (bytes.length === 0) throw new WebhookParseError('Empty audio part');
		const recordingId = audioEntry.name.replace(/\.m4a$/i, '');
		audio = {
			bytes,
			...(RKEY_SAFE.test(recordingId) ? { recordingId } : {})
		};
	} else if (typeof audioEntry === 'string') {
		throw new WebhookParseError('The audio field must be a file part');
	}

	if (!test && audio === undefined && transcription === undefined) {
		throw new WebhookParseError('Webhook carried neither audio nor transcription');
	}

	return {
		test,
		trigger: request.headers.get('x-index-trigger') ?? undefined,
		client: textField(form, 'client') ?? 'ring',
		recordedAt: new Date(recordedAtMs),
		...(transcription !== undefined ? { transcription } : {}),
		...(audio !== undefined ? { audio } : {})
	};
}

function textField(form: FormData, name: string): string | undefined {
	const value = form.get(name);
	return typeof value === 'string' ? value : undefined;
}

import { describe, expect, it } from 'vitest';
import { parseRingWebhook, WebhookParseError } from './webhook';

const RECORDED_AT_MS = 1756180000000;

function ringRequest(options: {
	audio?: { filename: string; bytes?: Uint8Array<ArrayBuffer> };
	transcription?: string;
	test?: boolean;
	recordedAt?: string;
	headers?: Record<string, string>;
}): Request {
	const form = new FormData();
	if (options.audio) {
		const bytes = options.audio.bytes ?? new Uint8Array([1, 2, 3, 4]);
		form.append(
			'audio',
			new File([bytes], options.audio.filename, { type: 'audio/mp4' }),
			options.audio.filename
		);
	}
	if (options.transcription !== undefined) form.append('transcription', options.transcription);
	if (options.test) form.append('test', 'true');
	form.append('recordedAt', options.recordedAt ?? String(RECORDED_AT_MS));
	form.append('client', 'ring');
	return new Request('https://example.com/hook/token', {
		method: 'POST',
		body: form,
		headers: options.headers
	});
}

describe('parseRingWebhook', () => {
	it('parses a "Both" payload (audio + transcription in one request)', async () => {
		const parsed = await parseRingWebhook(
			ringRequest({
				audio: { filename: 'abc-123.m4a' },
				transcription: 'hello world',
				headers: { 'x-index-trigger': 'single-click-hold' }
			})
		);
		expect(parsed.test).toBe(false);
		expect(parsed.transcription).toBe('hello world');
		expect(parsed.audio?.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
		expect(parsed.audio?.recordingId).toBe('abc-123');
		expect(parsed.trigger).toBe('single-click-hold');
		expect(parsed.client).toBe('ring');
		expect(parsed.recordedAt.getTime()).toBe(RECORDED_AT_MS);
	});

	it('parses a transcription-only payload', async () => {
		const parsed = await parseRingWebhook(ringRequest({ transcription: 'just text' }));
		expect(parsed.audio).toBeUndefined();
		expect(parsed.transcription).toBe('just text');
	});

	it('parses an audio-only payload', async () => {
		const parsed = await parseRingWebhook(ringRequest({ audio: { filename: 'rec.m4a' } }));
		expect(parsed.transcription).toBeUndefined();
		expect(parsed.audio?.recordingId).toBe('rec');
	});

	it('flags test events from the X-Index-Test header', async () => {
		const parsed = await parseRingWebhook(
			ringRequest({
				transcription: 'This is a test event',
				headers: { 'x-index-test': 'true', 'x-index-trigger': 'test-event' }
			})
		);
		expect(parsed.test).toBe(true);
		expect(parsed.trigger).toBe('test-event');
	});

	it('flags test events from the test form field', async () => {
		const parsed = await parseRingWebhook(ringRequest({ transcription: 'test', test: true }));
		expect(parsed.test).toBe(true);
	});

	it('drops recording ids that are not valid record keys', async () => {
		const parsed = await parseRingWebhook(
			ringRequest({ audio: { filename: 'bad id!.m4a' } })
		);
		expect(parsed.audio?.recordingId).toBeUndefined();
	});

	it('rejects payloads with neither audio nor transcription', async () => {
		await expect(parseRingWebhook(ringRequest({}))).rejects.toThrow(WebhookParseError);
	});

	it('rejects a missing recordedAt', async () => {
		await expect(
			parseRingWebhook(ringRequest({ transcription: 'hi', recordedAt: 'nonsense' }))
		).rejects.toThrow(WebhookParseError);
	});

	it('rejects a non-multipart body', async () => {
		const request = new Request('https://example.com/hook/token', {
			method: 'POST',
			body: 'plain text',
			headers: { 'content-type': 'application/octet-stream' }
		});
		await expect(parseRingWebhook(request)).rejects.toThrow(WebhookParseError);
	});
});

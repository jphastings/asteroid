import { TID } from "@atproto/common-web";
import { Client } from "@atproto/lex-client";
import {
  getBlobCidString,
  getBlobMime,
  getBlobSize,
  isBlobRef,
  LexError,
  parseCid,
} from "@atproto/lex-data";
import { asStringFormat } from "@atproto/lex-schema";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { com } from "$lib/lexicons";
import { setSpaceUri } from "./accounts";
import { resolvePds } from "./identity";
import {
  NOTE_COLLECTION,
  RECORDING_COLLECTION,
  REMINDER_COLLECTION,
  SPACE_SKEY,
  SPACE_TYPE,
  spaceUri,
} from "./config";

export const AUDIO_MIME_TYPE = "audio/mp4";
export const MAX_AUDIO_BYTES = 104_857_600;

export type Visibility = "public" | "private";

export type RecordingInput = {
  transcription?: string;
  audio?: { bytes: Uint8Array; recordingId?: string };
  recordedAt: Date;
  trigger?: string;
  client: string;
};

export type EntryView = {
  kind: "recording" | "note" | "reminder";
  visibility: Visibility;
  collection: string;
  rkey: string;
  cid: string;
  text: string | null;
  audioCid: string | null;
  audioMimeType: string | null;
  capturedAt: string | null;
  trigger: string | null;
  dueAt: string | null;
};

function isSpaceNotFoundError(error: unknown): boolean {
  return error instanceof LexError && error.error === "SpaceNotFound";
}

function isRepoNotFoundError(error: unknown): boolean {
  return error instanceof LexError && error.error === "RepoNotFound";
}

function isRecordAlreadyExistsError(error: unknown): boolean {
  return error instanceof LexError && error.error === "RecordAlreadyExists";
}

/** A PDS without spaces support rejects the com.atproto.space/simplespace methods outright. */
export function isSpacesUnsupportedError(error: unknown): boolean {
  return (
    error instanceof LexError &&
    ["MethodNotImplemented", "NotImplemented", "UnsupportedMethod", "XRPCNotSupported"].includes(
      error.error,
    )
  );
}

function spaceRef(did: string) {
  return asStringFormat(spaceUri(did), "space-ref");
}

/**
 * Make sure the user's private Pebble Index space exists, creating it on first
 * login. An empty member list means nobody but the owner can access it.
 */
export async function ensureSpace(session: OAuthSession): Promise<string> {
  const client = new Client(session);
  try {
    const existing = await client.call(com.atproto.simplespace.getSpace, {
      space: spaceRef(session.did),
    });
    setSpaceUri(session.did, existing.uri);
    return existing.uri;
  } catch (error) {
    if (!isSpaceNotFoundError(error)) throw error;
  }

  const created = await client.call(com.atproto.simplespace.createSpace, {
    type: SPACE_TYPE,
    skey: SPACE_SKEY,
    policy: { $type: "com.atproto.simplespace.defs#memberListPolicy" },
    appAccess: { $type: "com.atproto.simplespace.defs#open" },
  });
  setSpaceUri(session.did, created.uri);
  return created.uri;
}

/**
 * Store one ring webhook delivery, either in the user's private space or in
 * their public repo.
 *
 * Audio-bearing deliveries become a me.byjp.pebble-index.recording (audio is
 * required by that lexicon); transcription-only deliveries become a
 * me.byjp.pebble-index.note, matching how the Pebble app itself files
 * transcriptions.
 */
export async function writeRecording(
  session: OAuthSession,
  input: RecordingInput,
  visibility: Visibility,
): Promise<{ uri: string; duplicate: boolean }> {
  const collection = input.audio ? RECORDING_COLLECTION : NOTE_COLLECTION;
  const rkey = entryRkey(input);
  const record = input.audio
    ? await recordingRecord(session, input, input.audio)
    : noteRecord(input);

  const client = new Client(session);
  if (visibility === "public") {
    // putRecord makes the Pebble app's retry-on-next-recording idempotent.
    const result = await client.call(com.atproto.repo.putRecord, {
      repo: asStringFormat(session.did, "at-identifier"),
      collection,
      rkey,
      validate: false,
      record,
    });
    return { uri: result.uri, duplicate: false };
  }

  try {
    const result = await client.call(com.atproto.space.createRecord, {
      space: spaceRef(session.did),
      repo: session.did,
      collection,
      rkey,
      validate: false,
      record,
    });
    return { uri: result.uri, duplicate: false };
  } catch (error) {
    if (isRecordAlreadyExistsError(error)) {
      return {
        uri: `${spaceUri(session.did)}/${session.did}/${collection}/${rkey}`,
        duplicate: true,
      };
    }
    throw error;
  }
}

/**
 * The Pebble app retries a failed delivery alongside the next recording, so
 * rkeys are derived deterministically to make redelivery idempotent. Notes use
 * `key: "tid"`, so their rkey is a TID built from the capture time with a
 * fixed clock id.
 */
export function entryRkey(input: Pick<RecordingInput, "audio" | "recordedAt">): string {
  if (input.audio) return input.audio.recordingId ?? `at-${input.recordedAt.getTime()}`;
  return TID.fromTime(input.recordedAt.getTime() * 1000, 0).toString();
}

async function recordingRecord(
  session: OAuthSession,
  input: RecordingInput,
  audio: NonNullable<RecordingInput["audio"]>,
) {
  if (audio.bytes.length <= 0 || audio.bytes.length > MAX_AUDIO_BYTES) {
    throw new Error("Invalid audio payload size");
  }
  const client = new Client(session);
  const uploaded = await client.call(com.atproto.repo.uploadBlob, audio.bytes, {
    encoding: AUDIO_MIME_TYPE,
  });
  return {
    $type: RECORDING_COLLECTION,
    audio: audioBlobRef(uploaded.blob, audio.bytes.length),
    ...(input.transcription !== undefined ? { transcript: input.transcription } : {}),
    recordedAt: input.recordedAt.toISOString(),
    ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
    client: input.client,
    ...(audio.recordingId !== undefined ? { recordingId: audio.recordingId } : {}),
    createdAt: new Date().toISOString(),
  };
}

function noteRecord(input: RecordingInput) {
  return {
    $type: NOTE_COLLECTION,
    text: input.transcription ?? "",
    createdAt: new Date().toISOString(),
    recordedAt: input.recordedAt.toISOString(),
  };
}

export async function listEntries(
  session: OAuthSession,
  options: { includePrivate: boolean },
): Promise<{ entries: EntryView[] }> {
  const [privateEntries, publicEntries] = await Promise.all([
    options.includePrivate ? listPrivateEntries(session) : Promise.resolve([]),
    listPublicEntries(session),
  ]);
  const entries = [...privateEntries, ...publicEntries].sort((a, b) =>
    (b.capturedAt ?? "").localeCompare(a.capturedAt ?? ""),
  );
  return { entries };
}

async function listPrivateEntries(session: OAuthSession): Promise<EntryView[]> {
  const client = new Client(session);
  try {
    // No collection filter: one call returns notes, reminders and recordings.
    const result = await client.call(com.atproto.space.listRecords, {
      space: spaceRef(session.did),
      repo: asStringFormat(session.did, "did"),
      limit: 100,
      reverse: true,
    });
    return result.records
      .map((record) => parseEntryView({ ...record, visibility: "private" }))
      .filter((entry): entry is EntryView => entry !== null);
  } catch (error) {
    // A repo only appears in the space once its first record is written, and
    // the space itself may not exist yet.
    if (isRepoNotFoundError(error) || isSpaceNotFoundError(error)) return [];
    if (isSpacesUnsupportedError(error)) return [];
    throw error;
  }
}

async function listPublicEntries(session: OAuthSession): Promise<EntryView[]> {
  const client = new Client(session);
  const collections = [RECORDING_COLLECTION, NOTE_COLLECTION];
  const results = await Promise.all(
    collections.map(async (collection) => {
      const result = await client.call(com.atproto.repo.listRecords, {
        repo: asStringFormat(session.did, "at-identifier"),
        collection: asStringFormat(collection, "nsid"),
        limit: 100,
      });
      return result.records
        .map((record) =>
          parseEntryView({
            collection,
            rkey: record.uri.split("/").pop() ?? "",
            cid: record.cid,
            value: record.value,
            visibility: "public",
          }),
        )
        .filter((entry): entry is EntryView => entry !== null);
    }),
  );
  return results.flat();
}

export async function deleteEntry(
  session: OAuthSession,
  entry: { visibility: Visibility; collection: string; rkey: string },
): Promise<void> {
  const client = new Client(session);
  if (entry.visibility === "public") {
    await client.call(com.atproto.repo.deleteRecord, {
      repo: asStringFormat(session.did, "at-identifier"),
      collection: asStringFormat(entry.collection, "nsid"),
      rkey: asStringFormat(entry.rkey, "record-key"),
    });
    return;
  }
  await client.call(com.atproto.space.deleteRecord, {
    space: spaceRef(session.did),
    repo: session.did,
    collection: asStringFormat(entry.collection, "nsid"),
    rkey: asStringFormat(entry.rkey, "record-key"),
  });
}

export async function getAudioBlob(
  session: OAuthSession,
  cid: string,
  visibility: Visibility,
): Promise<Uint8Array> {
  if (visibility === "public") {
    // Public blobs are public: fetch them without credentials. Calling
    // sync.getBlob through the OAuth session fails on real PDSes (the
    // granular-scope token doesn't cover it), and the anonymous path also
    // follows any CDN redirect cleanly.
    const pdsUrl = await resolvePds(session.did);
    const url = new URL(`${pdsUrl}/xrpc/com.atproto.sync.getBlob`);
    url.searchParams.set("did", session.did);
    url.searchParams.set("cid", cid);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`sync.getBlob failed (${response.status}): ${await response.text()}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  const client = new Client(session);
  return await client.call(com.atproto.space.getBlob, {
    space: spaceRef(session.did),
    repo: asStringFormat(session.did, "did"),
    cid: asStringFormat(cid, "cid"),
  });
}

function audioBlobRef(blob: unknown, expectedSize: number) {
  if (!isBlobRef(blob)) throw new Error("PDS returned an invalid blob reference");
  const cid = getBlobCidString(blob);
  // The PDS content-sniffs uploads and may return a different mime than the
  // declared audio/mp4; its answer is canonical, so carry it into the record.
  const mimeType = getBlobMime(blob);
  const size = getBlobSize(blob);
  if (!cid || !mimeType || size !== expectedSize) {
    throw new Error("PDS returned an unexpected blob reference");
  }
  return { $type: "blob" as const, ref: parseCid(cid), mimeType, size };
}

export function parseEntryView(record: {
  collection?: string;
  rkey: string;
  cid: string;
  value?: unknown;
  visibility: Visibility;
}): EntryView | null {
  const value = (record.value ?? {}) as Record<string, unknown>;
  const collection = record.collection ?? (typeof value.$type === "string" ? value.$type : "");
  const kind =
    collection === RECORDING_COLLECTION
      ? "recording"
      : collection === NOTE_COLLECTION
        ? "note"
        : collection === REMINDER_COLLECTION
          ? "reminder"
          : null;
  if (kind === null) return null;

  const audio = value.audio;
  return {
    kind,
    visibility: record.visibility,
    collection,
    rkey: record.rkey,
    cid: record.cid,
    text: firstString(value.transcript, value.text),
    audioCid: isBlobRef(audio) ? (getBlobCidString(audio) ?? null) : null,
    audioMimeType: isBlobRef(audio) ? (getBlobMime(audio) ?? null) : null,
    capturedAt: firstString(value.recordedAt, value.createdAt),
    trigger: firstString(value.trigger),
    dueAt: firstString(value.dueAt),
  };
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string") return value;
  return null;
}

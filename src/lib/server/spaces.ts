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
import { RECORDING_COLLECTION, SPACE_SKEY, SPACE_TYPE, spaceUri } from "./config";

export const AUDIO_MIME_TYPE = "audio/mp4";
export const MAX_AUDIO_BYTES = 100_000_000;

export type RecordingInput = {
  transcription?: string;
  audio?: { bytes: Uint8Array; recordingId?: string };
  recordedAt: Date;
  trigger?: string;
  client: string;
};

export type RecordingView = {
  rkey: string;
  cid: string;
  transcription: string | null;
  audioCid: string | null;
  audioMimeType: string | null;
  recordedAt: string | null;
  trigger: string | null;
  createdAt: string | null;
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

function spaceRef(did: string) {
  return asStringFormat(spaceUri(did), "space-ref");
}

/**
 * Make sure the user's private recordings space exists, creating it on first
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

export async function writeRecording(
  session: OAuthSession,
  input: RecordingInput,
): Promise<{ uri: string; duplicate: boolean }> {
  const client = new Client(session);

  let audioRef: ReturnType<typeof audioBlobRef> | undefined;
  if (input.audio) {
    if (input.audio.bytes.length <= 0 || input.audio.bytes.length > MAX_AUDIO_BYTES) {
      throw new Error("Invalid audio payload size");
    }
    const uploaded = await client.call(com.atproto.repo.uploadBlob, input.audio.bytes, {
      encoding: AUDIO_MIME_TYPE,
    });
    audioRef = audioBlobRef(uploaded.blob, input.audio.bytes.length);
  }

  // The Pebble app retries a failed delivery alongside the next recording, so
  // rkeys are derived deterministically to make redelivery idempotent.
  const rkey = input.audio?.recordingId ?? `at-${input.recordedAt.getTime()}`;

  const record = {
    $type: RECORDING_COLLECTION,
    ...(input.transcription !== undefined ? { transcription: input.transcription } : {}),
    ...(audioRef ? { audio: audioRef } : {}),
    recordedAt: input.recordedAt.toISOString(),
    ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
    client: input.client,
    ...(input.audio?.recordingId !== undefined ? { recordingId: input.audio.recordingId } : {}),
    createdAt: new Date().toISOString(),
  };

  try {
    const result = await client.call(com.atproto.space.createRecord, {
      space: spaceRef(session.did),
      repo: session.did,
      collection: RECORDING_COLLECTION,
      rkey,
      validate: false,
      record,
    });
    return { uri: result.uri, duplicate: false };
  } catch (error) {
    if (isRecordAlreadyExistsError(error)) {
      return {
        uri: `${spaceUri(session.did)}/${session.did}/${RECORDING_COLLECTION}/${rkey}`,
        duplicate: true,
      };
    }
    throw error;
  }
}

export async function listRecordings(
  session: OAuthSession,
  cursor?: string,
): Promise<{ recordings: RecordingView[]; cursor?: string }> {
  const client = new Client(session);
  try {
    const result = await client.call(com.atproto.space.listRecords, {
      space: spaceRef(session.did),
      repo: asStringFormat(session.did, "did"),
      collection: RECORDING_COLLECTION,
      limit: 50,
      reverse: true,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    // rkeys mix recording ids and timestamp fallbacks, so rkey order (what
    // listRecords sorts by) is not chronological.
    const recordings = result.records
      .map((record) => parseRecordingView(record))
      .sort((a, b) =>
        (b.recordedAt ?? b.createdAt ?? "").localeCompare(a.recordedAt ?? a.createdAt ?? ""),
      );
    return { recordings, cursor: result.cursor };
  } catch (error) {
    // A repo only appears in the space once its first record is written.
    if (isRepoNotFoundError(error) || isSpaceNotFoundError(error)) return { recordings: [] };
    throw error;
  }
}

export async function getAudioBlob(session: OAuthSession, cid: string): Promise<Uint8Array> {
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

function parseRecordingView(record: { rkey: string; cid: string; value?: unknown }): RecordingView {
  const value = (record.value ?? {}) as Record<string, unknown>;
  const audio = value.audio;
  return {
    rkey: record.rkey,
    cid: record.cid,
    transcription: typeof value.transcription === "string" ? value.transcription : null,
    audioCid: isBlobRef(audio) ? (getBlobCidString(audio) ?? null) : null,
    audioMimeType: isBlobRef(audio) ? (getBlobMime(audio) ?? null) : null,
    recordedAt: typeof value.recordedAt === "string" ? value.recordedAt : null,
    trigger: typeof value.trigger === "string" ? value.trigger : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
  };
}

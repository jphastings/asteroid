import { TID } from "@atproto/common-web";
import { describe, expect, it } from "vitest";
import { entryRkey, parseEntryView } from "./spaces";

const RECORDED_AT = new Date(1756180000000);

describe("entryRkey", () => {
  it("creates a valid TID for recordings whose timestamp matches recordedAt", () => {
    const rkey = entryRkey({
      audio: { bytes: new Uint8Array([1]), recordingId: "ring_abc123def456" },
      recordedAt: RECORDED_AT,
    });
    expect(TID.is(rkey)).toBe(true);
    expect(TID.fromStr(rkey).timestamp()).toBe(RECORDED_AT.getTime() * 1000);
  });

  it("derives a deterministic rkey for repeated calls with same recording id and recordedAt", () => {
    const a = entryRkey({
      audio: { bytes: new Uint8Array([1]), recordingId: "ring_abc123def456" },
      recordedAt: RECORDED_AT,
    });
    const b = entryRkey({
      audio: { bytes: new Uint8Array([1]), recordingId: "ring_abc123def456" },
      recordedAt: new Date(RECORDED_AT.getTime()),
    });
    expect(a).toBe(b);
  });

  it("produces different rkeys for different recording ids at the same recordedAt", () => {
    const a = entryRkey({
      audio: { bytes: new Uint8Array([1]), recordingId: "ring_aaaa0000" },
      recordedAt: RECORDED_AT,
    });
    const b = entryRkey({
      audio: { bytes: new Uint8Array([1]), recordingId: "ring_ffff9999" },
      recordedAt: RECORDED_AT,
    });
    expect(a).not.toBe(b);
  });

  it("creates a valid TID for recordings with no recordingId", () => {
    const rkey = entryRkey({
      audio: { bytes: new Uint8Array([1]) },
      recordedAt: RECORDED_AT,
    });
    expect(TID.is(rkey)).toBe(true);
    expect(TID.fromStr(rkey).timestamp()).toBe(RECORDED_AT.getTime() * 1000);
  });

  it("derives a deterministic, valid TID for notes", () => {
    const a = entryRkey({ recordedAt: RECORDED_AT });
    const b = entryRkey({ recordedAt: new Date(RECORDED_AT.getTime()) });
    expect(a).toBe(b);
    expect(TID.is(a)).toBe(true);
    expect(TID.fromStr(a).timestamp()).toBe(RECORDED_AT.getTime() * 1000);
  });
});

describe("parseEntryView", () => {
  it("maps recording records including the transcript field", () => {
    const entry = parseEntryView({
      collection: "me.byjp.pebble-index.recording",
      rkey: "abc-123",
      cid: "bafyfake",
      visibility: "private" as const,
      value: {
        $type: "me.byjp.pebble-index.recording",
        transcript: "hello",
        recordedAt: "2026-08-26T10:00:00.000Z",
        trigger: "single-click-hold",
      },
    });
    expect(entry).toMatchObject({
      kind: "recording",
      visibility: "private",
      collection: "me.byjp.pebble-index.recording",
      text: "hello",
      capturedAt: "2026-08-26T10:00:00.000Z",
      trigger: "single-click-hold",
    });
  });

  it("maps note records, preferring recordedAt over createdAt", () => {
    const entry = parseEntryView({
      collection: "me.byjp.pebble-index.note",
      rkey: "3juxxvxyzzz2a",
      cid: "bafyfake",
      visibility: "private" as const,
      value: {
        $type: "me.byjp.pebble-index.note",
        text: "a note",
        createdAt: "2026-08-26T11:00:00.000Z",
        recordedAt: "2026-08-26T10:00:00.000Z",
      },
    });
    expect(entry).toMatchObject({
      kind: "note",
      text: "a note",
      capturedAt: "2026-08-26T10:00:00.000Z",
    });
  });

  it("maps reminder records with their due time", () => {
    const entry = parseEntryView({
      collection: "me.byjp.pebble-index.reminder",
      rkey: "3juxxvxyzzz2a",
      cid: "bafyfake",
      visibility: "private" as const,
      value: {
        $type: "me.byjp.pebble-index.reminder",
        text: "water the olive tree",
        createdAt: "2026-08-26T11:00:00.000Z",
        dueAt: "2026-08-27T09:00:00.000Z",
      },
    });
    expect(entry).toMatchObject({ kind: "reminder", dueAt: "2026-08-27T09:00:00.000Z" });
  });

  it("drops unknown collections", () => {
    expect(
      parseEntryView({
        collection: "some.other.thing",
        rkey: "x",
        cid: "bafyfake",
        visibility: "private" as const,
        value: {},
      }),
    ).toBeNull();
  });
});

import { TID } from "@atproto/common-web";
import { describe, expect, it } from "vitest";
import { entryRkey, parseEntryView } from "./spaces";

const RECORDED_AT = new Date(1756180000000);

describe("entryRkey", () => {
  it("uses the Pebble recording id for audio-bearing deliveries", () => {
    expect(
      entryRkey({
        audio: { bytes: new Uint8Array([1]), recordingId: "abc-123" },
        recordedAt: RECORDED_AT,
      }),
    ).toBe("abc-123");
  });

  it("falls back to the capture timestamp when audio has no usable id", () => {
    expect(entryRkey({ audio: { bytes: new Uint8Array([1]) }, recordedAt: RECORDED_AT })).toBe(
      `at-${RECORDED_AT.getTime()}`,
    );
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
      value: {
        $type: "me.byjp.pebble-index.recording",
        transcript: "hello",
        recordedAt: "2026-08-26T10:00:00.000Z",
        trigger: "single-click-hold",
      },
    });
    expect(entry).toMatchObject({
      kind: "recording",
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
      parseEntryView({ collection: "some.other.thing", rkey: "x", cid: "bafyfake", value: {} }),
    ).toBeNull();
  });
});

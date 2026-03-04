import { describe, it, expect } from "vitest";
import { extractFreeSlots, type SearchSettings } from "../lib/google-calendar";
import { generateMessage } from "../lib/message-generator";

// Helper: create a date on 2026-03-10 with given hour/minute
function d(hour: number, minute = 0) {
  return new Date(2026, 2, 10, hour, minute, 0, 0); // month is 0-indexed
}

const BASE_SETTINGS: SearchSettings = {
  timeMode: "business",
  businessStart: 9,
  businessEnd: 18,
  customStart: 9,
  customEnd: 21,
  minDurationMinutes: 60,
  requiredDurationMinutes: 60,
  maxSlots: 0,
  startStepMinutes: 30,
};

describe("extractFreeSlots", () => {
  it("returns full day when no events", () => {
    const date = new Date(2026, 2, 10); // 2026-03-10
    const slots = extractFreeSlots([date], [], BASE_SETTINGS);
    expect(slots.length).toBeGreaterThan(0);
    // All slots should be within business hours
    for (const s of slots) {
      expect(s.start.getHours()).toBeGreaterThanOrEqual(9);
      expect(s.end.getHours()).toBeLessThanOrEqual(18);
    }
  });

  it("excludes time blocked by events", () => {
    const date = new Date(2026, 2, 10);
    const events = [
      {
        id: "1",
        summary: "Meeting",
        start: { dateTime: d(9, 0).toISOString() },
        end: { dateTime: d(17, 0).toISOString() },
      },
    ];
    const slots = extractFreeSlots([date], events, BASE_SETTINGS);
    // Only 17:00-18:00 should be free (1 hour)
    expect(slots.length).toBe(1);
    expect(slots[0].start.getHours()).toBe(17);
    expect(slots[0].end.getHours()).toBe(18);
  });

  it("respects maxSlots limit", () => {
    const date = new Date(2026, 2, 10);
    const settings = { ...BASE_SETTINGS, maxSlots: 2 };
    const slots = extractFreeSlots([date], [], settings);
    expect(slots.length).toBeLessThanOrEqual(2);
  });

  it("skips transparent (free) events", () => {
    const date = new Date(2026, 2, 10);
    const events = [
      {
        id: "2",
        summary: "Lunch",
        start: { dateTime: d(12, 0).toISOString() },
        end: { dateTime: d(13, 0).toISOString() },
        transparency: "transparent",
      },
    ];
    // Transparent event should not block time
    const slots = extractFreeSlots([date], events, BASE_SETTINGS);
    const slotsWithoutEvent = extractFreeSlots([date], [], BASE_SETTINGS);
    expect(slots.length).toBe(slotsWithoutEvent.length);
  });

  it("handles allday time mode", () => {
    const date = new Date(2026, 2, 10);
    const settings = { ...BASE_SETTINGS, timeMode: "allday" as const };
    const slots = extractFreeSlots([date], [], settings);
    expect(slots.length).toBeGreaterThan(0);
  });
});

describe("generateMessage", () => {
  const slot = {
    start: new Date(2026, 2, 10, 10, 0),
    end: new Date(2026, 2, 10, 11, 0),
    durationMinutes: 60,
  };

  it("generates formal message with recipient name", () => {
    const msg = generateMessage({
      slots: [slot],
      toName: "田中",
      toneLevel: "formal",
      format: "bullet",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("田中様");
    expect(msg).toContain("お世話になっております");
    expect(msg).toContain("3月10日");
  });

  it("generates casual message without recipient name", () => {
    const msg = generateMessage({
      slots: [slot],
      toneLevel: "casual",
      format: "bullet",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("お疲れ様です");
    expect(msg).not.toContain("様\n");
  });

  it("generates friendly (tame-guchi) message", () => {
    const msg = generateMessage({
      slots: [slot],
      toName: "ゆうき",
      toneLevel: "friendly",
      format: "bullet",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("ゆうき");
    expect(msg).not.toContain("お世話になっております");
  });

  it("generates table format", () => {
    const msg = generateMessage({
      slots: [slot],
      toneLevel: "formal",
      format: "table",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("|");
    expect(msg).toContain("日付");
  });

  it("generates prose format", () => {
    const msg = generateMessage({
      slots: [slot],
      toneLevel: "formal",
      format: "prose",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("はいかがでしょうか");
  });

  it("returns fallback when no slots", () => {
    const msg = generateMessage({
      slots: [],
      toneLevel: "formal",
      format: "bullet",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("見つかりませんでした");
  });

  it("includes subject when provided with formal tone", () => {
    const msg = generateMessage({
      slots: [slot],
      subject: "打ち合わせのご提案",
      toneLevel: "formal",
      format: "bullet",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("件名：打ち合わせのご提案");
  });
});

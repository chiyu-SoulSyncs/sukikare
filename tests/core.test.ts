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

  it("generates formal mail message with recipient name", () => {
    const msg = generateMessage({
      slots: [slot],
      toName: "田中",
      toneLevel: "formal",
      format: "mail",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("田中様");
    expect(msg).toContain("お世話になっております");
    expect(msg).toContain("3月10日");
  });

  it("generates casual line message without recipient name", () => {
    const msg = generateMessage({
      slots: [slot],
      toneLevel: "casual",
      format: "line",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("お疲れ様です");
    expect(msg).toContain("●"); // LINEフォーマットは●を使用
  });

  it("generates friendly (tame-guchi) message", () => {
    const msg = generateMessage({
      slots: [slot],
      toName: "ゆうき",
      toneLevel: "friendly",
      format: "line",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("ゆうき");
    expect(msg).not.toContain("お世話になっております");
  });

  it("generates plain format (no greeting)", () => {
    const msg = generateMessage({
      slots: [slot],
      toneLevel: "formal",
      format: "plain",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("●");
    expect(msg).not.toContain("お世話になっております");
  });

  it("returns fallback when no slots", () => {
    const msg = generateMessage({
      slots: [],
      toneLevel: "formal",
      format: "mail",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("見つかりませんでした");
  });

  it("includes subject in mail format with formal tone", () => {
    const msg = generateMessage({
      slots: [slot],
      subject: "打ち合わせのご提案",
      toneLevel: "formal",
      format: "mail",
      requiredDurationMinutes: 60,
    });
    expect(msg).toContain("件名：打ち合わせのご提案");
  });
});

describe("extractFreeSlots - exclusion settings", () => {
  it("除外曜日をスキップする", () => {
    // 2026-03-10 is Tuesday (day=2), 2026-03-14 is Saturday (day=6)
    const tuesday = new Date(2026, 2, 10);
    const saturday = new Date(2026, 2, 14);
    const settings = { ...BASE_SETTINGS, excludedWeekdays: [6] }; // 土曜除外
    const slots = extractFreeSlots([tuesday, saturday], [], settings);
    // 火曜のスロットはあるが、土曜のスロットはない
    const satSlots = slots.filter((s) => s.start.getDay() === 6);
    expect(satSlots.length).toBe(0);
    const tueSlots = slots.filter((s) => s.start.getDay() === 2);
    expect(tueSlots.length).toBeGreaterThan(0);
  });

  it("除外時間帯をブロックする", () => {
    const date = new Date(2026, 2, 10);
    const settings = {
      ...BASE_SETTINGS,
      excludedTimeRanges: [{ startHour: 12, startMin: 0, endHour: 13, endMin: 0 }],
    };
    const slots = extractFreeSlots([date], [], settings);
    // 12:00-13:00のスロットがないことを確認
    const lunchSlots = slots.filter(
      (s) => s.start.getHours() === 12 && s.start.getMinutes() === 0
    );
    expect(lunchSlots.length).toBe(0);
  });

  it("除外設定なしでは除外しない", () => {
    const saturday = new Date(2026, 2, 14);
    const settings = { ...BASE_SETTINGS }; // excludedWeekdaysなし
    const slots = extractFreeSlots([saturday], [], settings);
    expect(slots.length).toBeGreaterThan(0);
  });
});

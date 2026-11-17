import { expect, test } from "bun:test";
import { defaultSettings, withDefaults } from "./store";

test("settings from before the welcome existed have no onboardedAt", () => {
  const settings = withDefaults({ authMode: "apiKey", voice: { speakReplies: true } as never });
  expect(settings.onboardedAt).toBeUndefined();
  expect(settings.voice).toEqual({ ...defaultSettings.voice, speakReplies: true });
  expect(settings.models).toEqual(defaultSettings.models);
});

test("finishing the welcome is remembered", () => {
  const at = "2026-11-16T09:00:00.000Z";
  expect(withDefaults({ onboardedAt: at }).onboardedAt).toBe(at);
});

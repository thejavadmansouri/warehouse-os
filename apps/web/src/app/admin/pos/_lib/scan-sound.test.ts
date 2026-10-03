import { afterEach, describe, expect, it } from "vitest";

import {
  isScanSoundMuted,
  playScanSound,
  setScanSoundMuted,
  toggleScanSoundMuted,
} from "./scan-sound";

/**
 * صدای اسکن — منطقِ خاموش‌روش و ایمنی.
 *
 * jsdom AudioContext ندارد؛ قراردادِ این ماژول است که در آن محیط هم
 * playScanSound هرگز خطا ندهد — بی‌صدا رد شود.
 */
describe("scan-sound", () => {
  afterEach(() => {
    setScanSoundMuted(false);
  });

  it("پیش‌فرض: صدا روشن است", () => {
    expect(isScanSoundMuted()).toBe(false);
  });

  it("خاموش‌روش در localStorage می‌ماند", () => {
    setScanSoundMuted(true);
    expect(isScanSoundMuted()).toBe(true);
    setScanSoundMuted(false);
    expect(isScanSoundMuted()).toBe(false);
  });

  it("toggle حالتِ تازه را برمی‌گرداند و واقعاً عوض می‌کند", () => {
    expect(toggleScanSoundMuted()).toBe(true);
    expect(isScanSoundMuted()).toBe(true);
    expect(toggleScanSoundMuted()).toBe(false);
    expect(isScanSoundMuted()).toBe(false);
  });

  it("بیپ در محیطِ بدون AudioContext هرگز خطا نمی‌دهد", () => {
    expect(() => playScanSound("ok")).not.toThrow();
    expect(() => playScanSound("error")).not.toThrow();
  });

  it("بیپِ خاموش هم بدون خطا رد می‌شود", () => {
    setScanSoundMuted(true);
    expect(() => playScanSound("ok")).not.toThrow();
  });
});

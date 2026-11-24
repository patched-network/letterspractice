/**
 * A minimal fontconfig for the Chromium the perf scripts launch.
 *
 * On Linux, Chromium resolves each font it hasn't seen yet through
 * fontconfig, over IPC from its sandboxed renderer, and that cost grows with
 * the number of fonts installed. On a desktop with a couple of thousand fonts
 * the page's first layout spent ~0.8 s of its 1 s there.
 * Phones look fonts up in-process, from a small set, so that time says
 * nothing about them. With only a few fonts visible, the measurement tracks
 * the page instead of the workstation.
 *
 * Returns the env to launch Chrome with: FONTCONFIG_FILE pointing at a
 * generated config with a few common font directories, or {} when the system
 * fonts are wanted (--system-fonts), we're not on Linux, or none of the
 * directories exist.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const CANDIDATE_DIRS = [
  // Debian / Ubuntu
  "/usr/share/fonts/truetype/dejavu",
  "/usr/share/fonts/truetype/liberation",
  // Fedora / Arch
  "/usr/share/fonts/dejavu-sans-fonts",
  "/usr/share/fonts/liberation-sans",
  "/usr/share/fonts/TTF",
];

export function fontEnv(argv: string[]): Record<string, string> {
  if (process.platform !== "linux" || argv.includes("--system-fonts")) return {};
  const dirs = CANDIDATE_DIRS.filter((d) => existsSync(d));
  if (dirs.length === 0) {
    console.error("[perf] no minimal font directory found; measuring with the system fonts");
    return {};
  }
  const base = resolve(".perf", "fontconfig");
  mkdirSync(join(base, "cache"), { recursive: true });
  const file = join(base, "fonts.conf");
  writeFileSync(
    file,
    [
      '<?xml version="1.0"?>',
      '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
      "<fontconfig>",
      ...dirs.map((d) => `  <dir>${d}</dir>`),
      `  <cachedir>${join(base, "cache")}</cachedir>`,
      "</fontconfig>",
      "",
    ].join("\n"),
  );
  return { FONTCONFIG_FILE: file };
}

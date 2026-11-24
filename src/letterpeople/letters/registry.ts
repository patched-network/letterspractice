// letterpeople/src/letters/registry.ts
// DOM-free registry of letter geometry renderers. Safe to import from
// non-SVG renderers (e.g. three.js) without pulling in the SVG/anime runtime.
import type { LetterGeometry, LetterOptions } from "../types";

// Import letter implementations
import A from "./A-uppercase";
import a from "./a-lowercase";
import B from "./B-uppercase";
import b from "./b-lowercase";
import c from "./c-lowercase";
import C from "./C-uppercase";
import d from "./d-lowercase";
import D from "./D-uppercase";
import E from "./E-uppercase";
import e from "./e-lowercase";
import F from "./F-uppercase";
import f from "./f-lowercase";
import G from "./G-uppercase";
import g from "./g-lowercase";
import H from "./H-uppercase";
import h from "./h-lowercase";
import i from "./i-lowercase";
import I from "./I-uppercase";
import j from "./j-lowercase";
import J from "./J-uppercase";
import K from "./K-uppercase";
import k from "./k-lowercase";
import L from "./L-uppercase";
import l from "./l-lowercase";
import M from "./M-uppercase";
import m from "./m-lowercase";
import N from "./N-uppercase";
import n from "./n-lowercase";
import o from "./o-lowercase";
import O from "./O-uppercase";
import p from "./p-lowercase";
import P from "./P-uppercase";
import q from "./q-lowercase";
import Q from "./Q-uppercase";
import r from "./r-lowercase";
import R from "./R-uppercase";
import S from "./S-uppercase";
import s from "./s-lowercase";
import T from "./T-uppercase";
import t from "./t-lowercase";
import U from "./U-uppercase";
import u from "./u-lowercase";
import V from "./V-uppercase";
import v from "./v-lowercase";
import W from "./W-uppercase";
import w from "./w-lowercase";
import X from "./X-uppercase";
import x from "./x-lowercase";
import Y from "./Y-uppercase";
import y from "./y-lowercase";
import z from "./z-lowercase";
import Z from "./Z-uppercase";

// Import punctuation
import period from "../punctuation/period";
import exclamation from "../punctuation/exclamation";
import comma from "../punctuation/comma";
import colon from "../punctuation/colon";
import semicolon from "../punctuation/semicolon";
import apostrophe from "../punctuation/apostrophe";
import question from "../punctuation/question";
import underscore from "../punctuation/underscore";

// Import constants for descender calculation
import { VIEWBOX_HEIGHT, EFFECTIVE_LOWERCASE_HEIGHT } from "./CONSTS";

// Map letters to their rendering functions
export const letterRenderers: {
  [key: string]: (options?: LetterOptions) => LetterGeometry;
} = {
  A: A,
  a: a,
  B: B,
  b: b,
  c: c,
  C: C,
  d: d,
  D: D,
  E: E,
  e: e,
  F: F,
  f: f,
  G: G,
  g: g,
  H: H,
  h: h,
  i: i,
  I: I,
  j: j,
  J: J,
  K: K,
  k: k,
  L: L,
  l: l,
  M: M,
  m: m,
  N: N,
  n: n,
  o: o,
  O: O,
  p: p,
  P: P,
  q: q,
  Q: Q,
  r: r,
  R: R,
  S: S,
  s: s,
  T: T,
  t: t,
  U: U,
  u: u,
  V: V,
  v: v,
  W: W,
  w: w,
  X: X,
  x: x,
  Y: Y,
  y: y,
  z: z,
  Z: Z,
  // Punctuation
  ".": period,
  "!": exclamation,
  ",": comma,
  ":": colon,
  ";": semicolon,
  "'": apostrophe,
  "?": question,
  _: underscore,
};

// Define which lowercase letters are descenders
export const DESCENDER_LETTERS = new Set(["g", "j", "p", "q", "y"]);

// Constants for viewBox calculations
export const DESCENDER_DEPTH = VIEWBOX_HEIGHT - EFFECTIVE_LOWERCASE_HEIGHT; // Should be 35


/**
 * Renderer-independent geometry for a character (body path data, viewBox,
 * attachment anchors), or null if the character has no renderer.
 * Coordinates are renderer-local: descender letters are NOT shifted down by
 * DESCENDER_DEPTH here (createLetter applies that shift in the SVG).
 */
export function getLetterGeometry(
  letter: string,
  options?: LetterOptions,
): LetterGeometry | null {
  const renderer = letterRenderers[letter];
  return renderer ? renderer(options) : null;
}

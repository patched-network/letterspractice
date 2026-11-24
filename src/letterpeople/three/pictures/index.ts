// letterpeople/src/three/pictures/index.ts
//
// SPIKE: word pictures in 3D, one builder per word, for silent exercises (a
// picture prompt in place of the word's audio). The catalog of which words
// are picturable is src/content/wordPictures.ts; browse both at
// /dbg/word-pictures, and check them with
// agent/threejs-letterpeople/scripts/word-pictures.mts.
//
// Builders return a fresh, still object in its own frame: facing +z, any
// size (the viewer frames it by its bounds). Paper and simple, in the
// content palette (DESIGN_SYSTEM.md, 3D Scenes; the kit is ./kit.ts). Lesson
// props that already exist are reused through their pure builders.

import * as THREE from "three";
import { buildFish, buildShip, FISH_COLORS } from "../harborProps";
import { buildKitBoxBody, buildKiteBody } from "../kiteProp";
import { bat, bear, bug, cat, chick, cow, dog, fox, hen, pig } from "./animals";
import { moon, rock, star, sun, tree } from "./nature";
import {
  bag,
  ball,
  bed,
  bell,
  bone,
  book,
  box,
  cake,
  cap,
  cape,
  chair,
  cone,
  cup,
  door,
  hat,
  house,
  key,
  light,
  lock,
  map,
  nut,
  pan,
  phone,
  red,
  ring,
  saw,
  soup,
  tape,
  tie,
  top,
  wheel,
} from "./things";
import { boat, bus, car, truck, van } from "./vehicles";

export type PictureBuilder = () => THREE.Object3D;

export const PICTURES_3D: Record<string, PictureBuilder> = {
  // Sky and outdoors
  sun,
  moon,
  star,
  tree,
  rock,
  // Animals
  cat,
  dog,
  pig,
  cow,
  fox,
  bear,
  chick,
  hen,
  bug,
  bat,
  fish: () => buildFish(FISH_COLORS[0], 2).group,
  // Vehicles
  bus,
  car,
  truck,
  van,
  boat,
  ship: () => buildShip(),
  // Toys, food, around the house
  ball,
  kite: () => buildKiteBody(20),
  kit: () => buildKitBoxBody(20),
  cake,
  cup,
  key,
  bell,
  book,
  bed,
  hat,
  house,
  box,
  bone,
  cone,
  lock,
  ring,
  door,
  phone,
  wheel,
  cap,
  cape,
  pan,
  soup,
  map,
  light,
  chair,
  bag,
  nut,
  saw,
  tape,
  tie,
  top,
  // Colours
  red,
};

export function hasPicture3D(word: string): boolean {
  return word in PICTURES_3D;
}

/** Free a built picture's geometry and materials. */
export function disposePicture(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Line)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}

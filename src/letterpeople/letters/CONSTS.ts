/*

Typography:

Here is the viewbox shape.

-----------------------------------------------
|
|
|    ^                        --------------
|    |
|   100px - VIEWBOX_HEIGHT         ^
|    |                             |
|    v                            65px - EFFECTIVE_LOWERCASE_HEIGHT
|                                  |
|                                  v
|
-------------------------------------------------
|
|  30px - DESCENDER_OVERFLOW
|
---------------------------------------------



*/

/**
 * 'Reference' height of the viewbox for drawing purposes.
 */
export const VIEWBOX_HEIGHT = 100;

/**
 * Lowercase letters should have a normal 'peak' at 65% of
 * height of uppercase letters.
 */
export const EFFECTIVE_LOWERCASE_HEIGHT = 65;

/**
 * Thickness of limbs
 */
export const DEFAULT_LIMB_THICKNESS = 20;

export const DEFAULT_OUTLINE_WIDTH = 4;

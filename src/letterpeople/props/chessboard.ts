import type { Point } from "../util/geometry";
import type { Actor, Stage } from "../scene/Stage";
import type {
  PropController,
  PropElements,
  StagePlacement,
  StagedPropFactory,
} from "./types";
import type { ArmAttachment } from "../attachments/types";
import { animate } from "animejs";

// ─── Chess types ──────────────────────────────────────────────

export type ChessFile = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
export type ChessRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ChessSquare {
  file: ChessFile;
  rank: ChessRank;
}

export type PieceKind =
  | "king"
  | "queen"
  | "rook"
  | "bishop"
  | "knight"
  | "pawn";
export type PieceColor = "white" | "black";

export interface ChessPiece {
  kind: PieceKind;
  color: PieceColor;
}

export interface PlacedPiece extends ChessPiece {
  square: ChessSquare;
}

// ─── Board geometry config ────────────────────────────────────

export interface ChessboardConfig {
  /** Width of the SVG viewBox. Default 500 */
  width?: number;
  /** Board thickness (front edge depth). Default 20 */
  thickness?: number;
  /** Top edge width in perspective. Default 300 */
  topWidth?: number;
  /** Bottom edge width in perspective. Default 450 */
  bottomWidth?: number;
  /** Top row Y position. Default 40 */
  topY?: number;
  /** Bottom row Y position. Default 180 */
  bottomY?: number;
  /** Light square color. Default #D1D5DB */
  lightColor?: string;
  /** Dark square color. Default #9CA3AF */
  darkColor?: string;
  /** Front edge color. Default #4B5563 */
  edgeColor?: string;
  /**
   * Board orientation.
   *
   *   'front' — standard view: ranks run top→bottom (8 far, 1 near),
   *             files run left→right (a–h). Viewer sits behind white.
   *
   *   'side'  — spectator view: ranks run left→right (1 left, 8 right),
   *             files run top→bottom (a far, h near).
   *             White pieces on the left, black on the right.
   *
   * Default 'front'.
   */
  orientation?: "front" | "side";
}

const FILES: ChessFile[] = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS: ChessRank[] = [1, 2, 3, 4, 5, 6, 7, 8];

function fileIndex(f: ChessFile): number {
  return FILES.indexOf(f);
}

// ─── Anchor type ──────────────────────────────────────────────

/**
 * Chessboard anchors are generated dynamically per-square.
 * We also expose a few fixed anchors for general targeting.
 */
export type ChessboardAnchor =
  | "boardCenter"
  | "frontEdgeCenter"
  | "backEdgeCenter"
  | "leftSeat" // good position for an actor sitting to the left
  | "rightSeat"; // good position for an actor sitting to the right

// ─── Controller ───────────────────────────────────────────────

export interface ChessboardPropController
  extends PropController<ChessboardAnchor> {
  /** Get the center point of a square in local SVG coordinates */
  getSquareCenter(square: ChessSquare): Point;

  /** Get the center point of a square in stage pixel coordinates */
  getSquareStagePoint(square: ChessSquare): Point;

  /**
   * Get the four corner points of a square in local SVG coordinates.
   * Returns [topLeft, topRight, bottomRight, bottomLeft].
   */
  getSquareCorners(square: ChessSquare): [Point, Point, Point, Point];

  /** Place a piece on the board. Replaces any piece already on that square. */
  placePiece(piece: PlacedPiece): void;

  /** Remove a piece from a square. Returns the removed piece, or null. */
  removePiece(square: ChessSquare): PlacedPiece | null;

  /** Get the piece on a given square, or null. */
  getPiece(square: ChessSquare): PlacedPiece | null;

  /** Get all currently placed pieces. */
  getAllPieces(): PlacedPiece[];

  /**
   * Animate moving a piece from one square to another.
   * If an actor is provided, their hand follows the piece during the move.
   * Returns a promise that resolves when the animation completes.
   */
  movePiece(
    from: ChessSquare,
    to: ChessSquare,
    actor?: Actor,
    hand?: "left" | "right",
    duration?: number,
  ): Promise<void>;

  /** Set up the standard opening position */
  setupStandardPosition(): void;

  /** Remove all pieces from the board */
  clearPieces(): void;

  /** The underlying board geometry config (readonly) */
  readonly config: Required<ChessboardConfig>;

  /**
   * Live-reposition the board on the stage without rebuilding.
   * Updates wrapper CSS to reflect new placement.
   */
  reposition(x: number, z: number): void;
}

// ─── Piece SVG drawing (2.5D upright) ─────────────────────────
//
// Each piece is an SVG <g> anchored at the bottom-center of its
// square.  It contains (bottom to top):
//
//   1. A small dark ellipse "base shadow" on the board surface.
//   2. For WHITE pieces: a solid-filled "backdrop" using the BLACK
//      (filled) glyph variant painted solid white.  This plugs the
//      interior cutouts that Unicode outline glyphs have (crown
//      gaps, battlement slots, etc.).
//   3. A contrast-halo copy of the glyph (thick stroke, no fill)
//      so pieces read against any background including overlapping
//      pieces behind.
//   4. The glyph itself — the outline variant for white, the filled
//      variant for black.
//
// data-attributes on the group store the base x/y and rendered
// height so movePiece can interpolate smoothly.

/** Outline (white) chess piece glyphs U+2654–2659 */
const PIECE_UNICODE_OUTLINE: Record<PieceKind, string> = {
  king: "\u2654",
  queen: "\u2655",
  rook: "\u2656",
  bishop: "\u2657",
  knight: "\u2658",
  pawn: "\u2659",
};

/** Filled (black) chess piece glyphs U+265A–265F */
const PIECE_UNICODE_FILLED: Record<PieceKind, string> = {
  king: "\u265A",
  queen: "\u265B",
  rook: "\u265C",
  bishop: "\u265D",
  knight: "\u265E",
  pawn: "\u265F",
};

/** Relative height of each piece kind (1.0 = tallest). */
const PIECE_HEIGHT_FACTOR: Record<PieceKind, number> = {
  king: 1.0,
  queen: 0.92,
  rook: 0.72,
  bishop: 0.85,
  knight: 0.80,
  pawn: 0.58,
};

/** Helper: create a <text> element with common attributes. */
function makeTextEl(
  svgNS: string,
  x: number,
  y: number,
  fontSize: number,
  content: string,
): SVGTextElement {
  const t = document.createElementNS(svgNS, "text") as unknown as SVGTextElement;
  t.setAttribute("x", x.toString());
  t.setAttribute("y", y.toString());
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("dominant-baseline", "auto");
  t.setAttribute("font-size", fontSize.toString());
  t.setAttribute("font-family", "serif");
  t.textContent = content;
  return t;
}

/**
 * Create a 2.5D upright chess piece.
 *
 * Layers (bottom → top):
 *   1. Base shadow ellipse
 *   2. [white only] Solid backdrop — the filled (♚) glyph painted
 *      solid white, plugging the outline glyph's interior cutouts
 *   3. Contrast halo — thick stroke, no fill
 *   4. Main glyph — outline variant (♔) for white, filled (♚) for black
 */
function createPieceSVGElement(
  piece: ChessPiece,
  baseCenter: Point,
  uprightHeight: number,
  svgNS: string,
): SVGGElement {
  const g = document.createElementNS(svgNS, "g") as SVGGElement;

  const heightFactor = PIECE_HEIGHT_FACTOR[piece.kind];
  const actualHeight = uprightHeight * heightFactor;
  // Font-size is larger than actualHeight because the glyph ink
  // only fills ~70% of the em square.
  const actualFontSize = actualHeight * 1.45;

  const outlineChar = PIECE_UNICODE_OUTLINE[piece.kind];
  const filledChar = PIECE_UNICODE_FILLED[piece.kind];

  // y position: shift up so the glyph's visual bottom sits just
  // above the base ellipse.
  const textY = baseCenter.y - actualHeight * 0.32;

  // ── 1. Base shadow ellipse ──────────────────────────────────
  // Tight ellipse hugging the piece's feet.
  const ellipseRx = actualFontSize * 0.22;
  const ellipseRy = actualFontSize * 0.07;
  const baseShadow = document.createElementNS(svgNS, "ellipse");
  baseShadow.setAttribute("cx", baseCenter.x.toString());
  baseShadow.setAttribute("cy", (baseCenter.y + ellipseRy * 0.3).toString());
  baseShadow.setAttribute("rx", ellipseRx.toString());
  baseShadow.setAttribute("ry", ellipseRy.toString());
  baseShadow.setAttribute("fill", "rgba(0,0,0,0.3)");
  g.appendChild(baseShadow);

  if (piece.color === "white") {
    // ── 2. Solid white backdrop (filled glyph) ──────────────
    // The filled variant (♚♛♜…) is drawn solid white.  This sits
    // behind the outline variant and fills in its interior holes.
    const backdrop = makeTextEl(svgNS, baseCenter.x, textY, actualFontSize, filledChar);
    backdrop.setAttribute("fill", "#FFFFFF");
    backdrop.setAttribute("stroke", "#FFFFFF");
    backdrop.setAttribute("stroke-width", (actualFontSize * 0.03).toString());
    backdrop.setAttribute("stroke-linejoin", "round");
    g.appendChild(backdrop);

    // ── 3. Contrast halo ────────────────────────────────────
    const halo = makeTextEl(svgNS, baseCenter.x, textY, actualFontSize, outlineChar);
    halo.setAttribute("fill", "none");
    halo.setAttribute("stroke", "rgba(255,255,255,0.9)");
    halo.setAttribute("stroke-width", (actualFontSize * 0.10).toString());
    halo.setAttribute("stroke-linejoin", "round");
    g.appendChild(halo);

    // ── 4. Main glyph (outline variant) ─────────────────────
    const main = makeTextEl(svgNS, baseCenter.x, textY, actualFontSize, outlineChar);
    main.setAttribute("fill", "#FFFFFF");
    main.setAttribute("stroke", "#222222");
    main.setAttribute("stroke-width", (actualFontSize * 0.035).toString());
    main.setAttribute("paint-order", "stroke");
    g.appendChild(main);
  } else {
    // ── 3. Contrast halo ────────────────────────────────────
    const halo = makeTextEl(svgNS, baseCenter.x, textY, actualFontSize, filledChar);
    halo.setAttribute("fill", "none");
    halo.setAttribute("stroke", "rgba(245,240,230,0.85)");
    halo.setAttribute("stroke-width", (actualFontSize * 0.10).toString());
    halo.setAttribute("stroke-linejoin", "round");
    g.appendChild(halo);

    // ── 4. Main glyph (filled variant) ──────────────────────
    const main = makeTextEl(svgNS, baseCenter.x, textY, actualFontSize, filledChar);
    main.setAttribute("fill", "#1a1a1a");
    main.setAttribute("stroke", "#333333");
    main.setAttribute("stroke-width", (actualFontSize * 0.015).toString());
    main.setAttribute("paint-order", "stroke");
    g.appendChild(main);
  }

  // ── Data attributes for animation ───────────────────────────
  g.setAttribute("data-base-x", baseCenter.x.toString());
  g.setAttribute("data-base-y", baseCenter.y.toString());
  g.setAttribute("data-height", actualHeight.toString());
  g.setAttribute("data-font-size", actualFontSize.toString());

  (g.style as any).pointerEvents = "none";

  return g;
}

// ─── Board geometry helpers ───────────────────────────────────

function makeGeometry(cfg: Required<ChessboardConfig>) {
  const rows = 8;
  const cols = 8;
  const centerX = cfg.width / 2;

  /** X coordinate for a column at a given row */
  const getX = (col: number, row: number): number => {
    const rowProgress = row / rows;
    const currentWidth =
      cfg.topWidth + (cfg.bottomWidth - cfg.topWidth) * rowProgress;
    const leftX = centerX - currentWidth / 2;
    const colWidth = currentWidth / cols;
    return leftX + col * colWidth;
  };

  /** Y coordinate for a given row */
  const getY = (row: number): number => {
    return cfg.topY + (cfg.bottomY - cfg.topY) * (row / rows);
  };

  /** Get the four corners of a grid cell (row, col) in SVG coords */
  const getCellCorners = (
    row: number,
    col: number,
  ): [Point, Point, Point, Point] => {
    return [
      { x: getX(col, row), y: getY(row) }, // top-left
      { x: getX(col + 1, row), y: getY(row) }, // top-right
      { x: getX(col + 1, row + 1), y: getY(row + 1) }, // bottom-right
      { x: getX(col, row + 1), y: getY(row + 1) }, // bottom-left
    ];
  };

  /** Get the center of a grid cell */
  const getCellCenter = (row: number, col: number): Point => {
    const [tl, tr, br, bl] = getCellCorners(row, col);
    return {
      x: (tl.x + tr.x + br.x + bl.x) / 4,
      y: (tl.y + tr.y + br.y + bl.y) / 4,
    };
  };

  /** Approximate column width of a cell on a given row */
  const getCellColWidth = (row: number): number => {
    const rowProgress = row / rows;
    const currentWidth =
      cfg.topWidth + (cfg.bottomWidth - cfg.topWidth) * rowProgress;
    return currentWidth / cols;
  };

  /** Row height (constant across columns) */
  const cellRowHeight = (cfg.bottomY - cfg.topY) / rows;

  /**
   * Upright piece height for a given row.
   * Pieces stand tall above the board — 3.5× the row height gives
   * a strong 2.5D "standing figure" look.
   */
  const getPieceUprightHeight = (row: number): number => {
    return cellRowHeight * 3.5;
  };

  /** Bottom-center of a cell — the point where a piece's base sits. */
  const getCellBaseCenter = (row: number, col: number): Point => {
    const [_tl, _tr, br, bl] = getCellCorners(row, col);
    return {
      x: (bl.x + br.x) / 2,
      y: (bl.y + br.y) / 2,
    };
  };

  const totalHeight = cfg.bottomY + cfg.thickness + 20;

  return {
    rows,
    cols,
    centerX,
    getX,
    getY,
    getCellCorners,
    getCellCenter,
    getCellBaseCenter,
    getCellColWidth,
    cellRowHeight,
    getPieceUprightHeight,
    totalHeight,
  };
}

// ─── Implementation ───────────────────────────────────────────

class ChessboardPropControllerImpl implements ChessboardPropController {
  private runningAnims: ReturnType<typeof animate>[] = [];
  private pieces: Map<string, { piece: PlacedPiece; element: SVGGElement }> =
    new Map();
  private piecesGroup: SVGGElement;
  private geo: ReturnType<typeof makeGeometry>;

  constructor(
    public readonly stage: Stage,
    public readonly placement: StagePlacement,
    private readonly wrapper: HTMLElement,
    public readonly elements: PropElements<ChessboardAnchor>,
    public readonly config: Required<ChessboardConfig>,
    piecesGroup: SVGGElement,
  ) {
    this.piecesGroup = piecesGroup;
    this.geo = makeGeometry(config);
  }

  // ── Coordinate mapping ────────────────────────────────────

  /**
   * Map a chess square to the grid (row, col) used by the geometry.
   *
   * In 'front' orientation (standard):
   *   row = 8 - rank   (rank 8 at top, rank 1 at bottom)
   *   col = fileIndex   (a on left, h on right)
   *
   * In 'side' orientation (spectator):
   *   row = fileIndex   (file a at back/top, file h at front/bottom)
   *   col = rank - 1    (rank 1 on left / white, rank 8 on right / black)
   */
  private squareToGrid(square: ChessSquare): { row: number; col: number } {
    if (this.config.orientation === "side") {
      return {
        row: fileIndex(square.file),
        col: square.rank - 1,
      };
    }
    // 'front' (default)
    return {
      row: 8 - square.rank,
      col: fileIndex(square.file),
    };
  }

  private squareKey(square: ChessSquare): string {
    return `${square.file}${square.rank}`;
  }

  getSquareCenter(square: ChessSquare): Point {
    const { row, col } = this.squareToGrid(square);
    return this.geo.getCellCenter(row, col);
  }

  getSquareStagePoint(square: ChessSquare): Point {
    const local = this.getSquareCenter(square);
    return this.localToStage(local);
  }

  getSquareCorners(square: ChessSquare): [Point, Point, Point, Point] {
    const { row, col } = this.squareToGrid(square);
    return this.geo.getCellCorners(row, col);
  }

  getStagePoint(anchor: ChessboardAnchor): Point {
    const local = this.elements.anchors[anchor];
    return this.localToStage(local);
  }

  private localToStage(localPoint: Point): Point {
    const proj = this.stage.project(this.placement.z);
    const originX = this.elements.width / 2;
    const originY = this.elements.height;

    const scaledX = originX + (localPoint.x - originX) * proj.scale;
    const scaledY = originY + (localPoint.y - originY) * proj.scale;

    const stageX = this.stage.referenceWidth
      ? this.stage.resolveX(this.placement.x)
      : this.placement.x;

    return {
      x: stageX + scaledX,
      y: proj.top + scaledY,
    };
  }

  // ── Piece management ──────────────────────────────────────

  placePiece(placed: PlacedPiece): void {
    const key = this.squareKey(placed.square);
    // Remove existing piece on that square
    this.removePiece(placed.square);

    const { row, col } = this.squareToGrid(placed.square);
    const baseCenter = this.geo.getCellBaseCenter(row, col);
    const uprightHeight = this.geo.getPieceUprightHeight(row);

    const svgNS = "http://www.w3.org/2000/svg";
    const el = createPieceSVGElement(placed, baseCenter, uprightHeight, svgNS);
    this.piecesGroup.appendChild(el);
    this.pieces.set(key, { piece: { ...placed }, element: el });
  }

  removePiece(square: ChessSquare): PlacedPiece | null {
    const key = this.squareKey(square);
    const existing = this.pieces.get(key);
    if (!existing) return null;
    existing.element.remove();
    this.pieces.delete(key);
    return existing.piece;
  }

  getPiece(square: ChessSquare): PlacedPiece | null {
    const key = this.squareKey(square);
    return this.pieces.get(key)?.piece ?? null;
  }

  getAllPieces(): PlacedPiece[] {
    return Array.from(this.pieces.values()).map((e) => e.piece);
  }

  async movePiece(
    from: ChessSquare,
    to: ChessSquare,
    actor?: Actor,
    hand: "left" | "right" = "right",
    duration: number = 600,
  ): Promise<void> {
    const fromKey = this.squareKey(from);
    const entry = this.pieces.get(fromKey);
    if (!entry) return;

    const piece = entry.piece;
    const pieceGroup = entry.element;

    // Remove any piece on the destination
    this.removePiece(to);

    // Remove from source tracking
    this.pieces.delete(fromKey);

    // Read current base position from data attrs
    const fromBaseX = parseFloat(pieceGroup.getAttribute("data-base-x") || "0");
    const fromBaseY = parseFloat(pieceGroup.getAttribute("data-base-y") || "0");
    const fromHeight = parseFloat(pieceGroup.getAttribute("data-height") || "12");
    const fromFontSize = parseFloat(pieceGroup.getAttribute("data-font-size") || "12");

    // Compute destination base position & size
    const { row: toRow, col: toCol } = this.squareToGrid(to);
    const toBase = this.geo.getCellBaseCenter(toRow, toCol);
    const toUprightHeight = this.geo.getPieceUprightHeight(toRow);
    const toHeightFactor = PIECE_HEIGHT_FACTOR[piece.kind];
    const toHeight = toUprightHeight * toHeightFactor;
    const toFontSize = toUprightHeight * 1.25 * toHeightFactor;

    // If an actor is provided, move their hand to the "from" square first,
    // then track the piece as it slides to "to", then relax.
    let arm: ArmAttachment | null = null;
    if (actor) {
      arm = actor.instance.arms[hand];
      // Target the top of the piece (where a hand would grab it)
      const fromTopStage = this.localToStage({
        x: fromBaseX,
        y: fromBaseY - fromHeight * 0.7,
      });
      const fromLocal = actor.toLocalPoint(fromTopStage);

      const startPos =
        arm.getHandPosition() || arm.getShoulderPosition();
      const reachProxy = { x: startPos.x, y: startPos.y };

      await new Promise<void>((resolve) => {
        let anim: ReturnType<typeof animate>;
        anim = animate(reachProxy, {
          x: fromLocal.x,
          y: fromLocal.y,
          duration: 300,
          ease: "outQuad",
          onUpdate: () => {
            arm!.setHandPosition({ x: reachProxy.x, y: reachProxy.y });
          },
          onComplete: () => {
            this.removeAnim(anim);
            resolve();
          },
        });
        this.runningAnims.push(anim);
      });
    }

    // Animate the piece sliding across the board
    const proxy = {
      bx: fromBaseX,
      by: fromBaseY,
      h: fromHeight,
      fs: fromFontSize,
    };

    await new Promise<void>((resolve) => {
      let anim: ReturnType<typeof animate>;
      anim = animate(proxy, {
        bx: toBase.x,
        by: toBase.y,
        h: toHeight,
        fs: toFontSize,
        duration,
        ease: "inOutCubic",
        onUpdate: () => {
          // Update text position: x at base, y shifted up
          // Update ALL text elements (halo + main glyph) and base ellipse
          const texts = pieceGroup.querySelectorAll("text");
          texts.forEach((t) => {
            t.setAttribute("x", proxy.bx.toString());
            t.setAttribute("y", (proxy.by - proxy.h * 0.32).toString());
            t.setAttribute("font-size", proxy.fs.toString());
          });
          const baseEl = pieceGroup.querySelector("ellipse");
          if (baseEl) {
            baseEl.setAttribute("cx", proxy.bx.toString());
            baseEl.setAttribute("cy", proxy.by.toString());
          }

          // Track actor hand at the top of the piece
          if (actor && arm) {
            const stagePt = this.localToStage({
              x: proxy.bx,
              y: proxy.by - proxy.h * 0.7,
            });
            const localPt = actor.toLocalPoint(stagePt);
            arm.setHandPosition({ x: localPt.x, y: localPt.y });
          }
        },
        onComplete: () => {
          this.removeAnim(anim);
          resolve();
        },
      });
      this.runningAnims.push(anim);
    });

    // Snap to final position & update data attrs
    const finalTexts = pieceGroup.querySelectorAll("text");
    finalTexts.forEach((t) => {
      t.setAttribute("x", toBase.x.toString());
      t.setAttribute("y", (toBase.y - toHeight * 0.32).toString());
      t.setAttribute("font-size", toFontSize.toString());
    });
    const finalBase = pieceGroup.querySelector("ellipse");
    if (finalBase) {
      finalBase.setAttribute("cx", toBase.x.toString());
      finalBase.setAttribute("cy", toBase.y.toString());
    }
    pieceGroup.setAttribute("data-base-x", toBase.x.toString());
    pieceGroup.setAttribute("data-base-y", toBase.y.toString());
    pieceGroup.setAttribute("data-height", toHeight.toString());
    pieceGroup.setAttribute("data-font-size", toFontSize.toString());

    // Register piece at new square
    const toKey = this.squareKey(to);
    piece.square = { ...to };
    this.pieces.set(toKey, { piece, element: pieceGroup });

    // Return actor arm to resting position
    if (arm) {
      await arm.relax();
    }
  }

  setupStandardPosition(): void {
    this.clearPieces();

    const backRank: PieceKind[] = [
      "rook",
      "knight",
      "bishop",
      "queen",
      "king",
      "bishop",
      "knight",
      "rook",
    ];

    for (let i = 0; i < 8; i++) {
      const file = FILES[i];

      // White back rank (rank 1)
      this.placePiece({
        kind: backRank[i],
        color: "white",
        square: { file, rank: 1 },
      });

      // White pawns (rank 2)
      this.placePiece({
        kind: "pawn",
        color: "white",
        square: { file, rank: 2 },
      });

      // Black pawns (rank 7)
      this.placePiece({
        kind: "pawn",
        color: "black",
        square: { file, rank: 7 },
      });

      // Black back rank (rank 8)
      this.placePiece({
        kind: backRank[i],
        color: "black",
        square: { file, rank: 8 },
      });
    }
  }

  clearPieces(): void {
    for (const entry of this.pieces.values()) {
      entry.element.remove();
    }
    this.pieces.clear();
  }

  reposition(x: number, z: number): void {
    (this.placement as any).x = x;
    (this.placement as any).z = z;
    const proj = this.stage.project(z);
    const stageX = this.stage.referenceWidth
      ? this.stage.resolveX(x)
      : x;
    this.wrapper.style.left = `${stageX}px`;
    this.wrapper.style.top = `${proj.top}px`;
    this.wrapper.style.transform = `scale(${proj.scale})`;
    this.wrapper.style.zIndex = Math.round(proj.zIndex).toString();
  }

  unmount(): void {
    for (const anim of this.runningAnims) {
      anim.pause();
    }
    this.runningAnims = [];

    this.clearPieces();

    if (this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
  }

  private removeAnim(anim: ReturnType<typeof animate>) {
    this.runningAnims = this.runningAnims.filter((a) => a !== anim);
  }
}

// ─── Factory ──────────────────────────────────────────────────

export function createChessboardPropConfigurable(
  stage: Stage,
  placement: StagePlacement,
  userConfig?: ChessboardConfig,
): ChessboardPropController {
  const svgNS = "http://www.w3.org/2000/svg";

  // Resolve config with defaults
  const cfg: Required<ChessboardConfig> = {
    width: 500,
    thickness: 20,
    topWidth: 300,
    bottomWidth: 450,
    topY: 40,
    bottomY: 180,
    lightColor: "#D1D5DB",
    darkColor: "#9CA3AF",
    edgeColor: "#4B5563",
    orientation: "front",
    ...userConfig,
  };

  const geo = makeGeometry(cfg);

  // ── Stage wrapper ─────────────────────────────────────────
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  const wrapperWidth = stage.resolveWidth
    ? stage.resolveWidth(cfg.width)
    : cfg.width;
  const wrapperHeight = stage.resolveHeight
    ? stage.resolveHeight(geo.totalHeight)
    : geo.totalHeight;
  wrapper.style.width = `${wrapperWidth}px`;
  wrapper.style.height = `${wrapperHeight}px`;

  const proj = stage.project(placement.z);
  const stageX = stage.referenceWidth
    ? stage.resolveX(placement.x)
    : placement.x;
  wrapper.style.left = `${stageX}px`;
  wrapper.style.top = `${proj.top}px`;
  wrapper.style.transform = `scale(${proj.scale})`;
  wrapper.style.transformOrigin = "bottom center";
  wrapper.style.zIndex = Math.round(proj.zIndex).toString();

  // Insert before balloon layer
  stage.container.insertBefore(wrapper, stage.container.lastElementChild);

  // ── SVG root ──────────────────────────────────────────────
  const svgElement = document.createElementNS(svgNS, "svg");
  svgElement.setAttribute(
    "viewBox",
    `0 0 ${cfg.width} ${geo.totalHeight}`,
  );
  svgElement.style.width = "100%";
  svgElement.style.height = "100%";
  svgElement.style.overflow = "visible";
  wrapper.appendChild(svgElement);

  const g = document.createElementNS(svgNS, "g");
  svgElement.appendChild(g);

  // ── Draw board outline ────────────────────────────────────
  const boardOutline = document.createElementNS(svgNS, "polygon");
  boardOutline.setAttribute(
    "points",
    [
      `${geo.getX(0, 0)},${geo.getY(0)}`,
      `${geo.getX(geo.cols, 0)},${geo.getY(0)}`,
      `${geo.getX(geo.cols, geo.rows)},${geo.getY(geo.rows)}`,
      `${geo.getX(0, geo.rows)},${geo.getY(geo.rows)}`,
    ].join(" "),
  );
  boardOutline.setAttribute("stroke", "rgba(0,0,0,0.2)");
  boardOutline.setAttribute("stroke-width", "1");
  boardOutline.setAttribute("fill", "none");
  g.appendChild(boardOutline);

  // ── Draw squares ──────────────────────────────────────────
  const squaresGroup = document.createElementNS(svgNS, "g");
  g.appendChild(squaresGroup);

  for (let r = 0; r < geo.rows; r++) {
    for (let c = 0; c < geo.cols; c++) {
      // Determine color based on orientation so the board pattern
      // stays consistent when rotated.
      const fill =
        (r + c) % 2 === 0 ? cfg.lightColor : cfg.darkColor;
      const [tl, tr, br, bl] = geo.getCellCorners(r, c);
      const poly = document.createElementNS(svgNS, "polygon");
      poly.setAttribute(
        "points",
        `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`,
      );
      poly.setAttribute("fill", fill);
      squaresGroup.appendChild(poly);
    }
  }

  // ── Front edge (3D depth) ─────────────────────────────────
  const edgeY = geo.getY(geo.rows);
  const edgePoly = document.createElementNS(svgNS, "polygon");
  edgePoly.setAttribute(
    "points",
    [
      `${geo.getX(0, geo.rows)},${edgeY}`,
      `${geo.getX(geo.cols, geo.rows)},${edgeY}`,
      `${geo.getX(geo.cols, geo.rows)},${edgeY + cfg.thickness}`,
      `${geo.getX(0, geo.rows)},${edgeY + cfg.thickness}`,
    ].join(" "),
  );
  edgePoly.setAttribute("fill", cfg.edgeColor);
  g.appendChild(edgePoly);

  // Bottom edge line
  const edgeLine = document.createElementNS(svgNS, "line");
  edgeLine.setAttribute("x1", geo.getX(0, geo.rows).toString());
  edgeLine.setAttribute("y1", (edgeY + cfg.thickness).toString());
  edgeLine.setAttribute("x2", geo.getX(geo.cols, geo.rows).toString());
  edgeLine.setAttribute("y2", (edgeY + cfg.thickness).toString());
  edgeLine.setAttribute("stroke", "rgba(0,0,0,0.3)");
  edgeLine.setAttribute("stroke-width", "1");
  g.appendChild(edgeLine);

  // ── Pieces layer ──────────────────────────────────────────
  const piecesGroup = document.createElementNS(svgNS, "g");
  g.appendChild(piecesGroup);

  // ── Define anchors ────────────────────────────────────────
  const boardCenterLocal = geo.getCellCenter(4, 4);
  const frontEdge: Point = {
    x: cfg.width / 2,
    y: geo.getY(geo.rows) + cfg.thickness / 2,
  };
  const backEdge: Point = {
    x: cfg.width / 2,
    y: geo.getY(0),
  };

  // Seat positions: to the left and right of the board, at mid-depth
  const leftSeat: Point = {
    x: geo.getX(0, 4) - 40,
    y: geo.getY(4),
  };
  const rightSeat: Point = {
    x: geo.getX(geo.cols, 4) + 40,
    y: geo.getY(4),
  };

  const anchors: Record<ChessboardAnchor, Point> = {
    boardCenter: boardCenterLocal,
    frontEdgeCenter: frontEdge,
    backEdgeCenter: backEdge,
    leftSeat,
    rightSeat,
  };

  const elements: PropElements<ChessboardAnchor> = {
    svg: g,
    anchors,
    width: cfg.width,
    height: geo.totalHeight,
  };

  return new ChessboardPropControllerImpl(
    stage,
    placement,
    wrapper,
    elements,
    cfg,
    piecesGroup,
  );
}

/**
 * Default factory (StagedPropFactory-compatible) using default config.
 */
export const createChessboardProp: StagedPropFactory<ChessboardPropController> =
  (stage, placement) => createChessboardPropConfigurable(stage, placement);
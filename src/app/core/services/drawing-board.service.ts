import { Injectable, computed, signal } from '@angular/core';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadString } from 'firebase/storage';
import {
  DRAWING_BOARD_DEFINITIONS,
  DEFAULT_DRAWING_BOARD_TYPE,
  DEFAULT_DRAWING_BOARD_WIDTH,
  DEFAULT_DRAWING_BOARD_HEIGHT,
} from '../constants/drawing-board.constant';
import { firebaseAuth, firestore, firebaseStorage } from '../firebase/firebase.config';
import {
  DrawingStroke,
  DrawingBoardModel,
  DrawingBoardType,
  DrawingBoardDefinition,
} from '../models/drawring-board.model';
import {
  DrawingSticker,
  DrawingStickerDefinition,
  DrawingStickerTransform,
} from '../models/drawing-sticker.model';
import { DrawingSnip, DrawingSnipTransform } from '../models/drawing-snip.model';
interface DrawingBoardSnapshot {
  strokes: DrawingStroke[];
  stickers: DrawingSticker[];
  snips: DrawingSnip[];
}
interface DrawingBoardHistory {
  undo: DrawingBoardSnapshot[];
  redo: DrawingBoardSnapshot[];
}
@Injectable({
  providedIn: 'root',
})
export class DrawingBoardService {
  readonly boards = signal<DrawingBoardModel[]>([]);
  readonly definitions = DRAWING_BOARD_DEFINITIONS;
  readonly boardCount = computed(() => this.boards().length);
  private readonly loadingSignal = signal(true);
  readonly loading = this.loadingSignal.asReadonly();
  private readonly histories = new Map<string, DrawingBoardHistory>();
  private readonly stickerTransformStarts = new Map<string, DrawingBoardSnapshot>();
  private readonly snipTransformStarts = new Map<string, DrawingBoardSnapshot>();
  private currentUid: string | null = null;
  constructor() {
    onAuthStateChanged(firebaseAuth, (user) => {
      void this.handleAuthState(user);
    });
  }
  async reload(): Promise<void> {
    const uid = this.currentUid ?? firebaseAuth.currentUser?.uid ?? null;
    if (!uid) {
      this.boards.set([]);
      this.histories.clear();
      return;
    }
    this.currentUid = uid;
    this.loadingSignal.set(true);
    try {
      await this.loadBoards();
    } finally {
      this.loadingSignal.set(false);
    }
  }
  getBoardById(id: string): DrawingBoardModel | undefined {
    return this.boards().find((board) => board.id === id);
  }
  getBoardsByBoardId(boardId: string): DrawingBoardModel[] {
    return this.boards().filter((drawingBoard) => drawingBoard.boardId === boardId);
  }
  getDefinition(type: DrawingBoardType): DrawingBoardDefinition {
    return (
      this.definitions.find((definition) => definition.type === type) ||
      this.definitions.find((definition) => definition.type === DEFAULT_DRAWING_BOARD_TYPE)!
    );
  }
  createBoard(
    boardId: string,
    type: DrawingBoardType = DEFAULT_DRAWING_BOARD_TYPE,
    name?: string,
  ): DrawingBoardModel {
    const definition = this.getDefinition(type);
    const now = new Date();
    const drawingBoard: DrawingBoardModel = {
      id: crypto.randomUUID(),
      boardId,
      name: name?.trim() || definition.name,
      type,
      strokes: [],
      stickers: [],
      snips: [],
      width: DEFAULT_DRAWING_BOARD_WIDTH,
      height: DEFAULT_DRAWING_BOARD_HEIGHT,
      createdAt: now,
      updatedAt: now,
    };
    this.boards.update((boards) => [...boards, drawingBoard]);
    this.histories.set(drawingBoard.id, {
      undo: [],
      redo: [],
    });
    void this.saveBoard(drawingBoard);
    return drawingBoard;
  }
  updateBoard(id: string, changes: Partial<DrawingBoardModel>): void {
    const board = this.getBoardById(id);
    if (!board) return;
    const updated: DrawingBoardModel = {
      ...board,
      ...changes,
      id: board.id,
      boardId: board.boardId,
      updatedAt: new Date(),
    };
    this.replaceBoard(updated);
  }
  renameBoard(id: string, name: string): void {
    const value = name.trim();
    if (!value) return;
    this.updateBoard(id, { name: value });
  }
  changeBoardType(id: string, type: DrawingBoardType): void {
    const board = this.getBoardById(id);
    if (!board || board.type === type) return;
    this.updateBoard(id, { type });
  }
  resizeBoard(id: string, width: number, height: number): void {
    this.updateBoard(id, {
      width: Math.max(400, width),
      height: Math.max(300, height),
    });
  }
  deleteBoard(id: string): void {
    const board = this.getBoardById(id);
    if (!board) return;
    this.boards.update((boards) => boards.filter((item) => item.id !== id));
    this.histories.delete(id);
    this.clearTransformStarts(id);
    void this.deleteBoardFromFirebase(board);
  }
  addStroke(boardId: string, stroke: DrawingStroke): void {
    const board = this.getBoardById(boardId);
    if (!board || stroke.points.length < 1) return;
    this.pushHistory(boardId, board);
    this.setStrokes(boardId, [...board.strokes, this.cloneStroke(stroke)]);
    this.clearRedo(boardId);
  }
  replaceStrokes(boardId: string, strokes: DrawingStroke[]): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    this.pushHistory(boardId, board);
    this.setStrokes(boardId, strokes);
    this.clearRedo(boardId);
  }
  clearBoard(boardId: string): void {
    const board = this.getBoardById(boardId);
    if (!board || (!board.strokes.length && !board.stickers.length && !board.snips.length)) return;
    this.pushHistory(boardId, board);
    const oldSnips = [...board.snips];
    this.setBoardContent(boardId, [], [], []);
    this.clearRedo(boardId);
    void this.deleteSnipImages(board, oldSnips);
  }
  addSticker(
    boardId: string,
    definition: DrawingStickerDefinition,
    x?: number,
    y?: number,
  ): DrawingSticker | undefined {
    const board = this.getBoardById(boardId);
    if (!board) return undefined;
    this.pushHistory(boardId, board);
    const width = definition.defaultWidth;
    const height = definition.defaultHeight;
    const maxZIndex = this.getMaxObjectZIndex(board);
    const now = Date.now();
    const sticker: DrawingSticker = {
      id: crypto.randomUUID(),
      definitionId: definition.id,
      type: definition.type,
      category: definition.category,
      name: definition.name,
      value: definition.value,
      x: x ?? Math.max(0, board.width / 2 - width / 2),
      y: y ?? Math.max(0, board.height / 2 - height / 2),
      width,
      height,
      rotation: 0,
      zIndex: maxZIndex + 1,
      createdAt: now,
      updatedAt: now,
    };
    this.setStickers(boardId, [...board.stickers, sticker]);
    this.clearRedo(boardId);
    return sticker;
  }
  beginStickerTransform(boardId: string, stickerId: string): void {
    const board = this.getBoardById(boardId);
    if (!board || !board.stickers.some((sticker) => sticker.id === stickerId)) return;
    const key = this.getTransformKey(boardId, stickerId);
    if (this.stickerTransformStarts.has(key)) return;
    this.stickerTransformStarts.set(key, this.createSnapshot(board));
  }
  transformSticker(boardId: string, stickerId: string, transform: DrawingStickerTransform): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const sticker = board.stickers.find((item) => item.id === stickerId);
    if (!sticker) return;
    const width = Math.max(24, Math.min(320, transform.width));
    const height = Math.max(24, Math.min(320, transform.height));
    const x = Math.max(-width + 20, Math.min(board.width - 20, transform.x));
    const y = Math.max(-height + 20, Math.min(board.height - 20, transform.y));
    this.setStickers(
      boardId,
      board.stickers.map((item) =>
        item.id === stickerId
          ? {
              ...item,
              x,
              y,
              width,
              height,
              rotation: this.normalizeRotation(transform.rotation),
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
  }
  endStickerTransform(boardId: string, stickerId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const key = this.getTransformKey(boardId, stickerId);
    const start = this.stickerTransformStarts.get(key);
    this.stickerTransformStarts.delete(key);
    if (!start) return;
    const before = start.stickers.find((sticker) => sticker.id === stickerId);
    const after = board.stickers.find((sticker) => sticker.id === stickerId);
    if (!before || !after || this.sameStickerTransform(before, after)) return;
    this.pushSnapshot(boardId, start);
    this.clearRedo(boardId);
  }
  duplicateSticker(boardId: string, stickerId: string): DrawingSticker | undefined {
    const board = this.getBoardById(boardId);
    if (!board) return undefined;
    const source = board.stickers.find((sticker) => sticker.id === stickerId);
    if (!source) return undefined;
    this.pushHistory(boardId, board);
    const maxZIndex = this.getMaxObjectZIndex(board);
    const now = Date.now();
    const duplicate: DrawingSticker = {
      ...source,
      id: crypto.randomUUID(),
      x: Math.min(board.width - 20, source.x + 24),
      y: Math.min(board.height - 20, source.y + 24),
      zIndex: maxZIndex + 1,
      createdAt: now,
      updatedAt: now,
    };
    this.setStickers(boardId, [...board.stickers, duplicate]);
    this.clearRedo(boardId);
    return duplicate;
  }
  deleteSticker(boardId: string, stickerId: string): void {
    const board = this.getBoardById(boardId);
    if (!board || !board.stickers.some((sticker) => sticker.id === stickerId)) return;
    this.pushHistory(boardId, board);
    this.setStickers(
      boardId,
      board.stickers.filter((sticker) => sticker.id !== stickerId),
    );
    this.stickerTransformStarts.delete(this.getTransformKey(boardId, stickerId));
    this.clearRedo(boardId);
  }
  bringStickerForward(boardId: string, stickerId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const sticker = board.stickers.find((item) => item.id === stickerId);
    if (!sticker) return;
    const ordered = [...board.stickers].sort((a, b) => a.zIndex - b.zIndex);
    const index = ordered.findIndex((item) => item.id === stickerId);
    if (index < 0 || index === ordered.length - 1) return;
    this.pushHistory(boardId, board);
    const next = ordered[index + 1];
    const currentZ = sticker.zIndex;
    const nextZ = next.zIndex;
    this.setStickers(
      boardId,
      board.stickers.map((item) => {
        if (item.id === sticker.id) return { ...item, zIndex: nextZ, updatedAt: Date.now() };
        if (item.id === next.id) return { ...item, zIndex: currentZ, updatedAt: Date.now() };
        return item;
      }),
    );
    this.clearRedo(boardId);
  }
  sendStickerBackward(boardId: string, stickerId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const sticker = board.stickers.find((item) => item.id === stickerId);
    if (!sticker) return;
    const ordered = [...board.stickers].sort((a, b) => a.zIndex - b.zIndex);
    const index = ordered.findIndex((item) => item.id === stickerId);
    if (index <= 0) return;
    this.pushHistory(boardId, board);
    const previous = ordered[index - 1];
    const currentZ = sticker.zIndex;
    const previousZ = previous.zIndex;
    this.setStickers(
      boardId,
      board.stickers.map((item) => {
        if (item.id === sticker.id) return { ...item, zIndex: previousZ, updatedAt: Date.now() };
        if (item.id === previous.id) return { ...item, zIndex: currentZ, updatedAt: Date.now() };
        return item;
      }),
    );
    this.clearRedo(boardId);
  }
  addSnip(
    boardId: string,
    imageData: string,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    x?: number,
    y?: number,
  ): DrawingSnip | undefined {
    const board = this.getBoardById(boardId);
    if (!board || !imageData || sourceWidth <= 0 || sourceHeight <= 0) return undefined;
    this.pushHistory(boardId, board);
    const maxZIndex = this.getMaxObjectZIndex(board);
    const now = Date.now();
    const snip: DrawingSnip = {
      id: crypto.randomUUID(),
      imageData,
      x: x ?? Math.max(0, Math.min(board.width - sourceWidth, sourceX)),
      y: y ?? Math.max(0, Math.min(board.height - sourceHeight, sourceY)),
      width: sourceWidth,
      height: sourceHeight,
      rotation: 0,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      zIndex: maxZIndex + 1,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    this.setSnips(boardId, [...board.snips, snip]);
    this.clearRedo(boardId);
    void this.uploadSnip(board, snip);
    return snip;
  }
  beginSnipTransform(boardId: string, snipId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const snip = board.snips.find((item) => item.id === snipId);
    if (!snip || snip.pinned) return;
    const key = this.getTransformKey(boardId, snipId);
    if (this.snipTransformStarts.has(key)) return;
    this.snipTransformStarts.set(key, this.createSnapshot(board));
  }
  transformSnip(boardId: string, snipId: string, transform: DrawingSnipTransform): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const snip = board.snips.find((item) => item.id === snipId);
    if (!snip || snip.pinned) return;
    const ratio = snip.sourceWidth / Math.max(1, snip.sourceHeight);
    let width = Math.max(48, Math.min(board.width * 2, transform.width));
    let height = width / ratio;
    if (height > board.height * 2) {
      height = board.height * 2;
      width = height * ratio;
    }
    const x = Math.max(-width + 24, Math.min(board.width - 24, transform.x));
    const y = Math.max(-height + 24, Math.min(board.height - 24, transform.y));
    this.setSnips(
      boardId,
      board.snips.map((item) =>
        item.id === snipId
          ? {
              ...item,
              x,
              y,
              width,
              height,
              rotation: this.normalizeRotation(transform.rotation),
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
  }
  endSnipTransform(boardId: string, snipId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const key = this.getTransformKey(boardId, snipId);
    const start = this.snipTransformStarts.get(key);
    this.snipTransformStarts.delete(key);
    if (!start) return;
    const before = start.snips.find((snip) => snip.id === snipId);
    const after = board.snips.find((snip) => snip.id === snipId);
    if (!before || !after || this.sameSnipTransform(before, after)) return;
    this.pushSnapshot(boardId, start);
    this.clearRedo(boardId);
  }
  toggleSnipPinned(boardId: string, snipId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const snip = board.snips.find((item) => item.id === snipId);
    if (!snip) return;
    this.pushHistory(boardId, board);
    this.snipTransformStarts.delete(this.getTransformKey(boardId, snipId));
    this.setSnips(
      boardId,
      board.snips.map((item) =>
        item.id === snipId
          ? {
              ...item,
              pinned: !item.pinned,
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
    this.clearRedo(boardId);
  }
  deleteSnip(boardId: string, snipId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const snip = board.snips.find((item) => item.id === snipId);
    if (!snip) return;
    this.pushHistory(boardId, board);
    this.setSnips(
      boardId,
      board.snips.filter((item) => item.id !== snipId),
    );
    this.snipTransformStarts.delete(this.getTransformKey(boardId, snipId));
    this.clearRedo(boardId);
    void this.deleteSnipImage(board, snipId);
  }
  bringSnipForward(boardId: string, snipId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const snip = board.snips.find((item) => item.id === snipId);
    if (!snip) return;
    const objects = [
      ...board.stickers.map((item) => ({
        type: 'sticker' as const,
        id: item.id,
        zIndex: item.zIndex,
      })),
      ...board.snips.map((item) => ({
        type: 'snip' as const,
        id: item.id,
        zIndex: item.zIndex,
      })),
    ].sort((a, b) => a.zIndex - b.zIndex);
    const index = objects.findIndex((item) => item.type === 'snip' && item.id === snipId);
    if (index < 0 || index === objects.length - 1) return;
    const next = objects[index + 1];
    this.pushHistory(boardId, board);
    const currentZ = snip.zIndex;
    const nextZ = next.zIndex;
    this.setObjectZIndexes(boardId, snipId, 'snip', next.id, next.type, nextZ, currentZ);
    this.clearRedo(boardId);
  }
  sendSnipBackward(boardId: string, snipId: string): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const snip = board.snips.find((item) => item.id === snipId);
    if (!snip) return;
    const objects = [
      ...board.stickers.map((item) => ({
        type: 'sticker' as const,
        id: item.id,
        zIndex: item.zIndex,
      })),
      ...board.snips.map((item) => ({
        type: 'snip' as const,
        id: item.id,
        zIndex: item.zIndex,
      })),
    ].sort((a, b) => a.zIndex - b.zIndex);
    const index = objects.findIndex((item) => item.type === 'snip' && item.id === snipId);
    if (index <= 0) return;
    const previous = objects[index - 1];
    this.pushHistory(boardId, board);
    const currentZ = snip.zIndex;
    const previousZ = previous.zIndex;
    this.setObjectZIndexes(
      boardId,
      snipId,
      'snip',
      previous.id,
      previous.type,
      previousZ,
      currentZ,
    );
    this.clearRedo(boardId);
  }
  undo(boardId: string): void {
    const board = this.getBoardById(boardId);
    const history = this.getHistory(boardId);
    if (!board || !history.undo.length) return;
    const previous = history.undo.pop()!;
    history.redo.push(this.createSnapshot(board));
    this.setBoardContent(boardId, previous.strokes, previous.stickers, previous.snips);
    this.clearTransformStarts(boardId);
  }
  redo(boardId: string): void {
    const board = this.getBoardById(boardId);
    const history = this.getHistory(boardId);
    if (!board || !history.redo.length) return;
    const next = history.redo.pop()!;
    history.undo.push(this.createSnapshot(board));
    this.setBoardContent(boardId, next.strokes, next.stickers, next.snips);
    this.clearTransformStarts(boardId);
  }
  canUndo(boardId: string): boolean {
    return this.getHistory(boardId).undo.length > 0;
  }
  canRedo(boardId: string): boolean {
    return this.getHistory(boardId).redo.length > 0;
  }
  createStroke(boardType: DrawingBoardType, color?: string, size?: number): DrawingStroke {
    const definition = this.getDefinition(boardType);
    return {
      id: crypto.randomUUID(),
      tool: definition.tool.type,
      color: color || definition.tool.defaultColor,
      size: size || definition.tool.defaultSize,
      opacity: definition.tool.opacity,
      cap: definition.tool.cap,
      points: [],
      createdAt: Date.now(),
    };
  }
  private setStrokes(boardId: string, strokes: DrawingStroke[]): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    this.replaceBoard({
      ...board,
      strokes: this.cloneStrokes(strokes),
      updatedAt: new Date(),
    });
  }
  private setStickers(boardId: string, stickers: DrawingSticker[]): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    this.replaceBoard({
      ...board,
      stickers: this.cloneStickers(stickers),
      updatedAt: new Date(),
    });
  }
  private setSnips(boardId: string, snips: DrawingSnip[]): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    this.replaceBoard({
      ...board,
      snips: this.cloneSnips(snips),
      updatedAt: new Date(),
    });
  }
  private setBoardContent(
    boardId: string,
    strokes: DrawingStroke[],
    stickers: DrawingSticker[],
    snips: DrawingSnip[],
  ): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    this.replaceBoard({
      ...board,
      strokes: this.cloneStrokes(strokes),
      stickers: this.cloneStickers(stickers),
      snips: this.cloneSnips(snips),
      updatedAt: new Date(),
    });
  }
  private setObjectZIndexes(
    boardId: string,
    firstId: string,
    firstType: 'sticker' | 'snip',
    secondId: string,
    secondType: 'sticker' | 'snip',
    firstZ: number,
    secondZ: number,
  ): void {
    const board = this.getBoardById(boardId);
    if (!board) return;
    const now = Date.now();
    const stickers = board.stickers.map((sticker) => {
      if (firstType === 'sticker' && sticker.id === firstId)
        return { ...sticker, zIndex: firstZ, updatedAt: now };
      if (secondType === 'sticker' && sticker.id === secondId)
        return { ...sticker, zIndex: secondZ, updatedAt: now };
      return sticker;
    });
    const snips = board.snips.map((snip) => {
      if (firstType === 'snip' && snip.id === firstId)
        return { ...snip, zIndex: firstZ, updatedAt: now };
      if (secondType === 'snip' && snip.id === secondId)
        return { ...snip, zIndex: secondZ, updatedAt: now };
      return snip;
    });
    this.replaceBoard({
      ...board,
      stickers: this.cloneStickers(stickers),
      snips: this.cloneSnips(snips),
      updatedAt: new Date(),
    });
  }
  private replaceBoard(board: DrawingBoardModel): void {
    this.boards.update((boards) => boards.map((item) => (item.id === board.id ? board : item)));
    void this.saveBoard(board);
  }
  private async handleAuthState(user: User | null): Promise<void> {
    this.loadingSignal.set(true);
    if (!user) {
      this.currentUid = null;
      this.boards.set([]);
      this.histories.clear();
      this.stickerTransformStarts.clear();
      this.snipTransformStarts.clear();
      this.loadingSignal.set(false);
      return;
    }
    this.currentUid = user.uid;
    try {
      await this.loadBoards();
    } catch (error) {
      console.error('Failed to load drawing boards from Firestore.', error);
      this.boards.set([]);
    } finally {
      this.loadingSignal.set(false);
    }
  }
  private async loadBoards(): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    const drawingBoardsRef = collection(firestore, 'users', uid, 'drawingBoards');
    const snapshot = await getDocs(drawingBoardsRef);
    const boards = await Promise.all(
      snapshot.docs.map(async (snapshotDoc) =>
        this.fromFirestore(snapshotDoc.id, snapshotDoc.data()),
      ),
    );
    this.boards.set(boards.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
    this.histories.clear();
    for (const board of boards) {
      this.histories.set(board.id, {
        undo: [],
        redo: [],
      });
    }
  }
  private async saveBoard(board: DrawingBoardModel): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    try {
      const boardRef = doc(firestore, 'users', uid, 'drawingBoards', board.id);
      await setDoc(boardRef, this.toFirestore(board));
    } catch (error) {
      console.error(`Failed to save drawing board "${board.id}".`, error);
    }
  }
  private async deleteBoardFromFirebase(board: DrawingBoardModel): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    try {
      await Promise.all(board.snips.map((snip) => this.deleteSnipImage(board, snip.id)));
      await deleteDoc(doc(firestore, 'users', uid, 'drawingBoards', board.id));
    } catch (error) {
      console.error(`Failed to delete drawing board "${board.id}".`, error);
    }
  }
  private toFirestore(board: DrawingBoardModel): Record<string, unknown> {
    return {
      boardId: board.boardId,
      name: board.name,
      type: board.type,
      strokes: this.cloneStrokes(board.strokes),
      stickers: this.cloneStickers(board.stickers),
      snips: board.snips.map((snip) => ({
        id: snip.id,
        x: snip.x,
        y: snip.y,
        width: snip.width,
        height: snip.height,
        rotation: snip.rotation,
        sourceX: snip.sourceX,
        sourceY: snip.sourceY,
        sourceWidth: snip.sourceWidth,
        sourceHeight: snip.sourceHeight,
        zIndex: snip.zIndex,
        pinned: snip.pinned,
        createdAt: snip.createdAt,
        updatedAt: snip.updatedAt,
      })),
      width: board.width,
      height: board.height,
      createdAt: Timestamp.fromDate(board.createdAt),
      updatedAt: Timestamp.fromDate(board.updatedAt),
    };
  }
  private async fromFirestore(id: string, data: Record<string, any>): Promise<DrawingBoardModel> {
    const boardId = data['boardId'] || '';
    const rawSnips = Array.isArray(data['snips']) ? data['snips'] : [];
    const snips = await Promise.all(
      rawSnips.map(async (snip: Record<string, any>) => {
        let imageData = '';
        try {
          imageData = await getDownloadURL(
            ref(firebaseStorage, this.getSnipStoragePath(boardId, id, snip['id'])),
          );
        } catch {
          imageData = '';
        }
        return {
          id: snip['id'] || crypto.randomUUID(),
          imageData,
          x: typeof snip['x'] === 'number' ? snip['x'] : 0,
          y: typeof snip['y'] === 'number' ? snip['y'] : 0,
          width: typeof snip['width'] === 'number' ? snip['width'] : 100,
          height: typeof snip['height'] === 'number' ? snip['height'] : 100,
          rotation: typeof snip['rotation'] === 'number' ? snip['rotation'] : 0,
          sourceX: typeof snip['sourceX'] === 'number' ? snip['sourceX'] : 0,
          sourceY: typeof snip['sourceY'] === 'number' ? snip['sourceY'] : 0,
          sourceWidth: typeof snip['sourceWidth'] === 'number' ? snip['sourceWidth'] : 100,
          sourceHeight: typeof snip['sourceHeight'] === 'number' ? snip['sourceHeight'] : 100,
          zIndex: typeof snip['zIndex'] === 'number' ? snip['zIndex'] : 1,
          pinned: Boolean(snip['pinned']),
          createdAt: typeof snip['createdAt'] === 'number' ? snip['createdAt'] : Date.now(),
          updatedAt: typeof snip['updatedAt'] === 'number' ? snip['updatedAt'] : Date.now(),
        } as DrawingSnip;
      }),
    );
    return {
      id,
      boardId,
      name: data['name'] || 'Drawing Board',
      type: (data['type'] || DEFAULT_DRAWING_BOARD_TYPE) as DrawingBoardType,
      strokes: Array.isArray(data['strokes'])
        ? this.cloneStrokes(data['strokes'] as DrawingStroke[])
        : [],
      stickers: Array.isArray(data['stickers'])
        ? this.cloneStickers(data['stickers'] as DrawingSticker[])
        : [],
      snips,
      width: typeof data['width'] === 'number' ? data['width'] : DEFAULT_DRAWING_BOARD_WIDTH,
      height: typeof data['height'] === 'number' ? data['height'] : DEFAULT_DRAWING_BOARD_HEIGHT,
      createdAt: this.toDate(data['createdAt']),
      updatedAt: this.toDate(data['updatedAt']),
    };
  }
  private async uploadSnip(board: DrawingBoardModel, snip: DrawingSnip): Promise<void> {
    const uid = this.currentUid;
    if (!uid || !snip.imageData) return;
    try {
      const storageRef = ref(
        firebaseStorage,
        this.getSnipStoragePath(board.boardId, board.id, snip.id),
      );
      await uploadString(storageRef, snip.imageData, 'data_url');
      const downloadURL = await getDownloadURL(storageRef);
      const currentBoard = this.getBoardById(board.id);
      if (!currentBoard) return;
      const currentSnip = currentBoard.snips.find((item) => item.id === snip.id);
      if (!currentSnip) return;
      const updatedSnips = currentBoard.snips.map((item) =>
        item.id === snip.id
          ? {
              ...item,
              imageData: downloadURL,
              updatedAt: Date.now(),
            }
          : item,
      );
      this.boards.update((boards) =>
        boards.map((item) =>
          item.id === board.id
            ? {
                ...item,
                snips: updatedSnips,
                updatedAt: new Date(),
              }
            : item,
        ),
      );
      const updatedBoard = this.getBoardById(board.id);
      if (updatedBoard) await this.saveBoard(updatedBoard);
    } catch (error) {
      console.error(`Failed to upload snip "${snip.id}".`, error);
    }
  }
  private async deleteSnipImage(board: DrawingBoardModel, snipId: string): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    try {
      await deleteObject(
        ref(firebaseStorage, this.getSnipStoragePath(board.boardId, board.id, snipId)),
      );
    } catch (error: any) {
      if (error?.code !== 'storage/object-not-found') {
        console.error(`Failed to delete snip image "${snipId}".`, error);
      }
    }
  }
  private async deleteSnipImages(board: DrawingBoardModel, snips: DrawingSnip[]): Promise<void> {
    await Promise.all(snips.map((snip) => this.deleteSnipImage(board, snip.id)));
  }
  private getSnipStoragePath(
    parentBoardId: string,
    drawingBoardId: string,
    snipId: string,
  ): string {
    return `users/${this.currentUid}/drawings/${parentBoardId}/${drawingBoardId}/snips/${snipId}.png`;
  }
  private pushHistory(boardId: string, board: DrawingBoardModel): void {
    this.pushSnapshot(boardId, this.createSnapshot(board));
  }
  private pushSnapshot(boardId: string, snapshot: DrawingBoardSnapshot): void {
    const history = this.getHistory(boardId);
    history.undo.push(this.cloneSnapshot(snapshot));
    if (history.undo.length > 50) history.undo.shift();
  }
  private clearRedo(boardId: string): void {
    this.getHistory(boardId).redo = [];
  }
  private getHistory(boardId: string): DrawingBoardHistory {
    let history = this.histories.get(boardId);
    if (!history) {
      history = {
        undo: [],
        redo: [],
      };
      this.histories.set(boardId, history);
    }
    return history;
  }
  private createSnapshot(board: DrawingBoardModel): DrawingBoardSnapshot {
    return {
      strokes: this.cloneStrokes(board.strokes),
      stickers: this.cloneStickers(board.stickers),
      snips: this.cloneSnips(board.snips),
    };
  }
  private cloneSnapshot(snapshot: DrawingBoardSnapshot): DrawingBoardSnapshot {
    return {
      strokes: this.cloneStrokes(snapshot.strokes),
      stickers: this.cloneStickers(snapshot.stickers),
      snips: this.cloneSnips(snapshot.snips),
    };
  }
  private cloneStickers(stickers: DrawingSticker[]): DrawingSticker[] {
    return stickers.map((sticker) => ({ ...sticker }));
  }
  private cloneSnips(snips: DrawingSnip[]): DrawingSnip[] {
    return snips.map((snip) => ({ ...snip }));
  }
  private cloneStrokes(strokes: DrawingStroke[]): DrawingStroke[] {
    return strokes.map((stroke) => this.cloneStroke(stroke));
  }
  private cloneStroke(stroke: DrawingStroke): DrawingStroke {
    return {
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    };
  }
  private getMaxObjectZIndex(board: DrawingBoardModel): number {
    const stickerMax = board.stickers.reduce(
      (highest, sticker) => Math.max(highest, sticker.zIndex),
      0,
    );
    const snipMax = board.snips.reduce((highest, snip) => Math.max(highest, snip.zIndex), 0);
    return Math.max(stickerMax, snipMax);
  }
  private getTransformKey(boardId: string, objectId: string): string {
    return `${boardId}:${objectId}`;
  }
  private clearTransformStarts(boardId: string): void {
    for (const key of this.stickerTransformStarts.keys()) {
      if (key.startsWith(`${boardId}:`)) this.stickerTransformStarts.delete(key);
    }
    for (const key of this.snipTransformStarts.keys()) {
      if (key.startsWith(`${boardId}:`)) this.snipTransformStarts.delete(key);
    }
  }
  private sameStickerTransform(a: DrawingSticker, b: DrawingSticker): boolean {
    return (
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height &&
      a.rotation === b.rotation
    );
  }
  private sameSnipTransform(a: DrawingSnip, b: DrawingSnip): boolean {
    return (
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height &&
      a.rotation === b.rotation
    );
  }
  private normalizeRotation(rotation: number): number {
    let value = rotation % 360;
    if (value > 180) value -= 360;
    if (value < -180) value += 360;
    return value;
  }
  private toDate(value: unknown): Date {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    return new Date();
  }
}

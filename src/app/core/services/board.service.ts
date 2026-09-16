import { computed, Injectable, signal } from '@angular/core';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { DEFAULT_BOARD_DESIGN_ID } from '../constants/board-designs.constant';
import { firebaseAuth, firestore } from '../firebase/firebase.config';
import { BoardColor, BoardModel, DEFAULT_BOARD_ID } from '../models/board.model';
@Injectable({
  providedIn: 'root',
})
export class BoardService {
  private readonly storageKey = 'notiva-boards';
  private readonly boardsSignal = signal<BoardModel[]>([]);
  private readonly loadingSignal = signal(true);
  private readonly initializedSignal = signal(false);
  private currentUid: string | null = null;
  readonly boards = computed(() => this.boardsSignal());
  readonly favoriteBoards = computed(() => this.boardsSignal().filter((board) => board.favorite));
  readonly loading = this.loadingSignal.asReadonly();
  readonly initialized = this.initializedSignal.asReadonly();
  constructor() {
    onAuthStateChanged(firebaseAuth, (user) => void this.handleAuthState(user));
  }
  getBoardById(id: string): BoardModel | undefined {
    return this.boardsSignal().find((board) => board.id === id);
  }
  createBoard(
    name: string,
    description = '',
    color: BoardColor = 'violet',
    designId = DEFAULT_BOARD_DESIGN_ID,
  ): BoardModel {
    const now = new Date();
    const board: BoardModel = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Untitled Board',
      description: description.trim(),
      color,
      designId,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };
    this.boardsSignal.update((boards) => this.sortBoards([...boards, board]));
    void this.saveBoard(board);
    return board;
  }
  updateBoard(id: string, changes: Partial<BoardModel>): void {
    const existing = this.getBoardById(id);
    if (!existing) return;
    const updated: BoardModel = {
      ...existing,
      ...changes,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };
    this.boardsSignal.update((boards) =>
      this.sortBoards(boards.map((board) => (board.id === id ? updated : board))),
    );
    void this.saveBoard(updated);
  }
  updateBoardDesign(id: string, designId: string): void {
    this.updateBoard(id, { designId });
  }
  duplicateBoard(id: string): BoardModel | null {
    const source = this.getBoardById(id);
    if (!source) return null;
    const now = new Date();
    const duplicate: BoardModel = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} Copy`,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };
    this.boardsSignal.update((boards) => this.sortBoards([...boards, duplicate]));
    void this.duplicateBoardInFirestore(source.id, duplicate);
    return duplicate;
  }
  toggleFavorite(id: string): void {
    const board = this.getBoardById(id);
    if (!board) return;
    this.updateBoard(id, { favorite: !board.favorite });
  }
  touchBoard(id: string): void {
    const board = this.getBoardById(id);
    if (!board) return;
    const updated: BoardModel = {
      ...board,
      updatedAt: new Date(),
    };
    this.boardsSignal.update((boards) =>
      this.sortBoards(boards.map((item) => (item.id === id ? updated : item))),
    );
    void this.saveBoard(updated);
  }
  deleteBoard(id: string): void {
    if (id === DEFAULT_BOARD_ID) return;
    this.boardsSignal.update((boards) => boards.filter((board) => board.id !== id));
    void this.deleteBoardFromFirestore(id);
  }
  async reload(): Promise<void> {
    const uid = this.currentUid ?? firebaseAuth.currentUser?.uid ?? null;
    if (!uid) {
      this.currentUid = null;
      this.boardsSignal.set([]);
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
      return;
    }
    this.currentUid = uid;
    this.loadingSignal.set(true);
    try {
      await this.loadUserBoards();
    } catch (error) {
      console.error('Failed to reload boards from Firestore.', error);
    } finally {
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
    }
  }
  private async handleAuthState(user: User | null): Promise<void> {
    this.loadingSignal.set(true);
    this.initializedSignal.set(false);
    this.boardsSignal.set([]);
    if (!user) {
      this.currentUid = null;
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
      return;
    }
    this.currentUid = user.uid;
    try {
      await this.loadUserBoards();
    } catch (error) {
      console.error('Failed to load boards from Firestore.', error);
      this.boardsSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
    }
  }
  private async loadUserBoards(): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    const snapshot = await getDocs(collection(firestore, 'users', uid, 'boards'));
    if (uid !== this.currentUid) return;
    if (snapshot.empty) {
      await this.initializeUserBoards();
      return;
    }
    const boards = snapshot.docs.map((item) => this.fromFirestore(item.id, item.data()));
    if (!boards.some((board) => board.id === DEFAULT_BOARD_ID)) {
      const defaultBoard = this.createDefaultBoard();
      boards.unshift(defaultBoard);
      await this.saveBoard(defaultBoard);
    }
    if (uid !== this.currentUid) return;
    this.boardsSignal.set(this.sortBoards(boards));
    localStorage.removeItem(this.storageKey);
  }
  private async initializeUserBoards(): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    const localBoards = this.loadLocalBoards();
    const boards = localBoards.length ? localBoards : [this.createDefaultBoard()];
    if (!boards.some((board) => board.id === DEFAULT_BOARD_ID))
      boards.unshift(this.createDefaultBoard());
    if (uid !== this.currentUid) return;
    this.boardsSignal.set(this.sortBoards(boards));
    await this.saveBoards(boards);
    localStorage.removeItem(this.storageKey);
  }
  private loadLocalBoards(): BoardModel[] {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored) as Partial<BoardModel>[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((board) => this.normalizeBoard(board));
    } catch {
      return [];
    }
  }
  private createDefaultBoard(): BoardModel {
    const now = new Date();
    return {
      id: DEFAULT_BOARD_ID,
      name: 'My Notes',
      description: 'Your default Notiva board',
      color: 'violet',
      designId: DEFAULT_BOARD_DESIGN_ID,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };
  }
  private async saveBoard(board: BoardModel): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    try {
      await setDoc(doc(firestore, 'users', uid, 'boards', board.id), this.toFirestore(board));
    } catch (error) {
      console.error(`Failed to save board "${board.id}".`, error);
    }
  }
  private async saveBoards(boards: BoardModel[]): Promise<void> {
    const uid = this.currentUid;
    if (!uid || !boards.length) return;
    try {
      for (let index = 0; index < boards.length; index += 400) {
        const batch = writeBatch(firestore);
        boards.slice(index, index + 400).forEach((board) => {
          batch.set(doc(firestore, 'users', uid, 'boards', board.id), this.toFirestore(board));
        });
        await batch.commit();
      }
    } catch (error) {
      console.error('Failed to save boards to Firestore.', error);
      throw error;
    }
  }
  private async duplicateBoardInFirestore(sourceId: string, duplicate: BoardModel): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    try {
      await setDoc(
        doc(firestore, 'users', uid, 'boards', duplicate.id),
        this.toFirestore(duplicate),
      );
      const sourceNotes = await getDocs(
        collection(firestore, 'users', uid, 'boards', sourceId, 'notes'),
      );
      if (uid !== this.currentUid) return;
      for (let index = 0; index < sourceNotes.docs.length; index += 400) {
        const batch = writeBatch(firestore);
        sourceNotes.docs.slice(index, index + 400).forEach((sourceNote) => {
          const noteId = crypto.randomUUID();
          const data = {
            ...sourceNote.data(),
            id: noteId,
            boardId: duplicate.id,
            favorite: false,
            archived: false,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          };
          batch.set(
            doc(firestore, 'users', uid, 'boards', duplicate.id, 'notes', noteId),
            this.removeUndefined(data),
          );
        });
        await batch.commit();
      }
    } catch (error) {
      console.error(`Failed to duplicate board "${sourceId}".`, error);
    }
  }
  private async deleteBoardFromFirestore(id: string): Promise<void> {
    const uid = this.currentUid;
    if (!uid || id === DEFAULT_BOARD_ID) return;
    try {
      const notesSnapshot = await getDocs(
        collection(firestore, 'users', uid, 'boards', id, 'notes'),
      );
      for (let index = 0; index < notesSnapshot.docs.length; index += 400) {
        const batch = writeBatch(firestore);
        notesSnapshot.docs.slice(index, index + 400).forEach((item) => batch.delete(item.ref));
        await batch.commit();
      }
      await deleteDoc(doc(firestore, 'users', uid, 'boards', id));
    } catch (error) {
      console.error(`Failed to delete board "${id}".`, error);
    }
  }
  private toFirestore(board: BoardModel): Record<string, unknown> {
    return this.removeUndefined({
      name: board.name,
      description: board.description,
      color: board.color,
      designId: board.designId,
      favorite: board.favorite,
      createdAt: Timestamp.fromDate(board.createdAt),
      updatedAt: Timestamp.fromDate(board.updatedAt),
    });
  }
  private fromFirestore(id: string, data: Record<string, any>): BoardModel {
    return this.normalizeBoard({
      ...data,
      id,
    });
  }
  private normalizeBoard(board: Partial<BoardModel>): BoardModel {
    return {
      id: board.id || crypto.randomUUID(),
      name: board.name?.trim() || 'Untitled Board',
      description: board.description || '',
      color: board.color || 'violet',
      designId: board.designId || DEFAULT_BOARD_DESIGN_ID,
      favorite: Boolean(board.favorite),
      createdAt: this.toDate(board.createdAt),
      updatedAt: this.toDate(board.updatedAt),
    };
  }
  private toDate(value: unknown): Date {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    if (
      value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return new Date();
  }
  private removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  }
  private sortBoards(boards: BoardModel[]): BoardModel[] {
    return [...boards].sort((a, b) => {
      if (a.id === DEFAULT_BOARD_ID) return -1;
      if (b.id === DEFAULT_BOARD_ID) return 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }
}

import { computed, inject, Injectable, signal } from '@angular/core';
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
import { DEFAULT_NOTE_PIN_ID } from '../constants/note-pins.constant';
import { firebaseAuth, firestore } from '../firebase/firebase.config';
import { DEFAULT_BOARD_ID } from '../models/board.model';
import {
  CalendarEventModel,
  CalendarModel,
  ChecklistItemModel,
  NoteColor,
  NoteModel,
  NoteType,
} from '../models/note.model';
import { NoteStyleService } from './note-style.service';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class NoteService {
  private readonly storageKey = 'notiva-notes';
  private readonly noteStyleService = inject(NoteStyleService);
  private readonly notificationService = inject(NotificationService);
  private readonly allNotesSignal = signal<NoteModel[]>([]);
  private readonly loadingSignal = signal(true);
  private readonly initializedSignal = signal(false);
  readonly allNotes = this.allNotesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly initialized = this.initializedSignal.asReadonly();
  readonly notes = computed(() => this.allNotesSignal().filter((note) => !note.archived));
  readonly favorites = computed(() =>
    this.allNotesSignal().filter((note) => note.favorite && !note.archived),
  );
  readonly archivedNotes = computed(() => this.allNotesSignal().filter((note) => note.archived));
  private currentUid: string | null = null;

  constructor() {
    onAuthStateChanged(firebaseAuth, (user) => {
      void this.handleAuthState(user);
    });
  }

  async reload(): Promise<void> {
    const uid = this.currentUid ?? firebaseAuth.currentUser?.uid ?? null;
    if (!uid) {
      this.allNotesSignal.set([]);
      return;
    }
    await this.loadCloudNotes(uid, false);
  }

  getNoteById(id: string): NoteModel | undefined {
    return this.allNotesSignal().find((note) => note.id === id);
  }

  getNotesByBoard(boardId: string): NoteModel[] {
    return this.notes().filter((note) => note.boardId === boardId);
  }

  getBoardNoteCount(boardId: string): number {
    return this.getNotesByBoard(boardId).length;
  }

  getBoardTags(boardId: string): string[] {
    return Array.from(
      new Set(
        this.getNotesByBoard(boardId)
          .flatMap((note) => note.tags)
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  getHighestZIndex(): number {
    return this.notes().reduce((highest, note) => Math.max(highest, note.zIndex), 0);
  }

  searchActiveNotes(query: string): NoteModel[] {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return this.notes().filter((note) => this.getSearchableText(note).includes(value));
  }

  searchFavoriteNotes(query: string): NoteModel[] {
    const value = query.trim().toLowerCase();
    if (!value) return this.favorites();
    return this.favorites().filter((note) => this.getSearchableText(note).includes(value));
  }

  searchArchivedNotes(query: string): NoteModel[] {
    const value = query.trim().toLowerCase();
    if (!value) return this.archivedNotes();
    return this.archivedNotes().filter((note) => this.getSearchableText(note).includes(value));
  }

  createNote(
    type: NoteType = 'text',
    color: NoteColor = 'yellow',
    boardId: string = DEFAULT_BOARD_ID,
  ): NoteModel {
    const note: NoteModel = {
      id: crypto.randomUUID(),
      boardId,
      title: this.getDefaultTitle(type),
      content: '',
      type,
      color,
      styleId: this.getDefaultStyleForType(type),
      pinId: DEFAULT_NOTE_PIN_ID,
      secondaryPinId: type === 'calendar' ? DEFAULT_NOTE_PIN_ID : undefined,
      x: 80 + Math.floor(Math.random() * 100),
      y: 80 + Math.floor(Math.random() * 100),
      width: type === 'calendar' ? 720 : 240,
      height: type === 'calendar' ? 590 : 250,
      zIndex: this.getHighestZIndex() + 1,
      favorite: false,
      pinned: false,
      archived: false,
      tags: [],
      checklistItems:
        type === 'checklist'
          ? [this.createChecklistItem('First item'), this.createChecklistItem('Second item')]
          : [],
      reminderAt: null,
      quoteAuthor: '',
      ideaStatus: 'new',
      ideaPriority: 'medium',
      calendar: type === 'calendar' ? this.createCalendar() : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.allNotesSignal.update((notes) => [...notes, note]);
    void this.saveNote(note);
    return note;
  }

  updateNote(id: string, updates: Partial<NoteModel>): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      ...updates,
      styleId:
        updates.styleId !== undefined
          ? this.noteStyleService.resolveStyleId(updates.styleId)
          : note.styleId,
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  updateCalendar(id: string, updates: Partial<CalendarModel>): void {
    const note = this.getNoteById(id);
    if (!note || note.type !== 'calendar' || !note.calendar) return;
    const updated: NoteModel = {
      ...note,
      calendar: {
        ...note.calendar,
        ...updates,
      },
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  updatePosition(id: string, x: number, y: number): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      x,
      y,
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  updateSize(id: string, width: number, height: number): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      width,
      height,
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  bringToFront(id: string): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      zIndex: this.getHighestZIndex() + 1,
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  toggleFavorite(id: string): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      favorite: !note.favorite,
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  setFavorite(id: string, favorite: boolean): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      favorite,
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  togglePinned(id: string): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      pinned: !note.pinned,
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  toggleChecklistItem(noteId: string, itemId: string): void {
    const note = this.getNoteById(noteId);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      checklistItems: note.checklistItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed: !item.completed,
            }
          : item,
      ),
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  archiveNote(id: string): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      archived: true,
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  restoreNote(id: string): void {
    const note = this.getNoteById(id);
    if (!note) return;
    const updated: NoteModel = {
      ...note,
      archived: false,
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  deleteNote(id: string): void {
    const note = this.getNoteById(id);
    if (!note) return;
    this.allNotesSignal.update((notes) => notes.filter((item) => item.id !== id));
    void this.notificationService.cancelReminder(note.id);
    void this.deleteCloudNote(note);
  }

  deleteArchivedNotes(): void {
    const archived = this.archivedNotes();
    if (!archived.length) return;
    const ids = new Set(archived.map((note) => note.id));
    this.allNotesSignal.update((notes) => notes.filter((note) => !ids.has(note.id)));
    void this.notificationService.cancelReminders(archived);
    void this.deleteCloudNotes(archived);
  }

  deleteNotesByBoard(boardId: string): void {
    const boardNotes = this.allNotesSignal().filter((note) => note.boardId === boardId);
    if (!boardNotes.length) return;
    this.allNotesSignal.update((notes) => notes.filter((note) => note.boardId !== boardId));
    void this.notificationService.cancelReminders(boardNotes);
    void this.deleteCloudNotes(boardNotes);
  }

  duplicateNote(id: string): NoteModel | null {
    const original = this.getNoteById(id);
    if (!original) return null;
    const duplicate = this.cloneNote(original, original.boardId, 35);
    this.allNotesSignal.update((notes) => [...notes, duplicate]);
    void this.saveNote(duplicate);
    return duplicate;
  }

  duplicateNotesToBoard(sourceBoardId: string, targetBoardId: string): void {
    const sourceNotes = this.getNotesByBoard(sourceBoardId);
    if (!sourceNotes.length) return;
    let zIndex = this.getHighestZIndex();
    const duplicates = sourceNotes.map((note) => {
      const duplicate = this.cloneNote(note, targetBoardId, 30);
      duplicate.zIndex = ++zIndex;
      return duplicate;
    });
    this.allNotesSignal.update((notes) => [...notes, ...duplicates]);
    void this.saveNotes(duplicates);
  }

  addCalendarEvent(
    noteId: string,
    title: string,
    date: string,
    color?: string,
  ): CalendarEventModel | null {
    const cleanTitle = title.trim();
    const note = this.getNoteById(noteId);
    if (!cleanTitle || !date || !note || note.type !== 'calendar' || !note.calendar) return null;
    const event: CalendarEventModel = {
      id: crypto.randomUUID(),
      title: cleanTitle,
      date,
      color,
    };
    const updated: NoteModel = {
      ...note,
      calendar: {
        ...note.calendar,
        events: [...note.calendar.events, event],
      },
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
    return event;
  }

  updateCalendarEvent(
    noteId: string,
    eventId: string,
    updates: Partial<Omit<CalendarEventModel, 'id'>>,
  ): void {
    const note = this.getNoteById(noteId);
    if (!note || note.type !== 'calendar' || !note.calendar) return;
    const updated: NoteModel = {
      ...note,
      calendar: {
        ...note.calendar,
        events: note.calendar.events.map((event) =>
          event.id === eventId
            ? {
                ...event,
                ...updates,
                title: updates.title !== undefined ? updates.title.trim() : event.title,
              }
            : event,
        ),
      },
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  deleteCalendarEvent(noteId: string, eventId: string): void {
    const note = this.getNoteById(noteId);
    if (!note || note.type !== 'calendar' || !note.calendar) return;
    const updated: NoteModel = {
      ...note,
      calendar: {
        ...note.calendar,
        events: note.calendar.events.filter((event) => event.id !== eventId),
      },
      updatedAt: new Date(),
    };
    this.replaceLocalNote(updated);
    void this.saveNote(updated);
  }

  getCalendarEventsForDate(noteId: string, date: string): CalendarEventModel[] {
    const note = this.getNoteById(noteId);
    if (!note?.calendar) return [];
    return note.calendar.events.filter((event) => event.date === date);
  }

  private async handleAuthState(user: User | null): Promise<void> {
    this.loadingSignal.set(true);
    this.initializedSignal.set(false);
    if (!user) {
      this.currentUid = null;
      this.allNotesSignal.set([]);
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
      return;
    }
    this.currentUid = user.uid;
    try {
      await this.loadCloudNotes(user.uid, true);
    } catch (error) {
      console.error('Failed to load notes from Firestore.', error);
      this.allNotesSignal.set([]);
    } finally {
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
    }
  }

  private async loadCloudNotes(uid: string, migrateLocal: boolean): Promise<void> {
    const boardsSnapshot = await getDocs(collection(firestore, 'users', uid, 'boards'));
    const cloudNotes: NoteModel[] = [];
    for (const boardDocument of boardsSnapshot.docs) {
      const notesSnapshot = await getDocs(
        collection(firestore, 'users', uid, 'boards', boardDocument.id, 'notes'),
      );
      notesSnapshot.docs.forEach((noteDocument) => {
        cloudNotes.push(
          this.normalizeNote({
            ...noteDocument.data(),
            id: noteDocument.id,
            boardId: boardDocument.id,
          } as Partial<NoteModel>),
        );
      });
    }
    if (cloudNotes.length) {
      const migrated = this.migrateStylesInMemory(cloudNotes);
      this.allNotesSignal.set(migrated);
      localStorage.removeItem(this.storageKey);
      void this.notificationService.syncReminders(migrated);
      return;
    }
    if (migrateLocal) {
      const localNotes = this.loadLocalNotes();
      if (localNotes.length) {
        const migrated = this.migrateStylesInMemory(localNotes);
        this.allNotesSignal.set(migrated);
        await this.saveNotes(migrated);
        localStorage.removeItem(this.storageKey);
        void this.notificationService.syncReminders(migrated);
        return;
      }
    }
    const defaults = this.getDefaultNotes();
    this.allNotesSignal.set(defaults);
    await this.saveNotes(defaults);
    localStorage.removeItem(this.storageKey);
  }

  private replaceLocalNote(updated: NoteModel): void {
    this.allNotesSignal.update((notes) =>
      notes.map((note) => (note.id === updated.id ? updated : note)),
    );
  }

  private async saveNote(note: NoteModel): Promise<void> {
    void this.notificationService.syncReminder(note);
    const uid = this.currentUid;
    if (!uid) return;
    try {
      await setDoc(
        doc(firestore, 'users', uid, 'boards', note.boardId, 'notes', note.id),
        this.toFirestore(note),
      );
    } catch (error) {
      console.error(`Failed to save note "${note.id}".`, error);
    }
  }

  private async saveNotes(notes: NoteModel[]): Promise<void> {
    const uid = this.currentUid;
    if (!uid || !notes.length) return;
    for (let index = 0; index < notes.length; index += 400) {
      const batch = writeBatch(firestore);
      notes.slice(index, index + 400).forEach((note) => {
        batch.set(
          doc(firestore, 'users', uid, 'boards', note.boardId, 'notes', note.id),
          this.toFirestore(note),
        );
      });
      await batch.commit();
    }
  }

  private async deleteCloudNote(note: NoteModel): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    try {
      await deleteDoc(doc(firestore, 'users', uid, 'boards', note.boardId, 'notes', note.id));
    } catch (error) {
      console.error(`Failed to delete note "${note.id}".`, error);
    }
  }

  private async deleteCloudNotes(notes: NoteModel[]): Promise<void> {
    const uid = this.currentUid;
    if (!uid || !notes.length) return;
    try {
      for (let index = 0; index < notes.length; index += 400) {
        const batch = writeBatch(firestore);
        notes.slice(index, index + 400).forEach((note) => {
          batch.delete(doc(firestore, 'users', uid, 'boards', note.boardId, 'notes', note.id));
        });
        await batch.commit();
      }
    } catch (error) {
      console.error('Failed to delete notes from Firestore.', error);
    }
  }

  private toFirestore(note: NoteModel): Record<string, unknown> {
    return this.removeUndefined({
      ...note,
      createdAt: Timestamp.fromDate(note.createdAt),
      updatedAt: Timestamp.fromDate(note.updatedAt),
    });
  }

  private removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => {
          if (Array.isArray(item)) {
            return [
              key,
              item.map((entry) =>
                entry && typeof entry === 'object' && !Array.isArray(entry)
                  ? this.removeUndefined(entry as Record<string, unknown>)
                  : entry,
              ),
            ];
          }
          if (
            item &&
            typeof item === 'object' &&
            !(item instanceof Date) &&
            !(item instanceof Timestamp)
          ) {
            return [key, this.removeUndefined(item as Record<string, unknown>)];
          }
          return [key, item];
        }),
    );
  }

  private cloneNote(note: NoteModel, boardId: string, offset: number): NoteModel {
    return {
      ...note,
      id: crypto.randomUUID(),
      boardId,
      title: `${note.title} Copy`,
      x: note.x + offset,
      y: note.y + offset,
      zIndex: this.getHighestZIndex() + 1,
      favorite: false,
      archived: false,
      checklistItems: note.checklistItems.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      })),
      calendar: note.calendar
        ? {
            ...note.calendar,
            events: note.calendar.events.map((event) => ({
              ...event,
              id: crypto.randomUUID(),
            })),
          }
        : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private getSearchableText(note: NoteModel): string {
    const checklistText = note.checklistItems.map((item) => item.text).join(' ');
    const calendarText = note.calendar?.events.map((event) => event.title).join(' ') || '';
    return [
      note.title,
      note.content,
      note.type,
      note.quoteAuthor,
      note.ideaStatus,
      note.ideaPriority,
      ...note.tags,
      checklistText,
      calendarText,
    ]
      .join(' ')
      .toLowerCase();
  }

  private getDefaultStyleForType(type: NoteType): string {
    switch (type) {
      case 'checklist':
        return 'blue-notebook-rip';
      case 'idea':
        return 'teal-wave';
      case 'reminder':
        return 'mint-postage';
      case 'quote':
        return 'purple-curled-letter';
      case 'calendar':
        return 'classic-yellow';
      default:
        return 'classic-yellow';
    }
  }

  private getDefaultTitle(type: NoteType): string {
    switch (type) {
      case 'checklist':
        return 'Checklist';
      case 'idea':
        return 'New Idea';
      case 'reminder':
        return 'Reminder';
      case 'quote':
        return 'Quote';
      case 'calendar':
        return 'Calendar';
      default:
        return 'New Note';
    }
  }

  private createCalendar(): CalendarModel {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      showHolidays: true,
      showMoonPhases: true,
      country: 'PH',
      events: [],
    };
  }

  private createChecklistItem(text: string): ChecklistItemModel {
    return {
      id: crypto.randomUUID(),
      text,
      completed: false,
    };
  }

  private migrateStylesInMemory(notes: NoteModel[]): NoteModel[] {
    return notes.map((note) => ({
      ...note,
      styleId: this.noteStyleService.resolveStyleId(note.styleId),
    }));
  }

  private loadLocalNotes(): NoteModel[] {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((note: Partial<NoteModel>) => this.normalizeNote(note));
    } catch {
      return [];
    }
  }

  private normalizeDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (value instanceof Timestamp) return value.toDate();
    if (
      value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    const date = new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private normalizeNote(note: Partial<NoteModel>): NoteModel {
    const type = note.type || 'text';
    const checklistItems = Array.isArray(note.checklistItems)
      ? note.checklistItems.map((item) => ({
          id: item.id || crypto.randomUUID(),
          text: item.text || '',
          completed: Boolean(item.completed),
        }))
      : type === 'checklist' && note.content
        ? note.content
            .split('\n')
            .filter(Boolean)
            .map((text) => this.createChecklistItem(text))
        : [];

    const calendar =
      type === 'calendar'
        ? {
            year:
              typeof note.calendar?.year === 'number'
                ? note.calendar.year
                : new Date().getFullYear(),
            month:
              typeof note.calendar?.month === 'number'
                ? Math.min(11, Math.max(0, note.calendar.month))
                : new Date().getMonth(),
            showHolidays: note.calendar?.showHolidays !== false,
            showMoonPhases: note.calendar?.showMoonPhases !== false,
            country: 'PH' as const,
            events: Array.isArray(note.calendar?.events)
              ? note.calendar.events.map((event) => ({
                  id: event.id || crypto.randomUUID(),
                  title: event.title || '',
                  date: event.date || '',
                  color: event.color,
                }))
              : [],
          }
        : undefined;

    return {
      id: note.id || crypto.randomUUID(),
      boardId: note.boardId || DEFAULT_BOARD_ID,
      title: note.title || this.getDefaultTitle(type),
      content: note.content || '',
      type,
      color: note.color || 'yellow',
      styleId: this.noteStyleService.resolveStyleId(
        note.styleId || this.getDefaultStyleForType(type),
      ),
      pinId: note.pinId || DEFAULT_NOTE_PIN_ID,
      secondaryPinId:
        type === 'calendar' ? note.secondaryPinId || note.pinId || DEFAULT_NOTE_PIN_ID : undefined,
      x: typeof note.x === 'number' ? note.x : 100,
      y: typeof note.y === 'number' ? note.y : 100,
      width: typeof note.width === 'number' ? note.width : type === 'calendar' ? 720 : 240,
      height: typeof note.height === 'number' ? note.height : type === 'calendar' ? 590 : 250,
      zIndex: typeof note.zIndex === 'number' ? note.zIndex : 1,
      favorite: Boolean(note.favorite),
      pinned: Boolean(note.pinned),
      archived: Boolean(note.archived),
      tags: Array.isArray(note.tags) ? note.tags.filter(Boolean) : [],
      checklistItems,
      reminderAt: note.reminderAt || null,
      quoteAuthor: note.quoteAuthor || '',
      ideaStatus: note.ideaStatus || 'new',
      ideaPriority: note.ideaPriority || 'medium',
      calendar,
      createdAt: this.normalizeDate(note.createdAt),
      updatedAt: this.normalizeDate(note.updatedAt),
    };
  }

  private getDefaultNotes(): NoteModel[] {
    const now = new Date();
    return [
      {
        id: crypto.randomUUID(),
        boardId: DEFAULT_BOARD_ID,
        title: 'Welcome to Notiva',
        content: 'Drag this note anywhere on your board and double-click it to edit.',
        type: 'text',
        color: 'yellow',
        styleId: 'classic-yellow',
        pinId: 'red-pin',
        x: 90,
        y: 90,
        width: 250,
        height: 240,
        zIndex: 1,
        favorite: false,
        pinned: false,
        archived: false,
        tags: ['welcome'],
        checklistItems: [],
        reminderAt: null,
        quoteAuthor: '',
        ideaStatus: 'new',
        ideaPriority: 'medium',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        boardId: DEFAULT_BOARD_ID,
        title: 'Project Idea',
        content: 'Create something worth remembering.',
        type: 'idea',
        color: 'purple',
        styleId: 'teal-wave',
        pinId: 'purple-pin',
        x: 390,
        y: 135,
        width: 250,
        height: 250,
        zIndex: 2,
        favorite: false,
        pinned: false,
        archived: false,
        tags: ['idea'],
        checklistItems: [],
        reminderAt: null,
        quoteAuthor: '',
        ideaStatus: 'new',
        ideaPriority: 'medium',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        boardId: DEFAULT_BOARD_ID,
        title: 'Things To Do',
        content: '',
        type: 'checklist',
        color: 'blue',
        styleId: 'blue-notebook-rip',
        pinId: 'blue-pin',
        x: 700,
        y: 85,
        width: 250,
        height: 270,
        zIndex: 3,
        favorite: false,
        pinned: false,
        archived: false,
        tags: ['tasks'],
        checklistItems: [
          this.createChecklistItem('Create another board'),
          this.createChecklistItem('Try another note style'),
          this.createChecklistItem('Move notes around'),
        ],
        reminderAt: null,
        quoteAuthor: '',
        ideaStatus: 'new',
        ideaPriority: 'medium',
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
}

import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { DEFAULT_BOARD_ID } from '../../core/models/board.model';
import { NoteColor, NoteModel, NoteType } from '../../core/models/note.model';
import { BoardDesignService } from '../../core/services/board-design.service';
import { BoardService } from '../../core/services/board.service';
import { BoardViewService } from '../../core/services/board-view.service';
import { NoteService } from '../../core/services/note.service';
import { BoardDesignPickerComponent } from '../../shared/components/board-design-picker/board-design-picker.component';
import { BoardSurfaceComponent } from '../../shared/components/board-surface/board-surface.component';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { NoteCardComponent } from '../../shared/components/note-card/note-card.component';
import {
  NoteEditorComponent,
  NoteEditorSaveEvent,
} from '../../shared/components/note-editor/note-editor.component';
import { NoteViewComponent } from '../../shared/components/note-view/note-view.component';

type NoteSort = 'manual' | 'updated' | 'newest' | 'oldest' | 'title';

interface GroupDragPosition {
  id: string;
  x: number;
  y: number;
  pinned: boolean;
}

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [
    CalendarComponent,
    NoteCardComponent,
    NoteEditorComponent,
    BoardSurfaceComponent,
    BoardDesignPickerComponent,
    NoteViewComponent,
  ],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss',
})
export class NotesComponent {
  readonly noteService = inject(NoteService);
  readonly boardService = inject(BoardService);
  private readonly boardViewService = inject(BoardViewService);
  private readonly boardDesignService = inject(BoardDesignService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly boardId = computed(() => this.routeParams().get('boardId') || DEFAULT_BOARD_ID);
  readonly board = computed(() => this.boardService.getBoardById(this.boardId()));
  readonly boardDesign = computed(() => this.boardDesignService.getDesign(this.board()?.designId));
  readonly notes = computed(() =>
    this.noteService.notes().filter((note) => note.boardId === this.boardId()),
  );
  readonly boardTags = computed(() => this.noteService.getBoardTags(this.boardId()));
  readonly searchQuery = signal('');
  readonly selectedType = signal<'all' | NoteType>('all');
  readonly selectedTag = signal<string | null>(null);
  readonly sortMode = signal<NoteSort>('manual');
  readonly editingNote = signal<NoteModel | null>(null);
  readonly creatingNote = signal(false);
  readonly boardDesignPickerOpen = signal(false);
  readonly viewingNote = signal<NoteModel | null>(null);
  readonly newNoteMenuOpen = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly selectedNoteIds = signal<Set<string>>(new Set<string>());

  readonly selectedNotes = computed(() =>
    this.notes().filter((note) => this.selectedNoteIds().has(note.id)),
  );

  readonly selectionCount = computed(() => this.selectedNoteIds().size);

  readonly allSelectedPinned = computed(() => {
    const notes = this.selectedNotes();
    return notes.length > 0 && notes.every((note) => note.pinned);
  });

  readonly allSelectedFavorite = computed(() => {
    const notes = this.selectedNotes().filter((note) => note.type !== 'calendar');
    return notes.length > 0 && notes.every((note) => note.favorite);
  });

  readonly filteredNotes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const type = this.selectedType();
    const tag = this.selectedTag();
    const sort = this.sortMode();

    const notes = this.notes().filter((note) => {
      const matchesType = type === 'all' || note.type === type;
      const matchesTag = !tag || (note.tags || []).includes(tag);
      const searchableTags = (note.tags || []).join(' ');
      const searchableChecklist = (note.checklistItems || []).map((item) => item.text).join(' ');
      const searchableCalendar = note.calendar?.events.map((event) => event.title).join(' ') || '';
      const searchableAttachments = (note.attachments || [])
        .map((attachment) => attachment.name)
        .join(' ');

      const matchesSearch =
        !query ||
        (note.title || '').toLowerCase().includes(query) ||
        (note.content || '').toLowerCase().includes(query) ||
        searchableTags.toLowerCase().includes(query) ||
        searchableChecklist.toLowerCase().includes(query) ||
        searchableCalendar.toLowerCase().includes(query) ||
        searchableAttachments.toLowerCase().includes(query) ||
        (note.quoteAuthor || '').toLowerCase().includes(query);

      return matchesType && matchesTag && matchesSearch;
    });

    return [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
      if (sort === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
      if (sort === 'updated') return b.updatedAt.getTime() - a.updatedAt.getTime();
      if (sort === 'title') return a.title.localeCompare(b.title);
      return a.zIndex - b.zIndex;
    });
  });

  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly gridEnabled = signal(true);
  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  readonly canvasTransform = computed(
    () => `translate3d(${this.panX()}px, ${this.panY()}px, 0) scale(${this.zoom()})`,
  );

  private panning = false;
  private panPointerId: number | null = null;
  private panStartPointerX = 0;
  private panStartPointerY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private loadedBoardId = '';
  private openedQueryNoteId = '';
  private handledNewNoteRequest = '';
  private groupDragging = false;
  private groupDragSourceId = '';
  private groupDragPositions = new Map<string, GroupDragPosition>();
  private groupDragDeltaX = 0;
  private groupDragDeltaY = 0;

  readonly filters: {
    label: string;
    value: 'all' | NoteType;
    icon: string;
  }[] = [
    { label: 'All', value: 'all', icon: 'fa-solid fa-layer-group' },
    { label: 'Text', value: 'text', icon: 'fa-regular fa-note-sticky' },
    { label: 'Checklist', value: 'checklist', icon: 'fa-solid fa-list-check' },
    { label: 'Ideas', value: 'idea', icon: 'fa-regular fa-lightbulb' },
    { label: 'Reminders', value: 'reminder', icon: 'fa-regular fa-clock' },
    { label: 'Quotes', value: 'quote', icon: 'fa-solid fa-quote-left' },
    { label: 'Calendar', value: 'calendar', icon: 'fa-regular fa-calendar-days' },
  ];

  readonly noteTypes: {
    label: string;
    type: NoteType;
    icon: string;
    color: NoteColor;
  }[] = [
    { label: 'Text Note', type: 'text', icon: 'fa-regular fa-note-sticky', color: 'yellow' },
    { label: 'Checklist', type: 'checklist', icon: 'fa-solid fa-list-check', color: 'blue' },
    { label: 'Idea', type: 'idea', icon: 'fa-regular fa-lightbulb', color: 'purple' },
    { label: 'Reminder', type: 'reminder', icon: 'fa-regular fa-clock', color: 'green' },
    { label: 'Quote', type: 'quote', icon: 'fa-solid fa-quote-left', color: 'pink' },
    { label: 'Calendar', type: 'calendar', icon: 'fa-regular fa-calendar-days', color: 'orange' },
  ];

  constructor() {
    effect(() => {
      const boardId = this.boardId();
      if (boardId === this.loadedBoardId) return;

      this.loadedBoardId = boardId;
      const view = this.boardViewService.getView(boardId);

      this.zoom.set(view.zoom);
      this.panX.set(view.panX);
      this.panY.set(view.panY);
      this.gridEnabled.set(view.gridEnabled);
      this.searchQuery.set('');
      this.selectedType.set('all');
      this.selectedTag.set(null);
      this.sortMode.set('manual');
      this.editingNote.set(null);
      this.creatingNote.set(false);
      this.boardDesignPickerOpen.set(false);
      this.newNoteMenuOpen.set(false);
      this.mobileMenuOpen.set(false);
      this.clearSelection();
      this.resetGroupDrag();
    });

    effect(() => {
      const noteId = this.queryParams().get('noteId');
      if (!noteId || noteId === this.openedQueryNoteId) return;

      const note = this.noteService.getNoteById(noteId);
      if (!note || note.archived || note.boardId !== this.boardId()) return;

      this.openedQueryNoteId = noteId;

      if (note.type === 'calendar') return;

      this.openEditor(note);
    });

    effect(() => {
      const request = this.queryParams().get('newNote');
      if (!request || request === this.handledNewNoteRequest) return;

      this.handledNewNoteRequest = request;
      this.mobileMenuOpen.set(false);
      this.newNoteMenuOpen.set(true);
    });
  }

  toggleNewNoteMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.mobileMenuOpen.set(false);
    this.newNoteMenuOpen.update((open) => !open);
  }

  closeNewNoteMenu(): void {
    this.newNoteMenuOpen.set(false);
  }

  toggleMobileMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.newNoteMenuOpen.set(false);
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  selectMobileType(type: 'all' | NoteType): void {
    this.selectedType.set(type);
  }

  openMobileDesignPicker(): void {
    this.mobileMenuOpen.set(false);
    this.openBoardDesignPicker();
  }

  resetMobileView(): void {
    this.resetView();
    this.mobileMenuOpen.set(false);
  }

  createNoteFromMenu(type: NoteType, color: NoteColor): void {
    this.newNoteMenuOpen.set(false);
    this.createNote(type, color);
  }

  isNoteSelected(noteId: string): boolean {
    return this.selectedNoteIds().has(noteId);
  }

  selectNote(noteId: string, additive = false): void {
    if (!additive) {
      if (this.selectedNoteIds().has(noteId) && this.selectedNoteIds().size > 1) return;
      this.selectedNoteIds.set(new Set([noteId]));
      return;
    }

    const selected = new Set(this.selectedNoteIds());

    if (selected.has(noteId)) {
      selected.delete(noteId);
    } else {
      selected.add(noteId);
    }

    this.selectedNoteIds.set(selected);
  }

  clearSelection(): void {
    if (!this.selectedNoteIds().size) return;
    this.selectedNoteIds.set(new Set<string>());
  }

  startGroupDrag(event: { id: string; x: number; y: number }): void {
    if (!this.selectedNoteIds().has(event.id) || this.selectionCount() < 2) {
      this.resetGroupDrag();
      return;
    }

    const source = this.noteService.getNoteById(event.id);

    if (!source || source.pinned) {
      this.resetGroupDrag();
      return;
    }

    this.groupDragging = true;
    this.groupDragSourceId = event.id;
    this.groupDragDeltaX = 0;
    this.groupDragDeltaY = 0;
    this.groupDragPositions.clear();

    for (const note of this.selectedNotes()) {
      this.groupDragPositions.set(note.id, {
        id: note.id,
        x: note.x,
        y: note.y,
        pinned: note.pinned,
      });
    }
  }

  moveGroupDrag(event: { id: string; deltaX: number; deltaY: number }): void {
    if (!this.groupDragging || event.id !== this.groupDragSourceId) return;

    this.groupDragDeltaX = event.deltaX;
    this.groupDragDeltaY = event.deltaY;

    for (const position of this.groupDragPositions.values()) {
      if (position.id === this.groupDragSourceId || position.pinned) continue;

      this.noteService.updatePosition(
        position.id,
        position.x + event.deltaX,
        position.y + event.deltaY,
      );
    }
  }

  endGroupDrag(event: { id: string; x: number; y: number; moved: boolean }): void {
    if (!this.groupDragging || event.id !== this.groupDragSourceId) return;

    if (!event.moved) {
      this.resetGroupDrag();
      return;
    }

    for (const position of this.groupDragPositions.values()) {
      if (position.id === this.groupDragSourceId || position.pinned) continue;

      this.noteService.updatePosition(
        position.id,
        position.x + this.groupDragDeltaX,
        position.y + this.groupDragDeltaY,
      );
    }

    this.resetGroupDrag();
  }

  toggleSelectedPinned(): void {
    const notes = this.selectedNotes();
    if (!notes.length) return;

    const pinned = !this.allSelectedPinned();

    for (const note of notes) {
      this.noteService.updateNote(note.id, { pinned });
    }
  }

  toggleSelectedFavorite(): void {
    const notes = this.selectedNotes().filter((note) => note.type !== 'calendar');
    if (!notes.length) return;

    const favorite = !this.allSelectedFavorite();

    for (const note of notes) {
      this.noteService.updateNote(note.id, { favorite });
    }
  }

  duplicateSelected(): void {
    const ids = [...this.selectedNoteIds()];
    if (!ids.length) return;

    this.clearSelection();

    for (const id of ids) {
      this.noteService.duplicateNote(id);
    }
  }

  archiveSelected(): void {
    const notes = this.selectedNotes().filter((note) => note.type !== 'calendar');
    if (!notes.length) return;

    const ids = notes.map((note) => note.id);
    this.clearSelection();

    for (const id of ids) {
      this.noteService.archiveNote(id);
    }
  }

  deleteSelected(): void {
    const ids = [...this.selectedNoteIds()];
    if (!ids.length) return;

    this.clearSelection();

    for (const id of ids) {
      this.noteService.deleteNote(id);
    }
  }

  openNoteView(note: NoteModel): void {
    if (note.type === 'calendar') return;
    this.viewingNote.set(note);
  }

  closeNoteView(): void {
    this.viewingNote.set(null);
  }

  editFromView(note: NoteModel): void {
    this.viewingNote.set(null);
    if (note.type === 'calendar') return;
    this.openEditor(note);
  }

  newNote(): void {
    this.mobileMenuOpen.set(false);
    this.newNoteMenuOpen.set(true);
  }

  createNote(type: NoteType, color: NoteColor): void {
    if (type === 'calendar') {
      this.createCalendar();
      return;
    }

    const now = new Date();

    const draft: NoteModel = {
      id: `draft-${crypto.randomUUID()}`,
      boardId: this.boardId(),
      title: '',
      content: '',
      type,
      color,
      styleId: this.getDefaultStyleForType(type),
      pinId: 'red-pin',
      x: this.getNewNoteX(),
      y: this.getNewNoteY(),
      width: 240,
      height: 250,
      zIndex: this.noteService.getHighestZIndex() + 1,
      favorite: false,
      pinned: false,
      archived: false,
      tags: [],
      checklistItems:
        type === 'checklist' ? [{ id: crypto.randomUUID(), text: '', completed: false }] : [],
      attachments: [],
      reminderAt: null,
      quoteAuthor: '',
      ideaStatus: 'new',
      ideaPriority: 'medium',
      createdAt: now,
      updatedAt: now,
    };

    this.creatingNote.set(true);
    this.editingNote.set(draft);
  }

  openEditor(note: NoteModel): void {
    if (note.type === 'calendar') return;

    this.creatingNote.set(false);
    this.noteService.bringToFront(note.id);

    const source = this.noteService.getNoteById(note.id) || note;

    this.editingNote.set({
      ...source,
      tags: [...(source.tags || [])],
      checklistItems: (source.checklistItems || []).map((item) => ({
        ...item,
      })),
      attachments: (source.attachments || []).map((attachment) => ({
        ...attachment,
      })),
      calendar: source.calendar
        ? {
            ...source.calendar,
            events: (source.calendar.events || []).map((event) => ({
              ...event,
            })),
          }
        : source.calendar,
    });
  }

  closeEditor(): void {
    this.editingNote.set(null);
    this.creatingNote.set(false);

    const hasNoteId = this.queryParams().has('noteId');
    const hasNewNote = this.queryParams().has('newNote');

    if (hasNoteId || hasNewNote) {
      this.openedQueryNoteId = '';

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          noteId: null,
          newNote: null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  async saveNote(event: NoteEditorSaveEvent): Promise<void> {
    const note = this.editingNote();
    if (!note) return;

    if (this.creatingNote()) {
      await this.saveNewNote(note, event);
      return;
    }

    this.noteService.updateNote(note.id, {
      ...event.changes,
      updatedAt: new Date(),
    });

    if (event.files.length || event.removedAttachmentIds.length) {
      await this.noteService.syncAttachments(note.id, event.files, event.removedAttachmentIds);
    }

    this.boardService.touchBoard(note.boardId);
    this.closeEditor();
  }

  previousCalendarMonth(noteId: string): void {
    const note = this.noteService.getNoteById(noteId);
    if (!note?.calendar) return;

    let month = note.calendar.month - 1;
    let year = note.calendar.year;

    if (month < 0) {
      month = 11;
      year--;
    }

    this.noteService.updateCalendar(noteId, { month, year });
    this.boardService.touchBoard(note.boardId);
  }

  nextCalendarMonth(noteId: string): void {
    const note = this.noteService.getNoteById(noteId);
    if (!note?.calendar) return;

    let month = note.calendar.month + 1;
    let year = note.calendar.year;

    if (month > 11) {
      month = 0;
      year++;
    }

    this.noteService.updateCalendar(noteId, { month, year });
    this.boardService.touchBoard(note.boardId);
  }

  goToCalendarToday(noteId: string): void {
    const note = this.noteService.getNoteById(noteId);
    if (!note?.calendar) return;

    const today = new Date();

    this.noteService.updateCalendar(noteId, {
      month: today.getMonth(),
      year: today.getFullYear(),
    });

    this.boardService.touchBoard(note.boardId);
  }

  changeCalendarPin(event: { id: string; pinId: string }): void {
    this.noteService.updateNote(event.id, { pinId: event.pinId });
  }

  changeCalendarSecondaryPin(event: { id: string; pinId: string }): void {
    this.noteService.updateNote(event.id, { secondaryPinId: event.pinId });
  }

  openBoardDesignPicker(): void {
    this.newNoteMenuOpen.set(false);
    this.mobileMenuOpen.set(false);
    this.boardDesignPickerOpen.set(true);
  }

  closeBoardDesignPicker(): void {
    this.boardDesignPickerOpen.set(false);
  }

  selectBoardDesign(designId: string): void {
    const board = this.board();
    if (!board) return;

    this.boardService.updateBoardDesign(board.id, designId);
    this.boardDesignPickerOpen.set(false);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedType.set('all');
    this.selectedTag.set(null);
  }

  zoomIn(): void {
    this.setZoom(this.zoom() + 0.1);
  }

  zoomOut(): void {
    this.setZoom(this.zoom() - 0.1);
  }

  setZoom(value: number): void {
    const zoom = Math.min(2, Math.max(0.4, Number(value.toFixed(2))));
    this.zoom.set(zoom);
    this.saveBoardView();
  }

  onWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;

    event.preventDefault();

    if (event.deltaY < 0) {
      this.zoomIn();
      return;
    }

    this.zoomOut();
  }

  toggleGrid(): void {
    this.gridEnabled.update((value) => !value);
    this.saveBoardView();
  }

  resetView(): void {
    const view = this.boardViewService.resetView(this.boardId());

    this.zoom.set(view.zoom);
    this.panX.set(view.panX);
    this.panY.set(view.panY);
    this.gridEnabled.set(view.gridEnabled);
  }

  startPan(event: PointerEvent): void {
    if (event.button !== 0 || this.isInteractiveBoardObject(event)) return;

    event.preventDefault();
    this.clearSelection();
    this.newNoteMenuOpen.set(false);
    this.mobileMenuOpen.set(false);
    this.panning = true;
    this.panPointerId = event.pointerId;
    this.panStartPointerX = event.clientX;
    this.panStartPointerY = event.clientY;
    this.panStartX = this.panX();
    this.panStartY = this.panY();

    const current = event.currentTarget as HTMLElement;
    current.setPointerCapture(event.pointerId);
  }

  pan(event: PointerEvent): void {
    if (!this.panning || event.pointerId !== this.panPointerId) return;

    event.preventDefault();

    this.panX.set(this.panStartX + event.clientX - this.panStartPointerX);
    this.panY.set(this.panStartY + event.clientY - this.panStartPointerY);
  }

  endPan(event: PointerEvent): void {
    if (!this.panning || event.pointerId !== this.panPointerId) return;

    const current = event.currentTarget as HTMLElement;

    if (current.hasPointerCapture(event.pointerId)) {
      current.releasePointerCapture(event.pointerId);
    }

    this.panning = false;
    this.panPointerId = null;
    this.saveBoardView();
  }

  private resetGroupDrag(): void {
    this.groupDragging = false;
    this.groupDragSourceId = '';
    this.groupDragPositions.clear();
    this.groupDragDeltaX = 0;
    this.groupDragDeltaY = 0;
  }

  private createCalendar(): void {
    const calendar = this.noteService.createNote('calendar', 'orange', this.boardId());

    this.noteService.updateNote(calendar.id, {
      x: this.getNewNoteX(),
      y: this.getNewNoteY(),
      width: 860,
      height: 680,
      pinned: false,
      archived: false,
    });

    this.noteService.bringToFront(calendar.id);
    this.boardService.touchBoard(calendar.boardId);
  }

  private async saveNewNote(draft: NoteModel, event: NoteEditorSaveEvent): Promise<void> {
    const changes = event.changes;
    const type = changes.type ?? draft.type;
    const color = changes.color ?? draft.color;

    const createdNote = this.noteService.createNote(type, color, draft.boardId);

    this.noteService.updateNote(createdNote.id, {
      ...changes,
      boardId: draft.boardId,
      x: draft.x,
      y: draft.y,
      width: draft.width,
      height: draft.height,
      archived: false,
      updatedAt: new Date(),
    });

    if (event.files.length) {
      await this.noteService.uploadAttachments(createdNote.id, event.files);
    }

    this.boardService.touchBoard(draft.boardId);
    this.closeEditor();
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
      default:
        return 'classic-yellow';
    }
  }

  private getNewNoteX(): number {
    const count = this.notes().length;
    return 100 + (count % 5) * 54;
  }

  private getNewNoteY(): number {
    const count = this.notes().length;
    return 100 + (count % 5) * 46;
  }

  private isInteractiveBoardObject(event: PointerEvent): boolean {
    return event.composedPath().some((item) => {
      if (!(item instanceof Element)) return false;

      return (
        item.matches('app-note-card') ||
        item.matches('app-calendar') ||
        item.matches('.note-card') ||
        item.matches('.calendar') ||
        item.matches('.calendar-drag-area') ||
        item.matches('.resize-handle') ||
        item.matches('button') ||
        item.matches('input') ||
        item.matches('textarea') ||
        item.matches('select') ||
        item.matches('a') ||
        item.matches('[contenteditable="true"]') ||
        item.matches('app-note-editor') ||
        item.matches('app-board-design-picker')
      );
    });
  }

  private saveBoardView(): void {
    this.boardViewService.saveView({
      boardId: this.boardId(),
      zoom: this.zoom(),
      panX: this.panX(),
      panY: this.panY(),
      gridEnabled: this.gridEnabled(),
    });
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { DEFAULT_BOARD_ID } from '../../core/models/board.model';
import { NoteModel, NoteType } from '../../core/models/note.model';
import { BoardService } from '../../core/services/board.service';
import { NoteService } from '../../core/services/note.service';

type ArchiveTypeFilter = 'all' | NoteType;

@Component({
  selector: 'app-archive',
  standalone: true,
  templateUrl: './archive.component.html',
  styleUrl: './archive.component.scss',
})
export class ArchiveComponent {
  readonly noteService = inject(NoteService);
  private readonly boardService = inject(BoardService);
  readonly search = signal('');
  readonly typeFilter = signal<ArchiveTypeFilter>('all');
  readonly mobileMenuOpen = signal(false);
  readonly deleteTarget = signal<NoteModel | null>(null);
  readonly types: { value: ArchiveTypeFilter; label: string; icon: string }[] = [
    { value: 'all', label: 'All', icon: 'fa-solid fa-layer-group' },
    { value: 'text', label: 'Notes', icon: 'fa-regular fa-note-sticky' },
    { value: 'checklist', label: 'Lists', icon: 'fa-solid fa-list-check' },
    { value: 'idea', label: 'Ideas', icon: 'fa-regular fa-lightbulb' },
    { value: 'reminder', label: 'Reminders', icon: 'fa-regular fa-clock' },
    { value: 'quote', label: 'Quotes', icon: 'fa-solid fa-quote-left' },
  ];
  readonly archivedNotes = computed(() => {
    const query = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    return this.noteService.archivedNotes().filter((note) => {
      if (type !== 'all' && note.type !== type) return false;
      if (!query) return true;
      return this.getSearchableText(note).includes(query);
    });
  });
  readonly totalArchived = computed(() => this.noteService.archivedNotes().length);

  toggleMobileMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  selectMobileType(type: ArchiveTypeFilter): void {
    this.typeFilter.set(type);
    this.mobileMenuOpen.set(false);
  }

  clearFilters(): void {
    this.search.set('');
    this.typeFilter.set('all');
    this.mobileMenuOpen.set(false);
  }

  getBoardName(boardId: string): string {
    if (boardId === DEFAULT_BOARD_ID) return 'Main Notes';
    return this.boardService.getBoardById(boardId)?.name || 'Deleted Board';
  }

  getTypeIcon(type: NoteType): string {
    switch (type) {
      case 'checklist':
        return 'fa-solid fa-list-check';
      case 'idea':
        return 'fa-regular fa-lightbulb';
      case 'reminder':
        return 'fa-regular fa-clock';
      case 'quote':
        return 'fa-solid fa-quote-left';
      default:
        return 'fa-regular fa-note-sticky';
    }
  }

  restoreNote(note: NoteModel): void {
    this.mobileMenuOpen.set(false);
    this.noteService.restoreNote(note.id);
  }

  requestDelete(note: NoteModel): void {
    this.mobileMenuOpen.set(false);
    this.deleteTarget.set(note);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const note = this.deleteTarget();
    if (!note) return;
    this.noteService.deleteNote(note.id);
    this.deleteTarget.set(null);
  }

  clearSearch(): void {
    this.search.set('');
  }

  private getSearchableText(note: NoteModel): string {
    const checklist = note.checklistItems.map((item) => item.text).join(' ');
    return [
      note.title,
      note.content,
      note.type,
      note.quoteAuthor,
      ...note.tags,
      checklist,
      this.getBoardName(note.boardId),
    ]
      .join(' ')
      .toLowerCase();
  }
}

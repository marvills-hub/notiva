import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DEFAULT_BOARD_ID } from '../../core/models/board.model';
import { NoteModel, NoteType } from '../../core/models/note.model';
import { BoardService } from '../../core/services/board.service';
import { NoteService } from '../../core/services/note.service';
type FavoriteTypeFilter = 'all' | NoteType;
@Component({
  selector: 'app-favorites',
  standalone: true,
  templateUrl: './favorites.component.html',
  styleUrl: './favorites.component.scss',
})
export class FavoritesComponent {
  readonly noteService = inject(NoteService);
  private readonly boardService = inject(BoardService);
  private readonly router = inject(Router);
  readonly search = signal('');
  readonly typeFilter = signal<FavoriteTypeFilter>('all');
  readonly mobileMenuOpen = signal(false);
  readonly types: { value: FavoriteTypeFilter; label: string; icon: string }[] = [
    { value: 'all', label: 'All', icon: 'fa-solid fa-layer-group' },
    { value: 'text', label: 'Notes', icon: 'fa-regular fa-note-sticky' },
    { value: 'checklist', label: 'Lists', icon: 'fa-solid fa-list-check' },
    { value: 'idea', label: 'Ideas', icon: 'fa-regular fa-lightbulb' },
    { value: 'reminder', label: 'Reminders', icon: 'fa-regular fa-clock' },
    { value: 'quote', label: 'Quotes', icon: 'fa-solid fa-quote-left' },
  ];
  readonly favorites = computed(() => {
    const query = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    return this.noteService.favorites().filter((note) => {
      if (type !== 'all' && note.type !== type) return false;
      if (!query) return true;
      return this.getSearchableText(note).includes(query);
    });
  });
  readonly totalFavorites = computed(() => this.noteService.favorites().length);
  toggleMobileMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.mobileMenuOpen.update((open) => !open);
  }
  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }
  selectMobileType(type: FavoriteTypeFilter): void {
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
    return this.boardService.getBoardById(boardId)?.name || 'Unknown Board';
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
  getChecklistProgress(note: NoteModel): string {
    if (!note.checklistItems.length) return '';
    const completed = note.checklistItems.filter((item) => item.completed).length;
    return `${completed}/${note.checklistItems.length} completed`;
  }
  openNote(note: NoteModel): void {
    this.mobileMenuOpen.set(false);
    if (note.boardId === DEFAULT_BOARD_ID) {
      this.router.navigate(['/notes'], {
        queryParams: { noteId: note.id },
      });
      return;
    }
    this.router.navigate(['/boards', note.boardId], {
      queryParams: { noteId: note.id },
    });
  }
  archiveNote(note: NoteModel, event?: Event): void {
    event?.stopPropagation();
    this.noteService.archiveNote(note.id);
  }
  removeFavorite(note: NoteModel, event?: Event): void {
    event?.stopPropagation();
    this.noteService.toggleFavorite(note.id);
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

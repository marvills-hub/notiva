import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BoardColor, BoardModel, DEFAULT_BOARD_ID } from '../../core/models/board.model';
import { BoardDesignCategory } from '../../core/models/board-design.model';
import { BoardDesignService } from '../../core/services/board-design.service';
import { BoardService } from '../../core/services/board.service';
import { NoteService } from '../../core/services/note.service';
import { BoardCardComponent } from '../../shared/components/board-card/board-card.component';
import { BoardSurfaceComponent } from '../../shared/components/board-surface/board-surface.component';
type BoardFilter = 'all' | 'favorites';
@Component({
  selector: 'app-boards',
  standalone: true,
  imports: [BoardCardComponent, BoardSurfaceComponent],
  templateUrl: './boards.component.html',
  styleUrl: './boards.component.scss',
})
export class BoardsComponent {
  readonly boardService = inject(BoardService);
  readonly noteService = inject(NoteService);
  private readonly boardDesignService = inject(BoardDesignService);
  private readonly router = inject(Router);
  readonly searchQuery = signal('');
  readonly filter = signal<BoardFilter>('all');
  readonly mobileMenuOpen = signal(false);
  readonly editorOpen = signal(false);
  readonly editingBoard = signal<BoardModel | null>(null);
  readonly boardName = signal('');
  readonly boardDescription = signal('');
  readonly boardColor = signal<BoardColor>('violet');
  readonly selectedDesignId = signal('classic-cork');
  readonly designCategory = signal<BoardDesignCategory | 'all'>('all');
  readonly deleteTarget = signal<BoardModel | null>(null);
  readonly designCategories: {
    label: string;
    value: BoardDesignCategory | 'all';
    icon: string;
  }[] = [
    { label: 'All', value: 'all', icon: 'fa-solid fa-layer-group' },
    { label: 'Cork', value: 'cork', icon: 'fa-solid fa-thumbtack' },
    { label: 'Wood', value: 'wood', icon: 'fa-solid fa-tree' },
    { label: 'Fabric', value: 'fabric', icon: 'fa-solid fa-rug' },
    { label: 'Paper', value: 'paper', icon: 'fa-regular fa-file-lines' },
    { label: 'Board', value: 'board', icon: 'fa-solid fa-chalkboard' },
    { label: 'Industrial', value: 'industrial', icon: 'fa-solid fa-industry' },
    { label: 'Technical', value: 'technical', icon: 'fa-solid fa-compass-drafting' },
  ];
  readonly boardColors: {
    value: BoardColor;
    color: string;
  }[] = [
    { value: 'violet', color: '#765cff' },
    { value: 'blue', color: '#4f8fdc' },
    { value: 'green', color: '#52a978' },
    { value: 'orange', color: '#d8874e' },
    { value: 'pink', color: '#c86796' },
    { value: 'yellow', color: '#c6a54c' },
  ];
  readonly designs = computed(() =>
    this.boardDesignService.getDesignsByCategory(this.designCategory()),
  );
  readonly selectedDesign = computed(() =>
    this.boardDesignService.getDesign(this.selectedDesignId()),
  );
  readonly filteredBoards = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.filter();
    return this.boardService
      .boards()
      .filter((board) => {
        if (filter === 'favorites' && !board.favorite) return false;
        if (!query) return true;
        const design = this.boardDesignService.getDesign(board.designId);
        return (
          board.name.toLowerCase().includes(query) ||
          board.description.toLowerCase().includes(query) ||
          design.name.toLowerCase().includes(query) ||
          design.category.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (a.id === DEFAULT_BOARD_ID) return -1;
        if (b.id === DEFAULT_BOARD_ID) return 1;
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
  });
  readonly totalNotes = computed(() => this.noteService.notes().length);
  readonly favoriteCount = computed(
    () => this.boardService.boards().filter((board) => board.favorite).length,
  );
  toggleMobileMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.mobileMenuOpen.update((open) => !open);
  }
  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }
  setMobileFilter(filter: BoardFilter): void {
    this.filter.set(filter);
    this.mobileMenuOpen.set(false);
  }
  openBoard(board: BoardModel): void {
    this.mobileMenuOpen.set(false);
    if (board.id === DEFAULT_BOARD_ID) {
      this.router.navigate(['/notes']);
      return;
    }
    this.router.navigate(['/boards', board.id]);
  }
  openCreateBoard(): void {
    this.mobileMenuOpen.set(false);
    this.editingBoard.set(null);
    this.boardName.set('');
    this.boardDescription.set('');
    this.boardColor.set('violet');
    this.selectedDesignId.set('classic-cork');
    this.designCategory.set('all');
    this.editorOpen.set(true);
  }
  openEditBoard(board: BoardModel): void {
    this.mobileMenuOpen.set(false);
    this.editingBoard.set(board);
    this.boardName.set(board.name);
    this.boardDescription.set(board.description);
    this.boardColor.set(board.color);
    this.selectedDesignId.set(this.boardDesignService.resolveDesignId(board.designId));
    this.designCategory.set('all');
    this.editorOpen.set(true);
  }
  closeEditor(): void {
    this.editorOpen.set(false);
    this.editingBoard.set(null);
  }
  saveBoard(): void {
    const name = this.boardName().trim();
    if (!name) return;
    const editingBoard = this.editingBoard();
    if (editingBoard) {
      this.boardService.updateBoard(editingBoard.id, {
        name,
        description: this.boardDescription().trim(),
        color: this.boardColor(),
        designId: this.selectedDesignId(),
      });
      this.closeEditor();
      return;
    }
    this.boardService.createBoard(
      name,
      this.boardDescription().trim(),
      this.boardColor(),
      this.selectedDesignId(),
    );
    this.closeEditor();
  }
  duplicateBoard(board: BoardModel): void {
    const duplicate = this.boardService.duplicateBoard(board.id);
    if (!duplicate) return;
    this.noteService.duplicateNotesToBoard(board.id, duplicate.id);
  }
  toggleFavorite(board: BoardModel): void {
    this.boardService.toggleFavorite(board.id);
  }
  requestDelete(board: BoardModel): void {
    this.mobileMenuOpen.set(false);
    if (board.id === DEFAULT_BOARD_ID) return;
    this.deleteTarget.set(board);
  }
  cancelDelete(): void {
    this.deleteTarget.set(null);
  }
  confirmDelete(): void {
    const board = this.deleteTarget();
    if (!board || board.id === DEFAULT_BOARD_ID) return;
    this.noteService.deleteNotesByBoard(board.id);
    this.boardService.deleteBoard(board.id);
    this.deleteTarget.set(null);
  }
  getNoteCount(boardId: string): number {
    return this.noteService.getBoardNoteCount(boardId);
  }
  clearSearch(): void {
    this.searchQuery.set('');
  }
  setDesignCategory(category: BoardDesignCategory | 'all'): void {
    this.designCategory.set(category);
  }
  selectDesign(id: string): void {
    this.selectedDesignId.set(id);
  }
  selectColor(color: BoardColor): void {
    this.boardColor.set(color);
  }
}

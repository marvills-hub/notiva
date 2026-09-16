import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DEFAULT_BOARD_ID } from '../../core/models/board.model';
import { DrawingBoardService } from '../../core/services/drawing-board.service';
import { DrawingBoardComponent } from '../../shared/components/drawing-board/drawing-board.component';
import {
  DrawingBoardDefinition,
  DrawingBoardModel,
  DrawingBoardType,
} from '../../core/models/drawring-board.model';

@Component({
  selector: 'app-drawing-boards',
  standalone: true,
  imports: [DrawingBoardComponent],
  templateUrl: './drawing-boards.component.html',
  styleUrl: './drawing-boards.component.scss',
})
export class DrawingBoardsComponent {
  readonly drawingBoardService = inject(DrawingBoardService);
  private readonly route = inject(ActivatedRoute);
  readonly boardId = signal(this.route.snapshot.paramMap.get('boardId') || DEFAULT_BOARD_ID);
  readonly definitions = this.drawingBoardService.definitions;
  readonly boards = computed(() => this.drawingBoardService.getBoardsByBoardId(this.boardId()));
  readonly activeBoardId = signal<string | null>(null);
  readonly createPanelOpen = signal(false);
  readonly selectedBoardType = signal<DrawingBoardType>('whiteboard');
  readonly newBoardName = signal('');
  readonly renamingBoardId = signal<string | null>(null);
  readonly renameValue = signal('');
  readonly deletingBoardId = signal<string | null>(null);
  readonly activeBoard = computed<DrawingBoardModel | null>(() => {
    const id = this.activeBoardId();
    if (!id) {
      return null;
    }
    return this.drawingBoardService.getBoardById(id) || null;
  });
  readonly selectedDefinition = computed(() =>
    this.drawingBoardService.getDefinition(this.selectedBoardType()),
  );
  openCreatePanel(): void {
    this.selectedBoardType.set('whiteboard');
    this.newBoardName.set('');
    this.createPanelOpen.set(true);
  }
  closeCreatePanel(): void {
    this.createPanelOpen.set(false);
    this.newBoardName.set('');
  }
  selectBoardType(type: DrawingBoardType): void {
    this.selectedBoardType.set(type);
  }
  createBoard(): void {
    const board = this.drawingBoardService.createBoard(
      this.boardId(),
      this.selectedBoardType(),
      this.newBoardName(),
    );
    this.closeCreatePanel();
    this.openBoard(board.id);
  }
  openBoard(id: string): void {
    const board = this.drawingBoardService.getBoardById(id);
    if (!board) {
      return;
    }
    this.activeBoardId.set(id);
    this.createPanelOpen.set(false);
    this.cancelRename();
    this.cancelDelete();
  }
  closeBoard(): void {
    this.activeBoardId.set(null);
  }
  getDefinition(type: DrawingBoardType): DrawingBoardDefinition {
    return this.drawingBoardService.getDefinition(type);
  }
  startRename(event: MouseEvent, board: DrawingBoardModel): void {
    event.preventDefault();
    event.stopPropagation();
    this.renamingBoardId.set(board.id);
    this.renameValue.set(board.name);
  }
  saveRename(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const id = this.renamingBoardId();
    const name = this.renameValue().trim();
    if (!id) {
      return;
    }
    if (name) {
      this.drawingBoardService.renameBoard(id, name);
    }
    this.cancelRename();
  }
  cancelRename(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.renamingBoardId.set(null);
    this.renameValue.set('');
  }
  requestDelete(event: MouseEvent, boardId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.deletingBoardId.set(boardId);
  }
  confirmDelete(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const id = this.deletingBoardId();
    if (!id) {
      return;
    }
    if (this.activeBoardId() === id) {
      this.activeBoardId.set(null);
    }
    this.drawingBoardService.deleteBoard(id);
    this.deletingBoardId.set(null);
  }
  cancelDelete(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.deletingBoardId.set(null);
  }
  onCreateNameInput(event: Event): void {
    this.newBoardName.set((event.target as HTMLInputElement).value);
  }
  onRenameInput(event: Event): void {
    this.renameValue.set((event.target as HTMLInputElement).value);
  }
  boardPreviewClass(type: DrawingBoardType): string {
    return `preview-${type}`;
  }
}

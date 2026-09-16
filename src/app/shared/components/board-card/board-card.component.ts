import { Component, computed, inject, input, output } from '@angular/core';
import { BoardModel, DEFAULT_BOARD_ID } from '../../../core/models/board.model';
import { BoardDesignService } from '../../../core/services/board-design.service';
import { BoardSurfaceComponent } from '../board-surface/board-surface.component';

@Component({
  selector: 'app-board-card',
  standalone: true,
  imports: [BoardSurfaceComponent],
  templateUrl: './board-card.component.html',
  styleUrl: './board-card.component.scss',
})
export class BoardCardComponent {
  private readonly boardDesignService = inject(BoardDesignService);
  readonly board = input.required<BoardModel>();
  readonly noteCount = input(0);
  readonly opened = output<BoardModel>();
  readonly favoriteClicked = output<BoardModel>();
  readonly editClicked = output<BoardModel>();
  readonly duplicateClicked = output<BoardModel>();
  readonly deleteClicked = output<BoardModel>();
  readonly design = computed(() => this.boardDesignService.getDesign(this.board().designId));
  readonly isDefaultBoard = computed(() => this.board().id === DEFAULT_BOARD_ID);

  open(): void {
    this.opened.emit(this.board());
  }

  favorite(event: MouseEvent): void {
    event.stopPropagation();
    this.favoriteClicked.emit(this.board());
  }

  edit(event: MouseEvent): void {
    event.stopPropagation();
    this.editClicked.emit(this.board());
  }

  duplicate(event: MouseEvent): void {
    event.stopPropagation();
    this.duplicateClicked.emit(this.board());
  }

  delete(event: MouseEvent): void {
    event.stopPropagation();
    if (this.isDefaultBoard()) {
      return;
    }
    this.deleteClicked.emit(this.board());
  }
}

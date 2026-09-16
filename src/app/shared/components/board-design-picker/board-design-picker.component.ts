import { Component, computed, inject, input, output, signal } from '@angular/core';
import { BoardDesignCategory } from '../../../core/models/board-design.model';
import { BoardDesignService } from '../../../core/services/board-design.service';
import { BoardSurfaceComponent } from '../board-surface/board-surface.component';

@Component({
  selector: 'app-board-design-picker',
  standalone: true,
  imports: [BoardSurfaceComponent],
  templateUrl: './board-design-picker.component.html',
  styleUrl: './board-design-picker.component.scss',
})
export class BoardDesignPickerComponent {
  private readonly boardDesignService = inject(BoardDesignService);
  readonly selectedDesignId = input.required<string>();
  readonly selected = output<string>();
  readonly closed = output<void>();
  readonly category = signal<BoardDesignCategory | 'all'>('all');
  readonly pendingDesignId = signal('');
  readonly categories: {
    label: string;
    value: BoardDesignCategory | 'all';
    icon: string;
  }[] = [
    { label: 'All', value: 'all', icon: 'fa-solid fa-layer-group' },
    { label: 'Cork', value: 'cork', icon: 'fa-solid fa-thumbtack' },
    { label: 'Wood', value: 'wood', icon: 'fa-solid fa-tree' },
    { label: 'Fabric', value: 'fabric', icon: 'fa-solid fa-rug' },
    { label: 'Paper', value: 'paper', icon: 'fa-regular fa-file-lines' },
    { label: 'Boards', value: 'board', icon: 'fa-solid fa-chalkboard' },
    { label: 'Industrial', value: 'industrial', icon: 'fa-solid fa-industry' },
    { label: 'Technical', value: 'technical', icon: 'fa-solid fa-compass-drafting' },
  ];
  readonly designs = computed(() => this.boardDesignService.getDesignsByCategory(this.category()));
  readonly currentDesignId = computed(() => this.pendingDesignId() || this.selectedDesignId());

  selectDesign(id: string): void {
    this.pendingDesignId.set(id);
  }

  apply(): void {
    this.selected.emit(this.currentDesignId());
  }

  close(): void {
    this.closed.emit();
  }
}

import { Component, computed, input, output, signal } from '@angular/core';
import { DrawingBoardType } from '../../../core/models/drawring-board.model';
import {
  DRAWING_STICKER_CATEGORIES,
  DRAWING_STICKERS,
} from '../../../core/constants/drawing-sticker.constant';
import {
  DrawingStickerDefinition,
  DrawingStickerCategory,
} from '../../../core/models/drawing-sticker.model';

@Component({
  selector: 'app-sticker-picker',
  standalone: true,
  imports: [],
  templateUrl: './sticker-picker.component.html',
  styleUrl: './sticker-picker.component.scss',
})
export class StickerPickerComponent {
  readonly boardType = input<DrawingBoardType>('whiteboard');
  readonly stickerSelected = output<DrawingStickerDefinition>();
  readonly closed = output<void>();
  readonly categories = DRAWING_STICKER_CATEGORIES;
  readonly stickers = DRAWING_STICKERS;
  readonly activeCategory = signal<DrawingStickerCategory | 'all'>('all');
  readonly searchQuery = signal('');
  readonly filteredStickers = computed(() => {
    const category = this.activeCategory();
    const query = this.searchQuery().trim().toLowerCase();
    return this.stickers.filter((sticker) => {
      const categoryMatches = category === 'all' || sticker.category === category;
      const searchMatches =
        !query ||
        sticker.name.toLowerCase().includes(query) ||
        sticker.category.toLowerCase().includes(query) ||
        sticker.value.toLowerCase().includes(query) ||
        sticker.keywords.some((keyword) => keyword.toLowerCase().includes(query));
      return categoryMatches && searchMatches;
    });
  });
  readonly recommendedStickers = computed(() => {
    const boardType = this.boardType();
    return this.stickers.filter((sticker) => sticker.boardTypes?.includes(boardType)).slice(0, 18);
  });
  readonly resultCount = computed(() => this.filteredStickers().length);
  setCategory(category: DrawingStickerCategory | 'all'): void {
    this.activeCategory.set(category);
  }
  updateSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }
  clearSearch(): void {
    this.searchQuery.set('');
  }
  selectSticker(sticker: DrawingStickerDefinition): void {
    this.stickerSelected.emit(sticker);
  }
  close(): void {
    this.closed.emit();
  }
  backdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}

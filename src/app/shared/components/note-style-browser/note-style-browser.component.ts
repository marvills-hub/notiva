import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NoteStyleCategory } from '../../../core/models/note-style.model';
import { NoteStyleService } from '../../../core/services/note-style.service';
import { NoteDesignComponent } from '../note-design/note-design.component';

@Component({
  selector: 'app-note-style-browser',
  standalone: true,
  imports: [NoteDesignComponent],
  templateUrl: './note-style-browser.component.html',
  styleUrl: './note-style-browser.component.scss',
})
export class NoteStyleBrowserComponent {
  private readonly noteStyleService = inject(NoteStyleService);

  readonly selectedStyleId = input.required<string>();
  readonly selected = output<string>();
  readonly closed = output<void>();

  readonly searchQuery = signal('');
  readonly selectedCategory = signal<'all' | NoteStyleCategory>('all');

  readonly styles = this.noteStyleService.styles;

  readonly categories: {
    value: 'all' | NoteStyleCategory;
    label: string;
    icon: string;
  }[] = [
    {
      value: 'all',
      label: 'All',
      icon: 'fa-solid fa-layer-group',
    },
    {
      value: 'paper',
      label: 'Paper',
      icon: 'fa-regular fa-note-sticky',
    },
    {
      value: 'retro',
      label: 'Retro',
      icon: 'fa-solid fa-camera-retro',
    },
    {
      value: 'artistic',
      label: 'Artistic',
      icon: 'fa-solid fa-palette',
    },
    {
      value: 'nature',
      label: 'Nature',
      icon: 'fa-solid fa-leaf',
    },
    {
      value: 'cute',
      label: 'Cute',
      icon: 'fa-regular fa-heart',
    },
    {
      value: 'animal',
      label: 'Animal',
      icon: 'fa-solid fa-paw',
    },
    {
      value: 'food',
      label: 'Food',
      icon: 'fa-solid fa-cookie-bite',
    },
    {
      value: 'fantasy',
      label: 'Fantasy',
      icon: 'fa-solid fa-wand-magic-sparkles',
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: 'fa-solid fa-moon',
    },
    {
      value: 'tech',
      label: 'Tech',
      icon: 'fa-solid fa-microchip',
    },
  ];

  readonly filteredStyles = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();

    const category = this.selectedCategory();

    return this.styles.filter((style) => {
      const matchesCategory = category === 'all' || style.category === category;

      const matchesSearch =
        !query ||
        style.name.toLowerCase().includes(query) ||
        style.id.toLowerCase().includes(query) ||
        style.category.toLowerCase().includes(query) ||
        style.pattern.toLowerCase().includes(query) ||
        style.decoration.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  });

  selectStyle(styleId: string): void {
    this.selected.emit(styleId);
    this.closed.emit();
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  closeBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}

import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChecklistItemModel,
  IdeaPriority,
  IdeaStatus,
  NoteModel,
  NoteType,
} from '../../../core/models/note.model';
import { NoteStyleCategory } from '../../../core/models/note-style.model';
import { NoteStyleService } from '../../../core/services/note-style.service';
import { NoteDesignComponent } from '../note-design/note-design.component';
import { NotePinComponent } from '../note-pin/note-pin.component';
import { NoteStyleBrowserComponent } from '../note-style-browser/note-style-browser.component';
@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [FormsModule, NoteDesignComponent, NotePinComponent, NoteStyleBrowserComponent],
  templateUrl: './note-editor.component.html',
  styleUrl: './note-editor.component.scss',
})
export class NoteEditorComponent {
  private readonly noteStyleService = inject(NoteStyleService);
  readonly note = input.required<NoteModel>();
  readonly creating = input(false);
  readonly saved = output<Partial<NoteModel>>();
  readonly closed = output<void>();
  readonly calendarSelected = output<void>();
  readonly title = signal('');
  readonly content = signal('');
  readonly type = signal<NoteType>('text');
  readonly styleId = signal('');
  readonly pinId = signal('');
  readonly tagsText = signal('');
  readonly checklistItems = signal<ChecklistItemModel[]>([]);
  readonly reminderAt = signal<string | null>(null);
  readonly quoteAuthor = signal('');
  readonly ideaStatus = signal<IdeaStatus>('new');
  readonly ideaPriority = signal<IdeaPriority>('medium');
  readonly styleSearch = signal('');
  readonly selectedCategory = signal<'all' | NoteStyleCategory>('all');
  readonly styleBrowserOpen = signal(false);
  readonly styles = this.noteStyleService.styles;
  readonly pins = this.noteStyleService.pins;
  readonly noteTypes: {
    label: string;
    type: NoteType;
    icon: string;
  }[] = [
    { label: 'Text', type: 'text', icon: 'fa-regular fa-note-sticky' },
    { label: 'Checklist', type: 'checklist', icon: 'fa-solid fa-list-check' },
    { label: 'Idea', type: 'idea', icon: 'fa-regular fa-lightbulb' },
    { label: 'Reminder', type: 'reminder', icon: 'fa-regular fa-clock' },
    { label: 'Quote', type: 'quote', icon: 'fa-solid fa-quote-left' },
    { label: 'Calendar', type: 'calendar', icon: 'fa-regular fa-calendar-days' },
  ];
  readonly categories: {
    label: string;
    value: 'all' | NoteStyleCategory;
  }[] = [
    { label: 'All', value: 'all' },
    { label: 'Paper', value: 'paper' },
    { label: 'Retro', value: 'retro' },
    { label: 'Artistic', value: 'artistic' },
    { label: 'Nature', value: 'nature' },
    { label: 'Cute', value: 'cute' },
    { label: 'Animal', value: 'animal' },
    { label: 'Food', value: 'food' },
    { label: 'Fantasy', value: 'fantasy' },
    { label: 'Dark', value: 'dark' },
    { label: 'Tech', value: 'tech' },
  ];
  readonly selectedStyle = computed(() => this.noteStyleService.getStyle(this.styleId()));
  readonly selectedPin = computed(() => this.noteStyleService.getPin(this.pinId()));
  readonly noteTypeLabel = computed(() => {
    return this.noteTypes.find((item) => item.type === this.type())?.label || 'Text';
  });
  readonly noteTypeIcon = computed(() => {
    return (
      this.noteTypes.find((item) => item.type === this.type())?.icon || 'fa-regular fa-note-sticky'
    );
  });
  readonly filteredStyles = computed(() => {
    const search = this.styleSearch().trim().toLowerCase();
    const category = this.selectedCategory();
    return this.styles.filter((style) => {
      const matchesCategory = category === 'all' || style.category === category;
      const matchesSearch =
        !search ||
        style.name.toLowerCase().includes(search) ||
        style.id.toLowerCase().includes(search) ||
        style.category.toLowerCase().includes(search);
      return matchesCategory && matchesSearch;
    });
  });
  constructor() {
    effect(() => {
      const note = this.note();
      this.title.set(note.title);
      this.content.set(note.content);
      this.type.set(note.type);
      this.styleId.set(this.noteStyleService.resolveStyleId(note.styleId));
      this.pinId.set(note.pinId);
      this.tagsText.set(note.tags.join(', '));
      this.checklistItems.set(note.checklistItems.map((item) => ({ ...item })));
      this.reminderAt.set(note.reminderAt);
      this.quoteAuthor.set(note.quoteAuthor);
      this.ideaStatus.set(note.ideaStatus);
      this.ideaPriority.set(note.ideaPriority);
    });
  }
  selectType(type: NoteType): void {
    if (!this.creating()) {
      return;
    }
    if (type === 'calendar') {
      this.calendarSelected.emit();
      return;
    }
    this.type.set(type);
  }
  selectStyle(styleId: string): void {
    this.styleId.set(styleId);
  }
  selectPin(pinId: string): void {
    this.pinId.set(pinId);
  }
  openStyleBrowser(): void {
    this.styleBrowserOpen.set(true);
  }
  closeStyleBrowser(): void {
    this.styleBrowserOpen.set(false);
  }
  selectBrowserStyle(styleId: string): void {
    this.styleId.set(styleId);
    this.styleBrowserOpen.set(false);
  }
  randomizeAppearance(): void {
    if (this.styles.length) {
      const currentStyleId = this.styleId();
      const availableStyles =
        this.styles.length > 1
          ? this.styles.filter((style) => style.id !== currentStyleId)
          : this.styles;
      const style = availableStyles[Math.floor(Math.random() * availableStyles.length)];
      if (style) {
        this.styleId.set(style.id);
      }
    }
    const usablePins = this.pins.filter((pin) => pin.type !== 'none');
    if (usablePins.length) {
      const pin = usablePins[Math.floor(Math.random() * usablePins.length)];
      if (pin) {
        this.pinId.set(pin.id);
      }
    }
  }
  addChecklistItem(): void {
    const item: ChecklistItemModel = {
      id: this.createId(),
      text: '',
      completed: false,
    };
    this.checklistItems.update((items) => [...items, item]);
  }
  updateChecklistItem(itemId: string, text: string): void {
    this.checklistItems.update((items) =>
      items.map((item) => (item.id === itemId ? { ...item, text } : item)),
    );
  }
  toggleChecklistItem(itemId: string): void {
    this.checklistItems.update((items) =>
      items.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item)),
    );
  }
  removeChecklistItem(itemId: string): void {
    this.checklistItems.update((items) => items.filter((item) => item.id !== itemId));
  }
  save(): void {
    const tags = this.tagsText()
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag, index, items) => !!tag && items.indexOf(tag) === index);
    const checklistItems = this.checklistItems()
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text);
    this.saved.emit({
      title: this.title().trim(),
      content: this.content().trim(),
      type: this.type(),
      styleId: this.styleId(),
      pinId: this.pinId(),
      tags,
      checklistItems,
      reminderAt: this.type() === 'reminder' ? this.reminderAt() : null,
      quoteAuthor: this.type() === 'quote' ? this.quoteAuthor().trim() : '',
      ideaStatus: this.type() === 'idea' ? this.ideaStatus() : 'new',
      ideaPriority: this.type() === 'idea' ? this.ideaPriority() : 'medium',
      updatedAt: new Date(),
    });
  }
  private createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

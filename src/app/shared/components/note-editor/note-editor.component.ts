import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChecklistItemModel,
  IdeaPriority,
  IdeaStatus,
  NoteModel,
  NoteType,
} from '../../../core/models/note.model';
import { NoteStyleService } from '../../../core/services/note-style.service';
import { NoteDesignComponent } from '../note-design/note-design.component';
import { NotePinComponent } from '../note-pin/note-pin.component';

type RichCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'justifyLeft'
  | 'justifyCenter'
  | 'justifyRight'
  | 'removeFormat';

@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [FormsModule, NoteDesignComponent, NotePinComponent],
  templateUrl: './note-editor.component.html',
  styleUrl: './note-editor.component.scss',
})
export class NoteEditorComponent implements AfterViewInit {
  @ViewChild('titleEditor') titleEditor?: ElementRef<HTMLElement>;
  @ViewChild('richEditor') richEditor?: ElementRef<HTMLElement>;
  @ViewChildren('checklistEditor') checklistEditors?: QueryList<ElementRef<HTMLElement>>;

  private readonly noteStyleService = inject(NoteStyleService);
  private activeEditor: HTMLElement | null = null;
  private savedRange: Range | null = null;

  readonly note = input.required<NoteModel>();
  readonly creating = input(false);
  readonly saved = output<Partial<NoteModel>>();
  readonly closed = output<void>();
  readonly calendarSelected = output<void>();

  readonly title = signal('');
  readonly titleHtml = signal('');
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

  readonly designOpen = signal(false);
  readonly pinOpen = signal(false);
  readonly typeOpen = signal(false);
  readonly detailsOpen = signal(false);
  readonly designSearch = signal('');

  readonly boldActive = signal(false);
  readonly italicActive = signal(false);
  readonly underlineActive = signal(false);
  readonly strikeActive = signal(false);
  readonly unorderedListActive = signal(false);
  readonly orderedListActive = signal(false);
  readonly alignLeftActive = signal(false);
  readonly alignCenterActive = signal(false);
  readonly alignRightActive = signal(false);

  readonly styles = this.noteStyleService.styles;
  readonly pins = this.noteStyleService.pins;

  readonly noteTypes: { label: string; type: NoteType; icon: string }[] = [
    { label: 'Text', type: 'text', icon: 'fa-regular fa-note-sticky' },
    { label: 'Checklist', type: 'checklist', icon: 'fa-solid fa-list-check' },
    { label: 'Idea', type: 'idea', icon: 'fa-regular fa-lightbulb' },
    { label: 'Reminder', type: 'reminder', icon: 'fa-regular fa-clock' },
    { label: 'Quote', type: 'quote', icon: 'fa-solid fa-quote-left' },
    { label: 'Calendar', type: 'calendar', icon: 'fa-regular fa-calendar-days' },
  ];

  readonly selectedStyle = computed(() => this.noteStyleService.getStyle(this.styleId()));

  readonly selectedPin = computed(() => this.noteStyleService.getPin(this.pinId()));

  readonly noteTypeLabel = computed(
    () => this.noteTypes.find((item) => item.type === this.type())?.label || 'Text',
  );

  readonly noteTypeIcon = computed(
    () =>
      this.noteTypes.find((item) => item.type === this.type())?.icon || 'fa-regular fa-note-sticky',
  );

  readonly supportsRichText = computed(() => this.type() !== 'calendar');

  readonly filteredStyles = computed(() => {
    const search = this.designSearch().trim().toLowerCase();

    if (!search) return this.styles;

    return this.styles.filter(
      (style) =>
        style.name.toLowerCase().includes(search) ||
        style.category.toLowerCase().includes(search) ||
        style.id.toLowerCase().includes(search),
    );
  });

  constructor() {
    effect(() => {
      const note = this.note();
      const storedTitleHtml = note.titleHtml || this.escapeHtml(note.title);

      this.title.set(note.title);
      this.titleHtml.set(storedTitleHtml);
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

      this.activeEditor = null;
      this.savedRange = null;
      this.resetFormattingState();

      queueMicrotask(() => this.syncEditors());
    });
  }

  ngAfterViewInit(): void {
    this.syncEditors();
  }

  @HostListener('document:selectionchange')
  onSelectionChange(): void {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const editor = this.findRichEditor(range.commonAncestorContainer);

    if (!editor) return;

    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      return;
    }

    this.activeEditor = editor;
    this.savedRange = range.cloneRange();
    this.readFormattingState();
  }

  richPlaceholder(): string {
    if (this.type() === 'quote') return 'Write your quote...';
    if (this.type() === 'reminder') return 'What do you want to remember?';
    if (this.type() === 'idea') return 'Describe your idea...';
    return 'Write something...';
  }

  selectType(type: NoteType): void {
    if (!this.creating()) return;

    if (type === 'calendar') {
      this.calendarSelected.emit();
      return;
    }

    this.syncAllEditors();
    this.type.set(type);
    this.typeOpen.set(false);
    this.activeEditor = null;
    this.savedRange = null;
    this.resetFormattingState();

    queueMicrotask(() => this.syncEditors());
  }

  selectStyle(styleId: string): void {
    this.styleId.set(styleId);
    this.designOpen.set(false);
  }

  selectPin(pinId: string): void {
    this.pinId.set(pinId);
    this.pinOpen.set(false);
  }

  toggleDesign(): void {
    this.designOpen.update((open) => !open);
    this.pinOpen.set(false);
    this.typeOpen.set(false);
  }

  togglePin(): void {
    this.pinOpen.update((open) => !open);
    this.designOpen.set(false);
    this.typeOpen.set(false);
  }

  toggleType(): void {
    if (!this.creating()) return;

    this.typeOpen.update((open) => !open);
    this.designOpen.set(false);
    this.pinOpen.set(false);
  }

  toggleDetails(): void {
    this.detailsOpen.update((open) => !open);
  }

  activateRichEditor(event: Event): void {
    const editor = event.currentTarget as HTMLElement;

    this.activeEditor = editor;
    this.captureSelection(editor);
  }

  onRichInput(event: Event): void {
    const editor = event.currentTarget as HTMLElement;

    this.activeEditor = editor;
    this.syncEditorValue(editor);
    this.captureSelection(editor);
  }

  onRichSelectionChange(event: Event): void {
    const editor = event.currentTarget as HTMLElement;

    this.activeEditor = editor;
    this.captureSelection(editor);
  }

  formatText(event: PointerEvent, command: RichCommand): void {
    event.preventDefault();
    event.stopPropagation();

    const editor = this.activeEditor;
    const savedRange = this.savedRange;

    if (!editor || !savedRange) return;

    if (!editor.contains(savedRange.startContainer) || !editor.contains(savedRange.endContainer)) {
      return;
    }

    const selection = window.getSelection();

    if (!selection) return;

    editor.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(savedRange);

    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false);

    this.syncEditorValue(editor);

    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      if (editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
        this.savedRange = range.cloneRange();
      }
    }

    this.readFormattingState();
  }

  randomizeAppearance(): void {
    if (this.styles.length) {
      const available =
        this.styles.length > 1
          ? this.styles.filter((style) => style.id !== this.styleId())
          : this.styles;

      const style = available[Math.floor(Math.random() * available.length)];

      if (style) this.styleId.set(style.id);
    }

    const usablePins = this.pins.filter((pin) => pin.type !== 'none');

    if (usablePins.length) {
      const pin = usablePins[Math.floor(Math.random() * usablePins.length)];

      if (pin) this.pinId.set(pin.id);
    }
  }

  addChecklistItem(): void {
    this.checklistItems.update((items) => [
      ...items,
      {
        id: this.createId(),
        text: '',
        completed: false,
      },
    ]);
  }

  toggleChecklistItem(itemId: string): void {
    this.checklistItems.update((items) =>
      items.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item)),
    );
  }

  removeChecklistItem(itemId: string): void {
    this.checklistItems.update((items) => items.filter((item) => item.id !== itemId));

    if (this.activeEditor?.dataset['checklistId'] === itemId) {
      this.activeEditor = null;
      this.savedRange = null;
      this.resetFormattingState();
    }
  }

  save(): void {
    this.syncAllEditors();

    const tags = this.tagsText()
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag, index, items) => !!tag && items.indexOf(tag) === index);

    const checklistItems = this.checklistItems()
      .map((item) => ({
        ...item,
        text: item.text.trim(),
      }))
      .filter((item) => this.htmlToText(item.text).trim());

    this.saved.emit({
      title: this.title().trim(),
      titleHtml: this.titleHtml().trim(),
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

  private captureSelection(editor: HTMLElement): void {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      return;
    }

    this.activeEditor = editor;
    this.savedRange = range.cloneRange();
    this.readFormattingState();
  }

  private syncEditors(): void {
    const titleEditor = this.titleEditor?.nativeElement;
    const contentEditor = this.richEditor?.nativeElement;

    if (titleEditor && titleEditor.innerHTML !== this.titleHtml()) {
      titleEditor.innerHTML = this.titleHtml();
    }

    if (
      contentEditor &&
      this.type() !== 'checklist' &&
      contentEditor.innerHTML !== this.content()
    ) {
      contentEditor.innerHTML = this.content();
    }
  }

  private syncAllEditors(): void {
    const titleEditor = this.titleEditor?.nativeElement;

    if (titleEditor) {
      this.titleHtml.set(titleEditor.innerHTML);
      this.title.set(this.htmlToText(titleEditor.innerHTML).trim());
    }

    const contentEditor = this.richEditor?.nativeElement;

    if (contentEditor && this.type() !== 'checklist') {
      this.content.set(contentEditor.innerHTML);
    }

    this.checklistEditors?.forEach((editorRef) => {
      this.syncEditorValue(editorRef.nativeElement);
    });
  }

  private syncEditorValue(editor: HTMLElement): void {
    if (editor.dataset['editorType'] === 'title') {
      this.titleHtml.set(editor.innerHTML);
      this.title.set(this.htmlToText(editor.innerHTML));
      return;
    }

    const checklistId = editor.dataset['checklistId'];

    if (checklistId) {
      const html = editor.innerHTML;

      this.checklistItems.update((items) =>
        items.map((item) => (item.id === checklistId ? { ...item, text: html } : item)),
      );

      return;
    }

    this.content.set(editor.innerHTML);
  }

  private findRichEditor(node: Node): HTMLElement | null {
    let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;

    while (current) {
      if (
        current.nodeType === Node.ELEMENT_NODE &&
        (current as HTMLElement).classList.contains('rich-editor') &&
        (current as HTMLElement).isContentEditable
      ) {
        return current as HTMLElement;
      }

      current = current.parentNode;
    }

    return null;
  }

  private updateFormattingState(): void {
    const editor = this.activeEditor;
    const range = this.savedRange;

    if (
      !editor ||
      !range ||
      !editor.contains(range.startContainer) ||
      !editor.contains(range.endContainer)
    ) {
      this.resetFormattingState();
      return;
    }

    this.readFormattingState();
  }

  private readFormattingState(): void {
    this.boldActive.set(document.queryCommandState('bold'));
    this.italicActive.set(document.queryCommandState('italic'));
    this.underlineActive.set(document.queryCommandState('underline'));
    this.strikeActive.set(document.queryCommandState('strikeThrough'));
    this.unorderedListActive.set(document.queryCommandState('insertUnorderedList'));
    this.orderedListActive.set(document.queryCommandState('insertOrderedList'));
    this.alignLeftActive.set(document.queryCommandState('justifyLeft'));
    this.alignCenterActive.set(document.queryCommandState('justifyCenter'));
    this.alignRightActive.set(document.queryCommandState('justifyRight'));
  }

  private resetFormattingState(): void {
    this.boldActive.set(false);
    this.italicActive.set(false);
    this.underlineActive.set(false);
    this.strikeActive.set(false);
    this.unorderedListActive.set(false);
    this.orderedListActive.set(false);
    this.alignLeftActive.set(false);
    this.alignCenterActive.set(false);
    this.alignRightActive.set(false);
  }

  private htmlToText(html: string): string {
    const element = document.createElement('div');

    element.innerHTML = html;

    return element.textContent || '';
  }

  private escapeHtml(value: string): string {
    const element = document.createElement('div');

    element.textContent = value;

    return element.innerHTML;
  }

  private createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

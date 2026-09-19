import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChecklistItemModel,
  IdeaPriority,
  IdeaStatus,
  NoteAttachmentModel,
  NoteModel,
  NoteType,
} from '../../../core/models/note.model';
import { NoteStyleService } from '../../../core/services/note-style.service';
import { NoteDesignComponent } from '../note-design/note-design.component';
import { NotePinComponent } from '../note-pin/note-pin.component';

export interface NoteEditorSaveEvent {
  changes: Partial<NoteModel>;
  files: File[];
  removedAttachmentIds: string[];
}

interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl: string | null;
}

type RichEditorTarget = 'title' | 'content';

@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [FormsModule, NoteDesignComponent, NotePinComponent],
  templateUrl: './note-editor.component.html',
  styleUrl: './note-editor.component.scss',
})
export class NoteEditorComponent implements OnDestroy {
  @ViewChild('attachmentInput') attachmentInput?: ElementRef<HTMLInputElement>;
  @ViewChild('titleEditor') titleEditor?: ElementRef<HTMLDivElement>;
  @ViewChild('richEditor') richEditor?: ElementRef<HTMLDivElement>;

  private readonly noteStyleService = inject(NoteStyleService);
  private loadedNoteId: string | null = null;
  private savedSelection: Range | null = null;

  readonly note = input.required<NoteModel>();
  readonly creating = input(false);
  readonly saved = output<NoteEditorSaveEvent>();
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
  readonly existingAttachments = signal<NoteAttachmentModel[]>([]);
  readonly pendingAttachments = signal<PendingAttachment[]>([]);
  readonly removedAttachmentIds = signal<string[]>([]);

  readonly designOpen = signal(false);
  readonly pinOpen = signal(false);
  readonly typeOpen = signal(false);
  readonly detailsOpen = signal(false);
  readonly designSearch = signal('');
  readonly activeEditor = signal<RichEditorTarget>('content');
  readonly activeFormats = signal<Set<string>>(new Set());

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

  readonly attachmentCount = computed(
    () => this.existingAttachments().length + this.pendingAttachments().length,
  );

  readonly totalAttachmentSize = computed(
    () =>
      this.existingAttachments().reduce((total, attachment) => total + attachment.size, 0) +
      this.pendingAttachments().reduce((total, attachment) => total + attachment.size, 0),
  );

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
      if (this.loadedNoteId === note.id) return;

      this.loadedNoteId = note.id;
      untracked(() => this.loadNote(note));
    });
  }

  ngOnDestroy(): void {
    this.clearPendingPreviews();
  }

  richPlaceholder(): string {
    if (this.type() === 'quote') return 'Write your quote...';
    if (this.type() === 'reminder') return 'What do you want to remember?';
    if (this.type() === 'idea') return 'Describe your idea...';
    return 'Write something...';
  }

  activateEditor(target: RichEditorTarget): void {
    this.activeEditor.set(target);
    this.captureSelection();
    this.updateActiveFormats();
  }

  onTitleInput(): void {
    const editor = this.titleEditor?.nativeElement;
    if (!editor) return;

    const html = this.normalizeEditorHtml(editor.innerHTML);
    this.titleHtml.set(html);
    this.title.set((editor.textContent || '').trim());
    this.activeEditor.set('title');
    this.captureSelection();
    this.updateActiveFormats();
  }

  onRichInput(): void {
    const editor = this.richEditor?.nativeElement;
    if (!editor) return;

    this.content.set(this.normalizeEditorHtml(editor.innerHTML));
    this.activeEditor.set('content');
    this.captureSelection();
    this.updateActiveFormats();
  }

  format(command: string, value?: string): void {
    const editor = this.getActiveEditor();
    if (!editor) return;

    this.restoreSelection();
    editor.focus();

    try {
      document.execCommand(command, false, value);
    } catch {
      return;
    }

    this.syncActiveEditor();
    this.captureSelection();
    this.updateActiveFormats();
  }

  formatBlock(tag: string): void {
    this.format('formatBlock', tag);
  }

  clearFormatting(): void {
    const editor = this.getActiveEditor();
    if (!editor) return;

    this.restoreSelection();
    editor.focus();

    try {
      document.execCommand('removeFormat');
      document.execCommand('unlink');
    } catch {
      return;
    }

    this.syncActiveEditor();
    this.captureSelection();
    this.updateActiveFormats();
  }

  isFormatActive(command: string): boolean {
    return this.activeFormats().has(command);
  }

  updateActiveFormats(): void {
    const commands = [
      'bold',
      'italic',
      'underline',
      'strikeThrough',
      'insertUnorderedList',
      'insertOrderedList',
      'justifyLeft',
      'justifyCenter',
      'justifyRight',
    ];

    const active = new Set<string>();

    for (const command of commands) {
      try {
        if (document.queryCommandState(command)) active.add(command);
      } catch {}
    }

    this.activeFormats.set(active);
  }

  preserveSelection(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.captureSelection();
  }

  selectType(type: NoteType): void {
    if (!this.creating()) return;

    if (type === 'calendar') {
      this.calendarSelected.emit();
      return;
    }

    this.type.set(type);
    this.typeOpen.set(false);
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

  updateChecklistItem(itemId: string, text: string): void {
    this.checklistItems.update((items) =>
      items.map((item) => (item.id === itemId ? { ...item, text } : item)),
    );
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
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed: !item.completed,
            }
          : item,
      ),
    );
  }

  removeChecklistItem(itemId: string): void {
    this.checklistItems.update((items) => items.filter((item) => item.id !== itemId));
  }

  openAttachmentPicker(): void {
    this.attachmentInput?.nativeElement.click();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    if (!files.length) return;

    const existingKeys = new Set([
      ...this.existingAttachments().map((attachment) => `${attachment.name}-${attachment.size}`),
      ...this.pendingAttachments().map((attachment) => `${attachment.name}-${attachment.size}`),
    ]);

    const additions: PendingAttachment[] = [];

    for (const file of files) {
      const key = `${file.name}-${file.size}`;

      if (existingKeys.has(key)) continue;

      existingKeys.add(key);

      additions.push({
        id: this.createId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      });
    }

    if (additions.length) {
      this.pendingAttachments.update((attachments) => [...attachments, ...additions]);
    }

    input.value = '';
  }

  removePendingAttachment(id: string): void {
    const attachment = this.pendingAttachments().find((item) => item.id === id);

    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }

    this.pendingAttachments.update((attachments) => attachments.filter((item) => item.id !== id));
  }

  removeExistingAttachment(id: string): void {
    this.existingAttachments.update((attachments) =>
      attachments.filter((attachment) => attachment.id !== id),
    );

    this.removedAttachmentIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  openExistingAttachment(attachment: NoteAttachmentModel): void {
    if (!attachment.url) return;

    window.open(attachment.url, '_blank', 'noopener,noreferrer');
  }

  getAttachmentIcon(mimeType: string, name: string): string {
    const extension = name.split('.').pop()?.toLowerCase() || '';

    if (mimeType.startsWith('image/')) return 'fa-regular fa-image';
    if (mimeType.startsWith('video/')) return 'fa-regular fa-file-video';
    if (mimeType.startsWith('audio/')) return 'fa-regular fa-file-audio';
    if (mimeType === 'application/pdf' || extension === 'pdf') {
      return 'fa-regular fa-file-pdf';
    }
    if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) {
      return 'fa-regular fa-file-word';
    }
    if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) {
      return 'fa-regular fa-file-excel';
    }
    if (['ppt', 'pptx', 'odp'].includes(extension)) {
      return 'fa-regular fa-file-powerpoint';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return 'fa-regular fa-file-zipper';
    }
    if (mimeType.startsWith('text/') || ['txt', 'md'].includes(extension)) {
      return 'fa-regular fa-file-lines';
    }

    return 'fa-regular fa-file';
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  randomizeAppearance(): void {
    if (this.styles.length) {
      const available =
        this.styles.length > 1
          ? this.styles.filter((style) => style.id !== this.styleId())
          : this.styles;

      const style = available[Math.floor(Math.random() * available.length)];

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

  save(): void {
    this.syncEditors();

    const tags = this.tagsText()
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag, index, items) => !!tag && items.indexOf(tag) === index);

    const checklistItems = this.checklistItems()
      .map((item) => ({
        ...item,
        text: item.text.trim(),
      }))
      .filter((item) => !!item.text);

    this.saved.emit({
      changes: {
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
      },
      files: this.pendingAttachments().map((attachment) => attachment.file),
      removedAttachmentIds: [...this.removedAttachmentIds()],
    });
  }

  private getActiveEditor(): HTMLElement | null {
    if (this.activeEditor() === 'title') {
      return this.titleEditor?.nativeElement || null;
    }

    return this.richEditor?.nativeElement || null;
  }

  private syncActiveEditor(): void {
    if (this.activeEditor() === 'title') {
      const editor = this.titleEditor?.nativeElement;
      if (!editor) return;

      this.titleHtml.set(this.normalizeEditorHtml(editor.innerHTML));
      this.title.set((editor.textContent || '').trim());
      return;
    }

    const editor = this.richEditor?.nativeElement;
    if (!editor) return;

    this.content.set(this.normalizeEditorHtml(editor.innerHTML));
  }

  private syncEditors(): void {
    const titleEditor = this.titleEditor?.nativeElement;

    if (titleEditor) {
      this.titleHtml.set(this.normalizeEditorHtml(titleEditor.innerHTML));
      this.title.set((titleEditor.textContent || '').trim());
    }

    const contentEditor = this.richEditor?.nativeElement;

    if (contentEditor && this.type() !== 'checklist') {
      this.content.set(this.normalizeEditorHtml(contentEditor.innerHTML));
    }
  }

  private captureSelection(): void {
    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const editor = this.getActiveEditor();

    if (!editor) return;

    const container =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : (range.commonAncestorContainer as HTMLElement);

    if (!container || !editor.contains(container)) return;

    this.savedSelection = range.cloneRange();
  }

  private restoreSelection(): void {
    if (!this.savedSelection) return;

    const selection = window.getSelection();

    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(this.savedSelection);
  }

  private normalizeEditorHtml(html: string): string {
    const value = html.trim();

    if (!value || value === '<br>' || value === '<div><br></div>' || value === '<p><br></p>') {
      return '';
    }

    return html;
  }

  private loadNote(note: NoteModel): void {
    this.clearPendingPreviews();

    const plainTitle = note.title || '';
    const formattedTitle = note.titleHtml?.trim() || this.escapeHtml(plainTitle);

    this.title.set(plainTitle);
    this.titleHtml.set(formattedTitle);
    this.content.set(note.content || '');
    this.type.set(note.type);
    this.styleId.set(this.noteStyleService.resolveStyleId(note.styleId));
    this.pinId.set(note.pinId);
    this.tagsText.set((note.tags || []).join(', '));
    this.checklistItems.set((note.checklistItems || []).map((item) => ({ ...item })));
    this.reminderAt.set(note.reminderAt ?? null);
    this.quoteAuthor.set(note.quoteAuthor || '');
    this.ideaStatus.set(note.ideaStatus || 'new');
    this.ideaPriority.set(note.ideaPriority || 'medium');
    this.existingAttachments.set(
      (note.attachments || []).map((attachment) => ({
        ...attachment,
      })),
    );
    this.pendingAttachments.set([]);
    this.removedAttachmentIds.set([]);
    this.designOpen.set(false);
    this.pinOpen.set(false);
    this.typeOpen.set(false);
    this.detailsOpen.set(false);
    this.designSearch.set('');
    this.activeEditor.set('content');
    this.activeFormats.set(new Set());
    this.savedSelection = null;
  }

  private clearPendingPreviews(): void {
    const attachments = untracked(() => this.pendingAttachments());

    for (const attachment of attachments) {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }
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

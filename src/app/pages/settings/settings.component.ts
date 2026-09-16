import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NoteType } from '../../core/models/note.model';
import { BoardService } from '../../core/services/board.service';
import { DrawingBoardService } from '../../core/services/drawing-board.service';
import { NoteService } from '../../core/services/note.service';
import { SettingsService } from '../../core/services/settings.service';
type SettingsSection = 'appearance' | 'notes' | 'boards' | 'behavior' | 'data' | 'about';
type ConfirmationType = 'reset-settings' | 'reset-data' | null;
@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  readonly settingsService = inject(SettingsService);
  private readonly boardService = inject(BoardService);
  private readonly noteService = inject(NoteService);
  private readonly drawingBoardService = inject(DrawingBoardService);
  private readonly router = inject(Router);
  readonly activeSection = signal<SettingsSection>('appearance');
  readonly confirmation = signal<ConfirmationType>(null);
  readonly importError = signal('');
  readonly imported = signal(false);
  readonly exportError = signal('');
  readonly exported = signal(false);
  readonly eraseError = signal('');
  readonly settings = this.settingsService.settings;
  readonly importing = this.settingsService.importing;
  readonly exporting = this.settingsService.exporting;
  readonly noteTypes: { value: NoteType; label: string; icon: string }[] = [
    { value: 'text', label: 'Text Note', icon: 'fa-regular fa-note-sticky' },
    { value: 'checklist', label: 'Checklist', icon: 'fa-solid fa-list-check' },
    { value: 'idea', label: 'Idea', icon: 'fa-regular fa-lightbulb' },
    { value: 'reminder', label: 'Reminder', icon: 'fa-regular fa-clock' },
    { value: 'quote', label: 'Quote', icon: 'fa-solid fa-quote-left' },
  ];
  readonly noteStyles = [
    { id: 'classic-yellow', name: 'Classic Butter' },
    { id: 'clean-paper', name: 'Soft Ivory' },
    { id: 'blue-notebook-rip', name: 'Notebook Blue' },
    { id: 'pink-spiral-sheet', name: 'Blush Spiral' },
    { id: 'purple-curled-letter', name: 'Lavender Letter' },
    { id: 'orange-ticket', name: 'Terracotta Ticket' },
    { id: 'mint-postage', name: 'Seafoam Postage' },
    { id: 'memo-pad', name: 'Desk Memo' },
    { id: 'rose-flower', name: 'Pressed Rose' },
    { id: 'olive-leaf', name: 'Botanical Olive' },
    { id: 'orange-maple', name: 'Autumn Maple' },
    { id: 'teal-wave', name: 'Coastal Teal' },
    { id: 'slate-mountain', name: 'Mountain Grey' },
    { id: 'burgundy-spellbook', name: 'Burgundy Journal' },
    { id: 'bronze-steampunk', name: 'Bronze Workshop' },
    { id: 'midnight-stars', name: 'Midnight Paper' },
    { id: 'dark-note', name: 'Charcoal Paper' },
    { id: 'blueprint-paper', name: 'Architect Blueprint' },
    { id: 'neon-cyber', name: 'Muted Cyber' },
    { id: 'blue-pixel', name: 'Retro Pixel' },
    { id: 'yellow-comic', name: 'Editorial Pop' },
  ];
  readonly pins = [
    { id: 'red-pin', name: 'Coral Pin' },
    { id: 'blue-pin', name: 'Blue Pin' },
    { id: 'purple-pin', name: 'Purple Pin' },
    { id: 'green-pin', name: 'Green Pin' },
  ];
  readonly sections: {
    id: SettingsSection;
    label: string;
    description: string;
    icon: string;
  }[] = [
    {
      id: 'appearance',
      label: 'Appearance',
      description: 'Interface and motion',
      icon: 'fa-solid fa-palette',
    },
    {
      id: 'notes',
      label: 'Notes',
      description: 'Note defaults',
      icon: 'fa-regular fa-note-sticky',
    },
    {
      id: 'boards',
      label: 'Boards',
      description: 'Canvas preferences',
      icon: 'fa-solid fa-table-columns',
    },
    {
      id: 'behavior',
      label: 'Behavior',
      description: 'Interaction preferences',
      icon: 'fa-solid fa-sliders',
    },
    {
      id: 'data',
      label: 'Data & Backup',
      description: 'Cloud backup and restore',
      icon: 'fa-solid fa-database',
    },
    {
      id: 'about',
      label: 'About',
      description: 'About Notiva',
      icon: 'fa-solid fa-circle-info',
    },
  ];
  readonly activeSectionInfo = computed(() =>
    this.sections.find((section) => section.id === this.activeSection())!,
  );
  setSection(section: SettingsSection): void {
    this.activeSection.set(section);
    this.importError.set('');
    this.imported.set(false);
    this.exportError.set('');
    this.exported.set(false);
    this.eraseError.set('');
  }
  updateDensity(value: 'comfortable' | 'compact'): void {
    this.settingsService.update('interfaceDensity', value);
  }
  updateDefaultNoteType(value: string): void {
    this.settingsService.update('defaultNoteType', value as NoteType);
  }
  async exportData(): Promise<void> {
    if (this.exporting()) return;
    this.exportError.set('');
    this.exported.set(false);
    try {
      await this.settingsService.exportBackup();
      this.exported.set(true);
    } catch (error) {
      this.exportError.set(
        error instanceof Error ? error.message : 'Unable to export your Notiva backup.',
      );
    }
  }
  selectImportFile(input: HTMLInputElement): void {
    if (this.importing()) return;
    input.value = '';
    input.click();
  }
  async importData(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.importing()) return;
    this.importError.set('');
    this.imported.set(false);
    try {
      await this.settingsService.importBackup(file);
      await Promise.all([
        this.boardService.reload(),
        this.noteService.reload(),
        this.drawingBoardService.reload(),
      ]);
      this.imported.set(true);
    } catch (error) {
      this.importError.set(
        error instanceof Error ? error.message : 'Unable to import this backup.',
      );
    } finally {
      input.value = '';
    }
  }
  async confirmAction(): Promise<void> {
    const action = this.confirmation();
    if (!action) return;
    if (action === 'reset-settings') {
      this.settingsService.resetSettings();
      this.confirmation.set(null);
      return;
    }
    if (this.settingsService.clearingData()) return;
    this.eraseError.set('');
    try {
      await this.settingsService.clearAllNotivaData();
      await Promise.all([
        this.boardService.reload(),
        this.noteService.reload(),
        this.drawingBoardService.reload(),
      ]);
      this.confirmation.set(null);
      await this.router.navigate(['/notes']);
    } catch (error) {
      this.eraseError.set(
        error instanceof Error ? error.message : 'Unable to erase your Notiva data.',
      );
      this.confirmation.set(null);
    }
  }
}

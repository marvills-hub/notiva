import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { NoteModel } from '../models/note.model';

@Injectable({
  providedIn: 'root',
})
export class DesktopReminderService {
  async show(notes: NoteModel[]): Promise<void> {
    if (!this.isTauri() || !notes.length) return;

    try {
      await invoke('show_reminder_window', {
        noteIds: notes.map((note) => note.id),
      });
    } catch (error) {
      console.error('Failed to show desktop reminder overlay.', error);
    }
  }

  async close(): Promise<void> {
    if (!this.isTauri()) return;

    try {
      await invoke('close_reminder_window');
    } catch (error) {
      console.error('Failed to close desktop reminder overlay.', error);
    }
  }

  async openNote(note: NoteModel): Promise<void> {
    if (!this.isTauri()) return;

    try {
      await invoke('open_reminder_note', {
        noteId: note.id,
        boardId: note.boardId,
      });
    } catch (error) {
      console.error('Failed to open reminder note.', error);
    }
  }

  isReminderWindow(): boolean {
    if (!this.isTauri()) return false;
    return new URLSearchParams(window.location.search).get('reminder') === 'true';
  }

  getReminderNoteIds(): string[] {
    if (!this.isReminderWindow()) return [];

    const value = new URLSearchParams(window.location.search).get('noteIds');

    if (!value) return [];

    return value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  private isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
}

import { DatePipe } from '@angular/common';
import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { filter, Subscription } from 'rxjs';
import { DEFAULT_BOARD_ID } from './core/models/board.model';
import { NoteModel } from './core/models/note.model';
import { DesktopReminderService } from './core/services/desktop-reminder.service';
import { NoteService } from './core/services/note.service';
import { NoteStyleService } from './core/services/note-style.service';
import { NotificationService } from './core/services/notification.service';
import { NoteDesignComponent } from './shared/components/note-design/note-design.component';
import { NotePinComponent } from './shared/components/note-pin/note-pin.component';

interface OpenReminderPayload {
  noteId: string;
  boardId?: string;
}

interface UpdateRemindersPayload {
  noteIds: string[];
}

@Component({
  imports: [RouterOutlet, DatePipe, NoteDesignComponent, NotePinComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly noteService = inject(NoteService);
  private readonly noteStyleService = inject(NoteStyleService);
  private readonly notificationService = inject(NotificationService);
  private readonly desktopReminderService = inject(DesktopReminderService);

  protected readonly reminderWindow = this.desktopReminderService.isReminderWindow();

  private readonly desktopReminderIds = signal(this.desktopReminderService.getReminderNoteIds());

  private readonly viewingReminderNote = signal(false);
  private readonly viewedReminderNoteId = signal<string | null>(null);

  protected readonly reminders = computed<NoteModel[]>(() => {
    if (this.reminderWindow) {
      if (!this.noteService.initialized()) return [];

      return this.desktopReminderIds()
        .map((id) => this.noteService.getNoteById(id))
        .filter((note): note is NoteModel => Boolean(note));
    }

    return this.notificationService.dueReminders();
  });

  protected readonly reminderCount = computed(() => this.reminders().length);

  protected readonly showInAppReminders = computed(
    () => !this.reminderWindow && !this.viewingReminderNote() && this.reminders().length > 0,
  );

  protected readonly reminderReady = computed(() => {
    if (!this.reminderWindow) return true;
    if (!this.noteService.initialized()) return false;

    const ids = this.desktopReminderIds();

    if (!ids.length) return true;

    return ids.every((id) => Boolean(this.noteService.getNoteById(id)));
  });

  private notificationListener: PluginListenerHandle | null = null;
  private openReminderUnlisten: UnlistenFn | null = null;
  private updateRemindersUnlisten: UnlistenFn | null = null;
  private mainHiddenUnlisten: UnlistenFn | null = null;
  private mainVisibleUnlisten: UnlistenFn | null = null;
  private routerSubscription: Subscription | null = null;
  private lastDesktopReminderKey = '';
  private reminderWindowRevealed = false;

  constructor() {
    if (this.reminderWindow) {
      document.documentElement.classList.add('reminder-window');

      document.body.classList.add('reminder-window');

      document.documentElement.style.background = 'transparent';

      document.body.style.background = 'transparent';
    }

    effect(() => {
      if (this.reminderWindow) {
        const ready = this.reminderReady();
        const reminders = this.reminders();

        if (!ready || !reminders.length || this.reminderWindowRevealed) {
          return;
        }

        this.reminderWindowRevealed = true;

        void invoke('reveal_reminder_window').catch((error) => {
          this.reminderWindowRevealed = false;

          console.error('Failed to reveal reminder window.', error);
        });

        return;
      }

      if (!this.isTauri()) return;

      const reminders = this.notificationService.dueReminders();

      if (!reminders.length) {
        this.lastDesktopReminderKey = '';
        return;
      }

      const key = this.getReminderKey(reminders);

      if (key === this.lastDesktopReminderKey) {
        return;
      }

      this.lastDesktopReminderKey = key;

      void this.desktopReminderService.show(reminders);
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.reminderWindow) return;

    void this.closeReminderCenter();
  }

  async ngOnInit(): Promise<void> {
    if (this.reminderWindow) {
      this.updateRemindersUnlisten = await listen<UpdateRemindersPayload>(
        'notiva-update-reminders',
        (event) => {
          this.desktopReminderIds.set(event.payload.noteIds);
        },
      );

      return;
    }

    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.handleNavigation(event.urlAfterRedirects);
      });

    if (this.isTauri()) {
      this.openReminderUnlisten = await listen<OpenReminderPayload>(
        'notiva-open-reminder-note',
        (event) => {
          void this.viewReminderFromDesktopOverlay(event.payload.noteId, event.payload.boardId);
        },
      );

      this.mainHiddenUnlisten = await listen('notiva-main-hidden', () => {
        void this.showRemainingDesktopReminders();
      });

      this.mainVisibleUnlisten = await listen('notiva-main-visible', () => {
        void this.desktopReminderService.close();
      });
    }

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    this.notificationListener = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (event) => {
        const extra = event.notification.extra as
          | {
              noteId?: string;
              boardId?: string;
              source?: string;
            }
          | undefined;

        if (extra?.source !== 'notiva-reminder' || !extra.noteId) {
          return;
        }

        void this.viewReminderFromDesktopOverlay(extra.noteId, extra.boardId);
      },
    );
  }

  ngOnDestroy(): void {
    void this.notificationListener?.remove();

    this.routerSubscription?.unsubscribe();
    this.openReminderUnlisten?.();
    this.updateRemindersUnlisten?.();
    this.mainHiddenUnlisten?.();
    this.mainVisibleUnlisten?.();

    if (this.reminderWindow) {
      document.documentElement.classList.remove('reminder-window');

      document.body.classList.remove('reminder-window');
    }
  }

  protected getReminderStyle(note: NoteModel) {
    return this.noteStyleService.getStyle(note.styleId);
  }

  protected getReminderPin(note: NoteModel) {
    return this.noteStyleService.getPin(note.pinId);
  }

  protected getReminderContent(note: NoteModel): string {
    if (!note.content) {
      return 'Your reminder is due.';
    }

    return this.htmlToText(note.content).trim() || 'Your reminder is due.';
  }

  protected dismissReminder(note: NoteModel, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    this.notificationService.dismissDueReminder(note);

    if (!this.reminderWindow) return;

    this.desktopReminderIds.update((ids) => ids.filter((id) => id !== note.id));
  }

  protected dismissAll(): void {
    const reminders = [...this.reminders()];

    for (const note of reminders) {
      this.notificationService.dismissDueReminder(note);
    }

    if (this.reminderWindow) {
      this.desktopReminderIds.set([]);
    }
  }

  protected async viewReminder(note: NoteModel, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    if (this.reminderWindow && this.isTauri()) {
      await this.desktopReminderService.openNote(note);

      return;
    }

    this.viewedReminderNoteId.set(note.id);
    this.viewingReminderNote.set(true);

    await this.openReminder(note.id, note.boardId);
  }

  protected async closeReminderCenter(): Promise<void> {
    if (!this.reminderWindow) return;

    await this.desktopReminderService.close();
  }

  private async viewReminderFromDesktopOverlay(noteId: string, boardId?: string): Promise<void> {
    this.viewedReminderNoteId.set(noteId);
    this.viewingReminderNote.set(true);

    await this.openReminder(noteId, boardId);
  }

  private handleNavigation(url: string): void {
    const viewedNoteId = this.viewedReminderNoteId();

    if (!viewedNoteId) {
      this.viewingReminderNote.set(false);
      return;
    }

    const queryIndex = url.indexOf('?');

    if (queryIndex === -1) {
      this.clearViewedReminder();
      return;
    }

    const queryString = url.substring(queryIndex + 1);

    const params = new URLSearchParams(queryString);

    const currentNoteId = params.get('noteId');

    if (currentNoteId === viewedNoteId) {
      this.viewingReminderNote.set(true);
      return;
    }

    this.clearViewedReminder();
  }

  private clearViewedReminder(): void {
    this.viewingReminderNote.set(false);
    this.viewedReminderNoteId.set(null);
  }

  private async showRemainingDesktopReminders(): Promise<void> {
    const reminders = this.notificationService.dueReminders();

    if (!reminders.length) {
      return;
    }

    this.lastDesktopReminderKey = this.getReminderKey(reminders);

    await this.desktopReminderService.show(reminders);
  }

  private getReminderKey(reminders: NoteModel[]): string {
    return reminders.map((note) => `${note.id}:${note.reminderAt ?? ''}`).join('|');
  }

  private async openReminder(noteId: string, boardId?: string): Promise<void> {
    if (!boardId || boardId === DEFAULT_BOARD_ID) {
      await this.router.navigate(['/notes'], {
        queryParams: {
          noteId,
        },
      });

      return;
    }

    await this.router.navigate(['/boards', boardId], {
      queryParams: {
        noteId,
      },
    });
  }

  private htmlToText(html: string): string {
    const element = document.createElement('div');

    element.innerHTML = html;

    return element.textContent || '';
  }

  private isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
}

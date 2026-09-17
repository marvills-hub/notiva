import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { DEFAULT_BOARD_ID } from './core/models/board.model';
import { NoteModel } from './core/models/note.model';
import { NotificationService } from './core/services/notification.service';

@Component({
  imports: [RouterOutlet, DatePipe],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);

  protected readonly title = signal('notiva');
  protected readonly reminder = this.notificationService.dueReminder;

  protected readonly reminderContent = computed(() => {
    const note = this.reminder();

    if (!note?.content) return 'Your reminder is due.';

    return this.htmlToText(note.content).trim() || 'Your reminder is due.';
  });

  private notificationListener: PluginListenerHandle | null = null;

  async ngOnInit(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

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

        if (extra?.source !== 'notiva-reminder' || !extra.noteId) return;

        void this.openReminder(extra.noteId, extra.boardId);
      },
    );
  }

  ngOnDestroy(): void {
    void this.notificationListener?.remove();
  }

  protected dismissReminder(): void {
    const note = this.reminder();

    if (!note) return;

    this.notificationService.dismissDueReminder(note);
  }

  protected async openReminderPopup(): Promise<void> {
    const note = this.reminder();

    if (!note) return;

    this.notificationService.completeDueReminder(note);

    await this.openReminder(note.id, note.boardId);
  }

  protected reminderTypeIcon(note: NoteModel): string {
    if (note.type === 'reminder') return 'fa-regular fa-clock';

    return 'fa-regular fa-note-sticky';
  }

  private async openReminder(noteId: string, boardId?: string): Promise<void> {
    if (!boardId || boardId === DEFAULT_BOARD_ID) {
      await this.router.navigate(['/notes'], {
        queryParams: { noteId },
      });

      return;
    }

    await this.router.navigate(['/boards', boardId], {
      queryParams: { noteId },
    });
  }

  private htmlToText(html: string): string {
    const element = document.createElement('div');

    element.innerHTML = html;

    return element.textContent || '';
  }
}

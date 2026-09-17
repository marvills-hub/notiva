import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NoteModel } from '../models/note.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly androidChannelId = 'notiva-reminders';
  private readonly handledStorageKey = 'notiva-handled-reminder-popups';
  private readonly dueReminderSignal = signal<NoteModel | null>(null);
  private reminderNotes: NoteModel[] = [];
  private reminderTimer: ReturnType<typeof setInterval> | null = null;

  readonly dueReminder = this.dueReminderSignal.asReadonly();

  async syncReminder(note: NoteModel): Promise<void> {
    await this.cancelReminder(note.id);

    if (!this.shouldSchedule(note)) return;

    const reminderAt = this.getReminderDate(note);
    if (!reminderAt) return;

    try {
      if (this.isCapacitorNative()) {
        await this.scheduleCapacitorReminder(note, reminderAt);
        return;
      }

      if (this.isTauri()) {
        await this.scheduleTauriReminder(note, reminderAt);
      }
    } catch (error) {
      console.error(`Failed to schedule reminder "${note.id}".`, error);
    }
  }

  async syncReminders(notes: NoteModel[]): Promise<void> {
    const reminders = notes.filter(
      (note) => note.type === 'reminder' && note.reminderAt && !note.archived,
    );

    this.setReminderNotes(reminders);

    for (const note of reminders) {
      await this.syncReminder(note);
    }
  }

  setReminderNotes(notes: NoteModel[]): void {
    this.reminderNotes = notes.filter(
      (note) => note.type === 'reminder' && note.reminderAt && !note.archived,
    );

    this.startReminderWatcher();
    this.checkDueReminders();
  }

  dismissDueReminder(note: NoteModel): void {
    this.markReminderHandled(note);
    this.dueReminderSignal.set(null);
    queueMicrotask(() => this.checkDueReminders());
  }

  completeDueReminder(note: NoteModel): void {
    this.markReminderHandled(note);
    this.dueReminderSignal.set(null);
    queueMicrotask(() => this.checkDueReminders());
  }

  async cancelReminder(noteId: string): Promise<void> {
    const id = this.getNotificationId(noteId);

    try {
      if (this.isCapacitorNative()) {
        await LocalNotifications.cancel({
          notifications: [{ id }],
        });
        return;
      }

      if (this.isTauri()) {
        const { cancel } = await import('@tauri-apps/plugin-notification');
        await cancel([id]);
      }
    } catch (error) {
      console.error(`Failed to cancel reminder notification "${noteId}".`, error);
    }
  }

  async cancelReminders(notes: NoteModel[]): Promise<void> {
    for (const note of notes) {
      await this.cancelReminder(note.id);
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      if (this.isCapacitorNative()) {
        let permission = await LocalNotifications.checkPermissions();

        if (permission.display !== 'granted') {
          permission = await LocalNotifications.requestPermissions();
        }

        return permission.display === 'granted';
      }

      if (this.isTauri()) {
        const { isPermissionGranted, requestPermission } =
          await import('@tauri-apps/plugin-notification');

        let granted = await isPermissionGranted();

        if (!granted) {
          const permission = await requestPermission();
          granted = permission === 'granted';
        }

        return granted;
      }

      if (!('Notification' in window)) return false;

      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;

      return (await Notification.requestPermission()) === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission.', error);
      return false;
    }
  }

  async sendTestNotification(): Promise<boolean> {
    const granted = await this.requestPermission();
    if (!granted) return false;

    try {
      if (this.isCapacitorNative()) {
        await this.ensureCapacitorChannel();

        await LocalNotifications.schedule({
          notifications: [
            {
              id: this.getNotificationId('notiva-test-notification'),
              title: 'Notiva',
              body: 'Notifications are working.',
              channelId: this.androidChannelId,
              schedule: {
                at: new Date(Date.now() + 1000),
              },
              extra: {
                source: 'notiva-test',
              },
            },
          ],
        });

        return true;
      }

      if (this.isTauri()) {
        const { sendNotification } = await import('@tauri-apps/plugin-notification');

        sendNotification({
          title: 'Notiva',
          body: 'Notifications are working.',
        });

        return true;
      }

      new Notification('Notiva', {
        body: 'Notifications are working.',
      });

      return true;
    } catch (error) {
      console.error('Failed to send test notification.', error);
      return false;
    }
  }

  private startReminderWatcher(): void {
    if (this.reminderTimer) return;

    this.reminderTimer = setInterval(() => {
      this.checkDueReminders();
    }, 1000);
  }

  private checkDueReminders(): void {
    if (this.dueReminderSignal()) return;

    const now = Date.now();

    const dueReminder = this.reminderNotes
      .filter((note) => {
        const reminderAt = this.getReminderDate(note);

        if (!reminderAt) return false;
        if (reminderAt.getTime() > now) return false;

        return !this.isReminderHandled(note);
      })
      .sort((a, b) => {
        const aTime = this.getReminderDate(a)?.getTime() ?? 0;
        const bTime = this.getReminderDate(b)?.getTime() ?? 0;

        return aTime - bTime;
      })[0];

    if (!dueReminder) return;

    this.dueReminderSignal.set(dueReminder);
  }

  private markReminderHandled(note: NoteModel): void {
    const handled = this.getHandledReminders();
    handled[this.getReminderKey(note)] = Date.now();

    const entries = Object.entries(handled)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 250);

    try {
      localStorage.setItem(this.handledStorageKey, JSON.stringify(Object.fromEntries(entries)));
    } catch {}
  }

  private isReminderHandled(note: NoteModel): boolean {
    return Boolean(this.getHandledReminders()[this.getReminderKey(note)]);
  }

  private getReminderKey(note: NoteModel): string {
    return `${note.id}:${note.reminderAt ?? ''}`;
  }

  private getHandledReminders(): Record<string, number> {
    try {
      const stored = localStorage.getItem(this.handledStorageKey);

      if (!stored) return {};

      const parsed = JSON.parse(stored);

      if (!parsed || typeof parsed !== 'object') return {};

      return parsed as Record<string, number>;
    } catch {
      return {};
    }
  }

  private async scheduleCapacitorReminder(note: NoteModel, reminderAt: Date): Promise<void> {
    const granted = await this.requestPermission();
    if (!granted) return;

    await this.ensureCapacitorChannel();

    await LocalNotifications.schedule({
      notifications: [
        {
          id: this.getNotificationId(note.id),
          title: note.title.trim() || 'Notiva Reminder',
          body: this.getNotificationBody(note),
          channelId: this.androidChannelId,
          schedule: {
            at: reminderAt,
            allowWhileIdle: true,
          },
          extra: {
            noteId: note.id,
            boardId: note.boardId,
            source: 'notiva-reminder',
          },
        },
      ],
    });
  }

  private async scheduleTauriReminder(note: NoteModel, reminderAt: Date): Promise<void> {
    const granted = await this.requestPermission();
    if (!granted) return;

    const { Schedule, sendNotification } = await import('@tauri-apps/plugin-notification');

    sendNotification({
      id: this.getNotificationId(note.id),
      title: note.title.trim() || 'Notiva Reminder',
      body: this.getNotificationBody(note),
      schedule: Schedule.at(reminderAt, false, true),
      autoCancel: true,
      extra: {
        noteId: note.id,
        boardId: note.boardId,
        source: 'notiva-reminder',
      },
    });
  }

  private async ensureCapacitorChannel(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;

    try {
      await LocalNotifications.createChannel({
        id: this.androidChannelId,
        name: 'Notiva Reminders',
        description: 'Reminder notifications from Notiva',
        importance: 4,
        visibility: 1,
        vibration: true,
      });
    } catch {}
  }

  private shouldSchedule(note: NoteModel): boolean {
    if (note.type !== 'reminder' || note.archived) return false;

    const reminderAt = this.getReminderDate(note);

    return Boolean(reminderAt && reminderAt.getTime() > Date.now());
  }

  private getReminderDate(note: NoteModel): Date | null {
    if (!note.reminderAt) return null;

    const date = new Date(note.reminderAt);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private getNotificationBody(note: NoteModel): string {
    const content = this.htmlToText(note.content).trim();

    if (content) {
      return content.length > 180 ? `${content.slice(0, 177)}...` : content;
    }

    return 'Your reminder is due.';
  }

  private htmlToText(html: string): string {
    if (typeof document === 'undefined') {
      return html.replace(/<[^>]*>/g, ' ');
    }

    const element = document.createElement('div');
    element.innerHTML = html;

    return element.textContent || '';
  }

  private getNotificationId(value: string): number {
    let hash = 0;

    for (let index = 0; index < value.length; index++) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash || 1);
  }

  private isCapacitorNative(): boolean {
    const platform = Capacitor.getPlatform();

    return platform === 'android' || platform === 'ios';
  }

  private isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
}

import {
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { DEFAULT_BOARD_ID } from '../../core/models/board.model';
import { NoteModel } from '../../core/models/note.model';
import { AuthService } from '../../core/services/auth.service';
import { BoardDesignService } from '../../core/services/board-design.service';
import { BoardService } from '../../core/services/board.service';
import { NoteService } from '../../core/services/note.service';

interface TopbarPageIdentity {
  title: string;
  subtitle: string;
  icon: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  private readonly router = inject(Router);
  private readonly noteService = inject(NoteService);
  private readonly boardService = inject(BoardService);
  private readonly boardDesignService = inject(BoardDesignService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationStorageKey = 'notiva-read-reminder-notifications';

  readonly authService = inject(AuthService);
  readonly sidebarCollapsed = input(false);
  readonly sidebarToggle = output<void>();
  readonly search = signal('');
  readonly focused = signal(false);
  readonly searchOpen = signal(false);
  readonly profileMenuOpen = signal(false);
  readonly notificationMenuOpen = signal(false);
  readonly signingOut = signal(false);
  readonly notificationNow = signal(Date.now());
  readonly readNotificationIds = signal<Set<string>>(this.loadReadNotificationIds());

  readonly results = computed(() => this.noteService.searchActiveNotes(this.search()).slice(0, 8));

  readonly notifications = computed(() => {
    const now = this.notificationNow();

    return this.noteService
      .notes()
      .filter((note) => {
        if (note.archived || note.type !== 'reminder' || !note.reminderAt) return false;

        const reminderTime = this.getReminderTimestamp(note);

        return reminderTime !== null && reminderTime <= now;
      })
      .sort((a, b) => {
        const aTime = this.getReminderTimestamp(a) ?? 0;
        const bTime = this.getReminderTimestamp(b) ?? 0;

        return bTime - aTime;
      })
      .slice(0, 20);
  });

  readonly unreadNotifications = computed(() =>
    this.notifications().filter((note) => !this.readNotificationIds().has(note.id)),
  );

  readonly unreadNotificationCount = computed(() => this.unreadNotifications().length);

  readonly userDisplayName = computed(() => {
    const displayName = this.authService.displayName().trim();

    if (displayName) return displayName;

    const email = this.authService.email().trim();

    if (email) return email.split('@')[0];

    return 'Notiva User';
  });

  readonly userInitials = computed(() => {
    const name = this.userDisplayName().trim();

    if (!name) return 'N';

    const parts = name.split(/\s+/).filter(Boolean);

    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  });

  readonly userPhotoURL = computed(() => this.authService.photoURL());

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly currentPath = computed(() => this.currentUrl().split('?')[0]);

  readonly currentBoardId = computed(() => {
    const path = this.currentPath();

    if (path === '/notes' || path.startsWith('/notes/')) return DEFAULT_BOARD_ID;

    const match = path.match(/^\/boards\/([^/]+)/);

    return match ? decodeURIComponent(match[1]) : null;
  });

  readonly currentBoard = computed(() => {
    const boardId = this.currentBoardId();

    return boardId ? this.boardService.getBoardById(boardId) : null;
  });

  readonly currentBoardDesign = computed(() =>
    this.boardDesignService.getDesign(this.currentBoard()?.designId),
  );

  readonly currentBoardNoteCount = computed(() => {
    const boardId = this.currentBoardId();

    return boardId ? this.noteService.getBoardNoteCount(boardId) : 0;
  });

  readonly showingBoardIdentity = computed(() => this.currentBoardId() !== null);

  readonly pageIdentity = computed<TopbarPageIdentity>(() => {
    const path = this.currentPath();

    if (path === '/boards') {
      return {
        title: 'Boards',
        subtitle: 'Visual workspaces',
        icon: 'fa-solid fa-table-columns',
      };
    }

    if (path === '/drawing-boards') {
      return {
        title: 'Drawing Boards',
        subtitle: 'Sketches and visual ideas',
        icon: 'fa-solid fa-pen-ruler',
      };
    }

    if (path === '/favorites') {
      return {
        title: 'Favorites',
        subtitle: 'Important notes',
        icon: 'fa-solid fa-star',
      };
    }

    if (path === '/archive') {
      return {
        title: 'Archive',
        subtitle: 'Stored notes',
        icon: 'fa-solid fa-box-archive',
      };
    }

    if (path === '/settings') {
      return {
        title: 'Settings',
        subtitle: 'Notiva preferences',
        icon: 'fa-solid fa-gear',
      };
    }

    if (path === '/account') {
      return {
        title: 'Account',
        subtitle: 'Profile and account',
        icon: 'fa-regular fa-user',
      };
    }

    return {
      title: 'Notiva',
      subtitle: 'Visual Notes',
      icon: 'fa-regular fa-note-sticky',
    };
  });

  constructor() {
    const notificationTimer = window.setInterval(() => {
      this.notificationNow.set(Date.now());
    }, 15000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(notificationTimer);
    });
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.profileMenuOpen.set(false);
    this.notificationMenuOpen.set(false);
  }

  getBoardName(boardId: string): string {
    if (boardId === DEFAULT_BOARD_ID) return 'Main Notes';

    return this.boardService.getBoardById(boardId)?.name || 'Unknown Board';
  }

  getNotificationTime(note: NoteModel): string {
    const timestamp = this.getReminderTimestamp(note);

    if (timestamp === null) return '';

    const difference = this.notificationNow() - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (difference < minute) return 'Due now';

    if (difference < hour) {
      const minutes = Math.floor(difference / minute);

      return `${minutes}m overdue`;
    }

    if (difference < day) {
      const hours = Math.floor(difference / hour);

      return `${hours}h overdue`;
    }

    const days = Math.floor(difference / day);

    if (days < 7) return `${days}d overdue`;

    return new Date(timestamp).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year:
        new Date(timestamp).getFullYear() !== new Date(this.notificationNow()).getFullYear()
          ? 'numeric'
          : undefined,
    });
  }

  isNotificationUnread(note: NoteModel): boolean {
    return !this.readNotificationIds().has(note.id);
  }

  toggleSidebar(): void {
    this.sidebarToggle.emit();
  }

  toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.notificationMenuOpen.set(false);
    this.profileMenuOpen.update((open) => !open);
  }

  toggleNotificationMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen.set(false);
    this.notificationMenuOpen.update((open) => !open);
  }

  openNotification(note: NoteModel): void {
    this.markNotificationRead(note.id);
    this.notificationMenuOpen.set(false);
    this.openResult(note);
  }

  markAllNotificationsRead(event?: MouseEvent): void {
    event?.stopPropagation();

    const ids = new Set(this.readNotificationIds());

    for (const note of this.notifications()) {
      ids.add(note.id);
    }

    this.readNotificationIds.set(ids);
    this.saveReadNotificationIds(ids);
  }

  openResult(note: NoteModel): void {
    this.search.set('');
    this.focused.set(false);
    this.searchOpen.set(false);
    this.notificationMenuOpen.set(false);
    this.profileMenuOpen.set(false);

    if (note.boardId === DEFAULT_BOARD_ID) {
      void this.router.navigate(['/notes'], {
        queryParams: { noteId: note.id },
      });

      return;
    }

    void this.router.navigate(['/boards', note.boardId], {
      queryParams: { noteId: note.id },
    });
  }

  openAccount(): void {
    this.profileMenuOpen.set(false);
    void this.router.navigate(['/account']);
  }

  openSettings(): void {
    this.profileMenuOpen.set(false);
    void this.router.navigate(['/settings']);
  }

  async logout(): Promise<void> {
    if (this.signingOut()) return;

    this.signingOut.set(true);
    this.profileMenuOpen.set(false);
    this.notificationMenuOpen.set(false);

    try {
      await this.authService.logout();
      await this.router.navigate(['/auth']);
    } catch (error) {
      console.error('Failed to sign out.', error);
    } finally {
      this.signingOut.set(false);
    }
  }

  hideResults(): void {
    setTimeout(() => this.focused.set(false), 150);
  }

  openSearch(): void {
    this.profileMenuOpen.set(false);
    this.notificationMenuOpen.set(false);
    this.searchOpen.set(true);
    this.focused.set(true);

    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.overlay-search-box input');
      input?.focus();
    });
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.focused.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.searchOpen()) {
      this.closeSearch();
      return;
    }

    if (this.notificationMenuOpen()) {
      this.notificationMenuOpen.set(false);
      return;
    }

    this.profileMenuOpen.set(false);
  }

  private markNotificationRead(id: string): void {
    if (this.readNotificationIds().has(id)) return;

    const ids = new Set(this.readNotificationIds());

    ids.add(id);

    this.readNotificationIds.set(ids);
    this.saveReadNotificationIds(ids);
  }

  private getReminderTimestamp(note: NoteModel): number | null {
    if (!note.reminderAt) return null;

    const timestamp = new Date(note.reminderAt).getTime();

    return Number.isNaN(timestamp) ? null : timestamp;
  }

  private loadReadNotificationIds(): Set<string> {
    try {
      const stored = localStorage.getItem(this.notificationStorageKey);

      if (!stored) return new Set<string>();

      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? new Set<string>(parsed) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }

  private saveReadNotificationIds(ids: Set<string>): void {
    try {
      localStorage.setItem(this.notificationStorageKey, JSON.stringify([...ids]));
    } catch {}
  }
}

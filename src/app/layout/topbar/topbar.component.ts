import { Component, computed, HostListener, inject, input, output, signal } from '@angular/core';
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
  readonly authService = inject(AuthService);
  readonly sidebarCollapsed = input(false);
  readonly sidebarToggle = output<void>();
  readonly search = signal('');
  readonly focused = signal(false);
  readonly profileMenuOpen = signal(false);
  readonly signingOut = signal(false);
  readonly results = computed(() => this.noteService.searchActiveNotes(this.search()).slice(0, 8));
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
  @HostListener('document:click')
  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }
  getBoardName(boardId: string): string {
    return this.boardService.getBoardById(boardId)?.name || 'Unknown Board';
  }
  toggleSidebar(): void {
    this.sidebarToggle.emit();
  }
  toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen.update((open) => !open);
  }
  openResult(note: NoteModel): void {
    this.search.set('');
    this.focused.set(false);
    if (note.boardId === DEFAULT_BOARD_ID) {
      this.router.navigate(['/notes'], {
        queryParams: { noteId: note.id },
      });
      return;
    }
    this.router.navigate(['/boards', note.boardId], {
      queryParams: { noteId: note.id },
    });
  }
  newNote(): void {
    const boardId = this.currentBoardId();
    if (boardId && boardId !== DEFAULT_BOARD_ID) {
      this.router.navigate(['/boards', boardId], {
        queryParams: { newNote: Date.now() },
      });
      return;
    }
    this.router.navigate(['/notes'], {
      queryParams: { newNote: Date.now() },
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
    setTimeout(() => {
      this.focused.set(false);
    }, 150);
  }
}

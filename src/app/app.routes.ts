import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { AppLayoutComponent } from './layout/app-layout/app-layout.component';
export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/auth.component').then((m) => m.AuthComponent),
  },
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'notes',
        pathMatch: 'full',
      },
      {
        path: 'notes',
        loadComponent: () => import('./pages/notes/notes.component').then((m) => m.NotesComponent),
      },
      {
        path: 'boards',
        loadComponent: () =>
          import('./pages/boards/boards.component').then((m) => m.BoardsComponent),
      },
      {
        path: 'boards/:boardId',
        loadComponent: () => import('./pages/notes/notes.component').then((m) => m.NotesComponent),
      },
      {
        path: 'drawing-boards',
        loadComponent: () =>
          import('./pages/drawing-boards/drawing-boards.component').then(
            (m) => m.DrawingBoardsComponent,
          ),
      },
      {
        path: 'favorites',
        loadComponent: () =>
          import('./pages/favorites/favorites.component').then((m) => m.FavoritesComponent),
      },
      {
        path: 'archive',
        loadComponent: () =>
          import('./pages/archive/archive.component').then((m) => m.ArchiveComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./pages/account/account.component').then((m) => m.AccountComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'notes',
  },
];

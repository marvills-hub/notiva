import { Injectable } from '@angular/core';
import { BoardViewModel } from '../models/board-view.model';
@Injectable({
  providedIn: 'root',
})
export class BoardViewService {
  private readonly storageKey = 'notiva-board-views';
  getView(boardId: string): BoardViewModel {
    const views = this.loadViews();
    return (
      views[boardId] || {
        boardId,
        zoom: 1,
        panX: 0,
        panY: 0,
        gridEnabled: true,
      }
    );
  }
  saveView(view: BoardViewModel): void {
    const views = this.loadViews();
    views[view.boardId] = view;
    localStorage.setItem(this.storageKey, JSON.stringify(views));
  }
  resetView(boardId: string): BoardViewModel {
    const view: BoardViewModel = {
      boardId,
      zoom: 1,
      panX: 0,
      panY: 0,
      gridEnabled: true,
    };
    this.saveView(view);
    return view;
  }
  deleteView(boardId: string): void {
    const views = this.loadViews();
    delete views[boardId];
    localStorage.setItem(this.storageKey, JSON.stringify(views));
  }
  private loadViews(): Record<string, BoardViewModel> {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return {};
    try {
      return JSON.parse(stored);
    } catch {
      return {};
    }
  }
}

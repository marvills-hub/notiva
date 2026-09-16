import { Injectable } from '@angular/core';
import { BOARD_DESIGNS, DEFAULT_BOARD_DESIGN_ID } from '../constants/board-designs.constant';
import { BoardDesignCategory, BoardDesignModel } from '../models/board-design.model';

@Injectable({
  providedIn: 'root',
})
export class BoardDesignService {
  readonly designs = BOARD_DESIGNS;

  getDesign(id?: string | null): BoardDesignModel {
    return (
      this.designs.find((design) => design.id === id) ||
      this.designs.find((design) => design.id === DEFAULT_BOARD_DESIGN_ID) ||
      this.designs[0]
    );
  }

  getDesignsByCategory(category: BoardDesignCategory | 'all'): BoardDesignModel[] {
    if (category === 'all') {
      return this.designs;
    }
    return this.designs.filter((design) => design.category === category);
  }

  resolveDesignId(id?: string | null): string {
    if (!id) {
      return DEFAULT_BOARD_DESIGN_ID;
    }
    if (this.designs.some((design) => design.id === id)) {
      return id;
    }
    return DEFAULT_BOARD_DESIGN_ID;
  }
}

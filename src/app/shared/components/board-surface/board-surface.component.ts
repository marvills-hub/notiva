import { Component, input } from '@angular/core';
import { BoardDesignModel } from '../../../core/models/board-design.model';

@Component({
  selector: 'app-board-surface',
  standalone: true,
  imports: [],
  templateUrl: './board-surface.component.html',
  styleUrl: './board-surface.component.scss',
})
export class BoardSurfaceComponent {
  readonly design = input.required<BoardDesignModel>();
  readonly preview = input(false);
}

import { Component, input } from '@angular/core';
import { NoteStyleModel } from '../../../core/models/note-style.model';

@Component({
  selector: 'app-note-design',
  standalone: true,
  imports: [],
  templateUrl: './note-design.component.html',
  styleUrl: './note-design.component.scss',
})
export class NoteDesignComponent {
  readonly style = input.required<NoteStyleModel>();
  readonly preview = input(false);
}

import { Component, computed, inject, input } from '@angular/core';
import { NoteStyleService } from '../../../core/services/note-style.service';

@Component({
  selector: 'app-note-pin',
  standalone: true,
  imports: [],
  templateUrl: './note-pin.component.html',
  styleUrl: './note-pin.component.scss',
})
export class NotePinComponent {
  private readonly noteStyleService = inject(NoteStyleService);

  readonly pinId = input.required<string>();
  readonly preview = input(false);

  readonly pin = computed(() => this.noteStyleService.getPin(this.pinId()));
}

import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { NoteModel } from '../../../core/models/note.model';
import { NoteStyleService } from '../../../core/services/note-style.service';
import { NoteDesignComponent } from '../note-design/note-design.component';
import { NotePinComponent } from '../note-pin/note-pin.component';

@Component({
  selector: 'app-note-view',
  standalone: true,
  imports: [DatePipe, NoteDesignComponent, NotePinComponent],
  templateUrl: './note-view.component.html',
  styleUrl: './note-view.component.scss',
})
export class NoteViewComponent {
  private readonly noteStyleService = inject(NoteStyleService);

  readonly note = input.required<NoteModel>();
  readonly closed = output<void>();
  readonly editClicked = output<NoteModel>();

  readonly style = computed(() => this.noteStyleService.getStyle(this.note().styleId));

  readonly pin = computed(() => this.noteStyleService.getPin(this.note().pinId));

  edit(): void {
    this.editClicked.emit(this.note());
  }

  closeBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}

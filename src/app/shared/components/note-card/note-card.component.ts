import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CalendarEventModel, NoteModel } from '../../../core/models/note.model';
import {
  CalendarService,
  MoonPhase,
  PhilippineHoliday,
} from '../../../core/services/calendar.service';
import { NoteStyleService } from '../../../core/services/note-style.service';
import { NoteDesignComponent } from '../note-design/note-design.component';
import { NotePinComponent } from '../note-pin/note-pin.component';
interface CalendarDay {
  day: number | null;
  date: string | null;
  today: boolean;
  sunday: boolean;
  holiday: PhilippineHoliday | null;
  moonPhase: MoonPhase | null;
}
@Component({
  selector: 'app-note-card',
  standalone: true,
  imports: [DatePipe, NotePinComponent, NoteDesignComponent],
  templateUrl: './note-card.component.html',
  styleUrl: './note-card.component.scss',
})
export class NoteCardComponent {
  private readonly noteStyleService = inject(NoteStyleService);
  private readonly calendarService = inject(CalendarService);
  readonly note = input.required<NoteModel>();
  readonly zoom = input(1);
  readonly selected = input(false);
  readonly positionChanged = output<{ id: string; x: number; y: number }>();
  readonly sizeChanged = output<{ id: string; width: number; height: number }>();
  readonly checklistItemToggled = output<{ noteId: string; itemId: string }>();
  readonly calendarPreviousMonth = output<string>();
  readonly calendarNextMonth = output<string>();
  readonly calendarTodayClicked = output<string>();
  readonly activated = output<string>();
  readonly selectionRequested = output<{ id: string; additive: boolean }>();
  readonly dragStarted = output<{ id: string; x: number; y: number }>();
  readonly dragMoved = output<{ id: string; deltaX: number; deltaY: number }>();
  readonly dragEnded = output<{ id: string; x: number; y: number; moved: boolean }>();
  readonly viewClicked = output<NoteModel>();
  readonly editClicked = output<NoteModel>();
  readonly favoriteClicked = output<string>();
  readonly pinnedClicked = output<string>();
  readonly duplicateClicked = output<string>();
  readonly archiveClicked = output<string>();
  readonly deleteClicked = output<string>();
  readonly x = signal(0);
  readonly y = signal(0);
  readonly width = signal(240);
  readonly height = signal(250);
  readonly style = computed(() => this.noteStyleService.getStyle(this.note().styleId));
  readonly pin = computed(() => this.noteStyleService.getPin(this.note().pinId));
  readonly secondaryPin = computed(() => {
    const pinId = this.note().secondaryPinId;
    return pinId ? this.noteStyleService.getPin(pinId) : null;
  });
  readonly calendarMonthName = computed(() => {
    const calendar = this.note().calendar;
    if (!calendar) {
      return '';
    }
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(calendar.year, calendar.month, 1),
    );
  });
  readonly calendarDays = computed<CalendarDay[]>(() => {
    const calendar = this.note().calendar;
    if (!calendar) {
      return [];
    }
    const firstDay = new Date(calendar.year, calendar.month, 1).getDay();
    const daysInMonth = new Date(calendar.year, calendar.month + 1, 0).getDate();
    const today = new Date();
    const holidays = calendar.showHolidays
      ? this.calendarService.getHolidaysForMonth(calendar.year, calendar.month)
      : [];
    const moonPhases = calendar.showMoonPhases
      ? this.calendarService.getMoonPhases(calendar.year, calendar.month)
      : [];
    const holidayMap = new Map(holidays.map((holiday) => [holiday.date, holiday]));
    const moonPhaseMap = new Map(moonPhases.map((phase) => [phase.date, phase]));
    const cells: CalendarDay[] = [];
    for (let index = 0; index < 42; index++) {
      const day = index - firstDay + 1;
      if (day < 1 || day > daysInMonth) {
        cells.push({
          day: null,
          date: null,
          today: false,
          sunday: index % 7 === 0,
          holiday: null,
          moonPhase: null,
        });
        continue;
      }
      const date = this.formatCalendarDate(calendar.year, calendar.month, day);
      cells.push({
        day,
        date,
        today:
          today.getFullYear() === calendar.year &&
          today.getMonth() === calendar.month &&
          today.getDate() === day,
        sunday: index % 7 === 0,
        holiday: holidayMap.get(date) || null,
        moonPhase: moonPhaseMap.get(date) || null,
      });
    }
    return cells;
  });
  readonly calendarEventsByDate = computed(() => {
    const events = this.note().calendar?.events || [];
    const grouped = new Map<string, CalendarEventModel[]>();
    for (const event of events) {
      const current = grouped.get(event.date) || [];
      grouped.set(event.date, [...current, event]);
    }
    return grouped;
  });
  dragging = false;
  private resizing = false;
  private dragMovedState = false;
  private dragPointerId: number | null = null;
  private resizePointerId: number | null = null;
  private startPointerX = 0;
  private startPointerY = 0;
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private startX = 0;
  private startY = 0;
  private startWidth = 0;
  private startHeight = 0;
  private additiveSelection = false;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  constructor() {
    effect(() => {
      const note = this.note();
      if (!this.dragging) {
        this.x.set(note.x);
        this.y.set(note.y);
      }
      if (!this.resizing) {
        this.width.set(note.width);
        this.height.set(note.height);
      }
    });
  }
  startDrag(event: PointerEvent): void {
    if (event.button !== 0 || this.resizing) {
      return;
    }
    const target = event.target as HTMLElement;
    if (this.isInteractiveTarget(target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.clearViewTimer();
    this.additiveSelection = event.ctrlKey || event.metaKey;
    this.selectionRequested.emit({
      id: this.note().id,
      additive: this.additiveSelection,
    });
    this.dragging = true;
    this.dragMovedState = false;
    this.dragPointerId = event.pointerId;
    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;
    this.dragStartClientX = event.clientX;
    this.dragStartClientY = event.clientY;
    this.startX = this.x();
    this.startY = this.y();
    this.activated.emit(this.note().id);
    this.dragStarted.emit({
      id: this.note().id,
      x: this.startX,
      y: this.startY,
    });
    const card = event.currentTarget as HTMLElement;
    if (!card.hasPointerCapture(event.pointerId)) {
      card.setPointerCapture(event.pointerId);
    }
  }
  drag(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.dragPointerId) {
      return;
    }
    const movedX = Math.abs(event.clientX - this.dragStartClientX);
    const movedY = Math.abs(event.clientY - this.dragStartClientY);
    if (movedX > 4 || movedY > 4) {
      this.dragMovedState = true;
    }
    const scale = Math.max(this.zoom(), 0.01);
    const deltaX = (event.clientX - this.startPointerX) / scale;
    const deltaY = (event.clientY - this.startPointerY) / scale;
    this.x.set(this.startX + deltaX);
    this.y.set(this.startY + deltaY);
    if (this.dragMovedState) {
      this.dragMoved.emit({
        id: this.note().id,
        deltaX,
        deltaY,
      });
    }
  }
  endDrag(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.dragPointerId) {
      return;
    }
    const card = event.currentTarget as HTMLElement;
    if (card.hasPointerCapture(event.pointerId)) {
      card.releasePointerCapture(event.pointerId);
    }
    const wasDragged = this.dragMovedState;
    const additiveSelection = this.additiveSelection;
    this.dragging = false;
    this.dragMovedState = false;
    this.dragPointerId = null;
    this.additiveSelection = false;
    this.dragEnded.emit({
      id: this.note().id,
      x: this.x(),
      y: this.y(),
      moved: wasDragged,
    });
    if (wasDragged) {
      this.positionChanged.emit({
        id: this.note().id,
        x: this.x(),
        y: this.y(),
      });
      return;
    }
    if (additiveSelection) {
      return;
    }
    if (this.viewTimer) {
      clearTimeout(this.viewTimer);
    }
    this.viewTimer = setTimeout(() => {
      this.viewClicked.emit(this.note());
      this.viewTimer = null;
    }, 220);
  }
  startResize(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.clearViewTimer();
    this.resizing = true;
    this.resizePointerId = event.pointerId;
    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;
    this.startWidth = this.width();
    this.startHeight = this.height();
    this.activated.emit(this.note().id);
    const handle = event.currentTarget as HTMLElement;
    if (!handle.hasPointerCapture(event.pointerId)) {
      handle.setPointerCapture(event.pointerId);
    }
  }
  resize(event: PointerEvent): void {
    if (!this.resizing || event.pointerId !== this.resizePointerId) {
      return;
    }
    const scale = Math.max(this.zoom(), 0.01);
    const deltaX = (event.clientX - this.startPointerX) / scale;
    const deltaY = (event.clientY - this.startPointerY) / scale;
    const minWidth = this.note().type === 'calendar' ? 560 : 190;
    const minHeight = this.note().type === 'calendar' ? 460 : 180;
    this.width.set(Math.max(minWidth, this.startWidth + deltaX));
    this.height.set(Math.max(minHeight, this.startHeight + deltaY));
  }
  endResize(event: PointerEvent): void {
    if (!this.resizing || event.pointerId !== this.resizePointerId) {
      return;
    }
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    this.resizing = false;
    this.resizePointerId = null;
    this.sizeChanged.emit({
      id: this.note().id,
      width: this.width(),
      height: this.height(),
    });
  }
  edit(event: MouseEvent): void {
    event.stopPropagation();
    this.clearViewTimer();
    this.editClicked.emit(this.note());
  }
  previousCalendarMonth(event: MouseEvent): void {
    event.stopPropagation();
    this.clearViewTimer();
    this.calendarPreviousMonth.emit(this.note().id);
  }
  nextCalendarMonth(event: MouseEvent): void {
    event.stopPropagation();
    this.clearViewTimer();
    this.calendarNextMonth.emit(this.note().id);
  }
  goToCalendarToday(event: MouseEvent): void {
    event.stopPropagation();
    this.clearViewTimer();
    this.calendarTodayClicked.emit(this.note().id);
  }
  toggleFavorite(event: MouseEvent): void {
    event.stopPropagation();
    this.favoriteClicked.emit(this.note().id);
  }
  togglePinned(event: MouseEvent): void {
    event.stopPropagation();
    this.pinnedClicked.emit(this.note().id);
  }
  duplicate(event: MouseEvent): void {
    event.stopPropagation();
    this.duplicateClicked.emit(this.note().id);
  }
  archive(event: MouseEvent): void {
    event.stopPropagation();
    this.archiveClicked.emit(this.note().id);
  }
  delete(event: MouseEvent): void {
    event.stopPropagation();
    this.deleteClicked.emit(this.note().id);
  }
  toggleChecklist(event: MouseEvent, itemId: string): void {
    event.stopPropagation();
    this.checklistItemToggled.emit({
      noteId: this.note().id,
      itemId,
    });
  }
  getCalendarEvents(date: string | null): CalendarEventModel[] {
    if (!date) {
      return [];
    }
    return this.calendarEventsByDate().get(date) || [];
  }
  private formatCalendarDate(year: number, month: number, day: number): string {
    const monthValue = String(month + 1).padStart(2, '0');
    const dayValue = String(day).padStart(2, '0');
    return `${year}-${monthValue}-${dayValue}`;
  }
  private clearViewTimer(): void {
    if (!this.viewTimer) {
      return;
    }
    clearTimeout(this.viewTimer);
    this.viewTimer = null;
  }
  private isInteractiveTarget(target: HTMLElement): boolean {
    return !!target.closest(
      'button, input, textarea, select, option, a, label, [contenteditable="true"], .resize-handle, .checklist-item, .note-actions, .calendar-controls, .calendar-day',
    );
  }
}

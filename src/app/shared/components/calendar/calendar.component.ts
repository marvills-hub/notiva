import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CalendarEventModel, NoteModel } from '../../../core/models/note.model';
import {
  CalendarService,
  MoonPhase,
  PhilippineHoliday,
} from '../../../core/services/calendar.service';
import { NoteStyleService } from '../../../core/services/note-style.service';
import { NotePinComponent } from '../note-pin/note-pin.component';
interface CalendarTide {
  highTime: string | null;
  highHeight: number | null;
  lowTime: string | null;
  lowHeight: number | null;
}
interface CalendarDay {
  day: number;
  date: string;
  year: number;
  month: number;
  currentMonth: boolean;
  today: boolean;
  sunday: boolean;
  holiday: PhilippineHoliday | null;
  moonPhase: MoonPhase | null;
  tide: CalendarTide | null;
}
interface CalendarPage {
  year: number;
  month: number;
  monthName: string;
  monthShortName: string;
  daysInMonth: number;
  days: CalendarDay[];
}
type CalendarFlipDirection = 'previous' | 'next' | null;
type ManualFlipDirection = 'previous' | 'next' | null;
@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [NgTemplateOutlet, NotePinComponent],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class CalendarComponent {
  private readonly calendarService = inject(CalendarService);
  private readonly noteStyleService = inject(NoteStyleService);
  private readonly paperStripCount = 16;
  readonly note = input.required<NoteModel>();
  readonly zoom = input(1);
  readonly selected = input(false);
  readonly positionChanged = output<{ id: string; x: number; y: number }>();
  readonly sizeChanged = output<{ id: string; width: number; height: number }>();
  readonly previousMonth = output<string>();
  readonly nextMonth = output<string>();
  readonly todayClicked = output<string>();
  readonly activated = output<string>();
  readonly selectionRequested = output<{ id: string; additive: boolean }>();
  readonly dragStarted = output<{ id: string; x: number; y: number }>();
  readonly dragMoved = output<{ id: string; deltaX: number; deltaY: number }>();
  readonly dragEnded = output<{ id: string; x: number; y: number; moved: boolean }>();
  readonly pinnedClicked = output<string>();
  readonly duplicateClicked = output<string>();
  readonly deleteClicked = output<string>();
  readonly pinChanged = output<{ id: string; pinId: string }>();
  readonly secondaryPinChanged = output<{ id: string; pinId: string }>();
  readonly x = signal(0);
  readonly y = signal(0);
  readonly width = signal(860);
  readonly height = signal(680);
  readonly flipDirection = signal<CalendarFlipDirection>(null);
  readonly manualFlipDirection = signal<ManualFlipDirection>(null);
  readonly destinationPage = signal<CalendarPage | null>(null);
  readonly flipProgress = signal(0);
  readonly manualFlipping = signal(false);
  readonly settlingFlip = signal(false);
  readonly paperStrips = Array.from({ length: this.paperStripCount }, (_, index) => index);
  readonly activeFlipDirection = computed<CalendarFlipDirection>(
    () => this.manualFlipDirection() || this.flipDirection(),
  );
  readonly flipping = computed(
    () => this.flipDirection() !== null || this.manualFlipping() || this.settlingFlip(),
  );
  readonly pageHeight = computed(() => Math.max(1, this.height() - 32));
  readonly stripHeight = computed(() => this.pageHeight() / this.paperStripCount);
  readonly currentPage = computed<CalendarPage>(() => {
    const calendar = this.note().calendar;
    if (!calendar) {
      const today = new Date();
      return this.createPage(today.getFullYear(), today.getMonth());
    }
    return this.createPage(calendar.year, calendar.month);
  });
  readonly flippingPage = computed<CalendarPage>(() => {
    if (this.activeFlipDirection() === 'previous') {
      return this.destinationPage() || this.currentPage();
    }
    return this.currentPage();
  });
  readonly calendarEventsByDate = computed(() => {
    const grouped = new Map<string, CalendarEventModel[]>();
    for (const event of this.note().calendar?.events || []) {
      const current = grouped.get(event.date) || [];
      grouped.set(event.date, [...current, event]);
    }
    return grouped;
  });
  readonly paperCurveStrength = computed(() => Math.sin(this.flipProgress() * Math.PI));
  readonly paperShadowStrength = computed(() => 0.08 + this.paperCurveStrength() * 0.18);
  dragging = false;
  private resizing = false;
  private dragMovedState = false;
  private dragPointerId: number | null = null;
  private resizePointerId: number | null = null;
  private flipPointerId: number | null = null;
  private startPointerX = 0;
  private startPointerY = 0;
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private flipStartClientY = 0;
  private startX = 0;
  private startY = 0;
  private startWidth = 0;
  private startHeight = 0;
  private animationFrame: number | null = null;
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
    if (event.button !== 0 || this.resizing || this.flipping()) {
      return;
    }
    const target = event.target as HTMLElement;
    if (this.isInteractiveTarget(target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.selectionRequested.emit({
      id: this.note().id,
      additive: event.ctrlKey || event.metaKey,
    });
    this.activated.emit(this.note().id);
    if (this.note().pinned) {
      return;
    }
    this.dragging = true;
    this.dragMovedState = false;
    this.dragPointerId = event.pointerId;
    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;
    this.dragStartClientX = event.clientX;
    this.dragStartClientY = event.clientY;
    this.startX = this.x();
    this.startY = this.y();
    this.dragStarted.emit({
      id: this.note().id,
      x: this.startX,
      y: this.startY,
    });
    const calendar = event.currentTarget as HTMLElement;
    if (!calendar.hasPointerCapture(event.pointerId)) {
      calendar.setPointerCapture(event.pointerId);
    }
  }
  drag(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.dragPointerId || this.note().pinned) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
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
    event.preventDefault();
    event.stopPropagation();
    const calendar = event.currentTarget as HTMLElement;
    if (calendar.hasPointerCapture(event.pointerId)) {
      calendar.releasePointerCapture(event.pointerId);
    }
    const wasDragged = this.dragMovedState;
    this.dragging = false;
    this.dragMovedState = false;
    this.dragPointerId = null;
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
    }
  }
  startNextManualFlip(event: PointerEvent): void {
    this.startManualFlip(event, 'next');
  }
  startPreviousManualFlip(event: PointerEvent): void {
    this.startManualFlip(event, 'previous');
  }
  moveManualFlip(event: PointerEvent): void {
    if (!this.manualFlipping() || event.pointerId !== this.flipPointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const scale = Math.max(this.zoom(), 0.01);
    const direction = this.manualFlipDirection();
    const distance =
      direction === 'next'
        ? Math.max(0, (this.flipStartClientY - event.clientY) / scale)
        : Math.max(0, (event.clientY - this.flipStartClientY) / scale);
    const requiredDistance = Math.max(220, this.height() * 0.62);
    this.flipProgress.set(Math.min(1, distance / requiredDistance));
  }
  endManualFlip(event: PointerEvent): void {
    if (!this.manualFlipping() || event.pointerId !== this.flipPointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const grip = event.currentTarget as HTMLElement;
    if (grip.hasPointerCapture(event.pointerId)) {
      grip.releasePointerCapture(event.pointerId);
    }
    this.flipPointerId = null;
    const direction = this.manualFlipDirection();
    const shouldComplete = this.flipProgress() >= 0.42;
    this.manualFlipping.set(false);
    this.settlingFlip.set(true);
    if (direction && shouldComplete) {
      this.animateFlipProgress(this.flipProgress(), 1, 360, () => this.finishFlip(direction));
      return;
    }
    this.animateFlipProgress(this.flipProgress(), 0, 340, () => this.resetFlipState());
  }
  cancelManualFlipFromPointer(event: PointerEvent): void {
    if (!this.manualFlipping() || event.pointerId !== this.flipPointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const grip = event.currentTarget as HTMLElement;
    if (grip.hasPointerCapture(event.pointerId)) {
      grip.releasePointerCapture(event.pointerId);
    }
    this.flipPointerId = null;
    this.manualFlipping.set(false);
    this.settlingFlip.set(true);
    this.animateFlipProgress(this.flipProgress(), 0, 340, () => this.resetFlipState());
  }
  startResize(event: PointerEvent): void {
    if (event.button !== 0 || this.flipping() || this.note().pinned) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
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
    if (!this.resizing || event.pointerId !== this.resizePointerId || this.note().pinned) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const scale = Math.max(this.zoom(), 0.01);
    this.width.set(Math.max(720, this.startWidth + (event.clientX - this.startPointerX) / scale));
    this.height.set(Math.max(560, this.startHeight + (event.clientY - this.startPointerY) / scale));
  }
  endResize(event: PointerEvent): void {
    if (!this.resizing || event.pointerId !== this.resizePointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
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
  flipPrevious(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.startAutomaticFlip('previous');
  }
  flipNext(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.startAutomaticFlip('next');
  }
  goToToday(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.flipping()) {
      this.todayClicked.emit(this.note().id);
    }
  }
  togglePinned(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.pinnedClicked.emit(this.note().id);
  }
  duplicate(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.duplicateClicked.emit(this.note().id);
  }
  delete(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.deleteClicked.emit(this.note().id);
  }
  changeLeftPin(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const pinId = this.getNextPinId(this.note().pinId);
    this.pinChanged.emit({
      id: this.note().id,
      pinId,
    });
  }
  changeRightPin(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const currentPinId = this.note().secondaryPinId || this.note().pinId;
    const pinId = this.getNextPinId(currentPinId);
    this.secondaryPinChanged.emit({
      id: this.note().id,
      pinId,
    });
  }
  getCalendarEvents(date: string): CalendarEventModel[] {
    return this.calendarEventsByDate().get(date) || [];
  }
  getMonthShortName(month: number): string {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2026, month, 1));
  }
  paperStripTop(index: number): number {
    return index * this.stripHeight();
  }
  paperStripHeight(): number {
    return this.stripHeight() + 1.25;
  }
  paperSurfaceTop(index: number): number {
    return -(index * this.stripHeight());
  }
  paperStripTransform(index: number): string {
    const progress = this.flipProgress();
    const direction = this.activeFlipDirection();
    if (!direction) {
      return 'translate3d(0,0,0) rotateX(0deg)';
    }
    const stripHeight = this.stripHeight();
    const angles = this.getPaperStripAngles(progress);
    let y = 0;
    let z = 0;
    for (let current = 0; current < index; current++) {
      const radians = (angles[current] * Math.PI) / 180;
      y += stripHeight * Math.cos(radians);
      z += stripHeight * Math.sin(radians);
    }
    const normalY = index * stripHeight;
    const translateY = y - normalY;
    const angle = angles[index];
    return `translate3d(0,${translateY.toFixed(3)}px,${z.toFixed(3)}px) rotateX(${angle.toFixed(3)}deg)`;
  }
  paperStripShade(index: number): number {
    const angles = this.getPaperStripAngles(this.flipProgress());
    const previous = index === 0 ? angles[index] : angles[index - 1];
    const difference = Math.abs(angles[index] - previous);
    return Math.min(0.13, difference / 240);
  }
  paperStripHighlight(index: number): number {
    const curve = this.paperCurveStrength();
    const position = index / Math.max(1, this.paperStripCount - 1);
    const centerDistance = Math.abs(position - 0.5);
    return Math.max(0, curve * (0.07 - centerDistance * 0.055));
  }
  private getPaperStripAngles(progress: number): number[] {
    const direction = this.activeFlipDirection();
    if (!direction) {
      return this.paperStrips.map(() => 0);
    }
    const baseAngle = direction === 'next' ? 178 * progress : 178 * (1 - progress);
    const curve = Math.sin(progress * Math.PI);
    const curveAmount = curve * 42;
    return this.paperStrips.map((index) => {
      const position = (index + 0.5) / this.paperStripCount;
      const profile = Math.sin((position - 0.5) * Math.PI);
      const angle = baseAngle + profile * curveAmount;
      return Math.max(0, Math.min(178, angle));
    });
  }
  private startManualFlip(
    event: PointerEvent,
    direction: Exclude<ManualFlipDirection, null>,
  ): void {
    if (
      event.button !== 0 ||
      this.flipping() ||
      this.dragging ||
      this.resizing ||
      !this.note().calendar
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.cancelAnimation();
    this.prepareDestinationPage(direction);
    this.manualFlipDirection.set(direction);
    this.manualFlipping.set(true);
    this.settlingFlip.set(false);
    this.flipProgress.set(0);
    this.flipPointerId = event.pointerId;
    this.flipStartClientY = event.clientY;
    this.activated.emit(this.note().id);
    const grip = event.currentTarget as HTMLElement;
    if (!grip.hasPointerCapture(event.pointerId)) {
      grip.setPointerCapture(event.pointerId);
    }
  }
  private startAutomaticFlip(direction: Exclude<CalendarFlipDirection, null>): void {
    if (this.flipping()) {
      return;
    }
    this.cancelAnimation();
    this.prepareDestinationPage(direction);
    this.flipDirection.set(direction);
    this.flipProgress.set(0);
    this.settlingFlip.set(true);
    this.animateFlipProgress(0, 1, 720, () => this.finishFlip(direction));
  }
  private animateFlipProgress(
    from: number,
    to: number,
    duration: number,
    complete: () => void,
  ): void {
    this.cancelAnimation();
    const start = performance.now();
    const animate = (time: number) => {
      const elapsed = Math.min(1, (time - start) / duration);
      const eased = this.easeInOutCubic(elapsed);
      this.flipProgress.set(from + (to - from) * eased);
      if (elapsed < 1) {
        this.animationFrame = requestAnimationFrame(animate);
        return;
      }
      this.animationFrame = null;
      complete();
    };
    this.animationFrame = requestAnimationFrame(animate);
  }
  private easeInOutCubic(value: number): number {
    return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }
  private finishFlip(direction: Exclude<CalendarFlipDirection, null>): void {
    if (direction === 'next') {
      this.nextMonth.emit(this.note().id);
    } else {
      this.previousMonth.emit(this.note().id);
    }
    this.resetFlipState();
  }
  private prepareDestinationPage(direction: 'previous' | 'next'): void {
    const calendar = this.note().calendar;
    if (!calendar) {
      return;
    }
    let year = calendar.year;
    let month = calendar.month + (direction === 'next' ? 1 : -1);
    if (month > 11) {
      month = 0;
      year++;
    }
    if (month < 0) {
      month = 11;
      year--;
    }
    this.destinationPage.set(this.createPage(year, month));
  }
  private resetFlipState(): void {
    this.cancelAnimation();
    this.flipDirection.set(null);
    this.manualFlipDirection.set(null);
    this.manualFlipping.set(false);
    this.settlingFlip.set(false);
    this.flipProgress.set(0);
    this.destinationPage.set(null);
    this.flipPointerId = null;
  }
  private cancelAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
  private createPage(year: number, month: number): CalendarPage {
    return {
      year,
      month,
      monthName: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
        new Date(year, month, 1),
      ),
      monthShortName: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
        new Date(year, month, 1),
      ),
      daysInMonth: new Date(year, month + 1, 0).getDate(),
      days: this.createCalendarDays(year, month),
    };
  }
  private createCalendarDays(year: number, month: number): CalendarDay[] {
    const firstDay = new Date(year, month, 1).getDay();
    const today = new Date();
    const calendar = this.note().calendar;
    const cells: CalendarDay[] = [];
    const monthCache = new Map<
      string,
      {
        holidays: PhilippineHoliday[];
        moonPhases: MoonPhase[];
      }
    >();
    for (let index = 0; index < 42; index++) {
      const cellDate = new Date(year, month, index - firstDay + 1);
      const cellYear = cellDate.getFullYear();
      const cellMonth = cellDate.getMonth();
      const day = cellDate.getDate();
      const date = this.formatCalendarDate(cellYear, cellMonth, day);
      const currentMonth = cellYear === year && cellMonth === month;
      const cacheKey = `${cellYear}-${cellMonth}`;
      if (!monthCache.has(cacheKey)) {
        monthCache.set(cacheKey, {
          holidays: calendar?.showHolidays
            ? this.calendarService.getHolidaysForMonth(cellYear, cellMonth)
            : [],
          moonPhases: calendar?.showMoonPhases
            ? this.calendarService.getMoonPhases(cellYear, cellMonth)
            : [],
        });
      }
      const monthData = monthCache.get(cacheKey)!;
      cells.push({
        day,
        date,
        year: cellYear,
        month: cellMonth,
        currentMonth,
        today:
          today.getFullYear() === cellYear &&
          today.getMonth() === cellMonth &&
          today.getDate() === day,
        sunday: cellDate.getDay() === 0,
        holiday: monthData.holidays.find((item) => item.date === date) || null,
        moonPhase: monthData.moonPhases.find((item) => item.date === date) || null,
        tide: currentMonth ? this.getPendingTide() : null,
      });
    }
    return cells;
  }
  private getPendingTide(): CalendarTide {
    return {
      highTime: null,
      highHeight: null,
      lowTime: null,
      lowHeight: null,
    };
  }
  private getNextPinId(currentPinId: string): string {
    const pins = this.noteStyleService.pins.filter((pin) => pin.type !== 'none');
    if (!pins.length) {
      return currentPinId;
    }
    const index = pins.findIndex((pin) => pin.id === currentPinId);
    return pins[index >= 0 ? (index + 1) % pins.length : 0].id;
  }
  private formatCalendarDate(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  private isInteractiveTarget(target: HTMLElement): boolean {
    return !!target.closest(
      'button, input, textarea, select, option, a, label, [contenteditable="true"], .resize-handle, .calendar-actions, .calendar-page-grip, .calendar-back-grip, .calendar-pin',
    );
  }
}

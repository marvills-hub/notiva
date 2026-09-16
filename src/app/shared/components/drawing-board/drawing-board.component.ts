import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DrawingBoardService } from '../../../core/services/drawing-board.service';
import {
  DrawingBoardModel,
  DrawingBoardDefinition,
  DrawingStroke,
  DrawingPoint,
} from '../../../core/models/drawring-board.model';
import {
  DrawingStickerDefinition,
  DrawingStickerTransform,
} from '../../../core/models/drawing-sticker.model';
import {
  DrawingSnip,
  DrawingSnipSelection,
  DrawingSnipTransform,
} from '../../../core/models/drawing-snip.model';
import { StickerPickerComponent } from '../sticker-picker/sticker-picker.component';
type StickerInteraction = 'drag' | 'resize' | 'rotate' | null;
type SnipInteraction = 'drag' | 'resize' | 'rotate' | null;
@Component({
  selector: 'app-drawing-board',
  standalone: true,
  imports: [StickerPickerComponent],
  templateUrl: './drawing-board.component.html',
  styleUrl: './drawing-board.component.scss',
})
export class DrawingBoardComponent implements AfterViewInit, OnDestroy {
  private readonly drawingBoardService = inject(DrawingBoardService);
  @ViewChild('drawingCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('drawingSurface') private surfaceRef?: ElementRef<HTMLElement>;
  @ViewChild('drawingViewport') private viewportRef?: ElementRef<HTMLElement>;
  readonly board = input.required<DrawingBoardModel>();
  readonly definition = computed<DrawingBoardDefinition>(() =>
    this.drawingBoardService.getDefinition(this.board().type),
  );
  readonly activeColor = signal('');
  readonly activeSize = signal(0);
  readonly erasing = signal(false);
  readonly drawing = signal(false);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly stickerPickerOpen = signal(false);
  readonly selectedStickerId = signal<string | null>(null);
  readonly selectedSticker = computed(() => {
    const id = this.selectedStickerId();
    return id ? this.board().stickers.find((sticker) => sticker.id === id) : undefined;
  });
  readonly snipMode = signal(false);
  readonly snipping = signal(false);
  readonly snipSelection = signal<DrawingSnipSelection | null>(null);
  readonly selectedSnipId = signal<string | null>(null);
  readonly selectedSnip = computed(() => {
    const id = this.selectedSnipId();
    return id ? this.board().snips.find((snip) => snip.id === id) : undefined;
  });
  readonly zoom = signal(1);
  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  readonly minZoom = 0.25;
  readonly maxZoom = 3;
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly worldWidth = signal(1200);
  readonly worldHeight = signal(760);
  readonly panning = signal(false);
  readonly spacePressed = signal(false);
  readonly worldTransform = computed(
    () => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`,
  );
  private context: CanvasRenderingContext2D | null = null;
  private currentStroke: DrawingStroke | null = null;
  private pointerId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private renderedBoardId = '';
  private renderedUpdatedAt = 0;
  private stickerInteraction: StickerInteraction = null;
  private interactingStickerId: string | null = null;
  private stickerPointerId: number | null = null;
  private stickerStartClientX = 0;
  private stickerStartClientY = 0;
  private stickerStartX = 0;
  private stickerStartY = 0;
  private stickerStartWidth = 0;
  private stickerStartHeight = 0;
  private stickerStartRotation = 0;
  private stickerStartAngle = 0;
  private stickerCenterX = 0;
  private stickerCenterY = 0;
  private snipPointerId: number | null = null;
  private snipStartX = 0;
  private snipStartY = 0;
  private snipInteraction: SnipInteraction = null;
  private interactingSnipId: string | null = null;
  private snipTransformPointerId: number | null = null;
  private snipStartClientX = 0;
  private snipStartClientY = 0;
  private snipTransformStartX = 0;
  private snipTransformStartY = 0;
  private snipStartWidth = 0;
  private snipStartHeight = 0;
  private snipStartRotation = 0;
  private snipStartAngle = 0;
  private snipCenterX = 0;
  private snipCenterY = 0;
  private snipDragElement: HTMLElement | null = null;
  private snipPendingTransform: DrawingSnipTransform | null = null;
  private panPointerId: number | null = null;
  private panStartClientX = 0;
  private panStartClientY = 0;
  private panStartX = 0;
  private panStartY = 0;
  constructor() {
    effect(() => {
      const definition = this.definition();
      this.activeColor.set(definition.tool.defaultColor);
      this.activeSize.set(definition.tool.defaultSize);
    });
    effect(() => {
      const board = this.board();
      const updatedAt = board.updatedAt.getTime();
      if (board.id === this.renderedBoardId && updatedAt === this.renderedUpdatedAt) return;
      const boardChanged = board.id !== this.renderedBoardId;
      this.renderedBoardId = board.id;
      this.renderedUpdatedAt = updatedAt;
      const selectedStickerId = this.selectedStickerId();
      if (
        selectedStickerId &&
        !board.stickers.some((sticker) => sticker.id === selectedStickerId)
      ) {
        this.selectedStickerId.set(null);
      }
      const selectedSnipId = this.selectedSnipId();
      if (selectedSnipId && !board.snips.some((snip) => snip.id === selectedSnipId)) {
        this.selectedSnipId.set(null);
      }
      if (boardChanged) {
        this.zoom.set(1);
        this.panX.set(0);
        this.panY.set(0);
        this.resetWorldSize(board);
      }
      this.refreshHistoryState();
      queueMicrotask(() => {
        this.resizeCanvas();
        if (boardChanged) this.centerBoard();
      });
    });
  }
  ngAfterViewInit(): void {
    const canvas = this.canvasRef?.nativeElement;
    const viewport = this.viewportRef?.nativeElement;
    if (!canvas) return;
    this.context = canvas.getContext('2d');
    this.resizeObserver = new ResizeObserver(() => {
      this.ensureWorldCoversViewport();
      this.resizeCanvas();
      this.constrainPan();
    });
    this.resizeObserver.observe(canvas);
    if (viewport) this.resizeObserver.observe(viewport);
    this.ensureWorldCoversViewport();
    this.resizeCanvas();
    queueMicrotask(() => this.centerBoard());
  }
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
  selectColor(color: string): void {
    this.cancelSnipMode();
    this.erasing.set(false);
    this.activeColor.set(color);
    this.clearObjectSelection();
  }
  selectSize(size: number): void {
    this.activeSize.set(size);
  }
  selectDrawingTool(): void {
    this.cancelSnipMode();
    this.erasing.set(false);
    this.clearObjectSelection();
  }
  selectEraser(): void {
    this.cancelSnipMode();
    this.erasing.set(true);
    this.clearObjectSelection();
  }
  activateSnipMode(): void {
    if (this.drawing() || this.stickerInteraction || this.snipInteraction || this.panning()) return;
    this.erasing.set(false);
    this.stickerPickerOpen.set(false);
    this.clearObjectSelection();
    this.snipSelection.set(null);
    this.snipMode.set(!this.snipMode());
  }
  cancelSnipMode(): void {
    this.snipMode.set(false);
    this.snipping.set(false);
    this.snipSelection.set(null);
    this.snipPointerId = null;
  }
  zoomIn(): void {
    this.zoomAtViewportCenter(this.zoom() + 0.1);
  }
  zoomOut(): void {
    this.zoomAtViewportCenter(this.zoom() - 0.1);
  }
  resetZoom(): void {
    if (this.isInteractionActive()) return;
    this.zoom.set(1);
    this.centerBoard();
  }
  setZoom(value: number): void {
    this.zoomAtViewportCenter(value);
  }
  onViewportWheel(event: WheelEvent): void {
    if (!event.ctrlKey || this.isInteractionActive()) return;
    event.preventDefault();
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const step = event.deltaY < 0 ? 0.1 : -0.1;
    this.zoomAtPoint(this.zoom() + step, pointerX, pointerY);
  }
  startPan(event: PointerEvent): void {
    if (!this.canStartPan(event)) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelSnipMode();
    this.clearObjectSelection();
    this.panPointerId = event.pointerId;
    this.panStartClientX = event.clientX;
    this.panStartClientY = event.clientY;
    this.panStartX = this.panX();
    this.panStartY = this.panY();
    this.panning.set(true);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
  openStickerPicker(): void {
    if (this.drawing() || this.snipping() || this.panning()) return;
    this.cancelSnipMode();
    this.stickerPickerOpen.set(true);
  }
  closeStickerPicker(): void {
    this.stickerPickerOpen.set(false);
  }
  addSticker(definition: DrawingStickerDefinition): void {
    const sticker = this.drawingBoardService.addSticker(this.board().id, definition);
    if (!sticker) return;
    this.selectedSnipId.set(null);
    this.selectedStickerId.set(sticker.id);
    this.stickerPickerOpen.set(false);
    this.refreshHistoryState();
  }
  selectSticker(event: PointerEvent, stickerId: string): void {
    if (this.snipMode() || this.spacePressed() || event.button === 1) return;
    event.preventDefault();
    event.stopPropagation();
    const sticker = this.board().stickers.find((item) => item.id === stickerId);
    if (!sticker) return;
    this.selectedSnipId.set(null);
    this.selectedStickerId.set(stickerId);
    this.beginStickerInteraction(event, stickerId, 'drag');
  }
  startStickerResize(event: PointerEvent, stickerId: string): void {
    if (this.spacePressed()) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedSnipId.set(null);
    this.selectedStickerId.set(stickerId);
    this.beginStickerInteraction(event, stickerId, 'resize');
  }
  startStickerRotate(event: PointerEvent, stickerId: string): void {
    if (this.spacePressed()) return;
    event.preventDefault();
    event.stopPropagation();
    const sticker = this.board().stickers.find((item) => item.id === stickerId);
    const element = (event.currentTarget as HTMLElement).closest(
      '.drawing-sticker',
    ) as HTMLElement | null;
    if (!sticker || !element) return;
    const rect = element.getBoundingClientRect();
    this.selectedSnipId.set(null);
    this.selectedStickerId.set(stickerId);
    this.stickerInteraction = 'rotate';
    this.interactingStickerId = stickerId;
    this.stickerPointerId = event.pointerId;
    this.stickerStartRotation = sticker.rotation;
    this.stickerCenterX = rect.left + rect.width / 2;
    this.stickerCenterY = rect.top + rect.height / 2;
    this.stickerStartAngle =
      (Math.atan2(event.clientY - this.stickerCenterY, event.clientX - this.stickerCenterX) * 180) /
      Math.PI;
    this.drawingBoardService.beginStickerTransform(this.board().id, stickerId);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
  deselectObjects(): void {
    if (this.stickerInteraction || this.snipInteraction || this.snipping() || this.panning())
      return;
    this.clearObjectSelection();
  }
  duplicateSticker(event: MouseEvent, stickerId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const duplicate = this.drawingBoardService.duplicateSticker(this.board().id, stickerId);
    if (!duplicate) return;
    this.selectedSnipId.set(null);
    this.selectedStickerId.set(duplicate.id);
    this.refreshHistoryState();
  }
  deleteSticker(event: MouseEvent, stickerId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.drawingBoardService.deleteSticker(this.board().id, stickerId);
    if (this.selectedStickerId() === stickerId) this.selectedStickerId.set(null);
    this.refreshHistoryState();
  }
  bringStickerForward(event: MouseEvent, stickerId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.drawingBoardService.bringStickerForward(this.board().id, stickerId);
    this.refreshHistoryState();
  }
  sendStickerBackward(event: MouseEvent, stickerId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.drawingBoardService.sendStickerBackward(this.board().id, stickerId);
    this.refreshHistoryState();
  }
  startSnipSelection(event: PointerEvent): void {
    if (!this.snipMode() || this.snipping()) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.getBoardPoint(event);
    this.clearObjectSelection();
    this.snipPointerId = event.pointerId;
    this.snipStartX = point.x;
    this.snipStartY = point.y;
    this.snipSelection.set({ x: point.x, y: point.y, width: 0, height: 0 });
    this.snipping.set(true);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
  continueSnipSelection(event: PointerEvent): void {
    if (!this.snipping() || event.pointerId !== this.snipPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.getBoardPoint(event);
    this.ensureWorldNearPoint(point.x, point.y);
    const x = Math.min(this.snipStartX, point.x);
    const y = Math.min(this.snipStartY, point.y);
    const width = Math.abs(point.x - this.snipStartX);
    const height = Math.abs(point.y - this.snipStartY);
    this.snipSelection.set({ x, y, width, height });
  }
  endSnipSelection(event: PointerEvent): void {
    if (!this.snipping() || event.pointerId !== this.snipPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    const selection = this.snipSelection();
    this.snipping.set(false);
    this.snipPointerId = null;
    if (!selection || selection.width < 8 || selection.height < 8) {
      this.snipSelection.set(null);
      return;
    }
    const snip = this.captureSnip(selection);
    this.snipSelection.set(null);
    this.snipMode.set(false);
    if (!snip) return;
    this.selectedStickerId.set(null);
    this.selectedSnipId.set(snip.id);
    this.refreshHistoryState();
  }
  cancelSnipSelection(event: PointerEvent): void {
    if (event.pointerId !== this.snipPointerId) return;
    this.snipping.set(false);
    this.snipPointerId = null;
    this.snipSelection.set(null);
  }
  selectSnip(event: PointerEvent, snipId: string): void {
    if (this.snipMode() || this.spacePressed() || event.button === 1) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('.drawing-snip-toolbar,.drawing-snip-rotate,.drawing-snip-resize')) return;
    event.preventDefault();
    event.stopPropagation();
    const snip = this.board().snips.find((item) => item.id === snipId);
    if (!snip) return;
    this.selectedStickerId.set(null);
    this.selectedSnipId.set(snipId);
    if (snip.pinned) return;
    this.beginSnipInteraction(event, snipId, 'drag');
  }
  startSnipResize(event: PointerEvent, snipId: string): void {
    if (this.spacePressed()) return;
    event.preventDefault();
    event.stopPropagation();
    const snip = this.board().snips.find((item) => item.id === snipId);
    if (!snip || snip.pinned) return;
    this.selectedStickerId.set(null);
    this.selectedSnipId.set(snipId);
    this.beginSnipInteraction(event, snipId, 'resize');
  }
  startSnipRotate(event: PointerEvent, snipId: string): void {
    if (this.spacePressed()) return;
    event.preventDefault();
    event.stopPropagation();
    const snip = this.board().snips.find((item) => item.id === snipId);
    const element = (event.currentTarget as HTMLElement).closest(
      '.drawing-snip',
    ) as HTMLElement | null;
    if (!snip || snip.pinned || !element) return;
    const rect = element.getBoundingClientRect();
    this.selectedStickerId.set(null);
    this.selectedSnipId.set(snipId);
    this.snipInteraction = 'rotate';
    this.interactingSnipId = snipId;
    this.snipTransformPointerId = event.pointerId;
    this.snipStartRotation = snip.rotation;
    this.snipCenterX = rect.left + rect.width / 2;
    this.snipCenterY = rect.top + rect.height / 2;
    this.snipStartAngle =
      (Math.atan2(event.clientY - this.snipCenterY, event.clientX - this.snipCenterX) * 180) /
      Math.PI;
    this.drawingBoardService.beginSnipTransform(this.board().id, snipId);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
  toggleSnipPinned(event: MouseEvent, snipId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.drawingBoardService.toggleSnipPinned(this.board().id, snipId);
    this.refreshHistoryState();
  }
  deleteSnip(event: MouseEvent, snipId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.drawingBoardService.deleteSnip(this.board().id, snipId);
    if (this.selectedSnipId() === snipId) this.selectedSnipId.set(null);
    this.refreshHistoryState();
  }
  bringSnipForward(event: MouseEvent, snipId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.drawingBoardService.bringSnipForward(this.board().id, snipId);
    this.refreshHistoryState();
  }
  sendSnipBackward(event: MouseEvent, snipId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.drawingBoardService.sendSnipBackward(this.board().id, snipId);
    this.refreshHistoryState();
  }
  @HostListener('document:pointermove', ['$event'])
  documentPointerMove(event: PointerEvent): void {
    this.moveSticker(event);
    this.moveSnip(event);
    this.movePan(event);
  }
  @HostListener('document:pointerup', ['$event'])
  documentPointerUp(event: PointerEvent): void {
    this.finishStickerInteraction(event);
    this.finishSnipInteraction(event);
    this.finishPan(event);
  }
  @HostListener('document:pointercancel', ['$event'])
  documentPointerCancel(event: PointerEvent): void {
    this.finishStickerInteraction(event);
    this.finishSnipInteraction(event);
    this.finishPan(event);
  }
  @HostListener('document:keydown', ['$event'])
  handleKeyboard(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    const target = keyboardEvent.target as HTMLElement | null;
    if (target?.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (keyboardEvent.code === 'Space') {
      keyboardEvent.preventDefault();
      this.spacePressed.set(true);
      return;
    }
    if (keyboardEvent.key === 'Escape') {
      if (this.snipMode() || this.snipping()) {
        keyboardEvent.preventDefault();
        this.cancelSnipMode();
        return;
      }
      if (this.selectedStickerId() || this.selectedSnipId()) {
        keyboardEvent.preventDefault();
        this.clearObjectSelection();
      }
      return;
    }
    if (keyboardEvent.key !== 'Delete' && keyboardEvent.key !== 'Backspace') return;
    const stickerId = this.selectedStickerId();
    if (stickerId) {
      keyboardEvent.preventDefault();
      this.drawingBoardService.deleteSticker(this.board().id, stickerId);
      this.selectedStickerId.set(null);
      this.refreshHistoryState();
      return;
    }
    const snipId = this.selectedSnipId();
    if (!snipId) return;
    keyboardEvent.preventDefault();
    this.drawingBoardService.deleteSnip(this.board().id, snipId);
    this.selectedSnipId.set(null);
    this.refreshHistoryState();
  }
  @HostListener('document:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') this.spacePressed.set(false);
  }
  @HostListener('window:blur')
  handleWindowBlur(): void {
    this.spacePressed.set(false);
  }
  startDrawing(event: PointerEvent): void {
    if (this.spacePressed() || event.button === 1) return;
    if (this.snipMode()) {
      this.startSnipSelection(event);
      return;
    }
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    event.preventDefault();
    event.stopPropagation();
    this.clearObjectSelection();
    this.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    const point = this.getPointerPoint(event);
    this.ensureWorldNearPoint(point.x, point.y);
    if (this.erasing()) {
      this.eraseAt(point);
      this.drawing.set(true);
      return;
    }
    const stroke = this.drawingBoardService.createStroke(
      this.board().type,
      this.activeColor(),
      this.activeSize(),
    );
    stroke.points.push(point);
    this.currentStroke = stroke;
    this.drawing.set(true);
    this.drawLiveStroke(stroke);
  }
  continueDrawing(event: PointerEvent): void {
    if (this.snipMode()) {
      this.continueSnipSelection(event);
      return;
    }
    if (!this.drawing() || event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.getPointerPoint(event);
    this.ensureWorldNearPoint(point.x, point.y);
    if (this.erasing()) {
      this.eraseAt(point);
      return;
    }
    if (!this.currentStroke) return;
    const previousPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
    this.currentStroke.points.push(point);
    this.drawSegment(this.currentStroke, previousPoint, point);
  }
  endDrawing(event: PointerEvent): void {
    if (this.snipMode()) {
      this.endSnipSelection(event);
      return;
    }
    if (!this.drawing() || event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = this.canvasRef?.nativeElement;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!this.erasing() && this.currentStroke)
      this.drawingBoardService.addStroke(this.board().id, this.currentStroke);
    this.currentStroke = null;
    this.pointerId = null;
    this.drawing.set(false);
    this.refreshHistoryState();
    this.render();
  }
  cancelDrawing(event: PointerEvent): void {
    if (this.snipMode()) {
      this.cancelSnipSelection(event);
      return;
    }
    if (event.pointerId !== this.pointerId) return;
    const canvas = this.canvasRef?.nativeElement;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    this.currentStroke = null;
    this.pointerId = null;
    this.drawing.set(false);
    this.render();
  }
  undo(): void {
    if (this.isInteractionActive()) return;
    this.drawingBoardService.undo(this.board().id);
    this.clearObjectSelection();
    this.refreshHistoryState();
    this.render();
  }
  redo(): void {
    if (this.isInteractionActive()) return;
    this.drawingBoardService.redo(this.board().id);
    this.clearObjectSelection();
    this.refreshHistoryState();
    this.render();
  }
  clear(): void {
    const board = this.board();
    if (
      this.isInteractionActive() ||
      (!board.strokes.length && !board.stickers.length && !board.snips.length)
    )
      return;
    this.drawingBoardService.clearBoard(board.id);
    this.clearObjectSelection();
    this.refreshHistoryState();
    this.render();
  }
  strokePreviewSize(size: number): number {
    return Math.max(4, size * 1.5);
  }
  private beginStickerInteraction(
    event: PointerEvent,
    stickerId: string,
    interaction: 'drag' | 'resize',
  ): void {
    const sticker = this.board().stickers.find((item) => item.id === stickerId);
    if (!sticker) return;
    this.stickerInteraction = interaction;
    this.interactingStickerId = stickerId;
    this.stickerPointerId = event.pointerId;
    this.stickerStartClientX = event.clientX;
    this.stickerStartClientY = event.clientY;
    this.stickerStartX = sticker.x;
    this.stickerStartY = sticker.y;
    this.stickerStartWidth = sticker.width;
    this.stickerStartHeight = sticker.height;
    this.stickerStartRotation = sticker.rotation;
    this.drawingBoardService.beginStickerTransform(this.board().id, stickerId);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
  private moveSticker(event: PointerEvent): void {
    if (
      !this.stickerInteraction ||
      !this.interactingStickerId ||
      event.pointerId !== this.stickerPointerId
    )
      return;
    const sticker = this.board().stickers.find((item) => item.id === this.interactingStickerId);
    if (!sticker) return;
    if (this.stickerInteraction === 'drag') {
      const dx = (event.clientX - this.stickerStartClientX) / this.zoom();
      const dy = (event.clientY - this.stickerStartClientY) / this.zoom();
      this.updateStickerTransform({
        x: this.stickerStartX + dx,
        y: this.stickerStartY + dy,
        width: this.stickerStartWidth,
        height: this.stickerStartHeight,
        rotation: this.stickerStartRotation,
      });
      return;
    }
    if (this.stickerInteraction === 'resize') {
      const dx = (event.clientX - this.stickerStartClientX) / this.zoom();
      const dy = (event.clientY - this.stickerStartClientY) / this.zoom();
      const ratio = this.stickerStartWidth / Math.max(this.stickerStartHeight, 1);
      let width = this.stickerStartWidth + dx;
      let height = this.stickerStartHeight + dy;
      if (sticker.type === 'emoji' || sticker.type === 'symbol' || event.shiftKey) {
        const dominant = Math.abs(dx) >= Math.abs(dy) ? dx : dy * ratio;
        width = this.stickerStartWidth + dominant;
        height = width / ratio;
      }
      this.updateStickerTransform({
        x: this.stickerStartX,
        y: this.stickerStartY,
        width,
        height,
        rotation: this.stickerStartRotation,
      });
      return;
    }
    const angle =
      (Math.atan2(event.clientY - this.stickerCenterY, event.clientX - this.stickerCenterX) * 180) /
      Math.PI;
    let rotation = this.stickerStartRotation + angle - this.stickerStartAngle;
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
    this.updateStickerTransform({
      x: sticker.x,
      y: sticker.y,
      width: sticker.width,
      height: sticker.height,
      rotation,
    });
  }
  private finishStickerInteraction(event: PointerEvent): void {
    if (
      !this.stickerInteraction ||
      !this.interactingStickerId ||
      event.pointerId !== this.stickerPointerId
    )
      return;
    const stickerId = this.interactingStickerId;
    this.drawingBoardService.endStickerTransform(this.board().id, stickerId);
    this.stickerInteraction = null;
    this.interactingStickerId = null;
    this.stickerPointerId = null;
    this.refreshHistoryState();
  }
  private updateStickerTransform(transform: DrawingStickerTransform): void {
    const stickerId = this.interactingStickerId;
    if (!stickerId) return;
    this.drawingBoardService.transformSticker(this.board().id, stickerId, transform);
  }
  private beginSnipInteraction(
    event: PointerEvent,
    snipId: string,
    interaction: 'drag' | 'resize',
  ): void {
    const snip = this.board().snips.find((item) => item.id === snipId);
    if (!snip || snip.pinned) return;
    this.snipInteraction = interaction;
    this.interactingSnipId = snipId;
    this.snipTransformPointerId = event.pointerId;
    this.snipStartClientX = event.clientX;
    this.snipStartClientY = event.clientY;
    this.snipTransformStartX = snip.x;
    this.snipTransformStartY = snip.y;
    this.snipStartWidth = snip.width;
    this.snipStartHeight = snip.height;
    this.snipStartRotation = snip.rotation;
    this.snipPendingTransform = null;
    if (interaction === 'drag') {
      this.snipDragElement = (event.currentTarget as HTMLElement).closest(
        '.drawing-snip',
      ) as HTMLElement | null;
    } else {
      this.snipDragElement = null;
    }
    this.drawingBoardService.beginSnipTransform(this.board().id, snipId);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
  private moveSnip(event: PointerEvent): void {
    if (
      !this.snipInteraction ||
      !this.interactingSnipId ||
      event.pointerId !== this.snipTransformPointerId
    )
      return;
    const snip = this.board().snips.find((item) => item.id === this.interactingSnipId);
    if (!snip || snip.pinned) return;
    event.preventDefault();
    if (this.snipInteraction === 'drag') {
      const dx = (event.clientX - this.snipStartClientX) / this.zoom();
      const dy = (event.clientY - this.snipStartClientY) / this.zoom();
      const maxX = Math.max(0, this.worldWidth() - this.snipStartWidth);
      const maxY = Math.max(0, this.worldHeight() - this.snipStartHeight);
      const x = Math.max(0, Math.min(maxX, this.snipTransformStartX + dx));
      const y = Math.max(0, Math.min(maxY, this.snipTransformStartY + dy));
      this.ensureWorldNearPoint(x + this.snipStartWidth, y + this.snipStartHeight);
      this.snipPendingTransform = {
        x,
        y,
        width: this.snipStartWidth,
        height: this.snipStartHeight,
        rotation: this.snipStartRotation,
      };
      if (this.snipDragElement) {
        this.snipDragElement.style.left = `${x}px`;
        this.snipDragElement.style.top = `${y}px`;
      }
      return;
    }
    if (this.snipInteraction === 'resize') {
      const dx = (event.clientX - this.snipStartClientX) / this.zoom();
      const dy = (event.clientY - this.snipStartClientY) / this.zoom();
      const ratio = this.snipStartWidth / Math.max(this.snipStartHeight, 1);
      const dominant = Math.abs(dx) >= Math.abs(dy) ? dx : dy * ratio;
      const width = this.snipStartWidth + dominant;
      const height = width / ratio;
      this.updateSnipTransform({
        x: this.snipTransformStartX,
        y: this.snipTransformStartY,
        width,
        height,
        rotation: this.snipStartRotation,
      });
      return;
    }
    const angle =
      (Math.atan2(event.clientY - this.snipCenterY, event.clientX - this.snipCenterX) * 180) /
      Math.PI;
    let rotation = this.snipStartRotation + angle - this.snipStartAngle;
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
    this.updateSnipTransform({
      x: snip.x,
      y: snip.y,
      width: snip.width,
      height: snip.height,
      rotation,
    });
  }
  private finishSnipInteraction(event: PointerEvent): void {
    if (
      !this.snipInteraction ||
      !this.interactingSnipId ||
      event.pointerId !== this.snipTransformPointerId
    )
      return;
    const snipId = this.interactingSnipId;
    const interaction = this.snipInteraction;
    const pendingTransform = this.snipPendingTransform;
    if (interaction === 'drag' && pendingTransform) {
      this.drawingBoardService.transformSnip(this.board().id, snipId, pendingTransform);
    }
    this.drawingBoardService.endSnipTransform(this.board().id, snipId);
    this.snipInteraction = null;
    this.interactingSnipId = null;
    this.snipTransformPointerId = null;
    this.snipDragElement = null;
    this.snipPendingTransform = null;
    this.refreshHistoryState();
  }
  private updateSnipTransform(transform: DrawingSnipTransform): void {
    const snipId = this.interactingSnipId;
    if (!snipId) return;
    this.drawingBoardService.transformSnip(this.board().id, snipId, transform);
  }
  private movePan(event: PointerEvent): void {
    if (!this.panning() || event.pointerId !== this.panPointerId) return;
    event.preventDefault();
    const dx = event.clientX - this.panStartClientX;
    const dy = event.clientY - this.panStartClientY;
    this.panX.set(this.panStartX + dx);
    this.panY.set(this.panStartY + dy);
    this.ensureWorldCoversViewport();
    this.constrainPan();
  }
  private finishPan(event: PointerEvent): void {
    if (!this.panning() || event.pointerId !== this.panPointerId) return;
    this.panning.set(false);
    this.panPointerId = null;
    this.constrainPan();
  }
  private canStartPan(event: PointerEvent): boolean {
    if (this.drawing() || this.snipping() || this.stickerInteraction || this.snipInteraction)
      return false;
    if (event.pointerType === 'mouse')
      return event.button === 1 || (event.button === 0 && this.spacePressed());
    return false;
  }
  private zoomAtViewportCenter(value: number): void {
    if (this.isInteractionActive()) return;
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) {
      this.zoom.set(this.clampZoom(value));
      return;
    }
    this.zoomAtPoint(value, viewport.clientWidth / 2, viewport.clientHeight / 2);
  }
  private zoomAtPoint(value: number, viewportX: number, viewportY: number): void {
    if (this.isInteractionActive()) return;
    const oldZoom = this.zoom();
    const nextZoom = this.clampZoom(value);
    if (nextZoom === oldZoom) return;
    const boardX = (viewportX - this.panX()) / oldZoom;
    const boardY = (viewportY - this.panY()) / oldZoom;
    this.zoom.set(nextZoom);
    this.panX.set(viewportX - boardX * nextZoom);
    this.panY.set(viewportY - boardY * nextZoom);
    this.ensureWorldCoversViewport();
    this.constrainPan();
  }
  private clampZoom(value: number): number {
    return Math.max(this.minZoom, Math.min(this.maxZoom, Math.round(value * 100) / 100));
  }
  private centerBoard(): void {
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) return;
    this.ensureWorldCoversViewport();
    const scaledWidth = this.worldWidth() * this.zoom();
    const scaledHeight = this.worldHeight() * this.zoom();
    this.panX.set((viewport.clientWidth - scaledWidth) / 2);
    this.panY.set((viewport.clientHeight - scaledHeight) / 2);
  }
  private constrainPan(): void {
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) return;
    this.ensureWorldCoversViewport();
    const scaledWidth = this.worldWidth() * this.zoom();
    const scaledHeight = this.worldHeight() * this.zoom();
    const minX = Math.min(0, viewport.clientWidth - scaledWidth);
    const minY = Math.min(0, viewport.clientHeight - scaledHeight);
    this.panX.set(Math.max(minX, Math.min(0, this.panX())));
    this.panY.set(Math.max(minY, Math.min(0, this.panY())));
  }
  private resetWorldSize(board: DrawingBoardModel): void {
    let maxX = board.width;
    let maxY = board.height;
    for (const stroke of board.strokes) {
      for (const point of stroke.points) {
        maxX = Math.max(maxX, point.x + 240);
        maxY = Math.max(maxY, point.y + 240);
      }
    }
    for (const sticker of board.stickers) {
      maxX = Math.max(maxX, sticker.x + sticker.width + 240);
      maxY = Math.max(maxY, sticker.y + sticker.height + 240);
    }
    for (const snip of board.snips) {
      maxX = Math.max(maxX, snip.x + snip.width + 240);
      maxY = Math.max(maxY, snip.y + snip.height + 240);
    }
    this.worldWidth.set(Math.ceil(maxX));
    this.worldHeight.set(Math.ceil(maxY));
  }
  private ensureWorldCoversViewport(): void {
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) return;
    const padding = 320;
    const visibleWidth = viewport.clientWidth / this.zoom();
    const visibleHeight = viewport.clientHeight / this.zoom();
    const visibleRight = Math.max(0, -this.panX() / this.zoom()) + visibleWidth;
    const visibleBottom = Math.max(0, -this.panY() / this.zoom()) + visibleHeight;
    const requiredWidth = Math.max(this.board().width, visibleRight + padding);
    const requiredHeight = Math.max(this.board().height, visibleBottom + padding);
    const nextWidth = Math.max(this.worldWidth(), Math.ceil(requiredWidth));
    const nextHeight = Math.max(this.worldHeight(), Math.ceil(requiredHeight));
    if (nextWidth === this.worldWidth() && nextHeight === this.worldHeight()) return;
    this.worldWidth.set(nextWidth);
    this.worldHeight.set(nextHeight);
    queueMicrotask(() => this.resizeCanvas());
  }
  private ensureWorldNearPoint(x: number, y: number): void {
    const threshold = 180;
    const extension = 640;
    let width = this.worldWidth();
    let height = this.worldHeight();
    if (x >= width - threshold) width += extension;
    if (y >= height - threshold) height += extension;
    if (width === this.worldWidth() && height === this.worldHeight()) return;
    this.worldWidth.set(width);
    this.worldHeight.set(height);
    queueMicrotask(() => this.resizeCanvas());
  }
  private isInteractionActive(): boolean {
    return (
      this.drawing() ||
      this.snipping() ||
      !!this.stickerInteraction ||
      !!this.snipInteraction ||
      this.panning()
    );
  }
  private captureSnip(selection: DrawingSnipSelection): DrawingSnip | undefined {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return undefined;
    const board = this.board();
    const sourceScaleX = canvas.width / this.worldWidth();
    const sourceScaleY = canvas.height / this.worldHeight();
    const sourceX = Math.max(0, Math.floor(selection.x * sourceScaleX));
    const sourceY = Math.max(0, Math.floor(selection.y * sourceScaleY));
    const sourceWidth = Math.max(
      1,
      Math.min(canvas.width - sourceX, Math.ceil(selection.width * sourceScaleX)),
    );
    const sourceHeight = Math.max(
      1,
      Math.min(canvas.height - sourceY, Math.ceil(selection.height * sourceScaleY)),
    );
    const output = document.createElement('canvas');
    output.width = sourceWidth;
    output.height = sourceHeight;
    const outputContext = output.getContext('2d');
    if (!outputContext) return undefined;
    this.paintSnipBackground(outputContext, board.type, selection, sourceWidth, sourceHeight);
    outputContext.drawImage(
      canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );
    this.paintSnipStickers(
      outputContext,
      selection,
      sourceWidth / selection.width,
      sourceHeight / selection.height,
    );
    const imageData = output.toDataURL('image/png');
    return this.drawingBoardService.addSnip(
      board.id,
      imageData,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      selection.x,
      selection.y,
    );
  }
  private paintSnipBackground(
    context: CanvasRenderingContext2D,
    type: DrawingBoardModel['type'],
    selection: DrawingSnipSelection,
    width: number,
    height: number,
  ): void {
    const scaleX = width / selection.width;
    const scaleY = height / selection.height;
    if (type === 'blackboard') {
      context.fillStyle = '#242522';
      context.fillRect(0, 0, width, height);
      return;
    }
    if (type === 'green-chalkboard') {
      context.fillStyle = '#244c3a';
      context.fillRect(0, 0, width, height);
      return;
    }
    if (type === 'blueprint') {
      context.fillStyle = '#164d78';
      context.fillRect(0, 0, width, height);
      this.paintGrid(context, selection, scaleX, scaleY, 16, 'rgba(214,236,244,0.045)');
      this.paintGrid(context, selection, scaleX, scaleY, 80, 'rgba(214,236,244,0.1)');
      return;
    }
    if (type === 'graph-board') {
      context.fillStyle = '#f7f8f6';
      context.fillRect(0, 0, width, height);
      this.paintGrid(context, selection, scaleX, scaleY, 24, 'rgba(75,116,153,0.14)');
      return;
    }
    if (type === 'notebook') {
      context.fillStyle = '#faf7ec';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = 'rgba(84,131,171,0.18)';
      context.lineWidth = Math.max(1, scaleY);
      const firstLine = Math.ceil(selection.y / 32) * 32;
      for (let boardY = firstLine; boardY <= selection.y + selection.height; boardY += 32) {
        const y = (boardY - selection.y) * scaleY;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      if (selection.x <= 72 && selection.x + selection.width >= 70) {
        context.strokeStyle = 'rgba(198,75,75,0.24)';
        context.lineWidth = Math.max(1, 2 * scaleX);
        const x = (71 - selection.x) * scaleX;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      return;
    }
    context.fillStyle = '#f7f7f3';
    context.fillRect(0, 0, width, height);
  }
  private paintGrid(
    context: CanvasRenderingContext2D,
    selection: DrawingSnipSelection,
    scaleX: number,
    scaleY: number,
    spacing: number,
    color: string,
  ): void {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1;
    const firstX = Math.ceil(selection.x / spacing) * spacing;
    const firstY = Math.ceil(selection.y / spacing) * spacing;
    for (let boardX = firstX; boardX <= selection.x + selection.width; boardX += spacing) {
      const x = (boardX - selection.x) * scaleX;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, selection.height * scaleY);
      context.stroke();
    }
    for (let boardY = firstY; boardY <= selection.y + selection.height; boardY += spacing) {
      const y = (boardY - selection.y) * scaleY;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(selection.width * scaleX, y);
      context.stroke();
    }
    context.restore();
  }
  private paintSnipStickers(
    context: CanvasRenderingContext2D,
    selection: DrawingSnipSelection,
    scaleX: number,
    scaleY: number,
  ): void {
    for (const sticker of this.board().stickers) {
      const right = sticker.x + sticker.width;
      const bottom = sticker.y + sticker.height;
      const selectionRight = selection.x + selection.width;
      const selectionBottom = selection.y + selection.height;
      if (
        right < selection.x ||
        sticker.x > selectionRight ||
        bottom < selection.y ||
        sticker.y > selectionBottom
      )
        continue;
      const x = (sticker.x - selection.x) * scaleX;
      const y = (sticker.y - selection.y) * scaleY;
      const width = sticker.width * scaleX;
      const height = sticker.height * scaleY;
      context.save();
      context.translate(x + width / 2, y + height / 2);
      context.rotate((sticker.rotation * Math.PI) / 180);
      context.font = `${Math.max(12, Math.min(width, height) * 0.82)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(sticker.value, 0, 0);
      context.restore();
    }
  }
  private getBoardPoint(event: PointerEvent): { x: number; y: number } {
    const surface = this.surfaceRef?.nativeElement;
    if (!surface) return { x: 0, y: 0 };
    const rect = surface.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.worldWidth(), (event.clientX - rect.left) / this.zoom())),
      y: Math.max(0, Math.min(this.worldHeight(), (event.clientY - rect.top) / this.zoom())),
    };
  }
  private resizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ratio = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.min(8192, Math.round(this.worldWidth() * ratio)));
    const height = Math.max(1, Math.min(8192, Math.round(this.worldHeight() * ratio)));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    this.context = canvas.getContext('2d');
    this.render();
  }
  private render(): void {
    const canvas = this.canvasRef?.nativeElement;
    const context = this.context;
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of this.board().strokes) this.drawStroke(stroke);
    if (this.currentStroke) this.drawStroke(this.currentStroke);
  }
  private drawStroke(stroke: DrawingStroke): void {
    if (!stroke.points.length) return;
    if (stroke.points.length === 1) {
      this.drawDot(stroke, stroke.points[0]);
      return;
    }
    for (let index = 1; index < stroke.points.length; index++) {
      this.drawSegment(stroke, stroke.points[index - 1], stroke.points[index]);
    }
  }
  private drawLiveStroke(stroke: DrawingStroke): void {
    if (!stroke.points.length) return;
    this.drawDot(stroke, stroke.points[0]);
  }
  private drawDot(stroke: DrawingStroke, point: DrawingPoint): void {
    const context = this.context;
    if (!context) return;
    const scale = this.getCanvasScale();
    const pressure = this.getPressure(point);
    const size = stroke.size * pressure * scale.x;
    context.save();
    context.globalAlpha = stroke.opacity;
    context.fillStyle = stroke.color;
    context.beginPath();
    context.arc(point.x * scale.x, point.y * scale.y, Math.max(0.75, size / 2), 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  private drawSegment(stroke: DrawingStroke, from: DrawingPoint, to: DrawingPoint): void {
    const context = this.context;
    if (!context) return;
    const scale = this.getCanvasScale();
    const pressure = (this.getPressure(from) + this.getPressure(to)) / 2;
    const width = stroke.size * pressure * scale.x;
    context.save();
    context.globalAlpha = stroke.opacity;
    context.strokeStyle = stroke.color;
    context.lineWidth = Math.max(1, width);
    context.lineCap = stroke.cap;
    context.lineJoin = 'round';
    if (stroke.tool === 'chalk') {
      context.shadowColor = stroke.color;
      context.shadowBlur = Math.max(0.4, stroke.size * 0.18 * scale.x);
    }
    context.beginPath();
    context.moveTo(from.x * scale.x, from.y * scale.y);
    context.lineTo(to.x * scale.x, to.y * scale.y);
    context.stroke();
    context.restore();
  }
  private eraseAt(point: DrawingPoint): void {
    const board = this.board();
    if (!board.strokes.length) return;
    const radius = Math.max(12, this.activeSize() * 4);
    const remaining = board.strokes.filter(
      (stroke) => !this.strokeTouchesPoint(stroke, point, radius),
    );
    if (remaining.length === board.strokes.length) return;
    this.drawingBoardService.replaceStrokes(board.id, remaining);
    this.refreshHistoryState();
    this.render();
  }
  private strokeTouchesPoint(stroke: DrawingStroke, point: DrawingPoint, radius: number): boolean {
    const threshold = radius + stroke.size / 2;
    const thresholdSquared = threshold * threshold;
    return stroke.points.some((strokePoint) => {
      const x = strokePoint.x - point.x;
      const y = strokePoint.y - point.y;
      return x * x + y * y <= thresholdSquared;
    });
  }
  private getPointerPoint(event: PointerEvent): DrawingPoint {
    const point = this.getBoardPoint(event);
    return {
      x: point.x,
      y: point.y,
      pressure: event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5,
    };
  }
  private getPressure(point: DrawingPoint): number {
    if (!point.pressure) return 1;
    return Math.max(0.55, Math.min(1.35, point.pressure * 1.6));
  }
  private getCanvasScale(): { x: number; y: number } {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return { x: 1, y: 1 };
    return {
      x: canvas.width / this.worldWidth(),
      y: canvas.height / this.worldHeight(),
    };
  }
  private clearObjectSelection(): void {
    this.selectedStickerId.set(null);
    this.selectedSnipId.set(null);
  }
  private refreshHistoryState(): void {
    this.canUndo.set(this.drawingBoardService.canUndo(this.board().id));
    this.canRedo.set(this.drawingBoardService.canRedo(this.board().id));
  }
}

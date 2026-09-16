import { NoteType } from './note.model';

export type InterfaceDensity = 'comfortable' | 'compact';
export type NoteOpenBehavior = 'single' | 'double';

export interface AppSettingsModel {
  interfaceDensity: InterfaceDensity;
  reducedMotion: boolean;
  defaultNoteType: NoteType;
  defaultNoteStyleId: string;
  defaultPinId: string;
  confirmPermanentDelete: boolean;
  showBoardGrid: boolean;
  snapToGrid: boolean;
  openBehavior: NoteOpenBehavior;
  doubleClickEdit: boolean;
  bringToFrontOnSelect: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettingsModel = {
  interfaceDensity: 'comfortable',
  reducedMotion: false,
  defaultNoteType: 'text',
  defaultNoteStyleId: 'classic-yellow',
  defaultPinId: 'red-pin',
  confirmPermanentDelete: true,
  showBoardGrid: true,
  snapToGrid: false,
  openBehavior: 'single',
  doubleClickEdit: true,
  bringToFrontOnSelect: true,
};

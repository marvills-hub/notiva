export type NoteType = 'text' | 'checklist' | 'idea' | 'reminder' | 'quote' | 'calendar';

export type NoteColor = 'yellow' | 'purple' | 'blue' | 'green' | 'pink' | 'orange';

export type IdeaStatus = 'new' | 'exploring' | 'planned' | 'done';

export type IdeaPriority = 'low' | 'medium' | 'high';

export interface ChecklistItemModel {
  id: string;
  text: string;
  completed: boolean;
}

export interface CalendarEventModel {
  id: string;
  title: string;
  date: string;
  color?: string;
}

export interface CalendarModel {
  year: number;
  month: number;
  showHolidays: boolean;
  showMoonPhases: boolean;
  country: 'PH';
  events: CalendarEventModel[];
}

export interface NoteModel {
  id: string;
  boardId: string;
  title: string;
  content: string;
  type: NoteType;
  color: NoteColor;
  styleId: string;
  pinId: string;
  secondaryPinId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  favorite: boolean;
  pinned: boolean;
  archived: boolean;
  tags: string[];
  checklistItems: ChecklistItemModel[];
  reminderAt: string | null;
  quoteAuthor: string;
  ideaStatus: IdeaStatus;
  ideaPriority: IdeaPriority;
  calendar?: CalendarModel;
  createdAt: Date;
  updatedAt: Date;
}

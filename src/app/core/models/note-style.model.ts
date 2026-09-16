export type NoteStyleCategory =
  | 'paper'
  | 'artistic'
  | 'nature'
  | 'cute'
  | 'animal'
  | 'food'
  | 'fantasy'
  | 'retro'
  | 'dark'
  | 'tech';

export type NotePattern = 'none' | 'lines' | 'grid' | 'dots' | 'notebook' | 'terminal';

export type NoteDecoration =
  | 'burnt'
  | 'wax'
  | 'curl'
  | 'spiral'
  | 'holes'
  | 'stamp'
  | 'map'
  | 'ink'
  | 'paint'
  | 'flower'
  | 'leaf'
  | 'mountain'
  | 'wave'
  | 'stars'
  | 'cat'
  | 'dog'
  | 'bunny'
  | 'panda'
  | 'bear'
  | 'frog'
  | 'duck'
  | 'penguin'
  | 'fox'
  | 'koala'
  | 'owl'
  | 'cake'
  | 'icecream'
  | 'boba'
  | 'donut'
  | 'chocolate'
  | 'candy'
  | 'cookie'
  | 'crystal'
  | 'book'
  | 'magic'
  | 'dragon'
  | 'gear'
  | 'cyber'
  | 'pixel'
  | 'comic'
  | 'none';

export interface NoteStyleModel {
  id: string;
  name: string;
  category: NoteStyleCategory;
  pattern: NotePattern;
  decoration: NoteDecoration;
  background: string;
  textColor: string;
  secondaryTextColor: string;
  lineColor: string;
  borderColor: string;
  accentColor: string;
  clipPath: string;
  borderRadius: string;
}

export type NotePinType =
  | 'pushpin'
  | 'round-pin'
  | 'heart'
  | 'star'
  | 'flower'
  | 'flag'
  | 'triangle'
  | 'circle'
  | 'face'
  | 'coffee'
  | 'leaf'
  | 'acorn'
  | 'bubble'
  | 'crystal'
  | 'diamond'
  | 'tape'
  | 'paperclip'
  | 'none';

export interface NotePinModel {
  id: string;
  name: string;
  type: NotePinType;
  color: string;
  secondaryColor?: string;
  icon?: string;
  rotation?: number;
  pattern?: string;
}

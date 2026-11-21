export type NoteSourceType = 'text' | 'topic' | 'youtube' | 'file';

export interface SavedNote {
  id: string;
  title: string;
  content: string;
  sourceType: NoteSourceType;
  createdAt: string;
  updatedAt: string;
  localOnly?: boolean;
}

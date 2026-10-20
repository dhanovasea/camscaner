export interface Point {
  x: number;
  y: number;
}

export interface DocumentCorners {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export type FilterType = 'original' | 'magic' | 'bw' | 'grayscale';

export interface PageItem {
  id: string;
  originalBlob: Blob;       // Original uncropped/unfiltered capture
  processedBlob: Blob;      // Warped + filtered image ready for display & export
  corners: DocumentCorners; // 4 corner coordinates on original image
  rotation: number;         // 0, 90, 180, 270
  filter: FilterType;       // Active enhancement filter
  brightness: number;       // -50 to 50
  contrast: number;         // -50 to 50
  width: number;
  height: number;
}

export interface DocumentRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pages: PageItem[];
  ocrText?: string;
}

export type SortOrder = 'newest' | 'oldest' | 'name';

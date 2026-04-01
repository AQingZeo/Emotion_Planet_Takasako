/**
 * Submission-oriented types for the installation (see .local_doc/changeBrief.md).
 */

export interface AIClassificationResult {
  emotion_id: string;
  emotion_label: string;
  confidence: number;
  valence: number;
  activation: number;
  reasoning_short?: string;
}

export type SubmissionStatus = 'draft' | 'submitted';

export interface PaintResult {
  /** Data URL or placeholder path for blob paint layer */
  blob_texture_data_url: string;
  /** Selected terrain base color (hex), e.g. #5F9569. */
  terrain_base_color: string;
}

export interface MatrixRender {
  sprite_png_data_url: string;
}

export interface SubmissionRecord {
  entry_id: string;
  created_at: string;
  session_id: string;
  /** Optional display name; stored as "N/A" when empty. */
  participant_name?: string;
  input_text: string;
  input_language?: string;
  ai_result: AIClassificationResult;
  paint_result: PaintResult;
  matrix_render: MatrixRender;
  status: SubmissionStatus;
}

/** Lightweight feed item for the matrix display. */
export interface MatrixEntry {
  entry_id: string;
  emotion_id: string;
  sprite_png_data_url: string;
  valence: number;
  activation: number;
  created_at: string;
}

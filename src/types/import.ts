export interface ImportCandidate {
  file_path: string;
  file_name: string;
  file_size: number;
  file_hash: string;
  is_duplicate: boolean;
  media_type: string;
  modified_at: string;
  thumbnail_path?: string;
  // Progressive loading state
  checking_duplicate?: boolean; // true while still checking for duplicates
}

export interface ImportSelection {
  [filePath: string]: boolean;
}

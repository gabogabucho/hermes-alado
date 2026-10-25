// Shapes mirrored from Hermes at bf0203a (web_routers/files.py
// `_managed_file_entry` / `list_managed_files`).

export interface ManagedEntry {
  name: string
  path: string
  is_directory: boolean
  size: number | null
  mtime: number | null
  mime_type: string | null
  broken_link?: boolean
}

export interface ManagedListing {
  path: string
  parent: string | null
  entries: ManagedEntry[]
  root?: string | null
  locked_root?: string | null
  can_change_path?: boolean
}

export interface ManagedRead {
  name: string
  path: string
  size: number
  mime_type: string
  data_url: string
}

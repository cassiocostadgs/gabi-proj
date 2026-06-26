interface DirectoryPickerOptions {
  mode?: 'read' | 'readwrite'
}

declare function showDirectoryPicker(
  options?: DirectoryPickerOptions
): Promise<FileSystemDirectoryHandle>

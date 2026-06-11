interface PendingSubmission {
  gaFile: File
  competencia: string
}

let _pending: PendingSubmission | null = null

export const pendingSubmission = {
  set: (gaFile: File, competencia: string) => {
    _pending = { gaFile, competencia }
  },
  get: () => _pending,
  clear: () => {
    _pending = null
  },
}

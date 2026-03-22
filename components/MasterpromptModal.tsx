'use client'

import MasterpromptBuilder from './MasterpromptBuilder'

interface MasterpromptModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function MasterpromptModal({ isOpen, onClose }: MasterpromptModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative z-10 bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-[var(--bg-panel)] transition-colors z-10"
          aria-label="Luk"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <MasterpromptBuilder />
      </div>
    </div>
  )
}

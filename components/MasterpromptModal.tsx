/*
 * MasterpromptModal.tsx
 *
 * This file exports the MasterpromptModal component — a full-screen overlay modal that
 * wraps the MasterpromptBuilder form. It is used in the teacher-facing sidebar when the
 * teacher wants to create or reconfigure a new chat session without leaving the current page.
 *
 * Exports:
 *   - default: MasterpromptModal (React functional component)
 *
 * How it fits in the app:
 *   The sidebar renders a "Ny chat" button that, when clicked, sets isOpen to true and
 *   mounts this modal. The modal renders MasterpromptBuilder inside a centred panel with
 *   a semi-transparent backdrop. Clicking the backdrop or the X button calls onClose,
 *   which lets the parent unmount the modal by toggling isOpen back to false.
 */

// Marks this as a client component so it can respond to user interactions like button clicks.
'use client'

// Imports the full masterprompt builder form that is displayed inside the modal.
import MasterpromptBuilder from './MasterpromptBuilder'

/*
 * MasterpromptModalProps is a TypeScript interface that defines the shape of the props
 * object accepted by the MasterpromptModal component. It requires exactly two fields:
 *   - isOpen: a boolean that controls whether the modal is visible
 *   - onClose: a void callback that the parent calls to dismiss the modal
 */
// TypeScript interface that describes the two props this component requires.
interface MasterpromptModalProps {
  isOpen: boolean // Controls whether the modal is currently visible.
  onClose: () => void // Callback function that the parent calls to close the modal.
}

/*
 * MasterpromptModal is a function that takes 1 parameter
 *   ({ isOpen, onClose }: MasterpromptModalProps)
 * and returns JSX (a React element) or null.
 *
 * When isOpen is false the function returns null immediately, which removes the
 * entire modal from the DOM. When isOpen is true it renders a fixed full-screen
 * overlay with a clickable backdrop and a scrollable white panel containing
 * MasterpromptBuilder. A close button in the top-right corner and a click on the
 * backdrop both invoke the onClose callback.
 */
// A full-screen overlay modal that wraps the MasterpromptBuilder form.
// Used when the teacher wants to create a new chat session from the sidebar.
export default function MasterpromptModal({ isOpen, onClose }: MasterpromptModalProps) {
  // Returns nothing if the modal is closed — this removes it from the DOM entirely.
  if (!isOpen) return null

  return (
    // Fixed positioning covers the entire screen; z-50 ensures the modal sits above all other content.
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Semi-transparent black backdrop — clicking it closes the modal without needing the X button. */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* The white modal panel — scrollable if the form is taller than 90% of the viewport. */}
      <div className="relative z-10 bg-white dark:bg-[#2d2d30] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Close button in the top-right corner for users who prefer clicking X over the backdrop. */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-[var(--bg-panel)] transition-colors z-10"
          aria-label="Luk" // Accessible label for screen readers.
        >
          {/* SVG "×" icon drawn as two crossing lines. */}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Renders the masterprompt builder form inside the modal. */}
        <MasterpromptBuilder />
      </div>
    </div>
  )
}

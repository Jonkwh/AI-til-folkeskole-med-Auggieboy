// Imports React hooks: useEffect runs code after the component mounts; useState stores the current dark mode value.
import { useEffect, useState } from 'react'

// Custom hook that manages dark mode state and persists the user's preference across page reloads.
export function useDarkMode() {
  // Tracks whether dark mode is currently active. Starts as false (light mode) until localStorage is read.
  const [isDark, setIsDark] = useState(false)

  // Runs once when the component using this hook first mounts.
  // Reads the saved theme from localStorage and applies it immediately.
  useEffect(() => {
    const saved = localStorage.getItem('theme') // Retrieves the user's previously saved theme preference.
    const dark = saved === 'dark' // Converts the stored string into a boolean.
    setIsDark(dark) // Syncs the React state with the saved preference.
    document.documentElement.classList.toggle('dark', dark) // Adds or removes the 'dark' CSS class on the <html> element, which Tailwind uses to switch themes.
  }, [])

  // Toggles dark mode on or off and saves the new choice to localStorage so it survives a page refresh.
  function toggleDark() {
    setIsDark((prev) => {
      const next = !prev // Flips the current value.
      document.documentElement.classList.toggle('dark', next) // Immediately applies the new theme to the page.
      localStorage.setItem('theme', next ? 'dark' : 'light') // Persists the user's choice so it is restored on the next visit.
      return next // Returns the new value to update the React state.
    })
  }

  // Exposes the current dark mode state and the toggle function to whichever component uses this hook.
  return { isDark, toggleDark }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE: hooks/useDarkMode.ts
// PURPOSE: A custom React hook that manages the application's dark/light colour
//          theme. It reads the user's saved preference from the browser's
//          localStorage on first load, applies it to the page immediately, and
//          provides a toggle function that components can call when the user
//          clicks the theme button. The preference is saved back to localStorage
//          so it persists across page refreshes and browser sessions.
// USED BY: components/Sidebar.tsx (the dark mode toggle button in the footer).
// ─────────────────────────────────────────────────────────────────────────────

// Imports two React hooks:
//   - 'useEffect' is a function that runs code after a component renders (a "side effect").
//     Here it is used to read localStorage once the component has mounted in the browser.
//   - 'useState' is a function that creates a piece of reactive state — when the state
//     value changes, React automatically re-renders any component using this hook.
import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 'useDarkMode' is an exported custom React hook function.
// It takes no parameters and returns an object containing two properties:
//   - 'isDark' (boolean): whether dark mode is currently active
//   - 'toggleDark' (function): a function to switch between dark and light mode
// Naming a function with 'use' at the start is a React convention that signals
// it is a hook — it must be called inside a React component, not in regular code.
// ─────────────────────────────────────────────────────────────────────────────
export function useDarkMode() {

  // 'isDark' is a boolean state variable — it is true when dark mode is active,
  // false when light mode is active. It starts as false (light mode) until the
  // useEffect below reads the real value from localStorage.
  // 'setIsDark' is a function that updates 'isDark' and triggers a re-render.
  const [isDark, setIsDark] = useState(false)

  // This useEffect block runs exactly once after the component first mounts in the browser.
  // The empty array '[]' as the second argument means "only run this on first mount, never again."
  // It reads the saved theme from localStorage and applies it to the page.
  useEffect(() => {
    // 'saved' is a string variable (or null) — it holds the value stored under the 'theme'
    // key in localStorage. It will be 'dark', 'light', or null if no preference was saved.
    const saved = localStorage.getItem('theme')

    // 'dark' is a boolean variable — it converts the saved string into true/false.
    // It is true only if 'saved' is exactly the string 'dark'.
    const dark = saved === 'dark'

    setIsDark(dark) // Updates the React state to match the saved preference.

    // 'classList.toggle' is a browser function that adds a CSS class if the second argument
    // is true, or removes it if false. The 'dark' class on the <html> element is what
    // Tailwind CSS uses to apply dark mode styles across the entire page.
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // 'toggleDark' is a function that takes no parameters and has no return value.
  // It flips the current dark mode state, applies the new theme to the page
  // immediately, and saves the choice to localStorage for the next visit.
  // Algorithm:
  //   1. Read the current boolean value of 'isDark' (called 'prev' here)
  //   2. Flip it to the opposite value (stored as 'next')
  //   3. Apply the new class to <html>
  //   4. Save the string 'dark' or 'light' to localStorage
  //   5. Return 'next' so React updates the 'isDark' state variable
  // ─────────────────────────────────────────────────────────────────────────
  function toggleDark() {
    // 'setIsDark' is called here with an updater function instead of a direct value.
    // This pattern ensures 'prev' always reflects the most recent state, even if
    // multiple updates happen in quick succession.
    setIsDark((prev) => {
      // 'next' is a boolean variable — the opposite of 'prev'.
      // If dark mode was on (true), 'next' is false (turn it off), and vice versa.
      const next = !prev

      document.documentElement.classList.toggle('dark', next) // Adds or removes the 'dark' CSS class on <html> immediately.

      // Writes the string 'dark' or 'light' to localStorage under the key 'theme'.
      // The ternary operator (condition ? valueIfTrue : valueIfFalse) selects the right string.
      localStorage.setItem('theme', next ? 'dark' : 'light')

      return next // Returns the new boolean value so React stores it as the new 'isDark'.
    })
  }

  // Returns an object with two properties so the component using this hook can
  // both read the current state ('isDark') and trigger changes ('toggleDark').
  return { isDark, toggleDark }
}

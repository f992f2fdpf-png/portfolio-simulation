import React from 'react'

export default function DarkModeToggle({
  theme,
  setTheme
}: {
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void
}) {
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      className="smallButton"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Light Mode' : 'Dark Mode'}
      title={isDark ? 'Light Mode' : 'Dark Mode'}
    >
      {isDark ? 'Light' : 'Dark'}
    </button>
  )
}


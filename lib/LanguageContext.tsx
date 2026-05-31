'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { translations, VALUE_TRANSLATIONS, type Language } from './translations'

interface LanguageContextValue {
  lang: Language
  toggleLanguage: () => void
  t: (key: string) => string
  tValue: (text: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'da',
  toggleLanguage: () => {},
  t: (key) => key,
  tValue: (text) => text,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>('da')

  useEffect(() => {
    const saved = localStorage.getItem('language') as Language | null
    if (saved === 'en') setLang('en')
  }, [])

  const toggleLanguage = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'da' ? 'en' : 'da'
      localStorage.setItem('language', next)
      return next
    })
  }, [])

  const t = useCallback(
    (key: string): string => {
      const entry = translations[key]
      if (!entry) return key
      return entry[lang]
    },
    [lang],
  )

  const tValue = useCallback(
    (text: string): string => {
      const entry = VALUE_TRANSLATIONS[text]
      if (!entry) return text
      return entry[lang]
    },
    [lang],
  )

  return (
    <LanguageContext.Provider value={{ lang, toggleLanguage, t, tValue }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

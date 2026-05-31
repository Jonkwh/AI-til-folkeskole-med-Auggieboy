// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/login/page.tsx
// PURPOSE: The login page served at the URL "/login". It is a thin wrapper that
//          simply renders the LoginForm component, keeping page routing separate
//          from the actual form logic. All the email/password handling lives in
//          components/LoginForm.tsx — this file just puts it on the page.
// ─────────────────────────────────────────────────────────────────────────────

// Imports the LoginForm component — a React component that renders the full
// email/password login and sign-up form with error handling and navigation.
import LoginForm from '@/components/LoginForm'

// 'dynamic' is an exported string constant set to 'force-dynamic'.
// This instructs Next.js to always render this page on the server at request time
// instead of generating it once at build time (static caching).
// This is required because auth state is different for every visitor and cannot
// be pre-rendered — if cached, a logged-in user might see a stale login page.
export const dynamic = 'force-dynamic'

// 'LoginPage' is an exported function (a Next.js page component).
// It takes no parameters and returns a single JSX element: the LoginForm component.
// Next.js uses this as the page rendered at the "/login" URL route.
export default function LoginPage() {
  return <LoginForm /> // Renders the full login/sign-up form component. No additional layout is needed here.
}

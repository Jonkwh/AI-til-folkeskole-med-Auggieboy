// Imports the LoginForm component that renders the email/password login and sign-up UI.
import LoginForm from '@/components/LoginForm'

// Forces Next.js to render this page fresh on every request, bypassing any static caching.
// Required here because auth state can change between visits and the page must always reflect it.
export const dynamic = 'force-dynamic'

// The login page — renders nothing except the login form component.
export default function LoginPage() {
  return <LoginForm />
}

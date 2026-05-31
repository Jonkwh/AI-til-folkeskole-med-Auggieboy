export type Language = 'da' | 'en'

export const translations: Record<string, Record<Language, string>> = {
  // ── LoginForm ──────────────────────────────────────────────────────────
  'login.title': { da: 'ThinkBot', en: 'ThinkBot' },
  'login.subtitle': { da: 'AI til kritisk tænkning', en: 'AI for critical thinking' },
  'login.heading.login': { da: 'Log ind', en: 'Log in' },
  'login.heading.signup': { da: 'Opret en konto', en: 'Create an account' },
  'login.email': { da: 'Email', en: 'Email' },
  'login.email.placeholder': { da: 'dig@skole.dk', en: 'you@school.dk' },
  'login.password': { da: 'Adgangskode', en: 'Password' },
  'login.password.placeholder': { da: 'Min. 6 tegn', en: 'Min. 6 characters' },
  'login.confirmPassword': { da: 'Gentag adgangskode', en: 'Confirm password' },
  'login.confirmPassword.placeholder': { da: 'Gentag din adgangskode', en: 'Repeat your password' },
  'login.passwordMatch': { da: 'Adgangskoderne matcher', en: 'Passwords match' },
  'login.passwordMismatch': { da: 'Adgangskoderne stemmer ikke overens', en: 'Passwords do not match' },
  'login.loading': { da: 'Vent venligst...', en: 'Please wait...' },
  'login.submit.login': { da: 'Log ind', en: 'Log in' },
  'login.submit.signup': { da: 'Opret konto', en: 'Create account' },
  'login.toggle.toSignup': { da: 'Har du ikke en konto? Opret en', en: "Don't have an account? Create one" },
  'login.toggle.toLogin': { da: 'Har du allerede en konto? Log ind', en: 'Already have an account? Log in' },
  'login.error.mismatch': { da: 'Adgangskoderne stemmer ikke overens', en: 'Passwords do not match' },
  'login.error.generic': { da: 'Der opstod en fejl', en: 'An error occurred' },

  // ── Sidebar ────────────────────────────────────────────────────────────
  'sidebar.brand': { da: 'ThinkBot', en: 'ThinkBot' },
  'sidebar.newChat': { da: '+ Ny chat', en: '+ New chat' },
  'sidebar.noChats': { da: 'Ingen chats endnu', en: 'No chats yet' },
  'sidebar.deleteConfirm': { da: 'Slet denne chat?', en: 'Delete this chat?' },
  'sidebar.deleteYes': { da: 'Ja', en: 'Yes' },
  'sidebar.deleteNo': { da: 'Nej', en: 'No' },
  'sidebar.rename': { da: 'Omdøb', en: 'Rename' },
  'sidebar.delete': { da: 'Slet', en: 'Delete' },
  'sidebar.logout': { da: 'Log ud', en: 'Log out' },
  'sidebar.themeToggle': { da: 'Skift farvetema', en: 'Toggle color theme' },
  'sidebar.today': { da: 'I dag', en: 'Today' },
  'sidebar.yesterday': { da: 'I går', en: 'Yesterday' },
  'sidebar.daysAgo': { da: 'dage siden', en: 'days ago' },

  // ── MasterpromptBuilder ────────────────────────────────────────────────
  'builder.title': { da: 'Byg din masterprompt', en: 'Build your masterprompt' },
  'builder.subtitle': { da: 'Konfigurer hvordan ThinkBot skal opføre sig i denne chatsession.', en: 'Configure how ThinkBot should behave in this chat session.' },
  'builder.preview': { da: 'Forhåndsvisning', en: 'Preview' },
  'builder.tokens': { da: 'tokens', en: 'tokens' },
  'builder.startChat': { da: 'Start chat →', en: 'Start chat →' },
  'builder.creating': { da: 'Opretter session...', en: 'Creating session...' },
  'builder.block.aiShall': { da: "AI'EN SKAL", en: 'THE AI SHOULD' },
  'builder.block.context': { da: 'KONTEKST', en: 'CONTEXT' },
  'builder.block.restriction': { da: 'BEGRÆNSNING', en: 'RESTRICTION' },
  'builder.prefix.aiShall': { da: "AI'en skal ", en: 'The AI should ' },
  'builder.prefix.context': { da: 'for elever i ', en: 'for students in ' },
  'builder.suffix.context': { da: ' i en dansk skole', en: ' in a Danish school' },
  'builder.connector.in': { da: 'i', en: 'in' },

  // ── MasterpromptCard ───────────────────────────────────────────────────
  'card.show': { da: '▾ Vis masterprompt', en: '▾ Show masterprompt' },
  'card.hide': { da: '▲ Skjul masterprompt', en: '▲ Hide masterprompt' },
  'card.prefix.new': { da: "AI'en skal ", en: 'The AI should ' },
  'card.prefix.legacy': { da: 'Du er en ', en: 'You are a ' },
  'card.connector.for': { da: ' for elever i ', en: ' for students in ' },
  'card.connector.in': { da: ' i ', en: ' in ' },
  'card.connector.school': { da: ' i en dansk skole', en: ' in a Danish school' },
  'card.connector.never': { da: '. Aldrig ', en: '. Never ' },

  // ── ChatInterface ──────────────────────────────────────────────────────
  'chat.brand': { da: 'ThinkBot', en: 'ThinkBot' },
  'chat.send': { da: 'Send', en: 'Send' },
  'chat.placeholder.default': { da: 'Skriv din besked...', en: 'Write your message...' },
  'chat.placeholder.onboarding1': { da: 'Eller beskriv hvad du arbejder med...', en: 'Or describe what you are working on...' },
  'chat.placeholder.onboarding2': { da: 'Eller skriv dit eget svar...', en: 'Or write your own answer...' },
  'chat.placeholder.reengagement': { da: 'Vælg en mulighed ovenfor...', en: 'Choose an option above...' },
  'chat.rateLimit': { da: 'Vent et øjeblik, før du sender din næste besked 🙂', en: 'Wait a moment before sending your next message 🙂' },
  'chat.assignmentBlocked': { da: 'ThinkBot skriver ikke opgaver, men hjælper dig gerne med at komme i gang 🙂 Prøv at fortælle, hvad du er gået i stå med.', en: "ThinkBot doesn't write assignments, but is happy to help you get started 🙂 Try telling what you're stuck on." },
  'chat.error.overloaded': { da: 'ThinkBot er lidt overbelastet lige nu. Vent et øjeblik og prøv igen 🙂', en: 'ThinkBot is a bit overloaded right now. Wait a moment and try again 🙂' },
  'chat.error.generic': { da: 'Noget gik galt. Prøv at sende din besked igen.', en: 'Something went wrong. Try sending your message again.' },
  'chat.error.connection': { da: 'Det ser ud til, at forbindelsen blev afbrudt. Tjek din internetforbindelse og prøv igen.', en: 'It looks like the connection was lost. Check your internet connection and try again.' },
  'chat.onboarding.loading': { da: 'Henter spørgsmål...', en: 'Loading questions...' },
  'chat.onboarding.writeOwn': { da: 'Skriv noget selv', en: 'Write something yourself' },
  'chat.onboarding.helper': { da: 'Vælg en mulighed, eller skriv dit eget svar nedenfor', en: 'Choose an option, or write your own answer below' },
  'chat.reengagement.message': { da: 'Det ser ud til at vi er gået lidt i stå - det sker! Hvad ville hjælpe dig mest lige nu?', en: "It looks like we're a bit stuck - it happens! What would help you most right now?" },

  // ── ShareButton ────────────────────────────────────────────────────────
  'share.button': { da: 'Del med lærer', en: 'Share with teacher' },
  'share.title': { da: 'Del samtale med lærer', en: 'Share conversation with teacher' },
  'share.description': { da: 'Forhåndsvisning af det der sendes til din lærer.', en: 'Preview of what will be sent to your teacher.' },
  'share.generating': { da: 'Genererer rapport…', en: 'Generating report…' },
  'share.error': { da: 'Kunne ikke generere rapport. Prøv igen.', en: 'Could not generate report. Try again.' },
  'share.sendError': { da: 'Kunne ikke sende email. Prøv igen.', en: 'Could not send email. Try again.' },
  'share.sent': { da: 'Email sendt til din lærer!', en: 'Email sent to your teacher!' },
  'share.cancel': { da: 'Annuller', en: 'Cancel' },
  'share.sendButton': { da: 'Send til lærer', en: 'Send to teacher' },
  'share.sending': { da: 'Sender…', en: 'Sending…' },

  // ── MasterpromptModal ──────────────────────────────────────────────────
  'modal.close': { da: 'Luk', en: 'Close' },

  // ── Rapport page ───────────────────────────────────────────────────────
  'rapport.loginTitle': { da: 'Lærerrapport', en: 'Teacher report' },
  'rapport.loginDescription': { da: 'Indtast adgangskoden for at se klassens rapport.', en: "Enter the password to view the class report." },
  'rapport.password.placeholder': { da: 'Adgangskode', en: 'Password' },
  'rapport.password.wrong': { da: 'Forkert adgangskode.', en: 'Wrong password.' },
  'rapport.password.submit': { da: 'Log ind', en: 'Log in' },
  'rapport.title': { da: 'Klasserapport', en: 'Class report' },
  'rapport.from': { da: 'Fra', en: 'From' },
  'rapport.to': { da: 'Til', en: 'To' },
  'rapport.generate': { da: 'Generer rapport', en: 'Generate report' },
  'rapport.generating': { da: 'Genererer…', en: 'Generating…' },
  'rapport.analyzing': { da: 'Analyserer samtaler…', en: 'Analyzing conversations…' },
  'rapport.error': { da: 'Kunne ikke generere rapport. Prøv igen.', en: 'Could not generate report. Try again.' },
  'rapport.noSessions': { da: 'Ingen samtaler fundet i den valgte periode.', en: 'No conversations found in the selected period.' },
  'rapport.truncated': { da: 'Bemærk: Rapporten er baseret på de 15 nyeste samtaler i perioden.', en: 'Note: The report is based on the 15 most recent conversations in the period.' },
  'rapport.sessionsFound': { da: 'samtaler fundet i perioden', en: 'conversations found in the period' },
  'rapport.generatedAt': { da: 'Rapport genereret:', en: 'Report generated:' },
  'rapport.section.understood': { da: 'Forstået godt', en: 'Well understood' },
  'rapport.section.confusion': { da: 'Forvirring og udfordringer', en: 'Confusion and challenges' },
  'rapport.section.nextSteps': { da: 'Kan arbejdes videre med', en: 'Areas for further work' },

  // ── Language toggle ────────────────────────────────────────────────────
  'lang.toggle': { da: 'EN', en: 'DA' },
}

export const VALUE_TRANSLATIONS: Record<string, Record<Language, string>> = {
  // ── Roles (dropdown values) ────────────────────────────────────────────
  'hjælpe med at forstå opgaven': { da: 'hjælpe med at forstå opgaven', en: 'help understand the assignment' },
  'teste ideer': { da: 'teste ideer', en: 'test ideas' },
  'komme med ideer': { da: 'komme med ideer', en: 'come up with ideas' },
  'give feedback på min tekst': { da: 'give feedback på min tekst', en: 'give feedback on my text' },
  'hjælpe med at læse op til eksamen': { da: 'hjælpe med at læse op til eksamen', en: 'help study for exams' },
  'hjælpe med datavisualisering': { da: 'hjælpe med datavisualisering', en: 'help with data visualization' },

  // ── Grades ─────────────────────────────────────────────────────────────
  '7. klasse': { da: '7. klasse', en: '7th grade' },
  '8. klasse': { da: '8. klasse', en: '8th grade' },
  '9. klasse': { da: '9. klasse', en: '9th grade' },

  // ── Subjects ───────────────────────────────────────────────────────────
  'Dansk': { da: 'Dansk', en: 'Danish' },
  'Engelsk': { da: 'Engelsk', en: 'English' },
  'Matematik': { da: 'Matematik', en: 'Mathematics' },
  'Historie': { da: 'Historie', en: 'History' },
  'Samfundsfag': { da: 'Samfundsfag', en: 'Social studies' },
  'Fysik/kemi': { da: 'Fysik/kemi', en: 'Physics/Chemistry' },
  'Biologi': { da: 'Biologi', en: 'Biology' },
  'Geografi': { da: 'Geografi', en: 'Geography' },
  'Kristendomskundskab': { da: 'Kristendomskundskab', en: 'Religious studies' },
  'Tysk': { da: 'Tysk', en: 'German' },
  'Fransk': { da: 'Fransk', en: 'French' },
  'Alle fag': { da: 'Alle fag', en: 'All subjects' },

  // ── Restriction labels ─────────────────────────────────────────────────
  'Brug kun eksempler fra den tekst eller det emne, eleven arbejder med': {
    da: 'Brug kun eksempler fra den tekst eller det emne, eleven arbejder med',
    en: 'Only use examples from the text or topic the student is working with',
  },
  'Svar kun på dansk. Skift ikke til et andet sprog, selvom eleven gør det': {
    da: 'Svar kun på dansk. Skift ikke til et andet sprog, selvom eleven gør det',
    en: 'Only respond in Danish. Do not switch language even if the student does',
  },
  'Giv ikke eksempler fra andre forfattere, film eller tekster end dem eleven selv nævner': {
    da: 'Giv ikke eksempler fra andre forfattere, film eller tekster end dem eleven selv nævner',
    en: 'Do not give examples from authors, films, or texts the student has not mentioned',
  },
  'Brug aldrig fagtermer uden at forklare dem først': {
    da: 'Brug aldrig fagtermer uden at forklare dem først',
    en: 'Never use technical terms without explaining them first',
  },
  'Hold dig til det emne eller den tekst, eleven nævner i starten, og gå ikke videre til andre emner': {
    da: 'Hold dig til det emne eller den tekst, eleven nævner i starten, og gå ikke videre til andre emner',
    en: 'Stick to the topic or text the student mentions at the start, and do not move on to other topics',
  },

  // ── Re-engagement options ──────────────────────────────────────────────
  'Giv mig et hint': { da: 'Giv mig et hint', en: 'Give me a hint' },
  'Prøv et nyt spørgsmål': { da: 'Prøv et nyt spørgsmål', en: 'Try a new question' },
  'Forklar konceptet': { da: 'Forklar konceptet', en: 'Explain the concept' },
  'Start forfra': { da: 'Start forfra', en: 'Start over' },

  // ── Onboarding fallback options ────────────────────────────────────────
  'Hvad arbejder du med i dag?': { da: 'Hvad arbejder du med i dag?', en: 'What are you working on today?' },
  'Jeg er lige startet': { da: 'Jeg er lige startet', en: "I've just started" },
  'Jeg er i gang, men sidder fast': { da: 'Jeg er i gang, men sidder fast', en: "I'm working on it, but I'm stuck" },
  'Jeg har et udkast': { da: 'Jeg har et udkast', en: 'I have a draft' },
  'Hvad ville hjælpe dig mest?': { da: 'Hvad ville hjælpe dig mest?', en: 'What would help you the most?' },
  'Forstå opgaven': { da: 'Forstå opgaven', en: 'Understand the assignment' },
  'Komme i gang': { da: 'Komme i gang', en: 'Get started' },
  'Tjekke mit arbejde': { da: 'Tjekke mit arbejde', en: 'Check my work' },

  // ── Dynamic step 2 fallback options ────────────────────────────────────
  'Forstå opgaven bedre': { da: 'Forstå opgaven bedre', en: 'Better understand the assignment' },
  'Komme i gang med at skrive': { da: 'Komme i gang med at skrive', en: 'Get started writing' },
  'Få et konkret eksempel': { da: 'Få et konkret eksempel', en: 'Get a concrete example' },
}

## Packages
framer-motion | For smooth page transitions and UI animations
clsx | For conditional class merging
tailwind-merge | For merging tailwind classes
lucide-react | For beautiful icons (already in base but ensuring version match)
date-fns | For formatting dates

## Notes
Tailwind Config - extend fontFamily:
fontFamily: {
  display: ["'Outfit', sans-serif"],
  body: ["'DM Sans', sans-serif"],
  mono: ["'Fira Code', monospace"],
}
Tailwind Config - extend colors:
colors: {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  primary: {
    DEFAULT: "hsl(var(--primary))",
    foreground: "hsl(var(--primary-foreground))",
  },
  card: {
    DEFAULT: "hsl(var(--card))",
    foreground: "hsl(var(--card-foreground))",
  },
  accent: {
    DEFAULT: "hsl(var(--accent))",
    foreground: "hsl(var(--accent-foreground))",
  }
}
Authentication is handled via useAuth hook.
Landing page for unauthenticated users.
Dashboard for authenticated users.

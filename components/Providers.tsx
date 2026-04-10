// Providers is kept for any future client-side context wrapping.
// Clerk wrapping is done in layout.tsx via ClerkProvider (server component).
export default function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}


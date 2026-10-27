import { Link } from "wouter";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

// Narrow centred layout for one-task pages reached from email links.
export function AuthShell({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-6 sm:px-8">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label="Nexora home">
          <Brand />
        </Link>
        <ThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && <p className="mt-2 text-muted-foreground">{description}</p>}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

export function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get("token") || "";
}

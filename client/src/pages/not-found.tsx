import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start px-4 py-20 sm:px-6">
      <p className="text-sm font-semibold text-primary">Page not found</p>
      <h1 className="cue-card mt-3 text-4xl sm:text-5xl">"Can you tell me where this page went?"</h1>
      <p className="mt-4 text-muted-foreground">
        We couldn't find it either. The link may be out of date, or the page has moved.
      </p>
      <Button asChild className="mt-8">
        <Link href="/dashboard">Go to overview</Link>
      </Button>
    </div>
  );
}

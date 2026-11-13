import { Link } from "react-router";
import { EmptyState } from "@/components/ui";

export function NotFound() {
  return (
    <EmptyState title="Page not found">
      <Link className="text-accent hover:underline" to="/">
        Back to start
      </Link>
    </EmptyState>
  );
}

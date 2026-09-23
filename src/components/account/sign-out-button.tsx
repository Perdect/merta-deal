import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

/** Server-rendered sign-out form (posts to the `signOutAction` server action). */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction} className={className}>
      <Button type="submit" variant="outline" fullWidth><LogOut className="h-4 w-4" /> Sign out</Button>
    </form>
  );
}

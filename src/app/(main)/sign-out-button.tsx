"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";

export function SignOutButton() {
  const { signOut } = useAuthActions();

  return (
    <Button variant="outline" onClick={() => signOut()} title="Sign out">
      <LogOut />
    </Button>
  );
}

"use client";

import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ProGateProps {
  feature: string;
}

export function ProGate({ feature }: ProGateProps) {
  const router = useRouter();
  const pathname = usePathname();

  const goToAuth = useCallback(
    (path: string) => {
      sessionStorage.setItem("authReturnTo", pathname);
      router.push(path);
    },
    [router, pathname]
  );

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-6 text-center">
        <h3 className="text-lg font-semibold">Unlock {feature}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a free account to access personalized candidate research,
          alignment scoring, and shareable voter guides.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => goToAuth("/auth/signup")}>
            Sign Up Free
          </Button>
          <Button
            variant="outline"
            onClick={() => goToAuth("/auth/login")}
          >
            Sign In
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export const instant = false;

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense fallback={null}>
        <SignIn fallbackRedirectUrl="/workspace" />
      </Suspense>
    </div>
  );
}
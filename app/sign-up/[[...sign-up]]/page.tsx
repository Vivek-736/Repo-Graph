import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export const instant = false;

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense fallback={null}>
        <SignUp fallbackRedirectUrl="/workspace" />
      </Suspense>
    </div>
  );
}
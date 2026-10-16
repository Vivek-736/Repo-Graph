import { OrganizationSwitcher, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="relative bg-white text-black min-h-screen flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Suspense fallback={<div className="h-8" />}>
          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <SignInButton />
              <SignUpButton />
            </Show>
            <Show when="signed-in">
              <OrganizationSwitcher />
              <UserButton />
            </Show>
          </div>
        </Suspense>
      </div>
      <h1 className="text-4xl font-bold text-center">Repo-Graph</h1>
      <p className="text-2xl mt-5 text-center">Visualize your code like never before</p>
      <div className="mt-10">
        <input type="text" placeholder="Enter repository URL" className="w-64 p-2 border border-gray-300 rounded-lg" />
        <button className="ml-2 p-2 bg-blue-500 text-white rounded-lg">Visualize</button>
      </div>
    </main>
  );
}
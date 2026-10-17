import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function AuthRedirect() {
  const { userId } = await auth();

  if (userId) {
    redirect("/workspace");
  }

  return null;
}
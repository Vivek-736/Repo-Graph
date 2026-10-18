import { redirect } from "next/navigation";

export const instant = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SingularAnalysisRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/analyses/${id}`);
}
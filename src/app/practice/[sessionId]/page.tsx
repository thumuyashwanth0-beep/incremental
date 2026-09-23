import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PracticeRunner } from "@/components/PracticeRunner";

export default async function PracticeSessionPage({ params }: PageProps<"/practice/[sessionId]">) {
  if (!(await getCurrentUser())) redirect("/login");
  const { sessionId } = await params;
  return <PracticeRunner sessionId={sessionId} />;
}

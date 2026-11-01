"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/server-auth";
import { deleteSession, saveSession } from "@/lib/session-store";

export async function saveSessionAction(formData: FormData): Promise<void> {
  await requireAuth();

  const raw = String(formData.get("cookies") ?? "").trim();
  if (!raw) {
    redirect(
      `/dashboard/session?error=${encodeURIComponent("Paste your cookies JSON first.")}`,
    );
  }

  try {
    await saveSession(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save the session.";
    redirect(`/dashboard/session?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard/session");
  redirect("/dashboard/session?saved=1");
}

export async function deleteSessionAction(): Promise<void> {
  await requireAuth();

  await deleteSession();
  revalidatePath("/dashboard/session");
  redirect("/dashboard/session?deleted=1");
}

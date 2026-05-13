import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PopUpCitiesIndexRedirect({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const params = new URLSearchParams({ lane: "cities" });
  if (searchParams.view) params.set("view", searchParams.view);
  redirect(`/intel?${params.toString()}`);
}

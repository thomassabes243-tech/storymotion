import { Studio } from "../components/Studio";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const page =
    view === "new" || view === "assets" || view === "settings"
      ? view
      : "projects";
  return <Studio initialPage={page} />;
}

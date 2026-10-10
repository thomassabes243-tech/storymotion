import { Studio } from "../../../components/Studio";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Studio
      initialId={(await params).id}
      initialTab={
        (await searchParams).tab === "director" ? "director" : "storyboard"
      }
    />
  );
}

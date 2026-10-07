import { Studio } from "../../../components/Studio";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Studio initialId={(await params).id} />;
}

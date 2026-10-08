import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoDeliveryManager } from "../../../lib/delivery/VideoDelivery";

export const dynamic = "force-dynamic";
export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const delivery = await new VideoDeliveryManager().get(id).catch(() => null);
  if (!delivery || delivery.state !== "READY") notFound();
  const seconds = Math.round(delivery.probe?.duration || delivery.duration);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <main style={{ maxWidth: 620, margin: "0 auto", padding: "24px 16px" }}>
      <div className="eyebrow">STORYMOTION · VIDEO TERMINADO</div>
      <h1>{delivery.title}</h1>
      <p>
        {duration} · 1080 × 1920 ·{" "}
        {delivery.audioStreams ? "Con narración" : "Sin audio"}
      </p>
      <video
        controls
        playsInline
        preload="metadata"
        src={`/api/deliveries/${id}/video`}
        style={{
          width: "100%",
          maxHeight: "72svh",
          display: "block",
          background: "#000",
          borderRadius: 12,
        }}
      />
      <p>
        <a
          className="primary"
          href={`/api/deliveries/${id}/video?download=1`}
          style={{ display: "inline-flex" }}
        >
          Descargar MP4
        </a>
      </p>
      <p>
        <Link href="/">Abrir StoryMotion</Link>
      </p>
    </main>
  );
}

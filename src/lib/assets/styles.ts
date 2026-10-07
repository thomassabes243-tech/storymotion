export interface VisualStyle {
  id: string;
  name: string;
  prompt: string;
  palette: string[];
  texture: string;
  negativePrompt: string;
}
export const visualStyles: Record<string, VisualStyle> = {
  historical_parchment: {
    id: "historical_parchment",
    name: "Historical Parchment",
    prompt:
      "Original historical narrative illustration, aged parchment, hand-painted ink outlines, soft shadows, layered 2.5D depth, cinematic composition, restrained motion-comic design",
    palette: ["#dcc599", "#a88e60", "#6d7253", "#423c32", "#872f2d"],
    texture: "aged_paper",
    negativePrompt:
      "text, watermark, modern clothes unless specified, inconsistent face or costume, photorealism, imitation of existing artwork",
  },
};

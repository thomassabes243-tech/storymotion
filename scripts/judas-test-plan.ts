import { ActionMotionStoryEngine } from "../src/lib/story/ActionMotionStoryEngine";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import type { Project, Scene, Layer } from "../src/lib/domain";
import { reflow, SceneSchema } from "../src/lib/domain";
import { AssetManager } from "../src/lib/assets/AssetManager";
import { biblicalBackdrop } from "../src/lib/illustration/BiblicalIllustrationFactory";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
export const JUDAS_TITLE =
  "¿Qué pasaría si supieras que tu amigo te va a traicionar?";
export const judasBeats = [
  JUDAS_TITLE,
  "Aquella noche, Jesús compartía el pan con sus discípulos. Las lámparas iluminaban una despedida.",
  "Judas estaba allí, a su lado. Jesús lo miró con tristeza, sin dejar de amarlo.",
  "Uno de ustedes me entregará, dijo. El silencio pesó más que cualquier respuesta.",
  "Judas bajó la mirada. En su corazón, la decisión ya estaba tomada.",
  "Treinta monedas de plata cambiaron de manos. Un precio pequeño para una traición inmensa.",
  "Después, Judas salió a la oscuridad. Jesús fue al huerto, y allí esperó.",
  "Entre los olivos aparecieron antorchas y guardias. Judas se acercó, llamándolo maestro.",
  "Entonces lo besó. El gesto que debía expresar cariño se convirtió en una señal.",
  "Los guardias sujetaron a Jesús. Él no respondió con odio; aceptó aquel dolor en silencio.",
  "La traición había llegado desde una mano conocida. Y aun así, el amor permaneció.",
  "Si supieras que tu amigo te va a traicionar, ¿elegirías vengarte, o conservar tu paz?",
];
type Spec = NonNullable<Scene["illustration"]>;
const shots: [Spec["framing"], Spec["setting"], string, string, string[]][] = [
  [
    "wide",
    "supper",
    "",
    "La cena iluminada por lámparas; Jesús y Judas ante el mismo pan.",
    ["jesus", "judas", "disciples"],
  ],
  [
    "pair",
    "supper",
    "",
    "Mirada entre los dos amigos, acercamiento suave.",
    ["jesus", "judas"],
  ],
  [
    "hands",
    "supper",
    "jesus",
    "Detalle de las manos de Jesús compartiendo el pan.",
    ["jesus"],
  ],
  [
    "wide",
    "supper",
    "",
    "La mesa, el cáliz y los discípulos bajo la luz cálida.",
    ["jesus", "judas", "disciples"],
  ],
  [
    "face",
    "supper",
    "jesus",
    "Primer plano de Jesús: tristeza y serenidad.",
    ["jesus"],
  ],
  [
    "face",
    "supper",
    "judas",
    "Contraplano de Judas: tensión bajo la misma luz.",
    ["judas"],
  ],
  [
    "pair",
    "supper",
    "",
    "Jesús anuncia la traición sin apartar la mirada.",
    ["jesus", "judas"],
  ],
  [
    "shadows",
    "supper",
    "",
    "Las sombras y el silencio de los discípulos.",
    ["disciples"],
  ],
  [
    "face",
    "supper",
    "judas",
    "Judas baja la cabeza, con respiración y tela en movimiento.",
    ["judas"],
  ],
  [
    "hands",
    "supper",
    "judas",
    "Sus manos junto al pan: un vínculo a punto de romperse.",
    ["judas"],
  ],
  [
    "coins",
    "chamber",
    "judas",
    "Primer plano de monedas de plata pasando a la mano de Judas.",
    ["judas"],
  ],
  [
    "coins",
    "chamber",
    "judas",
    "Otro encuadre de las monedas y de la manga verde de Judas.",
    ["judas"],
  ],
  [
    "wide",
    "street",
    "judas",
    "Judas sale a la oscuridad entre muros y sombras.",
    ["judas"],
  ],
  [
    "wide",
    "garden",
    "jesus",
    "Jesús espera bajo los olivos, luz fría y antorchas cálidas.",
    ["jesus"],
  ],
  [
    "shadows",
    "garden",
    "",
    "Las sombras de los guardias avanzan entre los árboles.",
    ["guards"],
  ],
  [
    "pair",
    "garden",
    "",
    "Judas se acerca a Jesús en el mismo huerto.",
    ["jesus", "judas"],
  ],
  [
    "kiss",
    "garden",
    "",
    "Judas se inclina hacia Jesús; el beso se representa de forma ilustrada.",
    ["jesus", "judas"],
  ],
  [
    "face",
    "garden",
    "jesus",
    "Rostro de Jesús ante el gesto de la traición.",
    ["jesus"],
  ],
  [
    "arrest",
    "garden",
    "",
    "Los guardias levantan los brazos y rodean a Jesús.",
    ["jesus", "guards"],
  ],
  [
    "face",
    "garden",
    "jesus",
    "Jesús acepta el arresto sin responder con odio.",
    ["jesus"],
  ],
  [
    "face",
    "garden",
    "judas",
    "Judas queda frente a las consecuencias de su decisión.",
    ["judas"],
  ],
  [
    "wide",
    "garden",
    "",
    "Jesús y los guardias se alejan; permanecen los olivos.",
    ["jesus", "guards"],
  ],
  [
    "hands",
    "supper",
    "jesus",
    "Recuerdo visual de la mano que había ofrecido el pan.",
    ["jesus"],
  ],
  [
    "face",
    "garden",
    "jesus",
    "Última mirada serena que conecta con la pregunta del título.",
    ["jesus"],
  ],
];
export async function prepareJudasPlan(
  project: Project,
  repo: SQLiteRepository,
  storage: FileSystemStorage,
) {
  const p = structuredClone(project);
  p.config = {
    ...p.config,
    targetDuration: 69,
    fixedTitle: JUDAS_TITLE,
    motionBlur: "subtle",
  };
  const ids = ["jesus", "judas", "disciples", "guards"];
  p.analysis!.characters = p.analysis!.characters.filter((c) =>
    ids.includes(c.id),
  );
  if (p.analysis!.characters.length !== ids.length)
    throw Error("Faltan personajes bíblicos en el análisis local.");
  for (const c of p.analysis!.characters) {
    c.appearance.weapons = c.id === "guards" ? ["lanzas"] : [];
    c.appearance.age = c.id === "jesus" ? 33 : c.id === "judas" ? 34 : 36;
    c.appearance.hair =
      c.id === "jesus"
        ? "castaño largo, barba castaña"
        : c.id === "judas"
          ? "oscuro corto, barba oscura"
          : "oscuro";
    c.appearance.face =
      c.id === "jesus"
        ? "rostro alargado, mirada serena, barba castaña"
        : "rasgos mediterráneos, misma identidad entre planos";
    c.poses = [
      "look",
      "offering",
      "lower_gaze",
      "walking",
      "kiss",
      "reach",
      "arrested",
    ];
    c.appearance.artStyle = "ilustración vectorial bíblica, modo 2.5D local";
  }
  p.analysis!.locations = ["supper", "chamber", "street", "garden"].map(
    (id) => ({
      id,
      name: id,
      description:
        id === "garden"
          ? "huerto de olivos nocturno, luna y antorchas"
          : "Jerusalén antigua, piedra y lámparas cálidas",
      referenceAssetIds: [],
    }),
  );
  p.analysis!.objects = [
    "pan",
    "cáliz",
    "monedas de plata",
    "lámparas",
    "antorchas",
    "olivos",
  ];
  p.analysis!.relationships = [
    {
      from: "jesus",
      to: "judas",
      relationship: "maestro y discípulo; Judas traiciona a Jesús",
    },
  ];
  const manager = new AssetManager(repo, storage);
  p.scenes = [];
  for (const [
    i,
    [framing, setting, focusId, description, characters],
  ] of shots.entries()) {
    const poses: Record<string, string> = Object.fromEntries(
      characters.map((id) => [
        id,
        id === "judas" && i === 8
          ? "lower_gaze"
          : id === "judas" && i === 12
            ? "walking"
            : id === "jesus" && i === 2
              ? "offering"
              : i === 16
                ? "kiss"
                : i === 18 && id === "guards"
                  ? "reach"
                  : i === 21
                    ? "walking"
                    : "look",
      ]),
    );
    const layers: Layer[] = [];
    for (const depth of [0, 1, 2, 3]) {
      const svg = biblicalBackdrop(setting, i, depth);
      const asset = await manager.import(
        await sharp(Buffer.from(svg)).png().toBuffer(),
        `Toma ${i + 1}: ${setting} · capa ${depth + 1}`,
        depth === 0 ? "background" : depth === 3 ? "foreground" : "environment",
        "local",
        {
          locationId: setting,
          fingerprint: createHash("sha256").update(`${i}:${svg}`).digest("hex"),
        },
      );
      p.assets.push(asset);
      layers.push({
        id: randomUUID(),
        assetId: asset.id,
        kind: asset.kind,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        depth: [0.1, 0.28, 0.48, 0.85][depth],
        blur: 0,
        startFrame: 0,
        endFrame: 86,
        keyframes: [],
        poses: [],
      });
    }
    for (const id of characters)
      layers.push({
        id: randomUUID(),
        kind: "character",
        characterId: id,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        depth: 0.64,
        blur: 0,
        startFrame: 0,
        endFrame: 86,
        keyframes: [],
        poses: [],
      });
    p.scenes.push(
      SceneSchema.parse({
        sceneId: `judas_${String(i + 1).padStart(3, "0")}`,
        start: 0,
        duration: 69 / 24,
        durationFrames: 86,
        sourceText: judasBeats[Math.floor(i / 2)],
        description,
        location: setting,
        characters,
        action:
          i === 16
            ? "kiss"
            : i === 18
              ? "arrest"
              : i === 10 || i === 11
                ? "exchange_coins"
                : i === 2
                  ? "share_bread"
                  : i === 12
                    ? "depart"
                    : "observe",
        emotion: "sorrow",
        timeOfDay: "night",
        camera: {
          shot: "wide",
          movement: [
            "slow_zoom_in",
            "pan_right",
            "push_in",
            "pan_left",
            "slow_zoom_out",
          ][i % 5],
          intensity: 0.45,
          direction: "left_to_right",
        },
        layers,
        animation: [
          "parallax",
          "articulated_cutout",
          "eased_motion",
          "cloth_follow_through",
          "candle_flicker",
          "dust",
          "moving_shadows",
        ],
        transitionOut:
          i === 23 ? "crossfade" : i % 3 === 0 ? "match_pan" : "crossfade",
        status: "READY",
        intentionalStill: false,
        continuityNotes: [
          "Diseño ilustrado local; no video generativo.",
          "Identidad, vestuario y luz preservados por CharacterBible.",
        ],
        clipStart: 0,
        illustration: {
          profile: "biblical_cutout",
          framing,
          setting,
          focusId: focusId || undefined,
          variant: i,
          poses,
        },
      }),
    );
  }
  p.scenes = reflow(p.scenes, 30);
  p.warnings.push(
    "Storyboard dirigido para esta prueba: se corrigió y diseñó cada toma después del análisis por reglas.",
    "Beso y arresto son representaciones esquemáticas 2.5D, no actuación humana realista.",
  );
  return repo.save(new ActionMotionStoryEngine().enrich(p), project.revision);
}

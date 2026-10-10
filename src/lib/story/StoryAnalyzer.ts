import { AnalysisSchema, type Analysis, type Character } from "../domain";
export interface StoryAnalysisProvider {
  analyze(story: string, style: string): Promise<Analysis>;
}
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
export const slug = (s: string) =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
export const wordCount = (s: string) =>
  (s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}]+)*/gu) || []).length;
const archetypes: [RegExp, string, string, string, string][] = [
  [
    /\b(figura misteriosa|silueta|mysterious figure)\b/,
    "mysterious_figure",
    "Figura misteriosa",
    "secondary",
    "silueta oscura, vestimenta no definida",
  ],
  [
    /\b(comandante|capitan|general|commander|captain)\b/,
    "commander",
    "Comandante",
    "main",
    "capa roja, armadura de bronce",
  ],
  [
    /\b(arquer\w*|archer\w*)\b/,
    "archer",
    "Arquero",
    "secondary",
    "túnica oscura, cuero marrón",
  ],
  [
    /\b(ejercito|soldad\w*|army|soldiers?)\b/,
    "army",
    "Ejército",
    "group",
    "armadura de bronce, escudos ocres",
  ],
  [
    /\b(rey|reina|king|queen)\b/,
    "royal",
    "Soberano",
    "main",
    "manto azul, corona dorada",
  ],
  [
    /\b(caballer\w*|knight\w*)\b/,
    "knight",
    "Caballero",
    "main",
    "armadura plateada, capa azul",
  ],
  [
    /\b(dios\w*|angel\w*|god\w*)\b/,
    "divine",
    "Figura divina",
    "main",
    "túnica marfil, detalles dorados",
  ],
  [
    /\b(dragon\w*|monster\w*|monstru\w*)\b/,
    "creature",
    "Criatura",
    "secondary",
    "escamas oscuras",
  ],
  [/\b(nin[oa]\w*|child|boy|girl)\b/, "child", "Niño", "main", "túnica verde"],
  [
    /\b(mujer|woman|viajer[oa]|traveler|hombre|man|detective|explorador\w*|explorer)\b/,
    "traveler",
    "Viajero",
    "main",
    "abrigo verde oscuro",
  ],
];
const placePatterns: [RegExp, string][] = [
  [/\b(calle|street)\b/, "Calle"],
  [/\b(valle|valley)\b/, "Valle"],
  [/\b(montana\w*|mountain\w*|acantilado|cliff)\b/, "Montañas"],
  [/\b(bosque|forest|woods)\b/, "Bosque"],
  [/\b(castillo|castle)\b/, "Castillo"],
  [/\b(ciudad|city|pueblo|village|jerusalen|roma)\b/, "Ciudad"],
  [/\b(mar|sea|oceano|ocean)\b/, "Mar"],
  [/\b(desierto|desert)\b/, "Desierto"],
  [/\b(casa|house|habitacion|room)\b/, "Interior"],
  [/\b(templo|temple|iglesia|church)\b/, "Templo"],
];
// Clauses are split at action-bearing conjunctions as well as punctuation. One
// event may later expand into preparation, action and consequence shots.
function actionOf(text: string) {
  const t = normalize(text);
  if (
    /flechas.*(caer|cayer|fall)|lluvia de flechas|arrows.*(rain|fall)/.test(t)
  )
    return "arrow_rain";
  if (/(dispar|lanzo|lanzar|shoot|shot|fired|released)/.test(t))
    return /flecha|arco|arrow|bow/.test(t) ? "fire_arrow" : "launch";
  if (/tens|draw.*bow/.test(t)) return "draw_bow";
  if (/levant.*arco|rais.*bow/.test(t)) return "raise_bow";
  if (/levant.*espada|rais.*sword/.test(t)) return "raise_sword";
  if (/escuch.*ruido|hear.*noise/.test(t)) return "listen";
  if (/se detiene|se detuvo|stop/.test(t)) return "stop";
  if (/gira.*cabeza|turn.*head/.test(t)) return "head_turn";
  if (/observ|mirab|vigil|watch|look|acech/.test(t)) return "observe";
  if (/\b(?:avanza\w*|avanzo|entr\w*|camin\w*|march\w*|walk\w*|enter\w*|atraves\w*)/.test(t))
    return "advance";
  if (/huy|huyo|escap|flee|run|corr/.test(t)) return "escape";
  if (/luch|atac|combat|fight|attack/.test(t)) return "attack";
  if (/mor|murio|cayo|muert|dead|die|fell/.test(t)) return "fall";
  if (/descubr|encontr|revel|discover|found|reveal/.test(t)) return "discover";
  if (/habl|dijo|respond|said|speak/.test(t)) return "speak";
  return "contemplate";
}
function timeOf(text: string, previous: string) {
  const t = normalize(text);
  if (/amanecer|alba|sunrise|dawn/.test(t)) return "dawn";
  if (/anochecer|atardecer|sunset|dusk/.test(t)) return "dusk";
  if (/noche|night|oscuridad/.test(t)) return "night";
  if (/mediodia|noon/.test(t)) return "noon";
  return previous;
}
function character(
  id: string,
  name: string,
  role: Character["role"],
  clothing: string,
  era: string,
): Character {
  return {
    id,
    name,
    role,
    description: `${name}, ${era}, ${clothing}`,
    appearance: {
      age: id === "child" ? 12 : 36,
      hair: "cabello oscuro",
      clothing,
      accessories: [],
      weapons:
        id === "archer"
          ? ["arco", "flechas"]
          : id === "army" || id === "commander"
            ? ["espada", "escudo"]
            : [],
      colors:
        id === "commander" ? ["#872f2d", "#ae8652"] : ["#504b35", "#bb955f"],
      face: "rasgos definidos, rostro consistente",
      artStyle: "historical_parchment",
    },
    referenceAssetIds: [],
    poses: [
      "standing",
      "walking",
      "observing",
      "raising",
      "drawing",
      "firing",
      "defending",
    ],
  };
}
export class StoryAnalyzer {
  constructor(private provider?: StoryAnalysisProvider) {}
  async analyze(
    story: string,
    style = "historical_parchment",
  ): Promise<Analysis> {
    if (wordCount(story) < 3)
      throw new Error("Escribe una historia de al menos tres palabras.");
    if (this.provider)
      return AnalysisSchema.parse(await this.provider.analyze(story, style));
    const t = normalize(story);
    const era = /roman|roma\b/.test(t)
      ? "antigüedad romana"
      : /medieval|caballer|castillo/.test(t)
        ? "época medieval"
        : /futur|robot|space/.test(t)
          ? "futuro"
          : /biblic|moises|jesus|jerusalen/.test(t)
            ? "antigüedad bíblica"
            : "época descrita en la historia";
    const genre = /terror|fantasma|horror|muert|oscur/.test(t)
      ? "horror"
      : /dragon|magia|hechic|magic/.test(t)
        ? "fantasy"
        : /dios|zeus|mito/.test(t)
          ? "mythology"
          : /detective|mister|enigma/.test(t)
            ? "mystery"
            : "historical";
    const characters: Character[] = [];
    const matchers = new Map<string, RegExp>();
    for (const [pattern, id, name, role, clothing] of archetypes)
      if (pattern.test(t)) {
        characters.push(
          character(id, name, role as Character["role"], clothing, era),
        );
        matchers.set(id, pattern);
      }
    // Named characters complement role detection; role definitions bind to names
    // when the name appears immediately after the role ("arquera Elena").
    const names = [
      ...story.matchAll(
        /\b(?:llamad[oa]|named|comandante|arquera?|rey|reina|caballero|detective|viajera?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/g,
      ),
    ].map((m) => m[1]);
    const proper = [
      ...story.matchAll(
        /(?<!\p{L})([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})(?=\s+(?:camin|avanz|entr|mir|observ|levant|dijo|corr|encontr|dispar|huy|luch|viaj|walk|look|said))/gu,
      ),
    ].map((m) => m[1]);
    const roleNames: Record<string, string> = {
      archer: "arquer[oa]",
      commander: "comandante|capitan|general",
      royal: "rey|reina",
      traveler: "viajer[oa]|detective",
      knight: "caballero",
      army: "soldado",
      child: "nin[oa]",
      divine: "angel",
      creature: "dragon",
    };
    for (const name of new Set([...names, ...proper])) {
      const adjacent = characters.find((c) =>
        new RegExp(
          `(?:${roleNames[c.id] || "(?!)"})\\s+${normalize(name)}\\b`,
        ).test(t),
      );
      if (adjacent) {
        adjacent.name = name;
        adjacent.description = `${name}, ${adjacent.description}`;
        matchers.set(
          adjacent.id,
          new RegExp(
            `(${matchers.get(adjacent.id)?.source}|\\b${normalize(name)}\\b)`,
          ),
        );
      } else {
        const id = slug(name);
        characters.push(
          character(
            id,
            name,
            "main",
            "vestimenta descrita en la historia",
            era,
          ),
        );
        matchers.set(id, new RegExp(`\\b${normalize(name)}\\b`));
      }
    }
    const coat = story.match(
      /(?:lleva|viste|vest[ií]a)\s+(?:una?\s+)?(chaqueta|abrigo)\s+(negra?|roja?|azul|verde)/i,
    );
    if (coat) {
      const main =
        characters.find((c) => c.id === "traveler") ||
        characters.find((c) => c.role === "main");
      if (main) {
        main.appearance.clothing = `${coat[1]} ${coat[2]}`;
        main.description = `${main.name}, ${era}, ${main.appearance.clothing}`;
        main.appearance.colors = [
          /negr/i.test(coat[2])
            ? "#111318"
            : /roj/i.test(coat[2])
              ? "#872f2d"
              : /azul/i.test(coat[2])
                ? "#30466d"
                : "#46553c",
        ];
      }
    }
    const locations = placePatterns
      .filter(([p]) => p.test(t))
      .map(([, name]) => ({
        id: slug(name),
        name,
        description: `${name}, ${era}, ilustración con profundidad y luz coherente`,
      }));
    if (!locations.length)
      locations.push({
        id: "setting",
        name: "Escenario de la historia",
        description: "Entorno sugerido por el relato; revisar ubicación",
      });
    const clauses = story
      .split(
        /(?<=[.!?;])\s+|,?\s+(?=(?:y entonces|entonces|cuando|mientras|segundos después|then|when|meanwhile)\b)|\s+y\s+(?=(?:lanz|dispar|levant|tens|corr|huy|encontr|mir|entr|atac|observ))/i,
      )
      .flatMap((part) =>
        part.split(/,\s*(?=gira.*cabeza)|\s+(?=Se detiene\b)/i),
      )
      .map((x) => x.trim())
      .filter(Boolean)
      .reduce<string[]>((result, part) => {
        if (
          (/^(lleva|viste|vestía|wears)\b/i.test(part) ||
            /^mientras la c[aá]mara/i.test(part)) &&
          result.length
        )
          result[result.length - 1] += " " + part;
        else result.push(part);
        return result;
      }, []);
    let currentLocation = locations[0].id,
      currentTime = timeOf(story.slice(0, 150), "day"),
      subjects: string[] = characters.length
        ? [characters.find((c) => c.role === "main")?.id || characters[0].id]
        : [];
    const events = clauses.map((text, i) => {
      const n = normalize(text);
      const detected = characters
        .filter((c) => matchers.get(c.id)?.test(n))
        .map((c) => c.id);
      const action = actionOf(text);
      const implicit =
        /^(se |gira |observa |comienza |de pronto escucha |lleva )/i.test(text);
      if (detected.length && !implicit) subjects = detected;
      const visible = [...new Set([...subjects, ...detected])];
      const loc = placePatterns.find(
        ([p, name]) => p.test(n) && locations.some((l) => l.name === name),
      );
      if (loc) currentLocation = slug(loc[1]);
      const nextTime = timeOf(text, currentTime);
      const temporalChange =
        nextTime !== currentTime ||
        /dias despues|anos despues|next day|years later/.test(n);
      currentTime = nextTime;
      return {
        id: `event_${i + 1}`,
        sourceText: text,
        action,
        subjects: [...subjects],
        visibleCharacters: visible,
        location: currentLocation,
        emotion: [
          "fire_arrow",
          "arrow_rain",
          "attack",
          "escape",
          "fall",
          "listen",
          "stop",
          "head_turn",
        ].includes(action)
          ? "tension"
          : action === "observe"
            ? "suspense"
            : "calm",
        timeOfDay: currentTime,
        visualImportance: ["fire_arrow", "arrow_rain", "discover"].includes(
          action,
        )
          ? 3
          : action === "contemplate"
            ? 1
            : 2,
        temporalChange,
      };
    });
    // Resolve bow-related pronouns to the persistent archer identity.
    for (const event of events)
      if (
        ["raise_bow", "draw_bow", "fire_arrow"].includes(event.action) &&
        characters.some((c) => c.id === "archer")
      ) {
        event.subjects = ["archer"];
        event.visibleCharacters = ["archer"];
      }
    const objects = [
      "flecha",
      "arco",
      "espada",
      "escudo",
      "fuego",
      "humo",
      "bandera",
      "libro",
      "puerta",
      "crown",
      "sword",
    ].filter((o) => t.includes(o));
    const relationships =
      characters.length > 1
        ? [
            {
              from: characters[0].id,
              to: characters[1].id,
              relationship: /enemig|enemy|atac|ambush/.test(t)
                ? "conflict"
                : "shared_story",
            },
          ]
        : [];
    return AnalysisSchema.parse({
      title: story.split(/[.!?]/)[0].split(/\s+/).slice(0, 8).join(" "),
      genre,
      era,
      visualStyle: style,
      characters,
      locations,
      objects,
      relationships,
      events,
      warnings: [
        "Análisis local por reglas: revisa nombres, relaciones y acciones implícitas en relatos complejos.",
      ],
      analyzer: "local",
    });
  }
}

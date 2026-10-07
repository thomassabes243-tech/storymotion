import type { Character } from "../domain";
export class CharacterBible {
  private entries = new Map<string, Character>();
  constructor(characters: Character[] = []) {
    characters.forEach((c) => this.register(c));
  }
  register(character: Character) {
    const existing = this.entries.get(character.id);
    if (existing) return structuredClone(existing);
    const frozen = structuredClone(character);
    this.entries.set(character.id, frozen);
    return structuredClone(frozen);
  }
  get(id: string) {
    const c = this.entries.get(id);
    if (!c) throw new Error(`Personaje desconocido: ${id}`);
    return structuredClone(c);
  }
  all() {
    return [...this.entries.values()].map((c) => structuredClone(c));
  }
  identityPrompt(id: string) {
    const c = this.get(id);
    return `${c.name}: ${c.description}; ${Object.entries(c.appearance)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("; ")}`;
  }
}

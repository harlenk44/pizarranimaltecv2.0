export interface Animal {
  number: number;
  name: string;
}

// Standard 38-animal lottery list (0-37) used in Venezuelan "animalitos" lotteries
export const ANIMALS: Animal[] = [
  { number: 0, name: "Delfín" },
  { number: 1, name: "Carnero" },
  { number: 2, name: "Toro" },
  { number: 3, name: "Ciempiés" },
  { number: 4, name: "Alacrán" },
  { number: 5, name: "León" },
  { number: 6, name: "Rana" },
  { number: 7, name: "Perico" },
  { number: 8, name: "Ratón" },
  { number: 9, name: "Águila" },
  { number: 10, name: "Tigre" },
  { number: 11, name: "Gato" },
  { number: 12, name: "Caballo" },
  { number: 13, name: "Mono" },
  { number: 14, name: "Paloma" },
  { number: 15, name: "Zorro" },
  { number: 16, name: "Oso" },
  { number: 17, name: "Pavo" },
  { number: 18, name: "Burro" },
  { number: 19, name: "Cabro" },
  { number: 20, name: "Cochino" },
  { number: 21, name: "Gallo" },
  { number: 22, name: "Camello" },
  { number: 23, name: "Cebra" },
  { number: 24, name: "Iguana" },
  { number: 25, name: "Gallina" },
  { number: 26, name: "Vaca" },
  { number: 27, name: "Perro" },
  { number: 28, name: "Zamuro" },
  { number: 29, name: "Elefante" },
  { number: 30, name: "Culebra" },
  { number: 31, name: "Lapa" },
  { number: 32, name: "Ardilla" },
  { number: 33, name: "Pescado" },
  { number: 34, name: "Venado" },
  { number: 35, name: "Jirafa" },
  { number: 36, name: "Cochinera" },
  { number: 37, name: "Ballena" },
];

export const ANIMAL_MAP: Record<number, Animal> = ANIMALS.reduce(
  (acc, a) => ({ ...acc, [a.number]: a }),
  {} as Record<number, Animal>,
);

export function getAnimalName(num: number): string {
  return ANIMAL_MAP[num]?.name ?? "Desconocido";
}

// Generate a default animal list for games that don't have custom entries.
// Uses the standard list for 0-37, then cycles with "(NN)" suffix for higher numbers.
export function generateDefaultAnimals(count: number): Animal[] {
  const result: Animal[] = [];
  for (let i = 0; i < count; i++) {
    if (i < ANIMALS.length) {
      result.push({ number: i, name: ANIMALS[i]!.name });
    } else {
      const baseIdx = i % ANIMALS.length;
      result.push({ number: i, name: `${ANIMALS[baseIdx]!.name} (${i})` });
    }
  }
  return result;
}

export function getEmojiForNumber(num: number): string {
  const emojis: Record<number, string> = {
    0: "🐬",
    1: "🐏",
    2: "🐂",
    3: "🐛",
    4: "🦂",
    5: "🦁",
    6: "🐸",
    7: "🦜",
    8: "🐭",
    9: "🦅",
    10: "🐯",
    11: "🐱",
    12: "🐴",
    13: "🐵",
    14: "🕊️",
    15: "🦊",
    16: "🐻",
    17: "🦃",
    18: "🐴",
    19: "🐐",
    20: "🐖",
    21: "🐓",
    22: "🐪",
    23: "🦓",
    24: "🦎",
    25: "🐔",
    26: "🐮",
    27: "🐶",
    28: "🦅",
    29: "🐘",
    30: "🐍",
    31: "🦫",
    32: "🐿️",
    33: "🐟",
    34: "🦌",
    35: "🦒",
    36: "🐖",
    37: "🐋",
  };
  if (emojis[num] !== undefined) return emojis[num];
  return emojis[num % 38] ?? "🎯";
}

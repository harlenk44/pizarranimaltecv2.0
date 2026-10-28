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

/** Complete Venezuelan lottery animal emoji dictionary by official number (0 to 100) */
export const ANIMAL_EMOJIS_BY_NUMBER: Record<number, string> = {
  0: "🐬", // Delfín
  1: "🐏", // Carnero
  2: "🐂", // Toro
  3: "🐛", // Ciempiés
  4: "🦂", // Alacrán
  5: "🦁", // León
  6: "🐸", // Rana
  7: "🦜", // Perico
  8: "🐭", // Ratón
  9: "🦅", // Águila
  10: "🐯", // Tigre
  11: "🐱", // Gato
  12: "🐴", // Caballo
  13: "🐵", // Mono
  14: "🕊️", // Paloma
  15: "🦊", // Zorro
  16: "🐻", // Oso
  17: "🦃", // Pavo
  18: "🫏", // Burro
  19: "🐐", // Chivo / Cabro
  20: "🐖", // Cochino
  21: "🐓", // Gallo
  22: "🐪", // Camello
  23: "🦓", // Cebra
  24: "🦎", // Iguana
  25: "🐔", // Gallina
  26: "🐮", // Vaca
  27: "🐶", // Perro
  28: "🦅", // Zamuro
  29: "🐘", // Elefante
  30: "🐊", // Caimán
  31: "🦫", // Lapa
  32: "🐿️", // Ardilla
  33: "🐟", // Pescado
  34: "🦌", // Venado
  35: "🦒", // Jirafa
  36: "🐍", // Culebra
  37: "🐢", // Tortuga
  38: "🦬", // Búfalo
  39: "🦉", // Lechuza
  40: "🐝", // Avispa
  41: "🦘", // Canguro
  42: "🦜", // Tucán
  43: "🦋", // Mariposa
  44: "🦫", // Chigüire
  45: "🦩", // Garza
  46: "🐆", // Puma
  47: "🦚", // Pavo Real
  48: "🦔", // Puercoespín
  49: "🦥", // Pereza
  50: "🐤", // Canario
  51: "🦤", // Pelícano (¡Pelícano, NUNCA mono!)
  52: "🐙", // Pulpo
  53: "🐌", // Caracol
  54: "🦗", // Grillo
  55: "🦡", // Oso Hormiguero
  56: "🦈", // Tiburón
  57: "🦆", // Pato
  58: "🐜", // Hormiga
  59: "🐆", // Pantera
  60: "🦎", // Camaleón
  61: "🐼", // Panda
  62: "🦔", // Cachicamo
  63: "🦀", // Cangrejo
  64: "🦅", // Gavilán
  65: "🕷️", // Araña
  66: "🐺", // Lobo
  67: "🦤", // Avestruz
  68: "🐆", // Jaguar
  69: "🐰", // Conejo
  70: "🦬", // Bisonte
  71: "🦜", // Guacamaya
  72: "🦍", // Gorila
  73: "🦛", // Hipopótamo
  74: "🐤", // Turpial
  75: "🦇", // Guácharo
  76: "🐋", // Ballena
  77: "🐧", // Pingüino
  78: "🦌", // Antílope
  79: "🦑", // Calamar
  80: "🦇", // Murciélago
  81: "🐦‍⬛", // Cuervo
  82: "🪳", // Cucaracha
  83: "🦉", // Búho
  84: "🦐", // Camarón
  85: "🐹", // Hámster
  86: "🐂", // Buey
  87: "🐐", // Cabra
  88: "🐡", // Erizo de Mar
  89: "🐍", // Anguila
  90: "🦡", // Hurón
  91: "🐢", // Morrocoy
  92: "🦢", // Cisne
  93: "🕊️", // Gaviota
  94: "🦃", // Paujil
  95: "🪲", // Escarabajo
  96: "🐡", // Caballito de Mar
  97: "🦜", // Loro
  98: "🐊", // Cocodrilo
  99: "🦅", // Guacharito / Halcón
  100: "🐋", // Ballena
};

/** Accurate emoji lookup by animal name (accents and case insensitive) */
export const ANIMAL_EMOJIS_BY_NAME: Record<string, string> = {
  DELFIN: "🐬",
  CARNERO: "🐏",
  TORO: "🐂",
  CIEMPIES: "🐛",
  CIENPIES: "🐛",
  ALACRAN: "🦂",
  LEON: "🦁",
  RANA: "🐸",
  PERICO: "🦜",
  RATON: "🐭",
  AGUILA: "🦅",
  TIGRE: "🐯",
  GATO: "🐱",
  CABALLO: "🐴",
  MONO: "🐵",
  PALOMA: "🕊️",
  ZORRO: "🦊",
  OSO: "🐻",
  PAVO: "🦃",
  BURRO: "🫏",
  CHIVO: "🐐",
  CABRO: "🐐",
  COCHINO: "🐖",
  GALLO: "🐓",
  CAMELLO: "🐪",
  CEBRA: "🦓",
  IGUANA: "🦎",
  GALLINA: "🐔",
  VACA: "🐮",
  PERRO: "🐶",
  ZAMURO: "🦅",
  ELEFANTE: "🐘",
  CAIMAN: "🐊",
  LAPA: "🦫",
  ARDILLA: "🐿️",
  PESCADO: "🐟",
  VENADO: "🦌",
  JIRAFA: "🦒",
  CULEBRA: "🐍",
  COCHINERA: "🐖",
  TORTUGA: "🐢",
  BALLENA: "🐋",
  BUFALO: "🦬",
  LECHUZA: "🦉",
  AVISPA: "🐝",
  CANGURO: "🦘",
  TUCAN: "🦜",
  MARIPOSA: "🦋",
  CHIGUIRE: "🦫",
  CHUGUIRE: "🦫",
  GARZA: "🦩",
  PUMA: "🐆",
  "PAVO REAL": "🦚",
  PAVOREAL: "🦚",
  PUERCOESPIN: "🦔",
  PEREZA: "🦥",
  CANARIO: "🐤",
  PELICANO: "🦤",
  PULPO: "🐙",
  CARACOL: "🐌",
  GRILLO: "🦗",
  "OSO HORMIGUERO": "🦡",
  OSOHORMIGUERO: "🦡",
  TIBURON: "🦈",
  PATO: "🦆",
  HORMIGA: "🐜",
  PANTERA: "🐆",
  CAMALEON: "🦎",
  PANDA: "🐼",
  CACHICAMO: "🦔",
  CANGREJO: "🦀",
  GAVILAN: "🦅",
  ARANA: "🕷️",
  LOBO: "🐺",
  AVESTRUZ: "🦤",
  JAGUAR: "🐆",
  CONEJO: "🐰",
  BISONTE: "🦬",
  GUACAMAYA: "🦜",
  GORILA: "🦍",
  HIPOPOTAMO: "🦛",
  TURPIAL: "🐤",
  GUACHARO: "🦇",
  RINOCERONTE: "🦏",
  PINGUINO: "🐧",
  ANTILOPE: "🦌",
  CALAMAR: "🦑",
  MURCIELAGO: "🦇",
  CUERVO: "🐦‍⬛",
  CUCARACHA: "🪳",
  BUHO: "🦉",
  CAMARON: "🦐",
  HAMSTER: "🐹",
  BUEY: "🐂",
  CABRA: "🐐",
  "ERIZO DE MAR": "🐡",
  ERIZO: "🐡",
  ANGUILA: "🐍",
  HURON: "🦡",
  MORROCOY: "🐢",
  CISNE: "🦢",
  GAVIOTA: "🕊️",
  PAUJIL: "🦃",
  ESCARABAJO: "🪲",
  "CABALLITO DE MAR": "🐡",
  CABALLITO: "🐡",
  LORO: "🦜",
  COCODRILO: "🐊",
  GUACHARITO: "🦅",
  HALCON: "🦅",
};

function normalizeKey(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the exact emoji for an animal by name and/or number.
 * Priority:
 * 1. Matching by animal name (guarantees Pelícano is always a bird, Mono is a monkey).
 * 2. Matching by number from official 0-100 animal table.
 * 3. Default lottery icon "🎯". (NEVER modulo % 38).
 */
export function getEmojiForNumber(num: number, name?: string): string {
  if (name) {
    const key = normalizeKey(name);
    if (ANIMAL_EMOJIS_BY_NAME[key]) {
      return ANIMAL_EMOJIS_BY_NAME[key]!;
    }
  }

  if (ANIMAL_EMOJIS_BY_NUMBER[num] !== undefined) {
    return ANIMAL_EMOJIS_BY_NUMBER[num]!;
  }

  return "🎯";
}

export function getEmojiForAnimal(name?: string, num?: number): string {
  return getEmojiForNumber(num ?? -1, name);
}

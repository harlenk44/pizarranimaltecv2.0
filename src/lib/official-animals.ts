// Official animal lists sourced from the lottery operators' pages.
// Guacharo: 77 animals (00-76) — guacharoactivo.com.ve
// Guacharito: 101 animals (00-100) — elguacharitomillonario.com
// Selva Plus: 101 animals (00-100) + 2 wildcards — selvaplus.com

export interface OfficialAnimal {
  number: number;
  name: string;
}

// Shared base list (0-75) used by both Guacharo and Guacharito/Selva Plus
const BASE_ANIMALS: OfficialAnimal[] = [
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
  { number: 19, name: "Chivo" },
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
  { number: 30, name: "Caimán" },
  { number: 31, name: "Lapa" },
  { number: 32, name: "Ardilla" },
  { number: 33, name: "Pescado" },
  { number: 34, name: "Venado" },
  { number: 35, name: "Jirafa" },
  { number: 36, name: "Culebra" },
  { number: 37, name: "Tortuga" },
  { number: 38, name: "Búfalo" },
  { number: 39, name: "Lechuza" },
  { number: 40, name: "Avispa" },
  { number: 41, name: "Canguro" },
  { number: 42, name: "Tucán" },
  { number: 43, name: "Mariposa" },
  { number: 44, name: "Chigüire" },
  { number: 45, name: "Garza" },
  { number: 46, name: "Puma" },
  { number: 47, name: "Pavo Real" },
  { number: 48, name: "Puercoespín" },
  { number: 49, name: "Pereza" },
  { number: 50, name: "Canario" },
  { number: 51, name: "Pelícano" },
  { number: 52, name: "Pulpo" },
  { number: 53, name: "Caracol" },
  { number: 54, name: "Grillo" },
  { number: 55, name: "Oso Hormiguero" },
  { number: 56, name: "Tiburón" },
  { number: 57, name: "Pato" },
  { number: 58, name: "Hormiga" },
  { number: 59, name: "Pantera" },
  { number: 60, name: "Camaleón" },
  { number: 61, name: "Panda" },
  { number: 62, name: "Cachicamo" },
  { number: 63, name: "Cangrejo" },
  { number: 64, name: "Gavilán" },
  { number: 65, name: "Araña" },
  { number: 66, name: "Lobo" },
  { number: 67, name: "Avestruz" },
  { number: 68, name: "Jaguar" },
  { number: 69, name: "Conejo" },
  { number: 70, name: "Bisonte" },
  { number: 71, name: "Guacamaya" },
  { number: 72, name: "Gorila" },
  { number: 73, name: "Hipopótamo" },
  { number: 74, name: "Turpial" },
  { number: 75, name: "Guácharo" },
];

// Guacharo: 77 animals (00-76) — 0 Delfín, 01-75, 76 Ballena
export const GUACHARO_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS,
  { number: 76, name: "Ballena" },
];

// Guacharito: 101 animals (00-100) — 0 Delfín, 100 Ballena
export const GUACHARITO_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS,
  { number: 76, name: "Rinoceronte" },
  { number: 77, name: "Pingüino" },
  { number: 78, name: "Antílope" },
  { number: 79, name: "Calamar" },
  { number: 80, name: "Murciélago" },
  { number: 81, name: "Cuervo" },
  { number: 82, name: "Cucaracha" },
  { number: 83, name: "Búho" },
  { number: 84, name: "Camarón" },
  { number: 85, name: "Hámster" },
  { number: 86, name: "Buey" },
  { number: 87, name: "Cabra" },
  { number: 88, name: "Erizo de Mar" },
  { number: 89, name: "Anguila" },
  { number: 90, name: "Hurón" },
  { number: 91, name: "Morrocoy" },
  { number: 92, name: "Cisne" },
  { number: 93, name: "Gaviota" },
  { number: 94, name: "Paujil" },
  { number: 95, name: "Escarabajo" },
  { number: 96, name: "Caballito de Mar" },
  { number: 97, name: "Loro" },
  { number: 98, name: "Cocodrilo" },
  { number: 99, name: "Guacharito" },
  { number: 100, name: "Ballena" },
];

// Selva Plus: 100 animals (00-99) + 2 wildcards (Leoncito, Selva Plus) — selvaplus.com
// Same as Guacharito except 99 is Halcón (not Guacharito) and no entry 100. Ballena stays at 100 conceptually but Selva Plus stops at 99.
export const SELVA_PLUS_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS,
  { number: 76, name: "Rinoceronte" },
  { number: 77, name: "Pingüino" },
  { number: 78, name: "Antílope" },
  { number: 79, name: "Calamar" },
  { number: 80, name: "Murciélago" },
  { number: 81, name: "Cuervo" },
  { number: 82, name: "Cucaracha" },
  { number: 83, name: "Búho" },
  { number: 84, name: "Camarón" },
  { number: 85, name: "Hámster" },
  { number: 86, name: "Buey" },
  { number: 87, name: "Cabra" },
  { number: 88, name: "Erizo de Mar" },
  { number: 89, name: "Anguila" },
  { number: 90, name: "Hurón" },
  { number: 91, name: "Morrocoy" },
  { number: 92, name: "Cisne" },
  { number: 93, name: "Gaviota" },
  { number: 94, name: "Paujil" },
  { number: 95, name: "Escarabajo" },
  { number: 96, name: "Caballito de Mar" },
  { number: 97, name: "Loro" },
  { number: 98, name: "Cocodrilo" },
  { number: 99, name: "Halcón" },
];

// Loto Chaima: 57 animals (0 Delfín, 01-55 Oso Hormiguero, 56 Ballena) — lotochaima.com
export const LOTO_CHAIMA_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS.slice(0, 56), // 0-55 (Delfín through Oso Hormiguero)
  { number: 56, name: "Ballena" },
];

// Lotto Activo: 38 animals (0 Delfín, 01-36 Culebra, 37 Ballena) — lottoactivo.com
export const LOTTO_ACTIVO_ANIMALS: OfficialAnimal[] = [
  ...BASE_ANIMALS.slice(0, 37), // 0-36 (Delfín through Culebra)
  { number: 37, name: "Ballena" },
];

// Map game slug -> official animal list
export const OFFICIAL_ANIMALS: Record<string, OfficialAnimal[]> = {
  guacharo: GUACHARO_ANIMALS,
  guacharito: GUACHARITO_ANIMALS,
  "selva-plus": SELVA_PLUS_ANIMALS,
  "loto-chaim-a": LOTO_CHAIMA_ANIMALS,
  "lotto-activo": LOTTO_ACTIVO_ANIMALS,
};

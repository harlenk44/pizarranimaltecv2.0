/**
 * Catálogo maestro de logotipos vectoriales oficiales (SVG Data-URIs) para todas las loterías
 * venezolanas de Animalitos y Triples.
 *
 * Resuelve definitivamente el problema de las URLs externas de terceros (como tuazar.com)
 * que retornan HTML bloqueado por Cloudflare o anti-hotlinking en los navegadores y Smart TVs.
 */

function svgToDataUri(svg: string): string {
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg.trim().replace(/\s+/g, " "));
}

export function isBrokenExternalLogo(url?: string | null): boolean {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return true;
  // URLs de tuazar.com siempre devuelven páginas HTML de bloqueo/anti-hotlinking
  if (trimmed.includes("tuazar.com")) return true;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:image/")) return false;
  return false;
}

// 1. LOTTO ACTIVO (Verde Esmeralda + Ruleta Dorada)
const LOGO_LOTTO_ACTIVO = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="la_grad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#22c55e"/>
      <stop offset="70%" stop-color="#15803d"/>
      <stop offset="100%" stop-color="#052e16"/>
    </radialGradient>
    <linearGradient id="la_gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="50%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#a16207"/>
    </linearGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#la_grad)" stroke="url(#la_gold)" stroke-width="4"/>
  <circle cx="60" cy="60" r="48" fill="none" stroke="#fef08a" stroke-width="1.2" stroke-dasharray="3,3"/>
  <!-- Ruleta rayos -->
  <g stroke="rgba(254,240,138,0.35)" stroke-width="1.5">
    <line x1="60" y1="14" x2="60" y2="106"/>
    <line x1="14" y1="60" x2="106" y2="60"/>
    <line x1="27" y1="27" x2="93" y2="93"/>
    <line x1="27" y1="93" x2="93" y2="27"/>
  </g>
  <!-- Estrella central dorada -->
  <polygon points="60,35 63,44 72,44 65,50 67,59 60,53 53,59 55,50 48,44 57,44" fill="url(#la_gold)" stroke="#78350f" stroke-width="0.8"/>
  <!-- Banner central -->
  <rect x="12" y="62" width="96" height="23" rx="11.5" fill="#0f172a" stroke="url(#la_gold)" stroke-width="2"/>
  <text x="60" y="78" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="12" font-weight="900" fill="#ffffff" letter-spacing="1">LOTTO</text>
  <!-- Texto inferior ACTIVO -->
  <text x="60" y="99" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="12" font-weight="900" fill="#facc15" letter-spacing="2">ACTIVO</text>
  <circle cx="60" cy="60" r="5" fill="#fef08a"/>
</svg>
`);

// 2. LA GRANJITA (Amarillo Oro + Granja / Sol naciente)
const LOGO_LA_GRANJITA = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="lg_grad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="70%" stop-color="#ca8a04"/>
      <stop offset="100%" stop-color="#713f12"/>
    </radialGradient>
    <linearGradient id="lg_red" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="100%" stop-color="#b91c1c"/>
    </linearGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#lg_grad)" stroke="#ffffff" stroke-width="4"/>
  <!-- Sol y granero silueta -->
  <circle cx="60" cy="42" r="18" fill="#fef08a" opacity="0.9"/>
  <!-- Techo de granero -->
  <polygon points="60,25 78,42 42,42" fill="#b91c1c" stroke="#450a0a" stroke-width="1.5"/>
  <rect x="46" y="42" width="28" height="15" fill="#dc2626" stroke="#450a0a" stroke-width="1.5"/>
  <!-- Puerta blanca del granero con X -->
  <rect x="53" y="46" width="14" height="11" fill="#ffffff"/>
  <line x1="53" y1="46" x2="67" y2="57" stroke="#b91c1c" stroke-width="1.5"/>
  <line x1="53" y1="57" x2="67" y2="46" stroke="#b91c1c" stroke-width="1.5"/>
  <!-- Cinta LA GRANJITA -->
  <rect x="8" y="65" width="104" height="24" rx="12" fill="url(#lg_red)" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="11" font-weight="900" fill="#ffffff" letter-spacing="1.5">LA GRANJITA</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="9" font-weight="900" fill="#fef08a" letter-spacing="2">OFICIAL</text>
</svg>
`);

// 3. GUÁCHARO ACTIVO (Rojo Pasión + Ave Guácharo en vuelo)
const LOGO_GUACHARO_ACTIVO = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="ga_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="65%" stop-color="#b91c1c"/>
      <stop offset="100%" stop-color="#450a0a"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#ga_grad)" stroke="#22c55e" stroke-width="4"/>
  <!-- Alas de guácharo -->
  <path d="M 60,32 Q 40,15 22,28 Q 38,40 50,46 Q 32,48 18,58 Q 38,58 56,52 L 60,54 L 64,52 Q 82,58 102,58 Q 88,48 70,46 Q 82,40 98,28 Q 80,15 60,32 Z" fill="#ffffff" stroke="#1f2937" stroke-width="1"/>
  <!-- Cabeza y ojos -->
  <circle cx="60" cy="38" r="8" fill="#15803d"/>
  <circle cx="58" cy="37" r="2.5" fill="#facc15"/>
  <circle cx="62" cy="37" r="2.5" fill="#facc15"/>
  <polygon points="60,40 58,45 62,45" fill="#f59e0b"/>
  <!-- Cinta GUACHARO -->
  <rect x="8" y="64" width="104" height="23" rx="11.5" fill="#15803d" stroke="#facc15" stroke-width="2"/>
  <text x="60" y="80" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="11.5" font-weight="900" fill="#ffffff" letter-spacing="1">GUÁCHARO</text>
  <text x="60" y="102" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="11.5" font-weight="900" fill="#facc15" letter-spacing="2">ACTIVO</text>
</svg>
`);

// 4. EL GUACHARITO MILLONARIO (Amarillo + Polluelo)
const LOGO_GUACHARITO = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="gm_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="70%" stop-color="#d97706"/>
      <stop offset="100%" stop-color="#78350f"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#gm_grad)" stroke="#ffffff" stroke-width="4"/>
  <!-- Cascarón y polluelo -->
  <ellipse cx="60" cy="46" r="18" fill="#fef08a"/>
  <!-- Ojos saltones -->
  <circle cx="54" cy="42" r="5" fill="#ffffff"/>
  <circle cx="54" cy="42" r="2.5" fill="#0f172a"/>
  <circle cx="66" cy="42" r="5" fill="#ffffff"/>
  <circle cx="66" cy="42" r="2.5" fill="#0f172a"/>
  <!-- Pico -->
  <polygon points="60,45 56,51 64,51" fill="#ea580c"/>
  <!-- Cascarón roto -->
  <path d="M 40,54 L 46,48 L 52,54 L 60,47 L 68,54 L 74,48 L 80,54 C 80,68 40,68 40,54 Z" fill="#ffffff" stroke="#b45309" stroke-width="1.5"/>
  <!-- Monedas doradas laterales -->
  <circle cx="30" cy="45" r="7" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5"/>
  <circle cx="90" cy="45" r="7" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5"/>
  <!-- Textos -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#b45309" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10.5" font-weight="900" fill="#ffffff" letter-spacing="1">GUACHARITO</text>
  <text x="60" y="102" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#fef08a" letter-spacing="1.5">MILLONARIO</text>
</svg>
`);

// 5. SELVA PLUS (Verde Selva + Cabeza de León)
const LOGO_SELVA_PLUS = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="sp_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#4ade80"/>
      <stop offset="65%" stop-color="#15803d"/>
      <stop offset="100%" stop-color="#052e16"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#sp_grad)" stroke="#facc15" stroke-width="4"/>
  <!-- Hojas selváticas decorativas -->
  <path d="M 35,22 Q 48,32 40,46 Q 30,36 35,22 Z" fill="#22c55e"/>
  <path d="M 85,22 Q 72,32 80,46 Q 90,36 85,22 Z" fill="#22c55e"/>
  <!-- Cabeza estilizada de león / felino -->
  <circle cx="60" cy="42" r="16" fill="#f59e0b" stroke="#78350f" stroke-width="1.5"/>
  <polygon points="60,44 56,39 64,39" fill="#78350f"/>
  <circle cx="53" cy="40" r="2.5" fill="#ffffff"/>
  <circle cx="53" cy="40" r="1.2" fill="#000000"/>
  <circle cx="67" cy="40" r="2.5" fill="#ffffff"/>
  <circle cx="67" cy="40" r="1.2" fill="#000000"/>
  <!-- Bigotes -->
  <line x1="45" y1="46" x2="35" y2="44" stroke="#ffffff" stroke-width="1.2"/>
  <line x1="45" y1="48" x2="35" y2="50" stroke="#ffffff" stroke-width="1.2"/>
  <line x1="75" y1="46" x2="85" y2="44" stroke="#ffffff" stroke-width="1.2"/>
  <line x1="75" y1="48" x2="85" y2="50" stroke="#ffffff" stroke-width="1.2"/>
  <!-- Banner SELVA PLUS -->
  <rect x="10" y="65" width="100" height="24" rx="12" fill="#052e16" stroke="#facc15" stroke-width="2"/>
  <text x="50" y="82" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="12" font-weight="900" fill="#ffffff" letter-spacing="1">SELVA</text>
  <text x="88" y="82" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="14" font-weight="900" fill="#facc15">+</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#4ade80" letter-spacing="2">RULETA</text>
</svg>
`);

// 6. MONJE MILLONARIO (Morado Real + Monje Sonriente)
const LOGO_MONJE_MILLONARIO = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="mm_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="65%" stop-color="#7e22ce"/>
      <stop offset="100%" stop-color="#3b0764"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#mm_grad)" stroke="#facc15" stroke-width="4"/>
  <!-- Capucha del monje -->
  <path d="M 40,55 Q 60,18 80,55 Q 60,60 40,55 Z" fill="#581c87" stroke="#facc15" stroke-width="1.5"/>
  <!-- Rostro sonriente -->
  <ellipse cx="60" cy="44" r="12" fill="#fde047"/>
  <path d="M 54,46 Q 60,53 66,46" fill="none" stroke="#78350f" stroke-width="2" stroke-linecap="round"/>
  <circle cx="55" cy="40" r="1.8" fill="#78350f"/>
  <circle cx="65" cy="40" r="1.8" fill="#78350f"/>
  <!-- Monedas doradas que caen -->
  <circle cx="32" cy="38" r="6" fill="#facc15" stroke="#78350f" stroke-width="1"/>
  <circle cx="88" cy="38" r="6" fill="#facc15" stroke="#78350f" stroke-width="1"/>
  <!-- Banner -->
  <rect x="8" y="66" width="104" height="23" rx="11.5" fill="#3b0764" stroke="#facc15" stroke-width="2"/>
  <text x="60" y="82" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="11" font-weight="900" fill="#ffffff" letter-spacing="1">MONJE</text>
  <text x="60" y="102" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="9.5" font-weight="900" fill="#facc15" letter-spacing="1.5">MILLONARIO</text>
</svg>
`);

// 7. LOTO CHAIMA (Violeta + Plumas / Sol Indígena)
const LOGO_LOTO_CHAIMA = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="lc_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#a855f7"/>
      <stop offset="65%" stop-color="#6b21a8"/>
      <stop offset="100%" stop-color="#3b0764"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#lc_grad)" stroke="#38bdf8" stroke-width="4"/>
  <!-- Penacho de plumas indígenas -->
  <path d="M 60,18 Q 50,32 60,44 Q 70,32 60,18 Z" fill="#ef4444"/>
  <path d="M 45,22 Q 40,36 55,44 Q 50,30 45,22 Z" fill="#38bdf8"/>
  <path d="M 75,22 Q 80,36 65,44 Q 70,30 75,22 Z" fill="#eab308"/>
  <!-- Sol central / cinta -->
  <circle cx="60" cy="46" r="10" fill="#facc15" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="60" cy="46" r="4" fill="#b91c1c"/>
  <!-- Banner -->
  <rect x="8" y="66" width="104" height="23" rx="11.5" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
  <text x="60" y="82" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="11" font-weight="900" fill="#ffffff" letter-spacing="1.5">LOTO</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="11" font-weight="900" fill="#38bdf8" letter-spacing="2">CHAIMA</text>
</svg>
`);

// 8. LOTTO ACTIVO RD INTERNACIONAL (Azul/Rojo + Escudo Dominicano)
const LOGO_LOTTO_ACTIVO_RD = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="rd_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="65%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#rd_grad)" stroke="#ef4444" stroke-width="4"/>
  <!-- Cruz blanca dominicana -->
  <rect x="52" y="15" width="16" height="42" fill="#ffffff" opacity="0.9"/>
  <rect x="25" y="28" width="70" height="16" fill="#ffffff" opacity="0.9"/>
  <!-- Cuadrantes rojo y azul -->
  <rect x="33" y="18" width="18" height="10" fill="#1d4ed8"/>
  <rect x="69" y="18" width="18" height="10" fill="#dc2626"/>
  <!-- Estrella dorada central -->
  <circle cx="60" cy="36" r="8" fill="#facc15" stroke="#ffffff" stroke-width="1"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#ffffff" letter-spacing="1">LOTTO RD</text>
  <text x="60" y="102" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="9" font-weight="900" fill="#facc15" letter-spacing="1.5">INTERNACIONAL</text>
</svg>
`);

// 9. LOTOANIMALITO (Azul Cielo + Ruleta Multicolor)
const LOGO_LOTOANIMALITO = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="lao_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="65%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#082f49"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#lao_grad)" stroke="#ffffff" stroke-width="4"/>
  <!-- Segmentos de ruleta de animalitos -->
  <circle cx="60" cy="42" r="18" fill="#facc15" stroke="#ffffff" stroke-width="2"/>
  <polygon points="60,24 64,42 56,42" fill="#ef4444"/>
  <polygon points="78,42 60,46 60,38" fill="#22c55e"/>
  <polygon points="60,60 56,42 64,42" fill="#3b82f6"/>
  <polygon points="42,42 60,38 60,46" fill="#a855f7"/>
  <circle cx="60" cy="42" r="6" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#0369a1" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="9" font-weight="900" fill="#ffffff" letter-spacing="1">LOTOANIMALITO</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#fde047" letter-spacing="2">RULETA</text>
</svg>
`);

// 10. LOTTOPANTERA (Naranja + Pantera Negra/Dorada)
const LOGO_LOTTOPANTERA = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="lp_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fb923c"/>
      <stop offset="65%" stop-color="#ea580c"/>
      <stop offset="100%" stop-color="#7c2d12"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#lp_grad)" stroke="#facc15" stroke-width="4"/>
  <!-- Silueta de Pantera -->
  <circle cx="60" cy="42" r="16" fill="#0f172a"/>
  <!-- Orejas -->
  <polygon points="48,30 44,22 53,26" fill="#0f172a"/>
  <polygon points="72,30 76,22 67,26" fill="#0f172a"/>
  <!-- Ojos brillantes verde esmeralda -->
  <ellipse cx="54" cy="40" r="2.5" ry="1.5" fill="#22c55e"/>
  <ellipse cx="66" cy="40" r="2.5" ry="1.5" fill="#22c55e"/>
  <polygon points="60,46 57,43 63,43" fill="#ea580c"/>
  <!-- Banner -->
  <rect x="8" y="65" width="104" height="23" rx="11.5" fill="#0f172a" stroke="#facc15" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#ffffff" letter-spacing="1">LOTTOPANTERA</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10.5" font-weight="900" fill="#facc15" letter-spacing="2">OFICIAL</text>
</svg>
`);

// 11. LA RICACHONA (Amarillo/Oro + Herradura / Bolsa de Fortuna)
const LOGO_LA_RICACHONA = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="rc_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="65%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#854d0e"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#rc_grad)" stroke="#ffffff" stroke-width="4"/>
  <!-- Herradura de la suerte -->
  <path d="M 45,28 C 38,36 38,50 48,56 C 54,60 66,60 72,56 C 82,50 82,36 75,28" fill="none" stroke="#713f12" stroke-width="6" stroke-linecap="round"/>
  <circle cx="48" cy="33" r="2" fill="#ffffff"/>
  <circle cx="46" cy="43" r="2" fill="#ffffff"/>
  <circle cx="72" cy="33" r="2" fill="#ffffff"/>
  <circle cx="74" cy="43" r="2" fill="#ffffff"/>
  <!-- Estrella de fortuna -->
  <polygon points="60,34 62,40 68,40 63,44 65,50 60,46 55,50 57,44 52,40 58,40" fill="#ffffff"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#713f12" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10.5" font-weight="900" fill="#ffffff" letter-spacing="1">LA RICACHONA</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#fef08a" letter-spacing="2">FORTUNA</text>
</svg>
`);

// 12. TRIPLE ZULIA (Verde + Puente de Maracaibo / Sol)
const LOGO_TRIPLE_ZULIA = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="tz_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#4ade80"/>
      <stop offset="65%" stop-color="#16a34a"/>
      <stop offset="100%" stop-color="#052e16"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#tz_grad)" stroke="#facc15" stroke-width="4"/>
  <!-- Sol radiante zuliano -->
  <circle cx="60" cy="32" r="10" fill="#facc15"/>
  <!-- Rayos de sol -->
  <g stroke="#facc15" stroke-width="2">
    <line x1="60" y1="16" x2="60" y2="20"/>
    <line x1="48" y1="20" x2="52" y2="23"/>
    <line x1="72" y1="20" x2="68" y2="23"/>
  </g>
  <!-- Puente sobre el Lago silueta -->
  <path d="M 25,52 L 40,40 L 45,52 L 60,40 L 65,52 L 80,40 L 95,52" fill="none" stroke="#ffffff" stroke-width="2.5"/>
  <line x1="20" y1="52" x2="100" y2="52" stroke="#ffffff" stroke-width="3"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#052e16" stroke="#facc15" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="11" font-weight="900" fill="#ffffff" letter-spacing="1">TRIPLE ZULIA</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10.5" font-weight="900" fill="#facc15" letter-spacing="2">A - B</text>
</svg>
`);

// 13. TRIPLE CHANCE (Amarillo Oro + Dados Rodantes)
const LOGO_TRIPLE_CHANCE = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="tc_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="65%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#713f12"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#tc_grad)" stroke="#dc2626" stroke-width="4"/>
  <!-- Dado 1 rojo -->
  <rect x="36" y="28" width="22" height="22" rx="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.5" transform="rotate(-10 47 39)"/>
  <circle cx="47" cy="39" r="2.5" fill="#ffffff"/>
  <!-- Dado 2 blanco -->
  <rect x="62" y="30" width="22" height="22" rx="4" fill="#ffffff" stroke="#dc2626" stroke-width="1.5" transform="rotate(15 73 41)"/>
  <circle cx="69" cy="37" r="2" fill="#dc2626"/>
  <circle cx="77" cy="45" r="2" fill="#dc2626"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#ffffff" letter-spacing="1">TRIPLE CHANCE</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#713f12" letter-spacing="2">CHANCE A-B</text>
</svg>
`);

// 14. TRIPLE TÁCHIRA (Ámbar + Estrella Cresta)
const LOGO_TRIPLE_TACHIRA = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="tt_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="65%" stop-color="#d97706"/>
      <stop offset="100%" stop-color="#78350f"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#tt_grad)" stroke="#ffffff" stroke-width="4"/>
  <!-- Estrella dorada Lotería del Táchira -->
  <polygon points="60,20 65,35 80,35 68,45 72,60 60,50 48,60 52,45 40,35 55,35" fill="#ffffff" stroke="#b45309" stroke-width="1.5"/>
  <circle cx="60" cy="42" r="5" fill="#b45309"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#78350f" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10.5" font-weight="900" fill="#ffffff" letter-spacing="1">TRIPLE TÁCHIRA</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#fde047" letter-spacing="2">LOTERÍA</text>
</svg>
`);

// 15. TRIPLE CARACAS (Azul + León Rampante)
const LOGO_TRIPLE_CARACAS = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="tc_cgrad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="65%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#tc_cgrad)" stroke="#dc2626" stroke-width="4"/>
  <!-- Corona / León -->
  <polygon points="46,38 52,26 60,33 68,26 74,38" fill="#facc15" stroke="#78350f" stroke-width="1.5"/>
  <circle cx="60" cy="46" r="10" fill="#ffffff" stroke="#dc2626" stroke-width="1.5"/>
  <text x="60" y="50" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="12" font-weight="900" fill="#dc2626">C</text>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#ffffff" letter-spacing="1">TRIPLE CARACAS</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#facc15" letter-spacing="2">LEÓN</text>
</svg>
`);

// 16. TRIPLE CALIENTE (Rojo Fuego + Llama / Ají)
const LOGO_TRIPLE_CALIENTE = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="tca_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="65%" stop-color="#ea580c"/>
      <stop offset="100%" stop-color="#7c2d12"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#tca_grad)" stroke="#facc15" stroke-width="4"/>
  <!-- Llama de fuego -->
  <path d="M 60,20 Q 75,34 68,46 Q 80,42 78,56 C 74,64 46,64 42,56 Q 40,42 52,46 Q 45,34 60,20 Z" fill="#ef4444" stroke="#facc15" stroke-width="1.5"/>
  <path d="M 60,32 Q 68,40 64,48 C 62,54 54,54 52,48 Q 50,42 60,32 Z" fill="#facc15"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#7f1d1d" stroke="#facc15" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="9.5" font-weight="900" fill="#ffffff" letter-spacing="1">TRIPLE CALIENTE</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#facc15" letter-spacing="2">FUEGO</text>
</svg>
`);

// 17. TRIPLE FÁCIL (Verde + Trébol de la Suerte)
const LOGO_TRIPLE_FACIL = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="tf_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#4ade80"/>
      <stop offset="65%" stop-color="#16a34a"/>
      <stop offset="100%" stop-color="#052e16"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#tf_grad)" stroke="#ffffff" stroke-width="4"/>
  <!-- Trébol de 4 hojas -->
  <circle cx="52" cy="36" r="8" fill="#22c55e" stroke="#14532d" stroke-width="1"/>
  <circle cx="68" cy="36" r="8" fill="#22c55e" stroke="#14532d" stroke-width="1"/>
  <circle cx="52" cy="50" r="8" fill="#22c55e" stroke="#14532d" stroke-width="1"/>
  <circle cx="68" cy="50" r="8" fill="#22c55e" stroke="#14532d" stroke-width="1"/>
  <circle cx="60" cy="43" r="4" fill="#fef08a"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#14532d" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10.5" font-weight="900" fill="#ffffff" letter-spacing="1">TRIPLE FÁCIL</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#fef08a" letter-spacing="2">SUERTE</text>
</svg>
`);

// 18. TRÍO ACTIVO (Púrpura + 3 Estrellas)
const LOGO_TRIO_ACTIVO = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="to_grad" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="65%" stop-color="#9333ea"/>
      <stop offset="100%" stop-color="#3b0764"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#to_grad)" stroke="#facc15" stroke-width="4"/>
  <!-- 3 Estrellas Doradas -->
  <polygon points="60,22 62,28 68,28 63,32 65,38 60,34 55,38 57,32 52,28 58,28" fill="#facc15"/>
  <polygon points="44,38 46,43 51,43 47,46 49,51 44,48 40,51 42,46 38,43 43,43" fill="#facc15"/>
  <polygon points="76,38 78,43 83,43 79,46 81,51 76,48 72,51 74,46 70,43 75,43" fill="#facc15"/>
  <!-- Banner -->
  <rect x="6" y="65" width="108" height="23" rx="11.5" fill="#3b0764" stroke="#facc15" stroke-width="2"/>
  <text x="60" y="81" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="11" font-weight="900" fill="#ffffff" letter-spacing="1">TRÍO ACTIVO</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="10" font-weight="900" fill="#facc15" letter-spacing="2">RULETA</text>
</svg>
`);

export const OFFICIAL_GAME_LOGOS: Readonly<Record<string, string>> = {
  // Lotto Activo
  "lotto-activo": LOGO_LOTTO_ACTIVO,
  "7d21a00b-0dfa-4bdc-9edf-8115802df1d6": LOGO_LOTTO_ACTIVO,
  "lotto activo": LOGO_LOTTO_ACTIVO,

  // La Granjita
  granjita: LOGO_LA_GRANJITA,
  "la-granjita": LOGO_LA_GRANJITA,
  "la granjita": LOGO_LA_GRANJITA,
  "ca8a0400-0000-4000-8000-000000000006": LOGO_LA_GRANJITA,

  // Guácharo Activo
  guacharo: LOGO_GUACHARO_ACTIVO,
  "guacharo-activo": LOGO_GUACHARO_ACTIVO,
  "guacharo activo": LOGO_GUACHARO_ACTIVO,
  "guácharo activo": LOGO_GUACHARO_ACTIVO,
  "01da9c54-392a-45e3-ab66-9a08befe7694": LOGO_GUACHARO_ACTIVO,

  // El Guacharito Millonario
  guacharito: LOGO_GUACHARITO,
  "el-guacharito": LOGO_GUACHARITO,
  "el guacharito": LOGO_GUACHARITO,
  "el guacharito millonario": LOGO_GUACHARITO,
  "0519825d-e7ea-4e59-bf7d-cef2c832edd3": LOGO_GUACHARITO,

  // Selva Plus
  "selva-plus": LOGO_SELVA_PLUS,
  "selva plus": LOGO_SELVA_PLUS,
  "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e": LOGO_SELVA_PLUS,

  // Monje Millonario
  "monje-millonario": LOGO_MONJE_MILLONARIO,
  "monje millonario": LOGO_MONJE_MILLONARIO,
  "0f766e00-0000-4000-8000-000000000007": LOGO_MONJE_MILLONARIO,

  // Loto Chaima
  "loto-chaim-a": LOGO_LOTO_CHAIMA,
  "loto-chaima": LOGO_LOTO_CHAIMA,
  "loto chaima": LOGO_LOTO_CHAIMA,
  "1efc5373-a547-4f7f-9955-845b5ede5ce2": LOGO_LOTO_CHAIMA,

  // Lotto Activo RD
  "lotto-activo-internacional": LOGO_LOTTO_ACTIVO_RD,
  "lotto activo rd": LOGO_LOTTO_ACTIVO_RD,
  "lotto activo rd internacional": LOGO_LOTTO_ACTIVO_RD,
  "1e40af00-0000-4000-8000-000000000008": LOGO_LOTTO_ACTIVO_RD,

  // LotoAnimalito
  lotoanimalito: LOGO_LOTOANIMALITO,
  "loto animalito": LOGO_LOTOANIMALITO,
  "d953f80c-4335-4bc9-9f78-9b56193286fe": LOGO_LOTOANIMALITO,

  // LottoPantera
  lottopantera: LOGO_LOTTOPANTERA,
  "lotto pantera": LOGO_LOTTOPANTERA,
  "61580ccf-5a2d-4d10-877e-4883515135e4": LOGO_LOTTOPANTERA,

  // La Ricachona
  "la-ricachona": LOGO_LA_RICACHONA,
  "la ricachona": LOGO_LA_RICACHONA,
  "3b92f700-0000-4000-8000-000000000011": LOGO_LA_RICACHONA,

  // Triples
  "triple-zulia": LOGO_TRIPLE_ZULIA,
  "triple zulia": LOGO_TRIPLE_ZULIA,
  zulia: LOGO_TRIPLE_ZULIA,

  "triple-chance": LOGO_TRIPLE_CHANCE,
  "triple chance": LOGO_TRIPLE_CHANCE,
  chance: LOGO_TRIPLE_CHANCE,

  "triple-tachira": LOGO_TRIPLE_TACHIRA,
  "triple tachira": LOGO_TRIPLE_TACHIRA,
  tachira: LOGO_TRIPLE_TACHIRA,
  "loteria del tachira": LOGO_TRIPLE_TACHIRA,

  "triple-caracas": LOGO_TRIPLE_CARACAS,
  "triple caracas": LOGO_TRIPLE_CARACAS,
  caracas: LOGO_TRIPLE_CARACAS,

  "triple-caliente": LOGO_TRIPLE_CALIENTE,
  "triple caliente": LOGO_TRIPLE_CALIENTE,
  caliente: LOGO_TRIPLE_CALIENTE,

  "triple-facil": LOGO_TRIPLE_FACIL,
  "triple facil": LOGO_TRIPLE_FACIL,
  facil: LOGO_TRIPLE_FACIL,

  "trio-activo": LOGO_TRIO_ACTIVO,
  "trio activo": LOGO_TRIO_ACTIVO,
  trio: LOGO_TRIO_ACTIVO,
};

/**
 * Genera un emblema SVG dinámico para juegos personalizados creados por el administrador
 */
export function generateGenericGameLogo(name: string, color: string = "#3b82f6"): string {
  const safeName = (name || "JUEGO").toUpperCase();
  const shortName = safeName.slice(0, 14);
  const initials = safeName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("");

  return svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="gen_grad_${encodeURIComponent(safeName)}" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="#090d16"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#gen_grad_${encodeURIComponent(safeName)})" stroke="#ffffff" stroke-width="4"/>
  <circle cx="60" cy="42" r="18" fill="#ffffff" opacity="0.15"/>
  <text x="60" y="48" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="16" font-weight="900" fill="#ffffff">${initials || "★"}</text>
  <rect x="8" y="66" width="104" height="23" rx="11.5" fill="#0f172a" stroke="#ffffff" stroke-width="2"/>
  <text x="60" y="82" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="9" font-weight="900" fill="#ffffff" letter-spacing="1">${shortName}</text>
  <text x="60" y="103" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="9" font-weight="900" fill="${color}" letter-spacing="2">RULETA</text>
</svg>
`);
}

export const CUSTOM_GAME_LOGOS_STORAGE_KEY = "pizarra_custom_game_logos_v1";

const OFFICIAL_LOGO_VALUES = new Set<string>(Object.values(OFFICIAL_GAME_LOGOS));

let memoryCustomGameLogos: Record<string, string> = {};
let memoryLogosInitialized = false;

/**
 * Retorna true si la URL corresponde a uno de los logos vectoriales SVG por defecto del catálogo
 * (y por tanto NO es un logo personalizado subido por el usuario).
 */
export function isDefaultSvgGameLogo(url?: string | null): boolean {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (OFFICIAL_LOGO_VALUES.has(trimmed)) return true;
  if (
    trimmed.startsWith("data:image/svg+xml;utf8,") &&
    decodeURIComponent(trimmed).includes("gen_grad_")
  ) {
    return true;
  }
  return false;
}

/**
 * Retorna true únicamente si la URL es un logo personalizado subido por el administrador
 * (excluyendo URLs rotas de tuazar.com y los SVGs predeterminados del catálogo).
 */
export function isCustomUploadedGameLogo(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  if (isBrokenExternalLogo(url)) return false;
  if (isDefaultSvgGameLogo(url)) return false;
  return true;
}

/**
 * Carga y sincroniza el mapa de logos personalizados desde localStorage y pizarra_persisted_games.
 */
export function getCustomGameLogosMap(): Record<string, string> {
  if (typeof window === "undefined") {
    return memoryCustomGameLogos;
  }

  if (!memoryLogosInitialized) {
    memoryLogosInitialized = true;
    try {
      const raw = localStorage.getItem(CUSTOM_GAME_LOGOS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string" && isCustomUploadedGameLogo(v)) {
              memoryCustomGameLogos[k.trim().toLowerCase()] = v;
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // También recuperar cualquier logo personalizado que esté guardado en pizarra_persisted_games
    try {
      const savedGamesRaw = localStorage.getItem("pizarra_persisted_games");
      if (savedGamesRaw) {
        const savedGames = JSON.parse(savedGamesRaw);
        if (Array.isArray(savedGames)) {
          let addedAny = false;
          for (const g of savedGames) {
            if (g && isCustomUploadedGameLogo(g.logo_url)) {
              if (g.id) memoryCustomGameLogos[String(g.id).trim().toLowerCase()] = g.logo_url;
              if (g.slug) memoryCustomGameLogos[String(g.slug).trim().toLowerCase()] = g.logo_url;
              if (g.name) memoryCustomGameLogos[String(g.name).trim().toLowerCase()] = g.logo_url;
              addedAny = true;
            }
          }
          if (addedAny) {
            localStorage.setItem(
              CUSTOM_GAME_LOGOS_STORAGE_KEY,
              JSON.stringify(memoryCustomGameLogos),
            );
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return memoryCustomGameLogos;
}

/**
 * Guarda o elimina un logo personalizado subido por el usuario en memoria y localStorage.
 */
export function saveCustomGameLogo(
  game: { id?: string; slug?: string; name?: string },
  logoUrl: string | null,
): void {
  const map = getCustomGameLogosMap();
  const keys = [game.id, game.slug, game.name]
    .filter((k): k is string => Boolean(k && k.trim()))
    .map((k) => k.trim().toLowerCase());

  if (logoUrl && isCustomUploadedGameLogo(logoUrl)) {
    for (const k of keys) {
      map[k] = logoUrl;
    }
  } else {
    for (const k of keys) {
      delete map[k];
    }
  }

  memoryCustomGameLogos = { ...map };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CUSTOM_GAME_LOGOS_STORAGE_KEY, JSON.stringify(memoryCustomGameLogos));
    } catch {
      // ignore
    }
  }
}

/**
 * Combina logos personalizados recibidos del servidor sin perder los que ya existen localmente.
 */
export function mergeCustomGameLogosMap(
  incoming?: Record<string, string> | null,
): Record<string, string> {
  const map = getCustomGameLogosMap();
  if (!incoming || typeof incoming !== "object") return map;

  let changed = false;
  for (const [k, v] of Object.entries(incoming)) {
    const cleanKey = k.trim().toLowerCase();
    if (cleanKey && typeof v === "string" && isCustomUploadedGameLogo(v)) {
      if (map[cleanKey] !== v) {
        map[cleanKey] = v;
        changed = true;
      }
    }
  }

  if (changed) {
    memoryCustomGameLogos = { ...map };
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CUSTOM_GAME_LOGOS_STORAGE_KEY, JSON.stringify(memoryCustomGameLogos));
      } catch {
        // ignore
      }
    }
  }

  return memoryCustomGameLogos;
}

/**
 * Obtiene el logotipo garantizado para cualquier juego:
 * 1. Si existe un logo personalizado subido por el administrador en el mapa persistente o en el objeto, lo usa SIEMPRE.
 * 2. Si no tiene logo personalizado o es una URL rota, devuelve el logo oficial vectorial SVG incorporado.
 */
export function getGameLogo(
  gameOrSlugOrId?:
    | string
    | {
        id?: string;
        slug?: string;
        name?: string;
        logo_url?: string | null;
        color?: string | null;
      }
    | null,
  fallbackColor: string = "#3b82f6",
): string {
  if (!gameOrSlugOrId) return generateGenericGameLogo("Lotería", fallbackColor);

  let id = "";
  let slug = "";
  let name = "";
  let customLogo: string | null | undefined = null;
  let color = fallbackColor;

  if (typeof gameOrSlugOrId === "string") {
    id = gameOrSlugOrId;
    slug = gameOrSlugOrId.toLowerCase();
    name = gameOrSlugOrId;
  } else {
    id = gameOrSlugOrId.id ?? "";
    slug = (gameOrSlugOrId.slug ?? "").toLowerCase();
    name = gameOrSlugOrId.name ?? "";
    customLogo = gameOrSlugOrId.logo_url;
    color = gameOrSlugOrId.color ?? fallbackColor;
  }

  const cleanId = id.trim().toLowerCase();
  const cleanSlug = slug.trim().toLowerCase();
  const cleanName = name.trim().toLowerCase();

  // 1. Si el objeto trae directamente un logo personalizado subido por el usuario, lo registramos y devolvemos
  if (customLogo && isCustomUploadedGameLogo(customLogo)) {
    return customLogo;
  }

  // 2. Buscar en el almacén persistente de logos subidos por el usuario (por id, slug o nombre)
  const customMap = getCustomGameLogosMap();
  const persistedCustom =
    (cleanId ? customMap[cleanId] : undefined) ||
    (cleanSlug ? customMap[cleanSlug] : undefined) ||
    (cleanName ? customMap[cleanName] : undefined);
  if (persistedCustom && isCustomUploadedGameLogo(persistedCustom)) {
    return persistedCustom;
  }

  // 3. Si customLogo es válido (p. ej. SVG oficial ya asignado), usarlo
  if (customLogo && !isBrokenExternalLogo(customLogo)) {
    return customLogo;
  }

  // 4. Buscar en el catálogo oficial por id, slug o nombre normalizado
  const official =
    OFFICIAL_GAME_LOGOS[cleanSlug] ||
    OFFICIAL_GAME_LOGOS[cleanId] ||
    OFFICIAL_GAME_LOGOS[cleanName];

  if (official) return official;

  // Si el nombre contiene alguna de las palabras clave principales
  for (const [key, logo] of Object.entries(OFFICIAL_GAME_LOGOS)) {
    if (cleanName.includes(key) || cleanSlug.includes(key)) {
      return logo;
    }
  }

  return generateGenericGameLogo(name || slug || "Juego", color);
}

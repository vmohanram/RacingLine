export interface Track {
  id: string;
  name: string;
  country: string;
  description: string;
  lengthMeters: number; // Real length of the track
  scaleMetersPerPixel: number; // Scale factor for physics
  idealLapTime: number; // Realistic F1 lap time in seconds
  difficulty: "Easy" | "Medium" | "Hard";
  points: { x: number; y: number }[]; // 100 points defining centerline [0..500]
  turns: { name: string; index: number; radius: number; speedSuggestion: string }[];
}

// Generate smooth parametric curves for Monza, Silverstone, Monaco
// Helper to create circular segment
function makeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, steps: number = 10) {
  const pts = [];
  const diff = endAngle - startAngle;
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (diff * i) / steps;
    pts.push({
      x: cx + r * Math.cos(angle * Math.PI / 180),
      y: cy + r * Math.sin(angle * Math.PI / 180)
    });
  }
  return pts;
}

// Monza - Fast straight, heavy chicanes, sweeping Curva Grande, Lesmos, Ascari chicane, Parabolica
export const MONZA_TRACK: Track = {
  id: "monza",
  name: "Autodromo Nazionale Monza",
  country: "Italy 🇮🇹",
  description: "The 'Temple of Speed'. Features long straights punctuated by high-braking tight chicanes and legendary fast corners like Parabolica.",
  lengthMeters: 5793,
  scaleMetersPerPixel: 4.8, // 1 pixel ≈ 4.8m
  idealLapTime: 71.50, // Pole is ~1:20
  difficulty: "Easy",
  turns: [
    { name: "Variante del Rettifilo (T1-T2)", index: 15, radius: 12, speedSuggestion: "65-80 km/h (Gear 1-2)" },
    { name: "Curva Grande (T3)", index: 32, radius: 120, speedSuggestion: "270-300 km/h (Gear 7-8)" },
    { name: "Variante della Roggia (T4-T5)", index: 48, radius: 16, speedSuggestion: "90-110 km/h (Gear 2-3)" },
    { name: "Lesmo 1 & 2 (T6-T7)", index: 62, radius: 45, speedSuggestion: "160-180 km/h (Gear 4)" },
    { name: "Variante Ascari (T8-T10)", index: 82, radius: 35, speedSuggestion: "180-210 km/h (Gear 5)" },
    { name: "Curva Parabolica (T11)", index: 98, radius: 75, speedSuggestion: "220-250 km/h (Gear 6)" }
  ],
  points: [
    // Pit straight start
    { x: 100, y: 420 },
    { x: 150, y: 420 },
    { x: 200, y: 420 },
    { x: 250, y: 420 },
    { x: 300, y: 420 }, // Straightaway
    { x: 325, y: 420 }, 
    
    // Rettifilo Chicane
    { x: 345, y: 420 },
    { x: 355, y: 405 }, // T1 right
    { x: 355, y: 395 }, // T2 left
    { x: 345, y: 380 },
    
    // Curva Grande (sweeping right-hand turn)
    { x: 360, y: 340 },
    { x: 390, y: 300 },
    { x: 430, y: 250 },
    { x: 450, y: 190 },
    { x: 440, y: 140 },
    { x: 410, y: 100 },
    
    // Straight to Roggia
    { x: 360, y: 90 },
    { x: 320, y: 88 },
    { x: 280, y: 85 },
    
    // Roggia chicane (left-right-left)
    { x: 260, y: 85 },
    { x: 253, y: 100 }, // left
    { x: 247, y: 82 },  // right
    { x: 235, y: 75 },
    
    // Lesmo 1 (right)
    { x: 210, y: 70 },
    { x: 185, y: 85 },
    { x: 175, y: 110 },
    
    // short straight
    { x: 175, y: 140 },
    
    // Lesmo 2 (right)
    { x: 165, y: 165 },
    { x: 140, y: 185 },
    { x: 110, y: 190 },
    
    // Serraglio Straight down to Ascari
    { x: 80, y: 190 },
    { x: 60, y: 190 },
    { x: 50, y: 215 },
    { x: 50, y: 245 },
    { x: 50, y: 275 },
    { x: 50, y: 305 },
    
    // Ascari chicane (left, right, sweeping left exit)
    { x: 55, y: 330 }, // T8 left entry
    { x: 72, y: 342 }, // T9 right mid
    { x: 95, y: 338 }, // T10 exit
    { x: 125, y: 330 },
    
    // Straight down to Parabolica
    { x: 160, y: 330 },
    { x: 195, y: 330 },
    { x: 230, y: 330 },
    { x: 265, y: 330 },
    { x: 300, y: 330 },
    { x: 335, y: 330 },
    
    // Parabolica (long sweeping right hander back to start)
    { x: 360, y: 335 },
    { x: 385, y: 350 },
    { x: 395, y: 380 },
    { x: 385, y: 410 },
    { x: 350, y: 425 },
    { x: 300, y: 425 },
    { x: 250, y: 425 },
    { x: 200, y: 425 },
    { x: 150, y: 425 },
    { x: 100, y: 425 },
  ]
};

// Silverstone - Copse, Maggots, Becketts, Stowe, Club, Abbey
export const SILVERSTONE_TRACK: Track = {
  id: "silverstone",
  name: "Silverstone Circuit",
  country: "United Kingdom 🇬🇧",
  description: "The birthplace of Formula 1. Exceptionally fast, sweeping corners that test the aerodynamic downforce limits of F1 machinery.",
  lengthMeters: 5891,
  scaleMetersPerPixel: 4.5,
  idealLapTime: 84.00, // Pole ~1:27
  difficulty: "Hard",
  turns: [
    { name: "Abbey & Arena (T1-T3)", index: 12, radius: 45, speedSuggestion: "170-190 km/h (Gear 4-5)" },
    { name: "Luffield (T7)", index: 28, radius: 25, speedSuggestion: "100-115 km/h (Gear 2-3)" },
    { name: "Copse (T9)", index: 42, radius: 85, speedSuggestion: "240-270 km/h (Gear 6-7)" },
    { name: "Maggots & Becketts (T10-T13)", index: 58, radius: 30, speedSuggestion: "190-230 km/h (Gear 5-6)" },
    { name: "Stowe (T15)", index: 78, radius: 60, speedSuggestion: "190-210 km/h (Gear 5)" },
    { name: "Vale & Club (T16-T18)", index: 94, radius: 18, speedSuggestion: "80-110 km/h (Gear 2-3)" }
  ],
  points: [
    // Hamilton Straight (Start)
    { x: 120, y: 380 },
    { x: 170, y: 380 },
    { x: 220, y: 380 },
    
    // Turn 1 Abbey (fast right)
    { x: 255, y: 382 },
    { x: 285, y: 395 },
    { x: 305, y: 415 },
    
    // Turn 2 Farm (left sweep)
    { x: 310, y: 435 },
    { x: 290, y: 455 },
    { x: 260, y: 462 },
    
    // Turn 3 Village Loop (sharp right-left)
    { x: 225, y: 460 },
    { x: 210, y: 435 }, // right
    { x: 195, y: 420 }, 
    { x: 175, y: 435 }, // left
    { x: 165, y: 455 },
    
    // Wellington Straight
    { x: 155, y: 480 },
    { x: 130, y: 485 },
    { x: 100, y: 480 },
    { x: 75, y: 460 },
    
    // Brooklands & Luffield (hairpin-like double loop)
    { x: 52, y: 415 },
    { x: 55, y: 375 },
    { x: 75, y: 345 },
    { x: 105, y: 330 }, // Brooklands entry
    { x: 140, y: 325 },
    { x: 155, y: 300 }, // Mid Luffield
    { x: 140, y: 265 },
    { x: 110, y: 250 },
    { x: 75, y: 250 },  // Woodcote run-off
    
    // Woodcote & National Straight
    { x: 80, y: 215 },
    { x: 105, y: 175 },
    { x: 135, y: 140 },
    { x: 170, y: 110 },
    
    // Copse Corner (extremely fast right hand corner)
    { x: 210, y: 92 },
    { x: 245, y: 85 },
    { x: 280, y: 90 },
    { x: 305, y: 115 },
    
    // Maggots, Becketts & Chapel S-curves (classic high speed flow)
    { x: 330, y: 135 }, // Maggots left
    { x: 355, y: 145 }, // Maggots right
    { x: 375, y: 130 }, // Becketts left
    { x: 385, y: 105 }, // Becketts right
    { x: 395, y: 75 },  // Chapel left sweep
    { x: 420, y: 58 },
    { x: 450, y: 55 },
    
    // Hangar Straight
    { x: 455, y: 95 },
    { x: 440, y: 140 },
    { x: 415, y: 190 },
    { x: 385, y: 235 },
    { x: 355, y: 280 },
    
    // Stowe Corner (sweep right)
    { x: 315, y: 298 },
    { x: 280, y: 302 },
    { x: 250, y: 290 },
    { x: 228, y: 265 },
    
    // Vale Straight down to Club
    { x: 215, y: 230 },
    { x: 200, y: 190 },
    { x: 180, y: 160 },
    
    // Vale corner (extremely slow left, then Club right)
    { x: 155, y: 150 }, // Vale left
    { x: 142, y: 172 }, 
    { x: 148, y: 200 }, // Club right
    { x: 165, y: 235 },
    { x: 195, y: 270 },
    { x: 225, y: 300 },
    { x: 240, y: 330 },
    { x: 228, y: 355 },
    { x: 192, y: 372 },
    { x: 145, y: 378 },
    { x: 120, y: 380 }
  ]
};

// Monaco - The ultimate tight street circuit
export const MONACO_TRACK: Track = {
  id: "monaco",
  name: "Circuit de Monaco",
  country: "Monaco 🇲🇨",
  description: "The jewel of the crown. Extremely tight street circuit, demanding millimetric precision around zero-runoff walls, hairpins, and tunnels.",
  lengthMeters: 3337,
  scaleMetersPerPixel: 2.5,
  idealLapTime: 71.00, // Pole ~1:11
  difficulty: "Hard",
  turns: [
    { name: "Sainte Devote (T1)", index: 8, radius: 15, speedSuggestion: "85-95 km/h (Gear 2)" },
    { name: "Casino Square (T4)", index: 24, radius: 32, speedSuggestion: "135-155 km/h (Gear 3-4)" },
    { name: "Fairmont Hairpin (T6)", index: 40, radius: 5, speedSuggestion: "45-55 km/h (Gear 1 - full lock)" },
    { name: "The Tunnel (T9)", index: 55, radius: 100, speedSuggestion: "260-280 km/h (Gear 7-8)" },
    { name: "Nouvelle Chicane (T10-T11)", index: 68, radius: 12, speedSuggestion: "70-85 km/h (Gear 1-2)" },
    { name: "Swimming Pool / Piscine (T13-T16)", index: 82, radius: 24, speedSuggestion: "140-190 km/h (Gear 4-5)" },
    { name: "Rascasse (T18)", index: 95, radius: 8, speedSuggestion: "55-65 km/h (Gear 1)" }
  ],
  points: [
    // Pit Straight (Start)
    { x: 160, y: 420 },
    { x: 200, y: 420 },
    { x: 240, y: 420 },
    
    // Sainte Devote (Turn 1 right angle)
    { x: 275, y: 418 },
    { x: 295, y: 395 },
    { x: 290, y: 370 },
    
    // Beau Rivage climb
    { x: 270, y: 335 },
    { x: 245, y: 290 },
    { x: 220, y: 245 },
    
    // Massenet (Turn 3 long left sweep)
    { x: 198, y: 215 },
    { x: 185, y: 180 },
    { x: 185, y: 145 },
    { x: 202, y: 115 },
    
    // Casino Square (Turn 4 sharp right)
    { x: 225, y: 100 },
    { x: 250, y: 102 },
    { x: 268, y: 118 },
    
    // Mirabeau Haute (Turn 5 right)
    { x: 280, y: 145 },
    { x: 290, y: 172 },
    { x: 282, y: 195 },
    
    // Fairmont Hairpin (Turn 6 hairpin left - the slowest corner in F1!)
    { x: 260, y: 200 },
    { x: 248, y: 188 }, // acute turn point
    { x: 254, y: 176 },
    { x: 272, y: 180 },
    
    // Mirabeau Bas & Portier
    { x: 292, y: 190 },
    { x: 315, y: 210 },
    { x: 335, y: 228 }, // T7 Portier entry
    { x: 355, y: 242 },
    { x: 370, y: 225 }, // T8 Portier exit onto beach
    { x: 360, y: 195 },
    
    // The Tunnel
    { x: 335, y: 155 },
    { x: 305, y: 115 },
    { x: 280, y: 80 },
    { x: 252, y: 55 },
    
    // Chicane approach
    { x: 215, y: 42 },
    { x: 175, y: 42 },
    
    // Nouvelle Chicane (T10-T11 left-right-left)
    { x: 142, y: 43 },
    { x: 125, y: 62 },  // chicane entrance left
    { x: 125, y: 82 },  // right
    { x: 135, y: 105 }, // chicane exit left
    
    // Tabac
    { x: 142, y: 135 },
    { x: 138, y: 170 },
    { x: 125, y: 205 },
    
    // Piscine (Swimming Pool chicane fast left-right)
    { x: 105, y: 232 },
    { x: 92, y: 260 },  // Piscine 1 left
    { x: 95, y: 290 },  // Piscine 2 right
    { x: 110, y: 315 },
    
    // Swimming Pool exit (left-right)
    { x: 125, y: 335 },
    { x: 122, y: 358 },
    
    // Rascasse (tight slow right)
    { x: 110, y: 375 },
    { x: 98, y: 395 },  // Apex Rascasse
    { x: 108, y: 412 },
    
    // Anthony Noghes (right hook to pit straight)
    { x: 130, y: 420 },
    { x: 160, y: 420 }
  ]
};

export const TRACKS: Record<string, Track> = {
  monza: MONZA_TRACK,
  silverstone: SILVERSTONE_TRACK,
  monaco: MONACO_TRACK
};

// Generates reference lines showing "the ideal racing line" beautifully on the map
export function getIdealRacingLineOffset(trackId: string, ptIndex: number): number {
  // Return the lateral offset from centerline [-15..15] pixels representing the optimal line.
  // F1 drivers use "out-in-out" strategy: they go to the outside of the track before the turn,
  // clip the inside apex of the turn, and wash out to the outside edge on corner exit.
  
  if (trackId === "monza") {
    // 15: Rettifilo Chicane: enter left (offset -10), apex right (+10), exit left (-10)
    if (ptIndex >= 5 && ptIndex <= 10) {
      if (ptIndex <= 7) return -10;
      if (ptIndex === 8) return 10;
      return -8;
    }
    // 32: Curva Grande sweeping right: hug the inside (offset right +12)
    if (ptIndex >= 28 && ptIndex <= 36) return 12;
    // 48: Roggia chicane
    if (ptIndex >= 44 && ptIndex <= 52) {
      if (ptIndex <= 46) return -10;
      if (ptIndex === 48) return 10;
      return -8;
    }
    // 62: Lesmos (right turns): hug inside (+10)
    if (ptIndex >= 58 && ptIndex <= 66) return 11;
    // 82: Ascari: fast left-right-left
    if (ptIndex >= 78 && ptIndex <= 86) {
      const idx = ptIndex - 78;
      const wave = [-10, -5, 11, 4, -12, -4, 4, 8, 0];
      return wave[idx] || 0;
    }
    // 98: Parabolica: enter outside (-12), late apex inside (+11), exit wide outside (-12)
    if (ptIndex >= 90 && ptIndex <= 105) {
      if (ptIndex <= 94) return -12;
      if (ptIndex >= 97 && ptIndex <= 100) return 11; // Apex inside
      return -13; // Exit wide
    }
  }

  if (trackId === "silverstone") {
    // Copse Copse (T9) around index 42 (right fast corner): enter far left (-12), apex inside (+11), exit far left (-12)
    if (ptIndex >= 38 && ptIndex <= 46) {
      if (ptIndex <= 40) return -12;
      if (ptIndex === 42) return 11;
      return -12;
    }
    // Maggots/Becketts S-curves (index 54 to 64): dramatic oscillations
    if (ptIndex >= 52 && ptIndex <= 68) {
      const phase = (ptIndex - 52) / 16;
      return Math.sin(phase * Math.PI * 3.5) * 11;
    }
    // Stowe (right, T15, index 78)
    if (ptIndex >= 74 && ptIndex <= 82) {
      if (ptIndex <= 76) return -12;
      if (ptIndex === 78) return 11;
      return -12;
    }
    // Club (right, T18, index 94)
    if (ptIndex >= 90 && ptIndex <= 98) {
      if (ptIndex <= 92) return -12;
      if (ptIndex === 94) return 11;
      return -12;
    }
  }

  if (trackId === "monaco") {
    // Fairmont Hairpin index 40 (crucia slow left): enter outside (+12), super tight inside apex (-14), drift outside (+10)
    if (ptIndex >= 36 && ptIndex <= 44) {
      if (ptIndex <= 38) return 12;
      if (ptIndex >= 39 && ptIndex <= 41) return -14;
      return 10;
    }
    // Sainte Devote index 8 (right, sharp): enter left (-12), apex right (+11), exit left (-12)
    if (ptIndex >= 4 && ptIndex <= 12) {
      if (ptIndex <= 6) return -12;
      if (ptIndex === 8) return 11;
      return -12;
    }
    // Tunnel index 55 (sweeping right): hold inside apex (+10)
    if (ptIndex >= 50 && ptIndex <= 60) {
      return 10;
    }
    // Swimming Pool index 82 (Piscine chicane): quick left-right
    if (ptIndex >= 78 && ptIndex <= 86) {
      const idx = ptIndex - 78;
      const wave = [-10, -12, 11, 10, -12, -10, 0, 0];
      return wave[idx] || 0;
    }
  }

  // Fallback: smooth sinusoidal waves to represent out-in-out corners
  return Math.sin(ptIndex / 5) * 6;
}

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number.parseInt(process.env.PORT || "8081", 10);

// Set up server-side storage for the leaderboard
const LEADERBOARD_FILE = path.join(process.cwd(), "leaderboard.json");

// Default seed data for the leaderboard to make it feel alive and professional
const DEFAULT_LEADERBOARD = [
  { id: "seed-1", name: "Max V.", track: "monza", lapTime: 71.85, avgSpeed: 290.3, maxG: 4.85, date: "2026-06-08" },
  { id: "seed-2", name: "Lewis H.", track: "silverstone", lapTime: 84.32, avgSpeed: 251.4, maxG: 5.12, date: "2026-06-07" },
  { id: "seed-3", name: "Charles L.", track: "monaco", lapTime: 70.98, avgSpeed: 168.9, maxG: 3.92, date: "2026-06-09" },
  { id: "seed-4", name: "Ayrton S.", track: "monaco", lapTime: 71.45, avgSpeed: 167.8, maxG: 3.85, date: "1992-05-31" },
  { id: "seed-5", name: "Lando N.", track: "silverstone", lapTime: 85.12, avgSpeed: 249.1, maxG: 4.95, date: "2026-06-08" },
  { id: "seed-6", name: "Oscar P.", track: "monza", lapTime: 72.48, avgSpeed: 287.8, maxG: 4.78, date: "2026-06-08" }
];

function getLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const content = fs.readFileSync(LEADERBOARD_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Error reading leaderboard file:", e);
  }
  return DEFAULT_LEADERBOARD;
}

function saveLeaderboard(data: any[]) {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing leaderboard file:", e);
  }
}

// Increase limits for processing high-res images from camera/upload
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// --- API ROUTES ---

// 1. Get entire leaderboard
app.get("/api/leaderboard", (req, res) => {
  const list = getLeaderboard();
  res.json(list);
});

// 2. Post new entry to leaderboard
app.post("/api/leaderboard", (req, res) => {
  const { name, track, lapTime, avgSpeed, maxG } = req.body;
  if (!name || !track || !lapTime) {
    return res.status(400).json({ error: "Missing required fields: name, track, lapTime." });
  }

  const list = getLeaderboard();
  const newEntry = {
    id: `entry-${Date.now()}`,
    name: name.substring(0, 20),
    track,
    lapTime: parseFloat(lapTime),
    avgSpeed: parseFloat(avgSpeed || 0),
    maxG: parseFloat(maxG || 0),
    date: new Date().toISOString().split("T")[0]
  };

  list.push(newEntry);
  // Sort by lapTime ascending
  list.sort((a, b) => a.lapTime - b.lapTime);
  saveLeaderboard(list);

  res.json({ success: true, entry: newEntry, fullList: list });
});

// Helper function to synthesize beautiful, authentic, circuit-specific fallback coaching when Google Gemini services are busy (e.g. 503 high demand)
function generateLocalBackupCoaching(trackId: string, userMetrics: any): string {
  const trackName = trackId === "monza" ? "Autodromo Nazionale Monza" :
                    trackId === "silverstone" ? "Silverstone Circuit" :
                    trackId === "monaco" ? "Circuit de Monaco" : trackId.toUpperCase();

  const sectorComments = {
    monza: {
      direct: "Box, box... Let's review the telemetry. Curva Grande speed was phenomenal, but we dropped time on the brakes entering the Variante del Rettifilo.",
      sectors: `
### Variante del Rettifilo
- **Lateral Deviation**: ${userMetrics.averageDeviation.toFixed(1)} px.
- **Apex Alignment**: Your entry angle was slightly narrow. To conquer this tight right-left chicane, assure you brake late in a straight line, clip the first inner curb, and wait to throttle up until the car is fully rotated for the second apex.

### Curva Grande & Roggia Chicane
- **Corner Speed**: Carrying ${userMetrics.avgSpeed.toFixed(0)} km/h average speed.
- **Traction Circle**: Excellent commitment sweeping into Curva Grande, showing high lateral limits. However, in the Roggia chicane, the telemetry indicates you were eager on the accelerator, leading to slight wheelspin and rear-end snap. Keep your inputs progressive.

### Lesmo 1 & 2 & Parabolica
- **Apex Radius**: Entering the Lesmos, you held a tight line. Maximize the entry width on the left to carry higher minimum speed (V-min). Through Parabolica (Alboreto), trail brake deep into the entry, clip the late apex, and allow the car to wash out to the edge of the asphalt to maximize straight-line speed down the main straight.
`
    },
    silverstone: {
      direct: "Solid effort on the Copse-Maggotts-Becketts sequence! Minimal lateral drift, though we can still carry more V-min through the Stowe entry.",
      sectors: `
### Copse & Maggotts-Becketts
- **Lateral Deviation**: ${userMetrics.averageDeviation.toFixed(1)} px.
- **Apex Alignment**: Copse demands absolute precision and a quick lift-and-turn. Your telemetry here matches the ideal line beautifully. Through Maggotts and Becketts, the rapid direction transitions look well-balanced, but keep the nose tight to the inner curbs to shorten the distance.

### Stowe Corner & Vale Chicane
- **Corner Speed**: Carrying ${userMetrics.avgSpeed.toFixed(0)} km/h average.
- **Traction Circle**: Into Stowe, you decelerated a fraction too early, under-utilizing your traction circle. Trust the downforce! At the Vale chicane, prepare a wide, late apex on turn-in to secure a clean launch down the Club straight.

### Brooklands & Luffield Out-In-Out
- **Apex Radius**: Luffield is a long, teasing corner where traction limits are key. You held the inside nicely, but a wider mid-corner radius would allow you to apply 100% throttle sooner without washing wide into the gravel.
`
    },
    monaco: {
      direct: "No margin for error between the barriers here. A very tidy run around Belle Epoque and Fairmont, but there's time to be gained in Swimming Pool.",
      sectors: `
### Sainte Devote & Casino Square
- **Lateral Deviation**: ${userMetrics.averageDeviation.toFixed(1)} px.
- **Apex Alignment**: Sainte Devote was highly controlled. Through Massenet and into Casino Square, you held an aggressive posture, keeping the car close to the barriers. Watch out for the famous Casino bump which can break traction if your line is too wide.

### Grand Hotel Hairpin (Fairmont) & Portier
- **Corner Speed**: Slow cornering speeds of ${userMetrics.avgSpeed.toFixed(0)} km/h average, which is normal for Monaco.
- **Traction Circle**: Fairmont is the slowest corner on the calendar—requires maximum lock. You kept a decent apex radius. Through Portier, ensure you get a clean exit as it determines your speed through the Tunnel down to the Chicane.

### Tabac & Swimming Pool (Chicane Louis Chiron)
- **Apex Radius**: In the high-speed Swimming Pool section, you need to brush the curbs with precision. Telemetry indicates brief lateral slides. Keep the steering steady, let the car float over the curbs, and focus on immediate throttle application.
`
    }
  };

  const activeComments = sectorComments[trackId as keyof typeof sectorComments] || {
    direct: `Good track coverage on the ${trackName} circuit! Telemetry shows clean path execution.`,
    sectors: `
### Curvature & Apex Analysis
- **Lateral Deviation**: ${userMetrics.averageDeviation.toFixed(1)} px.
- **Apex Alignment**: Ensure a wide entry angle prior to turn-in to maximize the cornering radius and conserve horizontal velocity.
`
  };

  const ratingComment = userMetrics.lapTime < userMetrics.idealLapTime * 1.15
    ? "🏆 **Elite Class Driver**: You are pushing the absolute limits of the vehicle dynamics. Minimum distance variance and optimal slip angles!"
    : userMetrics.lapTime < userMetrics.idealLapTime * 1.35
    ? "🏁 **Highly Competitive Pace**: Consistent corner entries and solid throttle applications. Shave a few margins to enter the elite tier."
    : "⚠️ **Sub-optimal Line & Apex Losses**: Carrying too much speed into tight corners causing wide exit understeer. Brake earlier, rotate faster, and lock the power down earlier.";

  return `
## Verdict
${ratingComment.replace(/^[^*]*\*\*|\*\*.*$/g, "").trim() || activeComments.direct}

## Biggest Time Loss
You are giving away time with line shape and corner entry discipline rather than raw commitment.

## Speed Signal
Average speed is ${userMetrics.avgSpeed.toFixed(1)} km/h with ${userMetrics.maxG.toFixed(2)}G peak load across the lap.

## Next Lap
Brake in a straighter phase, open the radius sooner, and delay full throttle until the car is fully rotated.
`;
}

// 3. Gemini Coaching & Analysis Integration
app.post("/api/analyze-racing-line", async (req, res) => {
  const { trackId, driverName, userMetrics, userPoseData, base64Image } = req.body;
  const targetIdealTime = userMetrics.idealLapTime || 70.0;
  const addressedDriver = typeof driverName === "string" && driverName.trim() ? driverName.trim() : "Racer";
  let score = Math.round(90 - (userMetrics.lapTime - targetIdealTime) * 2.5);
  score = Math.min(100, Math.max(20, score));

  try {
    // Lazy-initialize Gemini client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        coaching: `## Verdict
${addressedDriver}, local telemetry mode is active and the lap has been analysed without Gemini.

## Biggest Time Loss
The main loss is still line efficiency through the highest-demand corners.

## Speed Signal
Average speed is ${userMetrics.avgSpeed.toFixed(1)} km/h with ${userMetrics.maxG.toFixed(2)}G peak load.

## Next Lap
${addressedDriver}, widen the entry, slow the release, and commit to power once the car is straight.`,
        score: score
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // We can bundle information about track and calculated metrics
    const prompt = `
      You are an expert F1 Race Engineer (think of a legendary coach like Peter Bonnington "Bono" or Gianpiero Lambiase "GP").
      You are analyzing a driver who uploaded a picture of a paper F1 track with their custom hand-drawn black ink racing line.
      
      Track: ${trackId.toUpperCase()}
      
      Calculated Physics Telemetry for this Run:
      - Driver Lap Time: ${userMetrics.lapTime.toFixed(2)} seconds
      - Ideal Reference Lap Time: ${targetIdealTime.toFixed(2)} seconds
      - Average Speed: ${userMetrics.avgSpeed.toFixed(1)} km/h
      - Max Lateral G-Force: ${userMetrics.maxG.toFixed(2)} Gs
      - Throttle/Braking Ratio: ${userMetrics.throttleRatio.toFixed(0)}% acceleration, ${(100 - userMetrics.throttleRatio).toFixed(0)}% decel/braking
      - Average Deviation from Ideal Geometric Line: ${userMetrics.averageDeviation.toFixed(1)} pixels (lower is more mathematically optimal)

      Please provide a concise, highly readable engineer brief.
      Address the driver directly as "${addressedDriver}". Use authentic racing terminology (clip the apex, carry speed, trail braking, understeer, oversteer, early vs late apex, traction limit, traction circle).

      Return exactly this Markdown structure and keep it tight:
      ## Verdict
      - One short sentence only, max 14 words.

      ## Biggest Time Loss
      - One sentence only.
      - Explain the biggest lap-time loss in plain racing language.

      ## Speed Signal
      - One sentence only.
      - Mention the most relevant telemetry signal.

      ## Next Lap
      - One sentence only.
      - Make it a direct coaching instruction.

      Do not include bullets, sector-by-sector breakdowns, long telemetry summaries, code fences, tables, or extra headings. Keep the tone professional, direct, and easy to scan.
    `;

    let response;
    
    if (base64Image) {
      // Send both image and structured text to the model
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Data
            }
          },
          {
            text: prompt
          }
        ],
        config: {
          systemInstruction: "You are an elite Formula 1 track coach and telemetry analyst specializing in racing line theory and dynamic friction limits."
        }
      });
    } else {
      // Text-only fallback if image transmission is bypassed
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an elite Formula 1 track coach."
        }
      });
    }

    const feedbackText = response.text || "Unsatisfactory connection with base telemetry engine.";
    
    res.json({
      coaching: feedbackText,
      score: score
    });

  } catch (error: any) {
    console.warn("F1 Vision: Dynamic fallback activated due to API demand limit:", error.message || error);
    // Safe output fallback instead of failure
    const backupText = generateLocalBackupCoaching(trackId, userMetrics);
    res.json({
      coaching: backupText,
      score: score
    });
  }
});

// --- INTEGRATE VITE FOR DEV VS PRODUCTION ---
async function start() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`F1 Vision Server running on http://localhost:${PORT}`);
  });
}

start();

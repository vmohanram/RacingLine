import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

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

// 3. Gemini Coaching & Analysis Integration
app.post("/api/analyze-racing-line", async (req, res) => {
  try {
    const { trackId, userMetrics, userPoseData, base64Image } = req.body;
    
    // Lazy-initialize Gemini client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        coaching: "📋 **F1 Telemetry System Notice:** No `GEMINI_API_KEY` was found in execution environment variables. I will serve as your digital co-driver with local telemetry heuristics!\n\n**Local Analysis Summary:**\n- Your driving line on the " + trackId.toUpperCase() + " circuit was analysed utilizing standard Newtonian physics modeling.\n- Lap Time: " + userMetrics.lapTime.toFixed(2) + " seconds.\n- Average Velocity: " + userMetrics.avgSpeed.toFixed(1) + " km/h.\n- Peak Lateral Loading: " + userMetrics.maxG.toFixed(2) + " Gs.\n\n*Pro Tip: Add your official Google Gemini API key to the Secrets menu in the AI Studio Settings for live expert race engineer commentary.*",
        score: Math.min(100, Math.max(10, Math.round(85 - (userMetrics.lapTime - userMetrics.idealLapTime) * 3)))
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
      - Ideal Reference Lap Time: ${userMetrics.idealLapTime.toFixed(2)} seconds
      - Average Speed: ${userMetrics.avgSpeed.toFixed(1)} km/h
      - Max Lateral G-Force: ${userMetrics.maxG.toFixed(2)} Gs
      - Throttle/Braking Ratio: ${userMetrics.throttleRatio.toFixed(0)}% acceleration, ${(100 - userMetrics.throttleRatio).toFixed(0)}% decel/braking
      - Average Deviation from Ideal Geometric Line: ${userMetrics.averageDeviation.toFixed(1)} pixels (lower is more mathematically optimal)

      Please provide an insightful, highly engaging, and technical analysis of the driver's run.
      Address the driver directly as "Racer". Use authentic racing terminology (clip the apex, carry speed, trail braking, understeer, oversteer, early vs late apex, traction limit, traction circle).
      
      Divide your review into:
      1. **Race Engineer's Direct Verdict**: A short, snappy quote summarizing the effort (e.g. "We have the pace! That was a clean run, but we are losing precious tenths at the hairpin...").
      2. **Sector Analysis**:
         - How they handled high speed corners vs slow corners on this specific track (${trackId}). Refer to real turn locations on ${trackId} if possible (e.g., Monza's Ascari/Parabolica, Silverstone's Copse/Becketts, Monaco's Fairmont Hairpin/Rascasse).
         - Rate their line geometry: did they take wide entries to maximize apex radius?
      3. **Telemetry & Speed Insights**: Explain why their physics metrics look the way they do based on the numbers.
      4. **Key Recommendations for Next Lap**: 2-3 specific, actionable advice to shave off lap time.

      Keep the tone highly professional, direct, encouraging, but realistic. Format your response cleanly in Markdown.
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
    
    // Calculate a standard score of quality out of 100 based on standard physics calculation and deviation
    let score = Math.round(90 - (userMetrics.lapTime - userMetrics.idealLapTime) * 2.5);
    score = Math.min(100, Math.max(20, score));

    res.json({
      coaching: feedbackText,
      score: score
    });

  } catch (error: any) {
    console.error("Error analyzing racing line with Gemini:", error);
    res.status(500).json({ error: error.message || "Failed to analyze racing line." });
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

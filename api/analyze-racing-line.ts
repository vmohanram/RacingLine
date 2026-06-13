import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

type ApiRequest = {
  method?: string;
  body?: any;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

function generateLocalBackupCoaching(trackId: string, userMetrics: any, addressedDriver: string) {
  const safeAvgSpeed = Number(userMetrics?.avgSpeed ?? 0);
  const safeMaxG = Number(userMetrics?.maxG ?? 0);

  return `## Verdict
${addressedDriver}, local telemetry mode is active and the lap has been analysed without Gemini.

## Biggest Time Loss
The main loss is still line efficiency through the highest-demand corners.

## Speed Signal
Average speed is ${safeAvgSpeed.toFixed(1)} km/h with ${safeMaxG.toFixed(2)}G peak load.

## Next Lap
${addressedDriver}, widen the entry, slow the release, and commit to power once the car is straight.`;
}

function getScore(userMetrics: any) {
  const targetIdealTime = Number(userMetrics?.idealLapTime ?? 70);
  const lapTime = Number(userMetrics?.lapTime ?? targetIdealTime);
  let score = Math.round(90 - (lapTime - targetIdealTime) * 2.5);
  score = Math.min(100, Math.max(20, score));
  return { score, targetIdealTime };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function uploadImageIfPresent(
  supabase: ReturnType<typeof getSupabase>,
  bucket: string,
  base64Image: string | null | undefined,
  trackId: string,
  driverName: string
) {
  if (!base64Image) {
    return null;
  }

  const match = base64Image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid base64 image payload.");
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const extension = mimeType.split("/")[1] || "png";
  const buffer = Buffer.from(base64Data, "base64");
  const safeDriver = driverName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "racer";
  const filePath = `${trackId}/${Date.now()}-${safeDriver}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { trackId, driverName, userMetrics, base64Image } = req.body ?? {};
  if (!trackId || !userMetrics || userMetrics.lapTime == null) {
    return res.status(400).json({ error: "Missing required fields: trackId, userMetrics.lapTime." });
  }

  const addressedDriver =
    typeof driverName === "string" && driverName.trim() ? driverName.trim().slice(0, 40) : "Racer";

  const { score, targetIdealTime } = getScore(userMetrics);

  let coaching = "";
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      coaching = generateLocalBackupCoaching(trackId, userMetrics, addressedDriver);
    } else {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "racingline-vercel"
          }
        }
      });

      const prompt = `
You are an expert F1 Race Engineer.
You are analyzing a driver who uploaded a picture of a paper F1 track with their custom hand-drawn racing line.

Track: ${String(trackId).toUpperCase()}

Calculated Physics Telemetry for this Run:
- Driver Lap Time: ${Number(userMetrics.lapTime).toFixed(2)} seconds
- Ideal Reference Lap Time: ${targetIdealTime.toFixed(2)} seconds
- Average Speed: ${Number(userMetrics.avgSpeed ?? 0).toFixed(1)} km/h
- Max Speed: ${Number(userMetrics.maxSpeed ?? 0).toFixed(1)} km/h
- Max Lateral G-Force: ${Number(userMetrics.maxG ?? 0).toFixed(2)} Gs
- Throttle/Braking Ratio: ${Number(userMetrics.throttleRatio ?? 0).toFixed(0)}% acceleration, ${(100 - Number(userMetrics.throttleRatio ?? 0)).toFixed(0)}% decel/braking
- Braking Points Count: ${Number(userMetrics.brakingPointsCount ?? 0)}
- Average Deviation from Ideal Geometric Line: ${Number(userMetrics.averageDeviation ?? 0).toFixed(1)} pixels

Address the driver directly as "${addressedDriver}".
Use authentic racing terminology.

Return exactly this Markdown structure and keep it tight:
## Verdict
One short sentence only, max 14 words.

## Biggest Time Loss
One sentence only.

## Speed Signal
One sentence only.

## Next Lap
One sentence only.

Do not include bullets, tables, extra headings, or long breakdowns.
`.trim();

      let response;
      if (base64Image) {
        const match = base64Image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!match) {
          throw new Error("Invalid base64 image payload.");
        }

        response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              inlineData: {
                mimeType: match[1],
                data: match[2]
              }
            },
            { text: prompt }
          ],
          config: {
            systemInstruction:
              "You are an elite Formula 1 track coach and telemetry analyst specializing in racing line theory and dynamic friction limits."
          }
        });
      } else {
        response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: "You are an elite Formula 1 track coach."
          }
        });
      }

      coaching = response.text || generateLocalBackupCoaching(trackId, userMetrics, addressedDriver);
    }
  } catch (error) {
    console.warn("Gemini fallback activated:", error);
    coaching = generateLocalBackupCoaching(trackId, userMetrics, addressedDriver);
  }

  try {
    const supabase = getSupabase();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "racing-line-uploads";

    const sourceImageUrl = await uploadImageIfPresent(
      supabase,
      bucket,
      base64Image,
      String(trackId),
      addressedDriver
    );

    const insertPayload = {
      driver_name: addressedDriver,
      track_id: String(trackId),
      lap_time: Number(userMetrics.lapTime),
      avg_speed: Number(userMetrics.avgSpeed ?? 0),
      max_speed: Number(userMetrics.maxSpeed ?? 0),
      max_g: Number(userMetrics.maxG ?? 0),
      throttle_ratio: Number(userMetrics.throttleRatio ?? 0),
      braking_points_count: Number(userMetrics.brakingPointsCount ?? 0),
      average_deviation: Number(userMetrics.averageDeviation ?? 0),
      ideal_lap_time: Number(userMetrics.idealLapTime ?? 70),
      summary_points: Array.isArray(userMetrics.points) ? userMetrics.points : [],
      coaching_text: coaching,
      source_image_url: sourceImageUrl
    };

    const { data, error } = await supabase
      .from("lap_runs")
      .insert(insertPayload)
      .select("id, source_image_url")
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      coaching,
      score,
      runId: data.id,
      imageUrl: data.source_image_url
    });
  } catch (error) {
    console.error("Failed to persist lap run:", error);
    return res.status(200).json({
      coaching,
      score,
      warning: "Lap analysed, but persistence failed."
    });
  }
}
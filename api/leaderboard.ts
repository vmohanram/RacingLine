import { createClient } from "@supabase/supabase-js";

type ApiRequest = {
  method?: string;
  body?: any;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

const DEFAULT_LEADERBOARD = [
  { id: "seed-1", name: "Max V.", track: "monza", lapTime: 71.85, avgSpeed: 290.3, maxG: 4.85, date: "2026-06-08" },
  { id: "seed-2", name: "Lewis H.", track: "silverstone", lapTime: 84.32, avgSpeed: 251.4, maxG: 5.12, date: "2026-06-07" },
  { id: "seed-3", name: "Charles L.", track: "monaco", lapTime: 70.98, avgSpeed: 168.9, maxG: 3.92, date: "2026-06-09" },
  { id: "seed-4", name: "Ayrton S.", track: "monaco", lapTime: 71.45, avgSpeed: 167.8, maxG: 3.85, date: "1992-05-31" },
  { id: "seed-5", name: "Lando N.", track: "silverstone", lapTime: 85.12, avgSpeed: 249.1, maxG: 4.95, date: "2026-06-08" },
  { id: "seed-6", name: "Oscar P.", track: "monza", lapTime: 72.48, avgSpeed: 287.8, maxG: 4.78, date: "2026-06-08" }
];

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

function mapRun(row: any) {
  return {
    id: row.id,
    name: row.driver_name,
    track: row.track_id,
    lapTime: Number(row.lap_time),
    avgSpeed: Number(row.avg_speed),
    maxG: Number(row.max_g),
    date: String(row.created_at).slice(0, 10)
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Content-Type", "application/json");

  try {
    const supabase = getSupabase();

    if (req.method === "GET") {
      const trackFilter = typeof req.query?.track === "string" ? req.query.track : undefined;

      let query = supabase
        .from("lap_runs")
        .select("id, driver_name, track_id, lap_time, avg_speed, max_g, created_at")
        .order("lap_time", { ascending: true })
        .limit(100);

      if (trackFilter) {
        query = query.eq("track_id", trackFilter);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      const leaderboard = (data ?? []).map(mapRun);
      return res.status(200).json(leaderboard.length ? leaderboard : DEFAULT_LEADERBOARD);
    }

    if (req.method === "POST") {
      const { name, track, lapTime, avgSpeed, maxG } = req.body ?? {};
      if (!name || !track || lapTime == null) {
        return res.status(400).json({ error: "Missing required fields: name, track, lapTime." });
      }

      const parsedLapTime = Number(lapTime);
      const parsedAvgSpeed = Number(avgSpeed ?? 0);
      const parsedMaxG = Number(maxG ?? 0);

      const { data: existing } = await supabase
        .from("lap_runs")
        .select("id, driver_name, track_id, lap_time, avg_speed, max_g, created_at")
        .eq("driver_name", String(name).trim().slice(0, 40))
        .eq("track_id", String(track))
        .eq("lap_time", parsedLapTime)
        .order("created_at", { ascending: false })
        .limit(1);

      let entryRow = existing?.[0];

      if (!entryRow) {
        const { data: inserted, error: insertError } = await supabase
          .from("lap_runs")
          .insert({
            driver_name: String(name).trim().slice(0, 40),
            track_id: String(track),
            lap_time: parsedLapTime,
            avg_speed: parsedAvgSpeed,
            max_speed: parsedAvgSpeed,
            max_g: parsedMaxG,
            throttle_ratio: 0,
            braking_points_count: 0,
            average_deviation: 0,
            ideal_lap_time: parsedLapTime,
            summary_points: [],
            coaching_text: null,
            source_image_url: null
          })
          .select("id, driver_name, track_id, lap_time, avg_speed, max_g, created_at")
          .single();

        if (insertError) {
          throw insertError;
        }

        entryRow = inserted;
      }

      const { data: leaderboardRows, error: leaderboardError } = await supabase
        .from("lap_runs")
        .select("id, driver_name, track_id, lap_time, avg_speed, max_g, created_at")
        .order("lap_time", { ascending: true })
        .limit(100);

      if (leaderboardError) {
        throw leaderboardError;
      }

      const entry = mapRun(entryRow);
      const fullList = (leaderboardRows ?? []).map(mapRun);

      return res.status(200).json({
        success: true,
        entry,
        fullList
      });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("Leaderboard API error:", error);

    if (req.method === "GET") {
      return res.status(200).json(DEFAULT_LEADERBOARD);
    }

    return res.status(500).json({ error: "Leaderboard persistence failed." });
  }
}
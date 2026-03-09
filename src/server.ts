import path from "path";
import express, { Request, Response } from "express";
import { fetchRestaurants } from "./scraper.js";

const app = express();
const PORT = process.env.PORT ?? 7751;

// Serve static frontend files
app.use(express.static(path.join(import.meta.dirname, "..", "public")));

// Serve Leaflet assets from node_modules
app.use(
  "/leaflet",
  express.static(path.join(import.meta.dirname, "..", "node_modules", "leaflet", "dist"))
);

app.get("/api/restaurants", async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "Invalid request: lat and lng must be provided as numeric values" });
    return;
  }

  const radius = Math.max(300, Math.min(5000, parseInt((req.query.radius as string) ?? "1000", 10) || 1000));
  const minScore = Math.max(0, Math.min(5, parseFloat((req.query.min_score as string) ?? "3.5") || 3.5));

  try {
    const restaurants = await fetchRestaurants(lat, lng, radius, minScore);
    res.json({ lat, lng, radius, minScore, count: restaurants.length, restaurants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch restaurants from Tabelog" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

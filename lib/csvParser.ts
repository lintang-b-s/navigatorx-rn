
export interface CsvGpsPoint {
  id: string;
  datetime_utc: string;
  Longitude: number;
  Latitude: number;
  speed: number; // in m/s
}

/**
 * Scans a gpsdat CSV file to find all unique track IDs.
 * Format: <id> <time> <longitude> <latitude> <angle> <speedKMh>
 */
export async function scanCsvTracks(file: File): Promise<string[]> {
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const trackIds = new Set<string>();
  
  let partialLine = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value, { stream: true });
    const lines = (partialLine + chunk).split(/\r?\n/);
    partialLine = lines.pop() || "";
    
    for (const line of lines) {
      if (!line.trim()) continue;
      // Split by tab or multiple spaces
      const parts = line.split(/[\t\s]+/);
      if (parts.length >= 1) {
        trackIds.add(parts[0]);
      }
    }
  }
  
  return Array.from(trackIds).sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
}

/**
 * Extracts points for a specific track ID from a gpsdat CSV file.
 * Converts speedKMh to m/s.
 */
export async function getCsvTrackPoints(file: File, trackId: string): Promise<CsvGpsPoint[]> {
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const points: CsvGpsPoint[] = [];
  
  let partialLine = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value, { stream: true });
    const lines = (partialLine + chunk).split(/\r?\n/);
    partialLine = lines.pop() || "";
    
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(/[\t\s]+/);
      
      // Expected parts:
      // 0: ID
      // 1: Date (e.g. 2026-04-24)
      // 2: Time (e.g. 00:00:00)
      // 3: Lon
      // 4: Lat
      // 5: Angle
      // 6: SpeedKMH
      
      if (parts.length >= 7 && parts[0] === trackId) {
        const dateStr = parts[1];
        const timeStr = parts[2];
        const lon = parseFloat(parts[3]);
        const lat = parseFloat(parts[4]);
        const speedKMh = parseFloat(parts[6]);
        
        points.push({
          id: parts[0],
          datetime_utc: `${dateStr}T${timeStr}Z`, // Assuming UTC for simulation
          Longitude: lon,
          Latitude: lat,
          speed: speedKMh / 3.6 // Convert km/h to m/s
        });
      }
    }
  }
  
  return points;
}

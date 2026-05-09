export interface GpxPoint {
  Latitude: number;
  Longitude: number;
  datetime_utc: string;
}

export async function scanTracks(file: File): Promise<string[]> {
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const tracks: string[] = [];
  let leftover = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = leftover + decoder.decode(value, { stream: true });
    // We look for <trk> then <name>...</name>
    let pos = 0;
    while (true) {
      const trkStart = text.indexOf("<trk>", pos);
      if (trkStart === -1) {
        leftover = text.slice(pos);
        if (leftover.length > 2000) leftover = leftover.slice(-2000); // safety
        break;
      }

      const nameStart = text.indexOf("<name>", trkStart);
      const trkEnd = text.indexOf("</trk>", trkStart);

      // If we find name before the end of this track
      if (nameStart !== -1 && (trkEnd === -1 || nameStart < trkEnd)) {
        const nameEnd = text.indexOf("</name>", nameStart);
        if (nameEnd !== -1) {
          const name = text.slice(nameStart + 6, nameEnd);
          tracks.push(name);
          pos = nameEnd + 7;
          continue;
        }
      }
      
      // If we found <trk> but didn't find the name or the end of name in this chunk
      leftover = text.slice(trkStart);
      break;
    }
  }

  return tracks;
}

export async function getTrackPoints(file: File, targetName: string): Promise<GpxPoint[]> {
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const points: GpxPoint[] = [];
  let leftover = "";
  let insideTargetTrack = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = leftover + decoder.decode(value, { stream: true });
    let pos = 0;

    while (pos < text.length) {
      if (!insideTargetTrack) {
        const trkStart = text.indexOf("<trk>", pos);
        if (trkStart === -1) {
          leftover = text.slice(pos);
          if (leftover.length > 2000) leftover = leftover.slice(-2000);
          pos = text.length;
          break;
        }

        const nameStart = text.indexOf("<name>", trkStart);
        const nameEnd = text.indexOf("</name>", nameStart);

        if (nameStart !== -1 && nameEnd !== -1) {
          const name = text.slice(nameStart + 6, nameEnd);
          if (name === targetName) {
            insideTargetTrack = true;
            pos = nameEnd + 7;
          } else {
            // Not our track, find next trk or wait for next chunk
            const trkEnd = text.indexOf("</trk>", trkStart);
            if (trkEnd !== -1) {
              pos = trkEnd + 6;
            } else {
              // Track end not in this chunk, skip everything until next chunk
              pos = text.length;
              leftover = text.slice(trkStart);
            }
          }
        } else {
          // Name not fully in this chunk
          leftover = text.slice(trkStart);
          pos = text.length;
        }
      } else {
        // We are inside the track, look for trkpt and /trk
        const trkEnd = text.indexOf("</trk>", pos);
        const trkptStart = text.indexOf("<trkpt", pos);

        if (trkEnd !== -1 && (trkptStart === -1 || trkEnd < trkptStart)) {
          // Track ended
          insideTargetTrack = false;
          pos = trkEnd + 6;
          // We got all points for this track, we can stop reading if we want, 
          // but there might be multiple tracks with same name (unlikely but possible)
          // For simplicity, we stop here.
          return points;
        }

        if (trkptStart !== -1) {
          const trkptEnd = text.indexOf("</trkpt>", trkptStart);
          if (trkptEnd !== -1) {
            const trkptXml = text.slice(trkptStart, trkptEnd + 8);
            
            const latMatch = trkptXml.match(/lat="([-0-9.]+)"/);
            const lonMatch = trkptXml.match(/lon="([-0-9.]+)"/);
            const timeMatch = trkptXml.match(/<time>(.*?)<\/time>/);

            if (latMatch && lonMatch && timeMatch) {
              points.push({
                Latitude: parseFloat(latMatch[1]),
                Longitude: parseFloat(lonMatch[1]),
                datetime_utc: timeMatch[1]
              });
            }
            pos = trkptEnd + 8;
          } else {
            // trkpt end not in this chunk
            leftover = text.slice(trkptStart);
            pos = text.length;
          }
        } else {
          // No more trkpt in this chunk
          pos = text.length;
          leftover = "";
        }
      }
    }
  }

  return points;
}

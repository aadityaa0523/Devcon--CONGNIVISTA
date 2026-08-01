import { normaliseScale, quantizeToBinary } from "../lib/quantization";

interface Props {
  features: Float32Array;
  label?: string;
}

/**
 * The 48-dimensional feature vector, rendered as a grid.
 *
 * Cells show the scale-normalised value; the row of pips beneath shows the same
 * vector after binary quantisation — 48 dimensions collapsing to 6 bytes. Both
 * are the real vector, so the pattern changes when you speak differently.
 */
export function FeatureHeatmap({ features, label }: Props) {
  const scaled = normaliseScale(features);

  // Normalise to 0-1 for display only.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < scaled.length; i++) {
    if (scaled[i] < min) min = scaled[i];
    if (scaled[i] > max) max = scaled[i];
  }
  const span = max - min || 1;

  const bits = quantizeToBinary(features);
  const bitAt = (i: number) => (bits[i >> 3] >> (i & 7)) & 1;

  return (
    <div className="heatmap-wrap">
      {label && <div className="heatmap-label">{label}</div>}
      <div className="heatmap">
        {Array.from(scaled).map((value, i) => {
          const intensity = (value - min) / span;
          return (
            <div
              key={i}
              className="cell"
              title={`dim ${i}: ${features[i].toFixed(4)}`}
              style={{
                background: `rgba(138, 235, 255, ${0.06 + intensity * 0.9})`,
                boxShadow:
                  intensity > 0.72
                    ? `0 0 8px rgba(138,235,255,${intensity * 0.55})`
                    : "none",
              }}
            />
          );
        })}
      </div>
      <div className="bitstrip" aria-hidden="true">
        {Array.from({ length: features.length }, (_, i) => (
          <span key={i} className={bitAt(i) ? "bit on" : "bit"} />
        ))}
      </div>
      <div className="heatmap-caption">
        48 dims · {features.length * 4} bytes → {bits.length} bytes binary
      </div>
    </div>
  );
}

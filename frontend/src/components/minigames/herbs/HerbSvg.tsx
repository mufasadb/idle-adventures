/**
 * Herb SVG components for the herb picking minigame.
 * - GoodHerb: 10 petals (two layers of 5)
 * - BadHerb: 8 petals (two layers of 4)
 */

interface HerbSvgProps {
  size?: number;
}

/** SVG Herb with 10 petals (good herb) - two layers of 5 */
export const GoodHerb = ({ size = 40 }: HerbSvgProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    {/* Outer layer: 5 larger teardrop petals */}
    {[0, 72, 144, 216, 288].map((angle, i) => (
      <path
        key={`outer-${i}`}
        d="M20 5 Q25 14 20 24 Q15 14 20 5"
        fill="#16a34a"
        stroke="#15803d"
        strokeWidth="1"
        transform={`rotate(${angle} 20 20)`}
      />
    ))}
    {/* Inner layer: 5 smaller teardrop petals, offset by 36 degrees */}
    {[36, 108, 180, 252, 324].map((angle, i) => (
      <path
        key={`inner-${i}`}
        d="M20 9 Q23 15 20 22 Q17 15 20 9"
        fill="#22c55e"
        stroke="#16a34a"
        strokeWidth="1"
        transform={`rotate(${angle} 20 20)`}
      />
    ))}
    {/* Center */}
    <circle cx="20" cy="20" r="4" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
  </svg>
);

/** SVG Herb with 8 petals (bad herb) - two layers of 4 */
export const BadHerb = ({ size = 40 }: HerbSvgProps) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    {/* Outer layer: 4 larger teardrop petals - teal/blue-green (similar to good but different) */}
    {[0, 90, 180, 270].map((angle, i) => (
      <path
        key={`outer-${i}`}
        d="M20 5 Q26 14 20 24 Q14 14 20 5"
        fill="#0d9488"
        stroke="#0f766e"
        strokeWidth="1"
        transform={`rotate(${angle} 20 20)`}
      />
    ))}
    {/* Inner layer: 4 smaller teardrop petals, offset by 45 degrees */}
    {[45, 135, 225, 315].map((angle, i) => (
      <path
        key={`inner-${i}`}
        d="M20 8 Q24 15 20 22 Q16 15 20 8"
        fill="#14b8a6"
        stroke="#0d9488"
        strokeWidth="1"
        transform={`rotate(${angle} 20 20)`}
      />
    ))}
    {/* Center */}
    <circle cx="20" cy="20" r="4" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
  </svg>
);

/**
 * Pre-process markdown HTML to wrap coordinates and regions in spans with data attributes.
 * This enables hover interactions in the AI progress panel.
 */
export const wrapCoordinatesInHtml = (html: string): string => {
  // First, wrap region patterns: "Region from (x1, y1) to (x2, y2)"
  // Use HTML entities for parentheses in the display text to prevent the coordinate
  // regex from matching them again
  let processed = html.replace(
    /Region from \((\d{1,5}(?:\.\d+)?),\s*(\d{1,5}(?:\.\d+)?)\) to \((\d{1,5}(?:\.\d+)?),\s*(\d{1,5}(?:\.\d+)?)\)/g,
    (match, x1, y1, x2, y2) => {
      // Replace parentheses with HTML entities in the visible text to prevent double-wrapping
      const displayText = `Region from &#40;${x1}, ${y1}&#41; to &#40;${x2}, ${y2}&#41;`;
      return `<span class="region-highlight" data-x1="${x1}" data-y1="${y1}" data-x2="${x2}" data-y2="${y2}" style="cursor:pointer;background:rgba(255,107,0,0.15);border-radius:3px;padding:0 2px;font-family:monospace;color:#e65100;border-bottom:1px dashed #e65100;">${displayText}</span>`;
    }
  );

  // Then wrap remaining standalone coordinates: (123, 456) or (123,456)
  // but NOT inside base64 data or URLs
  processed = processed.replace(
    /(?<![A-Za-z0-9+/="])(\((\d{1,5}(?:\.\d+)?),\s*(\d{1,5}(?:\.\d+)?)\))(?![A-Za-z0-9+/=])/g,
    (match, full, x, y) => {
      return `<span class="coord-highlight" data-x="${x}" data-y="${y}" style="cursor:pointer;background:rgba(33,150,243,0.15);border-radius:3px;padding:0 2px;font-family:monospace;color:#1976d2;border-bottom:1px dashed #1976d2;">${full}</span>`;
    }
  );

  return processed;
};

// Shared entity rendering utilities
// Eliminates duplicate drawing code across Player, Enemy, NPC

const EntityRenderer = {
  /**
   * Draw shadow beneath an entity
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Screen X position (center)
   * @param {number} y - Screen Y position (center)
   * @param {number} width - Entity width for shadow sizing
   * @param {number} offsetY - Vertical offset from center (default: width/2 + 4)
   */
  drawShadow(ctx, x, y, width, offsetY) {
    const shadowY = offsetY !== undefined ? y + offsetY : y + width / 2 + 4;
    ctx.fillStyle = 'rgba(40, 35, 25, 0.4)';
    ctx.beginPath();
    ctx.ellipse(x, shadowY, width / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  /**
   * Draw circular body
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Screen X position (center)
   * @param {number} y - Screen Y position (center)
   * @param {number} radius - Body radius
   * @param {string} color - Fill color
   * @param {boolean} drawOutline - Whether to draw subtle outline
   */
  drawBody(ctx, x, y, radius, color, drawOutline = true) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (drawOutline) {
      ctx.strokeStyle = 'rgba(80, 70, 55, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  /**
   * Draw inner shadow gradient for depth
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Screen X position (center)
   * @param {number} y - Screen Y position (center)
   * @param {number} radius - Entity radius
   */
  drawInnerShadow(ctx, x, y, radius) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  },

  /**
   * Draw health bar
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Screen X position (center of entity)
   * @param {number} y - Screen Y position (top of health bar)
   * @param {number} hp - Current hit points
   * @param {number} maxHp - Maximum hit points
   * @param {number} width - Bar width (default: 36)
   * @param {number} height - Bar height (default: 5)
   * @param {string} fillColor - HP fill color (default: #b04040)
   */
  drawHealthBar(ctx, x, y, hp, maxHp, width = 36, height = 5, fillColor = '#b04040') {
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
    const barX = x - width / 2;

    // Background
    ctx.fillStyle = 'rgba(60, 50, 40, 0.7)';
    ctx.fillRect(barX, y, width, height);

    // HP fill
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, y, width * hpRatio, height);
  },

  /**
   * Draw simple eyes (two circles)
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Screen X position (center of head)
   * @param {number} y - Screen Y position (center of eyes)
   * @param {number} spacing - Distance between eye centers (half on each side)
   * @param {number} size - Eye radius
   * @param {string} color - Eye color
   */
  drawEyes(ctx, x, y, spacing = 4, size = 2.5, color = '#2a2a2a') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - spacing, y, size, 0, Math.PI * 2);
    ctx.arc(x + spacing, y, size, 0, Math.PI * 2);
    ctx.fill();
  },

  /**
   * Draw username label above entity
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Screen X position (center)
   * @param {number} y - Screen Y position (base for label)
   * @param {string} username - Text to display
   * @param {number} offsetY - Vertical offset above y (default: -32)
   */
  drawLabel(ctx, x, y, username, offsetY = -32) {
    const labelY = y + offsetY;

    // Shadow text
    ctx.fillStyle = '#4a4540';
    ctx.font = "11px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(username, x, labelY);

    // Main text
    ctx.fillStyle = '#999999';
    ctx.font = "12px 'IBM Plex Sans', sans-serif";
    ctx.fillText(username, x, labelY + 12);
  },

  /**
   * Get color from COLORS constant with fallback
   * @param {string} colorKey - Key in COLORS object
   * @param {string} fallback - Fallback color if COLORS not available
   * @returns {string}
   */
  getColor(colorKey, fallback) {
    return (typeof COLORS !== 'undefined' && COLORS[colorKey]) ? COLORS[colorKey] : fallback;
  }
};

// Make EntityRenderer available globally
if (typeof window !== 'undefined') {
  window.EntityRenderer = EntityRenderer;
}

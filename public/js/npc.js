class NPC {
    constructor(x, y, name, color) {
        this.x = x;
        this.y = y;
        this.width = 24;
        this.height = 24;
        this.name = name || 'NPC';
        this.color = color || '#d4a745';
    }

    draw(ctx, cameraX, cameraY) {
        const screenX = this.x - cameraX;
        const screenY = this.y - cameraY;

        // Draw NPC body (slightly larger than player, different shape)
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.width / 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw a small diamond/hat shape on top to distinguish from players
        ctx.fillStyle = '#f5e6b8';
        ctx.beginPath();
        ctx.moveTo(screenX, screenY - this.height / 2 - 8);
        ctx.lineTo(screenX - 6, screenY - this.height / 2);
        ctx.lineTo(screenX, screenY - this.height / 2 - 2);
        ctx.lineTo(screenX + 6, screenY - this.height / 2);
        ctx.closePath();
        ctx.fill();

        // Draw name above
        ctx.fillStyle = '#d4a745';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, screenX, screenY - this.height / 2 - 14);
        ctx.restore();
    }
}

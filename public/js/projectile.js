// Projectile class for tank-style combat

const PROJECTILE_SPEED = 400;      // pixels/sec
const PROJECTILE_DAMAGE = 20;
const PROJECTILE_RADIUS = 5;
const PROJECTILE_MAX_LIFETIME = 3; // seconds

class Projectile {
    constructor(x, y, angle, ownerId, options = {}) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = options.speed || PROJECTILE_SPEED;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.radius = options.radius || PROJECTILE_RADIUS;
        this.damage = options.damage || PROJECTILE_DAMAGE;
        this.ownerId = ownerId;
        this.maxBounces = options.maxBounces || 0;  // Default weapon: 0
        this.bounces = 0;
        this.lifetime = PROJECTILE_MAX_LIFETIME;
        this.alive = true;
    }

    update(dt, zone) {
        this.lifetime -= dt;
        if (this.lifetime <= 0) {
            this.alive = false;
            return;
        }

        const nextX = this.x + this.vx * dt;
        const nextY = this.y + this.vy * dt;

        // Check zone bounds
        if (zone) {
            if (nextX < this.radius || nextX > zone.width - this.radius ||
                nextY < this.radius || nextY > zone.height - this.radius) {
                if (this.bounces < this.maxBounces) {
                    this.bounceOffBounds(zone, nextX, nextY);
                    this.bounces++;
                } else {
                    this.alive = false;
                    return;
                }
            }
        }

        // Wall collision check using zone
        if (zone && this.checkWallCollision(zone, nextX, nextY)) {
            if (this.bounces < this.maxBounces) {
                this.bounce(zone, nextX, nextY);
                this.bounces++;
            } else {
                this.alive = false;
                return;
            }
        } else {
            this.x = nextX;
            this.y = nextY;
        }
    }

    checkWallCollision(zone, x, y) {
        // Use zone.checkCollision with a small hitbox
        return zone.checkCollision({
            x: x,
            y: y,
            width: this.radius * 2,
            height: this.radius * 2
        });
    }

    bounceOffBounds(zone, nextX, nextY) {
        // Reflect off zone boundaries
        if (nextX < this.radius || nextX > zone.width - this.radius) {
            this.vx = -this.vx;
        }
        if (nextY < this.radius || nextY > zone.height - this.radius) {
            this.vy = -this.vy;
        }
        this.angle = Math.atan2(this.vy, this.vx);
    }

    bounce(zone, nextX, nextY) {
        // Determine which axis to reflect (simplified: try each axis)
        const testX = {
            x: nextX,
            y: this.y,
            width: this.radius * 2,
            height: this.radius * 2
        };
        const testY = {
            x: this.x,
            y: nextY,
            width: this.radius * 2,
            height: this.radius * 2
        };

        if (zone.checkCollision(testX)) {
            this.vx = -this.vx;
        }
        if (zone.checkCollision(testY)) {
            this.vy = -this.vy;
        }
        this.angle = Math.atan2(this.vy, this.vx);
    }

    draw(ctx, cameraX, cameraY) {
        const screenX = this.x - cameraX;
        const screenY = this.y - cameraY;

        ctx.save();

        // Bullet body
        ctx.fillStyle = '#f1c40f';  // Yellow bullet
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Bullet glow
        ctx.fillStyle = 'rgba(241, 196, 15, 0.3)';
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Bullet trail (short line behind)
        const trailLength = 10;
        const trailX = screenX - Math.cos(this.angle) * trailLength;
        const trailY = screenY - Math.sin(this.angle) * trailLength;
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(trailX, trailY);
        ctx.stroke();

        ctx.restore();
    }
}

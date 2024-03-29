export class Hud {
    constructor(ctx) {
        this.ctx = ctx;
        this.life = new Image();
        this.posX = 100;
        this.posY = 5;
        this.sizeX = 35;
        this.sizeY = 35;
        this.removeALife = false;
        this.lifes = [
            {
                name: 'first',
                posX: this.posX,
                posY: this.posY,
                src: './pictures/HUD/bone.png'
            },
            {
                name: 'second',
                posX: this.posX + this.sizeX,
                posY: this.posY,
                src: './pictures/HUD/bone.png'
            },
            {
                name: 'third',
                posX: this.posX + 2 * this.sizeX,
                posY: this.posY,
                src: './pictures/HUD/bone.png'
            },
        ];
    }
    isGameOver() {
        if (this.lifes.length === 0) {
            return true;
        }
        return false;
    }

    draw() {
        this.lifes.forEach(life => {
            this.life.src = life.src;
            this.ctx.drawImage(this.life, life.posX, life.posY, this.sizeX, this.sizeY)
        })

        if (this.removeALife) {
            this.lifes.pop();
        }
    }
}

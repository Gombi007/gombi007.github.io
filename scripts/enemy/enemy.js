export class Enemy {
    constructor(enemyState) {
        this.enemyState = enemyState;
        this.movementX = 920;
        this.movementY = 0;
        this.width = 100;
        this.height = 100;
        this.enemyImage = new Image();
        this.runForwardAnimations = [
            './pictures/enemy/skeleton/skeleton-03_run_00.png',
            './pictures/enemy/skeleton/skeleton-03_run_01.png',
            './pictures/enemy/skeleton/skeleton-03_run_03.png',
            './pictures/enemy/skeleton/skeleton-03_run_04.png',
            './pictures/enemy/skeleton/skeleton-03_run_05.png',
            './pictures/enemy/skeleton/skeleton-03_run_06.png',
            './pictures/enemy/skeleton/skeleton-03_run_07.png',
            './pictures/enemy/skeleton/skeleton-03_run_08.png',
            './pictures/enemy/skeleton/skeleton-03_run_09.png',
            './pictures/enemy/skeleton/skeleton-03_run_10.png',
            './pictures/enemy/skeleton/skeleton-03_run_11.png',
            './pictures/enemy/skeleton/skeleton-03_run_12.png',
        ];
        this.runBackAnimations = [
            './pictures/enemy/skeleton/skeleton-03_run_13.png',
            './pictures/enemy/skeleton/skeleton-03_run_14.png',
            './pictures/enemy/skeleton/skeleton-03_run_15.png',
            './pictures/enemy/skeleton/skeleton-03_run_16.png',
            './pictures/enemy/skeleton/skeleton-03_run_17.png',
            './pictures/enemy/skeleton/skeleton-03_run_18.png',
            './pictures/enemy/skeleton/skeleton-03_run_19.png',
            './pictures/enemy/skeleton/skeleton-03_run_20.png',
            './pictures/enemy/skeleton/skeleton-03_run_21.png',
            './pictures/enemy/skeleton/skeleton-03_run_22.png',
            './pictures/enemy/skeleton/skeleton-03_run_23.png',
            './pictures/enemy/skeleton/skeleton-03_run_24.png',
        ];
        this.isStepForward = true;
        this.movementAreaXDistanceCounter = 0;
        this.movementAreaXDistance = 500;
    }
    moveX(playerMovementX) {
        this.fixedX = this.movementX + playerMovementX;
        if (this.movementAreaXDistanceCounter === this.movementAreaXDistance) {
            this.isStepForward = !this.isStepForward;
        }

        if (this.isStepForward) {
            this.fixedX += this.movementAreaXDistanceCounter * 1;
        } else {
            this.fixedX += this.movementAreaXDistance - this.movementAreaXDistanceCounter * 1;
        }
    }

    update(enemyFrameStepper) {
        if (this.isStepForward) {
            this.enemyImage.src = this.runForwardAnimations[enemyFrameStepper];
        }

        if (!this.isStepForward) {
            this.enemyImage.src = this.runBackAnimations[enemyFrameStepper];
        }
    }

    draw(ctx) {
        ctx.drawImage(this.enemyImage, this.fixedX, 520, 150, 150);
    }
    isCollison(playerMovementX, playerMovementY) {
        let currentXPosition = this.fixedX - 460;
        if (currentXPosition === 0) {
            return true;
        }

    }

}
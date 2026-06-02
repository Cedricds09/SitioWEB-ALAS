(() => {
    const canvas = document.getElementById("galaxy");
    const ctx = canvas.getContext("2d");
    const welcome = document.getElementById("welcome");

    let width, height, stars;

    const STAR_COUNT = 220;
    const PURPLE_RATIO = 0.25;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        stars = createStars(STAR_COUNT);
    }

    function createStars(count) {
        const list = [];
        for (let i = 0; i < count; i++) {
            const isPurple = Math.random() < PURPLE_RATIO;
            list.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 1.6 + 0.2,
                baseAlpha: Math.random() * 0.6 + 0.2,
                alpha: 0,
                speed: Math.random() * 0.015 + 0.005,
                phase: Math.random() * Math.PI * 2,
                color: isPurple ? "186, 130, 255" : "220, 230, 255"
            });
        }
        return list;
    }

    function draw(time) {
        ctx.clearRect(0, 0, width, height);

        for (const star of stars) {
            star.alpha = star.baseAlpha * (0.5 + 0.5 * Math.sin(time * star.speed + star.phase));

            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${star.color}, ${star.alpha})`;
            ctx.shadowBlur = star.radius * 4;
            ctx.shadowColor = `rgba(${star.color}, ${star.alpha})`;
            ctx.fill();
        }

        requestAnimationFrame(draw);
    }

    function enterSite() {
        if (welcome.classList.contains("fade-out")) return;
        welcome.classList.add("fade-out");
        setTimeout(() => {
            window.location.href = "/main";
        }, 1000);
    }

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", enterSite);
    window.addEventListener("click", enterSite);

    resize();
    requestAnimationFrame(draw);
})();

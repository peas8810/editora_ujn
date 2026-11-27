const carousel = document.querySelector(".editorial-carousel");
const controls = carousel.querySelector(".carousel-controls");
const gallery = carousel.querySelector(".carousel-images");
const slides = Array.from(gallery.querySelectorAll("img"));
const picker = carousel.querySelector(".carousel-picker");
const choices = Array.from(picker.querySelectorAll("button"));
const rotation = controls.querySelector("[data-rotation]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const interval = 4500;

let current = 0;
let playing = !reducedMotion.matches;
let visible = false;
let timer;

function show(index) {
  current = (index + slides.length) % slides.length;
  slides.forEach((slide, position) => {
    slide.hidden = position !== current;
    if (slide.hidden) choices[position].removeAttribute("aria-current");
    else choices[position].setAttribute("aria-current", "true");
  });
}

function schedule() {
  window.clearInterval(timer);
  rotation.textContent = playing ? "Pausar" : "Reproduzir";
  gallery.setAttribute("aria-live", playing ? "off" : "polite");
  if (playing && visible && !document.hidden) {
    timer = window.setInterval(() => show(current + 1), interval);
  }
}

rotation.addEventListener("click", () => {
  playing = !playing;
  schedule();
});

controls.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    show(current + Number(button.dataset.step));
    schedule();
  });
});

choices.forEach((button, index) => {
  button.addEventListener("click", () => {
    show(index);
    schedule();
  });
});

carousel.addEventListener("focusin", (event) => {
  if (!carousel.contains(event.relatedTarget) && event.target.matches(":focus-visible")) {
    playing = false;
    schedule();
  }
});

reducedMotion.addEventListener("change", (event) => {
  if (event.matches) playing = false;
  schedule();
});

document.addEventListener("visibilitychange", schedule);
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  schedule();
}, { threshold: 0.25 }).observe(gallery);

gallery.classList.add("is-carousel");
show(0);
controls.hidden = false;
picker.hidden = false;
schedule();

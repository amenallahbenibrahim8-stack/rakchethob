import { renderIcons } from "./utils.js";
import { applyConfiguredImages } from "./images.js";

applyConfiguredImages();
renderIcons();
if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  if (window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);
  window.gsap.from(".hero-copy > *", { y: 18, opacity: 0, duration: 0.7, stagger: 0.09, ease: "power2.out" });
  window.gsap.from(".hero-art", { y: 18, opacity: 0, duration: 0.9, delay: 0.25, ease: "power2.out" });
  if (window.ScrollTrigger) {
    window.gsap.utils.toArray(".feature-card, .steps-grid article, .closing-cta").forEach((element) => {
      window.gsap.from(element, {
        y: 18, autoAlpha: 0, duration: 0.65, ease: "power2.out",
        scrollTrigger: { trigger: element, start: "top 88%", once: true }
      });
    });
    window.gsap.to(".hero-photo > img", {
      yPercent: 6, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
    });
  }
}
if (window.Lenis && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const lenis = new window.Lenis({ duration: 1.05, smoothWheel: true });
  if (window.gsap && window.ScrollTrigger) {
    lenis.on("scroll", window.ScrollTrigger.update);
    window.gsap.ticker.add((time) => lenis.raf(time * 1000));
    window.gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

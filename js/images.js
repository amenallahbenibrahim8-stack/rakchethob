export const IMAGE_CONFIG = Object.freeze({
  hero: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=85",
  memorySunset: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=640&q=80",
  memoryDinner: "https://images.unsplash.com/photo-1511988617509-a57c8a288659?auto=format&fit=crop&w=640&q=80",
  questionCouple: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80",
  login: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=80",
  signup: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80",
  reset: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1200&q=80",
  avatarOne: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=75",
  avatarTwo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=75",
  gameWhoKnows: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=960&q=80",
  gameThisOrThat: "https://images.unsplash.com/photo-1511988617509-a57c8a288659?auto=format&fit=crop&w=960&q=80",
  gameDailyQuestion: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=960&q=80",
  gameRapidFire: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=960&q=80"
});

export function imageFor(key) {
  return IMAGE_CONFIG[key] || key || "";
}

export function applyConfiguredImages(root = document) {
  root.querySelectorAll("img[data-image]").forEach((image) => {
    image.src = imageFor(image.dataset.image);
  });
}

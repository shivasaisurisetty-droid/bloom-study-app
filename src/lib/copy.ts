/** Warm microcopy. Short, gentle, never pressuring. */

export const ENCOURAGEMENTS = [
  "You've got this! ☀️",
  "One question at a time. That's how it's done. 💪",
  "Little steps count, too. 🌱",
  "Take a breath. You're doing better than you think.",
  "Your effort matters more than one score.",
  "Showing up today is already a win. ⭐",
  "Ready for another little victory?",
  "A short break is okay. Come back when you're ready.",
  "Slow and steady still gets there. 🐢",
  "You don't have to know it all today. Just a little more than yesterday.",
];

export const CORRECT_MESSAGES = [
  "Yes! You got it right! 🎉 Great work — keep going!",
  "Nailed it! That's exactly right. ✅",
  "Look at you! Another one in the bag. ✨",
  "Your hard work is showing. 🌟",
];

export const INCORRECT_MESSAGES = [
  "Not this time — and that's okay. Every mistake is a chance to learn. Check the correct answer and you'll be ready next time. 💪",
  "Close the gap now: have a look at the answer below and it'll stick better next time. 🌱",
  "That's exactly what practice is for. You'll remember this one. 💡",
];

export function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(Math.floor(seed)) % list.length];
}

export function resultMessage(pct: number | null, previousPct: number | null): string {
  if (pct === null) return "You didn't answer any questions this time — that's completely okay. Come back whenever you're ready. 🌱";
  if (pct >= 0.85) return "Excellent work! 🎉 Your hard work is paying off.";
  if (previousPct !== null && pct > previousPct + 0.001) {
    return "You're getting stronger with every attempt. Keep it up! 🚀";
  }
  if (pct >= 0.5) return "Solid, steady work. 👍 Every question you try makes the next one a little easier.";
  return "It's okay. This is practice, not a judgment. Let's learn from these questions and go again. 💪";
}

export function greeting(hour: number): string {
  if (hour < 5) return "Hey, night owl! 🦉 Let's grow.";
  if (hour < 12) return "Good morning! ☀️ Let's grow.";
  if (hour < 18) return "Good afternoon! 👋 Let's grow.";
  return "Good evening! 🌙 Let's grow.";
}

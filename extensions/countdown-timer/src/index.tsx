import { render } from "preact";

const PLACEHOLDER = "Countdown timer loading…";

function CountdownTimerPlaceholder() {
  return <p className="helixo-countdown__status">{PLACEHOLDER}</p>;
}

function mountCountdownTimers(): void {
  const mounts = document.querySelectorAll<HTMLElement>("[data-helixo-countdown]");

  mounts.forEach((mount) => {
    if (mount.dataset.helixoReady === "true") {
      return;
    }
    mount.dataset.helixoReady = "true";
    render(<CountdownTimerPlaceholder />, mount);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountCountdownTimers, { once: true });
} else {
  mountCountdownTimers();
}

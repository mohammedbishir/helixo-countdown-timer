import { render } from "preact";
import { CountdownTimerApp } from "./CountdownTimer";

function mountCountdownTimers(): void {
  const mounts = document.querySelectorAll<HTMLElement>("[data-helixo-countdown]");

  mounts.forEach((mount) => {
    if (mount.dataset.helixoReady === "true") {
      return;
    }
    mount.dataset.helixoReady = "true";
    render(
      <CountdownTimerApp
        productId={mount.dataset.productId ?? ""}
        proxyUrl={mount.dataset.proxyUrl ?? ""}
      />,
      mount
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountCountdownTimers, { once: true });
} else {
  mountCountdownTimers();
}

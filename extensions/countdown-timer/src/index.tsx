import { render } from "preact";

const PLACEHOLDER = "Countdown timer loading…";

interface CountdownTimerPlaceholderProps {
  productId: string;
  proxyUrl: string;
}

function CountdownTimerPlaceholder({
  productId,
  proxyUrl,
}: CountdownTimerPlaceholderProps) {
  return (
    <p
      className="helixo-countdown__status"
      data-product-id={productId}
      data-proxy-url={proxyUrl}
    >
      {PLACEHOLDER}
    </p>
  );
}

function mountCountdownTimers(): void {
  const mounts = document.querySelectorAll<HTMLElement>("[data-helixo-countdown]");

  mounts.forEach((mount) => {
    if (mount.dataset.helixoReady === "true") {
      return;
    }
    mount.dataset.helixoReady = "true";
    render(
      <CountdownTimerPlaceholder
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

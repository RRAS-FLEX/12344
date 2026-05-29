declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const GTM_SCRIPT_ID = "nautiplex-gtm-script";

const isValidGtmId = (value: string | undefined) => Boolean(value && /^GTM-[A-Z0-9]+$/i.test(value));

export const initializeGTM = (gtmId?: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (!isValidGtmId(gtmId)) {
    return;
  }

  if (document.getElementById(GTM_SCRIPT_ID)) {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    "gtm.start": Date.now(),
    event: "gtm.js",
  });

  const script = document.createElement("script");
  script.id = GTM_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(script);
};


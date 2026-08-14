export interface PwaRegistrationState {
  registration: ServiceWorkerRegistration | null;
  supported: boolean;
}

export async function registerOvergoalPwa(): Promise<PwaRegistrationState> {
  if (
    !import.meta.env.PROD ||
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return { registration: null, supported: false };
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    // Test runners and restrictive webviews may expose the API while blocking
    // registration. Treat that as supported-but-unregistered, not a page error.
    if (!registration) {
      return { registration: null, supported: true };
    }
    void registration.update().catch(() => undefined);
    return { registration, supported: true };
  } catch (error) {
    console.warn("Overgoal offline shell could not be registered.", error);
    return { registration: null, supported: true };
  }
}

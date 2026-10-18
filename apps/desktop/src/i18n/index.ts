import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const STORAGE_KEY = "testflow-mobile-language";

const resources = {
  en: {
    translation: {
      app: {
        eyebrow: "Mobile automation workspace",
        title: "TestFlow Mobile",
        subtitle: "Record, inspect and execute reliable Android and iOS test flows.",
        refresh: "Refresh environment",
        refreshing: "Refreshing...",
      },
      environment: {
        eyebrow: "Runtime",
        title: "Environment",
        ready: "Ready",
        missing: "Missing",
        optional: "Optional",
        notDetected: "Not detected",
        notInstalled: "Not installed",
        checkFailed: "Environment check failed",
        checking: "Checking local automation environment...",
      },
      engines: {
        eyebrow: "Foundation",
        title: "Automation engines",
        appiumDescription: "Primary execution engine",
        maestroDescription: "Optional execution adapter",
        localNote:
          "Device information is read directly from the local host. No mock devices are displayed.",
      },
      devices: {
        eyebrow: "Device manager",
        title: "Available targets",
        description:
          "Physical devices, emulators and simulators detected by the local TestFlow runtime.",
        android: "Android",
        ios: "iOS",
        androidTitle: "Android devices",
        iosTitle: "iOS devices",
        noDevices: "No devices detected",
        noAndroid:
          "Connect an Android device or start an emulator.",
        noIos:
          "No available iOS devices or simulators were detected.",
        physical: "Physical",
        emulator: "Emulator",
        simulator: "Simulator",
        stopped: "Stopped",
        shutdown: "Shutdown",
        available: "Available",
        booted: "Booted",
        start: "Start",
        stop: "Stop",
        select: "Select",
        selected: "Selected",
        open: "Open",
        physicalDevices: "Physical devices",
        emulators: "Emulators",
        simulators: "Simulators",
        noPhysical: "No physical devices connected.",
        noEmulators: "No emulators available.",
        noSimulators: "No simulators available.",
        starting: "Starting...",
        stopping: "Stopping...",
        actionFailed: "Device operation failed",
      },
      logs: {
        title: "Runtime logs",
        subtitle: "Commands, devices, Appium and execution diagnostics.",
        open: "Logs",
        close: "Close",
        clear: "Clear",
        refresh: "Refresh",
        empty: "No runtime logs yet.",
        all: "All",
        device: "Device",
        command: "Command",
        appium: "Appium",
        error: "Errors",
        stdout: "stdout",
        stderr: "stderr",
      },
      workspace: {
        eyebrow: "Selected target",
        title: "Test workspace",
        ready: "Ready",
        application: "Application",
        applicationTitle: "Application under test",
        localFile: "Local file",
        installedApp: "Installed application",
        applicationFile: "Application file",
        noFileSelected: "No application selected",
        browse: "Browse",
        package: "Package",
        bundleId: "Bundle ID",
        prepare: "Prepare and run",
        mobileApplication: "Mobile application",
      },
      automation: {
        eyebrow: "Automation",
        title: "Automation session",
        ready: "Ready",
        notReady: "Not ready",
        engine: "Engine",
        package: "Package",
        activity: "Activity",
        session: "Session",
        emptyTitle: "No active session",
        emptyText: "Prepare the application to enable recording and inspection.",
        record: "Record",
        spy: "Spy",
        readyHint: "The device is ready for recording or element inspection.",
        waitingHint: "Record and Spy are enabled after the Appium session is ready.",
      },
      common: {
        version: "v0.1.0",
      },
    },
  },

  es: {
    translation: {
      app: {
        eyebrow: "Espacio de automatización mobile",
        title: "TestFlow Mobile",
        subtitle: "Graba, inspecciona y ejecuta flujos confiables en Android e iOS.",
        refresh: "Actualizar entorno",
        refreshing: "Actualizando...",
      },
      environment: {
        eyebrow: "Entorno",
        title: "Ambiente",
        ready: "Listo",
        missing: "Faltante",
        optional: "Opcional",
        notDetected: "No detectado",
        notInstalled: "No instalado",
        checkFailed: "Falló la validación del entorno",
        checking: "Validando el entorno local de automatización...",
      },
      engines: {
        eyebrow: "Base",
        title: "Motores de automatización",
        appiumDescription: "Motor principal de ejecución",
        maestroDescription: "Adaptador de ejecución opcional",
        localNote:
          "La información de dispositivos se obtiene directamente del equipo local. No se muestran dispositivos simulados.",
      },
      devices: {
        eyebrow: "Gestor de dispositivos",
        title: "Destinos disponibles",
        description:
          "Dispositivos físicos, emuladores y simuladores detectados por el runtime local de MobFlow.",
        android: "Android",
        ios: "iOS",
        androidTitle: "Dispositivos Android",
        iosTitle: "Dispositivos iOS",
        noDevices: "No se detectaron dispositivos",
        noAndroid:
          "Conecta un dispositivo Android o inicia un emulador.",
        noIos:
          "No se detectaron dispositivos o simuladores iOS disponibles.",
        physical: "Físico",
        emulator: "Emulador",
        simulator: "Simulador",
        stopped: "Detenido",
        shutdown: "Apagado",
        available: "Disponible",
        booted: "Iniciado",
        start: "Iniciar",
        stop: "Detener",
        select: "Seleccionar",
        selected: "Seleccionado",
        open: "Abrir",
        physicalDevices: "Dispositivos físicos",
        emulators: "Emuladores",
        simulators: "Simuladores",
        noPhysical: "No hay dispositivos físicos conectados.",
        noEmulators: "No hay emuladores disponibles.",
        noSimulators: "No hay simuladores disponibles.",
        starting: "Iniciando...",
        stopping: "Deteniendo...",
        actionFailed: "Falló la operación del dispositivo",
      },
      logs: {
        title: "Logs del runtime",
        subtitle: "Diagnóstico de comandos, dispositivos, Appium y ejecuciones.",
        open: "Logs",
        close: "Cerrar",
        clear: "Limpiar",
        refresh: "Actualizar",
        empty: "Aún no hay logs del runtime.",
        all: "Todos",
        device: "Dispositivo",
        command: "Comando",
        appium: "Appium",
        error: "Errores",
        stdout: "stdout",
        stderr: "stderr",
      },
      workspace: {
        eyebrow: "Destino seleccionado",
        title: "Espacio de prueba",
        ready: "Listo",
        application: "Aplicación",
        applicationTitle: "Aplicación bajo prueba",
        localFile: "Archivo local",
        installedApp: "Aplicación instalada",
        applicationFile: "Archivo de aplicación",
        noFileSelected: "No se ha seleccionado una aplicación",
        browse: "Examinar",
        package: "Paquete",
        bundleId: "Bundle ID",
        prepare: "Preparar y ejecutar",
        mobileApplication: "Aplicación móvil",
      },
      automation: {
        eyebrow: "Automatización",
        title: "Sesión de automatización",
        ready: "Lista",
        notReady: "No preparada",
        engine: "Motor",
        package: "Paquete",
        activity: "Actividad",
        session: "Sesión",
        emptyTitle: "No hay una sesión activa",
        emptyText: "Prepara la aplicación para habilitar grabación e inspección.",
        record: "Grabar",
        spy: "Spy",
        readyHint: "El dispositivo está listo para grabar o inspeccionar elementos.",
        waitingHint: "Grabar y Spy se habilitan cuando la sesión Appium está lista.",
      },
      common: {
        version: "v0.1.0",
      },
    },
  },
} as const;

const storedLanguage = localStorage.getItem(STORAGE_KEY);

const initialLanguage =
  storedLanguage === "es" || storedLanguage === "en"
    ? storedLanguage
    : "en";

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on("languageChanged", (language) => {
  if (language === "es" || language === "en") {
    localStorage.setItem(STORAGE_KEY, language);
  }
});

export default i18n;

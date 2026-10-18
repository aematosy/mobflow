import { useEffect, useState } from "react";

import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "./settingsConfig";

import {
  APPIUM_CAPABILITY_CATALOG,
  CAPABILITY_CATEGORY_LABELS,
  type CapabilityCategory,
} from "./appiumCapabilityCatalog";

import type {
  MobFlowSettings,
  MobFlowTheme,
} from "../types/settings";

type Props = {
  settings: MobFlowSettings;
  language: "es" | "en";
  onLanguageChange: (language: "es" | "en") => void;
  onSave: (settings: MobFlowSettings) => void | Promise<void>;
  onClose: () => void;
};

const themes: Array<{
  value: MobFlowTheme;
  label: string;
}> = [
  { value: "system", label: "Sistema" },
  { value: "dark", label: "Oscuro" },
  { value: "light", label: "Claro" },
];

const futureSections: Record<
  Exclude<SettingsSectionId, "general" | "appium">,
  {
    eyebrow: string;
    title: string;
    description: string;
    items: string[];
  }
> = {
  android: {
    eyebrow: "ANDROID",
    title: "Runtime Android",
    description:
      "Configuración del SDK, ADB, UiAutomator2 y comportamiento de dispositivos Android.",
    items: [
      "Android SDK y ADB",
      "UiAutomator2",
      "Instalación automática de APK",
      "Device discovery",
      "Emuladores",
    ],
  },

  ios: {
    eyebrow: "IOS",
    title: "Runtime iOS",
    description:
      "Configuración de Xcode, WebDriverAgent, dispositivos físicos y simuladores.",
    items: [
      "Xcode",
      "WebDriverAgent",
      "Simuladores",
      "Dispositivos físicos",
      "Session defaults",
    ],
  },

  recorder: {
    eyebrow: "RECORDER",
    title: "Motor de grabación",
    description:
      "Control del pipeline de captura física y construcción temporal de acciones.",
    items: [
      "Captura física",
      "Gesture polling",
      "PRE snapshot",
      "POST snapshot",
      "Screenshots",
      "Tap / swipe thresholds",
    ],
  },

  locator: {
    eyebrow: "LOCATOR ENGINE",
    title: "Resolución de locators",
    description:
      "Control de estrategias, scoring, validación y fallbacks.",
    items: [
      "Accessibility ID",
      "Resource ID",
      "UiAutomator",
      "XPath fallback",
      "Appium MATCH == 1",
      "Validation timeout",
    ],
  },

  inspector: {
    eyebrow: "INSPECTOR",
    title: "Inspector de elementos",
    description:
      "Comportamiento del inspector, jerarquía, screenshot y actualización.",
    items: [
      "Hierarchy refresh",
      "Screenshot refresh",
      "Element overlays",
      "Auto refresh",
      "Snapshot behavior",
    ],
  },

  logs: {
    eyebrow: "DIAGNOSTICS",
    title: "Logs y diagnóstico",
    description:
      "Control de observabilidad local y diagnóstico del runtime.",
    items: [
      "Nivel de log",
      "Appium Live",
      "Runtime logs",
      "Retención",
      "Export diagnostics",
    ],
  },

  advanced: {
    eyebrow: "ADVANCED",
    title: "Opciones avanzadas",
    description:
      "Parámetros experimentales y herramientas para diagnóstico técnico.",
    items: [
      "Experimental features",
      "Runtime information",
      "Reset settings",
      "Performance diagnostics",
      "Recorder experiments",
    ],
  },
};

export default function SettingsPanel({
  settings,
  language,
  onLanguageChange,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] =
    useState<MobFlowSettings>(settings);

  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("general");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const save = async () => {
    const keys = draft.capabilities.map(
      (capability) => capability.key.trim(),
    );

    const invalidCapability =
      draft.capabilities.some(
        (capability) => {
          const key = capability.key.trim();

          if (!key) {
            return true;
          }

          if (PROTECTED_CAPABILITIES.has(key)) {
            return true;
          }

          if (
            capability.type === "number" &&
            !Number.isFinite(
              Number(capability.value),
            )
          ) {
            return true;
          }

          if (
            capability.type === "boolean" &&
            capability.value !== "true" &&
            capability.value !== "false"
          ) {
            return true;
          }

          return false;
        },
      ) ||
      new Set(keys).size !== keys.length;

    if (invalidCapability) {
      return;
    }

    setSaving(true);

    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="settings-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="settings-center"
        role="dialog"
        aria-modal="true"
        aria-label="Configuración de MobFlow"
      >
        <header className="settings-center-header">
          <div>
            <span className="eyebrow">MOBFLOW</span>
            <h2>Configuración</h2>
            <p>
              Controla la apariencia, runtimes y comportamiento
              técnico de MobFlow.
            </p>
          </div>

          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="Cerrar configuración"
          >
            ×
          </button>
        </header>

        <div className="settings-center-layout">
          <aside className="settings-sidebar">
            <div className="settings-sidebar-label">
              CONFIGURACIÓN
            </div>

            <nav>
              {SETTINGS_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={
                    activeSection === section.id
                      ? "settings-nav-item settings-nav-active"
                      : "settings-nav-item"
                  }
                  onClick={() =>
                    setActiveSection(section.id)
                  }
                >
                  <strong>{section.label}</strong>
                  <span>{section.description}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="settings-content">
            {activeSection === "general" && (
              <>
                <div className="settings-page-heading">
                  <span className="eyebrow">
                    GENERAL
                  </span>
                  <h2>Preferencias</h2>
                  <p>
                    Personaliza la experiencia visual de
                    MobFlow.
                  </p>
                </div>

                <section className="settings-block">
                  <div className="settings-block-heading">
                    <h3>Tema</h3>
                    <p>
                      Usa el tema del sistema o fuerza una
                      apariencia específica.
                    </p>
                  </div>

                  <div className="theme-options">
                    {themes.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          draft.theme === option.value
                            ? "theme-option theme-option-active"
                            : "theme-option"
                        }
                        onClick={() =>
                          setDraft({
                            ...draft,
                            theme: option.value,
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings-block">
                  <div className="settings-block-heading">
                    <h3>Idioma</h3>
                    <p>
                      Selecciona el idioma de la interfaz de MobFlow.
                    </p>
                  </div>

                  <div className="language-settings-options">
                    <button
                      type="button"
                      className={
                        language === "es"
                          ? "language-setting-option language-setting-active"
                          : "language-setting-option"
                      }
                      onClick={() => onLanguageChange("es")}
                    >
                      <strong>Español</strong>
                      <span>ES</span>
                    </button>

                    <button
                      type="button"
                      className={
                        language === "en"
                          ? "language-setting-option language-setting-active"
                          : "language-setting-option"
                      }
                      onClick={() => onLanguageChange("en")}
                    >
                      <strong>English</strong>
                      <span>EN</span>
                    </button>
                  </div>
                </section>

                <section className="settings-block">
                  <div className="settings-block-heading">
                    <h3>Preferencias futuras</h3>
                    <p>
                      Esta sección alojará idioma, restauración
                      de contexto y comportamiento al iniciar.
                    </p>
                  </div>

                  <div className="settings-feature-grid">
                    <div>Idioma</div>
                    <div>Recordar dispositivo</div>
                    <div>Recordar aplicación</div>
                    <div>Auto-refresh del entorno</div>
                  </div>
                </section>
              </>
            )}

            {activeSection === "appium" && (
              <>
                <div className="settings-page-heading">
                  <span className="eyebrow">
                    APPIUM
                  </span>
                  <h2>Servidor de automatización</h2>
                  <p>
                    Configura la conexión utilizada por el
                    runtime local de Appium.
                  </p>
                </div>

                <section className="settings-block">
                  <div className="settings-block-heading">
                    <h3>Conexión</h3>
                    <p>
                      Los cambios se sincronizan con el
                      RuntimeConfig de MobFlow al guardar.
                    </p>
                  </div>

                  <div className="settings-grid">
                    <label>
                      <span>Host</span>
                      <input
                        value={draft.appiumHost}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            appiumHost:
                              event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>Puerto</span>
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={draft.appiumPort}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            appiumPort:
                              Number(
                                event.target.value,
                              ) || 4723,
                          })
                        }
                      />
                    </label>

                    <label className="settings-grid-wide">
                      <span>Base path</span>
                      <input
                        value={draft.appiumBasePath}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            appiumBasePath:
                              event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </section>

                <section className="settings-block">
                  <div className="settings-block-heading">
                    <h3>Capabilities</h3>
                    <p>
                      MobFlow protegerá las capabilities que
                      identifican el dispositivo y la AUT.
                    </p>
                  </div>

                  <CapabilityEditor
                    capabilities={draft.capabilities}
                    onChange={(capabilities) =>
                      setDraft({
                        ...draft,
                        capabilities,
                      })
                    }
                  />
                </section>
              </>
            )}

            {activeSection !== "general" &&
              activeSection !== "appium" && (
                <FutureSettingsPage
                  config={
                    futureSections[
                      activeSection as Exclude<
                        SettingsSectionId,
                        "general" | "appium"
                      >
                    ]
                  }
                />
              )}
          </main>
        </div>

        <footer className="settings-center-footer">
          <span className="settings-runtime-note">
            Los cambios de runtime se aplican al guardar.
          </span>

          <div>
            <button
              type="button"
              className="settings-cancel"
              onClick={onClose}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="settings-save"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving
                ? "Guardando..."
                : "Guardar cambios"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

const PROTECTED_CAPABILITIES = new Set([
  "platformName",
  "appium:automationName",
  "appium:udid",
  "appium:deviceName",
  "appium:appPackage",
  "appium:appActivity",
]);

function CapabilityEditor({
  capabilities,
  onChange,
}: {
  capabilities: MobFlowSettings["capabilities"];
  onChange: (
    capabilities: MobFlowSettings["capabilities"],
  ) => void;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const addCapability = () => {
    onChange([
      ...capabilities,
      {
        id: crypto.randomUUID(),
        key: "",
        value: "",
        type: "string",
      },
    ]);
  };

  const updateCapability = (
    id: string,
    patch: Partial<
      MobFlowSettings["capabilities"][number]
    >,
  ) => {
    onChange(
      capabilities.map((capability) =>
        capability.id === id
          ? { ...capability, ...patch }
          : capability,
      ),
    );
  };

  const removeCapability = (id: string) => {
    onChange(
      capabilities.filter(
        (capability) => capability.id !== id,
      ),
    );
  };

  const duplicateKeys = new Set(
    capabilities
      .map((item) => item.key.trim())
      .filter(
        (key, index, all) =>
          key &&
          all.indexOf(key) !== index,
      ),
  );

  return (
    <div className="capability-editor">
      <div className="capability-managed">
        <strong>Administradas por MobFlow</strong>
        <p>
          Device, automation engine, package y activity se
          resuelven automáticamente y no pueden sobrescribirse.
        </p>

        <div className="capability-managed-list">
          <code>platformName</code>
          <code>appium:automationName</code>
          <code>appium:udid</code>
          <code>appium:deviceName</code>
          <code>appium:appPackage</code>
          <code>appium:appActivity</code>
        </div>
      </div>

      {capabilities.length > 0 && (
        <div className="capability-table">
          <div className="capability-table-header">
            <span>Capability</span>
            <span>Valor</span>
            <span>Tipo</span>
            <span />
          </div>

          {capabilities.map((capability) => {
            const key = capability.key.trim();

            const protectedKey =
              PROTECTED_CAPABILITIES.has(key);

            const duplicate =
              duplicateKeys.has(key);

            const invalidNumber =
              capability.type === "number" &&
              capability.value.trim() !== "" &&
              !Number.isFinite(
                Number(capability.value),
              );

            const invalid =
              protectedKey ||
              duplicate ||
              invalidNumber;

            return (
              <div
                key={capability.id}
                className={
                  invalid
                    ? "capability-row capability-row-error"
                    : "capability-row"
                }
              >
                <div>
                  <input
                    value={capability.key}
                    placeholder="appium:noReset"
                    onChange={(event) =>
                      updateCapability(
                        capability.id,
                        {
                          key: event.target.value,
                        },
                      )
                    }
                  />

                  {protectedKey && (
                    <small>
                      Administrada por MobFlow
                    </small>
                  )}

                  {duplicate && (
                    <small>
                      Capability duplicada
                    </small>
                  )}
                </div>

                <div>
                  {capability.type === "boolean" ? (
                    <select
                      value={capability.value}
                      onChange={(event) =>
                        updateCapability(
                          capability.id,
                          {
                            value:
                              event.target.value,
                          },
                        )
                      }
                    >
                      <option value="">
                        Seleccionar
                      </option>
                      <option value="true">
                        true
                      </option>
                      <option value="false">
                        false
                      </option>
                    </select>
                  ) : (
                    <input
                      value={capability.value}
                      placeholder={
                        capability.type === "number"
                          ? "0"
                          : "valor"
                      }
                      onChange={(event) =>
                        updateCapability(
                          capability.id,
                          {
                            value:
                              event.target.value,
                          },
                        )
                      }
                    />
                  )}

                  {invalidNumber && (
                    <small>
                      Número inválido
                    </small>
                  )}
                </div>

                <select
                  value={capability.type}
                  onChange={(event) => {
                    const type =
                      event.target.value as
                        | "string"
                        | "number"
                        | "boolean";

                    updateCapability(
                      capability.id,
                      {
                        type,
                        value:
                          type === "boolean"
                            ? "true"
                            : "",
                      },
                    );
                  }}
                >
                  <option value="string">
                    String
                  </option>
                  <option value="number">
                    Number
                  </option>
                  <option value="boolean">
                    Boolean
                  </option>
                </select>

                <button
                  type="button"
                  className="capability-remove"
                  onClick={() =>
                    removeCapability(
                      capability.id,
                    )
                  }
                  aria-label="Eliminar capability"
                  title="Eliminar capability"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="capability-actions">
        <button
          type="button"
          className="capability-catalog-button"
          onClick={() =>
            setCatalogOpen((current) => !current)
          }
        >
          <span>+</span>
          {catalogOpen
            ? "Cerrar catálogo"
            : "Desde catálogo"}
        </button>

        <button
          type="button"
          className="capability-manual-button"
          onClick={addCapability}
        >
          <span>+</span>
          Agregar manualmente
        </button>
      </div>

      {catalogOpen && (
        <CapabilityCatalog
          capabilities={capabilities}
          search={catalogSearch}
          onSearchChange={setCatalogSearch}
          onAdd={(definition) => {
            const alreadyConfigured =
              capabilities.some(
                (capability) =>
                  capability.key.trim() ===
                  definition.key,
              );

            if (alreadyConfigured) {
              return;
            }

            onChange([
              ...capabilities,
              {
                id: crypto.randomUUID(),
                key: definition.key,
                value: definition.defaultValue,
                type: definition.type,
              },
            ]);
          }}
        />
      )}
    </div>
  );
}

function CapabilityCatalog({
  capabilities,
  search,
  onSearchChange,
  onAdd,
}: {
  capabilities: MobFlowSettings["capabilities"];
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: (
    definition:
      (typeof APPIUM_CAPABILITY_CATALOG)[number],
  ) => void;
}) {
  const normalizedSearch =
    search.trim().toLowerCase();

  const configuredKeys = new Set(
    capabilities.map(
      (capability) => capability.key.trim(),
    ),
  );

  const filtered =
    APPIUM_CAPABILITY_CATALOG.filter(
      (definition) => {
        if (!normalizedSearch) {
          return true;
        }

        return [
          definition.key,
          definition.label,
          definition.description,
          CAPABILITY_CATEGORY_LABELS[
            definition.category
          ],
        ].some((value) =>
          value
            .toLowerCase()
            .includes(normalizedSearch),
        );
      },
    );

  const categories = (
    Object.keys(
      CAPABILITY_CATEGORY_LABELS,
    ) as CapabilityCategory[]
  ).filter((category) =>
    filtered.some(
      (definition) =>
        definition.category === category,
    ),
  );

  return (
    <div className="capability-catalog">
      <div className="capability-catalog-top">
        <div>
          <strong>Catálogo Appium</strong>
          <span>
            Selecciona una capability conocida o
            agrégala manualmente.
          </span>
        </div>

        <span className="capability-catalog-count">
          {filtered.length}
        </span>
      </div>

      <div className="capability-search">
        <span aria-hidden="true">⌕</span>

        <input
          value={search}
          onChange={(event) =>
            onSearchChange(event.target.value)
          }
          placeholder="Buscar capability..."
          aria-label="Buscar capability"
        />

        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Limpiar búsqueda"
          >
            ×
          </button>
        )}
      </div>

      <div className="capability-catalog-body">
        {categories.length === 0 ? (
          <div className="capability-catalog-empty">
            No se encontraron capabilities.
          </div>
        ) : (
          categories.map((category) => {
            const definitions =
              filtered.filter(
                (definition) =>
                  definition.category ===
                  category,
              );

            return (
              <section
                key={category}
                className="capability-category"
              >
                <div className="capability-category-title">
                  {
                    CAPABILITY_CATEGORY_LABELS[
                      category
                    ]
                  }
                </div>

                <div className="capability-catalog-list">
                  {definitions.map(
                    (definition) => {
                      const configured =
                        configuredKeys.has(
                          definition.key,
                        );

                      return (
                        <div
                          key={definition.key}
                          className={
                            configured
                              ? "capability-catalog-item capability-catalog-item-added"
                              : "capability-catalog-item"
                          }
                        >
                          <div className="capability-catalog-copy">
                            <strong>
                              {definition.label}
                            </strong>

                            <code>
                              {definition.key}
                            </code>

                            <p>
                              {
                                definition.description
                              }
                            </p>

                            <div className="capability-catalog-meta">
                              <span>
                                {definition.type}
                              </span>

                              <span>
                                default:{" "}
                                {
                                  definition.defaultValue
                                }
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={configured}
                            onClick={() =>
                              onAdd(definition)
                            }
                          >
                            {configured
                              ? "Agregada"
                              : "+ Agregar"}
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>

      <div className="capability-catalog-warning">
        <strong>Configuración avanzada</strong>
        <span>
          Algunas capabilities pueden modificar el
          comportamiento de UiAutomator2, la jerarquía
          o el ciclo de vida de la aplicación.
        </span>
      </div>
    </div>
  );
}

function FutureSettingsPage({
  config,
}: {
  config: {
    eyebrow: string;
    title: string;
    description: string;
    items: string[];
  };
}) {
  return (
    <>
      <div className="settings-page-heading">
        <span className="eyebrow">
          {config.eyebrow}
        </span>

        <h2>{config.title}</h2>
        <p>{config.description}</p>
      </div>

      <section className="settings-block">
        <div className="settings-block-heading">
          <h3>Configuración disponible próximamente</h3>
          <p>
            La arquitectura del Settings Center ya reserva
            esta sección. Sus controles se conectarán al
            runtime de forma incremental.
          </p>
        </div>

        <div className="settings-feature-grid">
          {config.items.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      </section>
    </>
  );
}

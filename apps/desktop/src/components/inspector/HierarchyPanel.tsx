import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  InspectorElement,
  InspectorSnapshot,
} from "../../types/mobile";

import {
  buildElementSubtree,
} from "./inspector.utils";

import {
  calculateContextMenuPosition,
} from "./contextMenu.utils";

interface Props {
  snapshot: InspectorSnapshot;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onTestLocator: (
    strategy: string,
    value: string,
  ) => void;
}

interface ContextMenuState {
  anchorX: number;
  anchorY: number;
  left: number;
  top: number;
  elementId: string;
}

function elementLabel(
  element: InspectorElement,
): string {
  return (
    element.accessibilityId ||
    element.name ||
    element.label ||
    element.text ||
    element.resourceId?.split("/").pop() ||
    element.elementType.split(".").pop() ||
    "Unnamed element"
  );
}

function shortType(
  value: string,
): string {
  return value.split(".").pop() || value;
}

function serializeElement(
  element: InspectorElement,
) {
  return {
    id: element.id,
    platform: element.platform,
    type: element.elementType,

    attributes: {
      text: element.text,
      name: element.name,
      label: element.label,
      value: element.value,
      resourceId: element.resourceId,
      accessibilityId:
        element.accessibilityId,
      package: element.package,
    },

    state: {
      clickable: element.clickable,
      enabled: element.enabled,
      displayed: element.displayed,
      selected: element.selected,
    },

    bounds: element.bounds,

    locators: element.locators,

    parentId: element.parentId,
    childrenIds: element.childrenIds,
  };
}

function serializeSubtree(
  root: InspectorElement,
  snapshot: InspectorSnapshot,
) {
  const subtree =
    buildElementSubtree(
      root,
      snapshot.elements,
    );

  const byId = new Map(
    subtree.map((element) => [
      element.id,
      element,
    ]),
  );

  const buildNode = (
    element: InspectorElement,
  ): Record<string, unknown> => ({
    ...serializeElement(element),

    children: element.childrenIds
      .map((id) => byId.get(id))
      .filter(
        (
          child,
        ): child is InspectorElement =>
          Boolean(child),
      )
      .map(buildNode),
  });

  return buildNode(root);
}

export default function HierarchyPanel({
  snapshot,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onTestLocator,
}: Props) {
  const [search, setSearch] =
    useState("");

  const [contextMenu, setContextMenu] =
    useState<ContextMenuState | null>(
      null,
    );

  const contextMenuRef =
    useRef<HTMLDivElement | null>(null);

  const roots = useMemo(
    () =>
      snapshot.elements.filter(
        (element) => !element.parentId,
      ),
    [snapshot],
  );

  const matchingIds = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    if (!query) {
      return new Set(
        snapshot.elements.map(
          (element) => element.id,
        ),
      );
    }

    return new Set(
      snapshot.elements
        .filter((element) =>
          [
            elementLabel(element),
            element.elementType,
            element.resourceId ?? "",
            element.accessibilityId ?? "",
            element.text ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
        .map((element) => element.id),
    );
  }, [search, snapshot]);

  const selectedContextElement =
    contextMenu
      ? snapshot.elements.find(
          (element) =>
            element.id ===
            contextMenu.elementId,
        ) ?? null
      : null;

  useEffect(() => {
    const close = () =>
      setContextMenu(null);

    const handleKey = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener(
      "click",
      close,
    );

    window.addEventListener(
      "blur",
      close,
    );

    window.addEventListener(
      "keydown",
      handleKey,
    );

    return () => {
      window.removeEventListener(
        "click",
        close,
      );

      window.removeEventListener(
        "blur",
        close,
      );

      window.removeEventListener(
        "keydown",
        handleKey,
      );
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const menu =
      contextMenuRef.current;

    if (!menu) {
      return;
    }

    const rect =
      menu.getBoundingClientRect();

    const position =
      calculateContextMenuPosition(
        contextMenu.anchorX,
        contextMenu.anchorY,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight,
      );

    if (
      position.left === contextMenu.left &&
      position.top === contextMenu.top
    ) {
      return;
    }

    setContextMenu((current) =>
      current
        ? {
            ...current,
            left: position.left,
            top: position.top,
          }
        : current,
    );
  }, [contextMenu]);

  const copy = async (
    value: unknown,
  ) => {
    const text =
      typeof value === "string"
        ? value
        : JSON.stringify(
            value,
            null,
            2,
          );

    await navigator.clipboard.writeText(
      text,
    );

    setContextMenu(null);
  };

  const bestLocator =
    selectedContextElement?.locators.find(
      (locator) => locator.recommended,
    ) ??
    selectedContextElement?.locators[0] ??
    null;

  return (
    <aside className="mi-hierarchy-panel">
      <div className="mi-panel-header">
        <div>
          <strong>Hierarchy</strong>

          <span className="mi-panel-subtitle">
            Application structure
          </span>
        </div>

        <span>
          {snapshot.elements.length}
        </span>
      </div>

      <div className="mi-hierarchy-search">
        <span className="mi-search-icon">
          ⌕
        </span>

        <input
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value,
            )
          }
          placeholder="Search hierarchy..."
        />

        {search && (
          <button
            type="button"
            onClick={() =>
              setSearch("")
            }
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="mi-tree-scroll">
        {roots.map((root) => (
          <HierarchyNode
            key={root.id}
            element={root}
            snapshot={snapshot}
            depth={0}
            selectedId={selectedId}
            hoveredId={hoveredId}
            matchingIds={matchingIds}
            onSelect={onSelect}
            onHover={onHover}
            onContextMenu={(
              event,
              element,
            ) => {
              event.preventDefault();
              event.stopPropagation();

              onSelect(element.id);

              setContextMenu({
                anchorX: event.clientX,
                anchorY: event.clientY,
                left: event.clientX,
                top: event.clientY,
                elementId: element.id,
              });
            }}
          />
        ))}
      </div>

      {contextMenu &&
        selectedContextElement && (
          <div
            ref={contextMenuRef}
            className="mi-context-menu"
            style={{
              left: contextMenu.left,
              top: contextMenu.top,
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="mi-context-header">
              <span>ELEMENT</span>

              <strong>
                {elementLabel(
                  selectedContextElement,
                )}
              </strong>

              <small>
                {shortType(
                  selectedContextElement
                    .elementType,
                )}
              </small>
            </div>

            <button
              type="button"
              onClick={() => {
                onSelect(
                  selectedContextElement.id,
                );

                setContextMenu(null);
              }}
            >
              <span>◎</span>
              Inspect element
            </button>

            <div className="mi-context-separator" />

            <button
              type="button"
              onClick={() =>
                void copy(
                  serializeElement(
                    selectedContextElement,
                  ),
                )
              }
            >
              <span>⧉</span>
              Copy element
            </button>

            <button
              type="button"
              onClick={() =>
                void copy(
                  serializeSubtree(
                    selectedContextElement,
                    snapshot,
                  ),
                )
              }
            >
              <span>⌘</span>
              Copy subtree
            </button>

            <button
              type="button"
              onClick={() =>
                void copy({
                  text:
                    selectedContextElement.text,
                  name:
                    selectedContextElement.name,
                  label:
                    selectedContextElement.label,
                  value:
                    selectedContextElement.value,
                  resourceId:
                    selectedContextElement.resourceId,
                  accessibilityId:
                    selectedContextElement
                      .accessibilityId,
                  package:
                    selectedContextElement.package,
                  bounds:
                    selectedContextElement.bounds,
                })
              }
            >
              <span>≡</span>
              Copy attributes
            </button>

            <div className="mi-context-separator" />

            <button
              type="button"
              disabled={!bestLocator}
              onClick={() => {
                if (!bestLocator) {
                  return;
                }

                void copy(
                  bestLocator.value,
                );
              }}
            >
              <span>⌁</span>
              Copy best locator
            </button>

            <button
              type="button"
              disabled={!bestLocator}
              onClick={() => {
                if (!bestLocator) {
                  return;
                }

                onTestLocator(
                  bestLocator.strategy,
                  bestLocator.value,
                );

                setContextMenu(null);
              }}
            >
              <span>✓</span>
              Test best locator
            </button>
          </div>
        )}
    </aside>
  );
}

function HierarchyNode({
  element,
  snapshot,
  depth,
  selectedId,
  hoveredId,
  matchingIds,
  onSelect,
  onHover,
  onContextMenu,
}: {
  element: InspectorElement;
  snapshot: InspectorSnapshot;
  depth: number;
  selectedId: string | null;
  hoveredId: string | null;
  matchingIds: Set<string>;

  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;

  onContextMenu: (
    event: React.MouseEvent,
    element: InspectorElement,
  ) => void;
}) {
  const [expanded, setExpanded] =
    useState(depth < 4);

  const children =
    element.childrenIds
      .map((id) =>
        snapshot.elements.find(
          (candidate) =>
            candidate.id === id,
        ),
      )
      .filter(
        (
          child,
        ): child is InspectorElement =>
          Boolean(child),
      );

  const selfMatches =
    matchingIds.has(element.id);

  const descendantMatches =
    children.some((child) =>
      subtreeMatches(
        child,
        snapshot,
        matchingIds,
      ),
    );

  if (
    !selfMatches &&
    !descendantMatches
  ) {
    return null;
  }

  return (
    <>
      <div
        className={[
          "mi-tree-node",
          selectedId === element.id
            ? "mi-tree-selected"
            : "",
          hoveredId === element.id
            ? "mi-tree-hovered"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          "--tree-depth": depth,
        } as React.CSSProperties}
        onMouseEnter={() =>
          onHover(element.id)
        }
        onMouseLeave={() =>
          onHover(null)
        }
        onContextMenu={(event) =>
          onContextMenu(
            event,
            element,
          )
        }
      >
        <button
          type="button"
          className="mi-tree-expand"
          disabled={!children.length}
          onClick={() =>
            setExpanded(
              (current) => !current,
            )
          }
          aria-label={
            expanded
              ? "Collapse"
              : "Expand"
          }
        >
          {children.length
            ? expanded
              ? "⌄"
              : "›"
            : "·"}
        </button>

        <button
          type="button"
          className="mi-tree-select"
          onClick={() =>
            onSelect(element.id)
          }
        >
          <span
            className={[
              "mi-node-icon",
              element.clickable
                ? "mi-node-interactive"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {element.clickable
              ? "◆"
              : "◇"}
          </span>

          <span className="mi-node-content">
            <strong>
              {elementLabel(element)}
            </strong>

            <small>
              {shortType(
                element.elementType,
              )}
            </small>
          </span>

          {element.locators.length > 0 && (
            <span
              className="mi-node-locator"
              title={`${element.locators.length} verified locator(s)`}
            >
              {element.locators.length}
            </span>
          )}
        </button>
      </div>

      {expanded &&
        children.map((child) => (
          <HierarchyNode
            key={child.id}
            element={child}
            snapshot={snapshot}
            depth={depth + 1}
            selectedId={selectedId}
            hoveredId={hoveredId}
            matchingIds={matchingIds}
            onSelect={onSelect}
            onHover={onHover}
            onContextMenu={
              onContextMenu
            }
          />
        ))}
    </>
  );
}

function subtreeMatches(
  element: InspectorElement,
  snapshot: InspectorSnapshot,
  matchingIds: Set<string>,
): boolean {
  if (matchingIds.has(element.id)) {
    return true;
  }

  return element.childrenIds.some(
    (id) => {
      const child =
        snapshot.elements.find(
          (candidate) =>
            candidate.id === id,
        );

      return child
        ? subtreeMatches(
            child,
            snapshot,
            matchingIds,
          )
        : false;
    },
  );
}

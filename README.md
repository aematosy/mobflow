# MobFlow

**MobFlow** is a desktop toolkit for mobile test automation that brings device inspection, real application interaction, action recording, locator intelligence, and automation diagnostics into a single workspace.

## Vision

Mobile automation commonly separates inspection, interaction, recording, locator analysis, and test generation into disconnected tools.

MobFlow is being built around a unified workflow:

    Device
      ↓
    Inspect
      ↓
    Understand UI hierarchy
      ↓
    Resolve robust targets
      ↓
    Interact
      ↓
    Record user behavior
      ↓
    Build automation intelligence

The goal is to capture what a user actually does while preserving enough UI context to create robust and maintainable automation.

## Current capabilities

### Mobile Spy

MobFlow provides an interactive mobile inspector with:

- Android UI hierarchy inspection
- Katalon-style pointer-driven element discovery
- visual element highlighting
- precise leaf-element hit testing
- synchronized hierarchy and visual selection
- element properties
- parent/child hierarchy navigation
- lazy locator analysis
- verified locator candidates

Inspect mode is observational. Selecting an element does not interact with the application.

### Interactive device mode

Interact mode allows real application interaction from the desktop viewport.

The interaction pipeline follows:

    Visual intent
        ↓
    Target resolution
        ↓
    Locator-first interaction
        ↓
    Coordinate fallback
        ↓
    Application state validation

Inspection and interaction are deliberately separated so inspecting an element cannot accidentally modify application state.

### Mobile Recorder

The recorder foundation currently supports:

- taps
- swipes
- Android navigation actions
- physical-device input capture
- gesture normalization
- recording sessions
- target enrichment
- locator enrichment

Physical Android actions can be observed through low-level device input events.

### Locator intelligence

Locator analysis is separated from raw hierarchy capture.

Snapshots remain lightweight while locator analysis is performed lazily for selected or recorded elements.

The architecture supports strategies such as:

- accessibility identifiers
- resource identifiers
- XPath
- Android UIAutomator
- relational and contextual locators

Locator candidates can be evaluated for uniqueness and stability before being used by automation.

### Application lifecycle

For local mobile applications, MobFlow can:

- discover connected devices
- read metadata from the selected application
- install the selected local application on the selected device
- manage Appium sessions
- use UiAutomator2 for Android automation
- prepare clean automation contexts
- validate foreground application ownership

### Runtime diagnostics

MobFlow exposes diagnostics for:

- Appium operations
- device operations
- application lifecycle
- interactions
- locator resolution
- physical input capture
- runtime errors

## Architecture

MobFlow currently combines:

**Desktop**
- Tauri
- React
- TypeScript
- Vite

**Native automation services**
- Rust
- ADB
- Appium
- UiAutomator2

High-level architecture:

    ┌─────────────────────────────────────┐
    │             MobFlow UI              │
    │       React + TypeScript + Vite     │
    ├─────────────────────────────────────┤
    │            Tauri Bridge             │
    ├─────────────────────────────────────┤
    │            Rust Services            │
    │                                     │
    │ App │ Device │ Spy │ Recorder       │
    │ Appium │ Stream │ Logs │ Locators   │
    ├─────────────────────────────────────┤
    │        Automation Providers         │
    │                                     │
    │      ADB · Appium · UiAutomator2    │
    ├─────────────────────────────────────┤
    │            Mobile Device            │
    └─────────────────────────────────────┘

## Inspector model

MobFlow treats inspection, interaction, and recording as separate concerns.

### Inspect

    Pointer movement
        ↓
    Visual hit test
        ↓
    Highlight element
        ↓
    Click
        ↓
    Select element
        ↓
    Properties + locator analysis

No device action is executed.

### Interact

    Pointer action
        ↓
    Resolve automation target
        ↓
    Execute interaction
        ↓
    Refresh application state

### Record

    User/device action
        ↓
    Capture gesture
        ↓
    Persist action
        ↓
    Resolve target
        ↓
    Enrich automation metadata

## Device-agnostic design

MobFlow avoids application-specific and device-specific coordinate hardcoding.

Geometry and interaction should be derived from runtime information rather than assumptions about:

- device model
- screen resolution
- phone or tablet form factor
- physical or virtual device
- orientation
- display density
- system bars

The architecture is intended to evolve across Android and iOS devices with different screen characteristics.

## Repository structure

    mobflow/
    ├── apps/
    │   └── desktop/
    │       ├── src/          # React / TypeScript UI
    │       └── src-tauri/    # Rust / Tauri backend
    ├── packages/
    ├── adapters/
    ├── agents/
    ├── package.json
    └── README.md

Some workspace directories are extension points for future capabilities.

## Requirements

Development currently requires:

- Node.js
- npm
- Rust toolchain
- Tauri prerequisites
- Android SDK / ADB
- Appium
- UiAutomator2 driver

Verify the main tools:

    node --version
    npm --version
    cargo --version
    adb version
    appium --version

## Development

Install dependencies from the repository root:

    npm install

Run MobFlow:

    cd apps/desktop
    npm run tauri dev

Validate the frontend:

    cd apps/desktop
    npx tsc --noEmit
    npm run build

Validate the Rust backend:

    cd apps/desktop/src-tauri
    cargo fmt
    cargo check

## Project status

MobFlow is under active development.

Current engineering priorities include:

1. reliable mobile inspection
2. responsive device interaction
3. physical and virtual-device recording
4. robust locator intelligence
5. snapshot and gesture consistency
6. automation generation
7. validation and review workflows
8. execution and reporting

## Roadmap

    Mobile Spy
        ↓
    Recorder
        ↓
    Application / project intelligence
        ↓
    Test design
        ↓
    Implementation planning
        ↓
    Automation generation
        ↓
    Review and validation
        ↓
    Execution and reporting

## Engineering principles

MobFlow favors:

- generic behavior over application-specific hardcoding
- semantic locators over fragile coordinates
- explicit fallbacks over silent assumptions
- observable automation infrastructure
- fail-closed behavior when resolution is uncertain
- separation between inspection and interaction
- lightweight snapshots with lazy enrichment
- device-agnostic geometry
- reusable automation intelligence

## License

No open-source license has been selected yet.

Until a license is added, all rights remain reserved by the repository owner.

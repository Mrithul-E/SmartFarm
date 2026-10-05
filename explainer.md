# SmartFarm Dashboard — Architecture & Design Explainer

This document details the SmartFarm MQTT dashboard's standard web layout system, equipment mode toggles, multi-broker connection failover, inline SVG icon architecture, technical operation, styling rules, and maintenance guidelines.

---

## 1. Interactive MQTT Broker Selector & Failover System

The SmartFarm dashboard provides an **Interactive Broker Dropdown** in the header allowing users to manually switch brokers or automatically failover across 5 public brokers:

| Dropdown Option | Broker Name | Host Domain | WSS Port (Browser) | TCP Port (Microcontroller) | Path | SSL / TLS |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: |
| **0** | **EMQX** | `broker.emqx.io` | `8084` | `8883` | `/mqtt` | `true` |
| **1** | **HiveMQ** | `broker.hivemq.com` | `8884` | `8883` | `/mqtt` | `true` |
| **2** | **Mosquitto** | `test.mosquitto.org` | `8081` | `8883` | `/mqtt` | `true` |
| **3** | **Bevywise** | `public-mqtt-broker.bevywise.com` | `10443` | `10443` | `/mqtt` | `false` |
| **4** | **Eclipse** | `mqtt.eclipseprojects.io` | `443` | `8883` | `/mqtt` | `true` |

---

## 2. Visual Design Theme (Standard Non-Card Web Layout)

The UI has been designed according to standard, human-engineered web interface guidelines (inspired by **Cloudflare Dashboard, Google Admin Console, and Wikipedia**):

- **No Nested Card Containers**: Content flows naturally on the page surface in clean, semantic HTML sections.
- **Flat 1px Section Dividers**: Sections and rows are demarcated with clean horizontal borderlines (`border-bottom: 1px solid #e2e8f0`).
- **Clean Streamlined Header**: Top header featuring brand logo, interactive broker dropdown (`#broker-select`), connection status badge (`#broker-status`), and icon-only reconnect button (`#reconnect-btn`).

---

## 3. 2-Line Equipment Controls Structure

Each equipment item in the **Equipment Controls** section is organized across **2 clean horizontal lines** (`.std-control-item`):

- **Line 1 (Header Line)**:
  - **Left**: Item Icon + Item Name (e.g. `Garden Gate`, `Irrigation System`, `Garden Lighting`).
  - **Right**: Main Mode Toggle (`Manual gate` / `Auto gate`, `Manual irrigation` / `Auto irrigation`) or Main Light Switch (`OFF` / `ON`).
- **Line 2 (Action Controls Line)**:
  - **Left / Inline**: Action Buttons (`Close` / `Open`, `Stop` / `Start`) and extra controls (`Gate status: LOCKED` chip, `RGB Color` picker).

---

## 4. Connection Status Icons & Native Inline Vectors

All status indicators use native inline vector SVGs to guarantee 100% reliable rendering:

| Connection State | Status Label | Visual Representation | SVG Vector Architecture |
| :--- | :--- | :--- | :--- |
| **Connecting** | `CONNECTING` | Rotating Loader | Animated spinning SVG ring loader (`status-icon-connecting`) |
| **Connected (Online)** | `ONLINE` | Plug Socket Connected Sign | Electrical plug & socket SVG path (`status-icon-online`) |
| **Offline** | `OFFLINE` | Signal Bars Sign with Cross | 4 signal strength bars + diagonal cross (`X`) SVG (`status-icon-offline`) |

---

## 5. Technical Integration & MQTT Data Flow

All DOM IDs and JavaScript event listeners are 100% preserved:
- `#broker-select`: Interactive change listener switches broker on selection and triggers instant client reconnect.
- `#reconnect-btn`: Click handler disconnects/reconnects the Paho MQTT client using the broker array.
- `updateGateMode(mode)`: Toggles active segment button, sends MQTT `AG` payload (`ON`/`OFF`), and shows/hides `#gate-actions`.
- `updateIrrigationMode(mode)`: Toggles active segment button, sends MQTT `AI` payload (`ON`/`OFF`), and shows/hides `#irrigation-actions`.
- `setBrokerStatus(status)`: Dynamically swaps status SVG vectors and colors (`connecting`, `online`, `offline`).

---

## 6. Credits & Dependencies

- **Brokers**: EMQX (`broker.emqx.io:8883`), HiveMQ (`broker.hivemq.com:8883`), Mosquitto (`test.mosquitto.org:8883`), Bevywise (`public-mqtt-broker.bevywise.com:10443`), Eclipse (`mqtt.eclipseprojects.io:8883`).
- **Design Inspiration**: Cloudflare Dashboard, Google Admin Console, Wikipedia.
- **Icon Architecture**: Native Inline SVG Vectors & Font Awesome 6.7.2.
- **MQTT Engine**: Eclipse Paho JavaScript Client (`paho-mqtt-min.js`).
- **UI Frameworks**: Bootstrap 5 Grid & jQuery 3.7.1.

---

## 7. Maintenance Protocol

Whenever updating controls, themes, brokers, or icons:
1. Update `index.html`, `styles.css`, or `app.js`.
2. Keep `explainer.md` synchronized with design specifications and control logic.

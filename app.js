/* global Paho, bootstrap */
(function ($) {
  "use strict";

  const BROKERS = [
    { name: "EMQX", label: "EMQX (broker.emqx.io:8883)", host: "broker.emqx.io", port: 8084, path: "/mqtt", useSSL: true, tcpPort: 8883 },
    { name: "HiveMQ", label: "HiveMQ (broker.hivemq.com:8883)", host: "broker.hivemq.com", port: 8884, path: "/mqtt", useSSL: true, tcpPort: 8883 },
    { name: "Mosquitto", label: "Mosquitto (test.mosquitto.org:8883)", host: "test.mosquitto.org", port: 8081, path: "/mqtt", useSSL: true, tcpPort: 8883 },
    { name: "Bevywise", label: "Bevywise (public-mqtt-broker.bevywise.com:10443)", host: "public-mqtt-broker.bevywise.com", port: 10443, path: "/mqtt", useSSL: false, tcpPort: 10443 },
    { name: "Eclipse", label: "Eclipse (eclipseprojects.io:8883)", host: "mqtt.eclipseprojects.io", port: 443, path: "/mqtt", useSSL: true, tcpPort: 8883 }
  ];
  let currentBrokerIndex = 0;

  const CONFIG = {
    prefix: "sreehari32/"
  };
  const SERVICE_WORKER_VERSION = "18";

  const state = {
    brokerConnected: false,
    deviceStatus: null,
    alerts: { lowWater: false, soilDry: false, flame: false },
    commands: { AG: "OFF", Lock: "Lock", AI: "OFF" },
    lightActualState: null,
    lightRequestedState: null,
    client: null,
    reconnectTimer: null
  };

  const numberOrDash = (value, suffix) => {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(numeric % 1 ? 1 : 0)}${suffix}` : `--${suffix}`;
  };

  const STATUS_ICONS = {
    connecting: '<svg class="status-svg-icon status-icon-connecting" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25"/><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor"/></svg>',
    online: '<svg class="status-svg-icon status-icon-online" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2v6M15 2v6M5 8h14v3a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4V8z"/><path d="M12 15v7"/></svg>',
    offline: '<svg class="status-svg-icon status-icon-offline" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="15" width="3" height="6" rx="0.5" fill="currentColor" stroke="none"/><rect x="7" y="11" width="3" height="10" rx="0.5" fill="currentColor" stroke="none"/><rect x="12" y="7" width="3" height="14" rx="0.5" fill="currentColor" stroke="none" opacity="0.4"/><rect x="17" y="3" width="3" height="18" rx="0.5" fill="currentColor" stroke="none" opacity="0.4"/><line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2.5"/><line x1="21" y1="3" x2="3" y2="21" stroke="currentColor" stroke-width="2.5"/></svg>'
  };

  function updateGateMode(mode) {
    const isAuto = mode === "auto" || mode === "ON";
    const $container = $("#gate-mode-toggle");
    $container.find('.mode-toggle-btn[data-mode="manual"]').toggleClass("is-active", !isAuto);
    $container.find('.mode-toggle-btn[data-mode="auto"]').toggleClass("is-active", isAuto);
    if (isAuto) {
      $("#gate-actions").slideUp(150);
    } else {
      $("#gate-actions").slideDown(150);
    }
    $("#ag-state").text(isAuto ? "ON" : "OFF");
    state.commands.AG = isAuto ? "ON" : "OFF";
  }

  function updateIrrigationMode(mode) {
    const isAuto = mode === "auto" || mode === "ON";
    const $container = $("#irrigation-mode-toggle");
    $container.find('.mode-toggle-btn[data-mode="manual"]').toggleClass("is-active", !isAuto);
    $container.find('.mode-toggle-btn[data-mode="auto"]').toggleClass("is-active", isAuto);
    if (isAuto) {
      $("#irrigation-actions").slideUp(150);
    } else {
      $("#irrigation-actions").slideDown(150);
    }
    $("#ai-state").text(isAuto ? "ON" : "OFF");
    state.commands.AI = isAuto ? "ON" : "OFF";
  }

  function setBrokerStatus(status) {
    const online = status === "online";
    const currentStatus = online ? "online" : status === "offline" ? "offline" : "connecting";
    const $status = $("#broker-status").removeClass("online offline connecting").addClass(currentStatus);
    
    $status.find(".status-label").text(online ? "ONLINE" : status === "offline" ? "OFFLINE" : "CONNECTING");
    $status.find(".status-icon-wrapper").html(STATUS_ICONS[currentStatus] || STATUS_ICONS.connecting);
    
    $(".broker-detail-text, #broker-detail").text(online ? "Connected" : status === "offline" ? "Unavailable" : "Connecting");
  }

  function setDeviceStatus(status) {
    let raw = String(status || "").trim();
    let normalized = raw.toUpperCase();
    if (["1", "CONNECTED", "ACTIVE", "TRUE", "ONLINE", "ON"].includes(normalized)) {
      normalized = "ONLINE";
    } else if (["0", "DISCONNECTED", "FALSE", "OFFLINE", "OFF"].includes(normalized)) {
      normalized = "OFFLINE";
    }
    state.deviceStatus = normalized || null;
    const online = normalized === "ONLINE";
    const known = normalized === "ONLINE" || normalized === "OFFLINE";

    const statusText = known ? normalized : (normalized || "AWAITING STATUS");
    const detailText = known ? normalized : (normalized || "No status yet");

    $("#esp-status, .esp-status-text").text(statusText);
    $("#device-detail, .device-detail-text").text(detailText);
    $("#system-health").text(online ? "Garden is connected" : normalized === "OFFLINE" ? "Device is offline" : "Standing by");
    $("#system-health-copy").text(online ? "ESP32 is reporting from the garden" : normalized === "OFFLINE" ? "Waiting for the ESP32 to return" : "Waiting for ESP32 connection");

    $(".system-brief, .system-panel").removeClass("online offline device-online device-offline");
    if (online) {
      $(".system-brief").addClass("online");
      $(".system-panel").addClass("device-online");
    } else if (normalized === "OFFLINE") {
      $(".system-brief").addClass("offline");
      $(".system-panel").addClass("device-offline");
    }
  }

  function updateLightToggle(value) {
    const normalized = String(value || "").trim().toUpperCase();
    // RGB light wiring is inverted: ESP32 ON means the physical LED is off.
    state.lightActualState = normalized === "ON" ? "OFF" : normalized === "OFF" ? "ON" : null;
    if (state.lightRequestedState === state.lightActualState) state.lightRequestedState = null;
    renderLightToggle();
  }

  function renderLightToggle() {
    const isOn = (state.lightRequestedState || state.lightActualState) === "ON";
    const $toggle = $("#light-toggle");
    $toggle.toggleClass("is-on", isOn)
      .attr("aria-checked", String(isOn));
  }

  function updateDetection(selector, text, alarm) {
    const normalized = String(text || "").trim().toLowerCase();
    const detected = normalized === "detected";
    $(selector).removeClass("detected alarm").toggleClass(alarm ? "alarm" : "detected", detected);
  }

  function setAlert(name, active) {
    state.alerts[name] = active;
    renderAlerts();
  }

  function renderAlerts() {
    const alerts = [];
    if (state.alerts.lowWater) alerts.push({ icon: "fa-glass-water", title: "LOW WATER", copy: "Tank is below the safe refill threshold." });
    if (state.alerts.soilDry) alerts.push({ icon: "fa-wheat-awn", title: "SOIL MOISTURE LOW", copy: "The soil needs attention or auto irrigation." });
    if (state.alerts.flame) alerts.push({ icon: "fa-fire-flame-curved", title: "FLAME DETECTED", copy: "Check the garden area immediately." });
    const $count = $("#alert-count").text(alerts.length).toggleClass("has-alerts", alerts.length > 0);
    const $topAlerts = $("#top-alerts-list");
    if (!alerts.length) {
      $("#alerts-list").html('<div class="all-clear"><span><i class="fa-solid fa-check"></i></span><div><strong>No active alerts</strong><p>Your garden is operating within safe thresholds.</p></div></div>');
      $topAlerts.html('<div class="top-alert-state is-safe"><i class="fa-solid fa-check"></i><span><strong>No active alerts</strong><small>Water, soil, and flame conditions are safe.</small></span></div>');
      return;
    }
    $("#alerts-list").html(alerts.map(alert => `<div class="alert-item"><i class="fa-solid ${alert.icon}"></i><div><strong>${alert.title}</strong><p>${alert.copy}</p></div></div>`).join(""));
    $topAlerts.html(alerts.map(alert => `<div class="top-alert-state is-alert"><i class="fa-solid ${alert.icon}"></i><span><strong>${alert.title}</strong><small>${alert.copy}</small></span></div>`).join(""));
  }

  function updateTimestamp() {
    const stamp = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date());
    $("#last-updated").text(`Last signal at ${stamp}`);
  }

  function addActivity(topic, payload, isCommand) {
    const leaf = topic.replace(CONFIG.prefix, "");
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date());
    const $item = $("<div>", { class: `activity-item${isCommand ? " command" : ""}` })
      .append('<span class="activity-dot"></span>')
      .append($("<strong>").text(`${leaf} · ${payload}`))
      .append($("<span>").text(time));
    const $list = $("#activity-list");
    $list.find(".activity-empty").remove();
    $list.prepend($item);
    $list.children(".activity-item").slice(8).remove();
  }

  function showToast(message, type) {
    const icon = type === "error" ? "fa-circle-exclamation" : "fa-circle-check";
    const id = `toast-${Date.now()}`;
    const $toast = $(`<div id="${id}" class="toast app-toast" role="status" aria-live="polite" aria-atomic="true"><div class="toast-body"><i class="fa-solid ${icon}"></i>${message}</div></div>`);
    $("#toast-area").append($toast);
    const toast = new bootstrap.Toast($toast[0], { delay: 3000 });
    $toast.on("hidden.bs.toast", () => $toast.remove());
    toast.show();
  }

  function publish(topic, payload, feedback) {
    if (!state.client || !state.brokerConnected) {
      showToast("MQTT broker is not connected. Command was not sent.", "error");
      return false;
    }
    try {
      const message = new Paho.Message(String(payload));
      message.destinationName = `${CONFIG.prefix}${topic}`;
      message.qos = 0;
      state.client.send(message);
      if (["Gate", "Light"].includes(topic)) console.log("[SmartFarm MQTT] sent", { topic, payload: String(payload) });
      addActivity(message.destinationName, payload, true);
      if (feedback) showToast(feedback);
      return true;
    } catch (error) {
      console.error("MQTT publish failed", error);
      showToast("Could not send that command.", "error");
      return false;
    }
  }

  let deviceWatchdogTimer = null;

  function resetDeviceWatchdog() {
    clearTimeout(deviceWatchdogTimer);
    deviceWatchdogTimer = setTimeout(() => {
      setDeviceStatus("OFFLINE");
    }, 45000);
  }

  function handleMessage(topic, payload) {
    const key = topic.replace(CONFIG.prefix, "");
    const value = String(payload).trim();
    const keyLower = key.toLowerCase();

    if (["Lightr", "Gater", "Gate", "Light"].includes(key)) console.log("[SmartFarm MQTT] received", { topic: key, payload: value });

    // Any incoming message from ESP32 indicates hardware activity
    resetDeviceWatchdog();

    if (["status", "state", "esp", "esp32", "device"].includes(keyLower)) {
      setDeviceStatus(value);
    } else if (state.deviceStatus !== "OFFLINE") {
      // Receiving telemetry from ESP32 automatically confirms it is ONLINE
      setDeviceStatus("ONLINE");
    }

    switch (key) {
      case "Temp": $("#temp-value").html(numberOrDash(value, "<small>°C</small>")); break;
      case "Hum": $("#hum-value").html(numberOrDash(value, "<small>%</small>")); break;
      case "MOA": {
        const moisture = Number.parseFloat(value);
        $("#moisture-value").html(numberOrDash(value, "<small>%</small>"));
        if (Number.isFinite(moisture)) $("#moisture-bar").css("width", `${Math.max(0, Math.min(100, moisture))}%`);
        break;
      }
      case "WL": {
        const water = Number.parseFloat(value);
        $("#water-value").html(numberOrDash(value, "<small>%</small>"));
        if (Number.isFinite(water)) {
          $("#water-bar").css("width", `${Math.max(0, Math.min(100, water))}%`).toggleClass("low", water < 10);
          if (water >= 15) setAlert("lowWater", false);
        }
        break;
      }
      case "Dist": $("#dist-value").text(Number(value) === -1 ? "No valid reading" : numberOrDash(value, " cm")); break;
      case "IR": $("#ir-value").text(value || "Awaiting data"); updateDetection("#ir-sensor", value, false); break;
      case "US": $("#us-value").text(value || "Awaiting data"); updateDetection("#ultrasonic-sensor", value, false); break;
      case "Flame": $("#flame-value").text(value || "Awaiting data"); updateDetection("#flame-sensor", value, true); if (value.toLowerCase() === "not detected") setAlert("flame", false); break;
      case "Lightr": updateLightToggle(value); break;
      case "AG": case "AGr": updateGateMode(value); break;
      case "AI": case "AIr": updateIrrigationMode(value); break;
      case "status": case "Status": case "STATUS": case "state": case "State": case "STATE": setDeviceStatus(value); break;
      case "SMMA": if (value === "1") setAlert("soilDry", true); break;
      case "STMA": if (value === "1") setAlert("soilDry", false); break;
      case "WLA": if (value === "1") setAlert("lowWater", true); break;
      case "FLA": if (value === "1") setAlert("flame", true); break;
      default:
        if (!["status", "state", "esp", "esp32", "device"].includes(keyLower)) return;
        break;
    }
    updateTimestamp();
    addActivity(topic, value, false);
  }

  function connect() {
    if (typeof Paho === "undefined") {
      setBrokerStatus("offline");
      showToast("MQTT client library could not load.", "error");
      return;
    }
    clearTimeout(state.reconnectTimer);
    setBrokerStatus("connecting");
    
    const broker = BROKERS[currentBrokerIndex];
    const clientId = `smartfarm-${Math.random().toString(16).slice(2, 10)}`;
    state.client = new Paho.Client(broker.host, broker.port, broker.path, clientId);

    state.client.onConnectionLost = response => {
      state.brokerConnected = false;
      setBrokerStatus("offline");
      clearTimeout(deviceWatchdogTimer);
      setDeviceStatus("OFFLINE");
      if (response.errorCode !== 0) console.warn(`[MQTT] Connection lost on ${broker.name}`, response.errorMessage);
      clearTimeout(state.reconnectTimer);
      currentBrokerIndex = (currentBrokerIndex + 1) % BROKERS.length;
      $("#broker-select").val(currentBrokerIndex);
      state.reconnectTimer = setTimeout(connect, 3000);
    };

    state.client.onMessageArrived = message => handleMessage(message.destinationName, message.payloadString);

    state.client.connect({
      useSSL: broker.useSSL,
      timeout: 5,
      onSuccess: () => {
        state.brokerConnected = true;
        setBrokerStatus("online");
        $("#broker-detail").text(`Connected (${broker.name})`);
        $("#broker-select").val(currentBrokerIndex);
        state.client.subscribe(`${CONFIG.prefix}#`, { qos: 0 });
        showToast(`Connected to MQTT broker (${broker.name}).`);
      },
      onFailure: response => {
        state.brokerConnected = false;
        console.warn(`[MQTT] Host ${broker.host} failed:`, response.errorMessage || response.errorCode);
        currentBrokerIndex = (currentBrokerIndex + 1) % BROKERS.length;
        $("#broker-select").val(currentBrokerIndex);
        const nextBroker = BROKERS[currentBrokerIndex];
        console.info(`[MQTT] Switching failover to ${nextBroker.name} (${nextBroker.host})...`);
        setBrokerStatus("connecting");
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = setTimeout(connect, 1000);
      }
    });
  }

  function applyCommandState($button, next) {
    const target = $button.data("state-target");
    const activeWhen = $button.data("active-when") || "ON";
    $button.toggleClass("is-active", next === activeWhen);
    $(target).text(next === "Unlock" ? "UNLOCKED" : next);
  }

  function sendRgb(hex) {
    const clean = hex.replace("#", "");
    const red = Number.parseInt(clean.slice(0, 2), 16) / 255;
    const green = Number.parseInt(clean.slice(2, 4), 16) / 255;
    const blue = Number.parseInt(clean.slice(4, 6), 16) / 255;
    const payload = [red, green, blue].map(channel => channel.toFixed(2)).join(",");
    if (publish("RGB", payload, "RGB color sent to garden lights.")) $("#rgb-swatch").css("background-color", hex);
  }

  $(function () {
    $("#broker-select").on("change", function () {
      const selectedIndex = Number.parseInt($(this).val(), 10);
      if (!Number.isNaN(selectedIndex) && BROKERS[selectedIndex]) {
        currentBrokerIndex = selectedIndex;
        if (state.client && state.brokerConnected) {
          try {
            state.client.disconnect();
          } catch (e) {
            console.warn("Disconnect error", e);
          }
        }
        connect();
      }
    });

    $(".mode-toggle-btn").on("click", function () {
      const $btn = $(this);
      const topic = $btn.data("topic");
      const mode = $btn.data("mode");
      const val = $btn.data("value");
      const label = topic === "AG" ? "Gate" : "Irrigation";
      if (publish(topic, val, `${label} set to ${mode} mode.`)) {
        if (topic === "AG") updateGateMode(mode);
        if (topic === "AI") updateIrrigationMode(mode);
      }
    });
    $(".mqtt-command").on("click", function () {
      const $button = $(this);
      const topic = $button.data("topic");
      const message = $button.data("message");
      const feedback = topic === "Pump" ? `Pump ${message.toLowerCase()} command sent. Waiting for device state.` : `${topic} command sent.`;
      publish(topic, message, feedback);
    });
    $(".command-chip").on("click", function () {
      const $button = $(this);
      const topic = $button.data("topic");
      const previous = state.commands[topic];
      const next = previous === $button.data("on") ? $button.data("off") : $button.data("on");
      const label = topic === "AG" ? "Auto gate" : topic === "AI" ? "Auto irrigation" : "Gate security";
      if (publish(topic, next, `${label} command set to ${next}.`)) {
        state.commands[topic] = next;
        applyCommandState($button, next);
      }
    });
    $("#light-toggle").on("click", () => {
      const current = state.lightActualState || state.lightRequestedState;
      const next = current === "ON" ? "OFF" : "ON";
      const deviceCommand = next === "ON" ? "OFF" : "ON";
      if (publish("Light", deviceCommand, `Light set to ${next.toLowerCase()}. Waiting for device state.`)) {
        state.lightRequestedState = next;
        renderLightToggle();
      }
    });
    $("#rgb-picker").on("change", function () { sendRgb(this.value); });
    $("#clear-activity").on("click", () => $("#activity-list").html('<p class="activity-empty">Messages will appear here.</p>'));
    $("#reconnect-btn").on("click", () => {
      if (state.client && state.brokerConnected) state.client.disconnect();
      connect();
    });
    if ("serviceWorker" in navigator && ["http:", "https:"].includes(window.location.protocol)) {
      let reloadingForUpdate = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!reloadingForUpdate) {
          reloadingForUpdate = true;
          window.location.reload();
        }
      });
      navigator.serviceWorker.register(`sw.js?v=${SERVICE_WORKER_VERSION}`, { updateViaCache: "none" })
        .then(registration => registration.update())
        .catch(error => console.warn("Service worker registration failed", error));
    } else if (window.location.protocol === "file:") {
      console.info("[SmartFarm] Open this project through a local HTTP server to enable PWA caching and installation.");
    }
    connect();
  });
})(jQuery);

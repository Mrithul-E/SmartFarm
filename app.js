/* global Paho, bootstrap */
(function ($) {
  "use strict";

  const CONFIG = {
    host: "test.mosquitto.org",
    port: window.location.protocol === "https:" ? 8081 : 8080,
    path: "/mqtt",
    useSSL: window.location.protocol === "https:",
    prefix: "sreehari32/"
  };

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

  function setBrokerStatus(status) {
    const online = status === "online";
    const $status = $("#broker-status").removeClass("online offline");
    if (status !== "connecting") $status.addClass(status);
    $status.find(".status-label").text(online ? "ONLINE" : status === "offline" ? "OFFLINE" : "CONNECTING");
    $("#broker-detail").text(online ? "Connected" : status === "offline" ? "Unavailable" : "Connecting");
  }

  function setDeviceStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();
    state.deviceStatus = normalized || null;
    const online = normalized === "ONLINE";
    const known = normalized === "ONLINE" || normalized === "OFFLINE";
    $("#esp-status").text(known ? normalized : "AWAITING STATUS");
    $("#device-detail").text(known ? normalized : "No status yet");
    $("#system-health").text(online ? "Garden is connected" : normalized === "OFFLINE" ? "Device is offline" : "Standing by");
    $("#system-health-copy").text(online ? "ESP32 is reporting from the garden" : normalized === "OFFLINE" ? "Waiting for the ESP32 to return" : "Waiting for ESP32 connection");
    $(".system-brief, .system-panel").removeClass("online offline device-online device-offline");
    if (online) $(".system-brief").addClass("online");
    if (normalized === "OFFLINE") $(".system-brief").addClass("offline");
    if (online) $(".system-panel").addClass("device-online");
    if (normalized === "OFFLINE") $(".system-panel").addClass("device-offline");
  }

  function updateLightToggle(value) {
    const normalized = String(value || "").trim().toUpperCase();
    state.lightActualState = normalized === "ON" || normalized === "OFF" ? normalized : null;
    state.lightRequestedState = null;
    renderLightToggle();
  }

  function renderLightToggle() {
    const isOn = (state.lightActualState || state.lightRequestedState) === "ON";
    const $toggle = $("#light-toggle");
    $toggle.toggleClass("is-on", isOn)
      .attr("aria-checked", String(isOn))
      .find(".light-toggle-label").text(isOn ? "Turn off" : "Turn on");
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
      addActivity(message.destinationName, payload, true);
      if (feedback) showToast(feedback);
      return true;
    } catch (error) {
      console.error("MQTT publish failed", error);
      showToast("Could not send that command.", "error");
      return false;
    }
  }

  function handleMessage(topic, payload) {
    const key = topic.replace(CONFIG.prefix, "");
    const value = String(payload).trim();
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
      case "status": setDeviceStatus(value); break;
      case "SMMA": if (value === "1") setAlert("soilDry", true); break;
      case "STMA": if (value === "1") setAlert("soilDry", false); break;
      case "WLA": if (value === "1") setAlert("lowWater", true); break;
      case "FLA": if (value === "1") setAlert("flame", true); break;
      default: return;
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
    const clientId = `smartfarm-${Math.random().toString(16).slice(2, 10)}`;
    state.client = new Paho.Client(CONFIG.host, CONFIG.port, CONFIG.path, clientId);
    state.client.onConnectionLost = response => {
      state.brokerConnected = false;
      setBrokerStatus("offline");
      if (response.errorCode !== 0) console.warn("MQTT connection lost", response.errorMessage);
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connect, 5000);
    };
    state.client.onMessageArrived = message => handleMessage(message.destinationName, message.payloadString);
    state.client.connect({
      useSSL: CONFIG.useSSL,
      timeout: 8,
      onSuccess: () => {
        state.brokerConnected = true;
        setBrokerStatus("online");
        state.client.subscribe(`${CONFIG.prefix}#`, { qos: 0 });
        showToast("Connected to the garden MQTT stream.");
      },
      onFailure: response => {
        state.brokerConnected = false;
        setBrokerStatus("offline");
        console.warn("MQTT connection failed", response.errorMessage || response.errorCode);
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = setTimeout(connect, 5000);
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
      if (publish("Light", next, `Light ${next.toLowerCase()} command sent. Waiting for device state.`)) {
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
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(error => console.warn("Service worker registration failed", error));
    connect();
  });
})(jQuery);

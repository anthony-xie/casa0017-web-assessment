(function initialiseLondonMap() {
  "use strict";

  const map = L.map("map", {
    center: [51.5074, -0.1278],
    zoom: 11,
    scrollWheelZoom: false, // keeps normal page scrolling comfortable
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(map);

  // Refresh Leaflet's dimensions after the initial layout is calculated.
  window.addEventListener("load", () => map.invalidateSize());
})();

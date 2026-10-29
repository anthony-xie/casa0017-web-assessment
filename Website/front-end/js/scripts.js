(function initialisePeopleControls() {
  "use strict";

  const list = document.querySelector(".people");
  const addButton = document.getElementById("add-person");
  const colours = ["red", "blue", "green", "#7654c8", "#bf6b22", "#13878e"];

  function updatePeople() {
    const people = Array.from(list.querySelectorAll(".person"));

    people.forEach((person, index) => {
      const number = index + 1;
      const removeButton = person.querySelector(".remove-person");
      const addressInput = person.querySelector(".person-address");

      person.style.setProperty("--pc", colours[index % colours.length]);
      person.querySelector(".dot").textContent = number;
      person.querySelector(".p-name").textContent = `Person ${number}`;
      removeButton.setAttribute("aria-label", `Remove Person ${number}`);
      removeButton.disabled = people.length === 1;
      addressInput.setAttribute("aria-label", `Starting address for Person ${number}`);
    });
  }

  addButton.addEventListener("click", () => {
    const person = list.firstElementChild.cloneNode(true);
    person.querySelector(".person-address").value = "";
    list.appendChild(person);
    updatePeople();
    person.querySelector(".person-address").focus();
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest(".remove-person");
    if (!button || list.children.length <= 1) return;

    button.closest(".person").remove();
    updatePeople();
  });

  updatePeople();
})();

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

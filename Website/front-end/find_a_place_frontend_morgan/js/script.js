const sidebar = document.getElementById("sidebar");
const toggleButton = document.getElementById("sidebarToggle");
const recommendation = document.getElementById("recommendation");
const findButton = document.getElementById("findButton");
const toolNextButton = document.getElementById("toolNext");
const collapsedNextButton = document.getElementById("toolNextCollapsed");
const peopleList = document.getElementById("peopleList");
const addPersonButton = document.getElementById("addPerson");

// Example recommendations and their map coordinates.
const places = [
    {
        name: "Place 1",
        description: "Mon-Sun: 10:00 AM - 10:00 PM",
        coordinates: [51.5128, -0.1222]
    },
    {
        name: "Place 2",
        description: "Mon-Sun: 10:00 AM - 10:00 PM",
        coordinates: [51.5103, -0.1303]
    },
    {
        name: "Place 3",
        description: "Mon-Sun: 10:00 AM - 10:00 PM",
        coordinates: [51.5174, -0.1232]
    }
];

// Example map locations used to represent up to 10 people.
const virtualLocations = [
    [51.5308, -0.1238],
    [51.5033, -0.1147],
    [51.5416, -0.0033],
    [51.5155, -0.0922],
    [51.5081, -0.1450],
    [51.5239, -0.1585],
    [51.4954, -0.1357],
    [51.5336, -0.0811],
    [51.4996, -0.1001],
    [51.5191, -0.0415]
];

// Start with one person and the first virtual location.
let personEntries = [
    {
        location: "",
        virtualLocationIndex: 0
    }
];

// Track the current recommendation and search state.
let currentPlaceIndex = 0;
let hasSearched = false;

const personMarkers = [];

// Hide the recommendation and disable its buttons before searching.
recommendation.hidden = true;
toolNextButton.disabled = true;
collapsedNextButton.disabled = true;

// Create the map and add its controls and background tiles.
const map = L.map("map", {
    zoomControl: false
}).setView([51.512, -0.116], 13);

// Route Drawing
const routeLayers = [];

function drawRoutes() {
    // Remove existing routes before drawing new ones.
    routeLayers.forEach((route) => map.removeLayer(route));
    routeLayers.length = 0;

    const destination = places[currentPlaceIndex].coordinates;

    personEntries.forEach((person, index) => {
        const start = virtualLocations[person.virtualLocationIndex];

        if (!start) return;

        const colour = getComputedStyle(document.documentElement)
            .getPropertyValue(`--person-${index + 1}`)
            .trim();

        const route = L.polyline([start, destination], {
            color: colour,
            weight: 5,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round"
        }).addTo(map);

        route.bindPopup(createRoutePopup(index), {
            className: "route-popup",
            minWidth: 300,
            maxWidth: 300,
            maxHeight: 250
        });

        routeLayers.push(route);
    });
}

L.control.zoom({
    position: "bottomleft"
}).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Create a coloured circular icon for a person.
function createPersonIcon(personNumber) {
    return L.divIcon({
        className: "",
        html: `
            <div
                class="person-marker"
                style="--person-colour: var(--person-${personNumber})">
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

// Create a popup showing a person's name and entered location.
function createPersonPopup(person, index) {
    const popup = document.createElement("div");
    popup.className = "map-popup";

    const name = document.createElement("strong");
    name.textContent = `Person ${index + 1}`;

    const location = document.createElement("span");
    location.textContent = person.location.trim() || "Location not entered";

    popup.append(name, location);
    return popup;
}

// Create a popup with the same recommendation details shown in the sidebar.
function createRecommendationPopup(place) {
    const popup = document.createElement("div");
    popup.className = "map-popup";

    const label = document.createElement("span");
    label.className = "map-popup-label";
    label.textContent = "recommended meeting point";

    const name = document.createElement("strong");
    name.textContent = place.name;

    const description = document.createElement("p");
    description.textContent = place.description;

    popup.append(label, name, description);

    // Copy the journey information from the sidebar into the popup.
    const journeyInfo = document.querySelector(".journey-time");
    if (journeyInfo) {
        popup.append(journeyInfo.cloneNode(true));
    }

    return popup;
}

// Create a popup showing the example journey steps for one person.
function createRoutePopup(index) {
    const popup = document.createElement("div");
    popup.className = "map-popup";

    const heading = document.createElement("strong");
    heading.textContent = `Directions for Person ${index + 1}`;

    const walkingStart = document.createElement("span");
    walkingStart.textContent = "Walk · 5 min";

    const underground = document.createElement("span");
    underground.textContent = "Underground · 3 stops · 7 min";

    const walkingEnd = document.createElement("span");
    walkingEnd.textContent = "Walk · 6 min";

    popup.append(heading, walkingStart, underground, walkingEnd);
    return popup;
}

// Rebuild the map markers to match the current people list.
function renderPersonMarkers() {
    personMarkers.forEach((marker) => {
        map.removeLayer(marker);
    });

    personMarkers.length = 0;

    personEntries.forEach((person, index) => {
        const marker = L.marker(
            virtualLocations[person.virtualLocationIndex],
            { icon: createPersonIcon(index + 1) }
        )
            .addTo(map)
            .bindPopup(createPersonPopup(person, index), {
                className: "person-popup",
                minWidth: 150,
                maxWidth: 150,
                maxHeight: 100

            });

        personMarkers.push(marker);
    });
}

// Build the person input rows and update the displayed count.
function renderPersonFields() {
    peopleList.replaceChildren();

    personEntries.forEach((person, index) => {
        const personNumber = index + 1;

        const row = document.createElement("div");
        row.className = "location-field";

        const dot = document.createElement("span");
        dot.className = "person-dot";
        dot.style.setProperty(
            "--person-colour",
            `var(--person-${personNumber})`
        );

        const fieldContent = document.createElement("label");
        fieldContent.className = "field-content";

        const name = document.createElement("span");
        name.className = "person-name";
        name.textContent = `Person ${personNumber}`;

        const input = document.createElement("input");
        input.placeholder = "enter the postcode or location";
        input.setAttribute(
            "aria-label",
            `Person ${personNumber} starting point`
        );
        input.value = person.location;

        input.addEventListener("input", () => {
            person.location = input.value;
            personMarkers[index]?.setPopupContent(
                createPersonPopup(person, index)
            );
        });

        const removeButton = document.createElement("button");
        removeButton.className = "remove-person";
        removeButton.type = "button";
        removeButton.textContent = "×";
        removeButton.setAttribute(
            "aria-label",
            `Remove Person ${personNumber}`
        );
        removeButton.disabled = personEntries.length === 1;

        removeButton.addEventListener("click", () => {
            personEntries.splice(index, 1);
            renderPersonFields();
        });

        fieldContent.append(name, input);
        row.append(dot, fieldContent, removeButton);
        peopleList.append(row);
    });

    addPersonButton.disabled = personEntries.length >= 10;

    renderPersonMarkers();
}

// Add a person using the next available virtual map location.
addPersonButton.addEventListener("click", () => {
    if (personEntries.length >= 10) {
        return;
    }

    const usedLocations = new Set(
        personEntries.map((person) => person.virtualLocationIndex)
    );

    const nextLocationIndex = virtualLocations.findIndex(
        (_, index) => !usedLocations.has(index)
    );

    if (nextLocationIndex === -1) {
        return;
    }

    personEntries.push({
        location: "",
        virtualLocationIndex: nextLocationIndex
    });

    renderPersonFields();
    peopleList.lastElementChild.querySelector("input").focus();
});

// Render the first person when the page loads.
renderPersonFields();

// Create the map icon for the recommended place.
function createMeetingIcon(iconPath = "./icons/recommendedplace_dark.png") {
    return L.icon({
        iconUrl: iconPath,
        iconSize: [36, 58],
        iconAnchor: [18, 58],
        popupAnchor: [0, -46],
        className: "recommended-place-icon"
    });
}

// Create the recommendation marker and its popup.
const meetingMarker = L.marker(
    places[currentPlaceIndex].coordinates,
    { icon: createMeetingIcon() }
).bindPopup(createRecommendationPopup(places[currentPlaceIndex]), {
    className: "place-popup",
    minWidth: 400,
    maxWidth: 400,
    maxHeight: 250

});

// Show the light icon while the pointer is over the marker.
meetingMarker.on("mouseover", function () {
    this.setIcon(createMeetingIcon("./icons/recommendedplace_light.png"));
});

meetingMarker.on("mouseout", function () {
    this.setIcon(createMeetingIcon("./icons/recommendedplace_dark.png"));
});

// Update the recommendation card and map marker.
function updateRecommendation() {
    const place = places[currentPlaceIndex];

    document.getElementById("venueName").textContent = place.name;
    document.getElementById("venueDescription").textContent = place.description;

    meetingMarker.setLatLng(place.coordinates);
    meetingMarker.setPopupContent(createRecommendationPopup(place));

    drawRoutes();
}

// Show the first recommendation after the search button is clicked.
function searchPlaces() {
    hasSearched = true;
    recommendation.hidden = false;
    toolNextButton.disabled = false;
    collapsedNextButton.disabled = false;
    sidebar.classList.add("has-recommendation");

    updateRecommendation();
    meetingMarker.addTo(map);

    map.flyTo(places[currentPlaceIndex].coordinates, 14, {
        duration: 0.6
    });
}

// Move to the next recommendation.
function showNextPlace() {
    if (!hasSearched) {
        return;
    }

    currentPlaceIndex = (currentPlaceIndex + 1) % places.length;
    updateRecommendation();

    map.flyTo(places[currentPlaceIndex].coordinates, 14, {
        duration: 0.6
    });
}

// Return the map to its starting view.
function returnToMapHome() {
    map.flyTo([51.512, -0.116], 13, {
        duration: 0.6
    });
}

// Set an icon's dark and light image paths.
function setSwapIcon(image, darkSrc, lightSrc) {
    image.dataset.dark = darkSrc;
    image.dataset.light = lightSrc;
    image.src = image.matches(":hover") ? lightSrc : darkSrc;
}

// Change the sidebar layout and its toggle icon.
function setSidebarCollapsed(isCollapsed) {
    sidebar.classList.toggle("collapsed", isCollapsed);

    const toggleIcon = toggleButton.querySelector(".icon-swap");

    if (isCollapsed) {
        setSwapIcon(
            toggleIcon,
            "./icons/menu_dark.png",
            "./icons/menu_light.png"
        );
    } else {
        setSwapIcon(
            toggleIcon,
            "./icons/collapse_dark.png",
            "./icons/collapse_light.png"
        );
    }

    toggleButton.setAttribute(
        "aria-label",
        isCollapsed ? "Expand sidebar" : "Collapse sidebar"
    );
    toggleButton.setAttribute(
        "title",
        isCollapsed ? "Expand sidebar" : "Collapse sidebar"
    );

    setTimeout(() => map.invalidateSize(), 280);
}

// Scroll to and focus the first location input.
function focusFirstLocation() {
    const firstInput = document.querySelector("#locationsSection input");

    document.getElementById("locationsSection").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    firstInput.focus({
        preventScroll: true
    });
}

// Connect the sidebar toggle and navigation buttons.
toggleButton.addEventListener("click", () => {
    const isCollapsed = !sidebar.classList.contains("collapsed");
    setSidebarCollapsed(isCollapsed);
});

document.getElementById("homeButton").addEventListener("click", (event) => {
    event.preventDefault();
    returnToMapHome();
});

document.getElementById("toolHome").addEventListener("click", returnToMapHome);

document.getElementById("toolEdit").addEventListener("click", () => {
    if (sidebar.classList.contains("collapsed")) {
        setSidebarCollapsed(false);
        setTimeout(focusFirstLocation, 280);
    } else {
        focusFirstLocation();
    }
});

findButton.addEventListener("click", searchPlaces);
toolNextButton.addEventListener("click", showNextPlace);
collapsedNextButton.addEventListener("click", showNextPlace);

// Swap dark and light icon versions while hovering.
document.querySelectorAll(".icon-swap").forEach((icon) => {
    icon.addEventListener("pointerenter", () => {
        icon.src = icon.dataset.light;
    });

    icon.addEventListener("pointerleave", () => {
        icon.src = icon.dataset.dark;
    });
});

// Help button placeholder.
document.getElementById("helpButton").addEventListener("click", () => {
    alert("Website instructions and information will be added here later.");
});

// Day/night button placeholder.
// The icon changes, but the page theme is not changed yet.
let isNightMode = false;

document.getElementById("themeButton").addEventListener("click", (event) => {
    const themeButton = event.currentTarget;
    const themeIcon = themeButton.querySelector(".icon-swap");

    isNightMode = !isNightMode;

    if (isNightMode) {
        setSwapIcon(
            themeIcon,
            "./icons/daymode_dark.png",
            "./icons/daymode_light.png"
        );
        themeButton.setAttribute("aria-label", "Switch to daytime mode");
        themeButton.setAttribute("title", "Switch to daytime mode");
    } else {
        setSwapIcon(
            themeIcon,
            "./icons/nightmode_dark.png",
            "./icons/nightmode_light.png"
        );
        themeButton.setAttribute("aria-label", "Switch to night mode");
        themeButton.setAttribute("title", "Switch to night mode");
    }
});

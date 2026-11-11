const MIN_PEOPLE = 2;
const MAX_PEOPLE = 6;

// Route animation: how long each line takes to draw (ms)
const SNAKE_MS = 2500;

// Places around the midpoint
const PLACE_TRAVEL_MS = 700;     // how long one pin takes to fly out
const PLACE_MAX_STAGGER_MS = 180;
const PLACE_MIN_COUNT = 5;       // always show at least this many


// How many places to show on the map at each zoom level
function placeLimit(zoom) {
    if (zoom <= 14) return 5;
    if (zoom === 15) return 10;
    if (zoom === 16) return 18;
    return 40;
}

// Look of each kind of place. Icons come from Bootstrap Icons.
const PLACE_TYPES = {
    cafe:       { label: 'Café',       icon: 'bi-cup-hot-fill', color: '#a0522d' },
    restaurant: { label: 'Restaurant', icon: 'bi-fork-knife',   color: '#dc3545' },
    pub:        { label: 'Pub',        icon: 'bi-cup-straw',    color: '#6f42c1' },
    park:        { label: 'Park',       icon: 'bi-tree-fill',    color: '#10781f' },
    library:  { label: 'Library',    icon: 'bi-book',     color: '#e08a00' }
};

const map = L.map('map', {
    center: [51.5074, -0.1278],
    zoom: 13,
    zoomControl: false
});

L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

const resultLayer = L.featureGroup().addTo(map);
const placesLayer = L.layerGroup().addTo(map);
const userLayer = L.layerGroup().addTo(map); // "my location" dot, kept separate from results

const $list = $('#postcodeList');
const $addButton = $('#addPerson');
const $findButton = $('#findPlace');
const $message = $('#formMessage');
const $placesBox = $('#placesBox');
const $placeList = $('#placeList');

let searchToken = 0;
let placeMarkers = [];   // [{ place, marker, shown, $card }], best first
let placesReady = false; // true once the pins have finished flying out
let selectedItem = null; // the place picked in the list or on the map
const placesCache = new Map();

/* ---------- messages ---------- */

// type: 'info' (grey) or 'error'. Empty text hides the message.
function showMessage(text, type = 'info') {
    $message.attr('data-type', text ? type : '').text(text);
}

// An error whose text is safe to show to the user as it is
function friendlyError(text) {
    const error = new Error(text);
    error.friendly = true;
    return error;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// The radar is a map marker, so it stays on its coordinates when the map
// moves or zooms. Before the midpoint is known it sits at the map centre;
// call setSearching(true, midpoint) to move it onto the midpoint.
let radarMarker = null;

function setSearching(on, point) {
    if (on) {
        const latlng = point ? [point.lat, point.lng] : map.getCenter();

        if (!radarMarker) {
            radarMarker = L.marker(latlng, {
                icon: L.divIcon({
                    className: '',
                    html: '<div class="searching active">' +
                          '<span></span><span></span><span></span>' +
                          '<i class="searching-dot"></i></div>',
                    iconSize: [0, 0],
                    iconAnchor: [0, 0]
                }),
                interactive: false,
                keyboard: false,
                zIndexOffset: -1000
            }).addTo(map);
        } else {
            radarMarker.setLatLng(latlng);
        }
    } else if (radarMarker) {
        const marker = radarMarker;
        radarMarker = null;
        $(marker.getElement()).find('.searching').removeClass('active');
        setTimeout(() => marker.remove(), 300); // let it fade out first
    }
}

/* ---------- intro overlay ---------- */

let introDismissed = false;

function dismissIntro() {
    if (introDismissed) return;
    introDismissed = true;
    $('#intro').fadeOut(400, function () { $(this).remove(); });
}

// Clicking into an input, or clicking anywhere on the overlay, hides it
$list.on('focusin', dismissIntro);
$('#intro').on('click', dismissIntro);

/* ---------- "my location" button ---------- */

const LocateControl = L.Control.extend({
    options: { position: 'topright' },

    onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control-locate');
        const link = L.DomUtil.create('a', '', container);
        link.href = '#';
        link.title = 'Show my location';
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', 'Show my location');
        link.innerHTML = '<i class="bi bi-crosshair" aria-hidden="true"></i>';

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(link, 'click', event => {
            L.DomEvent.preventDefault(event);
            map.locate({ enableHighAccuracy: true, timeout: 10000 });
        });

        return container;
    }
});

new LocateControl().addTo(map);

map.on('locationfound', event => {
    userLayer.clearLayers();

    // Accuracy circle, then the blue dot on top
    L.circle(event.latlng, {
        radius: event.accuracy,
        color: '#3388ff',
        weight: 1,
        fillColor: '#3388ff',
        fillOpacity: 0.12,
        interactive: false
    }).addTo(userLayer);

    L.circleMarker(event.latlng, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#3388ff',
        fillOpacity: 1,
        interactive: false
    }).addTo(userLayer);

    map.flyTo(event.latlng, 15);
});

map.on('locationerror', () => {
    showMessage('We couldn’t get your location. Check that location access is allowed for this page.', 'error');
});

/* ---------- input rows ---------- */

function addRow() {
    const $row = $('<div class="postcode-row">');

    const $input = $('<input>', {
        class: 'form-control postcode-input',
        type: 'text',
        placeholder: 'Postcode',
        autocomplete: 'postal-code',
        'aria-label': 'Postcode'
    });

    const $remove = $('<button>', {
        type: 'button',
        class: 'remove-button',
        'aria-label': 'Remove postcode',
        html: '<i class="bi bi-x" aria-hidden="true"></i>'
    }).on('click', () => {
        $row.remove();
        updateControls();
    });

    $row.append($input, $remove).appendTo($list);
    updateControls();
    return $input;
}

function updateControls() {
    const count = $list.children().length;
    $addButton.prop('disabled', count >= MAX_PEOPLE);
    $list.find('.remove-button').prop('disabled', count <= MIN_PEOPLE);
}

// .text() escapes the content, so user input cannot inject HTML
function createPopup(title, text) {
    const $el = $('<div>').append($('<b>').text(title));
    if (text) $el.append('<br>', $('<span>').text(text));
    return $el[0];
}


/* ---------- place pins and the list in the sidebar ---------- */

function placePinIcon(kind) {
    const type = PLACE_TYPES[kind];
    return L.divIcon({
        className: '',
        html: `<div class="place-pin">
                   <div class="place-pin-body" style="background:${type.color}">
                       <i class="bi ${type.icon}" aria-hidden="true"></i>
                   </div>
               </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 36],
        popupAnchor: [0, -36]
    });
}

// The selected place's pin is drawn this much bigger (must match .place-pin-selected in style.css)
const SELECTED_PIN_SCALE = 1.35;
const PIN_HEIGHT = 36; // from the tip of the pin to its top, in px (same as iconAnchor y)

// Make one pin bigger (or normal size again). The pin grows from its tip, so it stays on the same spot.
function setPinSelected(item, selected) {
    const el = item.marker.getElement();
    if (el) el.classList.toggle('place-pin-selected', selected);

    // Keep the selected pin above the others
    item.marker.setZIndexOffset(selected ? 1000 : 0);

    // Lift the popup so it does not cover the bigger pin (7 is Leaflet's default offset)
    const popup = item.marker.getPopup();
    if (popup) {
        const lift = selected ? Math.round(PIN_HEIGHT * (SELECTED_PIN_SCALE - 1)) : 0;
        popup.options.offset = L.point(0, 7 - lift);
        if (popup.isOpen()) popup.update();
    }
}

function formatDistance(meters) {
    return meters < 1000
        ? `${Math.round(meters / 10) * 10} m`
        : `${(meters / 1000).toFixed(1)} km`;
}

// One card in the sidebar. .text() keeps any odd characters from being run as HTML.
function buildPlaceCard(place) {
    const type = PLACE_TYPES[place.kind];

    const $icon = $('<div class="place-card-icon">')
        .css('background', type.color)
        .append($('<i>').addClass('bi ' + type.icon).attr('aria-hidden', 'true'));

    const $main = $('<div class="place-card-main">')
        .append($('<div class="place-card-name">').text(place.name))
        .append($('<div class="place-card-meta">')
            .text(`${place.label} · ${formatDistance(place.distance)} from midpoint`));

    if (place.postcode) {
        $main.append($('<div class="place-card-line">')
            .text(place.postcodeIsNearest ? `Near ${place.postcode}` : place.postcode));
    }

    $main.append(
        $('<div class="place-card-hours">').text(
            place.hours ? place.hours.replace(/;\s*/g, '\n') : 'Opening hours not listed'
        )
    );

    return $('<li class="place-card" tabindex="0" role="button">').append($icon, $main);
}

function renderPlaceList() {
    $placeList.empty();
    placeMarkers.forEach(item => {
        item.$card = buildPlaceCard(item.place);
        item.$card
            .on('click', () => selectPlace(item))
            .on('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectPlace(item);
                }
            })
            .appendTo($placeList);
    });
    $placesBox.prop('hidden', !placeMarkers.length).scrollTop(0);
}

    if (selectedItem && selectedItem !== item) setPinSelected(selectedItem, false);

// Picks a place: from the list (fly to it) or from the map (scroll the list)
function selectPlace(item, fromMap = false) {
    selectedItem = item;

    // It may be hidden at the current zoom level, so show it
    if (!item.shown) {
        item.marker.setLatLng([item.place.lat, item.place.lng]).setOpacity(1).addTo(placesLayer);
        item.shown = true;
    }

    setPinSelected(item, true);

    $placeList.find('.place-card').removeClass('active');
    item.$card.addClass('active');

    if (fromMap) {
        item.$card[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
        item.marker.openPopup();
        map.flyTo([item.place.lat, item.place.lng], Math.max(map.getZoom(), 17), { duration: 0.8 });
    }
}

function resetPlaces() {
    placesLayer.clearLayers();
    placeMarkers = [];
    placesReady = false;
    selectedItem = null;
    $placeList.empty();
    $placesBox.prop('hidden', true);
}

// Zoom the map in around the midpoint and the first few places
function flyToBounds(bounds) {
    return new Promise(resolve => {
        const done = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(done, 2000); // in case no move is needed
        map.once('moveend', done);
        map.flyToBounds(bounds, { maxZoom: 16, duration: 1 });
    });
}

// A red ripple that spreads out from the midpoint
function rippleFrom(center, maxRadius, token) {
    const ring = L.circle([center.lat, center.lng], {
        radius: 1,
        color: '#dc3545',
        weight: 2,
        fillColor: '#dc3545',
        fillOpacity: 0.12,
        interactive: false
    }).addTo(placesLayer);

    return new Promise(resolve => {
        const start = performance.now();
        const duration = PLACE_TRAVEL_MS * 1.6;

        function frame(now) {
            const t = Math.min((now - start) / duration, 1);
            if (token !== searchToken || t >= 1) {
                placesLayer.removeLayer(ring);
                resolve();
                return;
            }
            const eased = 1 - Math.pow(1 - t, 3);
            ring.setRadius(Math.max(1, maxRadius * eased));
            ring.setStyle({ opacity: 0.8 * (1 - t), fillOpacity: 0.12 * (1 - t) });
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    });
}

// Moves one pin from the midpoint to its own spot
function flyOut(marker, from, to, token) {
    return new Promise(resolve => {
        const start = performance.now();

        function frame(now) {
            if (token !== searchToken) {
                resolve();
                return;
            }
            const t = Math.min((now - start) / PLACE_TRAVEL_MS, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            marker.setLatLng([
                from.lat + (to.lat - from.lat) * eased,
                from.lng + (to.lng - from.lng) * eased
            ]);
            marker.setOpacity(Math.min(1, t * 3));

            if (t < 1) requestAnimationFrame(frame);
            else resolve();
        }
        requestAnimationFrame(frame);
    });
}

// Pins burst out from the midpoint one after another
async function radiatePlaces(center, token) {
    const count = Math.min(placeLimit(map.getZoom()), placeMarkers.length);
    const stagger = Math.min(PLACE_MAX_STAGGER_MS, 1200 / count);

    const shown = placeMarkers.slice(0, count);
    const maxRadius = Math.max(...shown.map(item => item.place.distance));

    const tasks = [rippleFrom(center, maxRadius, token)];

    shown.forEach((item, i) => {
        item.marker.setLatLng([center.lat, center.lng]).setOpacity(0).addTo(placesLayer);
        item.shown = true;
        tasks.push(
            sleep(i * stagger).then(() => flyOut(item.marker, center, item.place, token))
        );
    });

    await Promise.all(tasks);
}

// Zooming in shows more places, zooming out hides some
map.on('zoomend', () => {
    if (!placesReady) return;

    const limit = placeLimit(map.getZoom());
    placeMarkers.forEach((item, i) => {
        const wanted = i < limit || item === selectedItem;
        if (wanted && !item.shown) {
            item.marker.setLatLng([item.place.lat, item.place.lng]).setOpacity(1).addTo(placesLayer);
            item.shown = true;
        } else if (!wanted && item.shown) {
            placesLayer.removeLayer(item.marker);
            item.shown = false;
        }
    });
});

/* ---------- real road routes (OSRM public demo server) ---------- */

// Remove invalid and duplicate consecutive points (they make SnakeAnim produce NaN)
function cleanRoute(points, from, to) {
    const cleaned = points.filter(([lat, lng], i) =>
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        (i === 0 || lat !== points[i - 1][0] || lng !== points[i - 1][1])
    );

    // A route needs at least two different points
    if (cleaned.length < 2) {
        return [[from.lat, from.lng], [to.lat, to.lng]];
    }
    return cleaned;
}


function routeLengthMeters(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += L.latLng(points[i - 1]).distanceTo(L.latLng(points[i]));
    }
    return total;
}

function routesForPlace(place, locations){
    return place.routes.map((route, i) =>
        cleanRoute(
            route.legs.flatMap(leg => leg.pathLine),   // join every leg's points
            locations[i],                          // person i's start
            { lat: place.lat, lng: place.lon }     // the place
        )
    );
}

// Draws every route with the snake animation, all starting together.
// Resolves when the last line arrives (or after a safety timeout).
function animateRoutes(routes, token) {
    const lines = routes.map(points =>
        L.polyline(points, {
            color: '#3388ff',
            weight: 4,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
            snakingSpeed: 200
        }).addTo(resultLayer)
    );

    return new Promise(resolve => {
        let remaining = lines.length;
        let done = false;
        let safety = null;

        function finish() {
            if (done) return;
            done = true;
            clearTimeout(safety);
            resolve();
        }

        function finishOne() {
            remaining--;
            if (remaining <= 0 || token !== searchToken) finish();
        }

        // If something goes wrong, do not leave the page waiting forever
        safety = setTimeout(finish, SNAKE_MS * 3 + 2000);

        lines.forEach((line, i) => {
            const length = routeLengthMeters(routes[i]);
            const speed = (length / 8) / (SNAKE_MS / 1000);
            line.options.snakingSpeed = Number.isFinite(speed) ? Math.max(60, speed) : 200;

            line.on('snakeend', finishOne);

            try {
                line.snakeIn();
            } catch (error) {
                // Fall back to a plain static line for this route
                line.setLatLngs(routes[i]);
                finishOne();
            }
        });
    });
}

/* ---------- main ---------- */

async function findMeetingPlace() {
    // Keep each person's original position so numbering stays correct
    const entries = $list.find('.postcode-input')
        .map((i, input) => ({ person: i + 1, postcode: input.value.trim() }))
        .get()
        .filter(entry => entry.postcode);

    if (entries.length < MIN_PEOPLE) {
        showMessage('Enter at least two postcodes.', 'error');
        return;
    }

    const token = ++searchToken;
    $findButton.prop('disabled', true);
    setSearching(true);
    showMessage('Finding a meeting point…');

    try {
        const category = $('#category').val();
        const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postcodes: entries.map(e => e.postcode), category })
        });
        const data = await res.json();
        if (!res.ok) throw friendlyError(data.error);       // shows e.g. "One or more postcodes are outside of London"

        const locations = data.coords.map(c => ({ lat: c.latitude, lng: c.longitude }));
        const center = { lat: data.midpoint.latitude, lng: data.midpoint.longitude };
        setSearching(true, center);
        const centerPoint = L.latLng(center.lat, center.lng);
        const places = data.places.map(p => ({
            ...p,
            kind: category,
            label: PLACE_TYPES[category].label,
            lng: p.lon,
            hours: p.opening_hours || '',
            distance: centerPoint.distanceTo([p.lat, p.lon])
        }));

        if (token !== searchToken) return;

        resultLayer.clearLayers();
        resetPlaces();

        locations.forEach((location, i) => {
            L.marker([location.lat, location.lng])
                .bindPopup(createPopup(`Person ${entries[i].person}`, entries[i].postcode))
                .addTo(resultLayer);
        });

        const routes = routesForPlace(places[0], locations); 

        const bounds = L.latLngBounds(routes.flat());
        map.fitBounds(bounds.pad(0.2));

        showMessage('Drawing routes…');
        await animateRoutes(routes, token);
        if (token !== searchToken) return;

        // Same pin shape as the people markers, tinted red with CSS
        const meetingIcon = L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            shadowSize: [41, 41],
            className: 'meeting-marker'
        });

        const meeting = L.marker([center.lat, center.lng], { icon: meetingIcon })
            .addTo(resultLayer);

        // Only bounce if the plugin loaded; the pin still shows either way
        if (typeof meeting.bounce === 'function') {
            meeting.setBouncingOptions({ bounceHeight: 40, bounceSpeed: 54, exclusive: true });
            meeting.bounce(3); // bounce 3 times, then stop
        }

        // Places around the midpoint (the radar keeps spinning until they arrive)
        showMessage('Looking for places nearby…');

        setSearching(false);

        if (!places) {
            showMessage('Midpoint found, but we couldn’t load places nearby.');
            return;
        }
        if (!places.length) {
            showMessage('Midpoint found, but there are no cafés, restaurants or pubs listed nearby.');
            return;
        }

        placeMarkers = places.map(place => {
            const item = {
                place,
                shown: false,
                $card: null,
                marker: L.marker([center.lat, center.lng], {
                    icon: placePinIcon(place.kind),
                    opacity: 0
                }).bindPopup(createPopup(place.name, place.label))
            };
            item.marker.on('click', () => selectPlace(item, true));

            // Leaflet makes a new element each time a pin is re-added (zooming hides/shows pins)
            item.marker.on('add', () => {
                if (item === selectedItem) setPinSelected(item, true);
            });

            return item;
        });

        renderPlaceList();
        showMessage(`${places.length} places near the midpoint. Pick one from the list or the map.`);

        // Zoom in around the midpoint and the first few places
        const focusPoints = [
            [center.lat, center.lng],
            ...places.slice(0, PLACE_MIN_COUNT).map(p => [p.lat, p.lng])
        ];
        await flyToBounds(L.latLngBounds(focusPoints).pad(0.35));
        if (token !== searchToken) return;

        await radiatePlaces(center, token);
        if (token !== searchToken) return;

        placesReady = true;
    } catch (error) {
        console.error(error);

        if (error.friendly) {
            showMessage(error.message, 'error');
        } else if (error instanceof TypeError) {
            // fetch() fails with a TypeError when the network is down
            showMessage('Can’t reach the server. Check your connection and try again.', 'error');
        } else {
            showMessage('Something went wrong. Please try again.', 'error');
        }
    } finally {
        if (token === searchToken) {
            setSearching(false);
            $findButton.prop('disabled', false);
        }
    }
}

$addButton.on('click', () => {
    if ($list.children().length < MAX_PEOPLE) addRow().trigger('focus');
});

$('#postcodeForm').on('submit', event => {
    event.preventDefault();
    findMeetingPlace();
});

// Collapse or expand the sidebar (a narrow strip stays visible)
$('#toggleSidebar').on('click', function () {
    const collapsed = $('.sidebar').toggleClass('collapsed').hasClass('collapsed');
    $(this).attr('aria-expanded', !collapsed);

    // Tell Leaflet the map container changed size, after the animation ends
    setTimeout(() => map.invalidateSize(), 320);
});

for (let i = 0; i < MIN_PEOPLE; i++) addRow();
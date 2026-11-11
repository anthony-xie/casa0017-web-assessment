const MIN_PEOPLE = 2;
const MAX_PEOPLE = 6;

// Route animation: how long each line takes to draw (ms)
const SNAKE_MS = 2500;

// Places around the midpoint
const PLACE_RADIUS_M = 900;      // search radius in metres
const PLACE_TRAVEL_MS = 700;     // how long one pin takes to fly out
const PLACE_MAX_STAGGER_MS = 180;
const PLACE_MIN_COUNT = 5;       // always show at least this many

// Several public Overpass servers: ask them all, use the first good answer
const OVERPASS_SERVERS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
];

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
    bar:        { label: 'Bar',        icon: 'bi-cup-straw',    color: '#6f42c1' },
    fast_food:  { label: 'Fast food',  icon: 'bi-bag-fill',     color: '#e08a00' }
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
const $searching = $('#searching');
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

// Radar ripples in the middle of the map while we search
function setSearching(on) {
    $searching.toggleClass('active', on);
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

/* ---------- postcode lookup ---------- */

async function lookupPostcodes(postcodes) {
    const response = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes })
    });
    if (!response.ok) {
        throw friendlyError('The postcode service is not responding. Please try again in a moment.');
    }

    const { result } = await response.json();

    const missing = result.filter(item => !item.result).map(item => `"${item.query}"`);
    if (missing.length) {
        throw friendlyError(
            missing.length === 1
                ? `We couldn't find ${missing[0]}. Check the postcode and try again.`
                : `We couldn't find ${missing.join(', ')}. Check those postcodes and try again.`
        );
    }

    return result.map(item => ({ lat: item.result.latitude, lng: item.result.longitude }));
}

/* ---------- nearby places (OpenStreetMap, via Overpass) ---------- */

// Asks every server at once and uses the first good answer
async function overpassRequest(query) {
    const body = 'data=' + encodeURIComponent(query);

    const attempts = OVERPASS_SERVERS.map(async url => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                signal: controller.signal
            });
            if (!response.ok) throw new Error('Overpass ' + response.status);
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    });

    try {
        return await Promise.any(attempts);
    } catch {
        throw friendlyError('The places service is busy. Please try again in a moment.');
    }
}

function formatAddress(tags) {
    const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    return [street, tags['addr:city']].filter(Boolean).join(', ');
}

// Many places have no postcode in OpenStreetMap, so ask postcodes.io
// for the nearest postcode to their location.
async function fillPostcodes(places) {
    const missing = places.filter(place => !place.postcode);
    if (!missing.length) return;

    try {
        const response = await fetch('https://api.postcodes.io/postcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                geolocations: missing.map(place => ({
                    longitude: place.lng,
                    latitude: place.lat,
                    limit: 1,
                    radius: 200
                }))
            })
        });
        if (!response.ok) return;

        const { result } = await response.json();
        result.forEach((item, i) => {
            const found = item.result && item.result[0];
            if (found) {
                missing[i].postcode = found.postcode;
                missing[i].postcodeIsNearest = true;
            }
        });
    } catch (error) {
        console.error(error); // postcodes are a nice extra, not essential
    }
}

// Returns places around the center, best first. Each type takes turns,
// so the first few are a mix (a café, a restaurant, a pub...) rather than
// five of the same kind.
async function getNearbyPlaces(center) {
    const key = center.lat.toFixed(3) + ',' + center.lng.toFixed(3);
    if (placesCache.has(key)) return placesCache.get(key);

    const types = Object.keys(PLACE_TYPES).join('|');
    const query = `
        [out:json][timeout:10];
        node["amenity"~"^(${types})$"]["name"]
            (around:${PLACE_RADIUS_M},${center.lat},${center.lng});
        out body 80;
    `;

    const data = await overpassRequest(query);
    const centerPoint = L.latLng(center.lat, center.lng);

    // Group by type, nearest first inside each group
    const groups = {};
    data.elements
        .filter(item => item.tags && item.tags.name && PLACE_TYPES[item.tags.amenity])
        .map(item => {
            const tags = item.tags;
            const website = tags.website || tags['contact:website'] || '';
            return {
                name: tags.name,
                kind: tags.amenity,
                label: PLACE_TYPES[tags.amenity].label,
                lat: item.lat,
                lng: item.lon,
                distance: centerPoint.distanceTo([item.lat, item.lon]),
                address: formatAddress(tags),
                postcode: tags['addr:postcode'] || '',
                postcodeIsNearest: false,
                hours: tags.opening_hours || '',
                phone: tags.phone || tags['contact:phone'] || '',
                website: /^https?:\/\//i.test(website) ? website : ''
            };
        })
        .sort((a, b) => a.distance - b.distance)
        .forEach(place => {
            (groups[place.kind] = groups[place.kind] || []).push(place);
        });

    // Take one from each group per round
    const ranked = [];
    const groupList = Object.values(groups);
    const rounds = Math.max(0, ...groupList.map(group => group.length));
    for (let round = 0; round < rounds; round++) {
        groupList
            .map(group => group[round])
            .filter(Boolean)
            .sort((a, b) => a.distance - b.distance)
            .forEach(place => ranked.push(place));
    }

    const result = ranked.slice(0, placeLimit(99));
    await fillPostcodes(result);

    placesCache.set(key, result);
    return result;
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
            .text(`${place.label} · ${formatDistance(place.distance)} from midpoint`))
        .append($('<div class="place-card-line">').text(place.address || 'Address not listed'));

    if (place.postcode) {
        $main.append($('<div class="place-card-line">')
            .text(place.postcodeIsNearest ? `Near ${place.postcode}` : place.postcode));
    }

    $main.append(
        $('<div class="place-card-hours">').text(
            place.hours ? place.hours.replace(/;\s*/g, '\n') : 'Opening hours not listed'
        )
    );

    if (place.phone) {
        $main.append($('<div class="place-card-line">').text(place.phone));
    }
    if (place.website) {
        $main.append(
            $('<a class="place-card-link" target="_blank" rel="noopener noreferrer">')
                .attr('href', place.website)
                .text('Website')
                .on('click', event => event.stopPropagation())
        );
    }

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

// Picks a place: from the list (fly to it) or from the map (scroll the list)
function selectPlace(item, fromMap = false) {
    selectedItem = item;

    // It may be hidden at the current zoom level, so show it
    if (!item.shown) {
        item.marker.setLatLng([item.place.lat, item.place.lng]).setOpacity(1).addTo(placesLayer);
        item.shown = true;
    }

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

// Returns an array of [lat, lng] points that follow real roads.
async function fetchRoute(from, to) {
    const url = 'https://router.project-osrm.org/route/v1/driving/' +
        `${from.lng},${from.lat};${to.lng},${to.lat}` +
        '?overview=full&geometries=geojson';

    const response = await fetch(url);
    if (!response.ok) {
        throw friendlyError('The route service is busy. Please try again in a moment.');
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes.length) {
        throw friendlyError("We couldn't find a road route for one of the postcodes.");
    }

    // OSRM returns [lng, lat]; Leaflet wants [lat, lng]
    const points = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    return cleanRoute(points, from, to);
}

function routeLengthMeters(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += L.latLng(points[i - 1]).distanceTo(L.latLng(points[i]));
    }
    return total;
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
        const locations = await lookupPostcodes(entries.map(e => e.postcode));
        const center = {
            lat: locations.reduce((sum, p) => sum + p.lat, 0) / locations.length,
            lng: locations.reduce((sum, p) => sum + p.lng, 0) / locations.length
        };

        // Start looking for places now, while the routes load.
        // If this fails, the routes still show.
        const placesPromise = getNearbyPlaces(center).catch(error => {
            console.error(error);
            return null;
        });

        showMessage('Finding routes…');
        const routes = await Promise.all(locations.map(l => fetchRoute(l, center)));
        if (token !== searchToken) return;

        resultLayer.clearLayers();
        resetPlaces();

        locations.forEach((location, i) => {
            L.marker([location.lat, location.lng])
                .bindPopup(createPopup(`Person ${entries[i].person}`, entries[i].postcode))
                .addTo(resultLayer);
        });

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
        const places = await placesPromise;
        if (token !== searchToken) return;

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
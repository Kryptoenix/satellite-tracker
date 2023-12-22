let displayTrajectory = false;

// store the trajectory polyline
let trajectoryPolyline;

function toggleMapVisibility() {
    const container = document.getElementById('toggleSwitchContainer');
    container.classList.toggle('active');

    if (container.classList.contains('active')) {
        displayTrajectory = true;
    } else {
        displayTrajectory = false;

        // remove the trajectory polyline if it exists
        if (trajectoryPolyline) {
            trajectoryPolyline.remove();
        }
    }
}
const map = L.map('stats', {
    center: [0, 21.23],
    zoom: 2
});

const satIcon = L.icon({
    iconUrl: 'sat.png',
    iconSize: [50, 32], iconAnchor: [25, 16]
});
const satTitle = "ISS";
const tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const attribution = '';
const tiles = L.tileLayer(tileUrl, { attribution });
tiles.addTo(map);

var satMarkers = {};
const observerLat = 0;
const observerLng = 21.23;
const satelliteTrajectories = {};
async function getSats() {
    // object to store satellite trajectories
    while (true) {
        try {
            const url = "https://tle.ivanstanojevic.me/api/tle/";
            const response = await fetch(url);
            const json = await response.json();

            // loop through satellite data
            for (const satTle of json.member) {
                const satLine1 = satTle.line1;
                const satLine2 = satTle.line2;

                const satInfo = tlejs.getSatelliteInfo(satLine1 + '\n' + satLine2, null, observerLat, observerLng);
                const satVelocity = satInfo.velocity.toFixed(3);

                // sat info valid ?
                if (satInfo && !isNaN(satInfo.lat) && !isNaN(satInfo.lng)) {
                    const satCoordinates = L.latLng(satInfo.lat, satInfo.lng);

                    // use satellite ID as a key to track markers
                    const satId = satTle.satelliteId;

                    if (!satMarkers[satId]) {
                        const marker = L.marker(satCoordinates, { icon: satIcon, title: String(satVelocity) + " km/s" }).bindTooltip(satTle.name, { permanent: true, direction: 'top' }).addTo(map);
                        satMarkers[satId] = marker;
                    } else {
                        satMarkers[satId].setLatLng(satCoordinates);
                    }

                    if (displayTrajectory) {
                        // Display the trajectory if toggle switch is active
                        if (!satelliteTrajectories[satId]) {
                            // If the trajectory for this satellite doesn't exist, create it
                            satelliteTrajectories[satId] = await getSatelliteTrajectoryAll(satTle.name + "\n" + satLine1 + "\n" + satLine2, satId);
                        }
                    } else {
                        // Remove the trajectory if toggle switch is inactive
                        const trajectory = satelliteTrajectories[satId];
                        if (trajectory) {
                            trajectory.remove();
                            delete satelliteTrajectories[satId]; // Remove the trajectory from the tracking object
                        }
                    }
                } else {
                    console.error("Invalid satellite data:", satTle);
                }
            }
        } catch (error) {
            console.error("Error fetching satellite data:", error);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function getSatelliteTrajectoryAll(tleStr, satelliteId) {
    const threeOrbitsArr = await tlejs.getGroundTracks({
        tle: tleStr,
        startTimeMS: Date.now(),
        stepMS: 1000,
        isLngLatFormat: true,
    });

    //  store the LatLng objects for the current orbit
    const points = [];

    // index of the middle current orbit
    const currentIndex = Math.floor(threeOrbitsArr.length / 2);

    // get only the current orbit
    const orbit = threeOrbitsArr[currentIndex];

    for (const point of orbit) {
        const [longitude, latitude] = point;
        const latLngPoint = L.latLng(latitude, longitude);
        points.push(latLngPoint);
    }

    // remove existing trajectory
    if (satelliteTrajectories[satelliteId]) {
        satelliteTrajectories[satelliteId].remove();
    }

    // create polyline for current orbit and add it to map
    const trajectoryPolyline = L.polyline(points, { color: randomHexColor() }).addTo(map);
    satelliteTrajectories[satelliteId] = trajectoryPolyline;

    return trajectoryPolyline;
}

let trajectoryColor;
let currentSat;
let prevSat;
let marker;
let trajectory;

async function getSatByName(satName) {
trajectoryColor = randomHexColor();
currentSat = satName;
prevSat=currentSat;

while (currentSat === prevSat) {
await updateSatelliteData();
await new Promise(r => setTimeout(r, 2000));
}
}

async function updateSatelliteData() {
const url = "https://tle.ivanstanojevic.me/api/tle/";
const response = await fetch(url);
const json = await response.json();

const satIdToFind = findSatelliteIdByName(json, currentSat);
await getTleData(satIdToFind, currentSat);
}

async function getTleData(satId, currentSat) {
if (prevSat !== currentSat) {
removeMarkerAndTrajectory();
prevSat = currentSat;
}

const url = "https://tle.ivanstanojevic.me/api/tle/" + satId;
const response = await fetch(url);
const json = await response.json();

const satLine1 = json.line1;
const satLine2 = json.line2;

if (!satLine1 || !satLine2) {
console.error("Invalid satellite data for", json.name);
return;
}

const satInfo = tlejs.getSatelliteInfo(satLine1 + '\n' + satLine2, null, observerLat, observerLng);

if (!satInfo || satInfo === null) {
console.error("Invalid satellite info for", json.name);
return;
}

if (displayTrajectory && prevSat === currentSat) {
// Display the trajectory if toggle switch is active
trajectory = await getSatelliteTrajectory(json.name + "\n" + satLine1 + "\n" + satLine2, trajectoryColor);
} else if (trajectory) {
trajectory.remove();
}

const satCoordinates = L.latLng(satInfo.lat, satInfo.lng);

const satVelocity = satInfo.velocity.toFixed(3);

if (!marker || prevSat !== currentSat) {
if (marker) {
marker.remove();
}

marker = L.marker(satCoordinates, { icon: satIcon,title:satVelocity+ " km/s" })
.bindTooltip(json.name , { permanent: true, direction: 'top' })
.addTo(map);
} else {
marker.setLatLng(satCoordinates);
marker.getTooltip().setContent(json.name);
}

}

function findSatelliteIdByName(json, satName) {
for (const satTle of json.member) {
if (satTle.name === satName) {
    return satTle.satelliteId;
}
}
return null;
}

function removeMarkerAndTrajectory() {
if (marker) {
marker.remove();
}
if (trajectory) {
trajectory.remove();
}
}



async function getSatelliteTrajectory(tleStr, tColor) {
    const threeOrbitsArr = await tlejs.getGroundTracks({
        tle: tleStr,
        startTimeMS: Date.now(),
        stepMS: 1000,
        isLngLatFormat: true,
    });

    //  store the LatLng objects for the current orbit
    const points = [];

    // index of the middle current orbit
    const currentIndex = Math.floor(threeOrbitsArr.length / 2);

    // iterate through only the current orbit
    const orbit = threeOrbitsArr[currentIndex];

    for (const point of orbit) {
        const [longitude, latitude] = point;
        const latLngPoint = L.latLng(latitude, longitude);
        points.push(latLngPoint);
    }

    // remove existing trajectory polyline if it exists
    if (trajectoryPolyline) {
        trajectoryPolyline.remove();
    }

    // create a polyline for the current orbit and add it to the map
    trajectoryPolyline = L.polyline(points, { color: tColor }).addTo(map);

    return trajectoryPolyline;
}


function randomInteger(max) {
    return Math.floor(Math.random() * (max + 1));
}
function randomRgbColor() {
    let r = randomInteger(255);
    let g = randomInteger(255);
    let b = randomInteger(255);
    return [r, g, b]
}

function randomHexColor() {
    let [r, g, b] = randomRgbColor();
    let hr = r.toString(16).padStart(2, '0');
    let hg = g.toString(16).padStart(2, '0');
    let hb = b.toString(16).padStart(2, '0');
    return "#" + hr + hg + hb;
}
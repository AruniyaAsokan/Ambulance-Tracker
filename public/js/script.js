const socket = io();

// Add a fixed marker (blue) - Hospital/Dispensary location
const fixedLocation = {
  latitude: 12.841634120899181,
  longitude: 80.1565623625399
};

// Define the proximity threshold in meters
const PROXIMITY_THRESHOLD = 100; // Ambulance is considered "at dispensary" when within this distance

const map = L.map("map").setView([fixedLocation.latitude, fixedLocation.longitude], 16);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "OpenStreetMap"
}).addTo(map);

// Create a blue icon for the fixed marker
const blueIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Create a red icon for user markers
const redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Add the fixed marker (blue)
const fixedMarker = L.marker([fixedLocation.latitude, fixedLocation.longitude], {icon: blueIcon})
  .addTo(map)
  .bindPopup("Hospital/Dispensary Location");

// Add a circle around the hospital to visualize the proximity threshold
const proximityCircle = L.circle([fixedLocation.latitude, fixedLocation.longitude], {
  radius: PROXIMITY_THRESHOLD,
  color: '#4A90E2',
  fillColor: '#4A90E2',
  fillOpacity: 0.2
}).addTo(map);

// Store all data related to each ambulance
const ambulances = {};
let ambulanceCount = 0;

// Create a custom control for showing total ambulance count
class AmbulanceCountControl extends L.Control {
  constructor(options) {
    super(options);
    this.count = 0;
    this.atDispensary = 0;
  }

  onAdd(map) {
    this.container = L.DomUtil.create('div', 'ambulance-count-control');
    this.update();
    return this.container;
  }

  update() {
    this.container.innerHTML = `
      <div><strong>Ambulances Online:</strong> ${this.count}</div>
      <div><strong>At Dispensary:</strong> ${this.atDispensary}</div>
    `;
  }

  setCount(count, atDispensary) {
    this.count = count;
    this.atDispensary = atDispensary;
    this.update();
  }
}

// Create and add the ambulance count control
const countControl = new AmbulanceCountControl({position: 'topleft'});
countControl.addTo(map);

// Create a custom control for showing distance and time
class RoutingSummaryControl extends L.Control {
  constructor(options) {
    super(options);
    this.distanceKm = 0;
    this.timeMinutes = 0;
    this.ambulanceNumber = options.ambulanceNumber || '';
    this.isAtDispensary = false;
    this.batteryLevel = 'Unknown';
    this.speed = 0;
  }

  onAdd(map) {
    this.container = L.DomUtil.create('div', 'routing-summary-control');
    this.update();
    return this.container;
  }

  update() {
    let statusHTML = this.isAtDispensary ? 
      '<div class="status-at-dispensary">AT DISPENSARY</div>' : 
      '<div class="status-en-route">EN ROUTE</div>';
      
    this.container.innerHTML = `
      <div><strong>Ambulance ${this.ambulanceNumber}</strong></div>
      ${statusHTML}
      <div><strong>Road Distance:</strong> ${this.distanceKm.toFixed(2)} km</div>
      <div><strong>Est. Travel Time:</strong> ${this.timeMinutes.toFixed(0)} min</div>
      <div><strong>Speed:</strong> ${this.speed.toFixed(1)} km/h</div>
      <div><strong>Battery:</strong> ${this.batteryLevel}</div>
    `;
  }

  setValues(distanceKm, timeMinutes, isAtDispensary, batteryLevel = 'Unknown', speed = 0) {
    this.distanceKm = distanceKm;
    this.timeMinutes = timeMinutes;
    this.isAtDispensary = isAtDispensary;
    this.batteryLevel = batteryLevel;
    this.speed = speed;
    this.update();
  }
}

// Calculate the number of ambulances at the dispensary
function countAmbulancesAtDispensary() {
  let count = 0;
  for (const id in ambulances) {
    if (ambulances[id].isAtDispensary) {
      count++;
    }
  }
  return count;
}

// Function to calculate direct distance between two points using Haversine formula
function calculateDirectDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in meters
  return distance;
}

// Check if the ambulance is at the dispensary based on direct distance
function checkIfAtDispensary(latitude, longitude) {
  const directDistance = calculateDirectDistance(
    fixedLocation.latitude, fixedLocation.longitude,
    latitude, longitude
  );
  return directDistance <= PROXIMITY_THRESHOLD;
}

// Variables to track previous position for speed calculation
let prevPosition = null;
let prevTimestamp = null;

// Function to get battery level
async function getBatteryLevel() {
  if ('getBattery' in navigator) {
    try {
      const battery = await navigator.getBattery();
      return `${Math.round(battery.level * 100)}%`;
    } catch (error) {
      console.error("Battery API error:", error);
      return 'Unknown';
    }
  } else if ('battery' in navigator) {
    try {
      const battery = await navigator.battery;
      return `${Math.round(battery.level * 100)}%`;
    } catch (error) {
      console.error("Battery API error:", error);
      return 'Unknown';
    }
  } else {
    console.log("Battery API not supported");
    return 'Not supported';
  }
}

// Start tracking user's own location if geolocation is available
let myDeviceId = null; // Track which ID belongs to this device
let currentSpeed = 0;

if(navigator.geolocation){
  navigator.geolocation.watchPosition(async (position) => {
    const {latitude, longitude} = position.coords;
    const timestamp = position.timestamp;
    
    // Calculate speed using position
    let speed = 0;
    if (position.coords.speed && position.coords.speed >= 0) {
      // Use the speed from the Geolocation API if available (in m/s)
      speed = position.coords.speed * 3.6; // Convert to km/h
    } else if (prevPosition && prevTimestamp) {
      // Calculate speed based on distance and time difference
      const distance = calculateDirectDistance(
        prevPosition.latitude, prevPosition.longitude,
        latitude, longitude
      );
      const timeDiff = (timestamp - prevTimestamp) / 1000; // in seconds
      
      if (timeDiff > 0) {
        speed = (distance / timeDiff) * 3.6; // Convert to km/h
      }
    }
    
    // Update previous position for next calculation
    prevPosition = { latitude, longitude };
    prevTimestamp = timestamp;
    
    // Filter out unrealistic speed jumps
    if (speed > 200) { // Filter unrealistic sudden spikes (over 200 km/h)
      speed = currentSpeed;
    } else {
      // Apply some smoothing
      currentSpeed = (currentSpeed * 0.7) + (speed * 0.3);
    }
    
    // Get battery level
    const batteryLevel = await getBatteryLevel();
    
    // Send current device location, battery and speed to server
    socket.emit("send-location", {
      latitude, 
      longitude,
      batteryLevel,
      speed: currentSpeed
    });
  }, 
  (error) => {
    console.error("Geolocation error:", error);
  },
  {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0,
  });
}

// When connected to server, store my ID
socket.on("connect", () => {
  myDeviceId = socket.id;
  console.log("Connected with ID:", myDeviceId);
});

// Receive location updates for any ambulance (including our own)
socket.on("receive-location", (data) => {
  const {id, latitude, longitude, batteryLevel = 'Unknown', speed = 0} = data;
  
  // Check proximity status
  const isAtDispensary = checkIfAtDispensary(latitude, longitude);
  
  if(ambulances[id]) {
    // Update existing ambulance
    ambulances[id].marker.setLatLng([latitude, longitude]);
    ambulances[id].isAtDispensary = isAtDispensary;
    ambulances[id].batteryLevel = batteryLevel;
    ambulances[id].speed = speed;
    
    // Update marker appearance based on proximity
    updateMarkerAppearance(id);
    
    // Update routing summary with new values
    if (ambulances[id].routingSummary) {
      ambulances[id].routingSummary.setValues(
        ambulances[id].routingSummary.distanceKm,
        ambulances[id].routingSummary.timeMinutes,
        isAtDispensary,
        batteryLevel,
        speed
      );
    }
    
    // Update the route
    if(ambulances[id].routeControl) {
      updateRoute(id, latitude, longitude);
    }
  } else {
    // Create new ambulance entry
    ambulanceCount++;
    
    // Create ambulance marker with label
    const ambulanceMarker = L.marker([latitude, longitude], {
      icon: redIcon,
      title: `Ambulance ${ambulanceCount}`
    }).addTo(map);
    
    // Add ambulance number to popup
    ambulanceMarker.bindPopup(`<strong>Ambulance ${ambulanceCount}</strong><br>Initializing route...`);
    
    // Store the ambulance data
    ambulances[id] = {
      number: ambulanceCount,
      marker: ambulanceMarker,
      routeControl: null,
      routingSummary: null,
      isAtDispensary: isAtDispensary,
      batteryLevel: batteryLevel,
      speed: speed
    };
    
    // Update marker appearance based on proximity
    updateMarkerAppearance(id);
    
    // Initialize routing for this ambulance
    setupRouting(id, latitude, longitude);
  }
  
  // Update the counter
  countControl.setCount(ambulanceCount, countAmbulancesAtDispensary());
});

// Function to update marker appearance based on dispensary proximity
function updateMarkerAppearance(id) {
  const ambulance = ambulances[id];
  
  // Update popup content based on proximity
  const proximityStatus = ambulance.isAtDispensary ? 
    '<div class="status-at-dispensary">AT DISPENSARY</div>' : 
    '<div class="status-en-route">EN ROUTE</div>';
    
  ambulance.marker.bindPopup(`
    <strong>Ambulance ${ambulance.number}</strong><br>
    ${proximityStatus}<br>
    <strong>Speed:</strong> ${ambulance.speed.toFixed(1)} km/h<br>
    <strong>Battery:</strong> ${ambulance.batteryLevel}
  `);
  
  // You could also change the icon based on status if desired
  // ambulance.marker.setIcon(ambulance.isAtDispensary ? greenIcon : redIcon);
}

socket.on("user-disconnected", (id) => {
  if(ambulances[id]) {
    // Remove marker
    map.removeLayer(ambulances[id].marker);
    
    // Clean up routing control
    if(ambulances[id].routeControl) {
      map.removeControl(ambulances[id].routeControl);
    }
    
    // Clean up routing summary
    if(ambulances[id].routingSummary) {
      map.removeControl(ambulances[id].routingSummary);
    }
    
    // Delete ambulance data
    delete ambulances[id];
    
    // Update count
    ambulanceCount--;
    countControl.setCount(ambulanceCount, countAmbulancesAtDispensary());
  }
});

// Function to set up initial routing
function setupRouting(id, latitude, longitude) {
  // Create a routing summary control with ambulance number
  ambulances[id].routingSummary = new RoutingSummaryControl({
    position: 'bottomright', 
    ambulanceNumber: ambulances[id].number
  });
  ambulances[id].routingSummary.addTo(map);
  
  // Create a routing control
  ambulances[id].routeControl = L.Routing.control({
    waypoints: [
      L.latLng(latitude, longitude),
      L.latLng(fixedLocation.latitude, fixedLocation.longitude)
    ],
    routeWhileDragging: false,
    showAlternatives: false,
    fitSelectedRoutes: false,
    show: false, // Don't show the itinerary panel
    lineOptions: {
      styles: [{color: '#ff4444', opacity: 0.7, weight: 5}]
    },
    createMarker: function() { return null; } // Don't create additional markers
  }).addTo(map);
  
  // Get distance and time from routing result
  ambulances[id].routeControl.on('routesfound', function(e) {
    const routes = e.routes;
    const summary = routes[0].summary;
    
    // Convert values: distance in meters to km, time in seconds to minutes
    const distanceKm = summary.totalDistance / 1000;
    const timeMinutes = summary.totalTime / 60;
    
    // Update the summary control including proximity status
    ambulances[id].routingSummary.setValues(
      distanceKm, 
      timeMinutes, 
      ambulances[id].isAtDispensary,
      ambulances[id].batteryLevel,
      ambulances[id].speed
    );
    
    // Update marker popup with all info
    const proximityStatus = ambulances[id].isAtDispensary ? 
      '<div class="status-at-dispensary">AT DISPENSARY</div>' : 
      '<div class="status-en-route">EN ROUTE</div>';
      
    ambulances[id].marker.bindPopup(`
      <strong>Ambulance ${ambulances[id].number}</strong><br>
      ${proximityStatus}<br>
      <strong>Road distance:</strong> ${distanceKm.toFixed(2)} km<br>
      <strong>Est. travel time:</strong> ${timeMinutes.toFixed(0)} min<br>
      <strong>Speed:</strong> ${ambulances[id].speed.toFixed(1)} km/h<br>
      <strong>Battery:</strong> ${ambulances[id].batteryLevel}
    `);
  });
}

// Function to update routing for an existing ambulance
function updateRoute(id, latitude, longitude) {
  ambulances[id].routeControl.setWaypoints([
    L.latLng(latitude, longitude),
    L.latLng(fixedLocation.latitude, fixedLocation.longitude)
  ]);
}

function getPhoneLocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(function(position) {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      console.log("Lat:", lat, "Lon:", lon);

      fetch(`https://ambulance-tracker-xedf.onrender.com/location?lat=${lat}&lon=${lon}`);
    });
  } else {
    alert("Geolocation not supported");
  }
}

setInterval(getPhoneLocation, 10000);

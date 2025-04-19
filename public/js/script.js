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

// Create a green icon for ESP32 markers
const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
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

// Notification counter and container
let notificationCount = 0;
const notifications = [];

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
      <div><strong>Notifications:</strong> <span id="notification-count">${notificationCount}</span></div>
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

// Create a notification control
class NotificationControl extends L.Control {
  constructor(options) {
    super(options);
  }

  onAdd(map) {
    this.container = L.DomUtil.create('div', 'notification-control');
    this.container.className = 'notification-panel leaflet-control';
    this.update();
    
    // Add click handler to toggle notifications
    L.DomEvent.on(this.container.querySelector('.notification-header'), 'click', function(e) {
      const content = document.querySelector('.notification-content');
      if (content.style.display === 'none') {
        content.style.display = 'block';
      } else {
        content.style.display = 'none';
      }
    });
    
    return this.container;
  }

  update() {
    this.container.innerHTML = `
      <div class="notification-header">
        <strong>Notifications</strong> <span class="notification-badge">${notificationCount}</span>
      </div>
      <div class="notification-content" style="display: none;">
        <div id="notification-list">
          ${notifications.length === 0 ? '<div class="no-notifications">No notifications</div>' : ''}
          ${notifications.map(notification => `
            <div class="notification-item ${notification.type}">
              <div class="notification-time">${new Date(notification.timestamp).toLocaleTimeString()}</div>
              <div class="notification-message">${notification.message}</div>
              <div class="notification-ambulance">Ambulance ${getAmbulanceNumberById(notification.ambulance_id)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

// Create and add the notification control
const notificationControl = new NotificationControl({position: 'topright'});
notificationControl.addTo(map);

// Helper function to get ambulance number by ID
function getAmbulanceNumberById(id) {
  if (ambulances[id]) {
    return ambulances[id].number;
  }
  // Extract number from ESP32 ID
  if (id.startsWith('esp32-')) {
    return id.replace('esp32-', '');
  }
  return id;
}

// Create a custom control for showing distance and time
class RoutingSummaryControl extends L.Control {
  constructor(options) {
    super(options);
    this.distanceKm = 0;
    this.timeMinutes = 0;
    this.ambulanceNumber = options.ambulanceNumber || '';
    this.isAtDispensary = false;
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
    `;
  }

  setValues(distanceKm, timeMinutes, isAtDispensary) {
    this.distanceKm = distanceKm;
    this.timeMinutes = timeMinutes;
    this.isAtDispensary = isAtDispensary;
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

// Function to show a notification in the browser
function showNotification(title, message) {
  // Browser notification API
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body: message });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body: message });
        }
      });
    }
  }
  
  // Also show visual notification
  const toast = document.createElement('div');
  toast.className = 'notification-toast';
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-message">${message}</div>
  `;
  document.body.appendChild(toast);
  
  // Remove after 5 seconds
  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 500);
  }, 5000);
}

// Start tracking user's own location if geolocation is available
let myDeviceId = null; // Track which ID belongs to this device

if(navigator.geolocation){
  navigator.geolocation.watchPosition((position) => {
    const {latitude, longitude} = position.coords;
    // Send current device location to server
    socket.emit("send-location", {latitude, longitude});
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
  
  // Request notification permission when connected
  if ("Notification" in window) {
    Notification.requestPermission();
  }
});

// Receive new notifications
socket.on("new-notification", (data) => {
  const { ambulance_id, notification } = data;
  
  // Add to notifications array
  notifications.unshift(notification); // Add to beginning
  
  // Keep only the last 20 notifications
  if (notifications.length > 20) {
    notifications.pop();
  }
  
  // Update count
  notificationCount++;
  document.getElementById("notification-count").textContent = notificationCount;
  
  // Update notification panel
  notificationControl.update();
  
  // Show notification alert
  let ambulanceNum = getAmbulanceNumberById(ambulance_id);
  showNotification(`Ambulance ${ambulanceNum}`, notification.message);
  
  // Play sound (if element exists)
  const notificationSound = document.getElementById("notification-sound");
  if (notificationSound) {
    notificationSound.play();
  }
});

// Receive location updates for any ambulance (including our own)
socket.on("receive-location", (data) => {
  const {id, latitude, longitude, deviceType, batteryLevel, speed} = data;
  
  // Check proximity status
  const isAtDispensary = checkIfAtDispensary(latitude, longitude);
  
  if(ambulances[id]) {
    // Update existing ambulance
    ambulances[id].marker.setLatLng([latitude, longitude]);
    ambulances[id].isAtDispensary = isAtDispensary;
    
    // Store device details if available
    if (deviceType) {
      ambulances[id].deviceType = deviceType;
      ambulances[id].batteryLevel = batteryLevel;
      ambulances[id].speed = speed;
    }
    
    // Update marker appearance based on proximity
    updateMarkerAppearance(id);
    
    // Update the route
    if(ambulances[id].routeControl) {
      updateRoute(id, latitude, longitude);
    }
    
    // Check if ambulance just arrived at dispensary
    if (isAtDispensary && !ambulances[id].previouslyAtDispensary) {
      // Show notification for arrival (except for myself)
      if (id !== myDeviceId) {
        showNotification(`Ambulance ${ambulances[id].number} Arrived`, 
          `Ambulance ${ambulances[id].number} has arrived at the dispensary`);
      }
    }
    
    // Update previous status
    ambulances[id].previouslyAtDispensary = isAtDispensary;
    
  } else {
    // Create new ambulance entry
    ambulanceCount++;
    
    // Choose icon based on device type
    const markerIcon = deviceType === "ESP32" ? greenIcon : redIcon;
    
    // Create ambulance marker with label
    const ambulanceMarker = L.marker([latitude, longitude], {
      icon: markerIcon,
      title: deviceType === "ESP32" ? `ESP32 Device ${id.replace('esp32-', '')}` : `Ambulance ${ambulanceCount}`
    }).addTo(map);
    
    // Add ambulance number to popup
    ambulanceMarker.bindPopup(`<strong>${deviceType === "ESP32" ? `ESP32 Device ${id.replace('esp32-', '')}` : `Ambulance ${ambulanceCount}`}</strong><br>Initializing route...`);
    
    // Store the ambulance data
    ambulances[id] = {
      number: ambulanceCount,
      marker: ambulanceMarker,
      routeControl: null,
      routingSummary: null,
      isAtDispensary: isAtDispensary,
      previouslyAtDispensary: isAtDispensary,
      deviceType: deviceType || "Browser",
      batteryLevel: batteryLevel || "Unknown",
      speed: speed || 0
    };
    
    // Update marker appearance based on proximity
    updateMarkerAppearance(id);
    
    // Initialize routing for this ambulance
    setupRouting(id, latitude, longitude);
    
    // Show notification for new ambulance (except for myself)
    if (id !== myDeviceId) {
      showNotification("New Ambulance", 
        `${deviceType === "ESP32" ? `ESP32 Device ${id.replace('esp32-', '')}` : `Ambulance ${ambulanceCount}`} is now online`);
    }
  }
  
  // Update the counter
  countControl.setCount(ambulanceCount, countAmbulancesAtDispensary());
});

// Function to update marker appearance based on dispensary proximity
function updateMarkerAppearance(id) {
  const ambulance = ambulances[id];
  
  // Update popup content based on proximity and device type
  const proximityStatus = ambulance.isAtDispensary ? 
    '<div class="status-at-dispensary">AT DISPENSARY</div>' : 
    '<div class="status-en-route">EN ROUTE</div>';
  
  let popupContent = `
    <strong>${ambulance.deviceType === "ESP32" ? `ESP32 Device ${id.replace('esp32-', '')}` : `Ambulance ${ambulance.number}`}</strong><br>
    ${proximityStatus}
  `;
  
  // Add extra information for ESP32 devices
  if (ambulance.deviceType === "ESP32") {
    popupContent += `
      <div><strong>Battery:</strong> ${ambulance.batteryLevel}%</div>
      <div><strong>Speed:</strong> ${ambulance.speed} km/h</div>
    `;
  }
    
  ambulance.marker.bindPopup(popupContent);
}

socket.on("user-disconnected", (id) => {
  if(ambulances[id]) {
    // Show notification for ambulance going offline (except for myself)
    if (id !== myDeviceId) {
      const ambulanceType = ambulances[id].deviceType === "ESP32" ? 
        `ESP32 Device ${id.replace('esp32-', '')}` : 
        `Ambulance ${ambulances[id].number}`;
        
      showNotification(`${ambulanceType} Offline`, 
        `${ambulanceType} has gone offline`);
    }
    
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
      ambulances[id].isAtDispensary
    );
    
    // Update marker popup with routing info
    updateMarkerAppearance(id);
  });
}

// Function to update routing for an existing ambulance
function updateRoute(id, latitude, longitude) {
  ambulances[id].routeControl.setWaypoints([
    L.latLng(latitude, longitude),
    L.latLng(fixedLocation.latitude, fixedLocation.longitude)
  ]);
}

// Function to send a notification to an ambulance
function sendNotification(ambulanceId, message) {
  fetch(`/api/send-notification?ambulance_id=${ambulanceId}&message=${encodeURIComponent(message)}&type=info`)
    .then(response => response.text())
    .then(result => {
      console.log("Notification sent:", result);
    })
    .catch(error => {
      console.error("Error sending notification:", error);
    });
}

// Function to manually trigger location update (for testing)
function getPhoneLocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(function(position) {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      console.log("Lat:", lat, "Lon:", lon);

      fetch(`/location?lat=${lat}&lon=${lon}`);
    });
  } else {
    console.log("Geolocation not supported");
  }
}

// Only run this interval for testing if needed
// setInterval(getPhoneLocation, 10000);

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
  .notification-panel {
    background: white;
    border-radius: 4px;
    box-shadow: 0 1px 5px rgba(0,0,0,0.4);
    max-width: 300px;
  }
  
  .notification-header {
    padding: 10px;
    font-size: 14px;
    border-bottom: 1px solid #eee;
    cursor: pointer;
  }
  
  .notification-badge {
    background: #f44336;
    color: white;
    border-radius: 50%;
    padding: 2px 6px;
    font-size: 12px;
  }
  
  .notification-content {
    max-height: 300px;
    overflow-y: auto;
  }
  
  .notification-item {
    padding: 8px 10px;
    border-bottom: 1px solid #eee;
    font-size: 13px;
  }
  
  .notification-time {
    font-size: 11px;
    color: #777;
  }
  
  .notification-message {
    margin: 4px 0;
  }
  
  .notification-ambulance {
    font-size: 11px;
    font-style: italic;
  }
  
  .no-notifications {
    padding: 10px;
    color: #777;
    text-align: center;
    font-style: italic;
  }
  
  .notification-toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px 15px;
    border-radius: 4px;
    max-width: 300px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 1000;
    animation: fadeIn 0.5s;
  }
  
  .toast-title {
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .toast-hide {
    animation: fadeOut 0.5s;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(20px); }
  }
  
  .status-at-dispensary {
    background: #4CAF50;
    color: white;
    padding: 3px 6px;
    border-radius: 3px;
    display: inline-block;
    font-size: 12px;
    margin: 2px 0;
  }
  
  .status-en-route {
    background: #FF9800;
    color: white;
    padding: 3px 6px;
    border-radius: 3px;
    display: inline-block;
    font-size: 12px;
    margin: 2px 0;
  }
`;
document.head.appendChild(style);

// Add notification sound
const audio = document.createElement('audio');
audio.id = 'notification-sound';
audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3'; // Replace with your sound URL
audio.style.display = 'none';
document.body.appendChild(audio);

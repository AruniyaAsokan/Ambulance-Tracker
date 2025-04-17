const socket = io();

// Add a fixed marker (blue)
const fixedLocation = {
  latitude: 12.841634120899181, // Replace with your desired fixed location latitude
  longitude: 80.1565623625399 // Replace with your desired fixed location longitude
};

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
  .bindPopup("Fixed Location");

const markers = {};

if(navigator.geolocation){
  navigator.geolocation.watchPosition((position) => {
    const {latitude, longitude} = position.coords;
    socket.emit("send-location", {latitude, longitude});
  }, 
  (error) => {
    console.error(error);
  },
  {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0,
  });
}

socket.on("receive-location", (data) => {
  const {id, latitude, longitude} = data;
  
  if(markers[id]) {
    markers[id].setLatLng([latitude, longitude]);
  } else {
    markers[id] = L.marker([latitude, longitude], {icon: redIcon}).addTo(map);
  }
});

socket.on("user-disconnected", (id) => {
  if(markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
});

const express = require("express");
const app = express();
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const server = http.createServer(app);
const io = socketio(server);

// Store all active ambulances
const activeAmbulances = {};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", function(socket){
    console.log("New client connected:", socket.id);
    
    // Send all currently active ambulances to the newly connected client
    for (const ambulanceId in activeAmbulances) {
        socket.emit("receive-location", {
            id: ambulanceId,
            ...activeAmbulances[ambulanceId]
        });
    }
    
    socket.on("send-location", function(data){
        // Store this ambulance's location
        activeAmbulances[socket.id] = data;
        
        // Broadcast to all clients
        io.emit("receive-location", {
            id: socket.id, 
            ...data
        });
    });
    
    socket.on("disconnect", function(){
        console.log("Client disconnected:", socket.id);
        
        // Remove this ambulance from active ambulances
        delete activeAmbulances[socket.id];
        
        // Notify all clients
        io.emit("user-disconnected", socket.id);
    });
});

app.get("/", function (req, res) {
    res.render("index");
});

server.listen(9090, () => {
    console.log('Server running on port 9090');
});

// New API endpoint for ESP32 devices
app.get("/api/ambulance", function (req, res) {
    const { id, lat, lon, battery, speed } = req.query;
    
    // Validate data
    if (!id || !lat || !lon) {
        return res.status(400).send("Missing required parameters");
    }
    
    try {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        const batteryLevel = battery || 'Unknown';
        const speedValue = parseFloat(speed) || 0;
        
        // Create a persistent ID for the ESP32 device
        const deviceId = `esp32-${id}`;
        
        // Store ambulance data
        activeAmbulances[deviceId] = {
            latitude,
            longitude,
            batteryLevel,
            speed: speedValue,
            deviceType: "ESP32",
            lastUpdate: Date.now()
        };
        
        console.log(`ESP32 device ${id} updated:`, {latitude, longitude, batteryLevel, speed: speedValue});
        
        // Broadcast to all connected clients
        io.emit("receive-location", {
            id: deviceId,
            latitude,
            longitude,
            batteryLevel,
            speed: speedValue,
            deviceType: "ESP32",
            lastUpdate: Date.now()
        });
        
        res.status(200).send("Data received");
    } catch (err) {
        console.error("Error processing ESP32 data:", err);
        res.status(500).send("Server error");
    }
});

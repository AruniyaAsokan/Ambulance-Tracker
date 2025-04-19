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
// Store notifications for each ambulance
const pendingNotifications = {};

// New API endpoint for ESP32 devices to send notifications
app.get("/api/send-notification", function (req, res) {
    const { ambulance_id, message, type } = req.query;
    
    if (!ambulance_id || !message) {
        return res.status(400).send("Missing required parameters");
    }
    
    // Create notification
    const notification = {
        id: Date.now().toString(),
        message,
        type: type || "info",
        timestamp: Date.now()
    };
    
    // Store notification
    if (!pendingNotifications[ambulance_id]) {
        pendingNotifications[ambulance_id] = [];
    }
    pendingNotifications[ambulance_id].push(notification);
    
    // Emit to all connected clients
    io.emit("new-notification", {
        ambulance_id,
        notification
    });
    
    console.log(`New notification for ${ambulance_id}: ${message}`);
    res.status(200).send("Notification sent");
});

// API endpoint for ESP32 to check notifications
app.get("/api/notifications", function (req, res) {
    const { ambulance_id } = req.query;
    
    if (!ambulance_id) {
        return res.status(400).send("Missing ambulance ID");
    }
    
    const notifications = pendingNotifications[ambulance_id] || [];
    
    if (notifications.length > 0) {
        // Return the first pending notification
        res.status(200).send(`NOTIFICATION:${notifications[0].message}`);
    } else {
        res.status(200).send("No notifications");
    }
});

// API endpoint to acknowledge notification receipt
app.get("/api/notifications/acknowledge", function (req, res) {
    const { ambulance_id } = req.query;
    
    if (!ambulance_id || !pendingNotifications[ambulance_id]) {
        return res.status(400).send("Invalid ambulance ID or no notifications");
    }
    
    // Remove the first notification (it was processed)
    pendingNotifications[ambulance_id].shift();
    
    res.status(200).send("Notification acknowledged");
});

// API endpoint to get location data
app.get("/location", function (req, res) {
    const { lat, lon } = req.query;
    
    if (lat && lon) {
        console.log("Location received:", lat, lon);
        // You could store this or process it as needed
    }
    
    res.status(200).send("OK");
});

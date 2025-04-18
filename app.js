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

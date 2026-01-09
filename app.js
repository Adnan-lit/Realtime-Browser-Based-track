const express = require("express");
const app = express();
const http = require("http");
const socketio = require("socket.io");
const path = require("path");

const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// Store all connected users and their locations
const users = new Map(); // Map<socketId, {latitude, longitude, name, lastUpdate}>

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Send all existing users to the newly connected user
  const existingUsers = Array.from(users.entries()).map(([id, data]) => ({
    id,
    ...data,
  }));
  
  if (existingUsers.length > 0) {
    socket.emit("existing-users", existingUsers);
    console.log(`Sent ${existingUsers.length} existing users to ${socket.id}`);
  }

  socket.on("send-location", (data) => {
    const { latitude, longitude, name } = data;
    
    // Store/update user location
    users.set(socket.id, {
      latitude,
      longitude,
      name: name || "Anonymous",
      lastUpdate: Date.now(),
    });

    // Broadcast to all clients (including sender)
    io.emit("receive-location", {
      id: socket.id,
      latitude,
      longitude,
      name: name || "Anonymous",
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    users.delete(socket.id);
    io.emit("user-disconnected", socket.id);
  });
});

app.get("/", (req, res) => {
  res.render("index");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
